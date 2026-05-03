import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import { useAppStore } from '@/store/appStore';
import { useColors } from '@/lib/theme';

export default function ResetPasswordScreen() {
  const colors = useColors();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (!password) {
      setError('Please enter a new password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email ?? '';

      // Clear the in-progress flag BEFORE signOut so AuthGate doesn't
      // pin the user back to /reset-password during the sign-out
      // transition.
      useAppStore.getState().setInPasswordReset(false);

      // signOut wipes the banner via resetUserState, so set it AFTER
      // signOut returns. Sign-in.tsx subscribes reactively and will
      // pick up the new banner on its next render.
      await signOut();
      useAppStore.getState().setPostSignupBanner({
        email: userEmail,
        needsConfirm: false,
      });
    } catch (err: any) {
      setError(err.message ?? 'Could not update password. Please try again.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
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
            <Text style={[styles.title, { color: colors.ink }]}>New Password</Text>
            <Text style={[styles.subtitle, { color: colors.ink2 }]}>
              Choose a strong password for your Semora account
            </Text>
          </View>

          <View style={[styles.form, { backgroundColor: colors.card }]}>
            {error ? (
              <View style={styles.errorBox}>
                <FontAwesome name="exclamation-circle" size={14} color="#dc2626" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Text style={[styles.label, { color: colors.ink2 }]}>New password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, styles.inputWithIcon, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
                placeholder="At least 6 characters"
                placeholderTextColor={colors.ink3}
                value={password}
                onChangeText={(t) => { setPassword(t); if (error) setError(''); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
                autoFocus
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

            <Text style={[styles.label, { color: colors.ink2 }]}>Confirm new password</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={[styles.input, styles.inputWithIcon, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
                placeholder="Re-enter your new password"
                placeholderTextColor={colors.ink3}
                value={confirmPassword}
                onChangeText={(t) => { setConfirmPassword(t); if (error) setError(''); }}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowConfirm((v) => !v)}
                activeOpacity={0.6}
                hitSlop={8}
              >
                <FontAwesome name={showConfirm ? 'eye-slash' : 'eye'} size={16} color={colors.ink3} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: colors.brand }, loading && styles.buttonDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <FontAwesome name="check" size={14} color="#fff" />
                  <Text style={styles.buttonText}>Update Password</Text>
                </>
              )}
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
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 15, marginTop: 4, textAlign: 'center', paddingHorizontal: 12 },
  form: {
    borderRadius: 20, padding: 24,
    shadowColor: '#6B46C1', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, marginTop: 14 },
  input: {
    height: 48, borderWidth: 1.5, borderRadius: 12,
    paddingHorizontal: 16, fontSize: 15,
  },
  inputWrap: { position: 'relative', justifyContent: 'center' },
  inputWithIcon: { paddingRight: 44 },
  eyeBtn: {
    position: 'absolute', right: 12, top: 0, bottom: 0,
    width: 32, alignItems: 'center', justifyContent: 'center',
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fef2f2', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#fecaca',
  },
  errorText: { flex: 1, color: '#dc2626', fontSize: 13, fontWeight: '500' },
  button: {
    flexDirection: 'row', height: 50, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', marginTop: 22, gap: 8,
    shadowColor: '#6B46C1', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
