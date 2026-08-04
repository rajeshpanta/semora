import type { ProductOrSubscription, Purchase, PurchaseError } from 'react-native-iap';
import { getServerEntitlement, type ProEntitlement } from '@/lib/entitlementServer';

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
// There is deliberately NO purchasing on web. Pro is read-only in the browser:
// entitlement comes from the server row that the iOS StoreKit flow wrote. That
// keeps App Store guideline 3.1.1 out of scope entirely and means is_pro() —
// which every Pro gate and the scan-quota trigger depend on — needs no changes.
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

/** Purchasing is iOS-only. Callers treat false as "did not purchase". */
export async function purchaseProduct(_productId: string): Promise<boolean> {
  return false;
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
