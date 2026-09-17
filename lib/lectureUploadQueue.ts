import { AppState, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { classifyLectureFailure, segmentSeqFromFilename, type LectureStage } from '@/lib/lectureFailure';
import { trackLectureFailure } from '@/lib/lectureDiagnosticsStore';
import {
  patchPart,
  readJournal,
  reconcileWithFiles,
  withInterruptedCapture,
  withStopIntent,
  type JournalPart,
  type LectureJournal,
} from '@/lib/lectureJournal';
import {
  forgetLectureJournalStore,
  lectureDir,
  lectureDirFilenames,
  lectureJournalFs,
  lectureJournalStore,
} from '@/lib/lectureJournalFs';
import {
  decidePart,
  failureStopsPass,
  folderIsFinished,
  MAX_PART_ATTEMPTS,
  mayDeleteLocalCopy,
  nextAttemptDelayMs,
  type ServerPartStatus,
} from '@/lib/lectureQueueRules';
import { partFilename, partStoragePath } from '@/lib/lectureCaptureRules';

// ── The lecture upload queue ────────────────────────────────────────────────
//
// ONE worker for the whole app, outliving every screen. It delivers audio that
// is saved on this phone to the server, and it is driven by what is ON THE
// PHONE — the journal written next to the audio the moment each part is saved —
// not by what the server has heard of. A part whose upload failed while the
// student was signed out on a locked phone left no server row at all, and the
// old retry, which looked for server rows, never found it again.
//
// Rules (lib/lectureQueueRules.ts, tested): uploads only as the account that
// recorded; never a discarded lecture; bounded retries, then "needs attention";
// the phone's copy is deleted only once the server has TRANSCRIBED the part;
// a lecture's folder is removed once nothing in it is left to deliver; audio
// that cannot be delivered for 7 days (from when the queue first saw it) is
// deleted, because the privacy policy says audio is not kept.
//
// Transfer: expo-file-system uploadAsync, from the FILE, as a background
// session. The old path read the whole part into JavaScript as base64 — fine
// at 1.2 MB, a memory kill at the 20 MB a locked-phone part can now reach —
// and could not continue while the app was suspended.
//
// Transcription is NOT this queue's job. After a part is uploaded it asks the
// server once, with a timeout, and does not wait: the server's every-minute
// arrival job transcribes any audio that lands whether or not that request gets
// through. A transcription call that hung for 23 minutes used to hold up every
// later part behind it.

export interface LectureLocalProgress {
  /** Parts known on this phone, including ones already delivered. */
  total: number;
  /** Still on this phone, not yet received by the server. */
  waiting: number;
  /** Received by the server (uploaded or transcribed). */
  received: number;
  transcribed: number;
  /** Parts that stopped retrying on their own and need the student. */
  needsAttention: number;
  /** Parts waiting only because nobody (or someone else) is signed in. */
  waitingForSignIn: number;
  /** What the phone declared at Stop, or null when it never got to say. */
  expected: number | null;
  /**
   * The student pressed Stop on THIS phone (the journal's stopIntent), whether
   * or not the server has heard so yet. A lecture the server still calls
   * "recording" because the stopped heartbeat is stuck on one bar of wifi is
   * stopped all the same.
   */
  stopped: boolean;
}

type Listener = () => void;

const CAN_RUN = Platform.OS !== 'web';
const LECTURE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** How long the transcription nudge may take before it is abandoned (the server will transcribe anyway). */
const NUDGE_TIMEOUT_MS = 30_000;
/** Parts of one lecture sent at the same time. */
const UPLOAD_CONCURRENCY = 3;

let running: Promise<void> | null = null;
let rerun = false;
/** Last moment a pass did something (started, decided a part, moved bytes). */
let lastActivityAt = 0;
/** The soonest a waiting part may be retried, across every lecture seen this pass. */
let nextRetryAt: number | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** No upload progress for this long, with the app on screen: give up on it and retry later. */
const UPLOAD_STALL_MS = 90_000;
/** A pass with no activity for this long is stuck on the network, not sending. */
const BUSY_WINDOW_MS = 3 * 60_000;
let activeLectureId: string | null = null;
/**
 * Passes in a row that ended on a failed server read (no network). Each one
 * pushes the retry timer further out (30 s → 30 min), so a phone that is
 * offline for a day does not poll every minute for the life of the app. Reset
 * by a server read that works, and by any kick that is not the timer's own.
 */
let networkFailures = 0;
const progress = new Map<string, LectureLocalProgress>();
const listeners = new Set<Listener>();
/** Lectures whose deletion is in progress: never touched again this launch. */
const cancelled = new Set<string>();

/** A recording the app was killed in the middle of, found on a later launch. */
export interface InterruptedRecordingNotice {
  lectureId: string;
  startedAtMs: number | null;
  savedSeconds: number;
  parts: number;
}
const notices: InterruptedRecordingNotice[] = [];

/** Take the notices nobody has shown yet. */
export function takeInterruptedRecordingNotices(): InterruptedRecordingNotice[] {
  return notices.splice(0, notices.length);
}

function publish() {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // ignore
    }
  }
}

