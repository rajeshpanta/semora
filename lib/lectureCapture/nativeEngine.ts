import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { translate } from '@/lib/i18n';
import type {
  CaptureEngine,
  EngineEvent,
  EngineStartOptions,
  EngineStatus,
} from '@/lib/lectureCapture/types';

// ── Capture with Semora's own recorder (builds from 1.15) ───────────────────
//
// modules/semora-recorder turns the microphone on ONCE, when the student taps
// Start with the app on screen, and keeps it running until Stop — through
// pauses, locked screens and part boundaries. Parts ("chunks") are cut by the
// native recorder itself on a background queue, so nothing is ever started
// while the phone is locked, which is the one thing iOS forbids and the reason
// lectures used to die at 5:00. It also reports real captured seconds, pins
// the phone's microphone, recovers from interruptions and engine resets, keeps
// the lecture folder out of backups, shows a Live Activity with a Stop button,
// and reads the battery.
//
// On a binary without the module (every build before 1.15, Expo Go, web), the
// module is simply absent and lib/lectureSessionRuntime.ts uses expoEngine.

interface NativeStatus {
  capturing: boolean;
  paused: boolean;
  closedSeconds: number;
  liveChunkSeconds: number;
  levelDb: number | null;
  inputName: string | null;
  builtInMic: boolean;
  nextSeq: number;
  /** A capture exists (builds that report it; absent on older ones). */
  active?: boolean;
  batteryLevel: number | null;
  charging: boolean;
}

interface NativeRecorderModule {
  start(options: {
    lectureId: string;
    directory: string;
    firstSeq: number;
    chunkSeconds: number;
    title: string;
    strings: Record<string, string>;
  }): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<{ nextSeq?: number; closedSeconds?: number } | null | void>;
  restart(): Promise<void>;
  getStatus(): NativeStatus;
  excludeFromBackup(uri: string): void;
  updateActivity(state: { elapsedSeconds: number; savedSeconds: number; paused: boolean; micStopped: boolean }): void;
  addListener(event: string, listener: (payload: any) => void): { remove(): void };
}

const native: NativeRecorderModule | null =
  Platform.OS === 'ios' || Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeRecorderModule>('SemoraRecorder')
    : null;

export function isNativeRecorderAvailable(): boolean {
  return native !== null;
}

/**
 * Length of a native chunk. Two minutes: a crash or kill loses at most the
 * chunk being written, and a 3-hour lecture stays at 90 transcription requests
 * (the provider limits requests per minute and per day across the whole app).
 */
export const NATIVE_CHUNK_SECONDS = 120;

class NativeCaptureEngine implements CaptureEngine {
  readonly kind = 'native' as const;
  private listeners = new Set<(event: EngineEvent) => void>();
  private subs: { remove(): void }[] = [];

  constructor(private mod: NativeRecorderModule) {
    const on = (name: string, map: (payload: any) => EngineEvent) => {
      this.subs.push(mod.addListener(name, (payload) => this.emit(map(payload ?? {}))));
    };
    on('onChunkClosed', (p) => ({
      type: 'partClosed',
      part: { seq: Number(p.seq), uri: String(p.uri), seconds: Number(p.seconds) || 0, bytes: Number(p.bytes) || 0, hasGap: Boolean(p.hasGap) },
    }));
    on('onCaptureStopped', (p) => ({ type: 'micStopped', at: Number(p.at) || Date.now() }));
    on('onCaptureResumed', (p) => ({ type: 'micResumed', at: Number(p.at) || Date.now() }));
    on('onInputChanged', (p) => ({ type: 'inputChanged', name: p.name ?? null, builtIn: Boolean(p.builtIn) }));
    on('onFailure', (p) => ({ type: 'failure', stage: p.stage ?? 'capture_prepare', code: String(p.code ?? 'NATIVE_FAILURE'), message: p.message }));
    on('onStopRequested', () => ({ type: 'stopRequested' }));
    on('onPauseToggleRequested', () => ({ type: 'pauseToggleRequested' }));
    on('onMarkRequested', () => ({ type: 'markRequested' }));
  }

  private emit(event: EngineEvent) {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch {
        // never break capture
      }
    }
  }

  onEvent(listener: (event: EngineEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(options: EngineStartOptions) {
    // The Live Activity and the "recording paused" notification are drawn by
    // iOS, outside the app's translation layer, so their words go in with them.
    const tr = (s: string) => translate(s);
    await this.mod.start({
      lectureId: options.lectureId,
      directory: options.lectureDirUri,
      firstSeq: options.firstSeq,
      chunkSeconds: NATIVE_CHUNK_SECONDS,
      title: options.title,
      strings: {
        recording: tr('Recording'),
        paused: tr('Paused'),
        micStopped: tr('Microphone stopped'),
        stop: tr('Stop'),
        pause: tr('Pause'),
        resume: tr('Resume'),
        saved: tr('saved'),
        mark: tr('Mark'),
        channel: tr('Lecture recording'),
        pausedTitle: tr('Recording paused'),
        pausedBody: tr('Open Semora to continue recording your lecture.'),
        closed: tr('Semora closed. Open to check your recording'),
        closedByTask: tr('Recording stopped because Semora was closed'),
        alertChannel: tr('Lecture recording alerts'),
      },
    });
    try {
      this.mod.excludeFromBackup(options.lectureDirUri);
    } catch {
      // an improvement, not a requirement
    }
  }

  pause() { return this.mod.pause(); }
  resume() { return this.mod.resume(); }
  async stop() {
    const r = await this.mod.stop();
    // Builds from before stop returned figures give nothing back.
    if (!r || typeof r !== 'object') return;
    return { nextSeq: Number(r.nextSeq) || 0, closedSeconds: Number(r.closedSeconds) || 0 };
  }
  restartCapture() { return this.mod.restart(); }
  // The native recorder cuts chunks and watches the microphone itself.
  tick() { return Promise.resolve(); }

  status(): EngineStatus {
    const s = this.mod.getStatus();
    return {
      capturing: s.capturing,
      paused: s.paused,
      closedSeconds: s.closedSeconds,
      livePartSeconds: s.liveChunkSeconds,
      levelDb: s.levelDb,
      inputName: s.inputName,
      builtInMic: s.builtInMic,
      nextSeq: s.nextSeq,
      // Older native builds do not report it: unknown, never "ended".
      ...(typeof s.active === 'boolean' ? { active: s.active } : {}),
    };
  }

  battery() {
    const s = this.mod.getStatus();
    return s.batteryLevel === null || s.batteryLevel < 0 ? null : { level: s.batteryLevel, charging: s.charging };
  }

  excludeFromBackup(uri: string) {
    this.mod.excludeFromBackup(uri);
  }

  updateActivity(state: { elapsedSeconds: number; savedSeconds: number; paused: boolean; micStopped: boolean }) {
    try {
      this.mod.updateActivity(state);
    } catch {
      // the Live Activity is decoration; recording goes on without it
    }
  }

  dispose() {
    for (const s of this.subs) {
      try {
        s.remove();
      } catch {
        // already gone
      }
    }
    this.subs = [];
    this.listeners.clear();
  }
}

export function createNativeCaptureEngine(): CaptureEngine | null {
  return native ? new NativeCaptureEngine(native) : null;
}
