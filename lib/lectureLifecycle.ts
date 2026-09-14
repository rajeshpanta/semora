/**
 * The capture lifecycle, extracted so it can be tested without a microphone.
 *
 * This is the seam for Phase 1 Step 3 of LECTURE_AUDIO_PLAN.md. The hook in
 * lib/lectureRecorder.ts owns the real recorder and the screen; the ordering
 * rules live here, where a test can drive them.
 *
 * WHY IT EXISTS
 *
 * `rotateSegment` guards re-entry with a boolean and RETURNS IMMEDIATELY when a
 * rotation is already running:
 *
 *     if (rotatingRef.current || discardingRef.current) return;
 *
 * `stop()` then does `await rotateSegment({ resume: false })` and believes the
 * last chunk has been closed. When the five-minute timer fired a moment before
 * the student tapped Stop, that await resolves instantly and nothing was closed.
 * Stop carries on: it declares `segmentCount: seqRef.current`, which the
 * in-flight rotation has not incremented yet, and at the end sets
 * `lectureIdRef.current = null`. The rotation is still running. When it finally
 * reaches
 *
 *     persistSegment(cacheUri, lectureIdRef.current!, seq)
 *
 * the non-null assertion is a lie, the file is written under `lectures/null/`,
 * and `enqueueUpload` returns early because it reads the same null. The part has
 * no row, no upload and no owner. That is the exact shape of parts 0 and 5 of
 * lecture 04cd64e7 on 2026-09-14.
 *
 * THE RULES THIS ENFORCES
 *
 *  1. One operation at a time. Timer, interruption, Pause, Resume, Stop and
 *     Discard all queue on the same chain instead of racing a boolean.
 *  2. Identity is read BEFORE awaiting anything, never after.
 *  3. Stop waits for the rotation already running, then closes whatever is left
 *     exactly once.
 *  4. Identity is cleared only after the last part is committed.
 *  5. The declared count is read after capture is finished, not before.
 *  6. A callback belonging to an older generation can never finalise a newer
 *     recording.
 */

export type CaptureState =
  | 'idle'
  | 'recording'
  | 'paused'
  | 'finalizing_local'
  | 'saved_locally'
  | 'discarded';

/** What a closed part looks like once its bytes are on disk. */
export interface ClosedPart {
  lectureId: string;
  generation: number;
  seq: number;
  path: string;
  seconds: number;
  hasGap: boolean;
}

export interface LifecycleHost {
  /** Stop the native recorder and wait for the file to be finalised. */
  stopRecorder(): Promise<void>;
  /** The cache URI the recorder is writing to, or null if it is not running. */
  currentCacheUri(): string | null;
  /** Bytes on disk once finalised. Zero means nothing was captured. */
  finalizedSize(cacheUri: string): Promise<number>;
  /** Seconds captured in the chunk being closed. */
  elapsedSeconds(): number;
  /** Move the cache file to its owned location. Must not overwrite. */
  persist(lectureId: string, seq: number, cacheUri: string): Promise<string>;
  /** Durably record the closed part before anything else can observe it. */
  commit(part: ClosedPart): Promise<void>;
  /** Begin a new chunk. */
  startRecorder(): Promise<void>;
  /** Hand the audio session back to the OS. */
  releaseSession(): Promise<void>;
  /** Tell the server how many parts exist. Called once, after capture ends. */
  declare(lectureId: string, segmentCount: number, durationSeconds: number): Promise<void>;
}

export type StopOutcome =
  | { kind: 'saved_locally'; lectureId: string; segmentCount: number; durationSeconds: number }
  | { kind: 'needs_recovery'; lectureId: string; reason: string }
  | { kind: 'discarded'; lectureId: string }
  | { kind: 'not_recording' };

