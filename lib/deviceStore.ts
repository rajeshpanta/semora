import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Small device-local key/value store that actually works on web.
 *
 * expo-secure-store ships a web build whose native module is literally
 * `export default {}` — so every SecureStore call on web either throws or
 * silently does nothing, and anything wrapped in the customary `try {} catch {}`
 * just disappears. That is fine for a keychain (browsers have no equivalent)
 * but it silently broke two signed-out flows once app.semoraai.com went live:
 * a share token or referral code parked before sign-in was never written, so
 * AuthGate had nothing to resume and the user landed on an empty Today tab.
 *
 * localStorage is the right web counterpart here. None of these values are
 * secrets — they are short-lived intents (a share token, a referral code) that
 * the server re-validates on use. Anything genuinely sensitive must keep using
 * SecureStore directly and stay native-only.
 *
 * lib/collaboration.ts already hand-rolled this exact branch; it is left as-is
 * rather than churned, but new call sites should use this.
 */

const isWeb = Platform.OS === 'web';

export function getDeviceItem(key: string): string | null {
  try {
    if (isWeb) {
      // Private-mode Safari throws on access, not just on write.
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    }
    return SecureStore.getItem(key);
  } catch {
    return null;
  }
}

export function setDeviceItem(key: string, value: string) {
  try {
    if (isWeb) {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
      return;
    }
    SecureStore.setItem(key, value);
  } catch {
    // Storage unavailable (private browsing, quota, no keychain). Callers treat
    // this as "the intent was not parked" — a soft failure, never a throw into
    // a deep-link handler.
  }
}

export function deleteDeviceItem(key: string) {
  try {
    if (isWeb) {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
      return;
    }
    void SecureStore.deleteItemAsync(key).catch(() => {});
  } catch {
    // Same as above.
  }
}
