/**
 * One lecture recording session: the controller.
 *
 * Record Lecture completion plan, Phase 2. This owns everything that happens
 * between "Start recording" and the lecture being handed to the upload queue,
 * and it lives OUTSIDE React (lib/lectureSessionRuntime.ts holds the one
 * instance). The recorder used to live inside the recording screen, so anything
 * that closed that screen — a notification tap, a sign-in redirect, an app
 * update — stopped the microphone mid-lecture.
 *
 * Every side effect arrives through `SessionDeps`, so this file has no
 * react-native or expo imports and is tested for real, with fakes, in
 * lectureSession.test.ts. (The branch this replaces tested a model of the
 * recorder that nothing used; the recorder itself had no tests.)
 */

import {
  addImportantMark,
  capturedSeconds,
  DEFAULT_MAX_RECORDING_SECONDS,
  nearLimit,
  normalizeMeter,
  PART_SECONDS,
  reachedLimit,
  storageAction,
  TOO_QUIET_WINDOW_SECONDS,
  tooQuiet,
  wallClockExceeded,
} from '@/lib/lectureCaptureRules';
import type { CaptureEngine, ClosedPart, EngineEvent } from '@/lib/lectureCapture/types';
import { autoSaveAlert } from '@/lib/lectureAutoSaveCopy';

export type SessionPhase = 'idle' | 'starting' | 'recording' | 'paused' | 'finishing';
export type AutoSaveReason = 'limit' | 'wall_clock' | 'storage' | 'lock_screen_stop';

// ── Words that reach a locked phone ─────────────────────────────────────────
// Posted as local notifications through SessionDeps.notify, and only while the
// app is NOT on screen (on screen, the recorder shows the same thing). The
// runtime translates them; their Spanish lives in lib/i18n/es.ts (merged).
export const CAP_WARNING_NOTICE = {
  title: 'Recording reaches its limit in 5 minutes',
  body: 'Semora will save it automatically',
} as const;
export const TOO_QUIET_NOTICE = {
  title: 'Semora can barely hear the room — move the phone closer',
  body: 'The first minute was almost silent. Take the phone out of the bag or bring it nearer the speaker.',
} as const;
/**
 * Android: the microphone stopped and stayed stopped with the phone locked.
 * The same words the iOS recorder posts natively (nativeEngine passes them as
 * pausedTitle / pausedBody), so they are already translated in es.ts.
 */
export const MIC_PAUSED_NOTICE = {
  title: 'Recording paused',
  body: 'Open Semora to continue recording your lecture.',
} as const;
export const HEADPHONES_NOTICE = {
  title: 'Recording through your headphones — disconnect them to record the room',
  body: 'Your headphones’ microphone is what Semora hears right now.',
} as const;

export interface SessionState {
  phase: SessionPhase;
  lectureId: string | null;
  title: string | null;
  /** Seconds of audio captured — measured by the recorder, never the wall clock. */
  elapsed: number;
  /** 0..1 for the level meter. */
  level: number;
  /** Seconds already closed into parts on this phone — the "every minute saved" receipt. */
  savedSeconds: number;
  partsClosed: number;
  /** When the microphone stopped without being asked, while it is still stopped. */
  micStoppedAt: number | null;
  /** Some audio of this session was lost to an interruption. */
  hadGap: boolean;
  /** Back in the app after a long silent stretch: ask before carrying on. */
  needsDecision: boolean;
  warnedNearLimit: boolean;
  maxSeconds: number;
  /** The last part is still being written to this phone. */
  savingLocally: boolean;
  error: string | null;
  finishedLectureId: string | null;
  autoSaved: AutoSaveReason | null;
  /** The finished recording's limit, kept past the reset for its auto-save notice. */
  finishedMaxSeconds: number | null;
  inputName: string | null;
  usingBuiltInMic: boolean;
  lowStorage: boolean;
  lowBattery: boolean;
  tooQuiet: boolean;
  otherLiveRecording: boolean;
  engineKind: 'expo' | 'native' | null;
  startedAt: number | null;
  /** Wall-clock time the current pause began; null while not paused. */
  pausedAt: number | null;
  /** "Mark important" taps, seconds of captured audio. */
  marks: number[];
  /** The server has the current marks. */
  marksSynced: boolean;
  /**
   * A part of THIS session could not be finished on the phone (the recorder
   * failed to close or file it), so some audio is gone. The screen says so.
   */
  partLost: boolean;
  /**
   * Android 13+: the student refused the notification permission, so the
   * lock-screen recording controls (Pause / Mark / Stop) are not shown.
   */
  notificationsDenied: boolean;
}

export const INITIAL_SESSION_STATE: SessionState = {
  phase: 'idle',
  lectureId: null,
  title: null,
  elapsed: 0,
  level: 0,
  savedSeconds: 0,
  partsClosed: 0,
  micStoppedAt: null,
  hadGap: false,
  needsDecision: false,
  warnedNearLimit: false,
  maxSeconds: DEFAULT_MAX_RECORDING_SECONDS,
  savingLocally: false,
  error: null,
  finishedLectureId: null,
  autoSaved: null,
  finishedMaxSeconds: null,
  inputName: null,
  usingBuiltInMic: false,
  lowStorage: false,
  lowBattery: false,
  tooQuiet: false,
  otherLiveRecording: false,
  engineKind: null,
  startedAt: null,
  pausedAt: null,
  marks: [],
  marksSynced: true,
  partLost: false,
  notificationsDenied: false,
};

