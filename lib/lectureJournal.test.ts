/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/lectureJournal.test.ts
 *
 * The journal's whole job is to survive the app dying. So the filesystem here
 * can be told to fail at any single operation, and the tests kill it at every
 * boundary in turn and then ask whether a finished part is still findable.
 */
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  createJournalStore,
  eligibleParts,
  emptyJournal,
  isValidJournal,
  nextAttemptDelayMs,
  readJournal,
  reconcileWithFiles,
  upsertPart,
  withInterruptedCapture,
  withStopIntent,
  writeJournal,
  type JournalFs,
  type JournalPart,
  type LectureJournal,
} from './lectureJournal.ts';

const DIR = 'file:///docs/lectures/L1/';

function memoryFs(): JournalFs & { files: Map<string, string>; failOn?: (op: string, path: string) => boolean } {
  const files = new Map<string, string>();
  const self = {
    files,
    failOn: undefined as ((op: string, path: string) => boolean) | undefined,
    guard(op: string, path: string) {
      if (self.failOn?.(op, path)) throw new Error(`killed during ${op}`);
    },
    async readDir(path: string) {
      self.guard('readDir', path);
      const out: string[] = [];
      for (const key of files.keys()) {
        if (key.startsWith(path)) {
          const rest = key.slice(path.length);
          if (!rest.includes('/')) out.push(rest);
        }
      }
      return out;
    },
    async readText(path: string) {
      self.guard('readText', path);
      return files.get(path) ?? null;
    },
    async writeText(path: string, data: string) {
      self.guard('writeText', path);
      files.set(path, data);
    },
    async move(from: string, to: string) {
      self.guard('move', from);
      const body = files.get(from);
      if (body === undefined) throw new Error('missing');
      files.set(to, body);
      files.delete(from);
    },
    async remove(path: string) {
      self.guard('remove', path);
      files.delete(path);
    },
    async makeDir(path: string) {
      self.guard('makeDir', path);
    },
  };
  return self;
}

function part(seq: number, over: Partial<JournalPart> = {}): JournalPart {
  return {
    seq,
    relativeFilePath: `seg_${String(seq).padStart(3, '0')}.m4a`,
    duration: 300,
    hasGap: false,
    byteLength: 1024,
    contentIdentity: null,
    state: 'saved_locally',
    attemptCount: 0,
    nextAttemptAt: null,
    serverSegmentId: null,
    lastAcknowledgment: null,
    lastFailureStage: null,
    ...over,
  };
}

Deno.test('a snapshot reads back as it was written', async () => {
  const fs = memoryFs();
  const journal = upsertPart(emptyJournal('u1', 'L1'), part(0));
  const gen = await writeJournal(fs, DIR, journal, 0);
  assertEquals(gen, 1);
  const found = await readJournal(fs, DIR);
  assertEquals(found?.journal.parts.length, 1);
  assertEquals(found?.journal.ownerId, 'u1');
});

// The boundary that matters: killed after the temporary file, before the move.
Deno.test('killed before the move, the previous snapshot is still there', async () => {
  const fs = memoryFs();
  const first = upsertPart(emptyJournal('u1', 'L1'), part(0));
  const gen = await writeJournal(fs, DIR, first, 0);

  const second = upsertPart(first, part(1));
  fs.failOn = (op) => op === 'move';
  await assertRejects(() => writeJournal(fs, DIR, second, gen));
  fs.failOn = undefined;

  const found = await readJournal(fs, DIR);
  assertEquals(found?.generation, 1);
  assertEquals(found?.journal.parts.length, 1);
});

Deno.test('a truncated newest snapshot falls back to the one before it', async () => {
  const fs = memoryFs();
  const first = upsertPart(emptyJournal('u1', 'L1'), part(0));
  const gen1 = await writeJournal(fs, DIR, first, 0);
  const second = upsertPart(first, part(1));
  await writeJournal(fs, DIR, second, gen1);

  // A kill mid-write that still left a file behind.
  fs.files.set(`${DIR}journal/j_2.json`, '{"schemaVersion":1,"owner');

  const found = await readJournal(fs, DIR);
  assertEquals(found?.generation, 1);
  assertEquals(found?.journal.parts.length, 1);
});

