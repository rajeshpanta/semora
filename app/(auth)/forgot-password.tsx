import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');

  const sendResetEmail = async (target: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: 'semora://auth/reset',
    });
    if (error) throw error;
  };

  const handleSubmit = async () => {
    setError('');
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      setError('That doesn\'t look like a valid email.');
      return;
    }
    setLoading(true);
    try {
      await sendResetEmail(email.trim());
      setSent(true);
    } catch (err: any) {
      setError(err.message ?? 'Could not send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    try {
      await sendResetEmail(email.trim());
      Alert.alert('Sent', 'Check your inbox for the new reset link.');
    } catch (err: any) {
      Alert.alert('Couldn\'t resend', err.message ?? 'Please try again in a moment.');
    } finally {
      setResending(false);
    }
  };

  // ── Hero success state ───────────────────────────────────────
  if (sent) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['top', 'bottom']}>
        <View style={styles.heroWrap}>
          <View style={[styles.heroIcon, { backgroundColor: colors.brand50 }]}>
            <FontAwesome name="envelope" size={40} color={colors.brand} />
          </View>

          <Text style={[styles.heroTitle, { color: colors.ink }]}>Check your email</Text>

          <Text style={[styles.heroBody, { color: colors.ink2 }]}>
            We sent a reset link to{'\n'}
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{email}</Text>
          </Text>

          <Text style={[styles.heroSub, { color: colors.ink3 }]}>
            The link expires in 1 hour
          </Text>

          <View style={styles.heroActions}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
              onPress={() => router.replace('/(auth)/sign-in')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Back to Sign In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={handleResend}
              disabled={resending}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.ink3 }]}>
                Didn't get it?{' '}
                <Text style={{ color: colors.brand, fontWeight: '700' }}>
                  {resending ? 'Sending…' : 'Resend'}
                </Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Form state ───────────────────────────────────────────────
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
              <FontAwesome name="lock" size={28} color="#fff" />
            </View>
            <Text style={[styles.title, { color: colors.ink }]}>Reset password</Text>
            <Text style={[styles.subtitle, { color: colors.ink2 }]}>
              We'll send a secure link to your email
            </Text>
          </View>

          <View style={[styles.form, { backgroundColor: colors.card }]}>
            {error ? (
              <View style={styles.errorBox}>
                <FontAwesome name="exclamation-circle" size={14} color="#dc2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: colors.ink2 }]}>Email address</Text>
            <TextInput
              style={[styles.input, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
              placeholder="you@university.edu"
              placeholderTextColor={colors.ink3}
              value={email}
              onChangeText={(t) => { setEmail(t); if (error) setError(''); }}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.brand }, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.buttonText}>Send Reset Link</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity onPress={() => router.replace('/(auth)/sign-in')} activeOpacity={0.7}>
              <Text style={[styles.linkText, { color: colors.ink2 }]}>
                Remember it?{' '}
                <Text style={[styles.linkBold, { color: colors.brand }]}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center' },
  inner: { paddingHorizontal: 24, paddingVertical: 32, maxWidth: 440, width: '100%', alignSelf: 'center' },
  header: { alignItems: 'center', marginBottom: 28 },
  logoContainer: {
    width: 64, height: 64, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    shadowColor: '#6B46C1', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
  },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { fontSize: 15, marginTop: 6, textAlign: 'center' },
  form: {
    borderRadius: 20, padding: 24,
    shadowColor: '#6B46C1', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06, shadowRadius: 16, elevation: 4,
  },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: {
    height: 48, borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 16, fontSize: 15,
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef2f2', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#fecaca', marginBottom: 14,
  },
  errorText: { flex: 1, color: '#dc2626', fontSize: 13, fontWeight: '500' },
  button: {
    height: 50, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 22,
    shadowColor: '#6B46C1', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  footer: { alignItems: 'center', marginTop: 24 },
  linkText: { fontSize: 14 },
  linkBold: { fontWeight: '700' },

  // Hero success state
  heroWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  heroIcon: {
    width: 96, height: 96, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28,
  },
  heroTitle: {
    fontSize: 32, fontWeight: '800', letterSpacing: -0.8,
    textAlign: 'center', marginBottom: 12,
  },
  heroBody: {
    fontSize: 16, lineHeight: 24,
    textAlign: 'center', fontWeight: '400', marginBottom: 8,
  },
  heroSub: {
    fontSize: 13, textAlign: 'center',
    marginBottom: 36, fontWeight: '500',
  },
  heroActions: {
    width: '100%', maxWidth: 360,
    alignItems: 'center',
  },
  primaryBtn: {
    width: '100%', height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6B46C1', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  primaryBtnText: {
    color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2,
  },
  secondaryBtn: { paddingVertical: 16 },
  secondaryBtnText: { fontSize: 14, fontWeight: '500' },
});
