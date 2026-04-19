import { View, Text, StyleSheet, Switch, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';
import {
  requestCalendarPermission,
  syncAllTasks,
  unsyncAll,
  isSynced,
} from '@/lib/calendarSync';

export default function CalendarSyncSettings() {
  const [synced, setSynced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);

  useEffect(() => {
    isSynced().then((v) => {
      setSynced(v);
      setLoading(false);
    });
  }, []);

  const handleToggle = async () => {
    if (synced) {
      // Turn off
      Alert.alert(
        'Remove Calendar Sync',
        'This will delete the SyllabusSnap calendar and all synced events from your device.',
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
          'SyllabusSnap needs calendar access to sync your tasks. Please enable it in Settings.',
        );
        return;
      }

      setSyncing(true);
      try {
        const count = await syncAllTasks(selectedSemesterId);
        setSynced(true);
        Alert.alert('Synced!', `${count} task${count !== 1 ? 's' : ''} added to your calendar.`);
      } catch (err: any) {
        Alert.alert('Sync Failed', err.message ?? 'Could not sync tasks. Check calendar permissions and try again.');
      } finally {
        setSyncing(false);
      }
    }
  };

  const handleResync = async () => {
    setSyncing(true);
    try {
      const count = await syncAllTasks(selectedSemesterId);
      Alert.alert('Re-synced', `${count} task${count !== 1 ? 's' : ''} synced to calendar.`);
    } catch (err: any) {
      Alert.alert('Sync Failed', err.message ?? 'Could not sync tasks. Check calendar permissions and try again.');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <Stack.Screen options={{ title: 'Calendar Sync' }} />
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.brand} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Calendar Sync' }} />

      <View style={styles.content}>
        <Text style={styles.sectionTitle}>Sync to Device Calendar</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <FontAwesome name="calendar-check-o" size={18} color={COLORS.brand} style={{ width: 26 }} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.rowLabel}>Calendar Sync</Text>
              <Text style={styles.rowSub}>
                {synced ? 'Tasks are synced to "SyllabusSnap" calendar' : 'Push tasks as calendar events'}
              </Text>
            </View>
            {syncing ? (
              <ActivityIndicator size="small" color={COLORS.brand} />
            ) : (
              <Switch
                value={synced}
                onValueChange={handleToggle}
                trackColor={{ false: COLORS.line, true: COLORS.brand }}
                thumbColor="#fff"
              />
            )}
          </View>
        </View>

        {synced && (
          <>
            <View style={styles.card}>
              <TouchableOpacity style={styles.actionRow} activeOpacity={0.7} onPress={handleResync} disabled={syncing}>
                <FontAwesome name="refresh" size={16} color={COLORS.brand} style={{ width: 26 }} />
                <Text style={[styles.rowLabel, { marginLeft: 8 }]}>Re-sync all tasks</Text>
                <FontAwesome name="chevron-right" size={11} color={COLORS.ink3} />
              </TouchableOpacity>
            </View>

            <Text style={styles.hint}>
              A "SyllabusSnap" calendar is created on your device. Incomplete tasks from the current semester are synced as events. Completed tasks are not included.
            </Text>
          </>
        )}

        <View style={[styles.infoBox, { marginTop: 20 }]}>
          <FontAwesome name="info-circle" size={14} color={COLORS.blue} />
          <Text style={styles.infoText}>
            New tasks you create will automatically appear in your calendar when sync is enabled. Deleting a task removes it from the calendar too.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.ink2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 16, borderWidth: 0.5, borderColor: COLORS.line, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  actionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: COLORS.ink, flex: 1 },
  rowSub: { fontSize: 13, color: COLORS.ink3, marginTop: 2 },
  hint: { fontSize: 13, color: COLORS.ink3, lineHeight: 18, paddingHorizontal: 4 },
  infoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: COLORS.blue50, borderRadius: 14, padding: 14 },
  infoText: { flex: 1, fontSize: 13, color: COLORS.blue, lineHeight: 18 },
});
