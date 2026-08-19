import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withRequestLogging, errorFields } from '../_shared/log.ts';
import {
  isStripeConfigured,
  stripeClient,
  STRIPE_PRICE_ANNUAL,
  STRIPE_PRICE_MONTHLY,
  WEB_APP_URL,
} from '../_shared/stripe.ts';

// Creates a Stripe Checkout Session for the signed-in user and hands back its
// URL. The browser redirects there; Stripe collects the card; the webhook (not
// this function) is what actually grants Pro. Nothing here writes entitlements
// — a user who reaches Checkout and abandons it must leave no trace that looks
// like a subscription.

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

serve(withRequestLogging('stripe-checkout', async (req, log) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  if (!isStripeConfigured()) {
    // A missing key is our deployment mistake, not something a student can act
    // on — loud in logs, generic to the user.
    log.error('stripe_not_configured', {});
    return jsonResponse(
      { error: 'Card payments are not available right now. Please try again later.', code: 'NOT_CONFIGURED' },
      503,
    );
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
    const userId = userData.user.id;
    const email = userData.user.email ?? undefined;

    const body = await req.json().catch(() => ({}));
    const plan = body?.plan === 'annual' ? 'annual' : 'monthly';
    const priceId = plan === 'annual' ? STRIPE_PRICE_ANNUAL : STRIPE_PRICE_MONTHLY;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Already Pro? Don't sell a second subscription. Someone who bought on
    // iPhone and then hits the web paywall should be told they already have
    // it, not charged twice for the same account.
    const { data: ent } = await admin
      .from('entitlements')
      .select('is_pro, expires_at, platform')
      .eq('user_id', userId)
      .maybeSingle();
    const activeAlready =
      ent?.is_pro === true && (!ent.expires_at || new Date(ent.expires_at) > new Date());
    if (activeAlready) {
      return jsonResponse(
        {
          error: 'This account already has Semora Pro.',
          code: 'ALREADY_PRO',
          platform: ent?.platform ?? null,
        },
        409,
      );
    }

    const stripe = stripeClient();

    // Reuse the customer across checkouts so a returning subscriber keeps one
    // billing history and one portal, rather than accumulating duplicates.
    const { data: mapped } = await admin
      .from('stripe_customers')
      .select('customer_id')
      .eq('user_id', userId)
      .maybeSingle();

    let customerId = mapped?.customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        // Stamped on the CUSTOMER as well as the subscription below: it makes
        // every future Stripe object traceable back to a Semora account, which
        // is what lets the webhook resolve a user without a database lookup.
        metadata: { supabase_user_id: userId },
      });
      customerId = customer.id;
      const { error: mapErr } = await admin
        .from('stripe_customers')
        .upsert({ user_id: userId, customer_id: customerId }, { onConflict: 'user_id' });
      if (mapErr) log.warn('customer_map_failed', errorFields(mapErr));
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      // No trial on web, by product decision: iOS runs the 7-day monthly trial,
      // web charges immediately.
      subscription_data: {
        metadata: { supabase_user_id: userId },
      },
      client_reference_id: userId,
      allow_promotion_codes: true,
      success_url: `${WEB_APP_URL}/paywall?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${WEB_APP_URL}/paywall?checkout=cancelled`,
    });

    log.info('checkout_created', { user_id: userId, plan });
    return jsonResponse({ url: session.url, sessionId: session.id });
  } catch (err) {
    log.error('checkout_failed', errorFields(err));
    return jsonResponse({ error: 'Could not start checkout. Please try again.' }, 500);
  }
}));
