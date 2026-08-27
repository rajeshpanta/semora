import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeToUserData } from '@/lib/realtimeSync';
import { getOfflineSyncSnapshot, subscribeOfflineSync } from '@/lib/offlineSync';
import { reconcileTaskReminders } from '@/lib/notifications';

const CATCH_UP_KEYS = ['tasks', 'task', 'taskStats', 'courses', 'semesters'];

/**
 * Keeps personal data (tasks/courses/semesters) current across devices in
 * near real time via subscribeToUserData (lib/realtimeSync.ts) — the
 * personal-data counterpart to CollaborationSyncBridge. Mounted app-wide,
 * independent of which screen is open.
 */
export function RealtimeSyncBridge({ userId }: { userId: string | null }) {
  const queryClient = useQueryClient();

  const catchUp = useRef<() => void>(() => {});
  catchUp.current = () => {
    CATCH_UP_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
    // Resuming is the moment a phone finds out what happened while it was
    // away — including a task the student finished on the web app or that
    // Canvas marked submitted. Those completions cancel nothing on this
    // device, so any reminder they left behind is withdrawn here. No-ops on
    // web and when nothing is stale.
    if (userId) reconcileTaskReminders(userId).catch(() => {});
  };

  useEffect(() => {
    if (!userId) return;
    return subscribeToUserData(userId, queryClient);
  }, [userId, queryClient]);

  // Mobile OSes throttle/suspend WebSocket connections in the background, and
  // react-native-web's AppState already maps this same event to
  // document.visibilitychange — so this one listener covers native
  // background->foreground and web tab blur->focus with no platform branch.
  // A resumed app may have missed realtime events while suspended; catch up
  // once immediately on resume rather than waiting for the channel to notice.
  useEffect(() => {
    if (!userId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') catchUp.current();
    });
    return () => subscription.remove();
  }, [userId]);

  // Same idea for network reconnects specifically (isDeviceOnline is already
  // NetInfo-backed and cross-platform via lib/offlineSync.ts).
  useEffect(() => {
    if (!userId) return;
    let wasOnline = getOfflineSyncSnapshot().isOnline;
    const unsubscribe = subscribeOfflineSync(() => {
      const isOnline = getOfflineSyncSnapshot().isOnline;
      if (isOnline && !wasOnline) catchUp.current();
      wasOnline = isOnline;
    });
    return () => { unsubscribe(); };
  }, [userId]);

  return null;
}
