import type { QueryClient } from '@tanstack/react-query';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { hasPendingOfflineEdit } from '@/lib/offlineSync';

// Personal-data counterpart to subscribeToCollaboration (lib/collaboration.ts):
// pushes tasks/courses/semesters changes from one device to another (e.g. web
// -> phone) in near real time, instead of waiting on the ~60s staleTime /
// next-focus refetch. See supabase/migrations/047_realtime_personal_data.sql
// for the publication + REPLICA IDENTITY FULL this depends on.

// Absorbs bulk-insert bursts (syllabus import, shared-course import both
// insert many task rows in one call) into a single invalidate instead of one
// per row.
const TASKS_DEBOUNCE_MS = 200;

// Capped exponential backoff for resubscribing after CHANNEL_ERROR/TIMED_OUT —
// supabase-js v2 doesn't reliably self-heal an errored channel, so a fresh
// channel is created and subscribed rather than waiting on the socket alone.
const BACKOFF_MS = [2000, 4000, 8000, 16000, 30000];

function recordIdFrom(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): string | undefined {
  const row = (payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old) as
    | Record<string, unknown>
    | undefined;
  const id = row?.id;
  return typeof id === 'string' ? id : undefined;
}

export function subscribeToUserData(userId: string, queryClient: QueryClient): () => void {
  let stopped = false;
  let channel: ReturnType<typeof supabase.channel> | null = null;
  let backoffIndex = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let tasksDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRetryTimer = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const invalidateTasksNow = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['task'] });
    queryClient.invalidateQueries({ queryKey: ['taskStats'] });
  };

  const scheduleTasksInvalidate = () => {
    if (tasksDebounceTimer) clearTimeout(tasksDebounceTimer);
    tasksDebounceTimer = setTimeout(() => {
      tasksDebounceTimer = null;
      invalidateTasksNow();
    }, TASKS_DEBOUNCE_MS);
  };

  const handleTasksEvent = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
    const recordId = recordIdFrom(payload);
    // An unflushed local edit for this task is still in flight — let the
    // eventual flush (which invalidates the same keys on completion,
    // lib/offlineSync.ts) reconcile it instead of stomping the optimistic
    // patch with a stale pre-edit server row.
    if (recordId && hasPendingOfflineEdit('tasks', recordId)) return;
    scheduleTasksInvalidate();
  };

  const handleCoursesEvent = () => {
    queryClient.invalidateQueries({ queryKey: ['courses'] });
    queryClient.invalidateQueries({ queryKey: ['course'] });
  };

  const handleSemestersEvent = () => {
    queryClient.invalidateQueries({ queryKey: ['semesters'] });
  };

  const connect = () => {
    if (stopped) return;
    channel = supabase
      .channel(`personal:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` },
        handleTasksEvent,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'courses', filter: `user_id=eq.${userId}` },
        handleCoursesEvent,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'semesters', filter: `user_id=eq.${userId}` },
        handleSemestersEvent,
      )
      .subscribe((status) => {
        if (stopped) return;
        if (status === 'SUBSCRIBED') {
          backoffIndex = 0;
          clearRetryTimer();
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          if (channel) supabase.removeChannel(channel);
          channel = null;
          clearRetryTimer();
          const delay = BACKOFF_MS[Math.min(backoffIndex, BACKOFF_MS.length - 1)];
          backoffIndex++;
          retryTimer = setTimeout(connect, delay);
        }
      });
  };

  connect();

  return () => {
    stopped = true;
    clearRetryTimer();
    if (tasksDebounceTimer) clearTimeout(tasksDebounceTimer);
    if (channel) supabase.removeChannel(channel);
  };
}
