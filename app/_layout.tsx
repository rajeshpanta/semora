import { Alert } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
  Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces';
import { DefaultTheme,
  DarkTheme,
  ThemeProvider } from '@react-navigation/native';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useFonts } from 'expo-font';
import { Stack,
  useRouter,
  useSegments,
  router as globalRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { createContext,
  useContext,
  useEffect,
  useState } from 'react';
import { ActivityIndicator,
  AppState,
  Platform,
  View,
} from 'react-native';
import 'react-native-reanimated';

import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import * as Localization from 'expo-localization';
import { useAppStore } from '@/store/appStore';
import { ThemeColorsProvider, useResolvedScheme, useColors } from '@/lib/theme';
import { setQueryClient } from '@/lib/auth';
import { initIAP, refreshProStatus, endIAP, getServerEntitlement, validateAfterPurchase, setupPurchaseListeners } from '@/lib/purchases';
import {
  COMPLETE_TASK_ACTION, SNOOZE_TASK_ACTION, cancelAllRemindersOnSignOut,
  cancelTaskReminders, registerTaskNotificationActions, rescheduleAllTaskReminders,
  snoozeNotification, startWebDueSoonReminders,
} from '@/lib/notifications';
import { registerForPushNotificationsAsync } from '@/lib/push';
import { track } from '@/lib/analytics';
import { clearLocalSyncState } from '@/lib/calendarSync';
import { applyPendingReferral, hasActivePromoGrant } from '@/lib/referral';
import { readPendingShareToken } from '@/lib/shareCourse';
import { TaskCompletionFlowProvider } from '@/components/TaskCompletionFlow';
import { TaskCompletionCelebration } from '@/components/TaskCompletionCelebration';
import { showTaskCelebration } from '@/lib/taskCelebration';
import { queryPersister, clearPersistedQueryCache } from '@/lib/queryPersistence';
import { isNetworkFailure, clearOfflineUserState } from '@/lib/offlineSync';
import { OfflineSyncBridge } from '@/components/OfflineSyncBridge';
import {
  readPendingCollaborationToken,
  savePendingCollaborationToken,
} from '@/lib/collaboration';
import { LmsSyncBridge } from '@/components/LmsSyncBridge';
import { CollaborationSyncBridge } from '@/components/CollaborationSyncBridge';
import { RealtimeSyncBridge } from '@/components/RealtimeSyncBridge';
import { removeLmsCredentials } from '@/lib/lmsCredentialStore';
import { WebAppFrame } from '@/components/WebAppFrame';
import { WebAlertHost } from '@/components/WebAlertHost';
import { getAppLocale, useI18n } from '@/lib/i18n';
import { setDefaultOptions } from 'date-fns';
import { enUS, es } from 'date-fns/locale';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const OFFLINE_CACHE_MS = 1000 * 60 * 60 * 24 * 7; // 7 days — matches the persister's maxAge

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      // The persister below keeps 7 days of data, but only queries still in the
      // cache get written to it, and React Query's default gcTime is 5 MINUTES.
      // So the 7-day offline promise was empty: anything not opened in the last
      // five minutes had been evicted and came back blank with no network.
      gcTime: OFFLINE_CACHE_MS,
    },
    mutations: {
      // Default ('online') PAUSES a mutation with no connection: the save button
      // spins with no explanation, and the paused mutation is dropped if the app
      // is closed. 'always' lets it run and fail, so callers that queue offline
      // (see enqueueOfflineMutation) get their chance, and callers that cannot
      // surface an honest error instead of hanging forever.
      networkMode: 'always',
      // ...but "TypeError: Network request failed" is not an honest error, it is
      // a stack trace shown to a student. Anything that reaches here genuinely
      // could not be saved offline, so say that in words they can act on.
      onError: (error: unknown) => {
        if (error instanceof Error && isNetworkFailure(error)) {
          error.message = "You're offline. This one needs a connection — it'll work once you're back online.";
        }
      },
    },
  },
});
setQueryClient(queryClient);

// --- Auth context ---
const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
}>({ session: null, loading: true });

