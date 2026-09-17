import * as FileSystem from 'expo-file-system/legacy';
import { AudioModule, setAudioModeAsync, type RecordingInput } from 'expo-audio';
// Not re-exported by the package index; it is what useAudioRecorder itself uses
// to turn the cross-platform options into this platform's.
import { createRecordingOptions } from 'expo-audio/build/utils/options';
import { LECTURE_RECORDING_OPTIONS } from '@/lib/lectureRecordingOptions';
import {
  builtInMicrophone,
  DEAD_MIC_AFTER_MS,
  micIsDead,
  partFilename,
  shouldCutPart,
  type MicSample,
} from '@/lib/lectureCaptureRules';
import type {
  CaptureEngine,
  EngineEvent,
  EngineStartOptions,
  EngineStatus,
} from '@/lib/lectureCapture/types';

// ── Capture with expo-audio (every build that exists today) ─────────────────
//
// What changed from the recorder that lost lectures, and why:
//
// 1. PARTS ARE ONLY CUT WHILE THE APP IS ON SCREEN. A part change is stop →
//    prepare → record, and iOS will not START a recording from the background.
//    Every lecture that died at 5:00 died here. While the phone is locked the
//    current part now keeps recording, however long that is; it is cut the
//    moment the app is back in front, or at Stop.
//
// 2. "IS IT RECORDING?" IS ASKED OF THE RECORDER ITSELF. getStatus().isRecording
//    is expo-audio's bookkeeping, set to true even when AVAudioRecorder refused
//    to start. The `isRecording` and `currentTime` PROPERTIES read the real
//    recorder. A start is verified, and a microphone that stops or stands
//    still is noticed (lectureCaptureRules.micIsDead).
//
// 3. THE TIMER IS AUDIO, NOT WALL CLOCK. Seconds come from the recorder's own
//    currentTime, so a dead microphone freezes the clock instead of counting
//    phantom minutes towards the 90-minute cap.
//
// 4. OTHER APPS' AUDIO DOES NOT STOP US. The session mixes with others, so a
//    video or music on a locked phone no longer interrupts the lecture. Calls,
//    Siri and alarms still do — iOS insists — and those are noticed and
//    recovered from.
//
// 5. THE PHONE'S OWN MICROPHONE. AirPods and car Bluetooth used to take over as
//    the input and record the student instead of the lecturer. The built-in
//    microphone is selected after every start and re-selected if the route
//    changes.
//
// 6. THE RECORDER BELONGS TO THE SESSION, NOT TO A SCREEN. It is created here,
//    outside React, so closing the recording screen — a notification tap, a
//    redirect, a swipe — no longer releases it mid-lecture.

/** How long to wait for the OS to finish writing a stopped part. */
const FINALIZE_TIMEOUT_MS = 4000;
/** An m4a with only a header is a few hundred bytes; anything this small holds no audio. */
const MIN_PART_BYTES = 2048;
/** How long to wait for a started recorder to report that it is really recording. */
const START_VERIFY_MS = 1500;
/** At most one automatic foreground restart in this long, so a held microphone is not hammered. */
const RESTART_SPACING_MS = 10_000;
/** How often the input route is checked and the built-in microphone re-selected. */
const INPUT_CHECK_MS = 5000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type NativeRecorder = InstanceType<typeof AudioModule.AudioRecorder>;

export async function activateLectureAudioSession(): Promise<void> {
  // Every field is passed on purpose. The native AudioMode record has hard
  // defaults, so an omitted key is RESET rather than left alone — a partial
  // call here silently turns background recording back off.
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
    allowsBackgroundRecording: true,
    shouldPlayInBackground: false,
    // Mixable: another app playing audio on a locked phone no longer
    // interrupts the lecture (it used to stop capture until the app reopened).
    interruptionMode: 'mixWithOthers',
    shouldRouteThroughEarpiece: false,
  });
}

