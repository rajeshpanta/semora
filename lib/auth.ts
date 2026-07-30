import * as AppleAuthentication from 'expo-apple-authentication';
import { GoogleSignin } from '@/lib/googleSignin';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/appStore';
import { QueryClient } from '@tanstack/react-query';
import { endIAP } from '@/lib/purchases';
import { clearLocalSyncState } from '@/lib/calendarSync';
import { cancelAllRemindersOnSignOut } from '@/lib/notifications';
import { unregisterPushToken } from '@/lib/push';
import { clearPersistedQueryCache } from '@/lib/queryPersistence';
import { clearOfflineUserState } from '@/lib/offlineSync';
import { removeLmsCredentials } from '@/lib/lmsCredentialStore';

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

// NOTE: there is deliberately no signUp() here. Account creation is
// OAuth-only (Apple / Google) by policy; email/password is a sign-in
// path for existing accounts only.

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
  if (Platform.OS === 'web') {
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/`
        : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo },
    });
    if (error) throw error;
    return;
  }

  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is unavailable on this device.');
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
  if (Platform.OS === 'web') {
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/`
        : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });
    if (error) throw error;
    return;
  }

  configureGoogleOnce();

  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  const result = await GoogleSignin.signIn();
  // v13+ RESOLVES user-cancel as { type: 'cancelled', data: null } instead
  // of rejecting. Without this check the cancel fell through to the
  // missing-idToken throw below — a plain Error with no `code` — so every
  // caller's SIGN_IN_CANCELLED filter missed it and the user saw a
  // "sign-in failed" error for simply dismissing the sheet.
  if ((result as any)?.type === 'cancelled') {
    const cancelErr: any = new Error('Google sign-in was cancelled.');
    cancelErr.code = 'SIGN_IN_CANCELLED';
    throw cancelErr;
  }
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

const GOOGLE_CLASSROOM_SCOPES = [
  'https://www.googleapis.com/auth/classroom.courses.readonly',
  'https://www.googleapis.com/auth/classroom.coursework.me.readonly',
  'https://www.googleapis.com/auth/classroom.student-submissions.me.readonly',
];

/**
 * Requests read-only Google Classroom access without changing the active
 * Supabase account. The short-lived access token is stored in device
 * SecureStore by the LMS layer and is never persisted in the database.
 */
export async function getGoogleClassroomAccessToken(): Promise<{
  accessToken: string;
  accountLabel: string | null;
}> {
  if (Platform.OS === 'web') {
    throw new Error('Google Classroom connection is currently available in the iPhone app.');
  }
  configureGoogleOnce();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  let current = GoogleSignin.getCurrentUser();
  if (!current) {
    const result: any = await GoogleSignin.signIn();
    if (result?.type === 'cancelled') {
      const error: any = new Error('Google connection was cancelled.');
      error.code = 'SIGN_IN_CANCELLED';
      throw error;
    }
    current = result?.data ?? result;
  }

  const scoped: any = await GoogleSignin.addScopes({ scopes: GOOGLE_CLASSROOM_SCOPES });
  if (scoped?.type === 'cancelled') {
    const error: any = new Error('Google Classroom permission was cancelled.');
    error.code = 'SIGN_IN_CANCELLED';
    throw error;
  }
  const tokens = await GoogleSignin.getTokens();
  if (!tokens.accessToken) throw new Error('Google did not return a Classroom access token.');
  const account: any = scoped?.data ?? current;
  return {
    accessToken: tokens.accessToken,
    accountLabel: account?.user?.email ?? null,
  };
}

/**
 * Refreshes an already-authorized Classroom token without opening account or
 * consent UI. This keeps foreground sync working after Google's short-lived
 * access token expires, while refusing to silently switch a connection to a
 * different Google account.
 */
export async function refreshGoogleClassroomAccessToken(
  expectedAccountLabel?: string | null,
): Promise<{ accessToken: string; accountLabel: string | null }> {
  if (Platform.OS === 'web') {
    throw new Error('Google Classroom connection is currently available in the iPhone app.');
  }
  configureGoogleOnce();
  const current: any = GoogleSignin.getCurrentUser();
  const currentEmail = current?.user?.email ?? null;
  if (!current) throw new Error('Reconnect Google Classroom on this device.');
  if (
    expectedAccountLabel &&
    currentEmail &&
    expectedAccountLabel.toLowerCase() !== currentEmail.toLowerCase()
  ) {
    throw new Error(`Reconnect the Google Classroom account ${expectedAccountLabel}.`);
  }
  const tokens = await GoogleSignin.getTokens();
  if (!tokens.accessToken) throw new Error('Reconnect Google Classroom on this device.');
  return { accessToken: tokens.accessToken, accountLabel: currentEmail };
}

/**
 * True iff this device can offer Sign in with Apple. Browsers use Supabase's
 * Apple OAuth flow; iOS uses the native authentication sheet.
 */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signOut() {
  let signingOutUserId: string | null = null;
  try {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      signingOutUserId = session?.user.id ?? null;
      if (session?.user) {
        const { data: connections } = await supabase
          .from('lms_connections')
          .select('id')
          .eq('user_id', session.user.id);
        await removeLmsCredentials((connections ?? []).map((row) => row.id));
      }
    } catch {
      // Best-effort local credential cleanup; sign-out must still proceed.
    }

    // Drop THIS device's server push token BEFORE clearing the session. The
    // delete is RLS-scoped to auth.uid(), which supabase.auth.signOut() below
    // invalidates — so it must run while the JWT is still valid, else it hits
    // as an anon request, matches zero rows, and the departed user keeps
    // getting re-engagement pushes. getSession is a local read (no round-trip).
    if (Platform.OS !== 'web') {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await unregisterPushToken(session.user.id);
        }
      } catch {
        // Best-effort — never block sign-out on token cleanup.
      }
    }

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
    clearPersistedQueryCache().catch(() => {});
    clearOfflineUserState(signingOutUserId).catch(() => {});

    // Cancel pending notifications so user A's reminders don't fire
    // for user B (which would also leak A's task titles via banners).
    // Use the helper (not the raw cancel) so it also invalidates any
    // in-flight reschedule racing this sign-out.
    cancelAllRemindersOnSignOut();

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
