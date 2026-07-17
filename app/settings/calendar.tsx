import { View, Text, StyleSheet, Switch, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { COLORS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { track } from '@/lib/analytics';
import {
  requestCalendarPermission,
  syncAllTasks,
  syncAllMeetings,
  unsyncAll,
  unsyncAllMeetings,
  isSynced,
  isMeetingSyncTrackingActive,
} from '@/lib/calendarSync';
import { exportSemesterIcs } from '@/lib/ics';

export default function CalendarSyncSettings() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const [synced, setSynced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  // Class-schedule sync rides inside the main sync (same calendar, same Pro
  // gate) but keeps its own toggle + busy state.
  const [classSync, setClassSync] = useState(false);
  const [classSyncing, setClassSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const isPro = useAppStore((s) => s.isPro);
  // Sync was enabled while Pro but the subscription has since lapsed — auto-sync
  // is gated on isPro (isSyncEnabled), so it's actually paused. Reflect that
  // honestly instead of showing a healthy "synced" toggle that isn't working.
  const syncPaused = synced && !isPro;
  const router = useRouter();

  useEffect(() => {
    isSynced().then((v) => {
      setSynced(v);
      // Sync flag read, no native calls — safe alongside the async check.
      setClassSync(isMeetingSyncTrackingActive());
      setLoading(false);
    });
  }, []);

  const handleToggle = async () => {
    if (synced) {
      // Turn off
      Alert.alert(
        'Remove Calendar Sync',
        'This will delete the Semora calendar and all synced events from your device.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setSyncing(true);
              try {
                await unsyncAll();
                setSynced(false);
                // Class-schedule events lived in the deleted calendar and
                // unsyncAll cleared their local state too.
                setClassSync(false);
                track('calendar_sync_enabled', { on: false, screen: 'settings_calendar' });
              } catch (err: any) {
                Alert.alert('Error', err.message ?? 'Failed to remove calendar sync.');
              } finally {
                setSyncing(false);
              }
            },
          },
        ],
      );
    } else {
      // Turn on
      if (!isPro) {
        Alert.alert(
          'Pro Feature',
          'Calendar sync is available with Semora Pro.',
          [
            { text: 'Upgrade', onPress: () => router.push({ pathname: '/paywall', params: { context: 'calendarSync' } } as any) },
            { text: 'Cancel', style: 'cancel' },
          ],
        );
        return;
      }

      if (Platform.OS === 'web') {
        Alert.alert('Not Available', 'Calendar sync is only available on iOS and Android.');
        return;
      }

      if (!selectedSemesterId) {
        Alert.alert('No Semester', 'Please select a semester first before enabling calendar sync.');
        return;
      }

      const hasPermission = await requestCalendarPermission();
      if (!hasPermission) {
        Alert.alert(
          'Permission Required',
          'Semora needs calendar access to sync your tasks. Please enable it in Settings.',
        );
        return;
      }

      setSyncing(true);
      try {
        const count = await syncAllTasks(selectedSemesterId);
        setSynced(true);
        track('calendar_sync_enabled', { on: true, screen: 'settings_calendar' });
        if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Synced!', `${count} task${count !== 1 ? 's' : ''} added to your calendar.`);
      } catch (err: any) {
        Alert.alert('Sync Failed', err.message ?? 'Could not sync tasks. Check calendar permissions and try again.');
      } finally {
        setSyncing(false);
      }
    }
  };

  const handleClassToggle = async () => {
    // Defense in depth — the row only renders when synced && isPro, but never
    // let class-schedule sync run without an active subscription (same
    // reasoning as handleResync).
    if (!isPro) {
      Alert.alert('Pro Feature', 'Calendar sync is available with Semora Pro.', [
        { text: 'Upgrade', onPress: () => router.push({ pathname: '/paywall', params: { context: 'calendarSync' } } as any) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    if (classSync) {
      setClassSyncing(true);
      try {
        await unsyncAllMeetings();
        setClassSync(false);
        track('class_schedule_sync_enabled', { on: false, screen: 'settings_calendar' });
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Failed to remove class schedule events.');
      } finally {
        setClassSyncing(false);
      }
    } else {
      if (!selectedSemesterId) {
        Alert.alert('No Semester', 'Please select a semester first.');
        return;
      }
      setClassSyncing(true);
      try {
        const count = await syncAllMeetings(selectedSemesterId);
        setClassSync(true);
        track('class_schedule_sync_enabled', { on: true, screen: 'settings_calendar' });
        if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Class Schedule Synced',
          count > 0
            ? `${count} class meeting${count !== 1 ? 's' : ''} added as repeating events until the semester ends.`
            : 'No class meetings with a scheduled time yet — add times to your courses and they\'ll sync automatically.',
        );
      } catch (err: any) {
        Alert.alert('Sync Failed', err.message ?? 'Could not sync your class schedule. Check calendar permissions and try again.');
      } finally {
        setClassSyncing(false);
      }
    }
  };

  const handleResync = async () => {
    // Defense in depth: the re-sync row is hidden for non-Pro, but never let an
    // explicit re-sync run without an active subscription (syncAllTasks isn't
    // gated by isSyncEnabled the way auto-sync is).
    if (!isPro) {
      Alert.alert('Pro Feature', 'Calendar sync is available with Semora Pro.', [
        { text: 'Upgrade', onPress: () => router.push({ pathname: '/paywall', params: { context: 'calendarSync' } } as any) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    setSyncing(true);
    try {
      const count = await syncAllTasks(selectedSemesterId);
      // Rebuild class-schedule series too (covers meeting edits that
      // happened while this device was offline or the app was closed).
      let meetingCount = 0;
      if (classSync) {
        try { meetingCount = await syncAllMeetings(selectedSemesterId); } catch {}
      }
      Alert.alert(
        'Re-synced',
        `${count} task${count !== 1 ? 's' : ''}${classSync ? ` and ${meetingCount} class meeting${meetingCount !== 1 ? 's' : ''}` : ''} synced to calendar.`,
      );
    } catch (err: any) {
      Alert.alert('Sync Failed', err.message ?? 'Could not sync tasks. Check calendar permissions and try again.');
    } finally {
      setSyncing(false);
    }
  };

  const handleExport = async () => {
    if (!isPro) {
      Alert.alert(
        'Pro Feature',
        'Exporting your semester as a calendar file is available with Semora Pro.',
        [
          { text: 'Upgrade', onPress: () => router.push({ pathname: '/paywall', params: { context: 'icsExport' } } as any) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Calendar export is only available on iOS and Android.');
      return;
    }
    if (!selectedSemesterId) {
      Alert.alert('No Semester', 'Please select a semester first before exporting.');
      return;
    }
    setExporting(true);
    try {
      const { tasks, meetings } = await exportSemesterIcs(selectedSemesterId);
      track('ics_exported', { tasks, meetings, screen: 'settings_calendar' });
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Export Failed', err.message ?? 'Could not create the calendar file. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]}>
        <Stack.Screen options={{ title: 'Calendar Sync' }} />
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Calendar Sync' }} />

      <View style={[styles.content, { maxWidth: contentMaxWidth }]}>
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Sync to Device Calendar</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={styles.row}>
            <FontAwesome name="calendar-check-o" size={18} color={colors.brand} style={{ width: 26 }} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.rowLabel, { color: colors.ink }]}>Calendar Sync</Text>
              <Text style={[styles.rowSub, { color: syncPaused ? colors.amber : colors.ink3 }]}>
                {syncPaused
                  ? 'Paused — resubscribe to Pro to resume syncing'
                  : synced
                  ? 'Tasks are synced to "Semora" calendar'
                  : 'Push tasks as calendar events'}
              </Text>
            </View>
            {syncing ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <Switch
                value={synced}
                onValueChange={handleToggle}
                trackColor={{ false: colors.line, true: colors.brand }}
                thumbColor="#fff"
              />
            )}
          </View>
        </View>

        {syncPaused && (
          <View style={[styles.infoBox, { backgroundColor: colors.amber50 }]}>
            <FontAwesome name="exclamation-circle" size={14} color={colors.amber} />
            <Text style={[styles.infoText, { color: colors.amber }]}>
              Your Pro subscription ended, so calendar sync is paused. Resubscribe to resume, or turn it off to remove the Semora calendar.
            </Text>
          </View>
        )}

        {synced && isPro && (
          <>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <View style={styles.row}>
                <FontAwesome name="graduation-cap" size={16} color={colors.brand} style={{ width: 26 }} />
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={[styles.rowLabel, { color: colors.ink }]}>Include class schedule</Text>
                  <Text style={[styles.rowSub, { color: colors.ink3 }]}>
                    Weekly repeating events for your class meetings
                  </Text>
                </View>
                {classSyncing ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Switch
                    value={classSync}
                    onValueChange={handleClassToggle}
                    trackColor={{ false: colors.line, true: colors.brand }}
                    thumbColor="#fff"
                  />
                )}
              </View>
            </View>

            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <TouchableOpacity style={styles.actionRow} activeOpacity={0.7} onPress={handleResync} disabled={syncing}>
                <FontAwesome name="refresh" size={16} color={colors.brand} style={{ width: 26 }} />
                <Text style={[styles.rowLabel, { marginLeft: 8, color: colors.ink }]}>Re-sync all tasks</Text>
                <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.hint, { color: colors.ink3 }]}>
              A "Semora" calendar is created on your device. Incomplete tasks from the current semester are synced as events. Completed tasks are not included.
            </Text>
          </>
        )}

        <View style={[styles.infoBox, { marginTop: 20, backgroundColor: colors.blue50 }]}>
          <FontAwesome name="info-circle" size={14} color={colors.blue} />
          <Text style={[styles.infoText, { color: colors.blue }]}>
            New tasks you create will automatically appear in your calendar when sync is enabled. Deleting a task removes it from the calendar too. Changes you make directly in Apple Calendar won't sync back to Semora.
          </Text>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.ink2, marginTop: 24 }]}>Export</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <TouchableOpacity style={styles.actionRow} activeOpacity={0.7} onPress={handleExport} disabled={exporting}>
            <FontAwesome name="share-square-o" size={16} color={colors.brand} style={{ width: 26 }} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={[styles.rowLabel, { color: colors.ink }]}>Export calendar file (.ics)</Text>
              <Text style={[styles.rowSub, { color: colors.ink3 }]}>
                Works with Google Calendar, Outlook, and any calendar app
              </Text>
            </View>
            {exporting ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : !isPro ? (
              <View style={[styles.proBadge, { backgroundColor: colors.brand }]}>
                <FontAwesome name="star" size={9} color="#fff" />
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            ) : (
              <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.ink2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 16, borderWidth: 0.5, borderColor: COLORS.line, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: COLORS.ink, flex: 1 },
  rowSub: { fontSize: 13, color: COLORS.ink3, marginTop: 2 },
  hint: { fontSize: 13, color: COLORS.ink3, lineHeight: 18, paddingHorizontal: 4 },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: COLORS.blue50, borderRadius: 14, padding: 14 },
  infoText: { flex: 1, fontSize: 13, color: COLORS.blue, lineHeight: 18 },
  // Matches the PRO badge treatment on the course grade-scale teaser
  // (app/course/[id].tsx lockedBadge), minus the top margin.
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.brand, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  proBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
});
