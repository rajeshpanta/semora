/**
 * The on-device index of audio the server has not got yet.
 *
 * Phase 1 Step 2 of LECTURE_AUDIO_PLAN.md. The server database cannot be the
 * only record of a part, because the code that creates a server row needs a
 * session and a network, and the two situations where audio is lost are exactly
 * the ones where neither is available. On 2026-09-14 a student lost four parts
 * of an eight-part lecture; two of them left no trace anywhere except a file on
 * the phone, and the only reason they were findable at all is that the filename
 * happens to carry the sequence number.
 *
 * So: a journal next to the audio, written before anything is attempted, which
 * survives the app being killed at any point.
 *
 * DURABILITY, AND WHAT IT IS NOT
 *
 * A snapshot is written to a temporary file, read back, validated, and only
 * then moved to its committed name. Committed names carry an increasing
 * generation, the reader takes the highest one that parses, and the previous
 * generation is kept until the new one is safely in place. So a kill at any
 * point leaves either the new snapshot or the old one, never neither.
 *
 * That is crash safety, not power-loss durability. JavaScript cannot fsync, and
 * a rename is only as atomic as the platform makes it. The file scan is the
 * backstop: audio on disk that no snapshot mentions is still recovered, because
 * the bytes are the thing that matters and the metadata is only a description
 * of them.
 *
 * Pure on purpose. The filesystem arrives as an interface so every one of those
 * crash points can be tested.
 */

import { segmentSeqFromFilename } from '@/lib/lectureFailure';
import type { LectureStage } from '@/lib/lectureFailure';

export const JOURNAL_SCHEMA_VERSION = 1;

/** Where a part is, from the phone's point of view. */
export type PartState =
  | 'saved_locally'
  | 'queued'
  | 'transferring'
  | 'awaiting_ack'
  | 'server_received'
  | 'transcribed'
  | 'quarantined';

export type CaptureState =
  | 'capturing'
  | 'finalizing'
  | 'saved_locally'
  | 'interrupted'
  | 'discarded';

export interface JournalPart {
  seq: number;
  /** Relative to the lecture directory, so moving the container cannot break it. */
  relativeFilePath: string;
  duration: number;
  hasGap: boolean;
  byteLength: number | null;
  /**
   * Something cheap that distinguishes two files at the same path.
   *
   * A digest where the platform offers one. Size alone is NOT proof two files
   * hold the same audio, so this is allowed to be null and a null must never be
   * read as "the same".
   */
  contentIdentity: string | null;
  state: PartState;
  attemptCount: number;
  /** Epoch ms. Null means eligible now. */
  nextAttemptAt: number | null;
  serverSegmentId: string | null;
  lastAcknowledgment: string | null;
  lastFailureStage: LectureStage | null;
}

export interface LectureJournal {
  schemaVersion: number;
  ownerId: string;
  lectureId: string;
  captureGeneration: number;
  captureState: CaptureState;
  activeCaptureUri: string | null;
  /**
   * What the phone declared at Stop. Null means it never got to say, which is
   * NOT the same as zero and must never be treated as "no parts".
   */
  finalExpectedParts: number | null;
  recordedDuration: number;
  stopIntent: boolean;
  discardIntent: boolean;
  parts: JournalPart[];
}

