/**
 * The contract between a lecture recording session and whatever captures audio.
 *
 * Two implementations:
 *   - expoEngine: expo-audio's recorder, in every app build that exists today
 *     (and so reachable by an over-the-air update).
 *   - nativeEngine: Semora's own recorder module (modules/semora-recorder), in
 *     builds from 1.15. It keeps the microphone running for the whole lecture
 *     and cuts parts itself, so nothing is ever started while the phone is
 *     locked.
 * lib/lectureSession.ts picks the native one when the binary has it.
 */

export interface ClosedPart {
  seq: number;
  /** file:// URI of the finished part, already inside the lecture's folder. */
  uri: string;
  /** Seconds of audio the recorder captured into this part. */
  seconds: number;
  bytes: number;
  /** The recording resumed after an interruption somewhere before or inside this part. */
  hasGap: boolean;
}

export type EngineEvent =
  | { type: 'partClosed'; part: ClosedPart }
  /** Capture stopped without being asked (a call, another app, a dead recorder). */
  | { type: 'micStopped'; at: number }
  /** Capture is running again after micStopped. */
  | { type: 'micResumed'; at: number }
  /** The input device changed or was pinned. */
  | { type: 'inputChanged'; name: string | null; builtIn: boolean }
  /** Something went wrong that the session should record. Never thrown. */
  | { type: 'failure'; stage: 'capture_prepare' | 'capture_finalize' | 'local_commit'; code: string; message?: string }
  /** The native recorder's Live Activity / notification asked to stop. */
  | { type: 'stopRequested' }
  /** The Live Activity / notification asked to pause or resume. */
  | { type: 'pauseToggleRequested' }
  /** The Live Activity / notification asked to mark this moment important. */
  | { type: 'markRequested' };

export interface EngineStatus {
  /** The microphone is running right now. */
  capturing: boolean;
  paused: boolean;
  /** Seconds captured into parts that are closed. */
  closedSeconds: number;
  /** Seconds captured into the part being recorded. */
  livePartSeconds: number;
  /** Input level in dBFS, when metering is available. */
  levelDb: number | null;
  inputName: string | null;
  builtInMic: boolean;
  /** Next sequence number the engine will use. */
  nextSeq: number;
}

export interface EngineStartOptions {
  lectureId: string;
  /** file:// URI of the lecture folder, ending with '/'. */
  lectureDirUri: string;
  firstSeq: number;
  /** Part length while the app is on screen (the native engine uses its own chunks). */
  partSeconds: number;
  title: string;
}

export interface CaptureEngine {
  readonly kind: 'expo' | 'native';
  /** Must be called with the app in the foreground. Throws if capture did not actually start. */
  start(options: EngineStartOptions): Promise<void>;
  pause(): Promise<void>;
  /** Foreground only. */
  resume(): Promise<void>;
  /** Close the live part (emitting partClosed) and end capture. */
  /**
   * Close the last part and release the microphone. The native recorder
   * returns its final figures: after stop its status may no longer describe
   * the capture that just ended.
   */
  stop(): Promise<void | { nextSeq: number; closedSeconds: number }>;
  /** Foreground only: close whatever is left of a stopped microphone and record a new part. */
  restartCapture(): Promise<void>;
  /** Called about once a second by the session. */
  tick(appActive: boolean): Promise<void>;
  status(): EngineStatus;
  onEvent(listener: (event: EngineEvent) => void): () => void;
  /** Release native resources. The engine is not reused afterwards. */
  dispose(): void;
  /** Battery level 0..1 and whether charging, when the engine can read it. */
  battery?(): { level: number; charging: boolean } | null;
  /** Keep the lecture folder out of device backups, when the engine can. */
  excludeFromBackup?(uri: string): void;
  /** Live Activity / lock-screen state, when the engine supports it. */
  updateActivity?(state: { elapsedSeconds: number; savedSeconds: number; paused: boolean; micStopped: boolean }): void;
}
