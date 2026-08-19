import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno';

/**
 * Stripe plumbing shared by the checkout, portal and webhook functions.
 *
 * WHY STRIPE EXISTS AT ALL: purchasing used to be iOS-only, so every visitor
 * on app.semoraai.com hit a paywall that could only tell them to go find an
 * iPhone. Stripe is the web-side biller. It writes the SAME `entitlements` row
 * StoreKit does, so `is_pro()` stays the one source of truth and no Pro gate,
 * RLS policy or quota trigger changes.
 *
 * Stripe is never referenced from the iOS bundle (see lib/purchases.web.ts),
 * which is what keeps App Store guideline 3.1.1 out of scope.
 */

export const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
export const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
export const STRIPE_PRICE_MONTHLY = Deno.env.get('STRIPE_PRICE_MONTHLY') ?? '';
export const STRIPE_PRICE_ANNUAL = Deno.env.get('STRIPE_PRICE_ANNUAL') ?? '';

/** Where Checkout and the billing portal send the browser back to. */
export const WEB_APP_URL = Deno.env.get('WEB_APP_URL') ?? 'https://app.semoraai.com';

export function isStripeConfigured(): boolean {
  return Boolean(STRIPE_SECRET_KEY && STRIPE_PRICE_MONTHLY && STRIPE_PRICE_ANNUAL);
}

/**
 * The Deno runtime has no Node crypto, so Stripe's SDK needs its fetch-based
 * HTTP client and the SubtleCrypto provider for webhook signature checks.
 */
export function stripeClient(): Stripe {
  return new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: '2025-01-27.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export const cryptoProvider = Stripe.createSubtleCryptoProvider();

/** Map a Stripe price id back to the plan names the app already speaks. */
export function planForPrice(priceId: string | null | undefined): 'monthly' | 'annual' | null {
  if (!priceId) return null;
  if (priceId === STRIPE_PRICE_ANNUAL) return 'annual';
  if (priceId === STRIPE_PRICE_MONTHLY) return 'monthly';
  return null;
}

export { Stripe };
