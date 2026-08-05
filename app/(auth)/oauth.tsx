import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { signInWithApple, signInWithGoogle } from '@/lib/auth';
import { MARKETING_URL } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { WebAuthBackdrop, webAuthCard } from '@/components/WebAuthChrome';

type Provider = 'apple' | 'google';

/**
 * The marketing site sends its provider buttons here rather than to the full
 * sign-in screen. This route immediately begins OAuth on app.semoraai.com,
 * which is important because the PKCE verifier must be stored on the same
 * origin that receives /callback. There is no second provider choice or auth
 * form for visitors to work through.
 */
export default function OAuthLauncherScreen() {
  const { provider } = useLocalSearchParams<{ provider?: string }>();
  const [error, setError] = useState('');
  const colors = useColors();
  const selectedProvider: Provider | null = provider === 'apple' || provider === 'google' ? provider : null;

  useEffect(() => {
    if (!selectedProvider) {
      setError('Choose Apple or Google to continue.');
      return;
    }

    let active = true;
    const begin = async () => {
      try {
        if (selectedProvider === 'apple') await signInWithApple();
        else await signInWithGoogle();
      } catch (cause: any) {
        if (!active) return;
        setError(cause?.message ?? `Could not continue with ${selectedProvider}. Please try again.`);
      }
    };
    void begin();
    return () => {
      active = false;
    };
  }, [selectedProvider]);

  const tryAgain = () => {
    setError('');
    if (selectedProvider === 'apple') void signInWithApple().catch((cause: any) => setError(cause?.message ?? 'Could not continue with Apple.'));
    else if (selectedProvider === 'google') void signInWithGoogle().catch((cause: any) => setError(cause?.message ?? 'Could not continue with Google.'));
  };

  const backToMarketing = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(MARKETING_URL);
    }
  };

  return (
    <WebAuthBackdrop>
      <View style={[styles.screen, { backgroundColor: Platform.OS === 'web' ? 'transparent' : colors.paper }]}>
        <View style={[styles.card, webAuthCard, { backgroundColor: Platform.OS === 'web' ? undefined : colors.card }]}>
          {error ? (
            <>
              <Text style={[styles.title, { color: colors.ink }]}>Sign-in could not start</Text>
              <Text style={[styles.copy, { color: colors.ink2 }]}>{error}</Text>
              {selectedProvider ? (
                <TouchableOpacity style={[styles.primary, { backgroundColor: colors.brand }]} onPress={tryAgain}>
                  <Text style={styles.primaryText}>Try again</Text>
                </TouchableOpacity>
              ) : null}
              {Platform.OS === 'web' ? (
                <TouchableOpacity style={styles.secondary} onPress={backToMarketing}>
                  <Text style={[styles.secondaryText, { color: colors.brand }]}>Back to Semora</Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={colors.brand} />
              <Text style={[styles.title, { color: colors.ink }]}>Opening secure sign-in…</Text>
              <Text style={[styles.copy, { color: colors.ink2 }]}>Continue with {selectedProvider === 'apple' ? 'Apple' : 'Google'} in the secure window.</Text>
            </>
          )}
        </View>
      </View>
    </WebAuthBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, alignItems: 'center', paddingHorizontal: 28, paddingVertical: 36, borderRadius: 24 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', marginTop: 18, textAlign: 'center' },
  copy: { fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center' },
  primary: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 14, marginTop: 24, paddingVertical: 14 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary: { marginTop: 18, padding: 8 },
  secondaryText: { fontSize: 14, fontWeight: '700' },
});
