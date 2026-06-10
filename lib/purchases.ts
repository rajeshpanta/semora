import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  getReceiptDataIOS,
  requestReceiptRefreshIOS,
  purchaseUpdatedListener,
  purchaseErrorListener,
  finishTransaction,
  type ProductOrSubscription,
  type Purchase,
  type PurchaseError,
  type EventSubscription,
} from 'react-native-iap';
import { supabase } from '@/lib/supabase';

// Product IDs — must match App Store Connect
export const PRODUCT_IDS = {
  monthly: 'semora_pro_monthly',
  annual: 'semora_pro_annual',
};

const ALL_SKUS = [PRODUCT_IDS.monthly, PRODUCT_IDS.annual];

let connected = false;
// The native layer resolves a SKU's purchase TYPE from a cache that only
// fetchProducts populates. Requesting a subscription before a successful
// fetch makes iOS treat it as an in-app product and fail (silently, via
// the error listener). Track fetch success so purchaseProduct can warm
// the cache first.
let productsFetched = false;

export async function initIAP(): Promise<void> {
  if (Platform.OS === 'web' || connected) return;
  try {
    // Native NEVER throws here — failures (Screen Time purchase
    // restrictions, store unavailable) resolve `false`. Treating that as
    // connected used to brick IAP for the whole session.
    const ok = await initConnection();
    connected = ok === true;
  } catch {
    // StoreKit not available (simulator without config, etc.)
  }
}

export async function endIAP(): Promise<void> {
  if (!connected) return;
  try {
    await endConnection();
  } catch {}
  connected = false;
}

export async function getProducts(): Promise<{
  monthly: ProductOrSubscription | null;
  annual: ProductOrSubscription | null;
} | null> {
  if (Platform.OS === 'web') return null;
  // Launch-time init can fail; retry here so price displays (paywall,
  // Me tab) aren't permanently stuck on fallbacks for the session.
  if (!connected) {
    await initIAP();
    if (!connected) return null;
  }
  try {
    // type defaults to 'in-app' in react-native-iap v15 — our SKUs are
    // subscriptions, so omitting it returns [] and the paywall silently
    // falls back to hardcoded prices (wrong for other storefronts).
    const products = await fetchProducts({ skus: ALL_SKUS, type: 'subs' });
    if (!products) return null;
    productsFetched = products.length > 0;
    return {
      monthly: products.find((p) => p.id === PRODUCT_IDS.monthly) ?? null,
      annual: products.find((p) => p.id === PRODUCT_IDS.annual) ?? null,
    };
  } catch {
    return null;
  }
}

export async function purchaseProduct(productId: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  // A failed launch-time init used to make this a silent no-op forever.
  // Retry the connection here; if the store is genuinely unreachable,
  // throw so the paywall surfaces a real message instead of nothing.
  if (!connected) {
    await initIAP();
    if (!connected) {
      throw new Error('Cannot reach the App Store right now. Please try again in a moment.');
    }
  }
  // Warm the native product cache so the SKU is known as a SUBSCRIPTION
  // before we request it (see productsFetched note above). Without this,
  // a paywall opened before products loaded bought nothing, silently.
  if (!productsFetched) {
    await getProducts();
    if (!productsFetched) {
      throw new Error('Could not load subscription details from the App Store. Please try again in a moment.');
    }
  }
  try {
    await requestPurchase({
      type: 'subs',
      request: {
        apple: { sku: productId },
        google: { skus: [productId] },
      },
    });
    return true;
  } catch (e: any) {
    // v15 (Nitro) reports cancellation as ErrorCode.UserCancelled
    // ('user-cancelled'); keep the legacy code for safety.
    if (e?.code === 'user-cancelled' || e?.code === 'E_USER_CANCELLED') return false;
    throw e;
  }
}

export interface ProEntitlement {
  is_pro: boolean;
  plan: 'monthly' | 'annual' | null;
  expires_at: string | null;
  /**
   * Reason a restore/validation didn't activate Pro for this account,
   * even though the device receipt is valid. Set by validateProEntitlement
   * when the edge function returns 409 (subscription bound to another
   * Semora account, or to a deleted account). Callers that surface UI
   * (e.g. the Restore button) should check this and show a specific
   * message instead of a generic "no subscription found".
   */
  restoreError?: 'linked_other_account' | null;
  /**
   * True when this result reflects a TRANSIENT failure (network down,
   * server 5xx) rather than a real "not subscribed" answer. Callers that
   * persist Pro state must skip the write when this is set — otherwise a
   * blip would visibly downgrade a paying user until the next refresh.
   */
  transient?: boolean;
}

