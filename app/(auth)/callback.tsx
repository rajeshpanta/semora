import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Text } from '@/components/LocalizedReactNative';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useColors } from '@/lib/theme';
import { WebAuthBackdrop, webAuthCard } from '@/components/WebAuthChrome';

/**
 * A stable, intentionally minimal OAuth return route. AuthProvider owns the
 * PKCE code exchange for every platform; this view only prevents a flash of
 * the normal auth page while that exchange completes.
 */
export default function OAuthCallbackScreen() {
  const colors = useColors();
  const router = useRouter();
  const { error, error_description: errorDescription } = useLocalSearchParams<{
    error?: string;
    error_description?: string;
  }>();
  const failure = typeof error === 'string' ? error : '';
  const failureDescription = typeof errorDescription === 'string' ? errorDescription : '';
  return (
    <WebAuthBackdrop>
      <View style={[styles.screen, { backgroundColor: Platform.OS === 'web' ? 'transparent' : colors.paper }]}>
        <View style={[styles.card, webAuthCard, { backgroundColor: Platform.OS === 'web' ? undefined : colors.card }]}>
          {failure ? (
            <>
              <Text style={[styles.title, { color: colors.ink }]}>Sign-in didn’t finish</Text>
              <Text style={[styles.copy, { color: colors.ink2 }]}>
                {failureDescription || 'You can try again whenever you’re ready.'}
              </Text>
              <TouchableOpacity
                style={[styles.primary, { backgroundColor: colors.brand }]}
                onPress={() => router.replace('/(auth)/sign-in')}
              >
                <Text style={styles.primaryText}>Back to sign in</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={colors.brand} />
              <Text style={[styles.title, { color: colors.ink }]}>Finishing sign-in…</Text>
            </>
          )}
        </View>
      </View>
    </WebAuthBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', borderRadius: 24, paddingHorizontal: 36, paddingVertical: 36 },
  title: { fontSize: 20, fontWeight: '700', marginTop: 18 },
  copy: { fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  primary: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 14, marginTop: 24, paddingHorizontal: 24, paddingVertical: 14 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
