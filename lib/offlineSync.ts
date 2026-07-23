import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { onlineManager, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const QUEUE_KEY = 'semora.offline.queue.v1';
const CONFLICTS_KEY = 'semora.offline.conflicts.v1';
const META_KEY = 'semora.offline.meta.v1';

export type OfflineEntity = 'tasks' | 'task_subtasks';
export type OfflineOperation = 'update';

export interface OfflineMutation {
  id: string;
  userId: string;
  entity: OfflineEntity;
  operation: OfflineOperation;
  recordId: string;
  payload: Record<string, unknown>;
  baseUpdatedAt: string | null;
  createdAt: string;
}

export interface SyncConflict extends OfflineMutation {
  serverRecord: Record<string, unknown>;
  detectedAt: string;
}

export interface OfflineSyncSnapshot {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  conflictCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const listeners = new Set<() => void>();
let snapshot: OfflineSyncSnapshot = {
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  conflictCount: 0,
  lastSyncedAt: null,
  lastError: null,
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
  emit({
    pendingCount: queue.length,
    conflictCount: conflicts.length,
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
    };
  } else {
    queue.push(item);
  }
  await writeArray(QUEUE_KEY, queue);
  emit({ pendingCount: queue.length, lastError: null });
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

export function flushOfflineQueue(userId: string, queryClient: QueryClient): Promise<void> {
  if (activeFlush) return activeFlush;
  if (!snapshot.isOnline) return Promise.resolve();

  activeFlush = (async () => {
    emit({ isSyncing: true, lastError: null });
    const queue = await readArray<OfflineMutation>(QUEUE_KEY);
    const remaining: OfflineMutation[] = [];
    const conflicts = await readArray<SyncConflict>(CONFLICTS_KEY);
    let stoppedByNetwork = false;

    for (const item of queue) {
      if (item.userId !== userId) {
        remaining.push(item);
        continue;
      }
      if (stoppedByNetwork) {
        remaining.push(item);
        continue;
      }
      try {
        const result = await performMutation(item);
        if (result !== 'synced') conflicts.push(result);
      } catch (error) {
        remaining.push(item);
        if (isNetworkFailure(error)) {
          stoppedByNetwork = true;
          emit({ isOnline: false });
        } else {
          emit({ lastError: error instanceof Error ? error.message : 'An offline edit could not sync.' });
        }
      }
    }

    await Promise.all([
      writeArray(QUEUE_KEY, remaining),
      writeArray(CONFLICTS_KEY, conflicts),
    ]);
    const lastSyncedAt = stoppedByNetwork ? snapshot.lastSyncedAt : new Date().toISOString();
    await saveMeta(lastSyncedAt);
    emit({
      pendingCount: remaining.length,
      conflictCount: conflicts.length,
      lastSyncedAt,
    });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['task'] });
    queryClient.invalidateQueries({ queryKey: ['taskSubtasks'] });
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
}

export async function clearOfflineUserState(userId?: string | null) {
  if (!userId) {
    await Promise.all([
      AsyncStorage.removeItem(QUEUE_KEY),
      AsyncStorage.removeItem(CONFLICTS_KEY),
      AsyncStorage.removeItem(META_KEY),
    ]);
    emit({ pendingCount: 0, conflictCount: 0, lastSyncedAt: null, lastError: null });
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
  emit({ pendingCount: remainingQueue.length, conflictCount: remainingConflicts.length });
}