const EMPTY_ENTITLEMENT: ProEntitlement = {
  is_pro: false,
  plan: null,
  expires_at: null,
};

/**
 * Read the server-validated entitlement for the current user.
 * This is the single source of truth — `isPro` should always
 * reflect what's in this row, never what local StoreKit reports.
 *
 * Returns an inactive entitlement if no row exists or the user
 * isn't signed in. Never throws.
 */
export async function getServerEntitlement(): Promise<ProEntitlement> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return EMPTY_ENTITLEMENT;

    const { data, error } = await supabase
      .from('entitlements')
      .select('is_pro, plan, expires_at')
      .eq('user_id', session.user.id)
      .maybeSingle();

    // Query error = we don't KNOW the answer — mark transient so callers
    // don't write a false downgrade. A missing row is a genuine "not pro".
    if (error) return { ...EMPTY_ENTITLEMENT, transient: true };
    if (!data) return EMPTY_ENTITLEMENT;

    // Honor expiry on the client too — if the row says active but the
    // date is past, treat as inactive for DISPLAY. Mark it transient:
    // the row may simply be stale (Apple auto-renewed but nothing has
    // re-validated since), and the client clock isn't authoritative —
    // writing a hard downgrade here visibly de-Pro'd paying subscribers
    // mid-session at every billing boundary. The heavy path (full
    // receipt re-validation) is the only one allowed to say "expired".
    const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;
    const clockSaysExpired = data.is_pro && expiresAt !== null && expiresAt <= Date.now();

    return {
      is_pro: data.is_pro && !clockSaysExpired,
      plan: (data.plan as 'monthly' | 'annual' | null) ?? null,
      expires_at: data.expires_at,
      ...(clockSaysExpired ? { transient: true } : {}),
    };
  } catch {
    return { ...EMPTY_ENTITLEMENT, transient: true };
  }
}

/**
 * Pull the latest StoreKit receipt for this device and POST it to
 * the validate-receipt edge function. The edge function verifies it
 * with Apple and writes an entitlement row tied to the current
 * Semora user_id (NOT the Apple ID).
 *
 * Returns the validated entitlement (or inactive on any failure).
 * Never throws.
 */