export function subscribeUploadQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLectureLocalProgress(lectureId: string | null | undefined): LectureLocalProgress | null {
  return lectureId ? progress.get(lectureId) ?? null : null;
}

/** The lecture being recorded right now; its folder is never cleaned up mid-recording. */
export function setActiveRecordingLecture(lectureId: string | null) {
  activeLectureId = lectureId;
}

/**
 * Ask the queue to run. Safe to call as often as anything likes: one pass runs
 * at a time, and a request that arrives during a pass makes it run once more.
 */
export function kickUploadQueue(reason: string): Promise<void> {
  if (!CAN_RUN) return Promise.resolve();
  // Something changed (foreground, network, sign-in, a part closed): the
  // back-off was about the network as it was, not as it is now.
  if (reason !== 'retry') networkFailures = 0;
  if (running) {
    rerun = true;
    return running;
  }
  lastActivityAt = Date.now();
  running = (async () => {
    do {
      rerun = false;
      nextRetryAt = null;
      await runPass(reason).catch(() => {});
    } while (rerun);
  })().finally(() => {
    running = null;
    scheduleRetry();
  });
  return running;
}

/**
 * Parts whose back-off has not elapsed used to wait for the next kick (a
 * foreground, a network change), which on a pocketed phone could be hours.
 * One timer for the soonest of them keeps retries going while the app lives.
 */
function scheduleRetry() {
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (nextRetryAt === null) return;
  // Never sooner than 30 s: offline, a pass fails before any part's back-off
  // advances, and a 1-second retry loop would hammer a network that is not there.
  let delay = Math.max(30_000, Math.min(nextRetryAt - Date.now(), 30 * 60_000));
  // …and with the network gone pass after pass, further out each time.
  if (networkFailures > 0) delay = Math.max(delay, Math.min(nextAttemptDelayMs(networkFailures), 30 * 60_000));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void kickUploadQueue('retry');
  }, delay);
}

/**
 * True while a pass is actively sending audio. An app update must not reload
 * the app under it. Parts that are only waiting (for a network, for sign-in, or
 * for the student's attention) do not count, so an update is never blocked
 * forever by audio that cannot currently move.
 */
export function isUploadQueueBusy(): boolean {
  return running !== null && Date.now() - lastActivityAt < BUSY_WINDOW_MS;
}

/** Wait for any pass in flight to finish (used before deleting a lecture). */
export async function waitForUploadQueueIdle(): Promise<void> {
  while (running) await running.catch(() => {});
}

/** Stop the queue touching a lecture for the rest of this launch. */
export function cancelLectureUploads(lectureId: string) {
  cancelled.add(lectureId);
  progress.delete(lectureId);
  publish();
}

/** The student asked to try again: parts that stopped retrying get a fresh set of attempts. */
export async function retryLectureUploads(lectureId: string): Promise<void> {
  const found = await readJournal(lectureJournalFs, lectureDir(lectureId)).catch(() => null);
  if (found) {
    const store = lectureJournalStore(found.journal.ownerId, lectureId);
    await store.update((j) => ({
      ...j,
      parts: j.parts.map((p) =>
        p.state === 'transcribed' || p.writtenOff ? p : { ...p, attemptCount: 0, nextAttemptAt: null, state: p.state === 'quarantined' && p.lastFailureStage !== 'local_commit' ? 'saved_locally' : p.state }),
    })).catch(() => {});
  }
  await kickUploadQueue('manual_retry');
}

