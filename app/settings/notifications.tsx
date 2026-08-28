import { translate } from '@/lib/i18n';
import { Switch, TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text } from '@/components/LocalizedReactNative';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Linking,
  Platform,
  AppState,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import * as Notifications from 'expo-notifications';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  getNotificationDeliveryHealth, requestNotificationPermission,
  rescheduleAllTaskReminders, type NotificationDeliveryHealth,
  getNotificationPermissionStatus,
} from '@/lib/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { describeLadder } from '@/lib/reminderPlan';
import { CLASS_LEAD_OPTIONS, hasUsableMeetings, type ClassMeetingRow } from '@/lib/classReminders';
import { rescheduleClassReminders } from '@/lib/notifications';
import { useSession } from '@/app/_layout';
import { COLORS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useProUpsell } from '@/components/ProUpsellHost';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { track } from '@/lib/analytics';
import { DatePicker } from '@/components/DatePicker';

interface ReminderPrefs {
  class_reminder_minutes: number | null;
  reminder_same_day: boolean;
  reminder_1day: boolean;
  reminder_3day: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  flashcards_due_push_enabled: boolean;
}

const DEFAULT_PREFS: ReminderPrefs = {
  class_reminder_minutes: null,
  reminder_same_day: true,
  reminder_1day: true,
  reminder_3day: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00:00',
  quiet_hours_end: '08:00:00',
  flashcards_due_push_enabled: true,
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
  const showProUpsell = useProUpsell();
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
    // Normalised, not raw: Android reports a never-asked user as 'denied',
    // which showed them "enable it in Settings" for a prompt they were never
    // offered. See getNotificationPermissionStatus.
    getNotificationPermissionStatus()
      .then((status) => setOsPermission(status))
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
          .select('reminder_same_day, reminder_1day, reminder_3day, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, flashcards_due_push_enabled, class_reminder_minutes')
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
      if (granted && userId) rescheduleAllTaskReminders(userId, 'permission_granted');
    } else {
      // Denied — only iOS Settings can flip it now.
      Linking.openSettings().catch(() => {});
    }
  };

  // Quiet hours is a Pro feature (owner decision: control = Pro), gated the
  // same way as the 1-/3-day advance reminders above: free taps route to the
  // paywall instead of writing. Server-side the scheduler also forces quiet
  // hours off for non-Pro, so a patched client that saves the flag still gets
  // no quiet-hours behavior.
  const openQuietHoursPaywall = () => {
    track('paywall_open', { screen: 'settings_notifications', context: 'quiet_hours' });
    showProUpsell('reminders');
  };

  const updateQuietHours = async (patch: Partial<ReminderPrefs>) => {
    if (!isPro) {
      openQuietHoursPaywall();
      return;
    }
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
    await rescheduleAllTaskReminders(userId, 'settings_changed');
    setHealth(await getNotificationDeliveryHealth());
  };

  const runDeliveryCheck = async () => {
    setCheckingHealth(true);
    try {
      if (userId) await rescheduleAllTaskReminders(userId, 'settings_changed');
      setHealth(await getNotificationDeliveryHealth());
    } finally {
      setCheckingHealth(false);
    }
  };

  /**
   * How much warning, as one choice instead of three switches.
   *
   * Stored in the same three columns, so nothing migrates and every other
   * surface — the settings index row, the scheduler, an older client — keeps
   * reading what it always read. The switches were not confusing because there
   * were three of them; they were confusing because "Same day" and "1 day
   * before" describe mechanics rather than an outcome, and production showed
   * 322 students and not one change to any of them.
   */
  const INTENSITY = {
    light: { reminder_same_day: true, reminder_1day: false, reminder_3day: false },
    standard: { reminder_same_day: true, reminder_1day: true, reminder_3day: false },
    intensive: { reminder_same_day: true, reminder_1day: true, reminder_3day: true },
  } as const;
  type Intensity = keyof typeof INTENSITY;

  const currentIntensity: Intensity =
    prefs.reminder_3day && prefs.reminder_1day ? 'intensive'
    : prefs.reminder_1day ? 'standard'
    : 'light';

  const setIntensity = async (level: Intensity) => {
    // Anything beyond a same-day nudge is still Pro, exactly as before.
    if (!isPro && level !== 'light') {
      showProUpsell('reminders');
      return;
    }
    const previous = { ...prefs };
    const updated = { ...prefs, ...INTENSITY[level] };
    setPrefs(updated);
    if (!userId) return;
    const { error } = await supabase
      .from('profiles')
      .update(INTENSITY[level])
      .eq('id', userId);
    if (error) {
      setPrefs(previous);
      return;
    }
    qc.invalidateQueries({ queryKey: ['reminderPrefs', userId] });
    // Apply to the existing backlog, not just future tasks.
    rescheduleAllTaskReminders(userId, 'settings_changed');
  };

  // Now only the flashcards switch. The reminder columns are written by
  // setIntensity above, which carries the Pro gate for the advance rungs.
  /**
   * The active semester's meetings, and whether the term has a known end.
   *
   * Both are needed before class reminders can be offered at all: a timetable
   * with no usable times has nothing to remind about, and a repeating trigger
   * with no term end would keep announcing a class that finished in December.
   */
  const [meetings, setMeetings] = useState<ClassMeetingRow[]>([]);
  const [semester, setSemester] = useState<{ id: string; name: string; end_date: string | null } | null>(null);
  useEffect(() => {
    if (!userId || Platform.OS === 'web') return;
    let alive = true;
    (async () => {
      const { data: sem } = await supabase
        .from('semesters')
        .select('id, name, end_date')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!alive || !sem) return;
      setSemester(sem as any);
      const { data: rows } = await supabase
        .from('course_meetings')
        .select('id, course_id, days_of_week, start_time, location, courses!inner(name, semester_id)')
        .eq('user_id', userId)
        .eq('courses.semester_id', (sem as any).id);
      if (!alive) return;
      setMeetings(((rows as any[]) ?? []).map((m) => ({
        id: m.id,
        courseId: m.course_id,
        courseName: (Array.isArray(m.courses) ? m.courses[0]?.name : m.courses?.name) || 'Class',
        daysOfWeek: m.days_of_week,
        startTime: m.start_time,
        location: m.location,
      })));
    })();
    return () => { alive = false; };
  }, [userId]);

  const canOfferClassReminders = hasUsableMeetings(meetings);

  const setClassLead = async (minutes: number | null) => {
    if (!userId) return;
    // A repeating weekly trigger has no end date of its own, so a term end is
    // the one thing this feature cannot run safely without. Ask for it here,
    // once, instead of silently reminding a student about a class that ended.
    if (minutes !== null && !semester?.end_date) {
      Alert.alert(
        'When does this term end?',
        `Class reminders repeat every week, so Semora needs to know when ${semester?.name || 'this term'} finishes. Add an end date to the semester and turn these on again.`,
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Add end date', onPress: () => router.push(`/semester/${semester?.id}` as any) },
        ],
      );
      return;
    }
    const previous = prefs.class_reminder_minutes;
    setPrefs({ ...prefs, class_reminder_minutes: minutes });
    const { error } = await supabase
      .from('profiles')
      .update({ class_reminder_minutes: minutes })
      .eq('id', userId);
    if (error) {
      setPrefs({ ...prefs, class_reminder_minutes: previous });
      Alert.alert('Couldn\u2019t save', 'Class reminders were not updated.');
      return;
    }
    track('class_reminders_changed', {
      screen: 'settings_notifications',
      lead_minutes: minutes,
      enabled: minutes !== null,
      meetings: meetings.length,
    });
    rescheduleClassReminders(userId).catch(() => {});
  };

  const toggle = async (key: keyof ReminderPrefs) => {

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
        // Server-side push preference — it changes nothing about the on-device
        // task reminders, so skip the (expensive) full reschedule below.
        if (key === 'flashcards_due_push_enabled') return;
        // Apply the new preference to EXISTING tasks, not just future ones —
        // scheduleTaskReminders reads these prefs fresh, so a full reschedule
        // adds/removes the toggled reminder across the user's current backlog.
        // No-op if notifications aren't granted (permission-checked internally).
        rescheduleAllTaskReminders(userId, 'settings_changed');
      }
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]}>
        <Stack.Screen options={{ title: translate('Notifications') }} />
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      </SafeAreaView>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <Stack.Screen options={{ title: translate('Notifications') }} />
        <ScrollView
          contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.healthCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={[styles.healthIcon, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name="mobile" size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.healthTitle, { color: colors.ink }]}>
                Deadline reminders live on your iPhone
              </Text>
              <Text style={[styles.healthSub, { color: colors.ink3 }]}>
                The browser app keeps your tasks and preferences in sync, while notification delivery and quiet hours are managed in the Semora iPhone app.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: translate('Notifications') }} />

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
                  : Platform.OS === 'android'
                    ? 'Reminders can\'t be delivered. Tap to enable them in Android Settings.'
                    : 'Reminders can\'t be delivered. Tap to enable them in iOS Settings.'}
              </Text>
            </View>
            <FontAwesome name="chevron-right" size={12} color={colors.ink3} />
          </TouchableOpacity>
        )}

        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>How much warning</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {([
            { key: 'light' as const, label: 'Light', sub: 'A nudge when work is due' },
            { key: 'standard' as const, label: 'Standard', sub: 'Adds the day before' },
            { key: 'intensive' as const, label: 'Intensive', sub: 'Adds an early heads-up' },
          ]).map((option, i, all) => {
            const selected = currentIntensity === option.key;
            const locked = !isPro && option.key !== 'light';
            return (
              <TouchableOpacity
                key={option.key}
                style={[styles.row, i < all.length - 1 && styles.rowBorder, i < all.length - 1 && { borderBottomColor: colors.line }]}
                onPress={() => setIntensity(option.key)}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.rowLabel, { color: colors.ink }]}>{option.label}</Text>
                    {locked && (
                      <View style={[styles.proBadge, { backgroundColor: colors.brand }]}>
                        <Text style={styles.proBadgeText}>PRO</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.rowSub, { color: colors.ink3 }]}>{option.sub}</Text>
                </View>
                {selected && <FontAwesome name="check" size={15} color={colors.brand} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {/*
          What each kind of work actually gets.
          The audit found the notification screen opened twice in thirty days and
          not one preference ever changed — the behaviour was invisible, so there
          was nothing to react to. Saying it plainly is worth more than another
          control.
        */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line, marginTop: 12 }]}>
          {([
            { label: 'Exams', type: 'exam' },
            { label: 'Projects', type: 'project' },
            { label: 'Assignments & quizzes', type: 'assignment' },
            { label: 'Readings', type: 'reading' },
          ]).map((row, i, all) => (
            <View key={row.type} style={[styles.row, i < all.length - 1 && styles.rowBorder, i < all.length - 1 && { borderBottomColor: colors.line }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, { color: colors.ink }]}>{row.label}</Text>
                <Text style={[styles.rowSub, { color: colors.ink3 }]}>
                  {describeLadder(row.type, {
                    reminder_same_day: prefs.reminder_same_day,
                    reminder_1day: isPro && prefs.reminder_1day,
                    reminder_3day: isPro && prefs.reminder_3day,
                  })}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={[styles.hint, { color: colors.ink3 }]}>
          Semora gives more warning to work that matters more. Mark any task High
          priority to give it an exam's reminders, or set your own times on a task.
        </Text>

        {/*
          Class reminders.
          Hidden entirely when the student has no usable meeting times — 44% of
          accounts — because a control that cannot work is worse than no control.
        */}
        {canOfferClassReminders && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.ink2, marginTop: 24 }]}>Before class</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
              {([{ value: null as number | null, label: 'Off', sub: 'No class reminders' }]
                .concat(CLASS_LEAD_OPTIONS.map((m) => ({
                  value: m as number | null,
                  label: m >= 60 ? `${m / 60} hour before` : `${m} minutes before`,
                  sub: '',
                })))
              ).map((option, i, all) => {
                const selected = prefs.class_reminder_minutes === option.value;
                return (
                  <TouchableOpacity
                    key={String(option.value)}
                    style={[styles.row, i < all.length - 1 && styles.rowBorder, i < all.length - 1 && { borderBottomColor: colors.line }]}
                    onPress={() => setClassLead(option.value)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: colors.ink }]}>{option.label}</Text>
                      {!!option.sub && <Text style={[styles.rowSub, { color: colors.ink3 }]}>{option.sub}</Text>}
                    </View>
                    {selected && <FontAwesome name="check" size={15} color={colors.brand} />}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.hint, { color: colors.ink3 }]}>
              Repeats every week for your scheduled classes, and stops at the end
              of the term. Semora doesn{'\u2019'}t know your school{'\u2019'}s holidays, so
              you{'\u2019'}ll still be reminded on break days.
            </Text>
          </>
        )}

        {/* Sent from the server (supabase/cron/flashcards_due_push.sql), not
            scheduled on-device like the reminders above — so it sits in its own
            section rather than under "Remind me before due date". */}
        <Text style={[styles.sectionTitle, { color: colors.ink2, marginTop: 24 }]}>Flashcards</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <ToggleRow
            label="Cards due for review"
            subtitle="A daily nudge when you have cards waiting"
            value={prefs.flashcards_due_push_enabled}
            onToggle={() => toggle('flashcards_due_push_enabled')}
            last
          />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.ink2, marginTop: 24 }]}>Quiet hours</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <ToggleRow
            label="Pause reminder delivery"
            subtitle={isPro
              ? 'Reminders that land inside this window move to the end of quiet hours.'
              : 'Pro feature'}
            value={isPro ? prefs.quiet_hours_enabled : false}
            onToggle={() => updateQuietHours({ quiet_hours_enabled: !prefs.quiet_hours_enabled })}
            last
            pro={!isPro}
          />
          {isPro && prefs.quiet_hours_enabled && (
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
