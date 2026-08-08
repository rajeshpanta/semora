import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { rescheduleAllTaskReminders } from '@/lib/notifications';

const QUEUE_KEY = 'semora.offline.queue.v1';
const CONFLICTS_KEY = 'semora.offline.conflicts.v1';
const META_KEY = 'semora.offline.meta.v1';

// Tables whose UPDATES can be replayed from the queue. performMutation is
// entity-agnostic — it reads/writes `.from(item.entity)` and detects conflicts
// on updated_at — so widening this list is all that is needed, provided the
// table is user-owned (has user_id) and carries updated_at.
//
// Inserts and deletes are deliberately still absent: an offline insert needs a
// client-generated id and an ordering guarantee against later edits, which is a
// different problem from replaying an update.
export type OfflineEntity =
  | 'tasks'
  | 'task_subtasks'
  | 'courses'
  | 'semesters'
  | 'grade_categories';
export type OfflineOperation = 'update';

// A queued mutation that fails transiently (offline/timeout/5xx) is retried with
// exponential backoff up to MAX_RETRY_ATTEMPTS. After that — or on a permanent
// failure (RLS/constraint/validation) — it is parked in a `failed` state that the
// auto-flush effect deliberately skips, so a poison-pill edit can never hammer
// Supabase in a tight loop.
const MAX_RETRY_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 5_000; // 5s, 10s, 20s, 40s, 80s, 160s

export interface OfflineMutation {
  id: string;
  userId: string;
  entity: OfflineEntity;
  operation: OfflineOperation;
  recordId: string;
  payload: Record<string, unknown>;
  baseUpdatedAt: string | null;
  createdAt: string;
  // Retry bookkeeping. Absent on freshly-enqueued items (treated as 0 / null).
  attempts?: number;
  nextRetryAt?: string | null; // ISO; transient backoff gate, don't flush before this
  failedPermanently?: boolean; // parked: never auto-flushed, needs manual retry
  lastError?: string | null;
}

export interface SyncConflict extends OfflineMutation {
  serverRecord: Record<string, unknown>;
  detectedAt: string;
}

export interface OfflineSyncSnapshot {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number; // items still eligible to sync (excludes permanently-failed)
  conflictCount: number;
  failedCount: number; // parked items that will not auto-retry
  lastSyncedAt: string | null;
  lastError: string | null;
  // Earliest ISO time an eligible item may retry, if all remaining items are in
  // backoff. Lets the auto-flush effect schedule a single wake-up instead of spinning.
  nextRetryAt: string | null;
}

// Mirrors the queue's pending (non-parked) entries as `${entity}:${recordId}`
// keys, so a realtime handler can synchronously check "is there an unflushed
// local edit for this record?" before applying an externally-sourced change —
// without an extra AsyncStorage round trip on every incoming event. Rebuilt at
// every point the queue itself is read or written; never mutated directly.
const pendingEditIndex = new Set<string>();

function rebuildPendingEditIndex(queue: OfflineMutation[]) {
  pendingEditIndex.clear();
  for (const item of queue) {
    if (item.failedPermanently) continue; // parked — will never auto-flush, so it must not block other devices' changes forever
    pendingEditIndex.add(`${item.entity}:${item.recordId}`);
  }
}

/** Is there an unflushed local edit for this record? Realtime handlers should
 * skip applying an incoming change when this is true and let the eventual
 * flush (which already invalidates the right query keys on completion)
 * reconcile it instead — otherwise a stale refetch can visually stomp a
 * pending optimistic edit before it's had a chance to reach the server. */
export function hasPendingOfflineEdit(entity: OfflineEntity, recordId: string): boolean {
  return pendingEditIndex.has(`${entity}:${recordId}`);
}

const listeners = new Set<() => void>();
let snapshot: OfflineSyncSnapshot = {
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  conflictCount: 0,
  failedCount: 0,
  lastSyncedAt: null,
  lastError: null,
  nextRetryAt: null,
};
let initialized = false;
let activeFlush: Promise<void> | null = null;

