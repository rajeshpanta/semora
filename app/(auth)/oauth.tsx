import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { signInWithApple, signInWithGoogle } from '@/lib/auth';
import { MARKETING_URL } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

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
  const [showExit, setShowExit] = useState(false);
  const colors = useColors();
  const selectedProvider: Provider | null = provider === 'apple' || provider === 'google' ? provider : null;
  const providerWindowOpened = useRef(false);
  const returningFromProvider = useRef(false);

  const goBackToPreviousPage = useCallback(() => {
    if (returningFromProvider.current) return;
    returningFromProvider.current = true;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(MARKETING_URL);
    }
  }, []);

  // OAuth is allowed to use a browser-managed popup. Closing that popup does
  // not reject Supabase's initial `signInWithOAuth` promise, so without this
  // listener the launcher would spin forever. When focus returns to this page
  // after a provider window was open, confirm that a session did not arrive
  // and restore the page the visitor came from.
  const returnAfterDismissal = useCallback(async () => {
    if (returningFromProvider.current || !providerWindowOpened.current) return;
    const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    if (session || returningFromProvider.current) return;
    goBackToPreviousPage();
  }, [goBackToPreviousPage]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    let returnTimer: number | null = null;

    const onBlur = () => {
      providerWindowOpened.current = true;
    };
    const onFocus = () => {
      if (!providerWindowOpened.current) return;
      // A short delay lets a successful OAuth callback replace this page
      // before we decide the provider window was dismissed.
      returnTimer = window.setTimeout(() => void returnAfterDismissal(), 250);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') providerWindowOpened.current = true;
      if (document.visibilityState === 'visible' && providerWindowOpened.current) onFocus();
    };

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const exitTimer = window.setTimeout(() => setShowExit(true), 4000);
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearTimeout(exitTimer);
      if (returnTimer != null) window.clearTimeout(returnTimer);
    };
  }, [returnAfterDismissal]);

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
    setShowExit(false);
    providerWindowOpened.current = false;
    returningFromProvider.current = false;
    if (selectedProvider === 'apple') void signInWithApple().catch((cause: any) => setError(cause?.message ?? 'Could not continue with Apple.'));
    else if (selectedProvider === 'google') void signInWithGoogle().catch((cause: any) => setError(cause?.message ?? 'Could not continue with Google.'));
  };

  const backToMarketing = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(MARKETING_URL);
    }
  };

  // A normal OAuth launch must be visually invisible: the secure provider
  // sheet is the next thing a visitor should see, not a Semora loading card.
  // We only render a recovery view when a launch fails or does not open.
  if (!error && !showExit) return null;

  return (
    <View style={[styles.screen, { backgroundColor: colors.paper }]}>
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
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
            <Text style={[styles.title, { color: colors.ink }]}>Still waiting to sign in?</Text>
            <Text style={[styles.copy, { color: colors.ink2 }]}>You can safely cancel and return to Semora.</Text>
            <TouchableOpacity style={styles.secondary} onPress={goBackToPreviousPage}>
              <Text style={[styles.secondaryText, { color: colors.brand }]}>Cancel and go back</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, alignItems: 'center', paddingHorizontal: 28, paddingVertical: 36, borderRadius: 24, borderWidth: 1 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '700', marginTop: 18, textAlign: 'center' },
  copy: { fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center' },
  primary: { alignSelf: 'stretch', alignItems: 'center', borderRadius: 14, marginTop: 24, paddingVertical: 14 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary: { marginTop: 18, padding: 8 },
  secondaryText: { fontSize: 14, fontWeight: '700' },
});
