import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, MARKETING_URL } from '@/lib/constants';

/**
 * Retired route.
 *
 * This used to be a full marketing homepage — the web app's stand-in from
 * before semoraai.com existed. Keeping it meant app.semoraai.com served a
 * second, drifting copy of the marketing site (it still advertised scan
 * limits and pricing that had moved on), and anyone who pressed Back from
 * sign-in landed on it with no way home to the page they'd clicked from.
 *
 * The route stays so old links and history entries resolve, but it now does
 * the one thing it should: hand the visitor to the real site. Signed-out web
 * visitors are sent to /(auth)/sign-in by AuthGate instead of here.
 */
export default function Welcome() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.replace(MARKETING_URL);
    } else {
      router.replace('/(auth)/sign-in');
    }
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={COLORS.brand} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.paper,
  },
});