function emit(patch: Partial<OfflineSyncSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

async function readArray<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeArray<T>(key: string, rows: T[]) {
  await AsyncStorage.setItem(key, JSON.stringify(rows));
}

// Derive the counts the UI cares about from the raw queue: pending = eligible to
// sync (not permanently parked), failed = parked, nextRetryAt = soonest a pending
// item may retry when every pending item is currently in backoff.
function deriveQueueCounts(queue: OfflineMutation[]) {
  let pendingCount = 0;
  let failedCount = 0;
  let soonestBackoff: number | null = null;
  let anyReadyNow = false;
  const now = Date.now();
  for (const item of queue) {
    if (item.failedPermanently) {
      failedCount++;
      continue;
    }
    pendingCount++;
    const gate = item.nextRetryAt ? Date.parse(item.nextRetryAt) : 0;
    if (gate > now) {
      if (soonestBackoff === null || gate < soonestBackoff) soonestBackoff = gate;
    } else {
      anyReadyNow = true;
    }
  }
  return {
    pendingCount,
    failedCount,
    // Only surface a wake-up time when nothing is ready this instant.
    nextRetryAt: !anyReadyNow && soonestBackoff !== null ? new Date(soonestBackoff).toISOString() : null,
  };
}

async function loadCounts() {
  const [queue, conflicts] = await Promise.all([
    readArray<OfflineMutation>(QUEUE_KEY),
    readArray<SyncConflict>(CONFLICTS_KEY),
  ]);
  let meta: any = null;
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    meta = raw ? JSON.parse(raw) : null;
  } catch {}
  const counts = deriveQueueCounts(queue);
  rebuildPendingEditIndex(queue);
  emit({
    pendingCount: counts.pendingCount,
    failedCount: counts.failedCount,
    conflictCount: conflicts.length,
    nextRetryAt: counts.nextRetryAt,
    lastSyncedAt: typeof meta?.lastSyncedAt === 'string' ? meta.lastSyncedAt : null,
  });
}

export function initializeOfflineSync() {
  if (initialized) return () => {};
  initialized = true;
  loadCounts().catch(() => {});
  const unsubscribe = NetInfo.addEventListener((state) => {
    const online = !!state.isConnected && state.isInternetReachable !== false;
    onlineManager.setOnline(online);
    emit({ isOnline: online });
  });
  return () => {
    unsubscribe();
    initialized = false;
  };
}

export function subscribeOfflineSync(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOfflineSyncSnapshot() {
  return snapshot;
}

export function isDeviceOnline() {
  return snapshot.isOnline;
}

export function isNetworkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /network request failed|failed to fetch|internet connection|offline|load failed|timed? ?out/i.test(message);
}

// A permanent failure will never succeed by retrying the same payload: RLS denial,
// constraint/validation/type errors, or a 4xx from PostgREST. These get parked
// instead of retried so they can't become a poison pill. Anything else (5xx,
// unknown) is treated as transient and retried with backoff.
export function isPermanentFailure(error: unknown): boolean {
  const err = error as { code?: unknown; status?: unknown; message?: unknown } | null;
  const code = typeof err?.code === 'string' ? err.code : '';
  // PostgREST/Postgres SQLSTATE classes that a retry can't fix:
  //  42501 = RLS/insufficient privilege · 23xxx = integrity constraint violations
  //  22xxx = data exceptions (invalid text/number/date) · 428C9/2BP01 = generated/dependent
  //  P0001 = raise_exception from a trigger (e.g. free-tier limits)
  if (/^(42501|23\d{3}|22\d{3}|428C9|2BP01|P0001)$/.test(code)) return true;
  // PostgREST maps a bad request to HTTP 400/401/403/404/409/422 with a numeric-string code.
  const status = typeof err?.status === 'number' ? err.status : Number(code);
  if (Number.isFinite(status) && status >= 400 && status < 500 && status !== 408 && status !== 429) return true;
  const message = typeof err?.message === 'string' ? err.message : '';
  return /violates|constraint|permission denied|not-null|invalid input|row-level security/i.test(message);
}

export async function enqueueOfflineMutation(
  input: Omit<OfflineMutation, 'id' | 'createdAt'>,
): Promise<OfflineMutation> {
  const item: OfflineMutation = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
  };
  const queue = await readArray<OfflineMutation>(QUEUE_KEY);

  // Multiple edits to the same record while offline become one latest patch.
  // Preserve the earliest base timestamp so conflict detection still compares
  // against the server version the student originally saw.
  const existingIndex = queue.findIndex(
    (row) =>
      row.userId === item.userId &&
      row.entity === item.entity &&
      row.recordId === item.recordId &&
      row.operation === item.operation,
  );
  if (existingIndex >= 0) {
    const existing = queue[existingIndex];
    queue[existingIndex] = {
      ...existing,
      payload: { ...existing.payload, ...item.payload },
      createdAt: item.createdAt,
      // A fresh user edit supersedes the old payload, so give it a clean slate:
      // clear any prior failure/backoff so it is retried immediately.
      attempts: 0,
      nextRetryAt: null,
      failedPermanently: false,
      lastError: null,
    };
  } else {
    queue.push(item);
  }
  await writeArray(QUEUE_KEY, queue);
  const counts = deriveQueueCounts(queue);
  rebuildPendingEditIndex(queue);
  emit({ pendingCount: counts.pendingCount, failedCount: counts.failedCount, nextRetryAt: counts.nextRetryAt, lastError: null });
  return item;
}

