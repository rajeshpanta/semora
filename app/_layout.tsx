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
  useRef,
  useState } from 'react';
import { ActivityIndicator,
  AppState,
  Platform,
  View,
} from 'react-native';
import 'react-native-reanimated';

import { supabase } from '@/lib/supabase';
import { useToggleTaskComplete } from '@/lib/queries';
import {
  parseWatchCompletionRequest,
  handleWatchCompletionRequest,
  deriveSubmittedLate,
  WatchRequestLedger,
} from '@/lib/watchCompletion';
import {
  addWatchCompletionRequestListener,
  sendWatchCompletionAck,
} from '@/modules/semora-watch-bridge';
import type { Session } from '@supabase/supabase-js';
import * as Localization from 'expo-localization';
import { hasPendingCheckout, resolvePendingCheckout } from '@/lib/webCheckoutReturn';
import { useAppStore } from '@/store/appStore';
import { ThemeColorsProvider, useResolvedScheme, useColors } from '@/lib/theme';
import { claimAuthCode, setQueryClient, signOut } from '@/lib/auth';
import { loadLastServerRead, trackServerReads } from '@/lib/dataFreshness';
import { initIAP, refreshProStatus, endIAP, getServerEntitlement, validateAfterPurchase, setupPurchaseListeners } from '@/lib/purchases';
import {
  COMPLETE_TASK_ACTION, SNOOZE_TASK_ACTION, cancelAllRemindersOnSignOut,
  cancelTaskReminders, ensureAndroidChannels, registerTaskNotificationActions, rescheduleAllTaskReminders,
  hasTimezoneChanged, rescheduleClassReminders,
  snoozeNotification, startWebDueSoonReminders,
} from '@/lib/notifications';
import { registerForPushNotificationsAsync } from '@/lib/push';
import { track, installErrorTracking, noteAppForegrounded } from '@/lib/analytics';
import Constants from 'expo-constants';
import { recordAuthEvent, recordPhase, setAuthTelemetrySink } from '@/lib/authTelemetry';
import { clearLocalSyncState } from '@/lib/calendarSync';
import { applyPendingReferral, hasActivePromoGrant } from '@/lib/referral';
import { readPendingShareToken } from '@/lib/shareCourse';
import { TaskCompletionFlowProvider } from '@/components/TaskCompletionFlow';
import { TaskCompletionCelebration } from '@/components/TaskCompletionCelebration';
import { showTaskCelebration } from '@/lib/taskCelebration';
import { queryPersister, clearPersistedQueryCache, shouldPersistQuery } from '@/lib/queryPersistence';
import { isNetworkFailure, clearOfflineUserState } from '@/lib/offlineSync';
import { OfflineSyncBridge } from '@/components/OfflineSyncBridge';
import {
  readPendingCollaborationToken,
  savePendingCollaborationToken,
} from '@/lib/collaboration';
import { LmsSyncBridge } from '@/components/LmsSyncBridge';
import { recoverUnfinishedLectures } from '@/lib/lectureRecovery';
import { ProUpsellHost } from '@/components/ProUpsellHost';
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

// Auth diagnostics reach analytics through this one injected call rather than
// an import: lib/analytics imports lib/supabase, and lib/supabase imports
// lib/authTelemetry, so importing analytics back from there would close the
// cycle. Same shape as setQueryClient above.
//
// Emits nothing on a healthy launch — see lib/authTelemetry.ts for what counts
// as abnormal and how often it is allowed to say so.
setAuthTelemetrySink((event, props) => {
  let build: string | null = null;
  try {
    build = Constants.platform?.ios?.buildNumber ?? null;
  } catch {}
  track(event, { ...props, native_build: build });
});

// --- Auth context ---
const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
}>({ session: null, loading: true });

export function useSession() {
  return useContext(AuthContext);
}

