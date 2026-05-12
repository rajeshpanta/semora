import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  getAvailablePurchases,
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

export async function initIAP(): Promise<void> {
  if (Platform.OS === 'web' || connected) return;
  try {
    await initConnection();
    connected = true;
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
  if (Platform.OS === 'web' || !connected) return null;
  try {
    const products = await fetchProducts({ skus: ALL_SKUS });
    if (!products) return null;
    return {
      monthly: products.find((p) => p.id === PRODUCT_IDS.monthly) ?? null,
      annual: products.find((p) => p.id === PRODUCT_IDS.annual) ?? null,
    };
  } catch {
    return null;
  }
}

export async function purchaseProduct(productId: string): Promise<boolean> {
  if (Platform.OS === 'web' || !connected) return false;
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
    if (e.code === 'E_USER_CANCELLED') return false;
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

    if (error || !data) return EMPTY_ENTITLEMENT;

    // Honor expiry on the client too — if the row says active but
    // the date is past, treat as inactive until the server re-validates.
    const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : null;
    const stillActive = data.is_pro && (expiresAt === null || expiresAt > Date.now());

    return {
      is_pro: stillActive,
      plan: (data.plan as 'monthly' | 'annual' | null) ?? null,
      expires_at: data.expires_at,
    };
  } catch {
    return EMPTY_ENTITLEMENT;
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
export async function validateProEntitlement(): Promise<ProEntitlement> {
  if (Platform.OS === 'web' || !connected) return EMPTY_ENTITLEMENT;

  try {
    const purchases = await getAvailablePurchases();
    // iOS receipts are device-wide — any purchase carries the full app receipt.
    const purchaseWithReceipt = purchases.find(
      (p) => typeof (p as any).transactionReceipt === 'string' && (p as any).transactionReceipt.length > 0,
    ) as (Purchase & { transactionReceipt?: string }) | undefined;

    const receipt = purchaseWithReceipt?.transactionReceipt;

    // No local receipt means nothing to validate. Don't blow away an
    // existing server entitlement — just return what the server says.
    if (!receipt) {
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
      // Network or other server hiccup — just return whatever the DB says.
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
 */
export async function refreshProStatus(): Promise<ProEntitlement> {
  // Local receipt validation is the authoritative path when
  // the device has one — it both refreshes the row and tells us
  // the latest expiry. Without one, fall back to a plain DB read.
  if (Platform.OS !== 'web' && connected) {
    return await validateProEntitlement();
  }
  return await getServerEntitlement();
}

/**
 * Restore: same as a fresh validation. Returns the validated
 * entitlement so callers can update both isPro and the plan label.
 */
export async function restorePurchases(): Promise<ProEntitlement> {
  return await validateProEntitlement();
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
