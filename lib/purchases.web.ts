import type { ProductOrSubscription, Purchase, PurchaseError } from 'react-native-iap';
import { getServerEntitlement, type ProEntitlement } from '@/lib/entitlementServer';
import { supabase } from '@/lib/supabase';
import { trackBeforeLeaving } from '@/lib/analytics';
import { markCheckoutStarted } from '@/lib/webCheckoutReturn';

// ─────────────────────────────────────────────────────────────────────────────
// Web shim for lib/purchases.ts. Metro resolves `.web.ts` ahead of `.ts` when
// bundling for web, so iOS NEVER loads this file — which is exactly why the
// shim lives here instead of as Platform.OS branches inside purchases.ts: the
// shipping native app cannot regress from code it doesn't resolve.
//
// Why this file has to exist at all: react-native-iap v15 side-effect-imports
// react-native-nitro-modules, whose index re-exports views/getHostComponent,
// which deep-imports 'react-native/Libraries/NativeComponent/NativeComponentRegistry'.
// On web that throws "__fbBatchedBridgeConfig is not set" at import time and
// white-screens the entire app. purchases.ts is reachable from app/_layout.tsx
// via lib/auth.ts, so it loads on EVERY route — nothing here may touch it.
//
// The type-only imports above are erased at compile time (no runtime require),
// so they keep the signatures identical to the native module for free.
//
// PURCHASING ON WEB IS STRIPE. Until this shipped, the browser could show the
// paywall but not sell anything, so every web visitor who wanted Pro was told
// to go find an iPhone — and most simply left.
//
// Stripe lives HERE, in the file iOS never resolves, which is the whole point:
// the shipping iOS binary contains no Stripe code and no reference to outside
// purchasing, so App Store guideline 3.1.1 stays exactly as out-of-scope as it
// was when this file did nothing. Do not move any of this into purchases.ts.
//
// Stripe never grants Pro from the client. Checkout only redirects; the
// stripe-webhook edge function writes the entitlement row, and is_pro() — which
// every Pro gate and the scan-quota trigger depend on — still needs no changes.
// ─────────────────────────────────────────────────────────────────────────────

// Kept in sync with lib/purchases.ts so any UI reading a product id still works.
export const PRODUCT_IDS = {
  monthly: 'semora_pro_monthly',
  annual: 'semora_pro_annual',
};

export { getServerEntitlement };
export type { ProEntitlement };

/** No StoreKit on web — nothing to connect to. */
export async function initIAP(): Promise<void> {}

/** No StoreKit on web — nothing to tear down (called from signOut). */
export async function endIAP(): Promise<void> {}

/**
 * null makes every caller fall back to its hardcoded display price, which is
 * what the native module already does on web (`getProducts` there returns null
 * for Platform.OS === 'web'), so the paywall renders identically.
 */
export async function getProducts(): Promise<{
  monthly: ProductOrSubscription | null;
  annual: ProductOrSubscription | null;
} | null> {
  return null;
}

/**
 * Send the browser to Stripe Checkout.
 *
 * Returns false in the sense every caller already understands — "Pro was not
 * granted in this call" — because on success the tab NAVIGATES AWAY and the
 * entitlement arrives later via the webhook. The paywall picks the result back
 * up from the ?checkout= parameter on the return trip.
 */
export async function purchaseProduct(productId: string): Promise<boolean> {
  const plan = productId === PRODUCT_IDS.annual ? 'annual' : 'monthly';
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Please sign in before subscribing.');

  const { data, error } = await supabase.functions.invoke('stripe-checkout', {
    body: { plan },
  });

  if (error) {
    // supabase-js buries the response body on non-2xx; dig out the real message
    // so "you already have Pro" doesn't surface as "Edge Function returned a
    // non-2xx status code".
    const ctx = (error as { context?: Response }).context;
    let payload: { error?: string; code?: string } | null = null;
    try { payload = ctx ? await ctx.json() : null; } catch { /* body already read */ }
    const e = new Error(payload?.error ?? 'Could not start checkout. Please try again.');
    (e as Error & { code?: string }).code = payload?.code;
    throw e;
  }

  const url = (data as { url?: string })?.url;
  if (!url) throw new Error('Could not start checkout. Please try again.');

  // BEFORE the navigation, not after.
  //
  // Both call sites used to track this once purchaseProduct() returned — which
  // is after the line below has already sent the tab to Stripe, so the insert
  // was cancelled with the page every single time. purchase_checkout_started
  // has zero rows in production as a result, and every real web sale looked
  // like an abandoned one.
  //
  // Awaited, with keepalive, so the request is handed to the browser before the
  // document starts unloading. It cannot fail the purchase: trackBeforeLeaving
  // swallows everything.
  await trackBeforeLeaving('purchase_checkout_started', { plan, screen: 'stripe_redirect' });

  // A payment is about to happen off-site, and the tab that comes back is a
  // cold boot that may be redirected by the auth gate before any screen reads
  // the URL. Leave a note where a redirect cannot reach — see
  // lib/webCheckoutReturn.ts.
  markCheckoutStarted(plan);

  window.location.assign(url);
  return false;
}

export type SubscriptionManagementResult = {
  opened: boolean;
  purchase: Purchase | null;
};

/**
 * Open Stripe's billing portal — the web counterpart of Apple's management
 * sheet — where a subscriber can change their card, read invoices or cancel.
 *
 * Returns opened:false when this account has no Stripe customer, which means
 * they subscribed on the iPhone and Apple owns cancellation. Callers show the
 * Apple instructions in that case rather than a dead end.
 */
export async function openSubscriptionManagement(): Promise<SubscriptionManagementResult> {
  try {
    const { data, error } = await supabase.functions.invoke('stripe-portal', { body: {} });
    if (error) return { opened: false, purchase: null };
    const url = (data as { url?: string })?.url;
    if (!url) return { opened: false, purchase: null };
    window.location.assign(url);
    return { opened: true, purchase: null };
  } catch {
    return { opened: false, purchase: null };
  }
}

/** Web can never confirm a trial offer; false is the safe default. */
export async function isEligibleForIntroOffer(_groupId: string): Promise<boolean> {
  return false;
}

/**
 * No device receipt exists in a browser, so the server row IS the answer.
 * Mirrors the native module's own web branch.
 */
export async function validateProEntitlement(_opts?: {
  interactiveRefresh?: boolean;
  forceRefresh?: boolean;
  jws?: string;
}): Promise<ProEntitlement> {
  return await getServerEntitlement();
}

export async function refreshProStatus(): Promise<ProEntitlement> {
  return await getServerEntitlement();
}

/**
 * "Restore" on web is a server re-read: a user who subscribed on their iPhone
 * should see Pro in the browser. There is no receipt to re-validate, so this
 * cannot activate a subscription that the server doesn't already know about.
 */
export async function restorePurchases(): Promise<ProEntitlement> {
  return await getServerEntitlement();
}

export async function validateAfterPurchase(
  _purchase?: Purchase,
  _opts?: { interactive?: boolean },
): Promise<ProEntitlement> {
  return await getServerEntitlement();
}

/** No-op analytics hook — no purchase can originate in the browser. */
export function setPurchaseAnalyticsContext(
  _ctx: { context: string; trial: boolean } | null,
): void {}

/**
 * No StoreKit event stream on web. Returns the same unsubscribe contract the
 * native module does so callers can register/clean up unconditionally.
 */
export function setupPurchaseListeners(
  _onPurchase: (purchase: Purchase) => Promise<boolean>,
  _onError: (error: PurchaseError) => void,
): () => void {
  return () => {};
}