async function listLocalLectureIds(): Promise<string[]> {
  const root = `${FileSystem.documentDirectory}lectures/`;
  const names = await FileSystem.readDirectoryAsync(root).catch(() => [] as string[]);
  return names.filter((name) => LECTURE_ID.test(name));
}

async function signedInUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  return data.session?.user.id ?? null;
}

/**
 * `lectures/null/` holds parts an older app version filed after Stop had
 * already cleared the lecture id. Nothing can say whose lecture they were, so
 * they are never uploaded; the privacy policy says audio is not kept, so they
 * are deleted 7 days after this app first finds them.
 */
async function sweepUnattributableAudio(): Promise<void> {
  const dir = `${FileSystem.documentDirectory}lectures/null/`;
  const info = await FileSystem.getInfoAsync(dir).catch(() => null);
  if (!info?.exists) return;
  const { getDeviceItem, setDeviceItem } = await import('@/lib/deviceStore');
  const key = 'semora_lecture_null_folder_first_seen';
  const firstSeen = Number(getDeviceItem(key) ?? '');
  if (!Number.isFinite(firstSeen) || firstSeen <= 0) {
    setDeviceItem(key, String(Date.now()));
    return;
  }
  if (Date.now() - firstSeen > 7 * 24 * 60 * 60 * 1000) {
    await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
    track('lecture_unattributable_audio_deleted', { screen: 'upload_queue' });
  }
}

async function runPass(reason: string): Promise<void> {
  const userId = await signedInUserId();
  // Deletions made offline, finished as their owner (never as anyone else).
  if (userId) {
    const { replayPendingDiscards } = await import('@/lib/lectures');
    await replayPendingDiscards(userId).catch(() => {});
  }
  const ids = await listLocalLectureIds();
  for (const lectureId of ids) {
    if (cancelled.has(lectureId)) continue;
    lastActivityAt = Date.now();
    const stop = await processLecture(lectureId, userId).catch(() => false);
    if (stop) break;
  }
  if (reason !== 'part_closed') {
    // Recorder files left in Caches by a part that never got filed.
    const { sweepOrphanRecorderFiles } = await import('@/lib/lectureCapture/expoEngine');
    await sweepOrphanRecorderFiles(null).catch(() => 0);
    await sweepUnattributableAudio().catch(() => {});
  }
  publish();
}

