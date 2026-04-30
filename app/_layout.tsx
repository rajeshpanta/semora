import FontAwesome from '@expo/vector-icons/FontAwesome';
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
import { requestNotificationPermission } from '@/lib/notifications';
import { COLORS } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';
import { ThemeColorsProvider, useResolvedScheme, useColors } from '@/lib/theme';
import { setQueryClient } from '@/lib/auth';
import { initIAP, refreshProStatus, endIAP } from '@/lib/purchases';

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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);

      // Detect and save timezone on first sign-in
      if (session) {
        saveTimezoneIfNeeded(session.user.id);
        requestNotificationPermission().catch(() => {});
        initIAP()
          .then(() => refreshProStatus())
          .then((entitlement) => useAppStore.getState().setIsPro(entitlement.is_pro))
          .catch(() => {});
      }
    }).catch(() => {
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);

      if (session) {
        saveTimezoneIfNeeded(session.user.id);
        requestNotificationPermission().catch(() => {});
        initIAP()
          .then(() => refreshProStatus())
          .then((entitlement) => useAppStore.getState().setIsPro(entitlement.is_pro))
          .catch(() => {});
        // Refetch all data after sign-in so tabs show fresh data immediately
        if (_event === 'SIGNED_IN') {
          queryClient.removeQueries();
        }
      }
    });

    // Deep-link handling for password reset flow.
    // Supabase email link looks like: semora://auth/reset?code=<auth_code>
    const handleDeepLink = async (url: string) => {
      const parsed = Linking.parse(url);
      const path = (parsed.path ?? '').replace(/^\//, '');
      if (parsed.hostname === 'auth' && path === 'reset') {
        const code = typeof parsed.queryParams?.code === 'string' ? parsed.queryParams.code : null;
        if (!code) return;

        // Tell AuthGate to pause its redirect logic while we exchange the code and route.
        useAppStore.getState().setInPasswordReset(true);

        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          useAppStore.getState().setInPasswordReset(false);
          Alert.alert(
            'Reset link invalid',
            'This password reset link is invalid or has expired. Please request a new one.',
          );
          globalRouter.replace('/(auth)/sign-in');
          return;
        }

        globalRouter.replace('/(auth)/reset-password');
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });
    const linkSub = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));

    return () => {
      subscription.unsubscribe();
      linkSub.remove();
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
      .single();

    // Only update if timezone is null (not yet detected)
    if (profile && !profile.timezone) {
      const detectedTz =
        Platform.OS === 'web'
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : Localization.getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;

      await supabase
        .from('profiles')
        .update({ timezone: detectedTz })
        .eq('id', userId);
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

  useEffect(() => {
    if (loading) return;
    // Pause redirects while a password reset is in progress so the recovery
    // session doesn't punt the user into (tabs) before they pick a new password.
    if (inPasswordReset) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments, inPasswordReset]);

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
