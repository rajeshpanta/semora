import { useCallback, useSyncExternalStore } from 'react';
import { getLectureSession } from '@/lib/lectureSessionRuntime';
import type { SessionState, StartResult } from '@/lib/lectureSession';

// The recording screen's view of the one recording session.
//
// The session itself lives in lib/lectureSession.ts (logic, tested) and
// lib/lectureSessionRuntime.ts (wiring). It is NOT owned by this hook or by the
// screen: leaving the screen — on purpose, or because a notification, a
// redirect or an update took the student elsewhere — no longer stops the
// microphone. Coming back to the screen shows the recording still running.

export type RecorderPhase = SessionState['phase'];
export type LectureRecorderState = SessionState;

export function useLectureRecorder() {
  const session = getLectureSession();
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);

  const start = useCallback(
    (input: { title: string; courseId: string | null }): Promise<StartResult> => session.start(input),
    [session],
  );
  const pause = useCallback(() => session.pause(), [session]);
  const resume = useCallback(() => session.resume(), [session]);
  const stop = useCallback(() => session.stop('user'), [session]);
  const discard = useCallback(() => session.discard(), [session]);
  const continueRecording = useCallback(() => session.continueRecording(), [session]);
  const acknowledgeFinished = useCallback(() => session.acknowledgeFinished(), [session]);
  const markImportant = useCallback(() => session.markImportant('app'), [session]);

  return { ...state, start, pause, resume, stop, discard, continueRecording, acknowledgeFinished, markImportant };
}
