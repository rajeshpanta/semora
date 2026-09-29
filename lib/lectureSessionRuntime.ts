import { AppState, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import * as Notifications from 'expo-notifications';
import { track } from '@/lib/analytics';
import { translate } from '@/lib/i18n';
import { ensureAndroidChannels, GENERAL_CHANNEL } from '@/lib/notifications';
import { MIN_FREE_BYTES } from '@/lib/lectureRecordingOptions';
import { LectureSession, type SessionDeps } from '@/lib/lectureSession';
import { upsertPart } from '@/lib/lectureJournal';
import { lectureDir, lectureJournalStore } from '@/lib/lectureJournalFs';
import { partFilename } from '@/lib/lectureCaptureRules';
import {
  ExpoCaptureEngine,
  activateLectureAudioSession,
  releaseLectureAudioSession,
} from '@/lib/lectureCapture/expoEngine';
import { createNativeCaptureEngine, isNativeRecorderAvailable } from '@/lib/lectureCapture/nativeEngine';
import {
  journalStop,
  kickUploadQueue,
  setActiveRecordingLecture,
  setBackgroundUploadsAllowed,
  isUploadQueueBusy,
} from '@/lib/lectureUploadQueue';
import {
  cancelLecture,
  currentUserId,
  finalizeLecture,
  finishLecture,
  markLectureDiscarded,
  purgeLectureAudio,
  sendLectureHeartbeat,
  sendLectureImportantMarks,
  startLecture,
} from '@/lib/lectures';

// The one recording session for the whole app, wired to the real phone.
// lib/lectureSession.ts holds the logic (tested); this file only connects it.

const KEEP_AWAKE_TAG = 'semora-lecture-recording';

/**
 * Where Record Lecture is offered.
 *
 * iOS: always. Android: only on a build with Semora's own recorder, because
 * expo-audio pauses recording in the background on Android and cannot restart
 * it there, so a locked Android phone recorded nothing. Web: never — there is
 * no microphone access in the background and no filesystem to keep parts on.
 */
export function canRecordLectures(): boolean {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS === 'android') return isNativeRecorderAvailable();
  return false;
}

/**
 * Android 13+ needs POST_NOTIFICATIONS before the recording service's
 * Pause / Mark / Stop notification is shown at all (the service itself runs
 * without it, silently). The system prompt is shown at most once per launch;
 * later starts report the current answer without asking again.
 */
let notificationPrompt: Promise<boolean> | null = null;
async function requestRecordingNotificationPermission(): Promise<boolean | null> {
  if (Platform.OS !== 'android') return null;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!notificationPrompt) {
      notificationPrompt = Notifications.requestPermissionsAsync().then((r) => r.granted);
    }
    return await notificationPrompt;
  } catch {
    return null;
  }
}

/**
 * A word to a phone that is locked. The session only calls this while the app
 * is off screen; checked again here because the call may land a beat later,
 * and on screen the recorder already shows the same thing.
 */
function notifyLockedPhone(title: string, body: string) {
  if (AppState.currentState === 'active') return;
  void (async () => {
    await ensureAndroidChannels();
    await Notifications.scheduleNotificationAsync({
      content: { title: translate(title), body: translate(body), sound: true },
      trigger: Platform.OS === 'android' ? { channelId: GENERAL_CHANNEL } : null,
    });
  })().catch(() => {
    // a notification that cannot be posted is not a reason to disturb capture
  });
}

