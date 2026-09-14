import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { getAppLocale } from '@/lib/i18n';
import { readFileAsBase64 } from '@/lib/readFileBase64';
import { parseUploadJson, requestWithUploadProgress } from '@/lib/httpUpload';
import { track } from '@/lib/analytics';
import {
  classifyLectureFailure,
  failureProperties,
  segmentSeqFromFilename,
  type LectureStage,
} from '@/lib/lectureFailure';

// ── Lecture recordings — client data layer ──────────────────────────────────
// Owns its own query keys rather than extending lib/queries.ts, matching
// lib/tutor.ts and lib/flashcards.ts: that file is shared by every core screen
// and a feature module editing it is how merge conflicts and accidental
// cross-feature invalidations happen.
//
// The pipeline this drives, end to end:
//
//   startLecture()      → server checks entitlement + global capacity, creates the row
//   uploadSegment() ×N  → one ~5-minute chunk each: PUT the audio, then ask the
//                         server to transcribe it
//   finishLecture()     → tells the server how many segments to expect, which is
//                         what lets it know the transcript is complete
//   ensureProcessed()   → once status is 'transcribed', asks for the notes
//
// Notes generation is deliberately NOT automatic server-side. There is no queue
// in this stack, so something has to ask — and the client is the only component
// that knows the user is still around to see the result.

export type LectureStatus =
  | 'recording'
  | 'uploading'
  | 'transcribing'
  | 'transcribed'
  | 'generating'
  | 'ready'
  | 'failed';

export interface LectureQuizQuestion {
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

export interface LectureRecording {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string;
  duration_seconds: number;
  segment_count: number;
  status: LectureStatus;
  error_code: string | null;
  transcript: string | null;
  notes_md: string | null;
  quiz: LectureQuizQuestion[] | null;
  /** The deck generated from this lecture (070). Null until one is made, or
   *  again if that deck is deleted — which is what makes the next press
   *  generate a fresh one rather than reopening a deck that is gone. */
  deck_id: string | null;
  quiz_generating: boolean;
  /** Claim stamps — let the UI tell "working" from "the invocation died". */
  notes_started_at: string | null;
  quiz_started_at: string | null;
  audio_deleted_at: string | null;
  /**
   * Completeness, from migration 138. Present on every row since 2026-09-13,
   * but optional here because an older cached row will not have it and a
   * missing value must read as "not known", never as "nothing is missing".
   */
  parts_missing?: number | null;
  parts_missing_since?: string | null;
  parts_unrecoverable_at?: string | null;
  notes_stale?: boolean | null;
  created_at: string;
  updated_at: string;
}

/**
 * How honest the screen can be about this lecture.
 *
 * Until 2026-09-14 nothing in the app read `parts_missing`, so a student whose
 * lecture was missing half its audio got notes and a push saying they were
 * ready. The database knew. Nobody told them.
 */
export type LectureCompleteness =
  | { kind: 'complete' }
  | { kind: 'unknown' }
  | { kind: 'missing'; parts: number; recoverable: boolean };

export function lectureCompleteness(
  lecture: Pick<LectureRecording, 'parts_missing' | 'parts_unrecoverable_at'>,
): LectureCompleteness {
  const missing = lecture.parts_missing;
  if (missing === undefined || missing === null) return { kind: 'unknown' };
  if (missing <= 0) return { kind: 'complete' };
  return {
    kind: 'missing',
    parts: missing,
    recoverable: lecture.parts_unrecoverable_at == null,
  };
}

export type LectureWithCourse = LectureRecording & {
  courses: { name: string; color: string } | null;
};

export interface LectureSegment {
  id: string;
  lecture_id: string;
  seq: number;
  storage_path: string | null;
  seconds: number;
  status: 'pending' | 'uploaded' | 'transcribing' | 'done' | 'failed';
  has_gap: boolean;
}

export const lectureKeys = {
  all: ['lectures'] as const,
  detail: (id: string | null | undefined) => ['lecture', id ?? null] as const,
  segments: (id: string | null | undefined) => ['lectureSegments', id ?? null] as const,
};

/** Statuses where the server is still working and the client should keep looking. */
const IN_FLIGHT: LectureStatus[] = ['recording', 'uploading', 'transcribing', 'generating'];

export function isLectureInFlight(status: LectureStatus): boolean {
  return IN_FLIGHT.includes(status);
}

/**
 * True when a recording says it is working but nothing is.
 *
 * `updated_at` moves on every segment and status change, so a row untouched
 * for this long has no invocation behind it. Kept here rather than only on the
 * detail screen because the poller needs the same answer — an in-flight status
 * that will never change is exactly the case that polled forever.
 */
export const LECTURE_STALLED_MS = 15 * 60 * 1000;

export function isLectureStalled(lecture: {
  status: LectureStatus;
  updated_at: string;
}): boolean {
  if (lecture.status !== 'uploading' && lecture.status !== 'transcribing') return false;
  return Date.now() - new Date(lecture.updated_at).getTime() > LECTURE_STALLED_MS;
}

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session;
}