Deno.test('the snapshot it replaced is never removed before the new one exists', async () => {
  const fs = memoryFs();
  const order: string[] = [];
  const first = upsertPart(emptyJournal('u1', 'L1'), part(0));
  const gen1 = await writeJournal(fs, DIR, first, 0);
  const gen2 = await writeJournal(fs, DIR, upsertPart(first, part(1)), gen1);

  const wrapped: JournalFs = {
    ...fs,
    async move(from, to) { order.push(`move:${to}`); return fs.move(from, to); },
    async remove(path) { order.push(`remove:${path}`); return fs.remove(path); },
  };
  await writeJournal(wrapped, DIR, upsertPart(first, part(2)), gen2);

  const firstRemove = order.findIndex((o) => o.startsWith('remove:'));
  const theMove = order.findIndex((o) => o.startsWith('move:'));
  assert(theMove < firstRemove || firstRemove === -1, 'a snapshot was removed before the replacement landed');
  // And generation 2, the one just replaced, is still readable.
  assert(fs.files.has(`${DIR}journal/j_2.json`));
});

Deno.test('a snapshot that does not verify is not committed', async () => {
  const fs = memoryFs();
  const shortWrite: JournalFs = { ...fs, async readText(path) { return path.includes('tmp_') ? 'truncated' : fs.readText(path); } };
  await assertRejects(() => writeJournal(shortWrite, DIR, emptyJournal('u1', 'L1'), 0));
  assertEquals(await readJournal(fs, DIR), null);
});

// The other crash boundary: the bytes landed, the metadata did not.
Deno.test('audio no snapshot mentions is recovered from the directory', () => {
  const journal = upsertPart(emptyJournal('u1', 'L1'), part(0));
  const reconciled = reconcileWithFiles(journal, ['seg_000.m4a', 'seg_001.m4a', 'notes.txt']);
  assertEquals(reconciled.parts.map((p) => p.seq), [0, 1]);
  const recovered = reconciled.parts[1];
  assertEquals(recovered.state, 'saved_locally');
  // Nothing is invented about it beyond what the filename says.
  assertEquals(recovered.duration, 0);
  assertEquals(recovered.contentIdentity, null);
});

Deno.test('for the lecture being recorded, unknown files are left to the recorder; vanished ones are still noticed', () => {
  const journal = upsertPart(upsertPart(emptyJournal('u1', 'L1'), part(0)), part(1));
  // seg_002 was just renamed into place and the recorder has not journaled it yet
  const reconciled = reconcileWithFiles(journal, ['seg_000.m4a', 'seg_002.m4a'], 5_000, { addUnknownFiles: false });
  assertEquals(reconciled.parts.map((p) => p.seq), [0, 1]);
  assertEquals(reconciled.parts[1].state, 'quarantined');
});

Deno.test('a later write never moves a part backwards', () => {
  // The queue found the file first and already delivered it…
  let journal = upsertPart(emptyJournal('u1', 'L1'), part(3, { state: 'server_received', serverSegmentId: 'row-3', attemptCount: 2, duration: 0, firstSeenAt: 100 }));
  // …then the recorder files it as freshly saved, with the real length.
  journal = upsertPart(journal, part(3, { state: 'saved_locally', duration: 118, hasGap: true, byteLength: 4096 }));
  const p = journal.parts[0];
  assertEquals(p.state, 'server_received');
  assertEquals(p.serverSegmentId, 'row-3');
  assertEquals(p.attemptCount, 2);
  assertEquals(p.duration, 118);
  assertEquals(p.hasGap, true);
  assertEquals(p.byteLength, 4096);
  assertEquals(p.firstSeenAt, 100);
  // Forwards is still fine.
  journal = upsertPart(journal, part(3, { state: 'transcribed' }));
  assertEquals(journal.parts[0].state, 'transcribed');
});

Deno.test('a part whose file has gone is quarantined, not forgotten', () => {
  const journal = upsertPart(upsertPart(emptyJournal('u1', 'L1'), part(0)), part(1));
  const reconciled = reconcileWithFiles(journal, ['seg_000.m4a']);
  assertEquals(reconciled.parts.length, 2);
  assertEquals(reconciled.parts[1].state, 'quarantined');
});

Deno.test('a part already handed over keeps its state with no file', () => {
  const journal = upsertPart(emptyJournal('u1', 'L1'), part(0, { state: 'transcribed' }));
  const reconciled = reconcileWithFiles(journal, []);
  assertEquals(reconciled.parts[0].state, 'transcribed');
});

