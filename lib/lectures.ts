import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { getAppLocale } from '@/lib/i18n';
import { readFileAsBase64 } from '@/lib/readFileBase64';
import { parseUploadJson, requestWithUploadProgress } from '@/lib/httpUpload';
import { track } from '@/lib/analytics';

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
  created_at: string;
  updated_at: string;
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

export function useLectures() {
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
export async function uploadSegment(input: {
  lectureId: string;
  seq: number;
  fileUri: string;
  seconds: number;
  hasGap?: boolean;
  onProgress?: (percent: number) => void;
}): Promise<void> {
  const session = await getSession();
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
  if (rowErr || !row) throw rowErr ?? new Error('Could not save the recording segment.');

  const base64 = await readFileAsBase64(input.fileUri);
  const bytes = decode(base64);
  const rawBytes = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;

  const bucket = supabase.storage.from('lectures');
  const { data: signed, error: signedErr } = await bucket.createSignedUploadUrl(storagePath, {
    upsert: true,
  });
  if (signedErr || !signed) throw signedErr ?? new Error('Could not prepare the upload.');

  const uploadResponse = await requestWithUploadProgress({
    url: signed.signedUrl,
    method: 'PUT',
    headers: {
      'Content-Type': 'audio/m4a',
      'cache-control': 'max-age=3600',
      'x-upsert': 'true',
    },
    body: rawBytes,
    onProgress: input.onProgress,
  });
  if (!uploadResponse.ok) {
    const uploadError = parseUploadJson<{ message?: string; error?: string }>(uploadResponse);
    throw new Error(
      uploadError?.message || uploadError?.error || 'That part of the recording could not be uploaded.',
    );
  }

  await supabase
    .from('lecture_segments')
    .update({ status: 'uploaded' })
    .eq('id', row.id);

  track('lecture_segment_uploaded', {
    screen: 'lecture_record',
    seq: input.seq,
    seconds: Math.round(input.seconds),
  });

  // Transcribe now. A failure here is NOT fatal — the audio is safely uploaded
  // and the segment stays reclaimable, so the resume path can pick it up.
  await callLectureFn('lecture-transcribe', {
    action: 'segment',
    lectureId: input.lectureId,
    segmentId: row.id,
  });
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
  const { data: segments } = await supabase
    .from('lecture_segments')
    .select('id, seq, seconds, has_gap, status')
    .eq('lecture_id', lectureId)
    .eq('status', 'pending')
    .order('seq', { ascending: true });

  let uploaded = 0;
  for (const segment of segments ?? []) {
    const uri = localSegmentUri(lectureId, segment.seq);
    const info = await FileSystem.getInfoAsync(uri).catch(() => null);
    // The local copy is deleted once a segment uploads successfully, so a
    // missing file here means the audio is genuinely gone — the server's stale
    // sweep will write that segment off and assemble around it.
    if (!info?.exists) continue;
    try {
      await uploadSegment({
        lectureId,
        seq: segment.seq,
        fileUri: uri,
        seconds: segment.seconds ?? 0,
        hasGap: segment.has_gap ?? false,
      });
      await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      uploaded += 1;
    } catch {
      break; // stop on first failure — the network is still bad
    }
  }
  return uploaded;
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