/**
 * Call one of the lecture Edge Functions.
 *
 * Server error strings are surfaced verbatim (they are already localized by the
 * function using the `locale` we send), and `code`/`status` ride along on the
 * Error so callers can branch — the paywall on FREE_LECTURE_USED, a retry
 * affordance on PROVIDER_BUSY — without string matching.
 */
async function callLectureFn<T>(fn: string, payload: Record<string, unknown>): Promise<T> {
  const session = await getSession();
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Supabase URL not configured');

  const response = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ...payload, locale: getAppLocale() }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    const e = new Error(err?.error || `Server error: ${response.status}`) as Error & {
      code?: string;
      status?: number;
    };
    e.code = err?.code;
    e.status = response.status;
    throw e;
  }
  return response.json() as Promise<T>;
}

export type LectureError = Error & { code?: string; status?: number };

// ── Queries ─────────────────────────────────────────────────────────────────

export function useLectures(enabled = true) {
  return useQuery({
    queryKey: lectureKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lecture_recordings')
        .select('*, courses(name, color)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as LectureWithCourse[];
    },
    // Defaults to on, so the Notes screen is unaffected. The command palette
    // passes its own visibility — it is mounted by the desktop shell on every
    // screen, and an always-on hook there would turn one list into a fetch on
    // every page load whether or not anyone opened search.
    enabled,
  });
}

export function useLecture(id: string | null | undefined) {
  return useQuery({
    queryKey: lectureKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lecture_recordings')
        .select('*, courses(name, color)')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as LectureWithCourse | null;
    },
    // Poll while the server is still working. Realtime also carries these
    // updates, but transcription progress is the one thing a user actively
    // waits on, so it does not hang off a socket staying healthy on campus
    // wifi. Polling stops the moment the lecture reaches a terminal state.
    refetchInterval: (query) => {
      const lecture = query.state.data as LectureWithCourse | null | undefined;
      if (!lecture) return false;
      if (lecture.quiz_generating) return 3000;
      // "Terminal state" has to include stalled, not just finished. A recording
      // whose segments never arrived sits in 'transcribing' indefinitely, and
      // this polled it every 4 seconds for as long as the screen stayed open —
      // one was found stuck for over an hour. Nothing is coming, so stop
      // asking; the screen shows the stalled card instead of a spinner.
      if (isLectureStalled(lecture)) return false;
      return isLectureInFlight(lecture.status) ? 4000 : false;
    },
  });
}

export function useLectureSegments(lectureId: string | null | undefined) {
  return useQuery({
    queryKey: lectureKeys.segments(lectureId),
    enabled: !!lectureId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lecture_segments')
        .select('id, lecture_id, seq, storage_path, seconds, status, has_gap')
        .eq('lecture_id', lectureId!)
        .order('seq', { ascending: true });
      if (error) throw error;
      return (data ?? []) as LectureSegment[];
    },
  });
}