export interface CaptureLifecycle {
  start(lectureId: string): Promise<void>;
  /** Close the current chunk. `resume` continues capturing afterwards. */
  rotate(opts: { resume: boolean; gap?: boolean }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<StopOutcome>;
  discard(): Promise<void>;
  readonly state: CaptureState;
  readonly lectureId: string | null;
  readonly generation: number;
  readonly seq: number;
  readonly closed: ClosedPart[];
}

export function createCaptureLifecycle(host: LifecycleHost): CaptureLifecycle {
  let state: CaptureState = 'idle';
  let lectureId: string | null = null;
  let generation = 0;
  let seq = 0;
  let elapsed = 0;
  let nextGap = false;
  let stopRequested = false;
  let discardRequested = false;
  // Held so a second Stop tap answers with the first tap's result. Identity is
  // already cleared by then, so without this the repeat reports "not recording"
  // and the screen shows a save that looks like it failed.
  let lastOutcome: StopOutcome | null = null;
  const closed: ClosedPart[] = [];

  // The single in-flight operation. Rule 1: everything queues here, so a Stop
  // arriving mid-rotation waits for that rotation instead of stepping over it.
  let chain: Promise<unknown> = Promise.resolve();
  const serialize = <T>(op: () => Promise<T>): Promise<T> => {
    const run = chain.then(op, op);
    // Swallow on the chain only. The caller still sees the rejection.
    chain = run.then(() => undefined, () => undefined);
    return run;
  };

  /**
   * Close the chunk that is open, if any.
   *
   * Rule 2: `owner` and `myGeneration` are read here, before the first await.
   * Everything after uses those locals, so a Stop that clears identity while
   * this is running cannot redirect the file.
   */
  async function closeCurrentChunk(gap: boolean): Promise<void> {
    const owner = lectureId;
    const myGeneration = generation;
    const mySeq = seq;
    if (!owner) return;

    const cacheUri = host.currentCacheUri();
    const seconds = host.elapsedSeconds();

    await host.stopRecorder();

    if (!cacheUri) return;
    const size = await host.finalizedSize(cacheUri);
    if (size <= 0) {
      // Rule: a finalisation that produced nothing is an explicit error, not a
      // silent success. The caller decides; it must not be reported as saved.
      throw new LifecycleError('capture_finalize', `no bytes at seq ${mySeq}`);
    }

    // Rule 6 needs no check here. `start` queues on the same chain, so the
    // generation cannot change while this is running, and `owner` was read
    // before the first await either way. The generation is carried on the part
    // so the journal and the native transport can match a late receipt to the
    // recording that produced it, which is where the check does belong.
    const path = await host.persist(owner, mySeq, cacheUri);
    const part: ClosedPart = {
      lectureId: owner,
      generation: myGeneration,
      seq: mySeq,
      path,
      seconds,
      hasGap: nextGap,
    };
    // Rule 4: commit before anything can observe the part as closed.
    await host.commit(part);
    closed.push(part);
    seq = mySeq + 1;
    elapsed += seconds;
    nextGap = gap;
  }

  return {
    async start(id: string) {
      await serialize(async () => {
        lectureId = id;
        generation += 1;
        seq = 0;
        elapsed = 0;
        nextGap = false;
        stopRequested = false;
        discardRequested = false;
        lastOutcome = null;
        closed.length = 0;
        await host.startRecorder();
        state = 'recording';
      });
    },

    async rotate(opts: { resume: boolean; gap?: boolean }) {
      await serialize(async () => {
        if (state !== 'recording') return;
        if (stopRequested || discardRequested) return;
        await closeCurrentChunk(opts.gap ?? false);
        if (opts.resume && !stopRequested && !discardRequested) {
          await host.startRecorder();
          state = 'recording';
        } else {
          state = 'paused';
        }
      });
    },

    async pause() {
      await serialize(async () => {
        if (state !== 'recording') return;
        await closeCurrentChunk(false);
        state = 'paused';
      });
    },

    async resume() {
      await serialize(async () => {
        // Rule: if Stop or Discard arrived while this was queued behind Pause's
        // finalisation, the microphone must stay off.
        if (stopRequested || discardRequested) return;
        if (state !== 'paused') return;
        await host.startRecorder();
        state = 'recording';
      });
    },

    async stop(): Promise<StopOutcome> {
      // Rule: repeated Stop taps are idempotent, including after identity has
      // been cleared by the tap that succeeded.
      if (state === 'saved_locally' && lastOutcome) return lastOutcome;
      if (!lectureId) return lastOutcome ?? { kind: 'not_recording' };
      // Set before queueing, so a rotation still waiting in the chain sees it
      // and does not restart the microphone behind us.
      stopRequested = true;
      return serialize(async (): Promise<StopOutcome> => {
        const owner = lectureId;
        if (!owner) return { kind: 'not_recording' };
        if (discardRequested) return { kind: 'discarded', lectureId: owner };
        if (state === 'saved_locally' && lastOutcome) return lastOutcome;

        state = 'finalizing_local';
        let failure: string | null = null;
        if (host.currentCacheUri() !== null) {
          try {
            await closeCurrentChunk(false);
          } catch (err) {
            failure = err instanceof LifecycleError ? err.stage : 'capture_finalize';
          }
        }
        await host.releaseSession();

        if (failure) {
          // Identity is deliberately kept: the queue needs an owner to retry
          // under, and the screen must not report a save that did not happen.
          state = 'recording';
          stopRequested = false;
          return { kind: 'needs_recovery', lectureId: owner, reason: failure };
        }

        // Rule 5: the count is read now, after capture has actually ended.
        const segmentCount = seq;
        const durationSeconds = elapsed;
        state = 'saved_locally';
        // Declaring may fail offline. The local state is already durable, so a
        // failure here is the queue's problem, not the student's.
        await host.declare(owner, segmentCount, durationSeconds).catch(() => {});
        // Rule 4: only now is it safe to forget who this was.
        lectureId = null;
        lastOutcome = { kind: 'saved_locally', lectureId: owner, segmentCount, durationSeconds };
        return lastOutcome;
      });
    },

    async discard() {
      discardRequested = true;
      await serialize(async () => {
        if (state === 'recording' || state === 'paused' || state === 'finalizing_local') {
          await host.stopRecorder().catch(() => {});
        }
        await host.releaseSession().catch(() => {});
        state = 'discarded';
        lectureId = null;
      });
    },

    get state() { return state; },
    get lectureId() { return lectureId; },
    get generation() { return generation; },
    get seq() { return seq; },
    get closed() { return closed; },
  };
}

/** A capture failure that names the stage it happened at (Phase 1 Step 1). */
export class LifecycleError extends Error {
  readonly stage: string;
  constructor(stage: string, message: string) {
    super(message);
    this.name = 'LifecycleError';
    this.stage = stage;
  }
}
