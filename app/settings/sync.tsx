import { translate } from '@/lib/i18n';
import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert } from '@/components/LocalizedReactNative';
import { Text } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import {
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/app/_layout';
import { useOfflineSyncStatus } from '@/components/OfflineSyncBridge';
import { useLastServerRead } from '@/lib/dataFreshness';
import {
  flushOfflineQueue,
  listSyncConflicts,
  resolveSyncConflict,
} from '@/lib/offlineSync';
import { SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useResponsive } from '@/lib/responsive';
import { useColors } from '@/lib/theme';

export default function SyncSettingsScreen() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const status = useOfflineSyncStatus();
  const lastRead = useLastServerRead();
  const conflicts = useQuery({
    queryKey: ['syncConflicts', session?.user.id, status.conflictCount],
    queryFn: () => listSyncConflicts(session!.user.id),
    enabled: !!session,
  });
  const retry = () => {
    if (!session) return;
    // force:true so a manual "Try sync now" re-attempts the parked/backoff items
    // this button exists to recover — the auto-flush deliberately skips those.
    flushOfflineQueue(session.user.id, queryClient, { force: true })
      .then(() => conflicts.refetch())
      .catch((error) => Alert.alert('Sync failed', error.message));
  };
  const resolve = (id: string, resolution: 'keep_local' | 'use_cloud') => {
    resolveSyncConflict(id, resolution, queryClient)
      .then(() => conflicts.refetch())
      .catch((error) => Alert.alert('Couldn’t resolve conflict', error.message));
  };
  const healthy =
    status.isOnline &&
    status.pendingCount === 0 &&
    status.conflictCount === 0 &&
    status.failedCount === 0;
  // Parked (permanently-failed) or still-pending changes both mean a manual retry
  // can still recover something — surface the button whenever either is nonzero.
  const canRetry = status.pendingCount > 0 || status.failedCount > 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: translate('Offline & Sync') }} />
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}>
        <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={[styles.statusIcon, { backgroundColor: healthy ? '#0F766E16' : colors.brand50 }]}>
            <FontAwesome
              name={healthy ? 'check' : status.isOnline ? 'refresh' : 'cloud'}
              size={20}
              color={healthy ? '#0F766E' : colors.brand}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusTitle, { color: colors.ink }]}>
              {healthy ? 'Everything is synced' : status.isOnline ? 'Changes are waiting' : 'Working offline'}
            </Text>
            <Text style={[styles.statusText, { color: colors.ink3 }]}>
              {status.isOnline ? 'Internet connected' : 'Edits and completions are saved on this device'}
              {status.lastSyncedAt
                ? ` · Your changes sent ${formatDistanceToNow(new Date(status.lastSyncedAt), { addSuffix: true })}`
                : ''}
            </Text>
            {/* Two different questions, and this screen only ever answered one.
                lastSyncedAt is about edits leaving this device; it says nothing
                about whether what you are READING is current — and stays blank
                entirely for anyone who has never made an offline edit. */}
            <Text style={[styles.statusText, { color: colors.ink3 }]}>
              {lastRead
                ? `Data loaded ${formatDistanceToNow(new Date(lastRead), { addSuffix: true })}`
                : 'No data loaded from the server yet on this device'}
            </Text>
          </View>
        </View>

        <View style={styles.metrics}>
          <SmallMetric label="Waiting" value={status.pendingCount} />
          <SmallMetric label="Failed" value={status.failedCount} warning={status.failedCount > 0} />
          <SmallMetric label="Conflicts" value={status.conflictCount} warning={status.conflictCount > 0} />
        </View>

        {canRetry && (
          <TouchableOpacity
            onPress={retry}
            disabled={!status.isOnline || status.isSyncing}
            style={[styles.retry, { backgroundColor: colors.brand, opacity: !status.isOnline ? 0.45 : 1 }]}
          >
            <FontAwesome name="refresh" size={14} color="#fff" />
            <Text style={styles.retryText}>{status.isSyncing ? 'Syncing…' : 'Try sync now'}</Text>
          </TouchableOpacity>
        )}

        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Conflict resolution</Text>
        <Text style={[styles.explain, { color: colors.ink3 }]}>
          If the same item changed on another device while you were offline, Semora pauses that edit instead of silently overwriting either version.
        </Text>
        {(conflicts.data?.length ?? 0) === 0 ? (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <FontAwesome name="shield" size={17} color="#0F766E" />
            <Text style={[styles.emptyText, { color: colors.ink2 }]}>No conflicts need your attention.</Text>
          </View>
        ) : conflicts.data!.map((conflict) => {
          const localTitle = String(conflict.payload.title ?? '');
          const cloudTitle = String(conflict.serverRecord.title ?? '');
          const deletedRemotely = !conflict.serverRecord.id;
          return (
            <View key={conflict.id} style={[styles.conflict, { backgroundColor: colors.card, borderColor: `${colors.coral}55` }]}>
              <Text style={[styles.conflictTitle, { color: colors.ink }]}>
                {localTitle || cloudTitle || (conflict.entity === 'tasks' ? 'Task edit' : 'Subtask edit')}
              </Text>
              <Text style={[styles.conflictMeta, { color: colors.ink3 }]}>
                {deletedRemotely ? 'Deleted on another device after you edited it here' : 'Changed here and on another device'}
              </Text>
              <View style={[styles.choiceRow, { borderTopColor: colors.line }]}>
                <TouchableOpacity onPress={() => resolve(conflict.id, 'use_cloud')} style={styles.choice}>
                  <Text style={[styles.choiceLabel, { color: colors.ink2 }]}>Use cloud version</Text>
                </TouchableOpacity>
                {!deletedRemotely && (
                  <TouchableOpacity onPress={() => resolve(conflict.id, 'keep_local')} style={styles.choice}>
                    <Text style={[styles.choiceLabel, { color: colors.brand }]}>Keep my edit</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        <View style={[styles.note, { backgroundColor: colors.brand50 }]}>
          <FontAwesome name="info-circle" size={14} color={colors.brand} />
          <Text style={[styles.noteText, { color: colors.ink2 }]}>
            Cached semesters, courses, assignments, and subtasks remain readable for up to seven days without internet.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function SmallMetric({ label, value, warning }: { label: string; value: number; warning?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Text style={[styles.metricValue, { color: warning ? colors.coral : colors.brand }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.ink3 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', padding: 20, paddingBottom: 45, gap: 12 },
  statusCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'center' },
  statusIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 16, fontWeight: '800' },
  statusText: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  metrics: { flexDirection: 'row', gap: 10 },
  metric: { flex: 1, borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, padding: 14, alignItems: 'center' },
  metricValue: { fontSize: 23, fontWeight: '800' },
  metricLabel: { fontSize: 11, fontWeight: '700', marginTop: 2, textTransform: 'uppercase' },
  retry: { minHeight: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  sectionTitle: { fontSize: 20, fontFamily: 'Fraunces_700Bold', marginTop: 8 },
  explain: { fontSize: 13, lineHeight: 19, marginTop: -6 },
  empty: { borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 9 },
  emptyText: { fontSize: 13, fontWeight: '600' },
  conflict: { borderRadius: 16, borderWidth: 1, padding: 14 },
  conflictTitle: { fontSize: 15, fontWeight: '800' },
  conflictMeta: { fontSize: 12, marginTop: 3 },
  choiceRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 12, paddingTop: 10 },
  choice: { flex: 1, minHeight: 32, justifyContent: 'center' },
  choiceLabel: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  note: { borderRadius: 14, padding: 13, flexDirection: 'row', gap: 9, marginTop: 5 },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
