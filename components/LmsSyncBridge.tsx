import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import {
  getLmsCredential,
  listLmsConnections,
  syncLmsConnection,
} from '@/lib/lms';
import { isDeviceOnline } from '@/lib/offlineSync';

const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Device-only LMS connections get a silent foreground refresh. Connections
 * explicitly authorized for encrypted server sync (including Canvas Calendar
 * Feed subscriptions) are also covered by the scheduled worker.
 */
export function LmsSyncBridge({ userId }: { userId: string | null }) {
  const queryClient = useQueryClient();
  const running = useRef(false);

  const syncIfDue = useCallback(async () => {
    if (!userId || running.current || !isDeviceOnline()) return;
    running.current = true;
    try {
      const connections = await listLmsConnections();
      const now = Date.now();
      let changed = false;
      for (const connection of connections) {
        if (!connection.sync_enabled) continue;
        const last = connection.last_synced_at
          ? new Date(connection.last_synced_at).getTime()
          : 0;
        if (Number.isFinite(last) && now - last < AUTO_SYNC_INTERVAL_MS) continue;
        if (!(await getLmsCredential(connection.id))) continue;
        try {
          await syncLmsConnection(connection.id, 'foreground_auto');
          changed = true;
        } catch {
          // syncLmsConnection records a user-facing health state. Foreground
          // auto-sync must never interrupt the student with an alert.
        }
      }
      if (changed) {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['taskStats'] });
        queryClient.invalidateQueries({ queryKey: ['lmsConnections'] });
      }
    } finally {
      running.current = false;
    }
  }, [userId, queryClient]);

  useEffect(() => {
    syncIfDue().catch(() => {});
  }, [syncIfDue]);

  useEffect(() => {
    if (!userId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncIfDue().catch(() => {});
    });
    return () => subscription.remove();
  }, [userId, syncIfDue]);

  return null;
}
