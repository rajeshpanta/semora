import * as Notifications from 'expo-notifications';
import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/appStore';
import { QueryClient } from '@tanstack/react-query';
import { endIAP } from '@/lib/purchases';
import { clearLocalSyncState } from '@/lib/calendarSync';

/**
 * Web Client ID from Google Cloud Console (Authentication → Credentials).
 * This is the Web OAuth client, NOT the iOS one — Supabase verifies
 * Google id-tokens against this client ID. The iOS client is what
 * GoogleSignin uses natively to talk to Apple/Google.
 *
 * Set this via app.json's `extra` block or hard-code; we use process.env
 * here to keep secrets out of the repo (set in `.env.local`).
 */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? '';

let googleConfigured = false;
function configureGoogleOnce() {
  if (googleConfigured) return;
  if (!GOOGLE_WEB_CLIENT_ID) {
    console.warn('[auth] EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID not set — Google sign-in will fail.');
  }
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
  });
  googleConfigured = true;
}

let _queryClient: QueryClient | null = null;

/** Call once from _layout.tsx so signOut can clear the cache */
export function setQueryClient(qc: QueryClient) {
  _queryClient = qc;
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Sign in with Apple (iOS).
 *
 * Native Apple sheet → returns identityToken (JWT) → handed to Supabase
 * which verifies it against Apple's public keys and creates/finds the
 * auth.users row. No email confirmation step needed — Apple already
 * verified email ownership.
 *
 * Throws if the user cancels the prompt; callers should catch and
 * silently ignore E_CANCELED.
 */
export async function signInWithApple() {
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is iOS-only.');
  }

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error('Apple sign-in returned no identity token.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  // Apple returns fullName *only* on the very first sign-in for a given
  // Apple ID + app pair. After that, credential.fullName is null forever.
  // Capture it now so Hide-My-Email users don't show as a hex hash in
  // settings/profile screens.
  const given = credential.fullName?.givenName?.trim() ?? '';
  const family = credential.fullName?.familyName?.trim() ?? '';
  const fullName = [given, family].filter(Boolean).join(' ');
  if (fullName) {
    await supabase.auth.updateUser({ data: { full_name: fullName } }).catch(() => {});
  }
}

/**
 * Sign in with Google.
 *
 * Native Google sheet → returns idToken → handed to Supabase which
 * verifies it against Google's public keys (using the Web Client ID
 * registered in the Supabase dashboard) and creates/finds the user.
 *
 * Throws if the user cancels; callers should catch and silently
 * ignore SIGN_IN_CANCELLED.
 */
export async function signInWithGoogle() {
  configureGoogleOnce();

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const result = await GoogleSignin.signIn();
  // The new google-signin lib v13+ returns { type, data } where type is
  // 'success' or 'cancelled'. Older shape (v11–) returned the user info
  // directly. Support both for resilience.
  const userInfo: any = (result as any)?.data ?? result;
  const idToken: string | undefined = userInfo?.idToken;

  if (!idToken) {
    throw new Error('Google sign-in returned no id token.');
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
}

/**
 * True iff this device can offer Sign in with Apple. iOS only, and
 * even on iOS this returns false on simulators without an Apple ID
 * configured.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  } finally {
    // Always clear local state, even if the API call fails —
    // a stuck session is worse than a stale sign-out.
    //
    // Be thorough: anything that's user-scoped on this device must
    // go, otherwise the next person to sign in here inherits it.
    useAppStore.getState().resetUserState();
    _queryClient?.clear();

    // Cancel pending notifications so user A's reminders don't fire
    // for user B (which would also leak A's task titles via banners).
    if (Platform.OS !== 'web') {
      Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    }

    // Drop calendar-sync references — without this, B's app would
    // push events into A's "Semora" calendar.
    clearLocalSyncState().catch(() => {});

    endIAP().catch(() => {});

    // Drop the Google account binding so the next sign-in shows the
    // account picker instead of silently re-using the same account.
    // No-op if Google sign-in was never used or wasn't configured.
    if (Platform.OS !== 'web') {
      GoogleSignin.signOut().catch(() => {});
    }
  }
}
