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

/**
 * Price ids we used to sell at, comma-separated, and must keep recognising
 * forever.
 *
 * WHY THIS EXISTS. Raising a price on Stripe does not edit a price — it
 * creates a NEW price object, and existing subscriptions stay on the old one
 * by design. That is exactly how a grandfathered subscriber keeps their rate.
 * But planForPrice() used to compare against only the two CURRENT ids, so the
 * moment those env vars were repointed at the new prices, a grandfathered
 * subscriber's next renewal arrived carrying an id that matched neither and
 * resolved to null.
 *
 * The damage was not loss of access — is_pro() reads the boolean and the
 * expiry and never looks at `plan`. It was worse in a quieter way: the
 * entitlement row got `plan: null`, which makes `hasPaidPlan` false in
 * Settings (app/settings/index.tsx), so a paying customer would be shown the
 * upgrade rows, quoting the price they had just been promised they would not
 * pay. On an annual subscription that surfaces up to a year after the change.
 *
 * So: when you raise prices, append the OLD ids here in the same deploy that
 * repoints the two above. This is a list, not a single value, because this
 * will not be the last price change.
 */
export const STRIPE_PRICE_MONTHLY_LEGACY = Deno.env.get('STRIPE_PRICE_MONTHLY_LEGACY') ?? '';
export const STRIPE_PRICE_ANNUAL_LEGACY = Deno.env.get('STRIPE_PRICE_ANNUAL_LEGACY') ?? '';

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

/** Split a comma-separated env var into ids, dropping blanks and whitespace. */
export function priceIdList(value: string): string[] {
  return value
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * The pure half of planForPrice, so it can be tested without reaching into
 * Deno.env — the exported constants above are read once at module load, which
 * a test cannot change after import.
 */
export function resolvePlan(
  priceId: string | null | undefined,
  monthlyIds: string[],
  annualIds: string[],
): 'monthly' | 'annual' | null {
  if (!priceId) return null;
  if (annualIds.includes(priceId)) return 'annual';
  if (monthlyIds.includes(priceId)) return 'monthly';
  return null;
}

/**
 * Map a Stripe price id back to the plan names the app already speaks.
 *
 * Current prices AND every price we have ever sold at — see the legacy vars
 * above for why dropping the old ones silently mistreats the subscribers we
 * promised to leave alone.
 */
export function planForPrice(priceId: string | null | undefined): 'monthly' | 'annual' | null {
  return resolvePlan(
    priceId,
    [STRIPE_PRICE_MONTHLY, ...priceIdList(STRIPE_PRICE_MONTHLY_LEGACY)],
    [STRIPE_PRICE_ANNUAL, ...priceIdList(STRIPE_PRICE_ANNUAL_LEGACY)],
  );
}

export { Stripe };