// The count rule. Zero is not an answer when parts are known.
Deno.test('Stop never shrinks what is already known', () => {
  let journal = emptyJournal('u1', 'L1');
  journal = upsertPart(journal, part(0, { state: 'server_received' }));
  journal = upsertPart(journal, part(1, { state: 'server_received' }));
  const stopped = withStopIntent(journal, 0, 600);
  assertEquals(stopped.finalExpectedParts, 2);
  assertEquals(stopped.stopIntent, true);
});

Deno.test('a later Stop cannot lower an earlier declaration', () => {
  let journal = withStopIntent(upsertPart(emptyJournal('u1', 'L1'), part(0)), 8, 2400);
  assertEquals(journal.finalExpectedParts, 8);
  journal = withStopIntent(journal, 1, 300);
  assertEquals(journal.finalExpectedParts, 8);
});

Deno.test('a capture that never reached Stop says so instead of guessing', () => {
  const journal = upsertPart(emptyJournal('u1', 'L1'), part(0));
  const interrupted = withInterruptedCapture(journal);
  assertEquals(interrupted.captureState, 'interrupted');
  // How many parts were intended is genuinely unknown.
  assertEquals(interrupted.finalExpectedParts, null);
  assertEquals(interrupted.parts.length, 1);
});

Deno.test('a stopped capture is not relabelled interrupted', () => {
  const stopped = withStopIntent(upsertPart(emptyJournal('u1', 'L1'), part(0)), 1, 300);
  assertEquals(withInterruptedCapture(stopped).captureState, 'saved_locally');
});

Deno.test('eligibility skips what is done, quarantined or backing off', () => {
  let journal = emptyJournal('u1', 'L1');
  journal = upsertPart(journal, part(0, { state: 'transcribed' }));
  journal = upsertPart(journal, part(1, { state: 'quarantined' }));
  journal = upsertPart(journal, part(2, { nextAttemptAt: 5_000 }));
  journal = upsertPart(journal, part(3));
  assertEquals(eligibleParts(journal, 1_000).map((p) => p.seq), [3]);
  assertEquals(eligibleParts(journal, 9_000).map((p) => p.seq), [2, 3]);
});

Deno.test('a discarded lecture has nothing eligible', () => {
  const journal = { ...upsertPart(emptyJournal('u1', 'L1'), part(0)), discardIntent: true };
  assertEquals(eligibleParts(journal, Date.now()), []);
});

Deno.test('backoff grows, stays bounded and is jittered', () => {
  assertEquals(nextAttemptDelayMs(1, () => 0.5), 30_000);
  assertEquals(nextAttemptDelayMs(2, () => 0.5), 60_000);
  assert(nextAttemptDelayMs(99, () => 1) <= 30 * 60_000 * 1.25 + 1);
  assert(nextAttemptDelayMs(3, () => 0) < nextAttemptDelayMs(3, () => 1));
});

Deno.test('rubbish is not mistaken for a journal', () => {
  assertEquals(isValidJournal(null), false);
  assertEquals(isValidJournal({ ownerId: 'u1' }), false);
  assertEquals(isValidJournal({ schemaVersion: 1, ownerId: 'u1', lectureId: 'L1', parts: [{}] }), false);
  assertEquals(isValidJournal({ schemaVersion: 1, ownerId: 'u1', lectureId: 'L1', parts: [] }), true);
});

// Two writers each reading generation N and each writing N+1 is how a change
// disappears with no error anywhere.
Deno.test('concurrent updates serialise instead of overwriting each other', async () => {
  const fs = memoryFs();
  const store = createJournalStore(fs, DIR, 'u1', 'L1');
  await Promise.all([
    store.update((j) => upsertPart(j, part(0))),
    store.update((j) => upsertPart(j, part(1))),
    store.update((j) => upsertPart(j, part(2))),
  ]);
  const journal = await store.read();
  assertEquals(journal.parts.map((p) => p.seq), [0, 1, 2]);
});

Deno.test('a store with nothing on disk starts empty rather than failing', async () => {
  const fs = memoryFs();
  const store = createJournalStore(fs, DIR, 'u1', 'L1');
  const journal: LectureJournal = await store.read();
  assertEquals(journal.parts, []);
  assertEquals(journal.finalExpectedParts, null);
  assertEquals(journal.captureState, 'capturing');
});
