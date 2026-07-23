import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  flushOfflineQueue,
  getOfflineSyncSnapshot,
  initializeOfflineSync,
  subscribeOfflineSync,
} from '@/lib/offlineSync';
import { useColors } from '@/lib/theme';

export function useOfflineSyncStatus() {
  return useSyncExternalStore(
    subscribeOfflineSync,
    getOfflineSyncSnapshot,
    getOfflineSyncSnapshot,
  );
}

export function OfflineSyncBridge({ userId }: { userId: string | null }) {
  const queryClient = useQueryClient();
  const status = useOfflineSyncStatus();

  useEffect(() => initializeOfflineSync(), []);

  // Auto-flush eligible pending edits. Permanently-failed items are excluded from
  // pendingCount, so a poison pill no longer keeps this effect firing. When every
  // pending item is in exponential backoff, nextRetryAt is set: instead of
  // re-firing immediately we schedule a single wake-up for that timestamp, so a
  // flapping connection can't spin the queue.
  useEffect(() => {
    if (!userId || !status.isOnline || status.pendingCount === 0 || status.isSyncing) return;
    if (status.nextRetryAt) {
      const delay = Date.parse(status.nextRetryAt) - Date.now();
      if (delay > 0) {
        const timer = setTimeout(() => flushOfflineQueue(userId, queryClient).catch(() => {}), delay);
        return () => clearTimeout(timer);
      }
    }
    flushOfflineQueue(userId, queryClient).catch(() => {});
  }, [userId, status.isOnline, status.pendingCount, status.isSyncing, status.nextRetryAt, queryClient]);

  useEffect(() => {
    if (!userId) return;
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') flushOfflineQueue(userId, queryClient).catch(() => {});
    });
    return () => listener.remove();
  }, [userId, queryClient]);

  return null;
}

export function SyncStatusPill({ compact = false }: { compact?: boolean }) {
  const status = useOfflineSyncStatus();
  const colors = useColors();
  if (
    status.isOnline &&
    !status.isSyncing &&
    status.pendingCount === 0 &&
    status.conflictCount === 0 &&
    status.failedCount === 0
  ) return null;

  const conflict = status.conflictCount > 0;
  const failed = status.failedCount > 0;
  // Conflicts and hard failures both need the user's attention; surface conflicts
  // first (they have a resolution UI), then failures, before routine pending state.
  const label = conflict
    ? `${status.conflictCount} sync conflict${status.conflictCount === 1 ? '' : 's'}`
    : failed
      ? `${status.failedCount} change${status.failedCount === 1 ? '' : 's'} failed to sync`
      : status.isSyncing
        ? 'Syncing changes…'
        : !status.isOnline
          ? status.pendingCount
            ? `Offline · ${status.pendingCount} saved`
            : 'Offline'
          : status.nextRetryAt
            ? `Retrying ${status.pendingCount} change${status.pendingCount === 1 ? '' : 's'}…`
            : `${status.pendingCount} change${status.pendingCount === 1 ? '' : 's'} waiting`;
  const color = conflict || failed ? colors.coral : status.isOnline ? colors.brand : colors.ink3;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Open sync status.`}
      onPress={() => router.push('/settings/sync' as any)}
      style={[styles.pill, { borderColor: `${color}55`, backgroundColor: `${color}12` }, compact && styles.compact]}
    >
      <FontAwesome
        name={conflict || failed ? 'exclamation-triangle' : status.isOnline ? 'refresh' : 'cloud'}
        size={12}
        color={color}
      />
      <Text numberOfLines={1} style={[styles.label, { color }]}>{label}</Text>
      <View style={styles.spacer} />
      <FontAwesome name="chevron-right" size={9} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compact: { minHeight: 32, paddingVertical: 5 },
  label: { fontSize: 13, fontWeight: '700' },
  spacer: { flex: 1 },
});
