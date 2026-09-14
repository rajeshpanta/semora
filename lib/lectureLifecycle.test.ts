/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/lectureLifecycle.test.ts
 *
 * The first test is the reproduction Phase 0 Step 2 asks for. It is a faithful
 * transcription of the ordering in lib/lectureRecorder.ts as shipped, and it
 * asserts the loss rather than the fix, so it documents the defect instead of
 * hiding it. Everything after it drives the extracted controller and asserts the
 * behaviour Phase 1 Step 3 requires.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createCaptureLifecycle, LifecycleError, type LifecycleHost } from './lectureLifecycle.ts';

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

// ─── the defect, as shipped ────────────────────────────────────────────────

/**
 * lib/lectureRecorder.ts today, reduced to the ordering that matters:
 *
 *   rotateSegment: if (rotatingRef.current) return;   // no await
 *   stop:          await rotateSegment(...)           // resolves instantly
 *                  finishLecture({ segmentCount: seqRef.current })
 *                  lectureIdRef.current = null        // rotation still running
 *
 * The rotation then persists with `lectureIdRef.current!`, which is null.
 */
function legacyRecorder(gateStop: Promise<void>) {
  let lectureIdRef: string | null = null;
  let seqRef = 0;
  let rotatingRef = false;
  const persisted: { lectureId: string | null; seq: number }[] = [];
  const uploaded: number[] = [];
  let declaredCount: number | null = null;

  async function rotateSegment() {
    if (rotatingRef) return;          // <- the early return, no await
    rotatingRef = true;
    try {
      await gateStop;                 // the native stop + finalize, held open
      persisted.push({ lectureId: lectureIdRef, seq: seqRef });
      if (lectureIdRef === null) return;   // enqueueUpload's own early return
      uploaded.push(seqRef);
      seqRef = seqRef + 1;
    } finally {
      rotatingRef = false;
    }
  }

  return {
    start(id: string) { lectureIdRef = id; seqRef = 0; },
    rotateSegment,
    async stop() {
      await rotateSegment();          // instant when a rotation is in flight
      declaredCount = seqRef;
      lectureIdRef = null;
    },
    get persisted() { return persisted; },
    get uploaded() { return uploaded; },
    get declaredCount() { return declaredCount; },
  };
}

Deno.test('REPRODUCTION: Stop during a rotation orphans the part and under-declares', async () => {
  const gate = deferred();
  const rec = legacyRecorder(gate.promise);
  rec.start('lecture-1');

  const rotation = rec.rotateSegment();   // the five-minute timer fires
  await rec.stop();                       // the student taps Stop
  gate.resolve();                         // the native finalize completes
  await rotation;

  // The file is written under a null lecture: this is `lectures/null/`.
  assertEquals(rec.persisted, [{ lectureId: null, seq: 0 }]);
  // Nothing was uploaded, so the part gets no server row at all.
  assertEquals(rec.uploaded, []);
  // And the lecture was declared with one part fewer than were captured.
  assertEquals(rec.declaredCount, 0);
});

// ─── the extracted controller ──────────────────────────────────────────────

function fakeHost(overrides: Partial<LifecycleHost> = {}) {
  const calls = {
    persisted: [] as { lectureId: string; seq: number }[],
    committed: [] as { lectureId: string; seq: number }[],
    declared: [] as { lectureId: string; count: number; seconds: number }[],
    started: 0,
    released: 0,
  };
  let uri: string | null = 'cache://chunk';
  const host: LifecycleHost = {
    async stopRecorder() { uri = null; },
    currentCacheUri() { return uri; },
    async finalizedSize() { return 1024; },
    elapsedSeconds() { return 300; },
    async persist(lectureId, seq) {
      calls.persisted.push({ lectureId, seq });
      return `${lectureId}/seg_${String(seq).padStart(3, '0')}.m4a`;
    },
    async commit(part) { calls.committed.push({ lectureId: part.lectureId, seq: part.seq }); },
    async startRecorder() { calls.started += 1; uri = 'cache://chunk'; },
    async releaseSession() { calls.released += 1; },
    async declare(lectureId, count, seconds) { calls.declared.push({ lectureId, count, seconds }); },
    ...overrides,
  };
  return { host, calls, setUri: (v: string | null) => { uri = v; } };
}

