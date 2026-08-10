import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Text } from '@/components/LocalizedReactNative';
import {
  useCallback,
  useEffect,
  useRef,
  useState } from 'react';
import {
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { signInWithApple } from '@/lib/auth';
import { GoogleWebSignInButton } from '@/components/GoogleWebSignInButton';
import { MARKETING_URL } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

type Provider = 'apple' | 'google';

/**
 * The marketing site sends its provider buttons here rather than to the full
 * sign-in screen. Google renders its official Identity Services button on this
 * page; Apple continues through the existing Supabase PKCE redirect and
 * /callback route. There is no second provider choice or auth form.
 */
export default function OAuthLauncherScreen() {
  const { provider, embed } = useLocalSearchParams<{ provider?: string; embed?: string }>();
  const [error, setError] = useState('');
  const [showExit, setShowExit] = useState(false);
  const colors = useColors();
  const selectedProvider: Provider | null = provider === 'apple' || provider === 'google' ? provider : null;
  const embeddedGoogle = selectedProvider === 'google' && embed === '1';
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

  // Apple remains on the existing Supabase browser OAuth flow. Keep its legacy
  // focus recovery isolated here; Google popup/One Tap lifecycle is owned by
  // googleWebAuth.web.ts instead.
  const returnAfterDismissal = useCallback(async () => {
    if (returningFromProvider.current || !providerWindowOpened.current) return;
    const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
    if (session || returningFromProvider.current) return;
    goBackToPreviousPage();
  }, [goBackToPreviousPage]);

  useEffect(() => {
    // Google Identity Services owns its modal, One Tap prompt, popup lifecycle,
    // and cancellation. This legacy focus detector remains Apple-only so it
    // cannot race the Google ID-token exchange and navigate back too early.
    if (selectedProvider !== 'apple' || Platform.OS !== 'web' || typeof window === 'undefined') return;
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
  }, [returnAfterDismissal, selectedProvider]);

  useEffect(() => {
    if (!selectedProvider) {
      setError('Choose Apple or Google to continue.');
      return;
    }
    if (selectedProvider === 'google') return;

    let active = true;
    const begin = async () => {
      try {
        await signInWithApple();
      } catch (cause: any) {
        if (!active) return;
        if (cause?.code === 'SIGN_IN_CANCELLED') {
          goBackToPreviousPage();
          return;
        }
        setError(cause?.message ?? `Could not continue with ${selectedProvider}. Please try again.`);
      }
    };
    void begin();
    return () => {
      active = false;
    };
  }, [goBackToPreviousPage, selectedProvider]);

  const tryAgain = () => {
    setError('');
    setShowExit(false);
    providerWindowOpened.current = false;
    returningFromProvider.current = false;
    if (selectedProvider === 'apple') {
      void signInWithApple().catch((cause: any) => setError(cause?.message ?? 'Could not continue with Apple.'));
    }
  };

  const backToMarketing = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(MARKETING_URL);
    }
  };

  const finishGoogle = useCallback(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!embeddedGoogle || window.parent === window) return;

    try {
      const parentOrigin = new URL(document.referrer).origin;
      if (parentOrigin === 'https://semoraai.com' || parentOrigin === 'https://www.semoraai.com') {
        window.parent.postMessage({ type: 'semora-google-auth-success' }, parentOrigin);
      }
    } catch {}
  }, [embeddedGoogle]);

  useEffect(() => {
    if (!embeddedGoogle) return;
    let active = true;

    // A returning user may already have a valid app.semoraai.com session.
    // Hand that session back to the marketing dialog immediately instead of
    // rendering the signed-in app inside this intentionally tiny iframe.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (active && session) finishGoogle();
    }).catch(() => {});

    return () => { active = false; };
  }, [embeddedGoogle, finishGoogle]);

  if (embeddedGoogle) {
    return (
      <View style={styles.embedScreen}>
        <GoogleWebSignInButton
          theme="filled_black"
          shape="rectangular"
          onSuccess={finishGoogle}
          onError={(cause) => setError(cause.message || 'Could not continue with Google.')}
        />
        {error ? <Text style={styles.embedError}>{error}</Text> : null}
      </View>
    );
  }

  if (selectedProvider === 'google') {
    return (
      <View style={styles.googleScreen}>
        <View style={styles.googleCard}>
          <Text style={styles.googleTitle}>Continue with Google</Text>
          <Text style={styles.googleCopy}>
            {error || 'Choose your Google account to continue to Semora.'}
          </Text>
          <View style={styles.googleButtonHost}>
            <GoogleWebSignInButton
              theme="filled_black"
              shape="rectangular"
              onSuccess={finishGoogle}
              onError={(cause) => setError(cause.message || 'Could not continue with Google.')}
            />
          </View>
          <TouchableOpacity style={styles.secondary} onPress={backToMarketing}>
            <Text style={styles.googleBack}>Back to Semora</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Apple launches immediately and only needs a recovery view when its
  // existing redirect flow fails or does not open.
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
  googleButtonHost: { alignSelf: 'stretch', marginTop: 24 },
  embedScreen: {
    minHeight: 54,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  embedError: { color: '#fca5a5', fontSize: 11, lineHeight: 14, marginTop: 5, textAlign: 'center' },
  googleScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0e0b18',
  },
  googleCard: {
    width: '100%',
    maxWidth: 420,
    paddingHorizontal: 30,
    paddingVertical: 32,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: '#1a142d',
    shadowColor: '#000',
    shadowOpacity: 0.38,
    shadowRadius: 30,
  },
  googleTitle: { color: '#fff', fontSize: 26, lineHeight: 32, fontWeight: '700' },
  googleCopy: { color: 'rgba(255,255,255,0.68)', fontSize: 14, lineHeight: 21, marginTop: 8 },
  googleBack: { color: '#c4b5fd', fontSize: 14, fontWeight: '700' },
});
