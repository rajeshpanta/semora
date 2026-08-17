import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import {
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingStatus,
} from 'expo-audio';
import {
  LECTURE_RECORDING_OPTIONS,
  MAX_RECORDING_SECONDS,
  MIN_FREE_BYTES,
  RECORDING_WARN_SECONDS,
  SEGMENT_SECONDS,
} from '@/lib/lectureRecordingOptions';
import {
  cancelLecture,
  finishLecture,
  finalizeLecture,
  purgeLectureAudio,
  startLecture,
  uploadSegment,
  type LectureError,
} from '@/lib/lectures';
import { track } from '@/lib/analytics';

// ── The lecture capture state machine ───────────────────────────────────────
// Everything hard about recording a 90-minute lecture on a phone lives here.
//
// SEGMENTS. Audio is captured as a chain of ~5-minute files rather than one
// long one. An .m4a whose writer never finalizes has no `moov` atom, which
// makes it unplayable rather than merely truncated — so a single-file recording
// killed by iOS at minute 78 yields nothing at all. Rotating the file caps that
// loss at one segment, and gives uploads and transcription a natural unit.
//
// UPLOADS RUN BEHIND CAPTURE. Each closed segment is queued and uploaded while
// the next one records, so by the time the student taps Stop most of the
// lecture is already transcribed. The queue is strictly sequential: segments
// are transcribed in order so each can use the previous transcript's tail to
// repair the word cut in half at the boundary.
//
// INTERRUPTIONS. A phone call, Siri, or another app taking the microphone stops
// the recorder, and expo-audio does not resume it. The poll below notices the
// recorder went quiet while we still believe we are recording, closes the
// segment, and opens a new one flagged `has_gap` so the transcript can say a
// gap happened instead of silently splicing two moments together.

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'paused' | 'finishing';

export interface LectureRecorderState {
  phase: RecorderPhase;
  /** Whole seconds captured across every segment, including the live one. */
  elapsed: number;
  /** Normalized 0..1 input level for the meter. */
  level: number;
  segmentsClosed: number;
  segmentsUploaded: number;
  uploadFailed: number;
  interrupted: boolean;
  warnedNearLimit: boolean;
  error: string | null;
  /**
   * Set once a recording has been saved, so the screen can navigate to it.
   * Needed because the 90-minute cap stops the recording from inside the timer,
   * with no tap to hang navigation off — without this the user is left staring
   * at an empty setup form with no idea where their lecture went.
   */
  finishedLectureId: string | null;
}

const POLL_MS = 250;
/** Grace period after record() before a quiet recorder counts as an interruption. */
const INTERRUPTION_GRACE_MS = 1500;
/** How long to wait for the OS to finalize a closed segment file. */
const FINALIZE_TIMEOUT_MS = 4000;

const LECTURE_DIR = `${FileSystem.documentDirectory}lectures/`;

