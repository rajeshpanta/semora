import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { createContext, useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import 'react-native-reanimated';

import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import * as Localization from 'expo-localization';
import { requestNotificationPermission } from '@/lib/notifications';
import { COLORS } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';
import { setQueryClient } from '@/lib/auth';

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
        requestNotificationPermission();
      }
    }).catch(() => {
      // Network failure or Supabase unreachable — let user through
      // so they see the sign-in screen instead of stuck splash
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);

      if (session) {
        saveTimezoneIfNeeded(session.user.id);
        requestNotificationPermission();
      }
    });

    return () => subscription.unsubscribe();
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

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#6B46C1" />
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
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={DefaultTheme}>
        <AuthProvider>
          <AuthGate>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen name="semester/new" options={{ presentation: 'modal', title: 'New Semester' }} />
              <Stack.Screen name="semester/[id]" options={{ title: 'Edit Semester' }} />
              <Stack.Screen name="course/new" options={{ presentation: 'modal', title: 'New Course' }} />
              <Stack.Screen name="course/[id]" options={{ title: 'Course' }} />
              <Stack.Screen name="task/new" options={{ presentation: 'modal', title: 'New Task' }} />
              <Stack.Screen name="task/[id]" options={{ title: 'Task' }} />
              <Stack.Screen name="syllabus/upload" options={{ presentation: 'modal', title: 'Upload Syllabus' }} />
              <Stack.Screen name="syllabus/review" options={{ title: 'Review Items' }} />
              <Stack.Screen name="settings/notifications" options={{ title: 'Notifications' }} />
              <Stack.Screen name="settings/appearance" options={{ title: 'Appearance' }} />
              <Stack.Screen name="settings/help" options={{ title: 'Help & FAQ' }} />
              <Stack.Screen name="settings/calendar" options={{ title: 'Calendar Sync' }} />
              <Stack.Screen name="settings/widgets" options={{ title: 'Widgets' }} />
            </Stack>
          </AuthGate>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