export async function releaseLectureAudioSession(): Promise<void> {
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

async function waitForFinalizedFile(uri: string): Promise<number> {
  const deadline = Date.now() + FINALIZE_TIMEOUT_MS;
  let size = 0;
  while (Date.now() < deadline) {
    const info = await FileSystem.getInfoAsync(uri).catch(() => null);
    if (info?.exists && typeof info.size === 'number') {
      size = info.size;
      if (size > MIN_PART_BYTES) return size;
    }
    await sleep(150);
  }
  return size;
}

export class ExpoCaptureEngine implements CaptureEngine {
  readonly kind = 'expo' as const;

  private recorder: NativeRecorder | null = null;
  private listeners = new Set<(event: EngineEvent) => void>();
  private statusSub: { remove(): void } | null = null;
  private finalizeResolver: (() => void) | null = null;

  /** Every recorder operation runs through this chain, one at a time. */
  private op: Promise<void> = Promise.resolve();

  private options: EngineStartOptions | null = null;
  private seq = 0;
  private closedSeconds = 0;
  private capturing = false;
  private paused = false;
  private ended = false;
  private partHasGap = false;
  private samples: MicSample[] = [];
  private micStoppedAt: number | null = null;
  private lastRestartAt = 0;
  private lastInputCheck = 0;
  private inputName: string | null = null;
  private builtIn = false;

  onEvent(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: EngineEvent) {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // A listener failure must never break capture.
      }
    }
  }

  private run(task: () => Promise<void>): Promise<void> {
    const next = this.op.then(task, task);
    this.op = next.catch(() => {});
    return next;
  }

  private ensureRecorder(): NativeRecorder {
    if (this.recorder) return this.recorder;
    const recorder = new AudioModule.AudioRecorder(createRecordingOptions(LECTURE_RECORDING_OPTIONS)) as NativeRecorder;
    this.statusSub = recorder.addListener('recordingStatusUpdate', (status: { isFinished?: boolean }) => {
      if (status?.isFinished) this.finalizeResolver?.();
    });
    this.recorder = recorder;
    return recorder;
  }

  status(): EngineStatus {
    const r = this.recorder;
    let live = 0;
    let levelDb: number | null = null;
    if (r && this.capturing && !this.paused) {
      live = Number.isFinite(r.currentTime) ? r.currentTime : 0;
      const metering = (r.getStatus() as { metering?: number }).metering;
      levelDb = typeof metering === 'number' ? metering : null;
    }
    return {
      capturing: Boolean(r && this.capturing && !this.paused && r.isRecording),
      paused: this.paused,
      closedSeconds: this.closedSeconds,
      livePartSeconds: live,
      levelDb,
      inputName: this.inputName,
      builtInMic: this.builtIn,
      nextSeq: this.seq,
    };
  }

  start(options: EngineStartOptions): Promise<void> {
    return this.run(async () => {
      this.options = options;
      this.seq = options.firstSeq;
      this.closedSeconds = 0;
      this.ended = false;
      this.paused = false;
      this.partHasGap = false;
      await FileSystem.makeDirectoryAsync(options.lectureDirUri, { intermediates: true }).catch(() => {});
      await this.startPart();
    });
  }

  /** Prepare and record a new part, and prove the recorder is really recording. */
  private async startPart(): Promise<void> {
    const recorder = this.ensureRecorder();
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error) {
      this.capturing = false;
      this.emit({ type: 'failure', stage: 'capture_prepare', code: 'START_THREW', message: String(error).slice(0, 120) });
      throw error;
    }
    const until = Date.now() + START_VERIFY_MS;
    while (!recorder.isRecording && Date.now() < until) await sleep(100);
    if (!recorder.isRecording) {
      // AVAudioRecorder refused (typically: asked to start while not in the
      // foreground). expo-audio would still report "recording"; this does not.
      this.capturing = false;
      this.emit({ type: 'failure', stage: 'capture_prepare', code: 'START_NOT_RECORDING' });
      throw Object.assign(new Error('The microphone did not start.'), { code: 'CAPTURE_START_FAILED' });
    }
    this.capturing = true;
    this.samples = [];
    await this.pinBuiltInMic(true);
  }

  /**
   * Stop the recorder and file what it captured as a part. Returns whether a
   * part was saved. Never throws: a part that could not be saved is reported,
   * and the session carries on.
   */
  private async closePart(): Promise<boolean> {
    const recorder = this.recorder;
    const options = this.options;
    if (!recorder || !options) return false;
    const seq = this.seq;
    const cacheUri = recorder.uri;
    // Captured BEFORE stopping: currentTime reads 0 once the recorder stops.
    const seconds = Number.isFinite(recorder.currentTime) ? recorder.currentTime : 0;
    const hasGap = this.partHasGap;

    const finalized = new Promise<void>((resolve) => {
      this.finalizeResolver = resolve;
      setTimeout(resolve, FINALIZE_TIMEOUT_MS);
    });
    await recorder.stop().catch(() => {});
    await finalized;
    this.finalizeResolver = null;
    this.capturing = false;

    if (!cacheUri) return false;
    const size = await waitForFinalizedFile(cacheUri);
    if (size <= MIN_PART_BYTES) {
      await FileSystem.deleteAsync(cacheUri, { idempotent: true }).catch(() => {});
      this.emit({ type: 'failure', stage: 'capture_finalize', code: 'NO_AUDIO_CAPTURED' });
      return false;
    }

    const target = `${options.lectureDirUri}${partFilename(seq)}`;
    try {
      const existing = await FileSystem.getInfoAsync(target);
      if (existing.exists) {
        // Never overwrite a finished part. The sequence moves past it instead.
        this.seq = seq + 1;
        this.emit({ type: 'failure', stage: 'local_commit', code: 'PART_EXISTS' });
        return this.fileAs(cacheUri, seq + 1, seconds, size, hasGap);
      }
      await FileSystem.moveAsync({ from: cacheUri, to: target });
    } catch (error) {
      this.emit({ type: 'failure', stage: 'local_commit', code: 'MOVE_FAILED', message: String(error).slice(0, 120) });
      return false;
    }
    this.seq = seq + 1;
    this.closedSeconds += seconds;
    this.partHasGap = false;
    this.emit({ type: 'partClosed', part: { seq, uri: target, seconds, bytes: size, hasGap } });
    return true;
  }

  private async fileAs(cacheUri: string, seq: number, seconds: number, size: number, hasGap: boolean): Promise<boolean> {
    const options = this.options!;
    const target = `${options.lectureDirUri}${partFilename(seq)}`;
    try {
      await FileSystem.moveAsync({ from: cacheUri, to: target });
    } catch {
      return false;
    }
    this.seq = seq + 1;
    this.closedSeconds += seconds;
    this.partHasGap = false;
    this.emit({ type: 'partClosed', part: { seq, uri: target, seconds, bytes: size, hasGap } });
    return true;
  }

  pause(): Promise<void> {
    return this.run(async () => {
      if (this.ended || this.paused) return;
      // A paused recorder holds an open, unfinished file — the state that loses
      // everything if the phone is killed during a break. The part is closed
      // instead, and a new one starts on resume.
      this.paused = true;
      await this.closePart();
    });
  }

  resume(): Promise<void> {
    return this.run(async () => {
      if (this.ended || !this.paused) return;
      await this.startPart();
      this.paused = false;
    });
  }

  stop(): Promise<void> {
    return this.run(async () => {
      if (this.ended) return;
      this.ended = true;
      if (!this.paused) await this.closePart();
      this.paused = false;
      this.capturing = false;
    });
  }

  restartCapture(): Promise<void> {
    return this.run(async () => {
      if (this.ended || this.paused) return;
      await this.closePart();
      this.partHasGap = true;
      this.lastRestartAt = Date.now();
      await this.startPart();
      if (this.micStoppedAt !== null) {
        this.micStoppedAt = null;
        this.emit({ type: 'micResumed', at: Date.now() });
      }
    });
  }

  tick(appActive: boolean): Promise<void> {
    // Measured outside the op chain so a slow part change never delays it.
    const recorder = this.recorder;
    if (!recorder || this.ended || this.paused || !this.options) return Promise.resolve();
    const now = Date.now();
    const partSeconds = Number.isFinite(recorder.currentTime) ? recorder.currentTime : 0;
    this.samples.push({ at: now, nativeRecording: recorder.isRecording, partSeconds });
    this.samples = this.samples.filter((s) => now - s.at <= DEAD_MIC_AFTER_MS + 5_000);

    const dead = this.capturing ? micIsDead(this.samples, now) : !recorder.isRecording;

    if (dead) {
      if (this.micStoppedAt === null) {
        this.micStoppedAt = now - DEAD_MIC_AFTER_MS;
        this.partHasGap = true;
        this.emit({ type: 'micStopped', at: this.micStoppedAt });
      }
      // In the foreground the part is closed and capture restarted, which iOS
      // allows. In the background nothing is started: expo-audio resumes an
      // interrupted recorder itself when iOS says it may, and the session asks
      // the student when the app comes back.
      if (appActive && now - this.lastRestartAt > RESTART_SPACING_MS) {
        return this.restartCapture().catch(() => {});
      }
      return Promise.resolve();
    }

    if (this.micStoppedAt !== null) {
      // Running again on its own (an interruption that ended).
      this.micStoppedAt = null;
      this.emit({ type: 'micResumed', at: now });
    }

    if (shouldCutPart({ appActive, partSeconds, partLimitSeconds: this.options.partSeconds })) {
      return this.run(async () => {
        if (this.ended || this.paused) return;
        await this.closePart();
        await this.startPart();
      }).catch(() => {});
    }

    if (appActive && now - this.lastInputCheck > INPUT_CHECK_MS) {
      this.lastInputCheck = now;
      void this.pinBuiltInMic(false);
    }
    return Promise.resolve();
  }

  /** Select the phone's own microphone; report what is actually in use. */
  private async pinBuiltInMic(force: boolean): Promise<void> {
    const recorder = this.recorder;
    if (!recorder) return;
    try {
      const current = await recorder.getCurrentInput().catch(() => null) as RecordingInput | null;
      const inputs = (recorder.getAvailableInputs?.() ?? []) as RecordingInput[];
      const phone = builtInMicrophone(inputs);
      if (phone && (force || !current || current.uid !== phone.uid)) {
        recorder.setInput(phone.uid);
      }
      const now = (await recorder.getCurrentInput().catch(() => null)) as RecordingInput | null;
      const name = now?.name ?? phone?.name ?? null;
      const builtIn = Boolean(now && phone && now.uid === phone.uid);
      if (name !== this.inputName || builtIn !== this.builtIn) {
        this.inputName = name;
        this.builtIn = builtIn;
        this.emit({ type: 'inputChanged', name, builtIn });
      }
    } catch {
      // Input selection is an improvement, never a reason to stop recording.
    }
  }

  dispose(): void {
    try {
      this.statusSub?.remove();
    } catch {
      // already gone
    }
    this.statusSub = null;
    try {
      (this.recorder as unknown as { release?: () => void })?.release?.();
    } catch {
      // already released
    }
    this.recorder = null;
    this.listeners.clear();
  }
}

/**
 * Recorder files the OS left behind in Caches/ExpoAudio (a part that was never
 * filed because the app died mid-part). They hold audio, the privacy policy
 * says audio is not kept, and nothing can ever identify whose lecture they
 * were — so after a day they are deleted.
 */
export async function sweepOrphanRecorderFiles(activeUri: string | null, olderThanMs = 24 * 60 * 60 * 1000): Promise<number> {
  const dir = `${FileSystem.cacheDirectory}ExpoAudio/`;
  const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
  let removed = 0;
  for (const name of names) {
    if (!name.startsWith('recording-')) continue;
    const uri = `${dir}${name}`;
    if (activeUri && activeUri.endsWith(name)) continue;
    const info = await FileSystem.getInfoAsync(uri).catch(() => null) as { exists: boolean; modificationTime?: number } | null;
    const modifiedMs = info?.modificationTime ? info.modificationTime * 1000 : null;
    if (info?.exists && modifiedMs !== null && Date.now() - modifiedMs > olderThanMs) {
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      removed += 1;
    }
  }
  return removed;
}
