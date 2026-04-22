import { View, Text, StyleSheet, Switch, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/app/_layout';
import { COLORS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useAppStore } from '@/store/appStore';

interface ReminderPrefs {
  reminder_same_day: boolean;
  reminder_1day: boolean;
  reminder_3day: boolean;
}

const DEFAULT_PREFS: ReminderPrefs = {
  reminder_same_day: true,
  reminder_1day: true,
  reminder_3day: true,
};

export default function NotificationSettings() {
  const colors = useColors();
  const { session } = useSession();
  const userId = session?.user?.id;
  const isPro = useAppStore((s) => s.isPro);
  const router = useRouter();
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('reminder_same_day, reminder_1day, reminder_3day')
          .eq('id', userId)
          .single();
        if (data) setPrefs(data);
      } catch {
        // Network or DB error — show defaults, don't hang
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const toggle = async (key: keyof ReminderPrefs) => {
    // 1-day and 3-day reminders are Pro only
    if (!isPro && (key === 'reminder_1day' || key === 'reminder_3day')) {
      Alert.alert(
        'Pro Feature',
        'Advance reminders are available with Semora Pro. Free users get same-day reminders.',
        [
          { text: 'Upgrade', onPress: () => router.push('/paywall' as any) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    const previous = { ...prefs };
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    if (userId) {
      const { error } = await supabase.from('profiles').update({ [key]: updated[key] }).eq('id', userId);
      if (error) {
        setPrefs(previous);
      }
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]}>
        <Stack.Screen options={{ title: 'Notifications' }} />
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Notifications' }} />

      <View style={styles.content}>
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Remind me before due date</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <ToggleRow
            label="Same day"
            subtitle="Morning of the due date"
            value={prefs.reminder_same_day}
            onToggle={() => toggle('reminder_same_day')}
          />
          <ToggleRow
            label="1 day before"
            subtitle={isPro ? 'The day before it\'s due' : 'Pro feature'}
            value={isPro ? prefs.reminder_1day : false}
            onToggle={() => toggle('reminder_1day')}
            pro={!isPro}
          />
          <ToggleRow
            label="3 days before"
            subtitle={isPro ? 'Early heads-up' : 'Pro feature'}
            value={isPro ? prefs.reminder_3day : false}
            onToggle={() => toggle('reminder_3day')}
            last
            pro={!isPro}
          />
        </View>

        <Text style={[styles.hint, { color: colors.ink3 }]}>
          Reminders are scheduled when tasks are created or updated. Changes here apply to new tasks.
        </Text>
      </View>
    </SafeAreaView>
  );
}

function ToggleRow({
  label,
  subtitle,
  value,
  onToggle,
  last,
  pro,
}: {
  label: string;
  subtitle: string;
  value: boolean;
  onToggle: () => void;
  last?: boolean;
  pro?: boolean;
}) {
  const colors = useColors();
  return (
    <View style={[styles.row, !last && styles.rowBorder, !last && { borderBottomColor: colors.line }]}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.rowLabel, { color: colors.ink }]}>{label}</Text>
          {pro && (
            <View style={[styles.proBadge, { backgroundColor: colors.brand }]}>
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          )}
        </View>
        <Text style={[styles.rowSub, { color: colors.ink3 }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: colors.line, true: colors.brand }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.ink2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 16, borderWidth: 0.5, borderColor: COLORS.line },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  rowLabel: { fontSize: 15, fontWeight: '500', color: COLORS.ink },
  rowSub: { fontSize: 13, color: COLORS.ink3, marginTop: 2 },
  hint: { fontSize: 13, color: COLORS.ink3, marginTop: 14, lineHeight: 18, paddingHorizontal: 4 },
  proBadge: { backgroundColor: COLORS.brand, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  proBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
});