Deno.test('Stop waits for the rotation already running', async () => {
  const gate = deferred();
  const { host, calls } = fakeHost({
    async stopRecorder() { await gate.promise; },
  });
  const life = createCaptureLifecycle(host);
  await life.start('lecture-1');

  const rotation = life.rotate({ resume: true });   // the timer fires
  const stopping = life.stop();                     // the student taps Stop
  gate.resolve();
  await rotation;
  const outcome = await stopping;

  // The in-flight part kept its owner.
  assertEquals(calls.persisted, [{ lectureId: 'lecture-1', seq: 0 }]);
  assertEquals(calls.committed, [{ lectureId: 'lecture-1', seq: 0 }]);
  assert(outcome.kind === 'saved_locally');
  // And it is counted.
  assertEquals(outcome.segmentCount, 1);
  assertEquals(calls.declared, [{ lectureId: 'lecture-1', count: 1, seconds: 300 }]);
});

Deno.test('a rotation queued behind Stop does not restart the microphone', async () => {
  const { host, calls } = fakeHost();
  const life = createCaptureLifecycle(host);
  await life.start('lecture-1');
  const startsAfterBegin = calls.started;

  const stopping = life.stop();
  const late = life.rotate({ resume: true });
  await stopping;
  await late;

  assertEquals(calls.started, startsAfterBegin);
  assertEquals(life.state, 'saved_locally');
});

Deno.test('identity survives until the last part is committed', async () => {
  const seen: (string | null)[] = [];
  const { host } = fakeHost({
    async persist(lectureId, seq) { seen.push(lectureId); return `${lectureId}/${seq}`; },
  });
  const life = createCaptureLifecycle(host);
  await life.start('lecture-1');
  await life.rotate({ resume: true });
  await life.stop();

  assertEquals(seen, ['lecture-1', 'lecture-1']);
  assertEquals(life.lectureId, null);   // cleared only after the last commit
});

Deno.test('repeated Stop taps are idempotent', async () => {
  const { host, calls } = fakeHost();
  const life = createCaptureLifecycle(host);
  await life.start('lecture-1');

  const first = await life.stop();
  const second = await life.stop();

  assertEquals(calls.declared.length, 1);
  assertEquals(calls.committed.length, 1);
  assert(first.kind === 'saved_locally');
  // The second tap reports the same result rather than declaring again.
  assertEquals(second, first);
});

Deno.test('Resume does not restart the microphone when Stop arrived while it waited', async () => {
  const gate = deferred();
  let stops = 0;
  const { host, calls } = fakeHost({
    async stopRecorder() { stops += 1; if (stops === 1) await gate.promise; },
  });
  const life = createCaptureLifecycle(host);
  await life.start('lecture-1');
  const startsAfterBegin = calls.started;

  const pausing = life.pause();     // holds the chain open
  const resuming = life.resume();   // queued behind it
  const stopping = life.stop();     // arrives while Resume is still queued
  gate.resolve();
  await pausing;
  await resuming;
  await stopping;

  assertEquals(calls.started, startsAfterBegin);
});

// The shipped code lets a new recording begin while an old rotation is still
// awaiting the native stop, which is how a chunk ends up filed under whichever
// lecture happens to be current when it lands. Serialising removes the
// interleaving entirely: the rotation finishes against its own lecture, and the
// new recording starts clean behind it.
Deno.test('a rotation still running keeps its own lecture when a new one starts', async () => {
  const gate = deferred();
  let stops = 0;
  const { host, calls } = fakeHost({
    async stopRecorder() { stops += 1; if (stops === 1) await gate.promise; },
  });
  const life = createCaptureLifecycle(host);
  await life.start('lecture-1');

  const stale = life.rotate({ resume: false });   // still awaiting the native stop
  const restarting = life.start('lecture-2');     // queued behind it, not racing it
  gate.resolve();
  await stale;
  await restarting;

  // The in-flight chunk was filed against the lecture that recorded it.
  assertEquals(calls.persisted, [{ lectureId: 'lecture-1', seq: 0 }]);
  // And the new recording begins at zero under its own identity.
  assertEquals(life.lectureId, 'lecture-2');
  assertEquals(life.seq, 0);
  assertEquals(life.generation, 2);
});

Deno.test('a finalisation that produced no bytes is reported, not saved', async () => {
  const { host, calls } = fakeHost({ async finalizedSize() { return 0; } });
  const life = createCaptureLifecycle(host);
  await life.start('lecture-1');

  const outcome = await life.stop();

  assert(outcome.kind === 'needs_recovery');
  assertEquals(outcome.reason, 'capture_finalize');
  assertEquals(calls.declared, []);
  // The owner is kept so the queue has something to retry under.
  assertEquals(life.lectureId, 'lecture-1');
});

Deno.test('LifecycleError names the stage it failed at', () => {
  const err = new LifecycleError('capture_finalize', 'no bytes');
  assertEquals(err.stage, 'capture_finalize');
  assertEquals(err.name, 'LifecycleError');
});