/**
 * Whether this account has already spent its ONE free AI action.
 *
 * The allowance is shared: a syllabus scan and a lecture recording draw from
 * the same single action (migration 071). So this is no longer a lecture
 * question, and the old lecture-only hook is gone.
 *
 * Unlike the proxy it replaces — "has any lecture ever reached a transcript",
 * which read as unused once the student deleted the recording — this asks the
 * database for the real answer. my_free_action_used() is SECURITY DEFINER over
 * two service-role-only ledgers, so the client gets the truth without being
 * able to read or write either one. It can no longer drift from the server
 * gate; `startLecture` remains the authority, but they now agree.
 */
export { useFreeActionUsed } from '@/lib/queries';

// ── Lifecycle ───────────────────────────────────────────────────────────────

export interface StartLectureResult {
  lectureId: string;
  maxSeconds: number;
  reservedSeconds: number;
}

/**
 * Reserve capacity and create the row, BEFORE the microphone opens.
 *
 * Both server-side gates (free-lecture allowance, shared daily transcription
 * capacity) run here for one reason: a student who is told after a 90-minute
 * lecture that it cannot be transcribed has lost something they cannot get
 * back. The class does not happen twice.
 */
export async function startLecture(input: {
  title: string;
  courseId: string | null;
}): Promise<StartLectureResult> {
  return callLectureFn<StartLectureResult>('lecture-transcribe', {
    action: 'start',
    title: input.title,
    courseId: input.courseId,
  });
}

/** Give the capacity reservation back when a recording is abandoned. */
export async function cancelLecture(lectureId: string, reservedSeconds?: number): Promise<void> {
  try {
    await callLectureFn('lecture-transcribe', {
      action: 'cancel',
      lectureId,
      ...(reservedSeconds ? { reservedSeconds } : {}),
    });
  } catch {
    // Best effort. The reservation expires with the UTC day regardless, and
    // failing to release must never block the user from leaving the screen.
  }
}

/** base64 → bytes. Mirrors lib/tutor.ts decode(). */
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

/**
 * Upload one captured chunk and ask the server to transcribe it.
 *
 * Row first, then bytes, then transcribe. The row exists as `pending` before
 * the upload starts so that an app killed mid-upload leaves a record the resume
 * path can find — the local audio file is still on disk, and a segment nobody
 * knows about is a segment nobody retries.
 */
/**
 * Run one stage of the upload and stamp whatever it throws with where it was.
 *
 * Every `lecture_segment_upload_failed` event in the seven days to 2026-09-14
 * carried an empty code, so four students lost audio for reasons nobody could
 * name. The stage rides on the error so the handler that reports it knows which
 * boundary broke. See lib/lectureFailure.ts.
 */
async function atStage<T>(stage: LectureStage, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err && typeof err === 'object' && (err as { stage?: unknown }).stage === undefined) {
      (err as { stage?: LectureStage }).stage = stage;
    }
    throw err;
  }
}