export type StartResult =
  | { ok: true; lectureId: string }
  | { ok: false; code?: string; message?: string; status?: number; lectureId?: string };

export interface SessionDeps {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  platformCanRecord(): boolean;
  freeDiskBytes(): Promise<number | null>;
  minFreeBytesToStart: number;
  requestMicPermission(): Promise<boolean>;
  /**
   * Ask for the notification permission where recording needs it (Android
   * 13+, for the foreground service's Pause / Mark / Stop notification). true
   * granted, false refused, null where it does not apply. Asked once.
   */
  requestNotificationPermission(): Promise<boolean | null>;
  appIsActive(): boolean;
  onAppActive(listener: () => void): () => void;
  /**
   * Post a local notification now. Called only while the app is not on
   * screen; the runtime checks again, so a late call cannot double up on
   * what the recorder already shows.
   */
  notify(title: string, body: string): void;
  createEngine(): CaptureEngine;
  audioSession: { activate(): Promise<void>; release(): Promise<void> };
  keepAwake: { activate(): void; deactivate(): void };
  server: {
    start(input: { title: string; courseId: string | null }): Promise<{ lectureId: string; maxSeconds?: number; otherLiveRecording?: boolean }>;
    cancel(lectureId: string): Promise<void>;
    finish(input: { lectureId: string; segmentCount: number; durationSeconds: number }): Promise<void>;
    finalize(lectureId: string): Promise<void>;
    heartbeat(input: { lectureId: string; state: 'recording' | 'paused' | 'stopped'; wallSeconds?: number; capturedSeconds?: number }): Promise<void>;
    /**
     * Remove the lecture from the server, as `ownerId` — the account that
     * recorded it, handed over so a signed-out phone (the locked-keychain
     * window) can still remember the discard and finish it later.
     */
    discard(lectureId: string, ownerId: string | null): Promise<void>;
    /** true once the server holds these marks (or the lecture is gone). */
    addMarks(lectureId: string, marks: number[]): Promise<boolean>;
  };
  currentUserId(): Promise<string | null>;
  lectureDirUri(lectureId: string): string;
  journal: {
    create(ownerId: string, lectureId: string, startedAtMs: number): Promise<void>;
    partSaved(ownerId: string, lectureId: string, part: ClosedPart, firstSeenAt: number): Promise<void>;
    stop(ownerId: string, lectureId: string, expectedParts: number, durationSeconds: number): Promise<void>;
    markStopDeclared(ownerId: string, lectureId: string): Promise<void>;
    saveMarks(ownerId: string, lectureId: string, marks: number[], synced: boolean): Promise<void>;
    discard(lectureId: string): Promise<void>;
  };
  queue: {
    kick(reason: string): void;
    setActiveLecture(lectureId: string | null): void;
  };
  track(event: string, props?: Record<string, unknown>): void;
  /**
   * The phone's OS (the runtime sets it from Platform.OS). Only Android may
   * restart a stopped native microphone from the background: its recorder runs
   * in a foreground service, while iOS refuses a background start.
   */
  platform?: 'ios' | 'android' | 'web';
}

/** Heartbeat to the server while recording or paused. */
export const HEARTBEAT_MS = 60_000;
/** How often storage (and battery) are checked. */
export const RESOURCE_CHECK_MS = 5 * 60_000;
/** Back in the app after the microphone was stopped this long: ask, do not assume. */
export const ASK_AFTER_SILENCE_MS = 15 * 60_000;
/** The server has this long to answer Start before the student is told to try again. */
export const START_TIMEOUT_MS = 15_000;
/** How often a stopped native microphone is restarted (on screen; on Android, always). */
export const RESTART_SPACING_MS = 10_000;
/** Android: a microphone stopped this long with the app off screen is posted, once per stop. */
export const MIC_PAUSED_NOTIFY_AFTER_MS = 30_000;
/** A pause this long is a forgotten recording: saved, not left open. */
export const MAX_PAUSE_MS = 3 * 60 * 60_000;
/**
 * Start was tapped, the server answered, and the phone is now locked: the
 * microphone cannot be opened from the background, so Start waits this long
 * for the app to come back before giving the lecture up.
 */
export const START_APP_ACTIVE_WAIT_MS = 60_000;
/** At Stop, how long the marks and the part count may hold "Saving…" on screen. */
export const STOP_MARKS_TIMEOUT_MS = 5_000;
export const STOP_FINISH_TIMEOUT_MS = 8_000;

type Listener = () => void;

export class LectureSession {
  private state: SessionState = { ...INITIAL_SESSION_STATE };
  private listeners = new Set<Listener>();
  private engine: CaptureEngine | null = null;
  private engineUnsub: (() => void) | null = null;
  private appActiveUnsub: (() => void) | null = null;
  private ownerId: string | null = null;
  private tickHandle: unknown = null;
  private heartbeatHandle: unknown = null;
  private lastTickAt = 0;
  private lastResourceCheckAt = 0;
  /** Tick-based recording time, capped per tick: the fallback when the clock misbehaves. */
  private recordingMs = 0;
  /**
   * Recording time from the phase changes themselves (start, pause, resume,
   * stop, each stamped with deps.now). A suspended JS runtime skips ticks but
   * not these, so a locked phone reports the hours it really ran.
   */
  private recordingSpansMs = 0;
  private recordingSpanStartedAt: number | null = null;
  /** Time spent paused, excluded from the wall-clock cap. */
  private pausedMs = 0;
  private headphonesNotified = false;
  private lastNativeRestartAt = 0;
  /** A Continue is starting a new native capture: its not-yet-active status is expected. */
  private continuing = false;
  /** MIC_PAUSED_NOTICE was posted for the current stop. Cleared when the microphone is back. */
  private micPausedNotified = false;
  /**
   * Closed seconds of native captures that ended without Stop and were
   * started again by Continue. A new native capture counts from zero.
   */
  private carriedClosedSeconds = 0;
  private levelSamples: number[] = [];
  /** Journal writes for closed parts, in order; awaited before Stop commits. */
  private writes: Promise<void> = Promise.resolve();
  /** Pause / resume / stop / discard, one at a time. */
  private op: Promise<unknown> = Promise.resolve();
  private ticking = false;
  /** Highest part seq the engine reported closed in this session, or -1. */
  private highestClosedSeq = -1;
  private closedWaiters: (() => void)[] = [];

