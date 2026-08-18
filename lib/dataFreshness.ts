import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { QueryClient } from '@tanstack/react-query';

/**
 * When did this device last successfully READ data from the server?
 *
 * The app can run for a long time on cached data — the query cache persists for
 * seven days by design, so screens stay populated with no connection at all.
 * That is the right behaviour and it has one failure mode: nothing on screen
 * distinguishes data fetched thirty seconds ago from data fetched last Tuesday.
 * A student looking at a deadline list has no way to know whether it reflects
 * the change their professor posted this morning.
 *
 * offlineSync already tracks lastSyncedAt, but that is the OUTBOUND queue —
 * when this device last pushed its own edits. It says nothing about whether
 * what you are reading is current, and it stays null for a user who has never
 * made an offline edit.
 *
 * This is deliberately a timestamp of the last SUCCESSFUL server fetch, written
 * from the query cache itself so it cannot drift from what actually happened.
 */

const KEY = 'semora_last_server_read';

let lastReadAt: number | null = null;
const listeners = new Set<(v: number | null) => void>();

function emit() {
  for (const l of listeners) l(lastReadAt);
}

/** Restore the previous session's value so the first render is not blank. */
export async function loadLastServerRead(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const n = raw ? Number(raw) : NaN;
    if (Number.isFinite(n)) {
      lastReadAt = n;
      emit();
    }
  } catch {
    // A missing or unreadable value simply means "unknown", which the UI
    // already handles — never let this break startup.
  }
}

/**
 * Record a successful server read.
 *
 * Throttled to one write a minute: a screen with a dozen queries would
 * otherwise hammer AsyncStorage on every refetch for a value whose whole
 * purpose is to be read at minute-or-coarser resolution.
 */
let lastPersistedAt = 0;
export function markServerRead(at: number = Date.now()) {
  lastReadAt = at;
  emit();
  if (at - lastPersistedAt < 60_000) return;
  lastPersistedAt = at;
  AsyncStorage.setItem(KEY, String(at)).catch(() => {});
}

/**
 * Subscribe to the query cache and stamp every successful fetch.
 *
 * Hooked at the cache rather than per-query on purpose: a per-query callback is
 * something the next new query has to remember to add, and the one that forgets
 * is invisible. This cannot be forgotten.
 */
export function trackServerReads(queryClient: QueryClient): () => void {
  return queryClient.getQueryCache().subscribe((event) => {
    // 'updated' with a success status and a fetch that actually finished is the
    // narrowest signal for "bytes arrived from the server". Cache hits and
    // optimistic writes do not qualify — counting those would report data as
    // fresh precisely when it is not.
    const q: any = (event as any)?.query;
    if ((event as any)?.type !== 'updated') return;
    if (q?.state?.status !== 'success') return;
    if (q?.state?.fetchStatus !== 'idle') return;
    if (!q?.state?.dataUpdatedAt) return;
    markServerRead(q.state.dataUpdatedAt);
  });
}

/** The last successful server read, or null if this device has never had one. */
export function getLastServerRead(): number | null {
  return lastReadAt;
}

/**
 * Live-updating view of the same value.
 *
 * Re-renders on a timer as well as on change, so "5 minutes ago" becomes
 * "6 minutes ago" without anything else having to happen — a staleness label
 * that only updates when data arrives is exactly backwards.
 */
export function useLastServerRead(): number | null {
  const [value, setValue] = useState<number | null>(lastReadAt);
  useEffect(() => {
    listeners.add(setValue);
    const t = setInterval(() => setValue(lastReadAt), 30_000);
    return () => {
      listeners.delete(setValue);
      clearInterval(t);
    };
  }, []);
  return value;
}

/** Old enough that a student should be told, rather than left to assume. */
export const STALE_AFTER_MS = 15 * 60 * 1000;

export function isStale(at: number | null, now: number = Date.now()): boolean {
  return at === null || now - at > STALE_AFTER_MS;
}