export async function listSyncConflicts(userId: string): Promise<SyncConflict[]> {
  const conflicts = await readArray<SyncConflict>(CONFLICTS_KEY);
  return conflicts.filter((row) => row.userId === userId);
}

async function saveMeta(lastSyncedAt: string | null) {
  await AsyncStorage.setItem(META_KEY, JSON.stringify({ lastSyncedAt }));
}

async function performMutation(item: OfflineMutation): Promise<'synced' | SyncConflict> {
  const { data: server, error: readError } = await supabase
    .from(item.entity)
    .select('*')
    .eq('id', item.recordId)
    .eq('user_id', item.userId)
    .maybeSingle();
  if (readError) throw readError;

  // A remote deletion is a conflict rather than an implicit resurrection.
  if (!server) {
    return {
      ...item,
      serverRecord: {},
      detectedAt: new Date().toISOString(),
    };
  }
  if (
    item.baseUpdatedAt &&
    typeof server.updated_at === 'string' &&
    server.updated_at !== item.baseUpdatedAt
  ) {
    return {
      ...item,
      serverRecord: server,
      detectedAt: new Date().toISOString(),
    };
  }

  let query = supabase
    .from(item.entity)
    .update(item.payload)
    .eq('id', item.recordId)
    .eq('user_id', item.userId);
  if (item.baseUpdatedAt) query = query.eq('updated_at', item.baseUpdatedAt);
  const { data: updated, error } = await query.select('id').maybeSingle();
  if (error) throw error;
  if (!updated) {
    const { data: latest } = await supabase
      .from(item.entity)
      .select('*')
      .eq('id', item.recordId)
      .eq('user_id', item.userId)
      .maybeSingle();
    return {
      ...item,
      serverRecord: latest ?? {},
      detectedAt: new Date().toISOString(),
    };
  }
  return 'synced';
}

// `force` (from an explicit "Try sync now" tap) re-attempts items that are in
// backoff or permanently parked; the automatic flush leaves those alone.
export function flushOfflineQueue(
  userId: string,
  queryClient: QueryClient,
  options?: { force?: boolean },
): Promise<void> {
  if (activeFlush) {
    // A forced "Try sync now" tap must not be coalesced into an in-flight
    // (possibly non-forced) auto-flush — that would drop force:true and leave
    // parked/backoff items un-retried. Run a forced pass after the current one
    // settles instead.
    if (options?.force !== true) return activeFlush;
    return activeFlush.catch(() => {}).then(() => flushOfflineQueue(userId, queryClient, { force: true }));
  }
  if (!snapshot.isOnline) return Promise.resolve();
  const force = options?.force === true;

  activeFlush = (async () => {
    emit({ isSyncing: true, lastError: null });
    const queue = await readArray<OfflineMutation>(QUEUE_KEY);
    const remaining: OfflineMutation[] = [];
    const conflicts = await readArray<SyncConflict>(CONFLICTS_KEY);
    let stoppedByNetwork = false;
    let syncedTaskChanges = 0;
    let permanentError: string | null = null;
    const now = Date.now();

    for (const item of queue) {
      if (item.userId !== userId) {
        remaining.push(item);
        continue;
      }
      // Automatic flushes skip parked (permanently-failed) items and anything
      // still inside its backoff window; a forced flush ignores both gates.
      if (!force) {
        if (item.failedPermanently) {
          remaining.push(item);
          continue;
        }
        if (item.nextRetryAt && Date.parse(item.nextRetryAt) > now) {
          remaining.push(item);
          continue;
        }
      }
      if (stoppedByNetwork) {
        remaining.push(item);
        continue;
      }
      try {
        const result = await performMutation(item);
        if (result !== 'synced') conflicts.push(result);
        else if (item.entity === 'tasks') syncedTaskChanges++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'An offline edit could not sync.';
        if (isNetworkFailure(error)) {
          // Network dropped mid-flush: leave the item untouched (no attempt
          // counted) and stop; the rest will retry when we're back online.
          remaining.push(item);
          stoppedByNetwork = true;
          emit({ isOnline: false });
        } else if (isPermanentFailure(error)) {
          // A retry can't fix this — park it so it never auto-flushes again.
          remaining.push({ ...item, failedPermanently: true, nextRetryAt: null, lastError: message });
          permanentError = message;
        } else {
          // Transient (5xx/unknown): count the attempt and back off exponentially.
          const attempts = (item.attempts ?? 0) + 1;
          if (attempts >= MAX_RETRY_ATTEMPTS) {
            // Exhausted retries — treat like a permanent failure from here on.
            remaining.push({ ...item, attempts, failedPermanently: true, nextRetryAt: null, lastError: message });
            permanentError = message;
          } else {
            const delay = BASE_BACKOFF_MS * 2 ** (attempts - 1);
            remaining.push({ ...item, attempts, nextRetryAt: new Date(now + delay).toISOString(), lastError: message });
          }
        }
      }
    }

    await Promise.all([
      writeArray(QUEUE_KEY, remaining),
      writeArray(CONFLICTS_KEY, conflicts),
    ]);
    rebuildPendingEditIndex(remaining);
    const lastSyncedAt = stoppedByNetwork ? snapshot.lastSyncedAt : new Date().toISOString();
    await saveMeta(lastSyncedAt);
    const counts = deriveQueueCounts(remaining);
    emit({
      pendingCount: counts.pendingCount,
      failedCount: counts.failedCount,
      conflictCount: conflicts.length,
      nextRetryAt: counts.nextRetryAt,
      lastSyncedAt,
      // Surface a permanent failure once so the user/sync-status knows, rather
      // than looping silently. Transient backoff is reflected via nextRetryAt.
      lastError: permanentError,
    });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['task'] });
    queryClient.invalidateQueries({ queryKey: ['taskSubtasks'] });
    if (syncedTaskChanges > 0) {
      // Rebuild local delivery state after queued edits. This also discovers
      // the next occurrence created by the recurring-task database trigger.
      rescheduleAllTaskReminders(userId).catch(() => {});
    }
  })()
    .finally(() => {
      activeFlush = null;
      emit({ isSyncing: false });
    });
  return activeFlush;
}