  constructor(private deps: SessionDeps) {}

  // ── state ──────────────────────────────────────────────────────────────────
  getState = (): SessionState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** A recording is live or still being committed. */
  isActive(): boolean {
    return this.state.phase !== 'idle';
  }

  /** Capturing or paused: the microphone is the session's. */
  private isLive(): boolean {
    return this.state.phase === 'recording' || this.state.phase === 'paused';
  }

  /**
   * Recording time (pauses excluded), in ms. The span clock is the truth on a
   * phone whose JS runtime slept; the tick clock protects against a wall clock
   * that jumped backwards and shrank the spans. The larger is the honest one.
   */
  private wallRecordingMs(now: number): number {
    const live = this.recordingSpanStartedAt === null ? 0 : Math.max(0, now - this.recordingSpanStartedAt);
    return Math.max(this.recordingMs, this.recordingSpansMs + live);
  }

  private patch(next: Partial<SessionState>) {
    this.state = { ...this.state, ...next };
    for (const l of this.listeners) {
      try {
        l();
      } catch {
        // a UI listener must never break the recording
      }
    }
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.op.then(task, task);
    this.op = run.catch(() => undefined);
    return run;
  }

  // ── start ──────────────────────────────────────────────────────────────────
  async start(input: { title: string; courseId: string | null }): Promise<StartResult> {
    if (this.state.phase !== 'idle') return { ok: false, code: 'ALREADY_RECORDING' };
    this.patch({ ...INITIAL_SESSION_STATE, phase: 'starting' });
    const d = this.deps;

    const fail = (code: string, extra: { message?: string; status?: number; lectureId?: string } = {}): StartResult => {
      this.patch({ ...INITIAL_SESSION_STATE, error: extra.message ?? code });
      d.track('lecture_recording_start_failed', { code, status: extra.status ?? null });
      return { ok: false, code, ...extra };
    };

    if (!d.platformCanRecord()) return fail('WEB_UNSUPPORTED');
    const free = await d.freeDiskBytes().catch(() => null);
    if (free !== null && free < d.minFreeBytesToStart) return fail('NO_SPACE');
    if (!(await d.requestMicPermission().catch(() => false))) return fail('MIC_DENIED');
    // Android 13+: the foreground service's notification IS the lock-screen
    // Pause / Mark / Stop. Refusal is tolerated (the recording goes on) and
    // remembered, so the screen can say those controls are missing.
    const notificationsGranted = await d.requestNotificationPermission().catch(() => null);

    let started: { lectureId: string; maxSeconds?: number; otherLiveRecording?: boolean };
    const startRequest = d.server.start(input);
    try {
      // Bounded: a captive-portal wifi used to hold "Starting…" forever, with
      // every hold that a live recording gets (sign-in redirect, updates).
      started = (await withTimeout(startRequest, START_TIMEOUT_MS, true))!;
    } catch (error) {
      const e = error as { code?: string; message?: string; status?: number; name?: string; lectureId?: string };
      const timedOut = e?.name === 'AbortError' || e?.message === 'timeout';
      if (timedOut) {
        // The request may still land and create a lecture nobody is
        // recording; give it back the moment it does, or the student's next
        // Start would be refused as "a lecture is still processing".
        void startRequest.then((late) => d.server.cancel(late.lectureId)).catch(() => {});
      }
      return fail(
        timedOut ? 'START_TIMEOUT' : (e?.code ?? (e?.status === 401 ? 'AUTH_REQUIRED' : 'START_FAILED')),
        { message: timedOut ? undefined : e?.message, status: e?.status, ...(e?.lectureId ? { lectureId: e.lectureId } : {}) },
      );
    }
    const lectureId = started.lectureId;

    const ownerId = await d.currentUserId().catch(() => null);
    if (!ownerId) {
      await d.server.cancel(lectureId).catch(() => {});
      return fail('AUTH_REQUIRED');
    }
    this.ownerId = ownerId;

    // The server may have taken its 15 seconds on a captive wifi, and the
    // student has pocketed the phone since: a microphone cannot be opened from
    // the background (iOS refuses; the native services need a foreground
    // start). Wait a bounded while for the app to come back, else give the
    // lecture up cleanly rather than "record" nothing.
    if (!d.appIsActive() && !(await this.waitForAppActive(START_APP_ACTIVE_WAIT_MS))) {
      this.ownerId = null;
      await d.server.cancel(lectureId).catch(() => {});
      return fail('APP_NOT_ACTIVE');
    }

    const startedAt = d.now();
    // The queue learns which lecture is live BEFORE its journal exists: a pass
    // that ran between the two used to read a capturing journal with no live
    // recording and declare the lecture interrupted, with a Stop count of 0.
    d.queue.setActiveLecture(lectureId);

    try {
      await d.journal.create(ownerId, lectureId, startedAt);
      await d.audioSession.activate();
      const engine = d.createEngine();
      this.engine = engine;
      this.engineUnsub = engine.onEvent((event) => this.onEngineEvent(event));
      await engine.start({
        lectureId,
        lectureDirUri: d.lectureDirUri(lectureId),
        firstSeq: 0,
        partSeconds: PART_SECONDS,
        title: input.title,
      });
    } catch (error) {
      this.teardownEngine();
      await d.audioSession.release().catch(() => {});
      await d.journal.discard(lectureId).catch(() => {});
      d.queue.setActiveLecture(null);
      await d.server.cancel(lectureId).catch(() => {});
      const e = error as { code?: string; message?: string };
      return fail(e?.code ?? 'CAPTURE_START_FAILED', { message: e?.message });
    }

    d.keepAwake.activate();
    this.recordingMs = 0;
    this.recordingSpansMs = 0;
    this.recordingSpanStartedAt = startedAt;
    this.pausedMs = 0;
    this.lastNativeRestartAt = 0;
    this.micPausedNotified = false;
    this.carriedClosedSeconds = 0;
    this.levelSamples = [];
    this.highestClosedSeq = -1;
    this.headphonesNotified = false;
    this.lastTickAt = startedAt;
    this.lastResourceCheckAt = startedAt;
    this.patch({
      ...INITIAL_SESSION_STATE,
      phase: 'recording',
      lectureId,
      title: input.title,
      notificationsDenied: notificationsGranted === false,
      // The expo engine cannot cut parts while the phone is locked, so a whole
      // locked lecture is one file; past 90 minutes that file is bigger than
      // the server accepts. The native recorder cuts its own parts and may
      // take the server's limit.
      maxSeconds: Math.max(60, Math.min(
        started.maxSeconds ?? DEFAULT_MAX_RECORDING_SECONDS,
        this.engine?.kind === 'native' ? Number.POSITIVE_INFINITY : DEFAULT_MAX_RECORDING_SECONDS,
      )),
      otherLiveRecording: Boolean(started.otherLiveRecording),
      engineKind: this.engine?.kind ?? null,
      startedAt,
    });
    this.startTimers();
    void d.server.heartbeat({ lectureId, state: 'recording' }).catch(() => {});
    d.track('lecture_recording_started', {
      courseAttached: Boolean(input.courseId),
      engine: this.engine?.kind ?? null,
    });
    return { ok: true, lectureId };
  }