export function useSession() {
  return useContext(AuthContext);
}

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Re-sync local reminders whenever the app is foregrounded. Students stay
  // signed in across devices, and reminders are LOCAL notifications — only the
  // device that ran scheduleTaskReminders has them. So a task created on one
  // device wouldn't ring on another already-running device. On foreground we
  // reschedule all incomplete tasks (throttled) so every signed-in device
  // picks up whatever was added/edited elsewhere. Permission-gated +
  // concurrency-guarded internally; no-op on web.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let lastSyncAt = 0;
    const THROTTLE_MS = 2 * 60 * 1000; // at most once every 2 minutes
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      const now = Date.now();
      if (now - lastSyncAt < THROTTLE_MS) return;
      lastSyncAt = now;
      supabase.auth
        .getSession()
        .then(({ data: { session } }) => {
          if (session) rescheduleAllTaskReminders(session.user.id);
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    // Tracks the currently-signed-in user id so SIGNED_OUT (where Supabase
    // delivers session=null) can still delete THIS device's push token row
    // for the user who just left. Updated whenever a session is present.
    let lastSignedInUserId: string | null = null;
    let lastLmsConnectionIds: string[] = [];
    const rememberLmsConnections = (userId: string) => {
      (async () => {
        const { data } = await supabase
          .from('lms_connections')
          .select('id')
          .eq('user_id', userId);
        if (lastSignedInUserId === userId) {
          lastLmsConnectionIds = (data ?? []).map((row) => row.id);
        }
      })()
        .catch(() => {
          if (lastSignedInUserId === userId) {
            lastLmsConnectionIds = [];
          }
        });
    };

    // refreshProStatus can take seconds (Apple roundtrip). If the user
    // signs out / switches accounts mid-flight, the resolved entitlement
    // belongs to the *previous* user — writing it to the store would
    // grant or revoke Pro on the wrong session. Capture the expected
    // userId at call time and re-check the live session before writing.
    const writeEntitlementIfStillCurrent = async (
      expectedUserId: string,
      entitlement: { is_pro: boolean; plan: 'monthly' | 'annual' | null; transient?: boolean },
    ) => {
      // Transient = network/server hiccup, not a real answer. Writing it
      // would downgrade a paying user's Pro state until the next refresh.
      if (entitlement.transient) return;
      // A referral promo grant makes a user Pro with NO entitlements row and no
      // subscription — getServerEntitlement/refreshProStatus read only the
      // entitlements table and therefore return is_pro:false for them. The
      // server-side is_pro() already ORs promo_grants; mirror that here so a
      // launch/refresh never strips a referred user's free month. Only check
      // when the entitlement itself says not-Pro (a real subscription wins).
      let isPro = entitlement.is_pro;
      if (!isPro) {
        try { if (await hasActivePromoGrant()) isPro = true; } catch {}
      }
      const { data: { session: current } } = await supabase.auth.getSession();
      if (current?.user.id !== expectedUserId) return;
      const store = useAppStore.getState();
      const wasPro = store.isPro;
      store.setIsPro(isPro);
      store.setSubscriptionPlan(entitlement.plan);
      // Reschedule whenever Pro status CHANGES — scheduleTaskReminders reads isPro
      // at schedule time, so existing tasks' reminders go stale on a change:
      //   • false→true (upgrade / reinstall re-establishing entitlement / a
      //     background purchase): add the 1-/3-day advance reminders.
      //   • true→false (subscription lapsed or downgraded): STRIP the advance
      //     reminders, forcing the user back to same-day only — otherwise someone
      //     could buy one month, front-load a whole semester of tasks, cancel, and
      //     keep the Pro advance reminders for free.
      // The transient (network/renewal-blip) guard above returns before this, so a
      // paying user is never falsely stripped mid-renewal. Permission-gated +
      // concurrency-guarded internally; isPro is already written above, so the
      // reschedule reads the new status.
      if (wasPro !== isPro) {
        rescheduleAllTaskReminders(expectedUserId);
      }
    };

    // Heavy path: opens StoreKit, fetches the device receipt, and POSTs
    // to validate-receipt (Apple verifyReceipt round-trip). Only run on
    // events where the answer might genuinely have changed: first
    // session resolved at launch, or a fresh sign-in.
    const refreshProForSession = (expectedUserId: string, rescheduleAfter = false) => {
      initIAP()
        .then(() => refreshProStatus())
        .then((e) => writeEntitlementIfStillCurrent(expectedUserId, e))
        // After a fresh sign-in, local reminders were cleared by the prior
        // SIGNED_OUT (or never existed on a new device / reinstall). Reschedule
        // them HERE — after the entitlement is written — so a Pro user gets
        // their 1-/3-day advance reminders, not just same-day. (The reschedule
        // is guarded against concurrent runs and won't prompt for permission.)
        .then(() => { if (rescheduleAfter) rescheduleAllTaskReminders(expectedUserId); })
        .catch(() => {});
    };

    // Light path: cheap single-row read on the entitlements table.
    // Used for TOKEN_REFRESHED / USER_UPDATED — a token rotation
    // can't change Pro status, so there's no reason to re-validate
    // with Apple every ~50 minutes. EXCEPT: if the row looks expired
    // by the client clock (transient flag), the row is probably just
    // stale post-renewal — escalate to a full (non-interactive)
    // receipt re-validation instead of writing a downgrade.
    const lightRefreshProForSession = (expectedUserId: string) => {
      getServerEntitlement()
        .then((e) => {
          if (e.transient) {
            refreshProForSession(expectedUserId);
            return;
          }
          return writeEntitlementIfStillCurrent(expectedUserId, e);
        })
        .catch(() => {});
    };

    // Global StoreKit listener — attached for the lifetime of the app
    // so OS-queued purchase events (Ask to Buy approvals, retried
    // billing, etc.) are validated even when the paywall isn't open.
    // The paywall keeps its own listener for in-flight UX (loading
    // state, success haptics, auto-close); both end up calling
    // validate-receipt, but the edge function is idempotent on
    // original_transaction_id, so the dup is a no-op.
    const removePurchaseListeners = setupPurchaseListeners(
      async (p) => {
        const { data: { session: startSession } } = await supabase.auth.getSession();
        const expectedUserId = startSession?.user.id;
        // No signed-in user — leave the StoreKit transaction pending so
        // it gets re-delivered after sign-in instead of being lost.
        if (!expectedUserId) return false;
        // Background redelivery (cold-start pending transactions): never
        // allowed to trigger an Apple-ID prompt.
        const entitlement = await validateAfterPurchase(p, { interactive: false });
        await writeEntitlementIfStillCurrent(expectedUserId, entitlement);
        // Newly Pro via a background-delivered purchase (Ask to Buy, redelivery):
        // reschedule so existing tasks get the 1-/3-day advance reminders.
        if (entitlement.is_pro) rescheduleAllTaskReminders(expectedUserId);
        // Ack the StoreKit transaction once it has reached a terminal
        // state: either Pro is granted, or the receipt is bound to a
        // different Semora account (no retry on this device will help).
        // Transient failures (network, 5xx) leave the transaction
        // pending so StoreKit redelivers it on the next launch.
        return entitlement.is_pro || entitlement.restoreError === 'linked_other_account';
      },
      // Background listener: no UI here (alerts at random moments would be
      // jarring) — the paywall's own listener surfaces user-facing errors.
      (err: any) => { console.warn('[IAP] purchase error:', err?.code, err?.message); },
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      track('app_opened', { screen: 'launch', signed_in: !!session });

      // Detect and save timezone on first sign-in.
      // NOTE: notification permission is deliberately NOT requested here.
      // An un-primed OS dialog at launch (empty app, zero deadlines)
      // converts at ~40-50%; the review screen primes it after the first
      // import instead ("Want reminders before these N deadlines?").
      if (session) {
        lastSignedInUserId = session.user.id;
        rememberLmsConnections(session.user.id);
        syncProfileSettings(session).then(() => registerForPushNotificationsAsync()).catch(() => {});
        // Reschedule on every cold launch (rescheduleAfter=true) so a device
        // that stays signed in picks up tasks created on OTHER devices since it
        // was last open — local reminders only live on devices that scheduled
        // them. (The foreground listener above covers mid-session changes.)
        refreshProForSession(session.user.id, true);
        // Register this device for server-side re-engagement push (no-op unless
        // notification permission is already granted; never prompts). Fire-and-
        // forget — push infra must never gate launch.
      }
    }).catch(() => {
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);

      // Supabase fires PASSWORD_RECOVERY when a recovery code has just
      // been exchanged for a session. Setting the flag here means it
      // applies in the *same* React batch as setSession, so AuthGate
      // sees (session=valid && inPasswordReset=true) on its next render
      // — no chance of a flash through (tabs).
      if (_event === 'PASSWORD_RECOVERY') {
        useAppStore.getState().setInPasswordReset(true);
      }

      // SIGNED_OUT fires on token-refresh failure, cross-device sign-out,
      // server-side revocation, and account deletion — paths that bypass
      // lib/auth.ts:signOut(). Mirror its store + cache cleanup here so
      // user A's data never lingers for user B's next session.
      if (_event === 'SIGNED_OUT') {
        useAppStore.getState().resetUserState();
        queryClient.clear();
        clearPersistedQueryCache().catch(() => {});
        clearOfflineUserState(lastSignedInUserId).catch(() => {});
        removeLmsCredentials(lastLmsConnectionIds).catch(() => {});
        // Match lib/auth.ts:signOut()'s device teardown — these paths bypass
        // it, so without this user A's scheduled reminders keep firing and
        // their tasks stay synced in the device calendar under user B.
        if (Platform.OS !== 'web') {
          // Helper (not the raw cancel) so it also invalidates any in-flight
          // reschedule racing this sign-out — otherwise the loop could
          // re-create user A's reminders for user B after the cancel.
          cancelAllRemindersOnSignOut();
          clearLocalSyncState().catch(() => {});
          // NOTE: the server push-token delete is NOT attempted here. By the
          // time SIGNED_OUT fires the JWT is already gone, so an RLS-scoped
          // delete would run anon and match zero rows. Deliberate sign-outs
          // drop the token in lib/auth.ts:signOut() while still authed.
          // Involuntary paths (token-refresh failure, server revocation) leave
          // the row until the next sign-in on this device, whose upsert rebinds
          // the same token to the new user — so it never pushes to a stranger.
        }
        lastSignedInUserId = null;
        lastLmsConnectionIds = [];
      }

      if (session) {
        lastSignedInUserId = session.user.id;
        rememberLmsConnections(session.user.id);
        syncProfileSettings(session).catch(() => {});

        if (_event === 'SIGNED_IN') {
          // Account switch / fresh sign-in — full revalidation (and reschedule
          // local reminders, which SIGNED_OUT cleared / a new device lacks),
          // plus wipe cached queries so tabs render the new user's data.
          refreshProForSession(session.user.id, true);
          queryClient.removeQueries();
          track('signed_in', { screen: 'auth' });
          // Bind this device's push token to the freshly signed-in user for
          // server-side re-engagement. No-op unless permission is already
          // granted (never prompts); fire-and-forget.
          syncProfileSettings(session).then(() => registerForPushNotificationsAsync()).catch(() => {});

          // Persist the onboarding name to the account, but ONLY when the
          // account has no real name of its own (email users, Apple
          // Hide-My-Email) — never overwrite a proper Apple/Google name.
          // Makes the typed name survive reinstalls and show on Me/profile.
          const onboardName = useAppStore.getState().userName?.trim();
          if (onboardName) {
            const meta = session.user.user_metadata ?? {};
            const hasRealName = [meta.full_name, meta.name, meta.given_name]
              .some((v) => typeof v === 'string' && v.trim().length > 0);
            if (!hasRealName) {
              supabase.auth.updateUser({ data: { full_name: onboardName } }).catch(() => {});
            }
          }
        } else if (_event === 'TOKEN_REFRESHED' || _event === 'USER_UPDATED') {
          // Cheap server-only read — token rotations don't change Pro.
          lightRefreshProForSession(session.user.id);
        }
        // INITIAL_SESSION is handled by the getSession() block above;
        // PASSWORD_RECOVERY pins the user to the reset screen and
        // doesn't need entitlement work.
      }
    });

    // Deep-link handling for Supabase auth flows.
    //   semora://auth/reset?code=...    — password reset link
    //   semora://auth/callback?code=... — email confirmation (and any future
    //                                     magic-link / email-change emails),
    //                                     since site_url = semora://auth/callback
    const handleDeepLink = async (url: string) => {
      const parsed = Linking.parse(url);
      const path = (parsed.path ?? '').replace(/^\//, '');
      const code = typeof parsed.queryParams?.code === 'string' ? parsed.queryParams.code : null;
      // Browser OAuth returns to `/callback`. Older deployed links used the
      // site root, so keep that narrow legacy path working as well.
      const isWebOAuthCallback = Platform.OS === 'web' && (path === 'callback' || path === '') && !!code;
      const isWebPasswordReset =
        Platform.OS === 'web' && path === 'reset-password' && !!code;

      const isCollaborationLink =
        parsed.hostname === 'collaborate' ||
        (!parsed.hostname && path === 'collaborate');
      if (isCollaborationLink) {
        const token = typeof parsed.queryParams?.token === 'string'
          ? parsed.queryParams.token.trim()
          : '';
        if (!token || token.length > 128) return;
        await savePendingCollaborationToken(token);
        const { data: { session: current } } = await supabase.auth.getSession();
        if (current) {
          globalRouter.push({ pathname: '/collaborate', params: { token } } as any);
        }
        return;
      }

      if (parsed.hostname !== 'auth' && !isWebOAuthCallback && !isWebPasswordReset) return;

      if (path === 'reset' || isWebPasswordReset) {
        // Sanity bound — Supabase auth codes are short (~32 chars).
        // Block obviously-malformed payloads before we hand them to
        // exchangeCodeForSession.
        if (!code || code.length > 512) return;

        // Refuse to exchange if a session is already active. Silently
        // swapping the user's session for a recovery one is the
        // takeover vector flagged in the audit (#8). Forgot-password
        // is for users who CAN'T sign in — anyone signed in should
        // use Settings → Change Password instead.
        const { data: { session: existing } } = await supabase.auth.getSession();
        if (existing) {
          Alert.alert(
            'Already signed in',
            'You\'re currently signed in. To use a password reset link, sign out from Settings first and then tap the link again. To change your password while signed in, go to Settings → Change Password.',
          );
          return;
        }

        // The flag is set inside the auth listener when Supabase fires
        // PASSWORD_RECOVERY (alongside setSession), so it lands in the
        // same React batch as the new session — no flash through (tabs)
        // and no race with AuthGate's self-heal.
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          Alert.alert(
            'Reset link invalid',
            'This password reset link is invalid or has expired. Please request a new one.',
          );
          globalRouter.replace('/(auth)/sign-in');
          return;
        }
        // PKCE flow: exchangeCodeForSession emits SIGNED_IN, NOT
        // PASSWORD_RECOVERY, so the listener never pins the user to the reset
        // screen. Set the flag here so AuthGate keeps them on /reset-password
        // instead of bouncing a valid session straight into (tabs).
        useAppStore.getState().setInPasswordReset(true);
        globalRouter.replace('/(auth)/reset-password');
        return;
      }

      if (path === 'callback' || isWebOAuthCallback) {
        // Same sanity bound as the reset path — Supabase auth codes are
        // ~32 chars; a 10MB `?code=` would otherwise be passed straight
        // to exchangeCodeForSession.
        if (!code || code.length > 512) return;
        // If somebody is already signed in, sign them out before exchanging
        // the code — otherwise this would silently swap their session for
        // whoever owns the email link (potential takeover vector).
        const { data: { session: existing } } = await supabase.auth.getSession();
        if (existing) {
          await supabase.auth.signOut();
        }
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          Alert.alert(
            'Confirmation failed',
            'This confirmation link is invalid or has expired. Please sign in or request a new one.',
          );
          globalRouter.replace('/(auth)/sign-in');
          return;
        }
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        // Success — AuthGate sees the new session and routes to (tabs).
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url).catch((e) => console.warn('[deeplink] init:', e));
    }).catch(() => {});
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url).catch((e) => console.warn('[deeplink]:', e));
    });

    return () => {
      subscription.unsubscribe();
      linkSub.remove();
      removePurchaseListeners();
      endIAP();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Detect device timezone and save to profile if not already set.
 * Runs once per sign-in; skips if the profile already has a timezone.
 */
async function syncProfileSettings(session: Session) {
  try {
    const userId = session.user.id;
    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone, preferred_language, email, display_name')
      .eq('id', userId)
      .maybeSingle();

    const metadataLanguage = session.user.user_metadata?.preferred_language;
    const preferredLanguage = metadataLanguage === 'en' || metadataLanguage === 'es'
      ? metadataLanguage
      : getAppLocale();
    useAppStore.getState().setLanguagePreference(preferredLanguage);

    // Two cases require setting the timezone:
    //   1. Profile exists but timezone is null — normal path on first launch
    //   2. Profile row missing — defensive against a brand-new OAuth user
    //      whose handle_new_user trigger hasn't propagated yet. Upsert
    //      lets us write either way without a follow-up read.
    const updates: {
      id: string; timezone?: string; preferred_language?: 'en' | 'es';
      email?: string; display_name?: string;
    } = { id: userId };
    if (!profile || !profile.timezone) {
      const detectedTz =
        Platform.OS === 'web'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : Localization.getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
      updates.timezone = detectedTz;
    }
    if (!profile || profile.preferred_language !== preferredLanguage) updates.preferred_language = preferredLanguage;

    // Mirror identity into the profile so it survives a reinstall or a second
    // device, and so anything server-side (push copy, a shared Course Space)
    // has a name to use. Neither field is written anywhere else: the trigger
    // only ever stored the email, and the onboarding name lived exclusively in
    // this device's SecureStore, so signing in on a new phone lost it.
    const authEmail = session.user.email?.trim();
    if (authEmail && profile?.email !== authEmail) updates.email = authEmail;

    // Apple supplies a name only on the FIRST authorization, so prefer whatever
    // is already on the auth record, then fall back to the name the student
    // typed during onboarding.
    const metaName = typeof session.user.user_metadata?.full_name === 'string'
      ? session.user.user_metadata.full_name.trim()
      : '';
    const localName = useAppStore.getState().userName?.trim() ?? '';
    const resolvedName = metaName || localName;
    if (resolvedName && profile?.display_name !== resolvedName) {
      updates.display_name = resolvedName;
    }
    if (Object.keys(updates).length > 1) {
      await supabase.from('profiles').upsert(updates, { onConflict: 'id' });
    }
    if (metadataLanguage !== preferredLanguage) {
      await supabase.auth.updateUser({ data: { preferred_language: preferredLanguage } });
    }
    // The greeting reads user_metadata, not the profile, so an onboarding-only
    // name has to be promoted there or "Good morning, <name>" stays generic on
    // every other device.
    if (!metaName && localName) {
      await supabase.auth.updateUser({ data: { full_name: localName } });
    }
  } catch {
    // Non-critical — settings are retried on the next auth/session event.
  }
}

// --- Auth gate (routing) ---
function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const inPasswordReset = useAppStore((s) => s.inPasswordReset);
  const hasOnboarded = useAppStore((s) => s.hasOnboarded);

  useEffect(() => {
    if (loading) return;

    // Browser OAuth returns to `/callback?code=...` and handleDeepLink
    // exchanges that code for a session. Until it does, `session` is still
    // null — redirecting here would rewrite the URL and throw the code away.
    if (
      Platform.OS === 'web' &&
      !session &&
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('code')
    ) {
      return;
    }

    // Recovery flow handling.
    //
    //   inPasswordReset=true + session=valid:
    //     User has an active recovery session but hasn't picked a new
    //     password yet. Pin them to /reset-password — even if the app
    //     was killed and relaunched cold, this re-arms the lock.
    //
    //   inPasswordReset=true + no session:
    //     Stale flag (recovery session expired or got cleared by some
    //     other path). Self-heal so the user isn't stuck.
    if (inPasswordReset) {
      if (!session) {
        useAppStore.getState().setInPasswordReset(false);
        return;
      }
      const onResetScreen = segments[0] === '(auth)' && segments[1] === 'reset-password';
      if (!onResetScreen) {
        router.replace('/(auth)/reset-password');
      }
      return;
    }

    const inAuthGroup = segments[0] === '(auth)';
    const onOnboarding = (segments[0] as string) === 'onboarding';
    const onWelcome = (segments[0] as string) === 'welcome';
    const onEmbeddedGoogleAuth =
      Platform.OS === 'web' &&
      segments[0] === '(auth)' &&
      segments[1] === 'oauth' &&
      typeof window !== 'undefined' &&
      window.parent !== window &&
      new URLSearchParams(window.location.search).get('provider') === 'google' &&
      new URLSearchParams(window.location.search).get('embed') === '1';

    if (!session) {
      if (Platform.OS === 'web') {
        // This domain is the app; semoraai.com is the marketing site. Anyone
        // arriving signed out clicked "Sign in"/"Try it for free" over there,
        // so send them straight to the auth screen — its logo links back to
        // semoraai.com. (app/welcome.tsx was the stand-in marketing page from
        // before that site existed; it now just bounces to it.)
        if (!inAuthGroup && !onWelcome) {
          // A generic signed-out app route is a returning-user path. Keep the
          // intent explicit so an early AuthGate redirect cannot turn a
          // marketing-site "Sign in" visit into the default signup framing.
          // The marketing site's "Try it for free" URL already lands inside
          // the auth group without this parameter and remains signup mode.
          router.replace({
            pathname: '/(auth)/sign-in',
            params: { mode: 'signin' },
          } as any);
        }
      } else if (!hasOnboarded) {
        // First launch on this device: sell the value before the sign-up
        // wall. Once onboarded, fall through to the normal sign-in redirect.
        if (!onOnboarding) router.replace('/onboarding' as any);
      } else if (!inAuthGroup) {
        router.replace('/(auth)/sign-in');
      }
    } else if (session && (inAuthGroup || onOnboarding || onWelcome)) {
      // The marketing site's Google button lives in a same-site iframe. If an
      // app session already exists, OAuthLauncherScreen notifies the parent to
      // enter the app. Redirecting this frame to /(tabs) squeezes the signed-in
      // navigation into the 54px button slot.
      if (onEmbeddedGoogleAuth) return;

      // Freshly authenticated. Two deep-link flows may have parked intent while
      // the user was signed out — resume them now instead of dropping the user
      // on the tabs with nothing happening:
      //   • A stashed invite code -> redeem the free Pro month (fire-and-forget;
      //     the Me tab also calls this, and it's idempotent).
      //   • A stashed share token -> reopen /join to finish importing the
      //     classmate's course (the growth loop). This is the ONLY resume path,
      //     so without it a signed-out friend's import silently dead-ends.
      applyPendingReferral().catch(() => {});
      const pendingCollaboration = readPendingCollaborationToken();
      const pendingShare = readPendingShareToken();
      if (pendingCollaboration) {
        router.replace({
          pathname: '/collaborate',
          params: { token: pendingCollaboration },
        } as any);
      } else if (pendingShare) {
        router.replace({ pathname: '/join', params: { token: pendingShare } } as any);
      } else {
        router.replace('/(tabs)');
      }
    }
  }, [session, loading, segments, inPasswordReset, hasOnboarded]);

  const colors = useColors();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return <>{children}</>;
}