/** Returns true when a failure means the rest of the pass should wait. */
async function processLecture(lectureId: string, userId: string | null): Promise<boolean> {
  const dirUri = lectureDir(lectureId);
  const filenames = await lectureDirFilenames(lectureId);
  const audioFiles = filenames.filter((n) => segmentSeqFromFilename(n) !== null);

  let found = await readJournal(lectureJournalFs, dirUri).catch(() => null);
  if (!found) {
    // Audio from before the journal existed. Its owner can only be learned
    // from the server, and only as the owner: row-level security hides other
    // people's lectures. Nothing is guessed and nothing is deleted.
    if (!userId || audioFiles.length === 0) return false;
    const { data, error } = await supabase
      .from('lecture_recordings').select('id, user_id, status, segment_count, duration_seconds, capture_state')
      .eq('id', lectureId).maybeSingle();
    if (error || !data || data.user_id !== userId) return false;
    const store = lectureJournalStore(userId, lectureId);
    // A lecture the server already knows is over is not "interrupted": its
    // Stop is seeded from the server's declaration, so the student is not told
    // a normally-stopped lecture was cut short (a journal lost to corruption).
    const over = data.status !== 'recording' || data.capture_state === 'stopped' || (data.segment_count ?? 0) > 0;
    await store.update((j) => ({
      ...reconcileWithFiles(j, filenames, Date.now(), { addUnknownFiles: activeLectureId !== lectureId }),
      ...(over ? {
        stopIntent: true,
        stopDeclared: (data.segment_count ?? 0) > 0,
        finalExpectedParts: (data.segment_count ?? 0) > 0 ? data.segment_count : null,
        recordedDuration: data.duration_seconds ?? 0,
      } : {}),
    }));
    found = await readJournal(lectureJournalFs, dirUri).catch(() => null);
    if (!found) return false;
  }

  const ownerId = found.journal.ownerId;
  const store = lectureJournalStore(ownerId, lectureId);
  // The live lecture's own recorder journals its parts; only vanished files
  // are reconciled for it (see reconcileWithFiles).
  let journal: LectureJournal = await store.update((j) =>
    reconcileWithFiles(j, filenames, Date.now(), { addUnknownFiles: activeLectureId !== lectureId }));

  if (journal.discardIntent) {
    progress.delete(lectureId);
    if (activeLectureId !== lectureId) await removeFolder(lectureId);
    return false;
  }

  // Capture that never reached Stop and is not being recorded now: the app was
  // killed mid-lecture (or the phone died). What was saved is real and is
  // finished like any other recording; how many parts were MEANT to be recorded
  // is unknown, so the count is what exists, and the student is told.
  if (!journal.stopIntent && journal.captureState === 'capturing' && activeLectureId !== lectureId) {
    const parts = journal.parts.reduce((max, p) => Math.max(max, p.seq + 1), 0);
    const savedSeconds = journal.parts.reduce((sum, p) => sum + (p.duration || 0), 0);
    if (parts === 0 && audioFiles.length === 0) {
      // Nothing was ever saved: Start, then the app was killed inside the
      // first part (or Stop came within a second). Declaring a 0-part Stop
      // left a server ghost that was never swept and, on a free account,
      // blocked the next recording. Abandon it instead — the row goes, the
      // reservation comes back — and there is nothing to tell the student.
      const { addPendingDiscard, cancelLecture, discardLectureOnServer, removePendingDiscard } = await import('@/lib/lectures');
      await store.update((j) => ({ ...j, discardIntent: true, captureState: 'discarded' })).catch(() => {});
      // Remembered first, so an offline launch finishes it next time it is online.
      addPendingDiscard(lectureId, ownerId);
      if (userId === ownerId) {
        await cancelLecture(lectureId);
        if (await discardLectureOnServer(lectureId).catch(() => false)) removePendingDiscard(lectureId);
      }
      track('lecture_capture_empty_abandoned', { screen: 'upload_queue' });
      progress.delete(lectureId);
      await removeFolder(lectureId);
      publish();
      return false;
    }
    journal = await store.update((j) => ({
      ...withInterruptedCapture(j),
      stopIntent: true,
      stopDeclared: false,
      finalExpectedParts: parts > 0 ? parts : null,
      recordedDuration: savedSeconds,
    }));
    if (parts > 0) {
      notices.push({ lectureId, startedAtMs: journal.startedAtMs ?? null, savedSeconds, parts });
      track('lecture_capture_interrupted_recovered', { screen: 'upload_queue', parts, savedSeconds });
      const { sendLectureHeartbeat } = await import('@/lib/lectures');
      void sendLectureHeartbeat({ lectureId, state: 'stopped', capturedSeconds: savedSeconds });
    }
    publish();
  }

  // Only the owner can read the server's side. Anyone else: keep everything,
  // report it as waiting for sign-in, do nothing.
  if (!userId || userId !== ownerId) {
    setProgress(lectureId, journal, { waitingForSignIn: true });
    return false;
  }

  // Server state for this lecture, one query each. A failure here means the
  // network is the problem: nothing is decided from silence.
  const [{ data: lectureRow, error: lectureErr }, { data: rows, error: rowsErr }] = await Promise.all([
    supabase.from('lecture_recordings').select('id, status').eq('id', lectureId).maybeSingle(),
    supabase.from('lecture_segments').select('seq, status, storage_path, recovery_attempts').eq('lecture_id', lectureId),
  ]);
  if (lectureErr || rowsErr) {
    networkFailures += 1;
    setProgress(lectureId, journal, {});
    return true;
  }
  networkFailures = 0;
  if (!lectureRow) {
    // The owner is signed in and the lecture is gone: it was deleted (perhaps
    // on another device). Its audio goes too.
    progress.delete(lectureId);
    if (activeLectureId !== lectureId) await removeFolder(lectureId);
    return false;
  }
  type ServerRow = { seq: number; status: ServerPartStatus; storage_path: string | null; recovery_attempts?: number | null };
  const bySeq = new Map<number, ServerRow>();
  for (const r of (rows ?? []) as ServerRow[]) {
    bySeq.set(r.seq, r);
  }
  const lectureStatus = (lectureRow as { status?: string | null }).status ?? null;

  // The Stop count, for a phone that could not reach the server when Stop was
  // pressed. Sent before the parts: the server only finishes a lecture once it
  // has the count AND every counted part has arrived, so an early count is
  // never premature — and without it the server cannot tell "still recording"
  // from "done" and waits far longer.
  if (journal.stopIntent && journal.stopDeclared === false) {
    const declared = await declareStop(lectureId, journal);
    if (declared) journal = await store.update((j) => ({ ...j, stopDeclared: true }));
  }

  // "Mark important" taps made offline (145). Before the parts: notes are
  // written once the last part is transcribed, and marks that arrive after
  // that change nothing. Never holds anything up — a failure is retried on the
  // next pass, and the folder's cleanup does not wait for it.
  if (journal.marksSynced === false && journal.importantMarks?.length && activeLectureId !== lectureId) {
    const { sendLectureImportantMarks } = await import('@/lib/lectures');
    const sent = journal.importantMarks;
    if (await sendLectureImportantMarks(lectureId, sent)) {
      journal = await store.update((j) => ({ ...j, marksSynced: j.importantMarks === sent || (j.importantMarks?.length ?? 0) <= sent.length }));
    }
  }

  const toUpload: JournalPart[] = [];
  for (const part of [...journal.parts].sort((a, b) => a.seq - b.seq)) {
    if (cancelled.has(lectureId)) return false;
    const row = bySeq.get(part.seq);
    let objectExists: boolean | null = null;
    if (row?.status === 'uploaded') {
      const { data } = await supabase.storage.from('lectures').exists(partStoragePath(ownerId, lectureId, part.seq))
        .catch(() => ({ data: null }));
      objectExists = typeof data === 'boolean' ? data : null;
    }
    const decision = decidePart({
      journalOwnerId: ownerId,
      signedInUserId: userId,
      discardIntent: journal.discardIntent,
      part,
      server: { status: row?.status ?? 'none', objectExists, recoveryAttempts: row?.recovery_attempts ?? null, lectureStatus },
      now: Date.now(),
    });

    const fileUri = `${dirUri}${partFilename(part.seq)}`;
    if (mayDeleteLocalCopy(decision)) {
      await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
    }

    if (decision.action === 'transcribed') {
      if (part.state !== 'transcribed') {
        journal = await store.update((j) => patchPart(j, part.seq, { state: 'transcribed', lastAcknowledgment: 'done' }));
      }
    } else if (decision.action === 'received') {
      if (part.state !== 'server_received') {
        journal = await store.update((j) => patchPart(j, part.seq, { state: 'server_received', lastAcknowledgment: row?.status ?? null }));
      }
    } else if (decision.action === 'expired') {
      journal = await store.update((j) => patchPart(j, part.seq, { state: 'quarantined', lastFailureStage: 'local_commit' }));
      track('lecture_part_expired', { screen: 'upload_queue', seq: part.seq });
    } else if (decision.action === 'written_off') {
      // 'register', not 'local_commit': the file is still here and a manual
      // retry (retryLectureUploads) may send it again; the student sees
      // "needs attention" instead of a silent week-long re-upload loop.
      if (part.state !== 'quarantined') {
        journal = await store.update((j) => patchPart(j, part.seq, { state: 'quarantined', lastFailureStage: 'register', nextAttemptAt: null, writtenOff: true }));
        track('lecture_part_written_off', { screen: 'upload_queue', seq: part.seq, serverAttempts: row?.recovery_attempts ?? null, lectureStatus });
      }
    } else if (decision.action === 'upload') {
      toUpload.push(part);
    }
  }

  // Up to UPLOAD_CONCURRENCY parts at once. Sequential uploads meant that when
  // the student pressed Stop and put the phone away, only the part in flight
  // was handed to the system's background transfer; the rest waited for the
  // app to be opened again. Several at once hands them all over while the app
  // is still awake.
  let stopPass = false;
  const next = () => toUpload.shift();
  const worker = async () => {
    for (let part = next(); part && !stopPass && !cancelled.has(lectureId); part = next()) {
      const fileUri = `${dirUri}${partFilename(part.seq)}`;
      const outcome = await uploadPart(ownerId, lectureId, part, fileUri);
      if (outcome.ok) {
        journal = await store.update((j) => patchPart(j, part!.seq, {
          state: outcome.acknowledged ? 'server_received' : 'awaiting_ack',
          serverSegmentId: outcome.segmentId,
          lastAcknowledgment: outcome.acknowledged ? 'uploaded' : null,
          nextAttemptAt: null,
          lastFailureStage: null,
        }));
        setProgress(lectureId, journal, {});
        publish();
        continue;
      }
      const failure = classifyLectureFailure(outcome.error, outcome.stage);
      const attempt = part.attemptCount + 1;
      trackLectureFailure('lecture_segment_upload_failed', 'upload_queue', failure, part.seq, attempt);
      const seq = part.seq;
      journal = await store.update((j) => patchPart(j, seq, {
        attemptCount: attempt,
        lastFailureStage: failure.stage,
        state: failure.retry === 'permanent' ? 'quarantined' : (j.parts.find((p) => p.seq === seq)?.state ?? 'saved_locally'),
        nextAttemptAt: failure.retry === 'permanent' ? null : Date.now() + nextAttemptDelayMs(attempt),
      }));
      if (attempt === MAX_PART_ATTEMPTS) {
        track('lecture_part_needs_attention', { screen: 'upload_queue', seq, stage: failure.stage, code: failure.code });
      }
      if (failureStopsPass(failure.retry)) stopPass = true;
    }
  };
  await Promise.all(Array.from({ length: UPLOAD_CONCURRENCY }, worker));
  // Workers each kept their own last snapshot; the store (one serialized chain
  // per lecture) holds the true one.
  journal = await store.read();
  if (stopPass) {
    setProgress(lectureId, journal, {});
    return true;
  }

  setProgress(lectureId, journal, {});

  const remaining = (await lectureDirFilenames(lectureId)).filter((n) => segmentSeqFromFilename(n) !== null).length;
  if (
    activeLectureId !== lectureId &&
    (journal.stopIntent || journal.captureState === 'interrupted') &&
    journal.stopDeclared !== false &&
    folderIsFinished({ audioFilesPresent: remaining, discardIntent: journal.discardIntent, parts: journal.parts })
  ) {
    progress.delete(lectureId);
    await removeFolder(lectureId);
  }
  return false;
}

