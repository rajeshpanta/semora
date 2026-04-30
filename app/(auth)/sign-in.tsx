import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { signIn } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/appStore';
import { useColors } from '@/lib/theme';

export default function SignInScreen() {
  // Reactive subscription — re-renders this screen whenever the banner appears,
  // even if the screen instance was already mounted before sign-up navigated here.
  const banner = useAppStore((s) => s.postSignupBanner);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errorType, setErrorType] = useState<'confirm' | 'credentials' | 'generic' | ''>('');
  const [resending, setResending] = useState(false);
  const colors = useColors();

  // Pre-fill email from the banner whenever it arrives (after fresh signup).
  useEffect(() => {
    if (banner?.email) {
      setEmail(banner.email);
    }
  }, [banner?.email]);

  const handleResend = async () => {
    if (!banner || resending) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: banner.email });
      if (error) throw error;
      Alert.alert('Email sent', 'We resent the confirmation email. Check your inbox and spam folder.');
    } catch (err: any) {
      Alert.alert('Could not resend', err.message ?? 'Please try again in a moment.');
    } finally {
      setResending(false);
    }
  };

  const handleSignIn = async () => {
    setError('');
    setErrorType('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      setErrorType('generic');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      setErrorType('generic');
      return;
    }

    setLoading(true);
    try {
      await signIn(email.trim(), password);
      // Successful sign-in — clear the post-signup banner so it doesn't reappear later.
      useAppStore.getState().setPostSignupBanner(null);
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      const code = err.code || err.error_code || '';

      if (msg.includes('email not confirmed') || code === 'email_not_confirmed') {
        setError(
          'Your email hasn\'t been confirmed yet. Please check your inbox for a confirmation link from Semora.'
        );
        setErrorType('confirm');
      } else if (
        msg.includes('invalid') ||
        msg.includes('credentials') ||
        code === 'invalid_credentials'
      ) {
        setError(
          'Incorrect email or password. Please double-check and try again.'
        );
        setErrorType('credentials');
      } else {
        setError(err.message || 'Something went wrong. Please try again.');
        setErrorType('generic');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          <View style={styles.header}>
            <View style={[styles.logoContainer, { backgroundColor: colors.brand }]}>
              <FontAwesome name="graduation-cap" size={28} color="#fff" />
            </View>
            <Text style={[styles.title, { color: colors.ink }]}>Semora</Text>
            <Text style={[styles.subtitle, { color: colors.ink2 }]}>Never miss a deadline again</Text>
          </View>

          <View style={[styles.form, { backgroundColor: colors.card }]}>
            {banner && !error ? (
              <View style={styles.successBox}>
                <FontAwesome name="check-circle" size={15} color="#16a34a" />
                <View style={styles.errorContent}>
                  <Text style={styles.successTitle}>Account Created</Text>
                  <Text style={styles.successText}>
                    {banner.needsConfirm
                      ? 'Check your email for a confirmation link, then sign in below.'
                      : 'Welcome to Semora! Sign in with your new credentials.'}
                  </Text>
                  {banner.needsConfirm && (
                    <TouchableOpacity onPress={handleResend} disabled={resending} activeOpacity={0.7}>
                      <Text style={styles.successLink}>
                        {resending ? 'Sending...' : 'Resend confirmation email'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : null}

            {error ? (
              <View
                style={[
                  styles.errorBox,
                  errorType === 'confirm' && styles.errorBoxWarning,
                ]}
              >
                <FontAwesome
                  name={errorType === 'confirm' ? 'clock-o' : 'exclamation-circle'}
                  size={15}
                  color={errorType === 'confirm' ? '#f59e0b' : '#dc2626'}
                />
                <View style={styles.errorContent}>
                  {errorType === 'confirm' && (
                    <Text style={[styles.errorTitle, { color: '#92400e' }]}>
                      Confirmation Required
                    </Text>
                  )}
                  <Text
                    style={[
                      styles.errorText,
                      errorType === 'confirm' && styles.errorTextWarning,
                    ]}
                  >
                    {error}
                  </Text>
                </View>
              </View>
            ) : null}

            <Text style={[styles.label, { color: colors.ink2 }]}>Email address</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
              placeholder="you@university.edu"
              placeholderTextColor={colors.ink3}
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                if (error) { setError(''); setErrorType(''); }
              }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              returnKeyType="next"
              textContentType="emailAddress"
            />

            <Text style={[styles.label, { color: colors.ink2 }]}>Password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, styles.inputWithIcon, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
                placeholder="Enter your password"
                placeholderTextColor={colors.ink3}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (error) { setError(''); setErrorType(''); }
                }}
                secureTextEntry={!showPassword}
                autoComplete="password"
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
                textContentType="password"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
                activeOpacity={0.6}
                hitSlop={8}
              >
                <FontAwesome name={showPassword ? 'eye-slash' : 'eye'} size={16} color={colors.ink3} />
              </TouchableOpacity>
            </View>

            <Link href="/(auth)/forgot-password" asChild>
              <TouchableOpacity style={styles.forgotLink} activeOpacity={0.7}>
                <Text style={[styles.forgotText, { color: colors.brand }]}>
                  Forgot password?
                </Text>
              </TouchableOpacity>
            </Link>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.brand }, loading && styles.buttonDisabled]}
              onPress={handleSignIn}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <FontAwesome name="sign-in" size={16} color="#fff" />
                  <Text style={styles.buttonText}>Sign In</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <Link href="/(auth)/sign-up" asChild>
              <TouchableOpacity activeOpacity={0.7}>
                <Text style={[styles.linkText, { color: colors.ink2 }]}>
                  Don't have an account?{' '}
                  <Text style={[styles.linkBold, { color: colors.brand }]}>Create one</Text>
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#FAF9F5',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  inner: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: '#6B46C1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#6B46C1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1e1b4b',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
    marginTop: 4,
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    backgroundColor: '#fafafa',
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#111',
  },
  inputWrap: { position: 'relative', justifyContent: 'center' },
  inputWithIcon: { paddingRight: 44 },
  eyeBtn: {
    position: 'absolute', right: 12, top: 0, bottom: 0,
    width: 32, alignItems: 'center', justifyContent: 'center',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 14,
  },
  successTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#166534',
    marginBottom: 2,
  },
  successText: {
    color: '#15803d',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  successLink: {
    color: '#16a34a',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
    marginTop: 6,
  },
  errorBoxWarning: {
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  errorTextWarning: {
    color: '#92400e',
  },
  button: {
    flexDirection: 'row',
    height: 50,
    backgroundColor: '#6B46C1',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
    gap: 8,
    shadowColor: '#6B46C1',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginTop: 10,
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '600',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    marginTop: 24,
  },
  linkText: {
    fontSize: 14,
    color: '#6b7280',
  },
  linkBold: {
    color: '#6B46C1',
    fontWeight: '700',
  },
});
