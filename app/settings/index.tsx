import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/app/_layout';
import { useAppStore } from '@/store/appStore';
import { supabase } from '@/lib/supabase';
import { COLORS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { displayName, hasEmailPassword } from '@/lib/user';

export default function SettingsScreen() {
  const colors = useColors();
  const { session } = useSession();
  const userId = session?.user?.id;
  const email = session?.user?.email ?? '';
  const name = displayName(session?.user, 'User');
  const showChangePassword = hasEmailPassword(session?.user);
  const isPro = useAppStore((s) => s.isPro);
  const themeMode = useAppStore((s) => s.themeMode);
  const themeModeLabel = themeMode === 'system' ? 'System' : themeMode === 'light' ? 'Light' : 'Dark';
  const router = useRouter();

  // Reflect the user's *actual* enabled reminders on the settings row,
  // not just what's available on their tier. Filter Pro-only flags out
  // for free users so the display matches what the scheduler actually
  // fires (see lib/notifications.ts where 1d/3d are forced off for
  // free users at schedule time).
  const { data: reminderPrefs } = useQuery({
    queryKey: ['reminderPrefs', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('reminder_same_day, reminder_1day, reminder_3day')
        .eq('id', userId!)
        .maybeSingle();
      return data ?? { reminder_same_day: true, reminder_1day: true, reminder_3day: true };
    },
    enabled: !!userId,
  });
  const reminderLabel = (() => {
    if (!reminderPrefs) return undefined; // hide value while loading
    const parts: string[] = [];
    if (reminderPrefs.reminder_same_day) parts.push('Same day');
    if (isPro && reminderPrefs.reminder_1day) parts.push('1 day');
    if (isPro && reminderPrefs.reminder_3day) parts.push('3 days');
    return parts.length === 0 ? 'Off' : parts.join(', ');
  })();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Settings' }} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Account */}
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Account</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={[styles.row, showChangePassword && styles.rowBorder, showChangePassword && { borderBottomColor: colors.line }]}>
            <FontAwesome name="user" size={16} color={colors.ink2} style={styles.icon} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.ink }]}>{name}</Text>
              <Text style={[styles.rowSub, { color: colors.ink3 }]}>{email}</Text>
            </View>
          </View>
          {showChangePassword && (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push('/settings/password')}
            >
              <FontAwesome name="lock" size={16} color={colors.ink2} style={styles.icon} />
              <Text style={[styles.rowLabel, { flex: 1, color: colors.ink }]}>Change Password</Text>
              <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
            </TouchableOpacity>
          )}
        </View>

        {/* Preferences */}
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Preferences</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <SettingsRow
            icon="bell"
            label="Notifications"
            value={reminderLabel}
            onPress={() => router.push('/settings/notifications')}
          />
          <SettingsRow
            icon="calendar"
            label="Calendar Sync"
            onPress={() => router.push('/settings/calendar')}
          />
          <SettingsRow
            icon="sun-o"
            label="Appearance"
            value={themeModeLabel}
            onPress={() => router.push('/settings/appearance')}
          />
          <SettingsRow
            icon="th-large"
            label="Widgets"
            onPress={() => router.push('/settings/widgets')}
            last
          />
        </View>

        {/* Danger zone */}
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Danger Zone</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => router.push('/settings/delete-account')}>
            <FontAwesome name="trash" size={16} color={colors.coral} style={styles.icon} />
            <Text style={[styles.rowLabel, { flex: 1, color: colors.coral }]}>Delete Account</Text>
            <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.hint, { color: colors.ink3 }]}>
          Deleting your account removes all data permanently and cannot be undone.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsRow({ icon, label, value, last, onPress }: { icon: string; label: string; value?: string; last?: boolean; onPress?: () => void }) {
  const colors = useColors();
  return (
    <TouchableOpacity style={[styles.row, !last && styles.rowBorder, !last && { borderBottomColor: colors.line }]} activeOpacity={0.7} onPress={onPress}>
      <FontAwesome name={icon as any} size={16} color={colors.ink2} style={styles.icon} />
      <Text style={[styles.rowLabel, { flex: 1, color: colors.ink }]}>{label}</Text>
      {value && <Text style={[styles.rowValue, { color: colors.ink3 }]}>{value}</Text>}
      <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.ink2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 16, marginBottom: 24, borderWidth: 0.5, borderColor: COLORS.line },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  icon: { width: 24, textAlign: 'center', marginRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: COLORS.ink },
  rowSub: { fontSize: 13, color: COLORS.ink3, marginTop: 2 },
  rowValue: { fontSize: 14, color: COLORS.ink3, marginRight: 8 },
  hint: { fontSize: 13, color: COLORS.ink3, lineHeight: 18, paddingHorizontal: 4 },
});