export async function uploadSegment(input: {
  lectureId: string;
  seq: number;
  fileUri: string;
  seconds: number;
  hasGap?: boolean;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const session = await atStage('session', getSession);
  const userId = session.user.id;
  const storagePath = `${userId}/${input.lectureId}/seg_${String(input.seq).padStart(3, '0')}.m4a`;

  // Upsert so a retry of the same seq reuses its row instead of tripping the
  // (lecture_id, seq) unique constraint.
  const { data: row, error: rowErr } = await supabase
    .from('lecture_segments')
    .upsert(
      {
        lecture_id: input.lectureId,
        user_id: userId,
        seq: input.seq,
        seconds: Math.max(0, Math.round(input.seconds)),
        storage_path: storagePath,
        status: 'pending',
        has_gap: input.hasGap ?? false,
      },
      { onConflict: 'lecture_id,seq' },
    )
    .select('id')
    .single();
  if (rowErr || !row) {
    const err = (rowErr ?? new Error('Could not save the recording segment.')) as LectureError & { stage?: LectureStage };
    err.stage = 'register';
    throw err;
  }

  const base64 = await atStage('local_commit', () => readFileAsBase64(input.fileUri));
  const bytes = decode(base64);
  const rawBytes = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  const bucket = supabase.storage.from('lectures');
  const { data: signed, error: signedErr } = await bucket.createSignedUploadUrl(storagePath, {
    upsert: true,
  });
  if (signedErr || !signed) {
    const err = (signedErr ?? new Error('Could not prepare the upload.')) as LectureError & { stage?: LectureStage };
    err.stage = 'sign_url';
    throw err;
  }

  const uploadResponse = await atStage('transfer', () => requestWithUploadProgress({
    url: signed.signedUrl,
    method: 'PUT',
    headers: {
      'Content-Type': 'audio/m4a',
      'cache-control': 'max-age=3600',
      'x-upsert': 'true',
    },
    body: rawBytes,
    onProgress: input.onProgress,
  }));
  if (!uploadResponse.ok) {
    const uploadError = parseUploadJson<{ message?: string; error?: string }>(uploadResponse);
    const err = new Error(
      uploadError?.message || uploadError?.error || 'That part of the recording could not be uploaded.',
    ) as LectureError & { stage?: LectureStage };
    err.stage = 'transfer';
    err.status = uploadResponse.status;
    throw err;
  }

  // The bytes are in the bucket. If this update fails the part is still safe:
  // the every-minute arrival job (migration 139) finds an object no row claims
  // and hands it to lecture-transcribe. So a failure here is logged, not thrown,
  // because throwing would make the recorder keep a local file it no longer
  // needs and report a loss that did not happen.
  const { error: ackErr } = await supabase
    .from('lecture_segments')
    .update({ status: 'uploaded' })
    .eq('id', row.id);
  if (ackErr) {
    track('lecture_segment_ack_failed', {
      screen: 'lecture_record',
      ...failureProperties(classifyLectureFailure(ackErr, 'acknowledge'), input.seq, 1),
    });
  }

  track('lecture_segment_uploaded', {
    screen: 'lecture_record',
    seq: input.seq,
    seconds: Math.round(input.seconds),
  });

  // Transcribe now. A failure here is NOT fatal — the audio is safely uploaded
  // and the segment stays reclaimable, so the resume path can pick it up.
  //
  // Deliberately swallowed since 2026-09-14. It used to throw, which the
  // recorder's handler counted as "bytes failed to upload" and which kept the
  // local file forever: a provider timeout on part 3 looked identical to losing
  // part 3. Uploading and transcribing are separate facts now, and the arrival
  // job will ask again if this nudge never lands.
  try {
    await atStage('transcribe_dispatch', () => callLectureFn('lecture-transcribe', {
      action: 'segment',
      lectureId: input.lectureId,
      segmentId: row.id,
    }));
  } catch (err) {
    track('lecture_segment_dispatch_failed', {
      screen: 'lecture_record',
      ...failureProperties(classifyLectureFailure(err, 'transcribe_dispatch'), input.seq, 1),
    });
  }
}

/**
 * Declare capture complete.
 *
 * `segment_count` is the server's only signal that no more audio is coming —
 * without it the finalizer cannot distinguish "every segment so far is done"
 * from "the lecture is finished", and would assemble a truncated transcript
 * partway through the class.
 */
/**
 * Tell the server capture is complete and it should assemble the transcript.
 *
 * Separate from finishLecture (a plain row update) because finalization has to
 * happen server-side under the service role. Safe to call more than once.
 */
export async function finalizeLecture(lectureId: string): Promise<void> {
  try {
    await callLectureFn('lecture-transcribe', { action: 'finalize', lectureId });
  } catch {
    // The lecture detail screen retries this on open; a failed nudge must never
    // stop the user leaving the recorder.
  }
}

export async function finishLecture(input: {
  lectureId: string;
  segmentCount: number;
  durationSeconds: number;
}): Promise<void> {
  const { error } = await supabase
    .from('lecture_recordings')
    .update({
      segment_count: input.segmentCount,
      duration_seconds: Math.round(input.durationSeconds),
      status: 'uploading',
    })
    .eq('id', input.lectureId);
  if (error) throw error;
}

/**
 * Where a segment's audio lives on the device until the server has it.
 *
 * Deterministic from (lectureId, seq) on purpose: it means a segment whose
 * upload failed can be found again later without a manifest to lose. The record
 * screen tells the user "you can finish the upload from the lecture screen" —
 * this is what makes that true rather than a hopeful sentence.
 */
export function localSegmentUri(lectureId: string, seq: number): string {
  return `${FileSystem.documentDirectory}lectures/${lectureId}/seg_${String(seq).padStart(3, '0')}.m4a`;
}

/** Delete every local audio file still held for a lecture. */
export async function deleteLocalLectureAudio(lectureId: string): Promise<void> {
  await FileSystem.deleteAsync(`${FileSystem.documentDirectory}lectures/${lectureId}/`, {
    idempotent: true,
  }).catch(() => {});
}

/**
 * Re-upload segments whose bytes never made it, then transcribe them.
 *
 * Without this a single dropped connection strands a lecture: its row sits at
 * `pending`, the server refuses to assemble a transcript while any segment is
 * unfinished, and nothing on the device would ever try again.
 */
export async function retryPendingUploads(lectureId: string): Promise<number> {
  // Driven by the FILES, not by the rows.
  //
  // This used to ask the server for segments with status 'pending' and retry
  // those. On 2026-09-14 a student lost four parts of an eight-part lecture and
  // not one of them was 'pending': two had no row at all, because uploadSegment
  // reads the session before it writes the row and a locked phone makes that
  // throw, and two had been marked 'failed'. The audio for all four was sitting
  // on the phone the whole time and this function matched none of it.
  //
  // The local file is the only thing that is true whatever happened on the
  // server, so it is what drives the loop now. uploadSegment upserts, so a part
  // with no row gets one.
  const seqs = await localSegmentSeqs(lectureId);
  if (seqs.length === 0) return 0;

  // One query, to learn which parts the server has already finished. Anything
  // done or in flight is left alone: re-uploading would race a transcription
  // for the same bytes.
  const { data: rows } = await supabase
    .from('lecture_segments')
    .select('seq, seconds, has_gap, status')
    .eq('lecture_id', lectureId);
  const bySeq = new Map<number, { seconds: number | null; has_gap: boolean | null; status: string }>();
  for (const r of (rows ?? []) as { seq: number; seconds: number | null; has_gap: boolean | null; status: string }[]) {
    bySeq.set(r.seq, r);
  }

  let uploaded = 0;
  for (const seq of seqs) {
    const uri = localSegmentUri(lectureId, seq);
    const row = bySeq.get(seq);
    if (row && (row.status === 'done' || row.status === 'transcribing')) {
      // Already handled. The local copy is redundant; dropping it is what
      // stops a finished lecture keeping 22MB on the phone forever.
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      continue;
    }
    try {
      await uploadSegment({
        lectureId,
        seq,
        fileUri: uri,
        seconds: row?.seconds ?? 0,
        hasGap: row?.has_gap ?? false,
      });
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      uploaded += 1;
    } catch (err) {
      const failure = classifyLectureFailure(err, (err as { stage?: LectureStage })?.stage ?? 'transfer');
      track('lecture_segment_retry_failed', { screen: 'recovery', ...failureProperties(failure, seq, 1) });
      // A part whose bytes are gone is this part's problem, not the queue's:
      // skip it and give the others their turn. Anything else means the network
      // or the account is the blocker, so stop and come back later.
      if (failure.retry === 'permanent') continue;
      break;
    }
  }
  return uploaded;
}

/** Sequence numbers of every part still held locally for a lecture, in order. */
export async function localSegmentSeqs(lectureId: string): Promise<number[]> {
  const dir = `${FileSystem.documentDirectory}lectures/${lectureId}/`;
  const names = await FileSystem.readDirectoryAsync(dir).catch(() => [] as string[]);
  return names
    .map(segmentSeqFromFilename)
    .filter((seq): seq is number => seq !== null)
    .sort((a, b) => a - b);
}

/**
 * Every lecture with audio still on this phone.
 *
 * `lectures/null/` is skipped deliberately. Those files come from the Stop race
 * fixed in lib/lectureLifecycle.ts, where a rotation still running persisted
 * against a lecture id that Stop had already cleared. There is no reliable way
 * to tell whose they are, and guessing from a timestamp would file one
 * student's lecture under another's.
 */
export async function listLocalLectureIds(): Promise<string[]> {
  const root = `${FileSystem.documentDirectory}lectures/`;
  const names = await FileSystem.readDirectoryAsync(root).catch(() => [] as string[]);
  return names.filter((name) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name));
}

