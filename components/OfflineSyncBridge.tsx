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

  useEffect(() => {
    if (userId && status.isOnline && status.pendingCount > 0 && !status.isSyncing) {
      flushOfflineQueue(userId, queryClient).catch(() => {});
    }
  }, [userId, status.isOnline, status.pendingCount, status.isSyncing, queryClient]);

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
    status.conflictCount === 0
  ) return null;

  const conflict = status.conflictCount > 0;
  const label = conflict
    ? `${status.conflictCount} sync conflict${status.conflictCount === 1 ? '' : 's'}`
    : status.isSyncing
      ? 'Syncing changes…'
      : !status.isOnline
        ? status.pendingCount
          ? `Offline · ${status.pendingCount} saved`
          : 'Offline'
        : `${status.pendingCount} change${status.pendingCount === 1 ? '' : 's'} waiting`;
  const color = conflict ? colors.coral : status.isOnline ? colors.brand : colors.ink3;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. Open sync status.`}
      onPress={() => router.push('/settings/sync' as any)}
      style={[styles.pill, { borderColor: `${color}55`, backgroundColor: `${color}12` }, compact && styles.compact]}
    >
      <FontAwesome
        name={conflict ? 'exclamation-triangle' : status.isOnline ? 'refresh' : 'cloud'}
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
