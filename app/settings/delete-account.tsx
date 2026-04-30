import { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { supabase } from '@/lib/supabase';
import { signOut } from '@/lib/auth';
import { useSession } from '@/app/_layout';
import { useColors } from '@/lib/theme';

export default function DeleteAccountScreen() {
  const colors = useColors();
  const router = useRouter();
  const { session } = useSession();
  const email = session?.user?.email ?? '';

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!password.trim()) {
      Alert.alert('Password required', 'Please enter your password to confirm.');
      return;
    }
    if (!email) {
      Alert.alert('Error', 'Could not determine your account. Please sign in again.');
      return;
    }

    setLoading(true);
    try {
      // Re-authenticate to refresh the JWT — the RPC requires iat within 5 minutes.
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        Alert.alert('Incorrect password', 'The password you entered is incorrect.');
        setLoading(false);
        return;
      }

      const { error: rpcError } = await supabase.rpc('delete_user_account');
      if (rpcError) throw rpcError;

      await signOut();
    } catch (err: any) {
      Alert.alert('Could not delete account', err.message ?? 'Please try again.');
      setLoading(false);
    }
  };

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