/** Retry every segment the server has not finished, in order. */
export async function retryPendingSegments(lectureId: string): Promise<number> {
  const { data: segments } = await supabase
    .from('lecture_segments')
    .select('id, seq, status, storage_path')
    .eq('lecture_id', lectureId)
    .in('status', ['uploaded', 'transcribing'])
    .order('seq', { ascending: true });

  let retried = 0;
  for (const segment of segments ?? []) {
    if (!segment.storage_path) continue;
    try {
      await callLectureFn('lecture-transcribe', {
        action: 'segment',
        lectureId,
        segmentId: segment.id,
      });
      retried += 1;
    } catch {
      // Stop on the first failure: segments are transcribed in order so later
      // ones can use the previous transcript's tail for continuity, and
      // hammering a provider that just rate-limited us helps nobody.
      break;
    }
  }
  return retried;
}

/**
 * Ask for the notes once a transcript exists.
 *
 * Safe to call repeatedly — the server returns cached notes rather than
 * regenerating, which matters because this is driven by a status the UI may
 * observe more than once.
 */
export async function generateLectureNotes(lectureId: string): Promise<void> {
  await callLectureFn('lecture-study-kit', { lectureId, mode: 'notes' });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export function useGenerateLectureQuiz(lectureId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!lectureId) throw new Error('No lecture');
      return callLectureFn<{ quiz: LectureQuizQuestion[] }>('lecture-study-kit', {
        lectureId,
        mode: 'quiz',
      });
    },
    onSuccess: (result) => {
      track('lecture_quiz_generated', { screen: 'lecture_detail' });
      // Write the quiz straight into the cache before invalidating.
      //
      // The caller opens the quiz screen the moment this resolves, and that
      // screen renders "This quiz is no longer available" for any lecture whose
      // quiz array is empty. Relying on the invalidation's refetch to arrive
      // first is a race the student loses on a slow connection — they would be
      // shown an error for the quiz they just waited on. Seeding the cache
      // makes the data present before navigation, and the invalidate below
      // still reconciles anything the server changed alongside it.
      if (result?.quiz?.length) {
        qc.setQueryData(lectureKeys.detail(lectureId), (prev: LectureWithCourse | null | undefined) =>
          prev ? { ...prev, quiz: result.quiz, quiz_generating: false } : prev,
        );
      }
      qc.invalidateQueries({ queryKey: lectureKeys.detail(lectureId) });
    },
  });
}