/** dBFS (-160..0) → 0..1, floored at -50 dB where a lecture hall's noise sits. */
function normalizeMeter(db: number | undefined): number {
  if (typeof db !== 'number' || !Number.isFinite(db)) return 0;
  const floor = -50;
  if (db <= floor) return 0;
  return Math.min(1, (db - floor) / -floor);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Move a finished segment out of the cache directory.
 *
 * Non-negotiable: iOS purges Caches under storage pressure without warning, and
 * a lecture's segments can sit there for many minutes waiting to upload.
 */
async function persistSegment(cacheUri: string, lectureId: string, seq: number): Promise<string> {
  const dir = `${LECTURE_DIR}${lectureId}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const target = `${dir}seg_${String(seq).padStart(3, '0')}.m4a`;
  await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
  await FileSystem.moveAsync({ from: cacheUri, to: target });
  return target;
}

/** Wait until a just-closed recording actually has bytes on disk. */
async function waitForFinalizedFile(uri: string): Promise<number> {
  const deadline = Date.now() + FINALIZE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const info = await FileSystem.getInfoAsync(uri).catch(() => null);
    if (info?.exists && typeof info.size === 'number' && info.size > 0) return info.size;
    await sleep(150);
  }
  return 0;
}

async function activateRecordingSession(): Promise<void> {
  // Every field is passed on purpose. The native AudioMode record has hard
  // defaults, so an omitted key is RESET rather than left alone — a partial
  // call here silently turns background recording back off.
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    allowsBackgroundRecording: true,
    shouldPlayInBackground: false,
    interruptionMode: 'doNotMix',
    shouldRouteThroughEarpiece: false,
  });
}

async function releaseRecordingSession(): Promise<void> {
  // Released deliberately on every exit path. An app that holds an active
  // background audio session while idle is both a battery problem and the exact
  // thing App Review looks for when it audits the audio background mode.
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
    allowsBackgroundRecording: false,
    shouldPlayInBackground: false,
    interruptionMode: 'mixWithOthers',
    shouldRouteThroughEarpiece: false,
  }).catch(() => {});
}

export function useLectureRecorder() {
  const [state, setState] = useState<LectureRecorderState>({
    phase: 'idle',
    elapsed: 0,
    level: 0,
    segmentsClosed: 0,
    segmentsUploaded: 0,
    uploadFailed: 0,
    interrupted: false,
    warnedNearLimit: false,
    error: null,
    finishedLectureId: null,
  });

  const lectureIdRef = useRef<string | null>(null);
  const seqRef = useRef(0);
  const baseElapsedRef = useRef(0);
  const rotatingRef = useRef(false);
  const recordingSinceRef = useRef(0);
  const nextGapRef = useRef(false);
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const stoppedRef = useRef(false);
  const discardingRef = useRef(false);
  const finalizedRef = useRef<((s: RecordingStatus) => void) | null>(null);

  const onStatus = useCallback((status: RecordingStatus) => {
    if (status.isFinished) finalizedRef.current?.(status);
  }, []);

  const recorder = useAudioRecorder(LECTURE_RECORDING_OPTIONS, onStatus);

  const patch = useCallback((next: Partial<LectureRecorderState>) => {
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  /** Queue one closed segment for upload. Strictly sequential — see the header. */
  const enqueueUpload = useCallback(
    (fileUri: string, seq: number, seconds: number, hasGap: boolean) => {
      const lectureId = lectureIdRef.current;
      if (!lectureId) return;
      uploadChainRef.current = uploadChainRef.current
        .then(() => uploadSegment({ lectureId, seq, fileUri, seconds, hasGap }))
        .then(
          () => {
            setState((p) => ({ ...p, segmentsUploaded: p.segmentsUploaded + 1 }));
            // Local copy is redundant once the server has it; a 90-minute
            // lecture would otherwise leave ~22 MB behind on the device.
            FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
          },
          (err: LectureError) => {
            // Keep the local file: the detail screen's resume path is the
            // second chance, and deleting here would make the failure permanent.
            setState((p) => ({ ...p, uploadFailed: p.uploadFailed + 1 }));
            track('lecture_segment_upload_failed', {
              screen: 'lecture_record',
              seq,
              code: err?.code ?? null,
            });
          },
        );
    },
    [],
  );

  /**
   * Close the live segment and open the next one.
   *
   * Guarded by `rotatingRef` because both the segment timer and the
   * interruption detector can fire into it, and a second rotation entered
   * mid-flight would stop a recorder that is already stopped and lose the file.
   */
  const rotateSegment = useCallback(
    async (opts: { resume: boolean; gap?: boolean }) => {
      if (rotatingRef.current || discardingRef.current) return;
      rotatingRef.current = true;
      const seq = seqRef.current;
      try {
        const cacheUri = recorder.uri;
        const before = recorder.getStatus();
        const seconds = Math.max(0, Math.round((before?.durationMillis ?? 0) / 1000));

        const finalized = new Promise<void>((resolve) => {
          finalizedRef.current = () => resolve();
          setTimeout(resolve, FINALIZE_TIMEOUT_MS);
        });
        await recorder.stop().catch(() => {});
        await finalized;
        finalizedRef.current = null;

        if (cacheUri) {
          const size = await waitForFinalizedFile(cacheUri);
          if (size > 0) {
            const stored = await persistSegment(cacheUri, lectureIdRef.current!, seq);
            seqRef.current = seq + 1;
            baseElapsedRef.current += seconds;
            setState((p) => ({ ...p, segmentsClosed: p.segmentsClosed + 1 }));
            // nextGapRef carries the flag FORWARD. `opts.gap` describes the
            // interruption that just ended this segment, so it belongs to the
            // segment about to start — tagging the one that closed marks the
            // wrong side of the hole.
            enqueueUpload(stored, seq, seconds, nextGapRef.current);
            nextGapRef.current = opts.gap ?? false;
          }
        }

        if (opts.resume && !stoppedRef.current) {
          nextGapRef.current = opts.gap ?? false;
          await recorder.prepareToRecordAsync(LECTURE_RECORDING_OPTIONS);
          recorder.record();
          recordingSinceRef.current = Date.now();
        }
      } catch {
        // A rotation that fails must not kill the session: the next tick tries
        // again, and the segments already banked are unaffected.
      } finally {
        rotatingRef.current = false;
      }
    },
    [recorder, enqueueUpload],
  );

  const start = useCallback(
    async (input: { title: string; courseId: string | null }) => {
      patch({ error: null, phase: 'starting' });
      try {
        // Recording cannot work in a browser. expo-file-system's web build is a
        // shim that implements nothing, so persistSegment's makeDirectory/move
        // throw and every closed segment is dropped — the timer ran, the UI said
        // "Recording", and Stop produced an empty lecture with no audio and no
        // transcript. Silently losing a 50-minute class is far worse than not
        // offering the button, so fail loudly and immediately.
        if (Platform.OS === 'web') {
          patch({ phase: 'idle', error: 'webUnsupported' });
          return { ok: false as const, code: 'WEB_UNSUPPORTED' };
        }
        const free = await FileSystem.getFreeDiskStorageAsync().catch(() => Number.MAX_SAFE_INTEGER);
        if (free < MIN_FREE_BYTES) {
          patch({ phase: 'idle', error: 'notEnoughSpace' });
          return { ok: false as const, code: 'NO_SPACE' };
        }

        // Permission BEFORE the server call, so a denied mic never leaves an
        // orphaned reservation holding shared transcription capacity.
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          patch({ phase: 'idle', error: 'micDenied' });
          return { ok: false as const, code: 'MIC_DENIED' };
        }

        // Entitlement + global capacity, checked before the microphone opens.
        const started = await startLecture(input);
        lectureIdRef.current = started.lectureId;
        seqRef.current = 0;
        baseElapsedRef.current = 0;
        stoppedRef.current = false;
        nextGapRef.current = false;
        discardingRef.current = false;
        uploadChainRef.current = Promise.resolve();

        await activateRecordingSession();
        await recorder.prepareToRecordAsync(LECTURE_RECORDING_OPTIONS);
        recorder.record();
        recordingSinceRef.current = Date.now();

        setState({
          phase: 'recording',
          elapsed: 0,
          level: 0,
          segmentsClosed: 0,
          segmentsUploaded: 0,
          uploadFailed: 0,
          interrupted: false,
          warnedNearLimit: false,
          error: null,
          finishedLectureId: null,
        });
        track('lecture_recording_started', {
          screen: 'lecture_record',
          courseAttached: Boolean(input.courseId),
        });
        return { ok: true as const, lectureId: started.lectureId };
      } catch (err) {
        const e = err as LectureError;
        await releaseRecordingSession();
        // The lecture row may already exist (startLecture succeeded and the
        // microphone or audio session failed after it). Hand its reserved
        // capacity back rather than leaving 90 minutes of the shared daily pool
        // held by a recording that never happened.
        if (lectureIdRef.current) {
          await cancelLecture(lectureIdRef.current);
          lectureIdRef.current = null;
        }
        // Every start failure is reported. Without this a feature that failed
        // 100% of the time was indistinguishable from one nobody tapped:
        // lecture_consent_accepted fired, lecture_recording_started did not,
        // and no event named the reason.
        track('lecture_recording_start_failed', {
          screen: 'lecture_record',
          code: e?.code ?? null,
          status: e?.status ?? null,
        });
        patch({ phase: 'idle', error: e?.message ?? 'startFailed' });
        return { ok: false as const, code: e?.code, message: e?.message, status: e?.status };
      }
    },
    [patch, recorder],
  );

  const pause = useCallback(() => {
    // Rotating on pause rather than calling recorder.pause() keeps every file a
    // complete, finalized .m4a. A paused recorder holds an open unfinalized
    // file, which is exactly the state that loses everything if the OS kills
    // the app while the student is at lunch.
    void rotateSegment({ resume: false });
    patch({ phase: 'paused', level: 0 });
  }, [rotateSegment, patch]);

  const resume = useCallback(async () => {
    try {
      await activateRecordingSession();
      await recorder.prepareToRecordAsync(LECTURE_RECORDING_OPTIONS);
      recorder.record();
      recordingSinceRef.current = Date.now();
      patch({ phase: 'recording' });
    } catch {
      patch({ error: 'resumeFailed' });
    }
  }, [recorder, patch]);

  /** Close capture, flush the upload queue, and tell the server how many segments to expect. */
  const stop = useCallback(async (): Promise<{ ok: boolean; lectureId: string | null }> => {
    const lectureId = lectureIdRef.current;
    if (!lectureId) return { ok: false, lectureId: null };
    stoppedRef.current = true;
    patch({ phase: 'finishing' });

    if (state.phase === 'recording') {
      await rotateSegment({ resume: false });
    }
    await releaseRecordingSession();

    // Declare the segment count BEFORE waiting on the uploads, not after.
    // Capture is already complete here (the rotate above closed the last
    // segment), so seqRef is final — and the server needs this number in place
    // before the last segment's transcription finishes. Announcing it
    // afterwards meant `maybeFinalize` ran while the count was still 0, decided
    // capture was ongoing, and declined to assemble the transcript; nothing
    // asked again, so the lecture sat at 'uploading' with every segment done.
    const declared = await finishLecture({
      lectureId,
      segmentCount: seqRef.current,
      durationSeconds: baseElapsedRef.current,
    }).then(() => true).catch(() => false);

    // Let every queued upload settle so the finalize below sees them all.
    await uploadChainRef.current.catch(() => {});

    try {
      // Retry the count if the pre-upload attempt failed (offline at stop).
      if (!declared) {
        await finishLecture({
          lectureId,
          segmentCount: seqRef.current,
          durationSeconds: baseElapsedRef.current,
        });
      }
      // Explicit "capture is done, assemble it" nudge. Covers the ordering
      // either way: whether the last transcription landed before or after the
      // count was written, exactly one of these paths finalizes the lecture.
      await finalizeLecture(lectureId);
      track('lecture_recording_saved', {
        screen: 'lecture_record',
        durationSeconds: baseElapsedRef.current,
        segmentCount: seqRef.current,
        interrupted: state.interrupted,
      });
    } catch {
      // The segments are uploaded and the row exists; the detail screen's
      // resume path can still complete this lecture.
    }

    patch({ phase: 'idle', finishedLectureId: lectureId });
    lectureIdRef.current = null;
    return { ok: true, lectureId };
  }, [state.phase, state.interrupted, rotateSegment, patch]);

  /** Abandon: stop capture, release the reservation, delete every trace of the audio. */
  const discard = useCallback(async () => {
    const lectureId = lectureIdRef.current;
    // Both flags set SYNCHRONOUSLY, before any await. `discard` performs several
    // network round-trips, and the 250ms poll is keyed on `state.phase` — which
    // React will not have updated yet — so without this guard the interval fires
    // mid-teardown and starts a rotation, an upload, and an analytics event for
    // a recording the user just threw away.
    stoppedRef.current = true;
    discardingRef.current = true;
    setState((p) => ({ ...p, phase: 'finishing', level: 0 }));

    if (state.phase === 'recording' || state.phase === 'paused') {
      await recorder.stop().catch(() => {});
    }
    await releaseRecordingSession();

    if (lectureId) {
      // Let any in-flight upload settle first: a PUT that lands AFTER the purge
      // would put audio back into the bucket with no row pointing at it.
      await uploadChainRef.current.catch(() => {});
      // Storage and device audio BEFORE the row — deleting the row cascades the
      // segments away and takes every storage_path with them, which would
      // orphan the objects permanently. The consent sheet promises otherwise.
      await purgeLectureAudio(lectureId);
      await cancelLecture(lectureId);
      await supabaseDeleteLecture(lectureId);
    }
    lectureIdRef.current = null;
    discardingRef.current = false;
    setState({
      phase: 'idle', elapsed: 0, level: 0, segmentsClosed: 0, segmentsUploaded: 0,
      uploadFailed: 0, interrupted: false, warnedNearLimit: false, error: null,
      finishedLectureId: null,
    });
  }, [state.phase, recorder]);

  // `stop` reached through a ref so the polling effect below (which must be
  // declared after every callback it calls) does not have to list it as a
  // dependency — doing so would tear down and rebuild the interval on each tick
  // it caused, which is a recording that stutters once a second.
  const stopRef = useRef(stop);
  stopRef.current = stop;

  // Timer, meter, segment rotation and interruption detection, in one tick.
  useEffect(() => {
    if (state.phase !== 'recording') return;
    const id = setInterval(() => {
      const status = recorder.getStatus();
      const liveSeconds = Math.max(0, Math.round((status?.durationMillis ?? 0) / 1000));
      const total = baseElapsedRef.current + liveSeconds;

      setState((p) => ({
        ...p,
        elapsed: total,
        level: normalizeMeter(status?.metering),
        warnedNearLimit: p.warnedNearLimit || total >= RECORDING_WARN_SECONDS,
      }));

      if (rotatingRef.current || discardingRef.current) return;

      if (total >= MAX_RECORDING_SECONDS) {
        void stopRef.current();
        return;
      }
      if (liveSeconds >= SEGMENT_SECONDS) {
        void rotateSegment({ resume: true });
        return;
      }
      // The recorder went quiet without us asking: something took the
      // microphone. Close what we have and start again, flagging the gap.
      const settled = Date.now() - recordingSinceRef.current > INTERRUPTION_GRACE_MS;
      if (settled && status && !status.isRecording) {
        setState((p) => ({ ...p, interrupted: true }));
        track('lecture_recording_interrupted', { screen: 'lecture_record' });
        void rotateSegment({ resume: true, gap: true });
      }
    }, POLL_MS);
    return () => clearInterval(id);
  }, [state.phase, recorder, rotateSegment]);

  // Safety net: if this screen is torn down while a session is live, never
  // leave the audio session active. Capture itself is intentionally NOT stopped
  // on background — that is the whole point of the background mode.
  useEffect(() => {
    return () => {
      if (lectureIdRef.current) void releaseRecordingSession();
    };
  }, []);

  // iOS can reset media services out from under a long recording. When it
  // happens the recorder is dead and only a fresh one will record again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const status = recorder.getStatus();
      if (status?.mediaServicesDidReset && lectureIdRef.current && !stoppedRef.current) {
        void rotateSegment({ resume: true, gap: true });
      }
    });
    return () => sub.remove();
  }, [recorder, rotateSegment]);

  return { ...state, start, pause, resume, stop, discard };
}

// Imported lazily to keep this module's import graph free of react-query.
async function supabaseDeleteLecture(lectureId: string) {
  const { supabase } = await import('@/lib/supabase');
  await supabase.from('lecture_recordings').delete().eq('id', lectureId);
}
