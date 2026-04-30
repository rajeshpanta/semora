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

    if (error || !data) {
      // Network or server hiccup — fall back to whatever the DB row says
      return await getServerEntitlement();
    }

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
 * Restore: same as a fresh validation. Returns true if the user
 * ended up with an active Pro entitlement.
 */
export async function restorePurchases(): Promise<boolean> {
  const entitlement = await validateProEntitlement();
  return entitlement.is_pro;
}

export function setupPurchaseListeners(
  onPurchase: (purchase: Purchase) => void,
  onError: (error: PurchaseError) => void,
): () => void {
  const updateSub: EventSubscription = purchaseUpdatedListener(async (p: Purchase) => {
    await finishTransaction({ purchase: p }).catch(() => {});
    onPurchase(p);
  });
  const errorSub: EventSubscription = purchaseErrorListener(onError);
  return () => {
    updateSub.remove();
    errorSub.remove();
  };
}
