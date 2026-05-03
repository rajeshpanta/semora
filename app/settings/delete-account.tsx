import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as LocalAuthentication from 'expo-local-authentication';
import { supabase } from '@/lib/supabase';
import { signOut, signInWithApple, signInWithGoogle } from '@/lib/auth';
import { useSession } from '@/app/_layout';
import { useColors } from '@/lib/theme';
import { hasEmailPassword, primaryProvider } from '@/lib/user';

const OAUTH_CANCEL_CODES = new Set([
  'ERR_REQUEST_CANCELED', 'ERR_CANCELED',
  '12501', 'SIGN_IN_CANCELLED', '-5',
]);

/**
 * Hardware identity check (Face ID / Touch ID, with passcode fallback)
 * before any irreversible account deletion. Closes the gap where someone
 * with brief access to an unlocked phone could trigger Google's OAuth
 * sheet — that sheet doesn't re-prompt for biometric on its own.
 *
 * Returns true if verified, false if cancelled. Throws on infrastructure
 * errors (no biometric hardware AND no passcode set, etc.) so the caller
 * can decide whether to fall through to a different verification path.
 */
async function verifyDeviceOwner(): Promise<boolean> {
  if (Platform.OS === 'web') return true;
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) {
    throw new Error('This device does not support biometric verification.');
  }
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Verify your identity to delete your account',
    cancelLabel: 'Cancel',
    fallbackLabel: 'Use Passcode',
    disableDeviceFallback: false,
    requireConfirmation: false,
  });
  return result.success;
}

export default function DeleteAccountScreen() {
  const colors = useColors();
  const router = useRouter();
  const { session } = useSession();
  const user = session?.user;
  const email = user?.email ?? '';
  const usesPassword = hasEmailPassword(user);
  const provider = primaryProvider(user);

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const reauthOAuth = async () => {
    if (provider === 'apple') {
      await signInWithApple();
    } else if (provider === 'google') {
      await signInWithGoogle();
    } else {
      throw new Error(
        'Unsupported sign-in method. Please contact support to delete your account.',
      );
    }
  };

  const handleDelete = async () => {
    if (!email) {
      Alert.alert('Error', 'Could not determine your account. Please sign in again.');
      return;
    }

    if (usesPassword && !password.trim()) {
      Alert.alert('Password required', 'Please enter your password to confirm.');
      return;
    }

    setLoading(true);
    try {
      // Hardware identity check FIRST — Face ID / Touch ID / passcode.
      // OAuth re-auth alone isn't enough here: Google's native sheet
      // doesn't biometric-gate at the OS level, so an unlocked phone
      // would otherwise let anyone tap their way through.
      let verified: boolean;
      try {
        verified = await verifyDeviceOwner();
      } catch (err: any) {
        Alert.alert(
          'Cannot verify identity',
          err.message ?? 'Set up Face ID, Touch ID, or a device passcode in Settings to delete your account.',
        );
        setLoading(false);
        return;
      }
      if (!verified) {
        // User cancelled the biometric prompt — silent abort.
        setLoading(false);
        return;
      }

      // The RPC checks auth.users.last_sign_in_at within 5 minutes, so we
      // refresh it here via a real sign-in (password or OAuth re-prompt)
      // right before calling delete.
      if (usesPassword) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (authError) {
          Alert.alert('Incorrect password', 'The password you entered is incorrect.');
          setLoading(false);
          return;
        }
      } else {
        try {
          await reauthOAuth();
        } catch (err: any) {
          // User cancelled the OAuth sheet — bail silently.
          if (OAUTH_CANCEL_CODES.has(err?.code)) {
            setLoading(false);
            return;
          }
          throw err;
        }
      }

      const { error: rpcError } = await supabase.rpc('delete_user_account');
      if (rpcError) throw rpcError;

      await signOut();
    } catch (err: any) {
      Alert.alert('Could not delete account', err.message ?? 'Please try again.');
      setLoading(false);
    }
  };

  const providerLabel =
    provider === 'apple' ? 'Apple' : provider === 'google' ? 'Google' : 'your provider';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Delete Account' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.warningBox, { backgroundColor: colors.coral50, borderColor: colors.coral }]}>
          <FontAwesome name="exclamation-triangle" size={20} color={colors.coral} />
          <View style={styles.warningTextWrap}>
            <Text style={[styles.warningTitle, { color: colors.coral }]}>This is permanent</Text>
            <Text style={[styles.warningText, { color: colors.ink2 }]}>
              All your semesters, courses, tasks, grades, and uploaded syllabi will be deleted. This cannot be undone.
            </Text>
          </View>
        </View>

        <Text style={[styles.label, { color: colors.ink2 }]}>Account</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.emailText, { color: colors.ink }]}>{email}</Text>
        </View>

        {usesPassword ? (
          <>
            <Text style={[styles.label, { color: colors.ink2 }]}>Confirm with your password</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <TextInput
                style={[styles.input, { color: colors.ink }]}
                placeholder="Your current password"
                placeholderTextColor={colors.ink3}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                value={password}
                onChangeText={setPassword}
                editable={!loading}
              />
            </View>
            <Text style={[styles.hint, { color: colors.ink3 }]}>
              For security, we'll re-verify your password before deleting your account.
            </Text>
          </>
        ) : (
          <Text style={[styles.hint, { color: colors.ink3 }]}>
            For security, we'll ask you to sign in again with {providerLabel} before deleting your account. Tap the button below to start.
          </Text>
        )}

        <TouchableOpacity
          style={[styles.deleteBtn, { backgroundColor: colors.coral }, loading && styles.btnDisabled]}
          activeOpacity={0.85}
          onPress={handleDelete}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.deleteBtnText}>Delete My Account Forever</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelBtn}
          activeOpacity={0.7}
          onPress={() => router.back()}
          disabled={loading}
        >
          <Text style={[styles.cancelBtnText, { color: colors.ink2 }]}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20 },
  warningBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 24,
  },
  warningTextWrap: { flex: 1, marginLeft: 12 },
  warningTitle: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  warningText: { fontSize: 13, lineHeight: 18 },
  label: {
    fontSize: 13, fontWeight: '600', marginBottom: 8,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  card: {
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 0.5, marginBottom: 12,
  },
  emailText: { fontSize: 15 },
  input: { fontSize: 15, padding: 0 },
  hint: { fontSize: 12, lineHeight: 16, paddingHorizontal: 4, marginBottom: 24 },
  deleteBtn: { borderRadius: 14, padding: 15, alignItems: 'center' },
  btnDisabled: { opacity: 0.6 },
  deleteBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  cancelBtn: { padding: 15, alignItems: 'center', marginTop: 8 },
  cancelBtnText: { fontSize: 15, fontWeight: '500' },
});