function setProgress(lectureId: string, journal: LectureJournal, flags: { waitingForSignIn?: boolean }) {
  const parts = journal.parts;
  if (!flags.waitingForSignIn) {
    for (const p of parts) {
      if (p.state === 'server_received' || p.state === 'transcribed' || p.state === 'quarantined') continue;
      if (p.attemptCount >= MAX_PART_ATTEMPTS) continue;
      const at = p.nextAttemptAt ?? Date.now() + 60_000;
      if (nextRetryAt === null || at < nextRetryAt) nextRetryAt = at;
    }
  }
  const received = parts.filter((p) => p.state === 'server_received' || p.state === 'transcribed').length;
  const transcribed = parts.filter((p) => p.state === 'transcribed').length;
  const waiting = parts.filter((p) => p.state !== 'server_received' && p.state !== 'transcribed' && p.state !== 'quarantined').length;
  progress.set(lectureId, {
    total: parts.length,
    waiting,
    received,
    transcribed,
    // Written-off parts are not "attention": there is nothing a retry can do.
    needsAttention: parts.filter((p) => p.state !== 'transcribed' && p.state !== 'server_received' && !p.writtenOff &&
      (p.attemptCount >= MAX_PART_ATTEMPTS || (p.state === 'quarantined' && p.lastFailureStage !== 'local_commit'))).length,
    waitingForSignIn: flags.waitingForSignIn ? waiting : 0,
    expected: journal.finalExpectedParts,
    stopped: journal.stopIntent,
  });
}

