import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withRequestLogging, errorFields } from '../_shared/log.ts';
import { isStripeConfigured, stripeClient, WEB_APP_URL } from '../_shared/stripe.ts';

// Opens Stripe's own billing portal so a web subscriber can update their card,
// see invoices, or cancel — without Semora ever handling card data or building
// a cancellation flow. Apple's equivalent is the in-app management sheet, which
// is why this exists only for platform='web' rows.
//
// Cancelling from here is safe: it emits customer.subscription.updated /
// .deleted, and stripe-webhook is what actually flips the entitlement.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(withRequestLogging('stripe-portal', async (req, log) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!isStripeConfigured()) {
    log.error('stripe_not_configured', {});
    return jsonResponse({ error: 'Billing management is unavailable right now.', code: 'NOT_CONFIGURED' }, 503);
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: mapped } = await admin
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', userData.user.id)
      .maybeSingle();

    if (!mapped?.customer_id) {
      // No Stripe customer means this account never bought on the web — most
      // likely they subscribed on the iPhone, where Apple owns cancellation.
      return jsonResponse(
        { error: 'No web subscription found for this account.', code: 'NO_WEB_SUBSCRIPTION' },
        404,
      );
    }

    const stripe = stripeClient();
    const body = await req.json().catch(() => ({}));

    // ── action: 'cancel' — used by account deletion ────────────────────────
    //
    // Deleting a Semora account used to leave the Stripe subscription running.
    // The auth row cascades away, taking the entitlement and the customer
    // mapping with it, so nothing on our side remembers the subscription even
    // exists — while Stripe keeps charging the card every month, forever, for
    // an account that cannot be signed into. The user's only remedy would be
    // their bank. Cancel immediately: they asked for everything to be gone.
    if (body?.action === 'cancel') {
      const subs = await stripe.subscriptions.list({
        customer: mapped.customer_id,
        status: 'all',
        limit: 100,
      });
      const live = subs.data.filter(
        (sub: { id: string; status: string }) =>
          sub.status !== 'canceled' && sub.status !== 'incomplete_expired',
      );
      for (const sub of live) {
        // Immediate, not at period end: the account is about to stop existing,
        // so there is nobody left to keep serving until the period runs out.
        await stripe.subscriptions.cancel(sub.id).catch((err: unknown) => {
          log.error('cancel_failed', { sub: sub.id, ...errorFields(err) });
          throw err;
        });
      }
      log.info('subscriptions_cancelled', { user_id: userData.user.id, count: live.length });
      return jsonResponse({ ok: true, cancelled: live.length });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: mapped.customer_id,
      return_url: `${WEB_APP_URL}/settings`,
    });

    log.info('portal_created', { user_id: userData.user.id });
    return jsonResponse({ url: session.url });
  } catch (err) {
    log.error('portal_failed', errorFields(err));
    return jsonResponse({ error: 'Could not open billing management. Please try again.' }, 500);
  }
}));