export async function validateProEntitlement(opts?: {
  /**
   * Allow requestReceiptRefreshIOS (= AppStore.sync()), which can show a
   * SYSTEM Apple-ID sign-in prompt. Only user-initiated flows (a purchase
   * just completed, an explicit Restore tap) may do this — running it on
   * the silent launch refresh prompted every receipt-less TestFlight/App
   * Review install for credentials on every cold start.
   */
  interactiveRefresh?: boolean;
  /**
   * Refresh the receipt even when one exists. StoreKit2 purchases don't
   * reliably update the legacy receipt file, so right after a purchase
   * the on-disk receipt can be STALE (no transactions) — validating it
   * returns not-pro forever. Used by validateAfterPurchase's retry.
   */
  forceRefresh?: boolean;
} ): Promise<ProEntitlement> {
  if (Platform.OS === 'web') return EMPTY_ENTITLEMENT;
  // Launch-time init can fail (store outage, parental restrictions). A bare
  // "not pro" here would visibly downgrade a real subscriber on Restore —
  // retry the connection, and if StoreKit is still unreachable answer from
  // the server row, marking a negative answer transient (we don't KNOW).
  if (!connected) {
    await initIAP();
    if (!connected) {
      const fallback = await getServerEntitlement();
      return fallback.is_pro ? fallback : { ...fallback, transient: true };
    }
  }

  try {
    // react-native-iap v15 (Nitro) removed Purchase.transactionReceipt.
    // getReceiptDataIOS() returns the device-wide base64 app receipt —
    // exactly the format the validate-receipt edge function POSTs to
    // Apple's verifyReceipt.
    let receipt: string | null = null;
    if (!opts?.forceRefresh) {
      try {
        receipt = (await getReceiptDataIOS()) ?? null;
      } catch {
        receipt = null;
      }
    }
    // TestFlight/sandbox quirk: the app receipt often doesn't exist (or
    // is stale) until explicitly refreshed — fresh installs validated
    // "no subscription" right after a successful purchase, leaving the
    // transaction pending forever ("duplicate purchase" on retry).
    // GATED on interactiveRefresh: AppStore.sync() can pop a system
    // Apple-ID prompt, unacceptable on silent launch refreshes.
    if (!receipt && (opts?.interactiveRefresh || opts?.forceRefresh)) {
      try {
        receipt = (await requestReceiptRefreshIOS()) ?? null;
      } catch {
        receipt = null;
      }
      if (!receipt) {
        try { receipt = (await getReceiptDataIOS()) ?? null; } catch {}
      }
    }

    // No local receipt means nothing to validate. Don't blow away an
    // existing server entitlement — just return what the server says.
    if (!receipt || receipt.length === 0) {
      return await getServerEntitlement();
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return EMPTY_ENTITLEMENT;

    const { data, error } = await supabase.functions.invoke('validate-receipt', {
      body: { receipt, platform: Platform.OS },
    });

    if (error) {
      // 409 means the receipt is bound to a *different* Semora account
      // (or one that's been deleted). The user can't unlock Pro on this
      // account no matter how many times they tap Restore — surface the
      // reason so the UI can explain instead of saying "no subscription
      // found", which is misleading.
      const status = (error as any)?.context?.status;
      const fallback = await getServerEntitlement();
      if (status === 409) {
        return { ...fallback, restoreError: 'linked_other_account' };
      }
      // Any other server failure (429 rate-limit, 5xx, misconfig, bad
      // gateway) means we DON'T KNOW — if the DB has no positive row,
      // mark the negative transient so the UI says "try again" instead
      // of "No Subscription Found" / silently de-Pro-ing a payer.
      if (!fallback.is_pro) {
        return { ...fallback, transient: true };
      }
      return fallback;
    }

    if (!data) return await getServerEntitlement();

    return {
      is_pro: !!data.is_pro,
      plan: (data.plan as 'monthly' | 'annual' | null) ?? null,
      expires_at: data.expires_at ?? null,
    };
  } catch {
    return await getServerEntitlement();
  }
}

/**
 * Used on app launch / sign-in / paywall close.
 * Reads the server entitlement first (cheap, single row), then —
 * if there's a local receipt — also kicks off a server validation
 * so the entitlement stays in sync with new purchases / expirations.
 * NEVER interactive: a launch-time AppStore.sync() would prompt for
 * Apple-ID credentials on receipt-less installs.
 */
export async function refreshProStatus(): Promise<ProEntitlement> {
  if (Platform.OS !== 'web' && connected) {
    return await validateProEntitlement({ interactiveRefresh: false });
  }
  return await getServerEntitlement();
}

/**
 * Restore: same as a fresh validation, but user-initiated — allowed to
 * refresh the receipt (may show Apple's own sign-in sheet, which is the
 * expected Restore UX).
 */
export async function restorePurchases(): Promise<ProEntitlement> {
  return await validateAfterPurchase();
}

/**
 * Validation for flows where a purchase DEFINITELY exists (a purchase
 * event just fired, or the user tapped Restore claiming one). If the
 * first pass says "no subscription" with no other explanation, the
 * on-disk receipt must be stale (StoreKit2 purchases don't reliably
 * update the legacy receipt) — force one refresh and re-validate
 * instead of looping "Verification Pending" forever.
 */
export async function validateAfterPurchase(): Promise<ProEntitlement> {
  let e = await validateProEntitlement({ interactiveRefresh: true });
  if (!e.is_pro && !e.restoreError && !e.transient) {
    e = await validateProEntitlement({ interactiveRefresh: true, forceRefresh: true });
  }
  return e;
}

export function setupPurchaseListeners(
  // Return `true` once the purchase has been server-validated and the
  // user is safely Pro; the listener will then finalize the StoreKit
  // transaction. Return `false` to leave the transaction unfinished,
  // in which case StoreKit will redeliver it via this same listener
  // (or via the launch-time refreshProStatus flow) on the next attempt.
  // Finalizing before validation is unsafe: a crash between
  // finishTransaction and the entitlement write would leave the user
  // charged but with no entitlement row, since iOS would drop the
  // unfinished receipt on its next purge.
  onPurchase: (purchase: Purchase) => Promise<boolean>,
  onError: (error: PurchaseError) => void,
): () => void {
  const updateSub: EventSubscription = purchaseUpdatedListener(async (p: Purchase) => {
    const validated = await onPurchase(p).catch(() => false);
    if (validated) {
      await finishTransaction({ purchase: p }).catch(() => {});
    }
  });
  const errorSub: EventSubscription = purchaseErrorListener(onError);
  return () => {
    updateSub.remove();
    errorSub.remove();
  };
}