export interface JournalFs {
  readDir(path: string): Promise<string[]>;
  readText(path: string): Promise<string | null>;
  writeText(path: string, data: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
  makeDir(path: string): Promise<void>;
}

const JOURNAL_DIR = 'journal';
const COMMITTED = /^j_(\d+)\.json$/;
const TEMPORARY = /^tmp_(\d+)\.json$/;

function journalDir(lectureDir: string) {
  return `${lectureDir}${JOURNAL_DIR}/`;
}

/** Shape check. A snapshot that fails this is treated as if it were not there. */
export function isValidJournal(value: unknown): value is LectureJournal {
  if (!value || typeof value !== 'object') return false;
  const j = value as Partial<LectureJournal>;
  if (typeof j.ownerId !== 'string' || j.ownerId === '') return false;
  if (typeof j.lectureId !== 'string' || j.lectureId === '') return false;
  if (typeof j.schemaVersion !== 'number') return false;
  if (!Array.isArray(j.parts)) return false;
  for (const part of j.parts) {
    if (!part || typeof part !== 'object') return false;
    if (typeof (part as JournalPart).seq !== 'number') return false;
    if (typeof (part as JournalPart).relativeFilePath !== 'string') return false;
  }
  return true;
}

export function emptyJournal(ownerId: string, lectureId: string): LectureJournal {
  return {
    schemaVersion: JOURNAL_SCHEMA_VERSION,
    ownerId,
    lectureId,
    captureGeneration: 0,
    captureState: 'capturing',
    activeCaptureUri: null,
    finalExpectedParts: null,
    recordedDuration: 0,
    stopIntent: false,
    discardIntent: false,
    parts: [],
  };
}

/**
 * The newest snapshot that parses and validates, with its generation.
 *
 * Deliberately tries older generations rather than giving up on the newest: a
 * snapshot truncated by a kill mid-write is exactly what the previous one is
 * kept for.
 */
export async function readJournal(
  fs: JournalFs,
  lectureDir: string,
): Promise<{ journal: LectureJournal; generation: number } | null> {
  const dir = journalDir(lectureDir);
  const names = await fs.readDir(dir).catch(() => [] as string[]);
  const generations = names
    .map((name) => COMMITTED.exec(name))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);

  for (const generation of generations) {
    const raw = await fs.readText(`${dir}j_${generation}.json`).catch(() => null);
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (isValidJournal(parsed)) return { journal: parsed, generation };
  }
  return null;
}

/**
 * Write a snapshot so that a kill at any moment leaves a readable journal.
 *
 * Order matters and is the whole point: temporary file, read back, validate,
 * move into place, and only then drop generations older than the one this
 * replaced. The previous generation is never removed before its replacement
 * exists.
 */
export async function writeJournal(
  fs: JournalFs,
  lectureDir: string,
  journal: LectureJournal,
  previousGeneration: number,
): Promise<number> {
  const dir = journalDir(lectureDir);
  await fs.makeDir(dir).catch(() => {});
  const generation = previousGeneration + 1;
  const temporary = `${dir}tmp_${generation}.json`;
  const committed = `${dir}j_${generation}.json`;

  const body = JSON.stringify(journal);
  await fs.writeText(temporary, body);

  // Read it back before trusting it. A short write that still "succeeded" is
  // the failure this catches, and it costs one read on a file of a few KB.
  const verify = await fs.readText(temporary).catch(() => null);
  if (verify !== body) {
    await fs.remove(temporary).catch(() => {});
    throw new Error('journal snapshot did not verify');
  }

  await fs.move(temporary, committed);

  // Keep the one it replaced. Anything older is genuinely dead.
  const names = await fs.readDir(dir).catch(() => [] as string[]);
  for (const name of names) {
    const c = COMMITTED.exec(name);
    if (c && Number(c[1]) < previousGeneration) await fs.remove(`${dir}${name}`).catch(() => {});
    const t = TEMPORARY.exec(name);
    if (t && Number(t[1]) < generation) await fs.remove(`${dir}${name}`).catch(() => {});
  }
  return generation;
}

/**
 * Fold the audio actually on disk into a journal.
 *
 * The metadata commit and the file write are separate crash boundaries, so a
 * part can exist as bytes with no entry describing it. Those are added here,
 * conservatively: the sequence comes from the filename, which is the only thing
 * about them that is known, and everything else is left unknown rather than
 * invented. A part whose file has vanished is NOT deleted from the journal —
 * that is a fact worth keeping, and quarantining it says so.
 */
export function reconcileWithFiles(journal: LectureJournal, filenames: string[]): LectureJournal {
  const onDisk = new Map<number, string>();
  for (const name of filenames) {
    const seq = segmentSeqFromFilename(name);
    if (seq !== null) onDisk.set(seq, name);
  }

  const parts = journal.parts.map((part) => {
    if (onDisk.has(part.seq)) return part;
    // Already handed over: the file is meant to be gone.
    if (part.state === 'server_received' || part.state === 'transcribed') return part;
    return { ...part, state: 'quarantined' as PartState, lastFailureStage: 'local_commit' as LectureStage };
  });

  const known = new Set(parts.map((p) => p.seq));
  for (const [seq, name] of [...onDisk].sort((a, b) => a[0] - b[0])) {
    if (known.has(seq)) continue;
    parts.push({
      seq,
      relativeFilePath: name,
      duration: 0,
      hasGap: false,
      byteLength: null,
      contentIdentity: null,
      state: 'saved_locally',
      attemptCount: 0,
      nextAttemptAt: null,
      serverSegmentId: null,
      lastAcknowledgment: null,
      lastFailureStage: null,
    });
  }

  parts.sort((a, b) => a.seq - b.seq);
  return { ...journal, parts };
}

