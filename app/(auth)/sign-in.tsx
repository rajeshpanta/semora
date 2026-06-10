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
import * as AppleAuthentication from 'expo-apple-authentication';
import { signIn, signInWithApple, signInWithGoogle, isAppleSignInAvailable } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/appStore';
import { useColors } from '@/lib/theme';

export default function SignInScreen() {
  // Reactive subscription — re-renders this screen whenever the banner
  // appears (set by reset-password.tsx after a successful password change,
  // so the user sees confirmation when they're bounced back here to sign in).
  const banner = useAppStore((s) => s.postSignupBanner);

  // New installs land here straight from onboarding, so account CREATION
  // is the default framing. By policy, accounts are created ONLY via
  // Apple/Google OAuth — there is deliberately no email sign-up. The
  // email/password form is a sign-in-only path for existing accounts,
  // revealed by the mode toggle. A live banner (email-confirm pending,
  // or password just reset) means the account exists → sign-in mode.
  const [mode, setMode] = useState<'signup' | 'signin'>(
    useAppStore.getState().postSignupBanner ? 'signin' : 'signup',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'apple' | 'google' | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
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

  // Detect Apple sign-in availability once at mount. Returns false on
  // Android, on iOS sims without an Apple ID, and on devices below iOS 13.
  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
  }, []);

  const handleApple = async () => {
    setError('');
    setErrorType('');
    setOauthLoading('apple');
    try {
      await signInWithApple();
      useAppStore.getState().setPostSignupBanner(null);
    } catch (err: any) {
      // User-cancel on iOS reports as ERR_REQUEST_CANCELED — silent ignore.
      if (err?.code === 'ERR_REQUEST_CANCELED' || err?.code === 'ERR_CANCELED') {
        return;
      }
      setError(err?.message ?? 'Sign in with Apple failed. Please try again.');
      setErrorType('generic');
    } finally {
      setOauthLoading(null);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setErrorType('');
    setOauthLoading('google');
    try {
      await signInWithGoogle();
      useAppStore.getState().setPostSignupBanner(null);
    } catch (err: any) {
      // SIGN_IN_CANCELLED / IN_PROGRESS — silently ignore. Other codes
      // bubble up.
      const code = err?.code;
      if (code === '12501' || code === 'SIGN_IN_CANCELLED' || code === '-5') {
        return;
      }
      setError(err?.message ?? 'Sign in with Google failed. Please try again.');
      setErrorType('generic');
    } finally {
      setOauthLoading(null);
    }
  };

  const handleResend = async () => {
    // Works from the post-signup banner OR from the "email not confirmed"
    // sign-in error (legacy unconfirmed accounts have no banner — the
    // typed email is the only address we have).
    const target = banner?.email || email.trim();
    if (!target || resending) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: target });
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
            <Text style={[styles.title, { color: colors.ink }]}>
              {mode === 'signup' ? 'Create your account' : 'Welcome back'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.ink2 }]}>
              {mode === 'signup'
                ? 'Save your semester and never miss a deadline'
                : 'Sign in to pick up where you left off'}
            </Text>
          </View>

          <View style={[styles.form, { backgroundColor: colors.card }]}>
            {/* OAuth buttons — the ONLY way to create an account (policy:
                no email sign-up). The email/password form below is
                sign-in-only, for accounts that already exist. */}
            <View style={styles.oauthGroup}>
              {appleAvailable ? (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                  buttonStyle={
                    colors.paper === '#FAF9F5' || colors.paper === '#fff'
                      ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
                      : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  }
                  cornerRadius={12}
                  style={styles.appleButton}
                  onPress={handleApple}
                />
              ) : null}

              <TouchableOpacity
                style={[styles.googleButton, oauthLoading === 'google' && styles.buttonDisabled]}
                onPress={handleGoogle}
                disabled={oauthLoading !== null}
                activeOpacity={0.8}
              >
                {oauthLoading === 'google' ? (
                  <ActivityIndicator color="#1f1f1f" size="small" />
                ) : (
                  <>
                    <FontAwesome name="google" size={16} color="#1f1f1f" />
                    <Text style={styles.googleButtonText}>Continue with Google</Text>
                  </>
                )}
              </TouchableOpacity>

              {mode === 'signup' && (
                <Text style={[styles.oauthHint, { color: colors.ink3 }]}>
                  One tap with Apple or Google — your account is created automatically.
                </Text>
              )}
            </View>

            {mode === 'signin' && (
              <View style={styles.divider}>
                <View style={[styles.dividerLine, { backgroundColor: colors.line }]} />
                <Text style={[styles.dividerText, { color: colors.ink3 }]}>or</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.line }]} />
              </View>
            )}

            {banner && !error ? (
              <View style={styles.successBox}>
                <FontAwesome name="check-circle" size={15} color="#16a34a" />
                <View style={styles.errorContent}>
                  {/* With email sign-up removed (OAuth-only policy), a
                      needsConfirm:false banner can only come from the
                      password-reset flow — title it accordingly. */}
                  <Text style={styles.successTitle}>
                    {banner.needsConfirm ? 'Account Created' : 'Password Updated'}
                  </Text>
                  <Text style={styles.successText}>
                    {banner.needsConfirm
                      ? 'Check your email for a confirmation link, then sign in below.'
                      : 'Sign in below with your new password.'}
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
                  {errorType === 'confirm' && (
                    <TouchableOpacity onPress={handleResend} disabled={resending} activeOpacity={0.7}>
                      <Text style={styles.successLink}>
                        {resending ? 'Sending...' : 'Resend confirmation email'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ) : null}

            {mode === 'signin' && (
              <>
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
              </>
            )}

            {/* Mode toggle — email form is for EXISTING accounts only. */}
            <TouchableOpacity
              style={styles.modeToggle}
              onPress={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup');
                setError('');
                setErrorType('');
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.modeToggleText, { color: colors.ink3 }]}>
                {mode === 'signup' ? 'Already have an account? ' : 'New to Semora? '}
                <Text style={{ color: colors.brand, fontWeight: '700' }}>
                  {mode === 'signup' ? 'Sign in' : 'Create account'}
                </Text>
              </Text>
            </TouchableOpacity>
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
  oauthGroup: {
    gap: 10,
    marginBottom: 4,
  },
  oauthHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  modeToggle: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 4,
  },
  modeToggleText: {
    fontSize: 14,
    fontWeight: '500',
  },
  appleButton: {
    height: 50,
    width: '100%',
  },
  googleButton: {
    flexDirection: 'row',
    height: 50,
    backgroundColor: '#fff',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#dadce0',
  },
  googleButtonText: {
    color: '#1f1f1f',
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 16,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 12, fontWeight: '600' },
});
