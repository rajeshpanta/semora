import { translate } from '@/lib/i18n';
import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text, TextInput } from '@/components/LocalizedReactNative';
import {
  useEffect,
  useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useSession } from '@/app/_layout';
import { hasEmailPassword } from '@/lib/user';

export default function ChangePasswordScreen() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const router = useRouter();
  const { session } = useSession();
  const email = session?.user?.email ?? '';
  const canChangePassword = hasEmailPassword(session?.user);

  // OAuth-only users have no password to change. The Settings screen
  // already hides this row for them, but bounce out anyway in case
  // someone deep-links here.
  useEffect(() => {
    if (!canChangePassword && session) {
      router.replace('/settings');
    }
  }, [canChangePassword, session]);

  // Which button this person actually taps to get in. "You normally sign in
  // with Apple" is the sentence that makes an unknown password make sense —
  // without it, being asked for a password you never chose just reads as a bug.
  const oauthProviders = (session?.user?.identities ?? [])
    .map((identity) => identity.provider)
    .filter((provider): provider is string => !!provider && provider !== 'email');
  const hasOAuthIdentity = oauthProviders.length > 0;
  const oauthLabel = oauthProviders
    .map((provider) =>
      provider === 'apple' ? 'Apple' : provider === 'google' ? 'Google' : provider)
    .join(' and ');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  /**
   * Email a reset link to the address already on the session.
   *
   * Same call and same redirect as the signed-out Forgot Password screen, so
   * there is one reset mechanism rather than two that can drift. Nothing about
   * the account changes here — the link is what lets the user set a password,
   * and it goes only to the address they already own.
   */
  const handleSendReset = async () => {
    if (!email) {
      Alert.alert('Error', 'Could not determine your account. Please sign in again.');
      return;
    }
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo:
          Platform.OS === 'web' && typeof window !== 'undefined'
            ? `${window.location.origin}/reset-password`
            : 'semora://auth/reset',
      });
      if (error) throw error;
      Alert.alert(
        'Check your email',
        `We sent a password reset link to ${email}. Open it to choose a new password — you don't need to stay on this screen.`,
      );
    } catch (err: any) {
      Alert.alert(
        'Could not send reset link',
        err.message ?? 'Please try again in a moment.',
      );
    } finally {
      setSendingReset(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword.trim()) {
      Alert.alert('Error', 'Please enter your current password.');
      return;
    }
    if (!newPassword.trim()) {
      Alert.alert('Error', 'Please enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      Alert.alert('Error', 'New password must be different from your current password.');
      return;
    }
    if (!email) {
      Alert.alert('Error', 'Could not determine your account. Please sign in again.');
      return;
    }

    setLoading(true);
    try {
      // Re-verify the current password before allowing the change. Without
      // this, brief access to an unlocked, signed-in phone is enough to
      // change the password and lock out the owner.
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (authError) {
        Alert.alert('Incorrect password', 'Your current password is incorrect.');
        setLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      Alert.alert('Success', 'Your password has been updated.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: translate('Change Password') }} />

      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Current Password</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <TextInput
            style={[styles.input, { color: colors.ink }]}
            placeholder="Current password"
            placeholderTextColor={colors.ink3}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            editable={!loading}
          />
        </View>

        {/*
          The way out for someone who cannot answer the field above.

          This screen is shown to anyone with an email/password identity — but
          having one and REMEMBERING it are different things. A student who
          signed up with a password and has tapped "Sign in with Apple" every
          day since has no reason to know it, and the only response the screen
          could give them was "Your current password is incorrect", forever.
          A reset link existed the whole time and was reachable only from the
          signed-OUT sign-in screen, so the escape was to log out of the
          account they were trying to secure.
        */}
        <TouchableOpacity
          onPress={handleSendReset}
          disabled={loading || sendingReset}
          style={styles.forgotRow}
          accessibilityRole="button"
        >
          <Text style={[styles.forgotLink, { color: colors.brand }, (loading || sendingReset) && styles.forgotDisabled]}>
            {sendingReset ? 'Sending reset link…' : 'Forgot your current password?'}
          </Text>
        </TouchableOpacity>
        {hasOAuthIdentity && (
          <Text style={[styles.hint, { color: colors.ink3 }]}>
            You normally sign in with {oauthLabel}. Your account also has a password, and
            we can email you a link to set a new one.
          </Text>
        )}

        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>New Password</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <TextInput
            style={[styles.input, { color: colors.ink }]}
            placeholder="New password"
            placeholderTextColor={colors.ink3}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            value={newPassword}
            onChangeText={setNewPassword}
            editable={!loading}
          />
          <View style={[styles.divider, { backgroundColor: colors.line }]} />
          <TextInput
            style={[styles.input, { color: colors.ink }]}
            placeholder="Confirm new password"
            placeholderTextColor={colors.ink3}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            editable={!loading}
          />
        </View>

        <Text style={[styles.hint, { color: colors.ink3 }]}>Password must be at least 6 characters.</Text>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.brand }, loading && styles.buttonDisabled]}
          activeOpacity={0.8}
          onPress={handleChangePassword}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Update Password</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.ink2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 16, borderWidth: 0.5, borderColor: COLORS.line, marginBottom: 12 },
  input: { fontSize: 15, color: COLORS.ink, paddingVertical: 14 },
  divider: { height: 0.5, backgroundColor: COLORS.line },
  forgotRow: {
    paddingVertical: 10,
    paddingHorizontal: 2,
    alignSelf: 'flex-start',
  },
  forgotLink: {
    fontSize: 14,
    fontWeight: '600',
  },
  forgotDisabled: {
    opacity: 0.5,
  },
  hint: { fontSize: 13, color: COLORS.ink3, lineHeight: 18, paddingHorizontal: 4, marginBottom: 24 },
  button: { backgroundColor: COLORS.brand, borderRadius: 14, padding: 15, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