  // ── engine events ──────────────────────────────────────────────────────────
  private onEngineEvent(event: EngineEvent) {
    const d = this.deps;
    const lectureId = this.state.lectureId;
    switch (event.type) {
      case 'partClosed': {
        const owner = this.ownerId;
        if (!owner || !lectureId) return;
        const part = event.part;
        // Written to the journal before anything is attempted with it: a part
        // exists the moment its bytes are on disk, whatever the network does.
        this.writes = this.writes
          .then(() => d.journal.partSaved(owner, lectureId, part, d.now()))
          .catch(() => {
            d.track('lecture_part_journal_failed', { seq: part.seq });
          })
          .then(() => d.queue.kick('part_closed'));
        this.highestClosedSeq = Math.max(this.highestClosedSeq, part.seq);
        this.patch({ partsClosed: this.state.partsClosed + 1, hadGap: this.state.hadGap || part.hasGap });
        for (const w of this.closedWaiters.splice(0)) w();
        return;
      }
      case 'micStopped':
        this.patch({ micStoppedAt: event.at, hadGap: true });
        d.track('lecture_capture_stalled', { appActive: d.appIsActive(), engine: this.engine?.kind ?? null });
        return;
      case 'micResumed': {
        const lostSeconds = this.state.micStoppedAt ? Math.round((event.at - this.state.micStoppedAt) / 1000) : null;
        this.micPausedNotified = false;
        this.patch({ micStoppedAt: null, needsDecision: false });
        d.track('lecture_capture_resumed', { lostSeconds, appActive: d.appIsActive() });
        return;
      }
      case 'inputChanged': {
        // Headphones took the input (or the phone's own microphone could not
        // be pinned): on a locked phone nobody would see the recorder's
        // warning, so it is posted once as a notification.
        const lostBuiltIn = !event.builtIn && (this.state.usingBuiltInMic || this.state.inputName === null);
        this.patch({ inputName: event.name, usingBuiltInMic: event.builtIn });
        if (lostBuiltIn && !this.headphonesNotified && this.isLive() && !d.appIsActive()) {
          this.headphonesNotified = true;
          d.notify(HEADPHONES_NOTICE.title, HEADPHONES_NOTICE.body);
        }
        return;
      }
      case 'failure':
        d.track('lecture_capture_failed', { stage: event.stage, code: event.code });
        // The recorder could not close or file a part: that audio is gone, and
        // saying so beats a transcript with a silent hole. capture_prepare
        // failures are start failures and are reported by start() itself.
        if (event.stage === 'capture_finalize' || event.stage === 'local_commit') {
          this.patch({ hadGap: true, partLost: true });
        }
        return;
      case 'stopRequested':
        void this.stop('lock_screen_stop');
        return;
      case 'pauseToggleRequested':
        if (this.state.phase === 'paused') void this.resume();
        else if (this.state.phase === 'recording') void this.pause();
        return;
      case 'markRequested':
        this.markImportant('lock_screen');
        return;
    }
  }