async function removeFolder(lectureId: string) {
  await FileSystem.deleteAsync(lectureDir(lectureId), { idempotent: true }).catch(() => {});
  forgetLectureJournalStore(lectureId);
}

type UploadOutcome =
  | { ok: true; acknowledged: boolean; segmentId: string | null }
  | { ok: false; error: unknown; stage: LectureStage };

/**
 * Deliver one part: describe it on the server, send its bytes from the file,
 * acknowledge, and nudge transcription without waiting for it.
 *
 * The row and the path are ALWAYS the journal owner's. The old uploader built
 * both from whoever was signed in at the time.
 */
async function uploadPart(ownerId: string, lectureId: string, part: JournalPart, fileUri: string): Promise<UploadOutcome> {
  const info = await FileSystem.getInfoAsync(fileUri).catch(() => null);
  if (!info?.exists) {
    return { ok: false, error: Object.assign(new Error('file does not exist'), { code: 'LOCAL_FILE_MISSING' }), stage: 'local_commit' };
  }

  const storagePath = partStoragePath(ownerId, lectureId, part.seq);
  const { data: row, error: rowErr } = await supabase
    .from('lecture_segments')
    .upsert(
      {
        lecture_id: lectureId,
        user_id: ownerId,
        seq: part.seq,
        seconds: Math.max(0, Math.round(part.duration || 0)),
        storage_path: storagePath,
        status: 'pending',
        has_gap: part.hasGap ?? false,
      },
      { onConflict: 'lecture_id,seq' },
    )
    .select('id, status')
    .single();
  if (rowErr || !row) return { ok: false, error: rowErr ?? new Error('Could not save the recording segment.'), stage: 'register' };
  if (row.status === 'done' || row.status === 'transcribing') {
    // Already the server's (the arrival job got there first). Nothing to send.
    return { ok: true, acknowledged: true, segmentId: row.id };
  }

  // Create-only: a part the server already has is never overwritten. A retry
  // whose first attempt landed gets "already exists", which is success.
  const { data: signed, error: signedErr } = await supabase.storage
    .from('lectures')
    .createSignedUploadUrl(storagePath, { upsert: false });
  if (signedErr || !signed) {
    if (/exist/i.test(String((signedErr as { message?: string } | null)?.message ?? ''))) {
      // fall through to acknowledge
    } else {
      return { ok: false, error: signedErr ?? new Error('Could not prepare the upload.'), stage: 'sign_url' };
    }
  } else {
    try {
      // With the app on screen, an upload that moves no bytes for
      // UPLOAD_STALL_MS is abandoned and retried with back-off (a captive
      // portal, a dead wifi). In the background the system's transfer service
      // owns it and waits for a network, which is the point of it.
      let lastProgressAt = Date.now();
      const task = FileSystem.createUploadTask(signed.signedUrl, fileUri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        sessionType: (await backgroundUploadsAllowed())
          ? FileSystem.FileSystemSessionType.BACKGROUND
          : FileSystem.FileSystemSessionType.FOREGROUND,
        headers: { 'Content-Type': 'audio/m4a', 'x-upsert': 'false' },
      }, () => {
        lastProgressAt = Date.now();
        lastActivityAt = lastProgressAt;
      });
      // Time in the background does not count: the system may have been
      // moving bytes without telling JS. The clock restarts on return.
      const onActive = AppState.addEventListener('change', (next) => {
        if (next === 'active') lastProgressAt = Date.now();
      });
      const watchdog = setInterval(() => {
        if (AppState.currentState === 'active' && Date.now() - lastProgressAt > UPLOAD_STALL_MS) {
          void task.cancelAsync().catch(() => {});
        }
      }, 15_000);
      let result: { status: number; body?: string } | null | undefined;
      try {
        result = await task.uploadAsync();
      } finally {
        clearInterval(watchdog);
        onActive.remove();
      }
      if (!result) throw Object.assign(new Error('upload stalled'), { code: 'UPLOAD_STALLED' });
      const alreadyThere = (result.status === 400 || result.status === 409) && /exist|duplicate/i.test(result.body ?? '');
      if (!(result.status >= 200 && result.status < 300) && !alreadyThere) {
        return {
          ok: false,
          error: Object.assign(new Error(`upload refused (${result.status})`), { status: result.status }),
          stage: 'transfer',
        };
      }
    } catch (error) {
      return { ok: false, error, stage: 'transfer' };
    }
  }

  const { error: ackErr } = await supabase.from('lecture_segments').update({ status: 'uploaded' }).eq('id', row.id);
  if (ackErr) {
    // The bytes are in the bucket; the arrival job will adopt them within a
    // minute. Not a failure — but not a receipt either.
    trackLectureFailure('lecture_segment_ack_failed', 'upload_queue', classifyLectureFailure(ackErr, 'acknowledge'), part.seq, 1);
  }

  track('lecture_segment_uploaded', { screen: 'upload_queue', seq: part.seq, seconds: Math.round(part.duration || 0) });
  void nudgeTranscription(lectureId, row.id, part.seq);
  return { ok: true, acknowledged: !ackErr, segmentId: row.id };
}