export async function resolveSyncConflict(
  conflictId: string,
  resolution: 'keep_local' | 'use_cloud',
  queryClient: QueryClient,
) {
  const conflicts = await readArray<SyncConflict>(CONFLICTS_KEY);
  const conflict = conflicts.find((row) => row.id === conflictId);
  if (!conflict) return;
  if (resolution === 'keep_local') {
    if (!conflict.serverRecord.id) {
      throw new Error('This item was deleted on another device. Choose the cloud version to dismiss the local edit.');
    }
    const { error } = await supabase
      .from(conflict.entity)
      .update(conflict.payload)
      .eq('id', conflict.recordId)
      .eq('user_id', conflict.userId);
    if (error) throw error;
  }
  const next = conflicts.filter((row) => row.id !== conflictId);
  await writeArray(CONFLICTS_KEY, next);
  emit({ conflictCount: next.length });
  queryClient.invalidateQueries({ queryKey: ['tasks'] });
  queryClient.invalidateQueries({ queryKey: ['task'] });
  queryClient.invalidateQueries({ queryKey: ['taskSubtasks'] });
  if (conflict.entity === 'tasks') {
    rescheduleAllTaskReminders(conflict.userId).catch(() => {});
  }
}

export async function clearOfflineUserState(userId?: string | null) {
  if (!userId) {
    await Promise.all([
      AsyncStorage.removeItem(QUEUE_KEY),
      AsyncStorage.removeItem(CONFLICTS_KEY),
      AsyncStorage.removeItem(META_KEY),
    ]);
    pendingEditIndex.clear();
    emit({ pendingCount: 0, conflictCount: 0, failedCount: 0, nextRetryAt: null, lastSyncedAt: null, lastError: null });
    return;
  }
  const [queue, conflicts] = await Promise.all([
    readArray<OfflineMutation>(QUEUE_KEY),
    readArray<SyncConflict>(CONFLICTS_KEY),
  ]);
  const remainingQueue = queue.filter((row) => row.userId !== userId);
  const remainingConflicts = conflicts.filter((row) => row.userId !== userId);
  await Promise.all([
    writeArray(QUEUE_KEY, remainingQueue),
    writeArray(CONFLICTS_KEY, remainingConflicts),
  ]);
  rebuildPendingEditIndex(remainingQueue);
  const counts = deriveQueueCounts(remainingQueue);
  emit({
    pendingCount: counts.pendingCount,
    failedCount: counts.failedCount,
    nextRetryAt: counts.nextRetryAt,
    conflictCount: remainingConflicts.length,
  });
}