export function useRetryLectureNotes(lectureId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!lectureId) throw new Error('No lecture');
      await generateLectureNotes(lectureId);
    },
    onSuccess: () => {
      track('lecture_notes_generated', { screen: 'lecture_detail', retry: true });
      qc.invalidateQueries({ queryKey: lectureKeys.detail(lectureId) });
    },
  });
}

/**
 * Remove a lecture's audio from BOTH places it can exist, then the row.
 *
 * Order is load-bearing: `lecture_segments.lecture_id` cascades on delete, so
 * dropping the row first destroys every `storage_path` and orphans the objects
 * in the bucket permanently — audio of a third party that we told the student
 * we would delete.
 */
export async function purgeLectureAudio(lectureId: string): Promise<void> {
  const { data: segments } = await supabase
    .from('lecture_segments')
    .select('storage_path')
    .eq('lecture_id', lectureId);
  const paths = (segments ?? [])
    .map((s) => s.storage_path)
    .filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    await supabase.storage.from('lectures').remove(paths).catch(() => {});
  }
  await deleteLocalLectureAudio(lectureId);
}

export function useDeleteLecture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lectureId: string) => {
      // Normally there is nothing left in the bucket — the server deletes the
      // audio the moment the transcript is written — but a lecture deleted
      // mid-transcription still has segments in storage and on the device.
      await purgeLectureAudio(lectureId);

      const { error } = await supabase.from('lecture_recordings').delete().eq('id', lectureId);
      if (error) throw error;
    },
    onSuccess: () => {
      track('lecture_deleted', { screen: 'lecture_detail' });
      qc.invalidateQueries({ queryKey: lectureKeys.all });
      qc.invalidateQueries({ queryKey: ['freeActionUsed'] });
    },
  });
}