/**
 * Ask the server whether the account behind a restored session still exists,
 * and sign this device out if it does not.
 *
 * WHY: deleting an account only tears down the device it was deleted on.
 * Anywhere else that holds a session — a browser left signed in, a second
 * phone — keeps showing the signed-in app, because getSession() reads from
 * local storage and does not phone home until the access token expires. The
 * account is gone and every row with it, so that session renders an empty app
 * that claims to be logged in.
 *
 * THE RULE HERE: only a definitive answer from the auth server signs anyone
 * out. 401/403 mean this token is no longer good for anyone; 404 and
 * user_not_found mean the account is gone. Everything else — a timeout, a
 * captive portal, a 5xx, a plane — is NOT evidence of anything and must leave
 * the session exactly as it is. The app works offline by design, and throwing
 * a student out of their deadline list because the train went into a tunnel
 * would be a far worse bug than the one this fixes.
 */
async function validateRestoredSession() {
  let status: number | undefined;
  let code: string | undefined;
  try {
    const { error } = await supabase.auth.getUser();
    if (!error) return;
    status = (error as { status?: number }).status;
    code = (error as { code?: string }).code;
  } catch {
    // Threw rather than returned — treated as a transport failure, which is
    // not grounds for signing anyone out.
    return;
  }

  const accountIsGone =
    status === 401 || status === 403 || status === 404 || code === 'user_not_found';
  if (!accountIsGone) return;

  track('session_invalidated', { screen: 'launch', status: status ?? 0 });
  // signOut() clears everything user-scoped on this device (cache, reminders,
  // widget, calendar links) and never throws out of its own cleanup.
  await signOut().catch(() => {});
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
      // Before the throttle below: a session boundary is about how long the app
      // was away, which the 2-minute sync throttle knows nothing about.
      noteAppForegrounded();
      // Which side of a foreground boundary an anonymous request landed on is
      // the difference between a resume race and a session that is simply gone.
      recordPhase('resume');
      const now = Date.now();
      // A timezone change skips the throttle. Reminder triggers are absolute
      // instants computed from local wall time, so a phone that has crossed a
      // zone is now firing every one of them at the wrong local hour — a 9am
      // nudge at 3am — and waiting two minutes to notice is two minutes of
      // wrong. It is also rare enough to cost nothing.
      const timezoneMoved = hasTimezoneChanged();
      if (!timezoneMoved && now - lastSyncAt < THROTTLE_MS) return;
      lastSyncAt = now;
      supabase.auth
        .getSession()
        .then(({ data: { session } }) => {
          if (!session) return;
          rescheduleAllTaskReminders(session.user.id, timezoneMoved ? 'timezone_change' : 'app_open');
          // Rebuilt on the same beat as the deadlines. A repeating trigger runs
          // on its own, so this is not what keeps class reminders alive — it is
          // when an edited meeting, a deleted course or a finished term is
          // noticed, and the only thing that stops a class that has ended.
          rescheduleClassReminders(session.user.id).catch(() => {});
          // Re-check the account still exists, on the same foreground pass.
          //
          // The launch check only covers a cold start, and an app can sit in
          // the background for days — long enough for the account to be deleted
          // from another device, or the session revoked. Without this, coming
          // back would show a signed-in shell over data that is gone until
          // something happened to fail.
          //
          // Deliberately folded into THIS listener rather than added as a
          // second one: the session is already in hand here and the 2-minute
          // throttle above applies, so it costs no extra subscription and no
          // extra getSession call.
          validateRestoredSession();
        })
        .catch(() => {});
    });
    return () => sub.remove();
  }, []);

  // The same account re-check, for the web.
  //
  // The effect above is native-only — it exists to reschedule LOCAL
  // notifications, which the browser has none of — so folding the session
  // check into it left web covered only at page load. A tab left open for a
  // day never asked again, which is the exact case that started this: an
  // account deleted elsewhere, a browser still showing the signed-in app.
  //
  // AppState is not used here. react-native-web maps it onto page visibility,
  // but the browser's own visibilitychange is the direct signal and does not
  // depend on that mapping holding.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const THROTTLE_MS = 2 * 60 * 1000; // matches the native path
    let lastCheckedAt = 0;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastCheckedAt < THROTTLE_MS) return;
      lastCheckedAt = now;
      supabase.auth
        .getSession()
        .then(({ data: { session } }) => {
          if (session) validateRestoredSession();
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
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

      // A Stripe purchase the tab left to complete.
      //
      // Run from the root, not from the paywall, because the return trip is a
      // cold boot: the auth gate below redirects while the session is still
      // restoring, the paywall unmounts, and the poll it started is abandoned.
      // That is why a real customer paid on 2026-08-20, was shown the paywall
      // anyway, and tried to buy three more times. Nothing here is attached to
      // a route, so no redirect can interrupt it.
      //
      // Skipped when the entitlement already says Pro — the note is only worth
      // resolving while the answer is still missing.
      if (Platform.OS === 'web' && !isPro && hasPendingCheckout()) {
        resolvePendingCheckout((plan) => {
          const live = useAppStore.getState();
          live.setIsPro(true);
          live.setSubscriptionPlan(plan);
        }).catch(() => {});
      }
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
        rescheduleAllTaskReminders(expectedUserId, 'pro_activated');
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
        .then(() => { if (rescheduleAfter) rescheduleAllTaskReminders(expectedUserId, 'pro_activated'); })
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
        if (entitlement.is_pro) rescheduleAllTaskReminders(expectedUserId, 'pro_activated');
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

    // Restore the previous session's freshness stamp, then record every
    // successful server read from here on.
    loadLastServerRead();
    const untrackReads = trackServerReads(queryClient);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      track('app_opened', { screen: 'launch', signed_in: !!session });

      // Confirm the restored session still belongs to a real account.
      //
      // getSession() is a LOCAL read: it hands back whatever is in storage and
      // only contacts the server once the access token has expired. So a
      // browser or second device that was signed in before the account was
      // deleted keeps rendering the signed-in app — with every row already
      // gone — until the token lapses an hour later. Deleting your account and
      // still being logged in is not something to leave to a timeout.
      //
      // Deliberately NOT awaited: launch must not wait on the network, and the
      // app is usable offline. This resolves in the background and only ever
      // acts on a definitive answer from the server.
      if (session) validateRestoredSession();

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

      // Mirrors into the diagnostics what this listener already tells the UI:
      // whether a session exists, and when it is due to expire. `expires_at` is
      // an integer Supabase hands us, so nothing here reads or decodes a token.
      recordAuthEvent(_event, Boolean(session), session?.expires_at ?? null);

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
        // Captured BEFORE the assignment below, because it is the only thing
        // that can tell a real sign-in from a replay of one.
        //
        // supabase-js re-emits SIGNED_IN on web far more often than a person
        // signs in — token refresh and tab re-focus both replay it — so this
        // event counted browser lifecycle, not logins. Measured on web 1.8:
        // 163 events from 22 devices, one of them firing 27 in a single day,
        // against 1.1 per device on iOS where the replay does not happen.
        // Every funnel with signed_in as a step read ~7x high on web.
        //
        // Only the ANALYTICS call is gated. The side effects below it —
        // revalidation, cache wipe, push binding — still run on every
        // SIGNED_IN exactly as before, because a replayed event can carry a
        // genuinely new token and those paths are what keep it applied.
        const previousSignedInUserId = lastSignedInUserId;
        lastSignedInUserId = session.user.id;
        rememberLmsConnections(session.user.id);
        syncProfileSettings(session).catch(() => {});

        if (_event === 'SIGNED_IN') {
          // Account switch / fresh sign-in — full revalidation (and reschedule
          // local reminders, which SIGNED_OUT cleared / a new device lacks),
          // plus wipe cached queries so tabs render the new user's data.
          refreshProForSession(session.user.id, true);
          queryClient.removeQueries();
          if (previousSignedInUserId !== session.user.id) {
            track('signed_in', { screen: 'auth' });
          }
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
        // Android's Apple flow resolves this same code inside signInWithApple.
        // Whoever claims it first exchanges it; a second exchange would fail
        // and pop a "Confirmation failed" alert over a sign-in that worked.
        if (!claimAuthCode(code)) return;
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
      untrackReads();
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

// --- Screen views ---
//
// One hook instead of a track() call hand-placed on each screen. Twenty-five
// routes had no instrumentation at all — including `welcome`, the very first
// screen a new install shows, and course/new, task/new and semester/new, which
// is why "did this course come from a scan or was it typed in?" could not be
// answered. Hand-placed calls also rot: every screen added later starts
// invisible until someone remembers.
//
// Segments, not the resolved path. expo-router reports the route PATTERN, so
// /course/8f3a-… arrives as ['course', '[id]'] and aggregates by itself. The
// sanitiser below is belt-and-braces: if a version ever hands back resolved
// values instead, anything that looks like an id is replaced rather than
// written into a shared analytics table.
const ID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-|^\d+$|^[0-9a-f]{16,}$/i;

function screenPathFromSegments(segments: string[]): string {
  if (!segments.length) return '/';
  return '/' + segments
    .map((seg) => (seg.startsWith('[') || !ID_LIKE.test(seg) ? seg : '[id]'))
    .join('/');
}

function useScreenViewTracking(segments: string[]) {
  const lastPath = useRef<string | null>(null);
  const path = screenPathFromSegments(segments as string[]);
  useEffect(() => {
    // Layout remounts and re-renders both re-run this; only a genuine route
    // CHANGE is a screen view. Without this the planner's focus rebuild alone
    // would have logged hundreds of views a minute.
    if (lastPath.current === path) return;
    lastPath.current = path;
    track('screen_viewed', { screen: path });
  }, [path]);
}

// --- Auth gate (routing) ---
function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const inPasswordReset = useAppStore((s) => s.inPasswordReset);
  const hasOnboarded = useAppStore((s) => s.hasOnboarded);

  useScreenViewTracking(segments as string[]);

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
        // This domain is the app; semoraai.com is the marketing site.
        //
        // This block used to send EVERY signed-out arrival straight to the auth
        // screen, reasoning that they must have clicked "Sign in"/"Try it for
        // free" on the marketing site and were therefore already sold. The
        // numbers disagreed: of 352 web visitors in 30 days, 287 arrived signed
        // out and 170 of those fired a single event and never came back — half
        // of all web traffic, gone at a login form. People who just clicked
        // "Try it for free" do not bounce in under 30 seconds.
        //
        // Meanwhile native has always shown onboarding first, explicitly to
        // "sell the value before the sign-up wall", and converts a scan at 15%
        // against web's 2%. Web now gets the same courtesy.
        //
        // Deliberate clickers are unaffected: the marketing site's "Try it for
        // free" and "Sign in" links land INSIDE the auth group, which this
        // never touches — so does the embedded Google button's iframe. Only a
        // generic arrival at the app root, with no onboarding behind it, is
        // treated as someone who has not yet been told what this is.
        if (!inAuthGroup && !onWelcome && !onOnboarding) {
          if (!hasOnboarded) {
            router.replace('/onboarding' as any);
          } else {
            // Returning user. Keep the intent explicit so an early AuthGate
            // redirect cannot turn a marketing-site "Sign in" visit into the
            // default signup framing.
            router.replace({
              pathname: '/(auth)/sign-in',
              params: { mode: 'signin' },
            } as any);
          }
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

  // Android channels, created once per launch and idempotent.
  //
  // The scheduling paths in lib/notifications.ts await this themselves, so
  // correctness does not depend on this effect winning any race. It runs here
  // so the channels also exist for a user who has not scheduled anything yet —
  // Settings → Notifications on Android lists an app's channels, and an empty
  // list is what makes reminder settings look missing.
  useEffect(() => {
    ensureAndroidChannels().catch(() => {});
  }, []);

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

      // The only real evidence that a reminder was useful.
      //
      // iOS never tells an app that a local notification was delivered or seen,
      // so delivery is unprovable by construction — but a TAP is observable, and
      // the gap between when the reminder was set to fire and when it was acted
      // on is the closest thing to a measure of whether the lead time was right.
      // A three-day warning acted on within minutes is doing its job; one acted
      // on two days later is decoration.
      //
      // Nothing identifying travels with it: the action, the kind of work, and
      // two durations. No title, no course, no task id.
      {
        const data = response.notification.request.content.data ?? {};
        const firedAt = typeof data.fireAt === 'number' ? data.fireAt : null;
        const offset = typeof data.offsetMinutes === 'number' ? data.offsetMinutes : null;
        track('reminder_action_tapped', {
          screen: 'notification',
          action:
            action === COMPLETE_TASK_ACTION ? 'complete'
            : action === SNOOZE_TASK_ACTION ? 'snooze'
            : action === Notifications.DEFAULT_ACTION_IDENTIFIER ? 'opened'
            : 'review',
          task_type: typeof data.taskType === 'string' ? data.taskType : 'unknown',
          // How far ahead of the deadline this reminder was meant to land.
          lead_minutes: offset,
          // How long the student took to act once it fired. Negative would mean
          // a clock change; clamped so the metric stays interpretable.
          reaction_minutes: firedAt ? Math.max(0, Math.round((Date.now() - firedAt) / 60_000)) : null,
        });
      }

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
        // Same helper the Watch uses. The rule is unchanged — extracted so the
        // two headless completion surfaces cannot drift into disagreeing about
        // whether the same task was handed in late.
        const submittedLate = deriveSubmittedLate(task.due_date, task.due_time, new Date());
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
        rescheduleAllTaskReminders(session.user.id, 'notification_action');
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

// Installed at module scope, before any component renders — a crash during
// the first render is exactly the one worth catching, and a useEffect would be
// too late for it.
installErrorTracking();

/**
 * Completes tasks that were ticked off on the Apple Watch.
 *
 * The Watch cannot write to Supabase and holds no session — it sends a request
 * and waits. This is where that request becomes a completion, and it does so
 * through `useToggleTaskComplete`, the same mutation the Today tab, task
 * detail, the course screen and search all use. That is deliberate and it is
 * the point of the whole design: completing from a wrist has to cancel the
 * reminders, drop the calendar event, schedule the next occurrence of a
 * recurring task, count toward the review milestone, fire the celebration, and
 * queue offline exactly as completing from the phone does. None of that is
 * re-implemented here, so none of it can be forgotten here.
 *
 * Mounted beside NotificationActionBridge because it has the same shape: a
 * headless surface completing a task with nobody looking at the phone.
 */
function WatchCompletionBridge() {
  const { session } = useSession();
  const toggleComplete = useToggleTaskComplete();
  // The mutation object is recreated each render; the listener is not. A ref
  // keeps the handler pointing at the current one without resubscribing.
  const toggleRef = useRef(toggleComplete);
  toggleRef.current = toggleComplete;
  const ledgerRef = useRef(new WatchRequestLedger());

  useEffect(() => {
    if (Platform.OS !== 'ios' || !session) return;
    const userId = session.user.id;
    let active = true;

    const unsubscribe = addWatchCompletionRequestListener((raw) => {
      void (async () => {
        const request = parseWatchCompletionRequest(raw);
        if (!request || !active) return;

        // Every decision below lives in lib/watchCompletion.ts and is unit
        // tested there: replay suppression, the ownership-scoped lookup, the
        // refusal to complete something already complete, and the lateness
        // rule. This component only supplies the two capabilities it has —
        // reading as the signed-in user, and the canonical mutation.
        const outcome = await handleWatchCompletionRequest(request, {
          ledger: ledgerRef.current,
          loadTask: async (taskId) => {
            // Scoped to the signed-in user, exactly as the notification action
            // is. RLS would refuse a foreign row anyway, but a watch can hold a
            // snapshot from a previous account until something replaces it,
            // and that request should be refused rather than attempted.
            const { data, error } = await supabase
              .from('tasks')
              .select('id, title, due_date, due_time, is_completed')
              .eq('id', taskId)
              .eq('user_id', userId)
              .maybeSingle();
            if (error) throw error;
            return data ?? null;
          },
          complete: (input) => toggleRef.current.mutateAsync(input),
        });

        if (!active) return;
        await sendWatchCompletionAck({
          requestId: request.requestId,
          taskId: request.taskId,
          ok: outcome.ok,
          reason: outcome.reason,
        }).catch(() => {});
      })();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [session]);

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
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      <ThemeProvider value={navTheme}>
        <AuthProvider>
          <TaskCompletionFlowProvider>
          <ProUpsellHost>
            <NotificationActionBridge />
            <WatchCompletionBridge />
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
              {/* gestureEnabled false: swiping this modal away unmounts the
                  recorder, which destroys the native session mid-lecture and
                  strands the recording with no way back to it. Leaving is an
                  explicit Stop or Discard. */}
              <Stack.Screen
                name="lecture/record"
                options={{ presentation: 'modal', title: t('Record Lecture'), gestureEnabled: false }}
              />
              <Stack.Screen name="lecture/index" options={{ title: t('Notes') }} />
              <Stack.Screen name="lecture/[id]" options={{ title: t('Notes') }} />
              <Stack.Screen name="lecture/new" options={{ title: t('New Notes') }} />
              <Stack.Screen name="lecture/quiz" options={{ presentation: 'modal', title: t('Quiz') }} />
              <Stack.Screen name="syllabus/paste" options={{ presentation: 'modal', title: t('Paste Syllabus Text') }} />
              <Stack.Screen name="syllabus/upload" options={{ presentation: 'modal', title: t('Upload Syllabus') }} />
              <Stack.Screen name="syllabus/review" options={{ title: t('Review Items') }} />
              {/* Terminal step of the import flow — no back button, because
                  every route into it has already replaced the stack. */}
              <Stack.Screen name="syllabus/added" options={{ headerShown: false, gestureEnabled: false }} />
              <Stack.Screen name="settings/index" options={{ title: t('Settings') }} />
              <Stack.Screen name="settings/password" options={{ title: t('Change Password') }} />
              <Stack.Screen name="settings/delete-account" options={{ title: t('Delete Account') }} />
              <Stack.Screen name="settings/notifications" options={{ title: t('Notifications') }} />
              <Stack.Screen name="settings/gpa-scale" options={{ title: t('GPA Scale') }} />
              <Stack.Screen name="settings/appearance" options={{ title: t('Appearance') }} />
              <Stack.Screen name="settings/language" options={{ title: t('Language') }} />
              <Stack.Screen name="settings/help" options={{ title: t('Help & FAQ') }} />
              <Stack.Screen name="settings/calendar" options={{ title: t('Calendar Sync') }} />
              <Stack.Screen name="settings/lms" options={{ title: t('Canvas & LMS') }} />
              <Stack.Screen name="settings/lms-connect" options={{ title: t('Connect Canvas') }} />
              <Stack.Screen name="settings/lms/new-courses" options={{ title: t('New Canvas courses') }} />
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
          </ProUpsellHost>
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

/**
 * One recovery pass per launch for recordings a killed app left unfinished.
 *
 * The retry pair it calls already existed, but only ran from the lecture
 * detail screen — so a student got their audio back only if they thought to
 * reopen that particular lecture. The audio was on the phone the whole time.
 *
 * Runs once per signed-in session, not on every render: `session?.user.id` in
 * the dependency list would re-fire on token refresh, and re-uploading a
 * 50-minute lecture because a JWT rotated is not a recovery, it is a bill.
 */
function LectureRecoveryRuntime() {
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const ranForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!userId || ranForRef.current === userId) return;
    ranForRef.current = userId;
    // Deliberately not awaited and never surfaced: this sits behind whatever
    // the student opened the app to do.
    void recoverUnfinishedLectures();
  }, [userId]);
  return null;
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