  // ── timers ─────────────────────────────────────────────────────────────────
  private startTimers() {
    const d = this.deps;
    this.stopTimers();
    this.tickHandle = d.setInterval(() => void this.tick(), 1000);
    this.heartbeatHandle = d.setInterval(() => void this.heartbeat(), HEARTBEAT_MS);
    this.appActiveUnsub = d.onAppActive(() => void this.onAppActive());
  }

  private stopTimers() {
    const d = this.deps;
    if (this.tickHandle !== null) d.clearInterval(this.tickHandle);
    if (this.heartbeatHandle !== null) d.clearInterval(this.heartbeatHandle);
    this.tickHandle = null;
    this.heartbeatHandle = null;
    this.appActiveUnsub?.();
    this.appActiveUnsub = null;
  }

  private async heartbeat() {
    const { lectureId, phase } = this.state;
    if (!lectureId || (phase !== 'recording' && phase !== 'paused')) return;
    await this.deps.server.heartbeat({ lectureId, state: phase }).catch(() => {});
    await this.syncMarks();
  }

  // ── mark important ─────────────────────────────────────────────────────────
  /**
   * Mark this moment of the lecture important. The notes make sure what was
   * being said here is covered and flagged, and the quiz tests it. Saved on the
   * phone first; sent now if the network allows, otherwise with the next
   * heartbeat or by the upload queue after Stop.
   */
  markImportant(source: 'app' | 'lock_screen' | 'bar' = 'app'): boolean {
    const { phase, lectureId } = this.state;
    const owner = this.ownerId;
    if ((phase !== 'recording' && phase !== 'paused') || !lectureId || !owner || !this.engine) return false;
    let at = this.state.elapsed;
    try {
      const status = this.engine.status();
      at = capturedSeconds(status.closedSeconds + this.carriedClosedSeconds, status.livePartSeconds);
    } catch {
      // the last tick's figure is close enough
    }
    const marks = addImportantMark(this.state.marks, at);
    if (marks === this.state.marks) return false;
    this.patch({ marks, marksSynced: false });
    this.deps.track('lecture_marked_important', { source, count: marks.length });
    this.writes = this.writes
      .then(() => this.deps.journal.saveMarks(owner, lectureId, marks, false))
      .catch(() => {});
    void this.syncMarks();
    return true;
  }

  private syncingMarks = false;
  private async syncMarks() {
    const { lectureId, marks, marksSynced } = this.state;
    const owner = this.ownerId;
    if (marksSynced || !lectureId || !owner || this.syncingMarks) return;
    this.syncingMarks = true;
    try {
      const ok = await this.deps.server.addMarks(lectureId, marks).catch(() => false);
      // Another tap may have landed meanwhile; only the list that was sent is synced.
      if (ok && this.state.lectureId === lectureId && this.state.marks === marks) {
        this.patch({ marksSynced: true });
        this.writes = this.writes
          .then(() => this.deps.journal.saveMarks(owner, lectureId, marks, true))
          .catch(() => {});
      }
    } finally {
      this.syncingMarks = false;
    }
  }