function NotificationActionBridge() {
  const { session } = useSession();
  // Quick-action buttons on task reminders are Pro-only. Re-register whenever
  // Pro status flips so the buttons appear on upgrade and disappear on lapse.
  const isPro = useAppStore((s) => s.isPro);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    registerTaskNotificationActions(isPro).catch(() => {});
  }, [isPro]);

  // Web has no OS-level scheduler to hand future reminders off to, so instead
  // of the native register-actions/response-listener pair below, it gets a
  // foreground poll for anything due imminently while the tab is open.
  useEffect(() => {
    if (Platform.OS !== 'web' || !session) return;
    return startWebDueSoonReminders(session.user.id);
  }, [session]);

  useEffect(() => {
    if (Platform.OS === 'web' || !session) return;
    let active = true;

    const handle = async (response: Notifications.NotificationResponse) => {
      if (!active) return;
      const action = response.actionIdentifier;

      // Server-sent pushes (supabase/cron/*) carry a `type` and no taskId, so
      // they have to be routed BEFORE the taskId guard below — which would
      // otherwise drop them silently, as it has been doing for the weekly
      // digest since that job shipped.
      const pushType = response.notification.request.content.data?.type;
      if (typeof pushType === 'string') {
        if (pushType === 'flashcards_due') globalRouter.push('/flashcards' as any);
        else globalRouter.replace('/(tabs)' as any);
        return;
      }

      const taskId = response.notification.request.content.data?.taskId;
      if (typeof taskId !== 'string') return;

      if (action === SNOOZE_TASK_ACTION) {
        await snoozeNotification(response).catch(() => {});
        return;
      }
      if (action === COMPLETE_TASK_ACTION) {
        const { data: task } = await supabase
          .from('tasks')
          .select('id, title, due_date, due_time, is_completed')
          .eq('id', taskId)
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (!task || task.is_completed) return;
        const due = task.due_time
          ? new Date(`${task.due_date}T${task.due_time}`)
          : new Date(`${task.due_date}T23:59:59`);
        const submittedLate = Number.isFinite(due.getTime()) && new Date() > due;
        const { error } = await supabase
          .from('tasks')
          .update({
            is_completed: true,
            completed_at: new Date().toISOString(),
            submitted_late: submittedLate,
            late_penalty_percent: null,
          })
          .eq('id', taskId)
          .eq('user_id', session.user.id);
        if (error) return;
        await cancelTaskReminders(taskId).catch(() => {});
        useAppStore.getState().incrementTasksCompleted();
        showTaskCelebration(task.title);
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['taskStats'] });
        queryClient.invalidateQueries({ queryKey: ['task'] });
        queryClient.invalidateQueries({ queryKey: ['studyBlocks'] });
        // Also picks up the next occurrence if completing this task caused the
        // recurring-task trigger to create one.
        rescheduleAllTaskReminders(session.user.id);
        return;
      }
      globalRouter.push(`/task/${taskId}` as any);
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    Notifications.getLastNotificationResponseAsync()
      .then(async (response) => {
        if (response) await handle(response);
        await Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, [session?.user.id]);

  return null;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    // Editorial serif display face — used for headlines to lift the whole
    // app from "default iOS" to a more refined, premium feel.
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Fraunces_400Regular_Italic,
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) console.warn('Font loading error:', error);
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeColorsProvider>
      <RootLayoutNav />
    </ThemeColorsProvider>
  );
}