async function nudgeTranscription(lectureId: string, segmentId: string, seq: number): Promise<void> {
  try {
    const { callLectureFunction } = await import('@/lib/lectures');
    await callLectureFunction('lecture-transcribe', { action: 'segment', lectureId, segmentId }, NUDGE_TIMEOUT_MS);
  } catch (error) {
    trackLectureFailure('lecture_segment_dispatch_failed', 'upload_queue',
      classifyLectureFailure(error, 'transcribe_dispatch'), seq, 1);
  }
}

async function declareStop(lectureId: string, journal: LectureJournal): Promise<boolean> {
  try {
    const { finishLecture, finalizeLecture, sendLectureHeartbeat } = await import('@/lib/lectures');
    // The Stop heartbeat is part of the Stop contract, not a courtesy: it is
    // what lets the server finish a lecture whose count never arrived, and the
    // recorder's own attempt at Stop time is fire-and-forget on whatever wifi
    // the student had. Sent here on every pass until the count is declared.
    await sendLectureHeartbeat({ lectureId, state: 'stopped', capturedSeconds: journal.recordedDuration });
    await finishLecture({
      lectureId,
      segmentCount: journal.finalExpectedParts ?? journal.parts.length,
      durationSeconds: journal.recordedDuration,
    });
    void finalizeLecture(lectureId);
    return true;
  } catch (error) {
    trackLectureFailure('lecture_stop_declare_failed', 'upload_queue', classifyLectureFailure(error, 'finish_declare'), -1, 1);
    return false;
  }
}