  /** Runs about once a second. Public for tests. */
  async tick(): Promise<void> {
    if (this.ticking) return;
    const engine = this.engine;
    const { phase } = this.state;
    if (!engine || (phase !== 'recording' && phase !== 'paused')) return;
    this.ticking = true;
    try {
      const d = this.deps;
      const now = d.now();
      const delta = Math.max(0, now - this.lastTickAt);
      this.lastTickAt = now;
      // Time spent RECORDING (pauses excluded). Capped per tick so a suspended
      // JS runtime does not look like hours of recording in one step.
      if (phase === 'recording') this.recordingMs += Math.min(delta, 5_000);
      else this.pausedMs += delta;

      const appActive = d.appIsActive();
      if (phase === 'recording') {
        // While the student is being asked whether to carry on, nothing is
        // restarted on their behalf.
        await engine.tick(appActive && !this.state.needsDecision);
        // The native recorder restarts itself after an interruption, but an
        // interruption iOS never ends (a call that was answered), or a capture
        // thread that died, leaves it stopped for good. With the app on screen
        // that is allowed to be retried, every RESTART_SPACING_MS — and on
        // Android with the phone locked too: its recorder lives in a foreground
        // service that may restart the microphone, and a locked Android phone
        // otherwise recorded nothing for the rest of the lecture.
        // Off screen on Android the recorder already reopens the microphone on
        // its own schedule with a growing backoff; the app only nudges it
        // every minute, so a long call does not become a retry every 10 s.
        const spacing = appActive ? RESTART_SPACING_MS : 60_000;
        if (
          engine.kind === 'native' && (appActive || d.platform === 'android') && !this.state.needsDecision &&
          this.state.micStoppedAt !== null && now - this.lastNativeRestartAt >= spacing
        ) {
          this.lastNativeRestartAt = now;
          await engine.restartCapture().catch(() => {});
        }
      }
      // A concurrent Stop may have taken the engine away during the await;
      // its zeros must not land on the finished state.
      if (this.engine !== engine || this.state.phase !== phase) return;

      const status = engine.status();
      // The native capture is gone (Android: Semora was swiped away). Nothing
      // will restart it on its own and restartCapture has nothing to restart:
      // the clock would freeze on "Recording". Say the microphone stopped and
      // ask; Continue starts a new capture.
      if (phase === 'recording' && engine.kind === 'native' && status.active === false && !this.state.needsDecision && !this.continuing) {
        this.patch({ micStoppedAt: this.state.micStoppedAt ?? now, needsDecision: true, hadGap: true });
        d.track('lecture_capture_ended', { appActive });
      }
      const closedSeconds = status.closedSeconds + this.carriedClosedSeconds;
      const captured = capturedSeconds(closedSeconds, status.livePartSeconds);
      const levelDb = status.levelDb;
      if (phase === 'recording' && levelDb !== null && captured <= TOO_QUIET_WINDOW_SECONDS) {
        this.levelSamples.push(levelDb);
      }
      const quiet = !this.state.tooQuiet && captured >= TOO_QUIET_WINDOW_SECONDS && captured < TOO_QUIET_WINDOW_SECONDS + 5
        ? tooQuiet(this.levelSamples)
        : this.state.tooQuiet;
      const quietNow = quiet && !this.state.tooQuiet;
      const nearNow = !this.state.warnedNearLimit && nearLimit(captured, this.state.maxSeconds);

      this.patch({
        elapsed: captured,
        level: phase === 'recording' ? normalizeMeter(levelDb) : 0,
        savedSeconds: closedSeconds,
        warnedNearLimit: this.state.warnedNearLimit || nearNow,
        tooQuiet: quiet,
      });
      if (quietNow) d.track('lecture_too_quiet', {});
      // With the phone locked, the recorder's warnings reach nobody: a lecture
      // used to be cut at the limit with no word before or after, and a phone
      // in a bag recorded an hour of nothing. Each is said once, as a
      // notification, only while the app is off screen.
      if (!appActive) {
        if (nearNow) d.notify(CAP_WARNING_NOTICE.title, CAP_WARNING_NOTICE.body);
        if (quietNow) d.notify(TOO_QUIET_NOTICE.title, TOO_QUIET_NOTICE.body);
        // Android: a microphone that stays stopped on a locked phone. (The iOS
        // recorder posts the same words itself.) Once per stop.
        const stoppedAt = this.state.micStoppedAt;
        // Not when the capture itself is gone: the recorder already said
        // "Recording stopped because Semora was closed", and "paused" would
        // contradict it.
        if (
          d.platform === 'android' && phase === 'recording' && !this.micPausedNotified &&
          status.active !== false &&
          stoppedAt !== null && now - stoppedAt > MIC_PAUSED_NOTIFY_AFTER_MS
        ) {
          this.micPausedNotified = true;
          d.notify(MIC_PAUSED_NOTICE.title, MIC_PAUSED_NOTICE.body);
        }
      }

      engine.updateActivity?.({
        elapsedSeconds: captured,
        savedSeconds: closedSeconds,
        paused: phase === 'paused',
        micStopped: this.state.micStoppedAt !== null,
      });

      if (phase === 'recording' && reachedLimit(captured, this.state.maxSeconds)) {
        await this.stop('limit');
        return;
      }
      // Pauses do not count against the cap; a pause that itself runs for
      // hours (a phone left in a bag) does.
      if (this.state.startedAt !== null && (wallClockExceeded({
        startedAtMs: this.state.startedAt + this.pausedMs,
        nowMs: now,
        monotonicElapsedMs: this.wallRecordingMs(now),
        maxSeconds: this.state.maxSeconds,
      }) || this.pausedMs > MAX_PAUSE_MS)) {
        await this.stop('wall_clock');
        return;
      }

      if (now - this.lastResourceCheckAt >= RESOURCE_CHECK_MS) {
        this.lastResourceCheckAt = now;
        const action = storageAction(await d.freeDiskBytes().catch(() => null));
        const battery = engine.battery?.() ?? null;
        const lowBattery = Boolean(battery && !battery.charging && battery.level <= 0.1);
        this.patch({ lowStorage: action !== 'ok', lowBattery });
        if (action === 'cut') {
          d.track('lecture_low_storage', {});
          await this.stop('storage');
          return;
        }
        if (battery && !battery.charging && battery.level <= 0.05 && appActive && phase === 'recording') {
          // Close what is recorded so a dying phone loses at most a moment.
          await engine.restartCapture().catch(() => {});
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  private async onAppActive() {
    const d = this.deps;
    const { phase, micStoppedAt } = this.state;
    d.queue.kick('foreground');
    if (phase !== 'recording') return;
    if (micStoppedAt !== null && d.now() - micStoppedAt > ASK_AFTER_SILENCE_MS) {
      this.patch({ needsDecision: true });
      d.track('lecture_capture_decision_needed', { silentSeconds: Math.round((d.now() - micStoppedAt) / 1000) });
      return;
    }
    await this.tick();
  }

  // ── controls ───────────────────────────────────────────────────────────────
  pause(): Promise<void> {
    return this.serialize(async () => {
      if (this.state.phase !== 'recording' || !this.engine || !this.state.lectureId) return;
      const now = this.deps.now();
      this.closeRecordingSpan(now);
      this.patch({ phase: 'paused', level: 0, pausedAt: now });
      await this.engine.pause();
      void this.deps.server.heartbeat({ lectureId: this.state.lectureId, state: 'paused' }).catch(() => {});
    });
  }

  resume(): Promise<void> {
    return this.serialize(async () => {
      if (this.state.phase !== 'paused' || !this.engine || !this.state.lectureId) return;
      try {
        await this.engine.resume();
        // Time the JS runtime slept through while paused is pause, not recording.
        this.pausedMs += Math.max(0, this.deps.now() - this.lastTickAt);
        this.lastTickAt = this.deps.now();
        this.recordingSpanStartedAt = this.lastTickAt;
        this.patch({ phase: 'recording', error: null, pausedAt: null });
        void this.deps.server.heartbeat({ lectureId: this.state.lectureId, state: 'recording' }).catch(() => {});
      } catch {
        this.patch({ error: 'resumeFailed' });
      }
    });
  }

  /** "Continue recording" after coming back to a stopped microphone. */
  continueRecording(): Promise<void> {
    return this.serialize(async () => {
      const engine = this.engine;
      const { lectureId } = this.state;
      if (this.state.phase !== 'recording' || !engine || !lectureId) return;
      this.patch({ needsDecision: false });
      const d = this.deps;
      this.continuing = true;
      try {
        const status = safeStatus(engine);
        if (engine.kind === 'native' && status?.active === false) {
          // The capture ended without Stop: nothing to restart, so a new one
          // is started, numbered after every part that exists, and the time
          // already closed is carried (a new capture counts from zero).
          const firstSeq = Math.max(status.nextSeq, this.highestClosedSeq + 1);
          await engine.start({
            lectureId,
            lectureDirUri: d.lectureDirUri(lectureId),
            firstSeq,
            partSeconds: PART_SECONDS,
            title: this.state.title ?? '',
          });
          this.carriedClosedSeconds += Math.max(0, status.closedSeconds);
          this.micPausedNotified = false;
          this.lastNativeRestartAt = d.now();
          this.patch({ micStoppedAt: null, needsDecision: false, error: null });
          d.track('lecture_capture_started_again', { firstSeq });
        } else {
          await engine.restartCapture();
        }
      } catch {
        this.patch({ error: 'resumeFailed' });
      } finally {
        this.continuing = false;
      }
    });
  }

  stop(reason: 'user' | AutoSaveReason = 'user'): Promise<{ ok: boolean; lectureId: string | null }> {
    return this.serialize(async () => {
      const { phase, lectureId } = this.state;
      if ((phase !== 'recording' && phase !== 'paused') || !lectureId || !this.engine) {
        return { ok: false, lectureId: null };
      }
      const d = this.deps;
      const engine = this.engine;
      const owner = this.ownerId!;
      const stoppedAt = d.now();
      this.closeRecordingSpan(stoppedAt);
      const wallSeconds = Math.round(this.wallRecordingMs(stoppedAt) / 1000);
      // Taken before anything resets the state: the notice quotes THIS limit.
      const maxSeconds = this.state.maxSeconds;
      const appActiveAtStop = d.appIsActive();
      this.patch({ phase: 'finishing', savingLocally: true, level: 0 });
      this.stopTimers();

      // Close the last part, then wait for every closed part's journal write:
      // nothing below may run before the audio is committed on this phone.
      // Close the last part. The count and duration are taken from every
      // source there is — the figures stop returns, the status before and after,
      // and the parts actually reported — and the largest wins: a native
      // recorder's status after stop no longer describes the capture, and a
      // declared count of 0 told the server the lecture had no parts.
      const before = safeStatus(engine);
      const stopped = await engine.stop().catch(() => undefined);
      const after = safeStatus(engine);
      const expectedParts = Math.max(
        stopped?.nextSeq ?? 0, before?.nextSeq ?? 0, after?.nextSeq ?? 0, this.highestClosedSeq + 1,
      );
      // Seconds of native captures that ended and were started again are not
      // in any of these figures.
      const carried = this.carriedClosedSeconds;
      const duration = Math.floor(carried + Math.max(
        stopped?.closedSeconds ?? 0, after?.closedSeconds ?? 0,
        (before?.closedSeconds ?? 0) + (before?.livePartSeconds ?? 0),
      ));
      // The last part's event travels separately from stop's result; give it
      // a moment to arrive before anyone stops listening.
      await this.waitForClosedSeq(expectedParts - 1, 3_000);
      await this.writes;
      this.teardownEngine();
      await d.audioSession.release().catch(() => {});
      d.keepAwake.deactivate();

      // Stop is committed to the journal BEFORE the queue is told nothing is
      // recording: a queue pass in between saw a capturing journal with no live
      // recording and reported the lecture as interrupted.
      await d.journal.stop(owner, lectureId, expectedParts, duration).catch(() => {});
      d.queue.setActiveLecture(null);
      this.patch({ savingLocally: false });

      // A recording that saved itself on a locked phone used to end in
      // silence: the notice on the recorder screen reaches nobody there.
      const saved = reason === 'user' ? null : autoSaveAlert(reason, Math.round(maxSeconds / 60));
      if (saved && !appActiveAtStop) d.notify(saved.title, saved.body);

      // Best effort here; the queue sends it again inside its Stop declaration
      // (declareStop), so a Stop on one bar of wifi is not the last word.
      void d.server.heartbeat({
        lectureId, state: 'stopped', wallSeconds, capturedSeconds: duration,
      }).catch(() => {});

      // Marks, then the count, now if the network allows — each bounded, so a
      // captive campus wifi cannot hold "Saving…" on screen. Whatever does not
      // get through is sent by the queue (the journal says so).
      await withTimeout(this.syncMarks(), STOP_MARKS_TIMEOUT_MS);
      try {
        await withTimeout(
          d.server.finish({ lectureId, segmentCount: expectedParts, durationSeconds: duration }),
          STOP_FINISH_TIMEOUT_MS,
          true,
        );
        await d.journal.markStopDeclared(owner, lectureId).catch(() => {});
        void d.server.finalize(lectureId).catch(() => {});
      } catch {
        // stopDeclared stays false in the journal; the queue retries it.
      }
      d.queue.kick('stopped');

      d.track('lecture_recording_saved', {
        durationSeconds: duration,
        segmentCount: expectedParts,
        interrupted: this.state.hadGap,
        reason,
        engine: engine.kind,
        wallSeconds,
        tickWallSeconds: Math.round(this.recordingMs / 1000),
      });
      this.patch({
        ...INITIAL_SESSION_STATE,
        finishedLectureId: lectureId,
        autoSaved: reason === 'user' ? null : reason,
        finishedMaxSeconds: maxSeconds,
      });
      this.ownerId = null;
      return { ok: true, lectureId };
    });
  }

  /** Abandon: stop capture, and delete every trace of the audio, here and on the server. */
  discard(): Promise<void> {
    return this.serialize(async () => {
      const { lectureId } = this.state;
      const engine = this.engine;
      if (!lectureId || !engine) return;
      const d = this.deps;
      const owner = this.ownerId;
      // The tombstone first: whatever fails below, the queue never touches this
      // lecture again.
      await d.journal.discard(lectureId).catch(() => {});
      this.closeRecordingSpan(d.now());
      this.patch({ phase: 'finishing', level: 0 });
      this.stopTimers();
      await engine.stop().catch(() => {});
      await this.writes;
      // Again: a part closed by the stop above wrote a journal entry.
      await d.journal.discard(lectureId).catch(() => {});
      this.teardownEngine();
      await d.audioSession.release().catch(() => {});
      d.keepAwake.deactivate();
      // Bounded, so an offline discard does not leave "Saving…" on screen; the
      // tombstone already keeps this audio from ever being sent. The owner is
      // handed over and the queue still holds this lecture as live, so the
      // discard is remembered on this phone BEFORE anything can remove the
      // folder it used to be read from.
      await withTimeout(d.server.discard(lectureId, owner), 15_000);
      d.queue.setActiveLecture(null);
      d.track('lecture_recording_discarded', {});
      this.ownerId = null;
      this.patch({ ...INITIAL_SESSION_STATE });
    });
  }

  /** The screen has navigated to the finished lecture. */
  acknowledgeFinished() {
    if (this.state.phase === 'idle' && (this.state.finishedLectureId || this.state.autoSaved)) {
      this.patch({ finishedLectureId: null, autoSaved: null, finishedMaxSeconds: null });
    }
  }

  /**
   * The "recording finished" notice, handed to exactly one caller: the
   * recorder screen if it watched the recording, else the app-wide bar. Two
   * screens used to both act on it.
   */
  takeFinishedNotice(): { lectureId: string; autoSaved: AutoSaveReason | null; maxSeconds: number } | null {
    const { phase, finishedLectureId, autoSaved, finishedMaxSeconds } = this.state;
    if (phase !== 'idle' || !finishedLectureId) return null;
    this.patch({ finishedLectureId: null, autoSaved: null, finishedMaxSeconds: null });
    // The limit the recording ran under, not the default the reset put back.
    return { lectureId: finishedLectureId, autoSaved, maxSeconds: finishedMaxSeconds ?? DEFAULT_MAX_RECORDING_SECONDS };
  }

  dismissError() {
    if (this.state.error) this.patch({ error: null });
  }

  /** Close the open recording span (a pause, a stop) at `now`. */
  private closeRecordingSpan(now: number) {
    if (this.recordingSpanStartedAt === null) return;
    this.recordingSpansMs += Math.max(0, now - this.recordingSpanStartedAt);
    this.recordingSpanStartedAt = null;
  }

  /** true once the app is on screen, false after `timeoutMs` without it. */
  private waitForAppActive(timeoutMs: number): Promise<boolean> {
    const d = this.deps;
    if (d.appIsActive()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const finish = (active: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        unsub();
        resolve(active);
      };
      const unsub = d.onAppActive(() => finish(true));
      const timer = setTimeout(() => finish(d.appIsActive()), timeoutMs);
    });
  }

  private waitForClosedSeq(seq: number, timeoutMs: number): Promise<void> {
    if (seq < 0 || this.highestClosedSeq >= seq) return Promise.resolve();
    return new Promise((resolve) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const finish = () => {
        if (done) return;
        done = true;
        if (timer !== null) clearTimeout(timer);
        resolve();
      };
      const check = () => {
        if (this.highestClosedSeq >= seq) finish();
        else if (!done) this.closedWaiters.push(check);
      };
      this.closedWaiters.push(check);
      timer = setTimeout(finish, timeoutMs);
    });
  }

  private teardownEngine() {
    try {
      this.engineUnsub?.();
    } catch {
      // ignore
    }
    this.engineUnsub = null;
    try {
      this.engine?.dispose();
    } catch {
      // ignore
    }
    this.engine = null;
  }
}

function safeStatus(engine: CaptureEngine) {
  try {
    return engine.status();
  } catch {
    return null;
  }
}

/** Resolves when `task` does, or after `ms`. With `rejectOnTimeout`, a timeout rejects. */
function withTimeout<T>(task: Promise<T>, ms: number, rejectOnTimeout = false): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => (rejectOnTimeout ? reject(new Error('timeout')) : resolve(undefined)), ms);
    task.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); if (rejectOnTimeout) reject(e); else resolve(undefined); },
    );
  });
}