/**
 * Record which deck this lecture produced, so the Flashcards button re-opens
 * it instead of generating another. Written once, immediately after the first
 * successful generation.
 */
export function useSetLectureDeck(lectureId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deckId: string) => {
      if (!lectureId) throw new Error('No lecture');
      const { error } = await supabase
        .from('lecture_recordings')
        .update({ deck_id: deckId })
        .eq('id', lectureId);
      if (error) throw error;
    },
    onSuccess: (_r, deckId) => {
      // Seed rather than only invalidate: the caller navigates to the deck the
      // moment this resolves, and coming back to a lecture whose row had not
      // refetched yet would offer to generate all over again.
      qc.setQueryData(lectureKeys.detail(lectureId), (prev: LectureWithCourse | null | undefined) =>
        prev ? { ...prev, deck_id: deckId } : prev,
      );
      qc.invalidateQueries({ queryKey: lectureKeys.detail(lectureId) });
    },
  });
}

export function useAttachLectureCourse(lectureId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (courseId: string | null) => {
      if (!lectureId) throw new Error('No lecture');
      const { error } = await supabase
        .from('lecture_recordings')
        .update({ course_id: courseId })
        .eq('id', lectureId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: lectureKeys.detail(lectureId) });
      qc.invalidateQueries({ queryKey: lectureKeys.all });
    },
  });
}

/** Human-readable m:ss / h:mm:ss. */
export function formatLectureDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

// ── Notes from an uploaded document ─────────────────────────────────────────
// A student hands Semora a PDF, a photo of the board, a slide deck or an
// essay, and gets back what a recorded lecture produces: structured notes, and
// from those a quiz and a flashcard deck.
//
// The upload half is NOT reimplemented here. `useUploadCourseNote` already
// stores the file, extracts its text, handles the formats iCloud and Drive
// mislabel as octet-stream, and rolls back only when the document itself is
// the problem. This hook takes that finished note and gives it the same shape
// a transcript has, so everything downstream stops caring where the words came
// from (migration 072).
//
// status is 'transcribed', not 'ready': that is precisely what the row is —
// source text present, notes not written yet — and it is the state the lecture
// screen already knows how to act on, so the generate-notes call it makes on
// arrival needs no special case for documents.
export function useCreateDocumentNote(courseId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { noteId: string; filename: string; title?: string }) => {
      const { data: session } = await supabase.auth.getUser();
      const userId = session.user?.id;
      if (!userId) throw new Error('Not signed in');

      // The text extracted at upload time. Read back rather than passed in, so
      // this cannot run against a file whose extraction silently failed.
      const { data: note, error: noteErr } = await supabase
        .from('course_notes')
        .select('extracted_text, filename')
        .eq('id', input.noteId)
        .maybeSingle();
      if (noteErr) throw noteErr;

      const text = typeof note?.extracted_text === 'string' ? note.extracted_text.trim() : '';
      if (!text) {
        // Reached when the file is a scan of handwriting, an image with no
        // legible text, or a PDF of pure figures. Saying so beats generating
        // notes from nothing and handing back a confident page of invention.
        const err = new Error(
          "We couldn't read any text in that file. Try a clearer photo, or a PDF with selectable text.",
        );
        (err as any).code = 'NO_TEXT';
        throw err;
      }

      const title = (input.title?.trim() || stripExtension(input.filename)).slice(0, 120);
      const { data, error } = await supabase
        .from('lecture_recordings')
        .insert({
          user_id: userId,
          course_id: courseId ?? null,
          title,
          transcript: text,
          status: 'transcribed',
          source: 'document',
          source_filename: input.filename,
        })
        .select('id')
        .single();
      if (error) throw error;
      track('document_note_created', { has_course: Boolean(courseId) });
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lectures'] });
      qc.invalidateQueries({ queryKey: ['freeActionUsed'] });
    },
  });
}