function RootLayoutNav() {
  const scheme = useResolvedScheme();
  const colors = useColors();
  const { locale, t } = useI18n();
  // date-fns reads this default for every screen/helper that does not supply
  // an explicit locale, including relative dates and calendar day names.
  setDefaultOptions({ locale: locale === 'es' ? es : enUS });

  const navTheme = scheme === 'dark'
    ? {
        ...DarkTheme,
        colors: {
          ...DarkTheme.colors,
          primary: colors.brand,
          background: colors.paper,
          card: colors.card,
          text: colors.ink,
          border: colors.line,
        },
      }
    : {
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          primary: colors.brand,
          background: colors.paper,
          card: colors.card,
          text: colors.ink,
          border: colors.line,
        },
      };

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: queryPersister,
        maxAge: 1000 * 60 * 60 * 24 * 7,
        buster: 'semora-cache-v1',
      }}
    >
      <ThemeProvider value={navTheme}>
        <AuthProvider>
          <TaskCompletionFlowProvider>
            <NotificationActionBridge />
            <OfflineSyncRuntime />
            <RealtimeSyncRuntime />
            <LmsSyncRuntime />
            <CollaborationSyncRuntime />
            <AuthGate>
              <NavigationFrame>
              <Stack
              key={locale}
              screenOptions={{
                headerBackTitle: t('Back'),
                headerStyle: { backgroundColor: colors.card },
                headerTintColor: colors.ink,
                contentStyle: { backgroundColor: colors.paper },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="welcome" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="semester/new" options={{ presentation: 'modal', title: t('New Semester') }} />
              <Stack.Screen name="semester/[id]" options={{ title: t('Edit Semester') }} />
              <Stack.Screen name="course/new" options={{ presentation: 'modal', title: t('New Course') }} />
              <Stack.Screen name="course/[id]" options={{ title: t('Course') }} />
              <Stack.Screen name="task/new" options={{ presentation: 'modal', title: t('New Task') }} />
              <Stack.Screen name="task/[id]" options={{ title: t('Task') }} />
              <Stack.Screen name="search" options={{ title: t('Search Tasks') }} />
              <Stack.Screen name="syllabus/paste" options={{ presentation: 'modal', title: t('Paste Syllabus Text') }} />
              <Stack.Screen name="syllabus/upload" options={{ presentation: 'modal', title: t('Upload Syllabus') }} />
              <Stack.Screen name="syllabus/review" options={{ title: t('Review Items') }} />
              <Stack.Screen name="settings/index" options={{ title: t('Settings') }} />
              <Stack.Screen name="settings/password" options={{ title: t('Change Password') }} />
              <Stack.Screen name="settings/delete-account" options={{ title: t('Delete Account') }} />
              <Stack.Screen name="settings/notifications" options={{ title: t('Notifications') }} />
              <Stack.Screen name="settings/gpa-scale" options={{ title: t('GPA Scale') }} />
              <Stack.Screen name="settings/appearance" options={{ title: t('Appearance') }} />
              <Stack.Screen name="settings/language" options={{ title: t('Language') }} />
              <Stack.Screen name="settings/help" options={{ title: t('Help & FAQ') }} />
              <Stack.Screen name="settings/calendar" options={{ title: t('Calendar Sync') }} />
              <Stack.Screen name="settings/lms" options={{ title: t('Learning Platforms') }} />
              <Stack.Screen name="settings/lms-connect" options={{ title: t('Connect Learning Platform') }} />
              <Stack.Screen name="settings/sync" options={{ title: t('Offline & Sync') }} />
              <Stack.Screen name="settings/widgets" options={{ title: t('Widgets') }} />
              <Stack.Screen name="dashboard" options={{ title: t('Workload') }} />
              <Stack.Screen name="insights" options={{ title: t('Progress Insights') }} />
              <Stack.Screen name="planner" options={{ title: t('Smart Plan') }} />
              <Stack.Screen name="completed-work" options={{ title: t('Completed Work') }} />
              <Stack.Screen name="grading/[id]" options={{ title: t('Grade Setup') }} />
              <Stack.Screen name="collaboration/index" options={{ title: t('Class Collaboration') }} />
              <Stack.Screen name="collaboration/[id]" options={{ title: t('Course Space') }} />
              <Stack.Screen name="collaborate" options={{ title: t('Join Course Space') }} />
              <Stack.Screen name="share-semester" options={{ presentation: 'modal', headerShown: false }} />
              <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal', headerShown: false }} />
              </Stack>
              </NavigationFrame>
            </AuthGate>
            <TaskCompletionCelebration />
            <WebAlertHost />
          </TaskCompletionFlowProvider>
        </AuthProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}

function NavigationFrame({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  return <WebAppFrame session={session}>{children}</WebAppFrame>;
}

function OfflineSyncRuntime() {
  const { session } = useSession();
  return <OfflineSyncBridge userId={session?.user.id ?? null} />;
}

function RealtimeSyncRuntime() {
  const { session } = useSession();
  return <RealtimeSyncBridge userId={session?.user.id ?? null} />;
}

function LmsSyncRuntime() {
  const { session } = useSession();
  return <LmsSyncBridge userId={session?.user.id ?? null} />;
}

function CollaborationSyncRuntime() {
  const { session } = useSession();
  const semesterId = useAppStore((state) => state.selectedSemesterId);
  return (
    <CollaborationSyncBridge
      userId={session?.user.id ?? null}
      semesterId={semesterId}
    />
  );
}