const deps: SessionDeps = {
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  platformCanRecord: canRecordLectures,
  freeDiskBytes: async () => {
    const free = await FileSystem.getFreeDiskStorageAsync().catch(() => null);
    return typeof free === 'number' ? free : null;
  },
  minFreeBytesToStart: MIN_FREE_BYTES,
  requestMicPermission: async () => (await requestRecordingPermissionsAsync()).granted,
  requestNotificationPermission: requestRecordingNotificationPermission,
  appIsActive: () => AppState.currentState === 'active',
  onAppActive: (listener) => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') listener();
    });
    return () => sub.remove();
  },
  notify: notifyLockedPhone,
  createEngine: () => createNativeCaptureEngine() ?? new ExpoCaptureEngine(),
  audioSession: {
    // The native recorder owns its own audio session; activating expo-audio's
    // on top of it would reconfigure the session it is recording on.
    activate: () => (isNativeRecorderAvailable() ? Promise.resolve() : activateLectureAudioSession()),
    release: () => (isNativeRecorderAvailable() ? Promise.resolve() : releaseLectureAudioSession()),
  },
  keepAwake: {
    activate: () => {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    },
    deactivate: () => {
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        // never throws in practice; never allowed to break Stop either
      }
    },
  },
  server: {
    start: async (input) => {
      const started = await startLecture(input);
      setBackgroundUploadsAllowed(started.backgroundUploads);
      return started;
    },
    cancel: (lectureId) => cancelLecture(lectureId),
    finish: (input) => finishLecture(input),
    finalize: (lectureId) => finalizeLecture(lectureId),
    heartbeat: (input) => sendLectureHeartbeat(input),
    addMarks: (lectureId, marks) => sendLectureImportantMarks(lectureId, marks),
    discard: async (lectureId, ownerId) => {
      // Storage, then the row (purgeLectureAudio does both, remembers the
      // server side if offline — as the session's owner, before any network
      // call — and deletes the device audio last). The reservation is given
      // back by the row's delete trigger.
      await purgeLectureAudio(lectureId, ownerId);
    },
  },
  currentUserId,
  lectureDirUri: (lectureId) => lectureDir(lectureId),
  journal: {
    create: async (ownerId, lectureId, startedAtMs) => {
      await lectureJournalStore(ownerId, lectureId).update((j) => ({
        ...j, startedAtMs, captureState: 'capturing', stopIntent: false, discardIntent: false,
      }));
    },
    partSaved: async (ownerId, lectureId, part, firstSeenAt) => {
      await lectureJournalStore(ownerId, lectureId).update((j) => upsertPart(j, {
        seq: part.seq,
        relativeFilePath: partFilename(part.seq),
        duration: Math.max(0, Math.round(part.seconds)),
        hasGap: part.hasGap,
        byteLength: part.bytes,
        contentIdentity: null,
        state: 'saved_locally',
        attemptCount: 0,
        nextAttemptAt: null,
        serverSegmentId: null,
        lastAcknowledgment: null,
        lastFailureStage: null,
        firstSeenAt,
      }));
    },
    stop: (ownerId, lectureId, expectedParts, durationSeconds) =>
      journalStop(ownerId, lectureId, expectedParts, durationSeconds),
    markStopDeclared: async (ownerId, lectureId) => {
      await lectureJournalStore(ownerId, lectureId).update((j) => ({ ...j, stopDeclared: true }));
    },
    saveMarks: async (ownerId, lectureId, marks, synced) => {
      await lectureJournalStore(ownerId, lectureId).update((j) => ({
        ...j,
        importantMarks: marks,
        // Never mark an older list synced over a newer unsynced one.
        marksSynced: synced ? (j.importantMarks?.length ?? 0) <= marks.length : false,
      }));
    },
    discard: (lectureId) => markLectureDiscarded(lectureId),
  },
  queue: {
    kick: (reason) => {
      void kickUploadQueue(reason);
    },
    setActiveLecture: (lectureId) => setActiveRecordingLecture(lectureId),
  },
  track: (event, props) => track(event, { screen: 'lecture_record', ...(props ?? {}) }),
  platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
};

let instance: LectureSession | null = null;

export function getLectureSession(): LectureSession {
  if (!instance) instance = new LectureSession(deps);
  return instance;
}

/**
 * A recording is live, being committed, or its audio is still being sent.
 * Nothing may reload the app or replace the screen stack while this is true.
 */
export function isLectureWorkInFlight(): boolean {
  return (instance?.isActive() ?? false) || isUploadQueueBusy();
}
