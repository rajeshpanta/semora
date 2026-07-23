import { View, Text, StyleSheet, Switch, ActivityIndicator, Alert, TouchableOpacity, Linking, Platform, AppState, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  getNotificationDeliveryHealth, requestNotificationPermission,
  rescheduleAllTaskReminders, type NotificationDeliveryHealth,
} from '@/lib/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/app/_layout';
import { COLORS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { DatePicker } from '@/components/DatePicker';

interface ReminderPrefs {
  reminder_same_day: boolean;
  reminder_1day: boolean;
  reminder_3day: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

const DEFAULT_PREFS: ReminderPrefs = {
  reminder_same_day: true,
  reminder_1day: true,
  reminder_3day: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00:00',
  quiet_hours_end: '08:00:00',
};

function timeToDate(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return date;
}

function dateToTime(value: Date) {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:00`;
}

export default function NotificationSettings() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const { session } = useSession();
  const userId = session?.user?.id;
  const isPro = useAppStore((s) => s.isPro);
  const router = useRouter();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<ReminderPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  // OS-level permission. Without this check the toggles look functional
  // while every reminder is silently dead (scheduling no-ops when the
  // user denied or never granted notifications).
  const [osPermission, setOsPermission] = useState<'granted' | 'denied' | 'undetermined'>('granted');
  const [health, setHealth] = useState<NotificationDeliveryHealth | null>(null);
  const [checkingHealth, setCheckingHealth] = useState(false);

  const refreshOsPermission = () => {
    if (Platform.OS === 'web') return;
    Notifications.getPermissionsAsync()
      .then(({ status }) => setOsPermission(status as any))
      .catch(() => {});
  };

  // Re-check when the app returns from iOS Settings, so the banner clears
  // the moment the user flips notifications on out there.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshOsPermission();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    refreshOsPermission();
    if (!userId) { setLoading(false); return; }
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('reminder_same_day, reminder_1day, reminder_3day, quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
          .eq('id', userId)
          .maybeSingle();
        if (data) setPrefs(data);
      } catch {
        // Network or DB error — show defaults, don't hang
      } finally {
        setLoading(false);
      }
    })();
    getNotificationDeliveryHealth().then(setHealth).catch(() => {});
  }, [userId]);

  const handleEnableNotifications = async () => {
    if (osPermission === 'undetermined') {
      // OS prompt never shown — we can ask directly.
      const granted = await requestNotificationPermission().catch(() => false);
      refreshOsPermission();
      // Reminders couldn't be delivered while permission was off, so existing
      // tasks were never scheduled — schedule them now that it's granted.
      if (granted && userId) rescheduleAllTaskReminders(userId);
    } else {
      // Denied — only iOS Settings can flip it now.
      Linking.openSettings().catch(() => {});
    }
  };

  const updateQuietHours = async (patch: Partial<ReminderPrefs>) => {
    const previous = prefs;
    const updated = { ...prefs, ...patch };
    setPrefs(updated);
    if (!userId) return;
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
    if (error) {
      setPrefs(previous);
      Alert.alert('Couldn’t save', 'Quiet hours were not updated.');
      return;
    }
    await rescheduleAllTaskReminders(userId);
    setHealth(await getNotificationDeliveryHealth());
  };

  const runDeliveryCheck = async () => {
    setCheckingHealth(true);
    try {
      if (userId) await rescheduleAllTaskReminders(userId);
      setHealth(await getNotificationDeliveryHealth());
    } finally {
      setCheckingHealth(false);
    }
  };

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
      } else {
        // Keep the Settings index row in sync — it reads the same prefs.
        qc.invalidateQueries({ queryKey: ['reminderPrefs', userId] });
        // Apply the new preference to EXISTING tasks, not just future ones —
        // scheduleTaskReminders reads these prefs fresh, so a full reschedule
        // adds/removes the toggled reminder across the user's current backlog.
        // No-op if notifications aren't granted (permission-checked internally).
        rescheduleAllTaskReminders(userId);
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

      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} showsVerticalScrollIndicator={false}>
        {osPermission !== 'granted' && (
          <TouchableOpacity
            style={[styles.permBanner, { backgroundColor: colors.amber50, borderColor: colors.amber }]}
            onPress={handleEnableNotifications}
            activeOpacity={0.75}
          >
            <FontAwesome name="bell-slash" size={14} color={colors.amber} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.permBannerTitle, { color: colors.ink }]}>Notifications are off</Text>
              <Text style={[styles.permBannerSub, { color: colors.ink2 }]}>
                {osPermission === 'undetermined'
                  ? 'Tap to allow notifications so reminders can reach you.'
                  : 'Reminders can\'t be delivered. Tap to enable them in iOS Settings.'}
              </Text>
            </View>
            <FontAwesome name="chevron-right" size={12} color={colors.ink3} />
          </TouchableOpacity>
        )}

        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Remind me before due date</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <ToggleRow
            label="Same day"
            subtitle="Morning of, plus a last call before the deadline"
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
          Reminders are scheduled when tasks are created or updated. Changes here apply to all your tasks.
        </Text>

        <Text style={[styles.sectionTitle, { color: colors.ink2, marginTop: 24 }]}>Quiet hours</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <ToggleRow
            label="Pause reminder delivery"
            subtitle="Reminders that land inside this window move to the end of quiet hours."
            value={prefs.quiet_hours_enabled}
            onToggle={() => updateQuietHours({ quiet_hours_enabled: !prefs.quiet_hours_enabled })}
            last
          />
          {prefs.quiet_hours_enabled && (
            <View style={[styles.quietTimes, { borderTopColor: colors.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.timeLabel, { color: colors.ink3 }]}>START</Text>
                <DatePicker
                  value={timeToDate(prefs.quiet_hours_start)}
                  onChange={(date) => updateQuietHours({ quiet_hours_start: dateToTime(date) })}
                  mode="time"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.timeLabel, { color: colors.ink3 }]}>END</Text>
                <DatePicker
                  value={timeToDate(prefs.quiet_hours_end)}
                  onChange={(date) => updateQuietHours({ quiet_hours_end: dateToTime(date) })}
                  mode="time"
                />
              </View>
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, { color: colors.ink2, marginTop: 24 }]}>Delivery health</Text>
        <View style={[styles.healthCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={[styles.healthIcon, { backgroundColor: health?.permission === 'granted' && !health?.lastError ? colors.teal50 : colors.amber50 }]}>
            <FontAwesome
              name={health?.permission === 'granted' && !health?.lastError ? 'check-circle' : 'exclamation-triangle'}
              size={17}
              color={health?.permission === 'granted' && !health?.lastError ? colors.teal : colors.amber}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.healthTitle, { color: colors.ink }]}>
              {health?.permission === 'granted' && !health?.lastError ? 'Reminder delivery is healthy' : 'Reminder delivery needs attention'}
            </Text>
            <Text style={[styles.healthSub, { color: colors.ink3 }]}>
              {health
                ? `${health.pendingCount} pending · ${health.lastScheduledAt ? `checked ${new Date(health.lastScheduledAt).toLocaleString()}` : 'not scheduled yet'}`
                : 'Checking permission and pending reminders…'}
            </Text>
            {health?.lastError && <Text style={[styles.healthError, { color: colors.coral }]}>{health.lastError}</Text>}
          </View>
          <TouchableOpacity onPress={runDeliveryCheck} disabled={checkingHealth} style={[styles.checkButton, { backgroundColor: colors.brand50 }]}>
            {checkingHealth ? <ActivityIndicator size="small" color={colors.brand} /> : <FontAwesome name="refresh" size={13} color={colors.brand} />}
          </TouchableOpacity>
        </View>

        <Text style={[styles.hint, { color: colors.ink3 }]}>
          Task reminders include Snooze and Mark Complete actions, so students can act without opening the full app.
        </Text>

        <Text style={[styles.hint, { color: colors.ink3 }]}>
          When notifications are on, Semora may also send occasional nudges — a heads-up about a busy
          week of deadlines, or a reminder to set up your courses when a new semester begins. These are
          infrequent and only sent while notifications are enabled above.
        </Text>
      </ScrollView>
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
  content: { padding: 20, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.ink2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 16, borderWidth: 0.5, borderColor: COLORS.line },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  rowLabel: { fontSize: 15, fontWeight: '500', color: COLORS.ink },
  rowSub: { fontSize: 13, color: COLORS.ink3, marginTop: 2 },
  hint: { fontSize: 13, color: COLORS.ink3, marginTop: 14, lineHeight: 18, paddingHorizontal: 4 },
  proBadge: { backgroundColor: COLORS.brand, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  proBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  permBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 16,
  },
  permBannerTitle: { fontSize: 14, fontWeight: '700' },
  permBannerSub: { fontSize: 12.5, marginTop: 1, lineHeight: 17 },
  quietTimes: { flexDirection: 'row', gap: 12, borderTopWidth: 0.5, paddingVertical: 14 },
  timeLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 6 },
  healthCard: { borderWidth: 0.5, borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  healthIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  healthTitle: { fontSize: 13.5, fontWeight: '700' },
  healthSub: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  healthError: { fontSize: 10.5, marginTop: 3 },
  checkButton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