// "Week 4 slides.pdf" → "Week 4 slides". The extension is noise in a title and
// the original filename is kept on the row anyway (072: source_filename).
function stripExtension(filename: string): string {
  const cut = filename.lastIndexOf('.');
  return cut > 0 ? filename.slice(0, cut) : filename;
}


/**
 * How much of a recording has actually reached the server.
 *
 * The detail screen's busy state was a bare spinner reading "Working on your
 * lecture", which is the same thing whether nine of ten parts are up or none
 * are. A student packing up after class needs the difference: one means walk
 * away, the other means stay on the wifi another minute.
 *
 * Counts rows rather than trusting lecture_recordings.segment_count, which is
 * what the CLIENT said to expect — and is exactly the field that reads 0 on a
 * recording whose finishing call never happened.
 */
export function useLectureSegmentProgress(lectureId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['lectureSegments', lectureId],
    enabled: Boolean(lectureId) && enabled,
    // Matches the detail screen's own poll; this is the same wait.
    refetchInterval: enabled ? 4000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lecture_segments')
        .select('status')
        .eq('lecture_id', lectureId as string);
      if (error) throw error;
      const rows = (data ?? []) as { status: string }[];
      return {
        total: rows.length,
        // 'pending' is the only status that means the bytes are still on the
        // phone; everything else is server-side progress.
        uploaded: rows.filter((r) => r.status !== 'pending').length,
        transcribed: rows.filter((r) => r.status === 'done').length,
      };
    },
  });
}

// ── Cross-activity outcome (migration 134) ──────────────────────────
// The first study activity that can tell the conductor what happened. The
// client sends WHICH CHOICES were picked, never a score: the quiz jsonb has to
// reach the device to be rendered, so answerIndex is already in its hands and
// a score it reported would be a claim about a key it owns. The RPC grades
// against the stored quiz and is the only thing that can write the row.

export interface LectureQuizAttempt {
  id: string;
  lecture_id: string;
  course_id: string | null;
  correct_count: number;
  question_count: number;
  source_task_id: string | null;
  source_topic: string | null;
  created_at: string;
}

export function useRecordLectureQuizAttempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      { lectureId, answers, sourceTaskId, sourceTopic }:
        { lectureId: string; answers: number[]; sourceTaskId?: string | null; sourceTopic?: string | null },
    ) => {
      const { data, error } = await supabase.rpc('record_lecture_quiz_attempt', {
        p_lecture_id: lectureId,
        p_answers: answers,
        p_source_task_id: sourceTaskId ?? null,
        p_source_topic: sourceTopic ?? null,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as { correct_count: number; question_count: number; attempt_id: string };
    },
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['lectureQuizAttempts', vars.lectureId] });
      qc.invalidateQueries({ queryKey: ['lectureQuizAttemptsForTask'] });
    },
  });
}

/**
 * The latest attempt tied to a guided session, so the conductor can pick the
 * thread back up when the student returns. Scoped to one task, newest first;
 * the caller decides whether it is recent enough to act on.
 */
export function useLatestQuizAttemptForTask(taskId?: string | null) {
  return useQuery({
    queryKey: ['lectureQuizAttemptsForTask', taskId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lecture_quiz_attempts')
        .select('id, lecture_id, course_id, correct_count, question_count, source_task_id, source_topic, created_at')
        .eq('source_task_id', taskId!)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return (data?.[0] ?? null) as LectureQuizAttempt | null;
    },
    enabled: !!taskId,
  });
}

/** Lectures for one course, for the conductor to find a quiz it can launch. */
export function useCourseLectures(courseId?: string | null) {
  return useQuery({
    queryKey: ['courseLectures', courseId ?? null],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lecture_recordings')
        .select('id, title, quiz, course_id, created_at')
        .eq('course_id', courseId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!courseId,
  });
}
