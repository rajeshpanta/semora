import { Platform } from 'react-native';
import Purchases, {
  type CustomerInfo,
  type PurchasesPackage,
  LOG_LEVEL,
} from 'react-native-purchases';

const API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
const ENTITLEMENT_ID = 'pro';

let configured = false;
let listenerRegistered = false;

export async function configure(userId?: string): Promise<void> {
  if (Platform.OS === 'web' || configured || !API_KEY) return;

  Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  Purchases.configure({ apiKey: API_KEY, appUserID: userId });
  configured = true;
}

export async function checkProStatus(): Promise<boolean> {
  if (Platform.OS === 'web' || !configured) return false;
  try {
    const info = await Purchases.getCustomerInfo();
    return !!info.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

export async function getOfferings(): Promise<{
  annual: PurchasesPackage | null;
  monthly: PurchasesPackage | null;
} | null> {
  if (Platform.OS === 'web' || !configured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings.current;
    if (!current) return null;

    return {
      annual: current.annual ?? null,
      monthly: current.monthly ?? null,
    };
  } catch {
    return null;
  }
}

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<{ success: boolean; customerInfo?: CustomerInfo }> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPro = !!customerInfo.entitlements.active[ENTITLEMENT_ID];
    return { success: isPro, customerInfo };
  } catch (e: any) {
    if (e.userCancelled) {
      return { success: false };
    }
    throw e;
  }
}

export async function restorePurchases(): Promise<boolean> {
  if (Platform.OS === 'web' || !configured) return false;
  try {
    const info = await Purchases.restorePurchases();
    return !!info.entitlements.active[ENTITLEMENT_ID];
  } catch {
    return false;
  }
}

export function addCustomerInfoListener(
  callback: (info: CustomerInfo) => void,
): void {
  if (Platform.OS === 'web' || !configured || listenerRegistered) return;
  listenerRegistered = true;
  Purchases.addCustomerInfoUpdateListener(callback);
}