/**
 * Record that the student pressed Stop.
 *
 * `expectedParts` of zero is refused when parts are already known. A phone that
 * declared nothing because it had nothing to declare is indistinguishable here
 * from one whose count never got written, and shrinking the expectation is how
 * a lecture quietly decides the missing audio was never there.
 */
export function withStopIntent(
  journal: LectureJournal,
  expectedParts: number | null,
  recordedDuration: number,
): LectureJournal {
  const highestKnown = journal.parts.reduce((max, p) => Math.max(max, p.seq + 1), 0);
  const previous = journal.finalExpectedParts ?? 0;
  const declared = expectedParts ?? 0;
  const finalExpectedParts = Math.max(previous, declared, highestKnown) || null;
  return {
    ...journal,
    stopIntent: true,
    captureState: 'saved_locally',
    activeCaptureUri: null,
    finalExpectedParts,
    recordedDuration: Math.max(journal.recordedDuration, recordedDuration),
  };
}

/**
 * Describe a capture that came back without a Stop.
 *
 * The app died mid-lecture. How many parts were intended is genuinely unknown,
 * so it stays null and the capture is labelled rather than guessed at. The
 * parts that exist are still every bit as real.
 */
export function withInterruptedCapture(journal: LectureJournal): LectureJournal {
  if (journal.stopIntent || journal.captureState === 'discarded') return journal;
  return { ...journal, captureState: 'interrupted', activeCaptureUri: null };
}

export function upsertPart(journal: LectureJournal, part: JournalPart): LectureJournal {
  const parts = journal.parts.filter((p) => p.seq !== part.seq).concat(part);
  parts.sort((a, b) => a.seq - b.seq);
  return { ...journal, parts };
}

export function patchPart(
  journal: LectureJournal,
  seq: number,
  patch: Partial<JournalPart>,
): LectureJournal {
  return {
    ...journal,
    parts: journal.parts.map((p) => (p.seq === seq ? { ...p, ...patch } : p)),
  };
}

/** Parts worth attempting now, oldest first. */
export function eligibleParts(journal: LectureJournal, now: number): JournalPart[] {
  if (journal.discardIntent) return [];
  return journal.parts
    .filter((p) => p.state !== 'server_received' && p.state !== 'transcribed' && p.state !== 'quarantined')
    .filter((p) => p.nextAttemptAt === null || p.nextAttemptAt <= now)
    .sort((a, b) => a.seq - b.seq);
}

/**
 * When to try again.
 *
 * Bounded exponential with jitter, so a hall full of phones coming back onto
 * wifi at the end of a lecture do not all retry in the same second.
 */
export function nextAttemptDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 30 * 60_000);
  return Math.round(base * (0.75 + random() * 0.5));
}

/**
 * A serialised reader and writer for one lecture's journal.
 *
 * Every mutation goes through one chain, because two concurrent writers would
 * each read a generation, each write generation+1, and one of them would lose
 * its changes silently.
 */
export interface JournalStore {
  read(): Promise<LectureJournal>;
  update(fn: (journal: LectureJournal) => LectureJournal): Promise<LectureJournal>;
}

export function createJournalStore(
  fs: JournalFs,
  lectureDir: string,
  ownerId: string,
  lectureId: string,
): JournalStore {
  let chain: Promise<unknown> = Promise.resolve();
  let cachedGeneration = 0;

  const load = async (): Promise<LectureJournal> => {
    const found = await readJournal(fs, lectureDir);
    if (found) {
      cachedGeneration = found.generation;
      return found.journal;
    }
    cachedGeneration = 0;
    return emptyJournal(ownerId, lectureId);
  };

  const serialize = <T>(op: () => Promise<T>): Promise<T> => {
    const run = chain.then(op, op);
    chain = run.then(() => undefined, () => undefined);
    return run;
  };

  return {
    read: () => serialize(load),
    update: (fn) =>
      serialize(async () => {
        const current = await load();
        const next = fn(current);
        cachedGeneration = await writeJournal(fs, lectureDir, next, cachedGeneration);
        return next;
      }),
  };
}
