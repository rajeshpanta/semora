import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Fraunces_600SemiBold, Fraunces_700Bold, Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces';
import { DefaultTheme, DarkTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments, router as globalRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';
import 'react-native-reanimated';

import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import * as Localization from 'expo-localization';
import { COLORS } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';
import { ThemeColorsProvider, useResolvedScheme, useColors } from '@/lib/theme';
import { setQueryClient } from '@/lib/auth';
import { initIAP, refreshProStatus, endIAP, getServerEntitlement, validateAfterPurchase, setupPurchaseListeners } from '@/lib/purchases';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
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

  useEffect(() => {
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
      const { data: { session: current } } = await supabase.auth.getSession();
      if (current?.user.id !== expectedUserId) return;
      const store = useAppStore.getState();
      store.setIsPro(entitlement.is_pro);
      store.setSubscriptionPlan(entitlement.plan);
    };

    // Heavy path: opens StoreKit, fetches the device receipt, and POSTs
    // to validate-receipt (Apple verifyReceipt round-trip). Only run on
    // events where the answer might genuinely have changed: first
    // session resolved at launch, or a fresh sign-in.
    const refreshProForSession = (expectedUserId: string) => {
      initIAP()
        .then(() => refreshProStatus())
        .then((e) => writeEntitlementIfStillCurrent(expectedUserId, e))
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
      async () => {
        const { data: { session: startSession } } = await supabase.auth.getSession();
        const expectedUserId = startSession?.user.id;
        // No signed-in user — leave the StoreKit transaction pending so
        // it gets re-delivered after sign-in instead of being lost.
        if (!expectedUserId) return false;
        const entitlement = await validateAfterPurchase();
        await writeEntitlementIfStillCurrent(expectedUserId, entitlement);
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

      // Detect and save timezone on first sign-in.
      // NOTE: notification permission is deliberately NOT requested here.
      // An un-primed OS dialog at launch (empty app, zero deadlines)
      // converts at ~40-50%; the review screen primes it after the first
      // import instead ("Want reminders before these N deadlines?").
      if (session) {
        saveTimezoneIfNeeded(session.user.id);
        refreshProForSession(session.user.id);
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
      }

      if (session) {
        saveTimezoneIfNeeded(session.user.id);

        if (_event === 'SIGNED_IN') {
          // Account switch / fresh sign-in — full revalidation, plus
          // wipe cached queries so tabs render the new user's data.
          refreshProForSession(session.user.id);
          queryClient.removeQueries();

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

      if (parsed.hostname !== 'auth') return;

      if (path === 'reset') {
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
        globalRouter.replace('/(auth)/reset-password');
        return;
      }

      if (path === 'callback') {
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
        // Success — AuthGate sees the new session and routes to (tabs).
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });
    const linkSub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

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
async function saveTimezoneIfNeeded(userId: string) {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();

    // Two cases require setting the timezone:
    //   1. Profile exists but timezone is null — normal path on first launch
    //   2. Profile row missing — defensive against a brand-new OAuth user
    //      whose handle_new_user trigger hasn't propagated yet. Upsert
    //      lets us write either way without a follow-up read.
    if (!profile || !profile.timezone) {
      const detectedTz =
        Platform.OS === 'web'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : Localization.getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

      await supabase
        .from('profiles')
        .upsert({ id: userId, timezone: detectedTz }, { onConflict: 'id' });
    }
  } catch {
    // Non-critical — timezone will be detected on next launch
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

    if (!session) {
      // First launch on this device: sell the value before the sign-up
      // wall. Once onboarded, fall through to the normal sign-in redirect.
      if (!hasOnboarded) {
        if (!onOnboarding) router.replace('/onboarding' as any);
      } else if (!inAuthGroup) {
        router.replace('/(auth)/sign-in');
      }
    } else if (session && (inAuthGroup || onOnboarding)) {
      router.replace('/(tabs)');
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
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={navTheme}>
        <AuthProvider>
          <AuthGate>
            <Stack
              screenOptions={{
                headerBackTitle: 'Back',
                headerStyle: { backgroundColor: colors.card },
                headerTintColor: colors.ink,
                contentStyle: { backgroundColor: colors.paper },
              }}
            >
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)/forgot-password" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)/reset-password" options={{ headerShown: false }} />
              <Stack.Screen name="semester/new" options={{ presentation: 'modal', title: 'New Semester' }} />
              <Stack.Screen name="semester/[id]" options={{ title: 'Edit Semester' }} />
              <Stack.Screen name="course/new" options={{ presentation: 'modal', title: 'New Course' }} />
              <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
              <Stack.Screen name="task/new" options={{ presentation: 'modal', title: 'New Task' }} />
              <Stack.Screen name="task/[id]" options={{ title: 'Task' }} />
              <Stack.Screen name="syllabus/upload" options={{ presentation: 'modal', title: 'Upload Syllabus' }} />
              <Stack.Screen name="syllabus/review" options={{ title: 'Review Items' }} />
              <Stack.Screen name="settings/index" options={{ title: 'Settings' }} />
              <Stack.Screen name="settings/password" options={{ title: 'Change Password' }} />
              <Stack.Screen name="settings/delete-account" options={{ title: 'Delete Account' }} />
              <Stack.Screen name="settings/notifications" options={{ title: 'Notifications' }} />
              <Stack.Screen name="settings/appearance" options={{ title: 'Appearance' }} />
              <Stack.Screen name="settings/help" options={{ title: 'Help & FAQ' }} />
              <Stack.Screen name="settings/calendar" options={{ title: 'Calendar Sync' }} />
              <Stack.Screen name="settings/widgets" options={{ title: 'Widgets' }} />
              <Stack.Screen name="paywall" options={{ presentation: 'fullScreenModal', headerShown: false }} />
            </Stack>
          </AuthGate>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
