import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withRequestLogging, errorFields } from '../_shared/log.ts';
import {
  STRIPE_WEBHOOK_SECRET,
  cryptoProvider,
  isStripeConfigured,
  planForPrice,
  stripeClient,
  type Stripe,
} from '../_shared/stripe.ts';

// The ONLY thing that grants or removes web-billed Pro.
//
// Checkout does not grant anything — a Checkout Session can be abandoned, and a
// card can fail after the redirect. Stripe telling us the subscription is real
// is the event that matters, so entitlements are written here and nowhere else
// on the web side.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** Subscription states that should leave the user with Pro switched on. */
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

serve(withRequestLogging('stripe-webhook', async (req, log) => {
  // No CORS: Stripe calls this server-to-server. A browser has no business here.
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  if (!isStripeConfigured() || !STRIPE_WEBHOOK_SECRET) {
    log.error('stripe_not_configured', {});
    return new Response('Not configured', { status: 503 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing signature', { status: 400 });

  // Raw body, not parsed JSON: the signature covers the exact bytes.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = stripeClient();
    // Async variant + SubtleCrypto because Deno has no Node crypto.
    event = await stripe.webhooks.constructEventAsync(
      raw,
      signature,
      STRIPE_WEBHOOK_SECRET,
      undefined,
      cryptoProvider,
    );
  } catch (err) {
    // An unverifiable payload is either a misconfiguration or someone probing
    // for a way to mint free subscriptions. Never process it.
    log.warn('signature_verification_failed', errorFields(err));
    return new Response('Invalid signature', { status: 400 });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // IDEMPOTENCY. Stripe retries until it gets a 2xx and can deliver the same
  // event twice unprompted. Claim the id first; a duplicate insert means we
  // already handled it, so acknowledge and stop.
  const { error: claimErr } = await admin
    .from('stripe_events')
    .insert({ id: event.id, type: event.type });
  if (claimErr) {
    log.info('duplicate_event_ignored', { event_id: event.id, type: event.type });
    return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await applySubscription(admin, sub, log);
        break;
      }

      // A renewal that fails leaves the subscription 'past_due' and Stripe
      // sends a subscription.updated too, so the entitlement is handled there.
      // Logged here only so a billing problem is visible before access lapses.
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        log.warn('invoice_payment_failed', {
          customer: String(inv.customer ?? ''),
          subscription: String((inv as any).subscription ?? ''),
        });
        break;
      }

      default:
        log.info('event_ignored', { type: event.type });
    }
  } catch (err) {
    // 500 makes Stripe retry. Release the idempotency claim first, or the
    // retry would be swallowed as a duplicate and the user would never get
    // the Pro they paid for.
    await admin.from('stripe_events').delete().eq('id', event.id);
    log.error('event_handler_failed', { type: event.type, ...errorFields(err) });
    return new Response('Handler error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
}));

/** Resolve the Semora user behind a subscription, metadata first. */
async function resolveUserId(
  admin: any,
  sub: Stripe.Subscription,
  log: any,
): Promise<string | null> {
  const fromMeta = sub.metadata?.supabase_user_id;
  if (fromMeta) return fromMeta;

  // Fallback for subscriptions created outside our checkout (a manual one in
  // the Stripe dashboard, say), which carry no metadata.
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const { data } = await admin
    .from('stripe_customers')
    .select('user_id')
    .eq('customer_id', customerId)
    .maybeSingle();
  if (!data) log.warn('unresolved_subscription', { customer: customerId, sub: sub.id });
  return data?.user_id ?? null;
}

async function applySubscription(admin: any, event: Stripe.Subscription, log: any): Promise<void> {
  // Ask Stripe what is true NOW, rather than trusting the event payload.
  //
  // Stripe emits customer.subscription.created and .updated for a new
  // subscription in the same millisecond, and delivery order is explicitly not
  // guaranteed. Both land here concurrently, each carrying the status frozen at
  // the moment ITS event was generated, and the upsert below has no idea which
  // is newer — so whichever finishes last wins.
  //
  // On 2026-08-20 that cost a real customer their subscription. She paid at
  // 19:16:55; the two writes landed 8ms apart:
  //
  //   19:16:55.367  status=active      is_pro=true    <- correct
  //   19:16:55.375  status=incomplete  is_pro=false   <- stale, overwrote it
  //
  // Stripe considered her subscription active the whole time — stripe-checkout
  // proved it by refusing her four retries with checkout_blocked_existing_
  // subscription, status "active". She was left paying, locked out, and unable
  // to buy again, because a payload from 8ms earlier was written 8ms later.
  //
  // Re-fetching removes the ordering problem entirely instead of trying to
  // referee it: whichever event arrives, and in whatever order, both write the
  // same current truth. A retry delivered ten minutes late writes today's
  // status, not the one from when it was generated. The cost is one API call
  // per subscription webhook, on a path that runs a handful of times a day.
  let sub = event;
  try {
    sub = (await stripeClient().subscriptions.retrieve(event.id)) as Stripe.Subscription;
    if (sub.status !== event.status) {
      log.info('subscription_status_refreshed', {
        sub: event.id, event_status: event.status, live_status: sub.status,
      });
    }
  } catch (err) {
    // Fall back to the payload. Stale is better than dropping the write and
    // leaving someone who just paid with nothing at all.
    log.warn('subscription_refetch_failed', { sub: event.id, ...errorFields(err) });
  }

  const userId = await resolveUserId(admin, sub, log);
  if (!userId) return;

  const active = ACTIVE_STATUSES.has(sub.status);
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const plan = planForPrice(priceId);

  // Paid-through date, in seconds.
  //
  // Read the ITEM, not the subscription. Stripe moved current_period_end onto
  // subscription items; on the current API version the top-level field is
  // simply absent, so the obvious `sub.current_period_end` yields undefined and
  // expires_at lands as NULL. That matters because is_pro() treats a NULL
  // expiry as "never expires" — a lapsed subscriber would have kept Pro
  // indefinitely if any later webhook were ever missed. Caught by testing
  // against a real subscription; the top-level read is kept as a fallback for
  // older API versions.
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  const periodEnd =
    item?.current_period_end ?? ((sub as any).current_period_end as number | undefined);
  const expiresAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

  // One Stripe subscription = one Semora account, enforced by the unique index
  // on stripe_subscription_id (migration 074).
  //
  // This deliberately does NOT reuse original_transaction_id. That column is
  // the only place the database links a user to their Apple original
  // transaction — consumed_transactions stores the OTI with no user_id — so
  // overwriting it would strand an Apple subscriber who later re-subscribes,
  // with no way for them or support to recover. See migration 074.
  const { data: bound } = await admin
    .from('entitlements')
    .select('user_id')
    .eq('stripe_subscription_id', sub.id)
    .maybeSingle();
  if (bound && bound.user_id !== userId) {
    log.error('subscription_bound_elsewhere', { sub: sub.id, user_id: userId });
    return;
  }

  // Never downgrade a row that Apple owns. If someone subscribed on iOS and
  // separately on the web, the Apple row stands and the Stripe cancellation
  // must not switch off access they are still paying Apple for.
  const { data: current } = await admin
    .from('entitlements')
    .select('platform, is_pro, expires_at, stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();
  const appleActive =
    current?.platform === 'ios' &&
    current?.is_pro === true &&
    (!current.expires_at || new Date(current.expires_at) > new Date()) &&
    current.stripe_subscription_id !== sub.id;
  if (appleActive) {
    log.warn('skipped_write_apple_billed', { user_id: userId, sub: sub.id });
    return;
  }

  const row: Record<string, unknown> = {
    user_id: userId,
    is_pro: active,
    plan: active ? plan : null,
    expires_at: active ? expiresAt : null,
    platform: 'web',
    stripe_subscription_id: sub.id,
    product_id: priceId,
    last_validated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin.from('entitlements').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;

  log.info('entitlement_written', {
    user_id: userId,
    status: sub.status,
    is_pro: active,
    plan,
  });
}
