import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { COLORS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useSession } from '@/app/_layout';
import { hasEmailPassword } from '@/lib/user';

export default function ChangePasswordScreen() {
  const colors = useColors();
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

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

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
      <Stack.Screen options={{ title: 'Change Password' }} />

      <View style={styles.content}>
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
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.ink2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 16, borderWidth: 0.5, borderColor: COLORS.line, marginBottom: 12 },
  input: { fontSize: 15, color: COLORS.ink, paddingVertical: 14 },
  divider: { height: 0.5, backgroundColor: COLORS.line },
  hint: { fontSize: 13, color: COLORS.ink3, lineHeight: 18, paddingHorizontal: 4, marginBottom: 24 },
  button: { backgroundColor: COLORS.brand, borderRadius: 14, padding: 15, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
