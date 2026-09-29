/**
 * The decisions a lecture recording makes every second, as pure functions.
 *
 * Record Lecture completion plan, Phase 2 (steps 2.1–2.4, 2.15). Everything
 * here is a rule that a real recording got wrong in the week to 2026-09-16:
 *
 *   - the 5-minute part change restarted the microphone while the phone was
 *     locked, which iOS refuses, and capture died until the app was reopened
 *     (all six "interrupted" events that week landed on a 5-minute boundary);
 *   - the timer counted wall-clock time, so it kept running on a dead
 *     microphone and parts the phone called "300 s" held no audio;
 *   - nothing limited how long a session could run in real time, so a
 *     recording nobody stopped captured audio for 34 hours;
 *   - nothing checked storage, or noticed a microphone that heard nothing.
 *
 * No react-native, no expo, no timers: tested in lectureCaptureRules.test.ts.
 */

/** Length of one part while the app is on screen. */
export const PART_SECONDS = 300;
/** Default recording limit. The server's `start` response can raise it. */
export const DEFAULT_MAX_RECORDING_SECONDS = 90 * 60;
/** How long past the recording limit a session may run in real time before it is saved. */
export const WALL_CLOCK_GRACE_SECONDS = 30 * 60;
/** Warn this long before the limit. */
export const WARN_BEFORE_LIMIT_SECONDS = 5 * 60;
/** The microphone must have been silent-and-still this long to count as stopped. */
export const DEAD_MIC_AFTER_MS = 8_000;
/** Below this much free space, warn; below the second, close the part so it is safe. */
export const LOW_STORAGE_WARN_BYTES = 300 * 1024 * 1024;
export const LOW_STORAGE_CUT_BYTES = 150 * 1024 * 1024;
/** Average input level under this for the first minute reads as "too quiet". */
export const TOO_QUIET_DB = -45;
export const TOO_QUIET_WINDOW_SECONDS = 60;

/**
 * Should the current part be closed and a new one started now?
 *
 * Only while the app is ACTIVE. Starting a recording is something iOS allows
 * only from the foreground; a part change on a locked phone is exactly how
 * lectures died at 5:00. While backgrounded the current part simply keeps
 * recording, however long that is, and is cut when the app comes back.
 */
export function shouldCutPart(input: {
  appActive: boolean;
  partSeconds: number;
  partLimitSeconds?: number;
}): boolean {
  return input.appActive && input.partSeconds >= (input.partLimitSeconds ?? PART_SECONDS);
}

/**
 * Is the microphone actually recording?
 *
 * `nativeRecording` is the recorder's real state (expo-audio's `isRecording`
 * PROPERTY reads AVAudioRecorder itself; `getStatus().isRecording` is
 * bookkeeping that says "recording" even when the start failed). A recorder
 * can also report recording while its clock stands still, so the part's own
 * recorded time must keep moving too.
 */
export interface MicSample {
  at: number;
  nativeRecording: boolean;
  /** The part's recorded seconds as the recorder reports them. */
  partSeconds: number;
}

export function micIsDead(samples: MicSample[], now: number, deadAfterMs = DEAD_MIC_AFTER_MS): boolean {
  if (samples.length === 0) return false;
  const window = samples.filter((s) => now - s.at <= deadAfterMs + 1_000);
  const coversWindow = window.length > 0 && now - window[0].at >= deadAfterMs;
  if (!coversWindow) return false;
  if (window.every((s) => !s.nativeRecording)) return true;
  const first = window[0].partSeconds;
  const last = window[window.length - 1].partSeconds;
  return last - first < 1;
}

/** Seconds of audio captured across the whole session (closed parts + the live one). */
export function capturedSeconds(closedSeconds: number, livePartSeconds: number): number {
  return Math.max(0, Math.floor(closedSeconds + Math.max(0, livePartSeconds)));
}

export function reachedLimit(captured: number, maxSeconds: number): boolean {
  return captured >= maxSeconds;
}

export function nearLimit(captured: number, maxSeconds: number): boolean {
  return captured >= Math.max(0, maxSeconds - WARN_BEFORE_LIMIT_SECONDS);
}

/**
 * Has this session run too long in REAL time?
 *
 * Independent of captured audio, which is what the 34-hour recording lacked:
 * its captured seconds crept up only when the app happened to wake, so the
 * 90-minute cap took two days to arrive. Uses the session's recorded start
 * time; a clock that jumps backwards cannot extend it past the monotonic
 * elapsed time the controller also tracks.
 */
export function wallClockExceeded(input: {
  startedAtMs: number;
  nowMs: number;
  monotonicElapsedMs: number;
  maxSeconds: number;
}): boolean {
  const byClock = input.nowMs - input.startedAtMs;
  const elapsed = Math.max(byClock, input.monotonicElapsedMs);
  return elapsed > (input.maxSeconds + WALL_CLOCK_GRACE_SECONDS) * 1000;
}

export type StorageAction = 'ok' | 'warn' | 'cut';

export function storageAction(freeBytes: number | null): StorageAction {
  if (freeBytes === null || !Number.isFinite(freeBytes)) return 'ok';
  if (freeBytes < LOW_STORAGE_CUT_BYTES) return 'cut';
  if (freeBytes < LOW_STORAGE_WARN_BYTES) return 'warn';
  return 'ok';
}

/**
 * Is the room too quiet to transcribe?
 *
 * Judged once, over the first minute, from metering samples (dBFS). A phone in
 * a bag or at the back of a large hall produces a transcript of nothing, and
 * the time to say so is while the student can still move it.
 */
export function tooQuiet(levelsDb: number[]): boolean {
  const usable = levelsDb.filter((db) => Number.isFinite(db) && db > -160);
  if (usable.length < 20) return false;
  const average = usable.reduce((sum, db) => sum + db, 0) / usable.length;
  return average < TOO_QUIET_DB;
}

/** dBFS (-160..0) → 0..1 for the level meter, floored at -50 dB. */
export function normalizeMeter(db: number | undefined | null): number {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0;
  const floor = -50;
  if (db <= floor) return 0;
  return Math.min(1, (db - floor) / -floor);
}

/** The built-in microphone among the inputs iOS reports, or null. */
export function builtInMicrophone<T extends { uid: string; name: string; type: string }>(inputs: T[]): T | null {
  return inputs.find((i) => /MicrophoneBuiltIn/i.test(i.type) || /built-?in|iphone microphone|ipad microphone/i.test(i.name)) ?? null;
}

/** `seg_007.m4a` for part 7. The server's path check requires exactly this shape. */
export function partFilename(seq: number): string {
  return `seg_${String(seq).padStart(3, '0')}.m4a`;
}

/** The server's storage path for a part. Always built from the journal's owner, never the current session. */
export function partStoragePath(ownerId: string, lectureId: string, seq: number): string {
  return `${ownerId}/${lectureId}/${partFilename(seq)}`;
}

/** Marks closer than this to an earlier one are the same moment (mirrors 145). */
export const MARK_MIN_GAP_SECONDS = 10;
export const MAX_MARKS = 200;

/**
 * "Mark important" at `atSeconds` of captured audio. Returns the marks
 * unchanged when this moment is already marked or the list is full, so a
 * double tap is one mark.
 */
export function addImportantMark(marks: number[], atSeconds: number): number[] {
  const at = Math.max(0, Math.floor(atSeconds));
  if (marks.length >= MAX_MARKS) return marks;
  if (marks.some((m) => Math.abs(m - at) < MARK_MIN_GAP_SECONDS)) return marks;
  return [...marks, at].sort((a, b) => a - b);
}
