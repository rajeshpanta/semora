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

// Product IDs — must match App Store Connect
export const PRODUCT_IDS = {
  monthly: 'syllabussnap_pro_monthly',
  annual: 'syllabussnap_pro_annual',
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

export async function checkProStatus(): Promise<boolean> {
  if (Platform.OS === 'web' || !connected) return false;
  try {
    const purchases = await getAvailablePurchases();
    return purchases.some(
      (p) => p.productId === PRODUCT_IDS.monthly || p.productId === PRODUCT_IDS.annual,
    );
  } catch {
    return false;
  }
}

export async function restorePurchases(): Promise<boolean> {
  return checkProStatus();
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