/** Record Stop in the journal (no network needed). */
export async function journalStop(ownerId: string, lectureId: string, expectedParts: number, durationSeconds: number) {
  const store = lectureJournalStore(ownerId, lectureId);
  await store.update((j) => ({ ...withStopIntent(j, expectedParts, durationSeconds), stopDeclared: false }));
}

// ── remote switch: background uploads (plan Phase 5) ───────────────────────
// The server says, in every `start` response, whether parts may upload through
// the system's background transfer service. Remembered across launches so the
// switch also covers parts uploaded after a restart.
const BACKGROUND_UPLOADS_KEY = 'semora.lecture.backgroundUploads';
let backgroundUploads: boolean | null = null;

export async function backgroundUploadsAllowed(): Promise<boolean> {
  if (backgroundUploads !== null) return backgroundUploads;
  try {
    backgroundUploads = (await AsyncStorage.getItem(BACKGROUND_UPLOADS_KEY)) !== 'off';
  } catch {
    backgroundUploads = true;
  }
  return backgroundUploads;
}

export function setBackgroundUploadsAllowed(allowed: boolean | undefined): void {
  if (typeof allowed !== 'boolean') return;
  backgroundUploads = allowed;
  AsyncStorage.setItem(BACKGROUND_UPLOADS_KEY, allowed ? 'on' : 'off').catch(() => {});
}
