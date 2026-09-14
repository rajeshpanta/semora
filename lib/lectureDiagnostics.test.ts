/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/lectureDiagnostics.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  DIAGNOSTIC_KEY,
  DIAGNOSTIC_TTL_MS,
  MAX_DIAGNOSTICS,
  flushDiagnostics,
  readDiagnostics,
  recordDiagnostic,
  type DiagnosticStorage,
  type LectureDiagnostic,
} from './lectureDiagnostics.ts';

function memory(initial: string | null = null): DiagnosticStorage & { value: string | null } {
  const box = {
    value: initial,
    read: (_key: string) => box.value,
    write: (_key: string, v: string) => { box.value = v; },
  };
  return box;
}

function entry(at: number, seq = 0, code = 'NETWORK_UNAVAILABLE'): LectureDiagnostic {
  return {
    at, seq, code,
    event: 'lecture_segment_upload_failed',
    stage: 'transfer',
    retry: 'retry',
    attempt: 1,
  };
}

Deno.test('a failure survives being written with nothing to send it to', () => {
  const store = memory();
  recordDiagnostic(store, entry(1_000), 1_000);
  assertEquals(readDiagnostics(store, 1_000).length, 1);
  assertEquals(readDiagnostics(store, 1_000)[0].code, 'NETWORK_UNAVAILABLE');
});

Deno.test('the buffer is bounded and keeps the newest', () => {
  const store = memory();
  for (let i = 0; i < MAX_DIAGNOSTICS + 12; i += 1) {
    recordDiagnostic(store, entry(1_000 + i, i), 1_000 + i);
  }
  const kept = readDiagnostics(store, 2_000);
  assertEquals(kept.length, MAX_DIAGNOSTICS);
  assertEquals(kept[kept.length - 1].seq, MAX_DIAGNOSTICS + 11);
});

Deno.test('stale entries fall out rather than being sent weeks later', () => {
  const store = memory();
  const now = 1_000_000_000;
  recordDiagnostic(store, entry(now - DIAGNOSTIC_TTL_MS - 1), now);
  recordDiagnostic(store, entry(now - 1_000, 4), now);
  const kept = readDiagnostics(store, now);
  assertEquals(kept.length, 1);
  assertEquals(kept[0].seq, 4);
});

Deno.test('a flush that cannot send keeps everything', async () => {
  const store = memory();
  recordDiagnostic(store, entry(1_000, 0), 1_000);
  recordDiagnostic(store, entry(1_001, 1), 1_001);
  const result = await flushDiagnostics(store, async () => false, 2_000);
  assertEquals(result, { sent: 0, kept: 2 });
  assertEquals(readDiagnostics(store, 2_000).length, 2);
});

Deno.test('a flush that succeeds clears what it sent', async () => {
  const store = memory();
  recordDiagnostic(store, entry(1_000, 0), 1_000);
  recordDiagnostic(store, entry(1_001, 1), 1_001);
  const sentOrder: number[] = [];
  const result = await flushDiagnostics(store, async (e) => { sentOrder.push(e.seq); return true; }, 2_000);
  assertEquals(result, { sent: 2, kept: 0 });
  // Oldest first, so the timeline reads correctly at the other end.
  assertEquals(sentOrder, [0, 1]);
  assertEquals(readDiagnostics(store, 2_000), []);
});

Deno.test('a partial flush keeps only what did not go', async () => {
  const store = memory();
  recordDiagnostic(store, entry(1_000, 0), 1_000);
  recordDiagnostic(store, entry(1_001, 1), 1_001);
  recordDiagnostic(store, entry(1_002, 2), 1_002);
  const result = await flushDiagnostics(store, async (e) => e.seq !== 1, 2_000);
  assertEquals(result, { sent: 2, kept: 1 });
  assertEquals(readDiagnostics(store, 2_000).map((e) => e.seq), [1]);
});

Deno.test('a send that throws is a send that did not happen', async () => {
  const store = memory();
  recordDiagnostic(store, entry(1_000, 0), 1_000);
  const result = await flushDiagnostics(store, async () => { throw new Error('offline'); }, 2_000);
  assertEquals(result, { sent: 0, kept: 1 });
});

Deno.test('a truncated buffer is discarded, not thrown', () => {
  const store = memory('[{"at":1000,"event":"x","cod');
  assertEquals(readDiagnostics(store, 2_000), []);
  recordDiagnostic(store, entry(2_000), 2_000);
  assertEquals(readDiagnostics(store, 2_000).length, 1);
});

Deno.test('entries missing the fields that identify them are dropped', () => {
  const store = memory(JSON.stringify([{ at: 1_000 }, null, 'nope', entry(1_001, 3)]));
  const kept = readDiagnostics(store, 2_000);
  assertEquals(kept.length, 1);
  assertEquals(kept[0].seq, 3);
});

Deno.test('it stores under one known key', () => {
  const store = memory();
  let usedKey = '';
  recordDiagnostic({ read: () => null, write: (k) => { usedKey = k; } }, entry(1_000), 1_000);
  assertEquals(usedKey, DIAGNOSTIC_KEY);
  // A colon here would be rejected by expo-secure-store's key rule and the
  // write would be swallowed, which is how two other keys silently stored
  // nothing for weeks. See lib/deviceStore.ts.
  assertEquals(/^[\w.-]+$/.test(DIAGNOSTIC_KEY), true);
  assertEquals(store.value, null);
});
