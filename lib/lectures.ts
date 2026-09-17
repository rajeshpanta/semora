import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import type { TimelinePart } from '@/lib/lectureTimeline';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system/legacy';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { getAppLocale } from '@/lib/i18n';
import { track } from '@/lib/analytics';
import { classifyLectureFailure } from '@/lib/lectureFailure';
import { trackLectureFailure } from '@/lib/lectureDiagnosticsStore';
import { readJournal } from '@/lib/lectureJournal';
import { forgetLectureJournalStore, lectureDir, lectureJournalFs, lectureJournalStore } from '@/lib/lectureJournalFs';
import { getDeviceItem, setDeviceItem } from '@/lib/deviceStore';
import {
  cancelLectureUploads,
  getLectureLocalProgress,
  subscribeUploadQueue,
  waitForUploadQueueIdle,
  type LectureLocalProgress,
} from '@/lib/lectureUploadQueue';

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
  /** Migrations 142-143. Optional for the same reason: older cached rows. */
  source?: 'recording' | 'document' | null;
  language?: 'en' | 'es' | 'mixed' | null;
  last_heartbeat_at?: string | null;
  capture_state?: 'recording' | 'paused' | 'stopped' | null;
  notes_truncated?: boolean | null;
  quiz_stale?: boolean | null;
  /** Migration 145: "Mark important" taps, seconds of captured audio. */
  important_marks?: number[] | null;
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
  // Its own key. useLectureSegments and useLectureSegmentProgress shared this
  // one while returning completely different shapes, so whichever ran first
  // handed the other its cache and a component got an array where it expected
  // counts, or the reverse.
  segmentProgress: (id: string | null | undefined) => ['lectureSegmentProgress', id ?? null] as const,
  timeline: (id: string | null | undefined) => ['lectureTimeline', id ?? null] as const,
};

/** Statuses where the server is still working and the client should keep looking. */
const IN_FLIGHT: LectureStatus[] = ['recording', 'uploading', 'transcribing', 'generating'];

export function isLectureInFlight(status: LectureStatus): boolean {
  return IN_FLIGHT.includes(status);
}

/**
 * True when a recording says it is working but nothing will ever finish it.
 *
 * Until 2026-09-16 this said "stalled" after 15 quiet minutes, while the server
 * keeps a recording open for hours and keeps folding in parts that arrive late
 * — 3 of 18 lectures in one week showed "This recording didn't finish… your
 * free lecture wasn't used" and a Delete button on lectures that DID finish and
 * WERE charged. It now uses the server's own rules (migrations 138/143):
 *
 *   the phone reported Stop           → stalled after 1 hour with no progress
 *   the phone reports it is recording → stalled after 2.5 hours of silence
 *   an older app (no report)          → stalled after 3.5 hours of silence
 *
 * and never while this phone still holds parts of it waiting to upload.
 */
export function isLectureStalled(
  lecture: {
    status: LectureStatus;
    updated_at: string;
    last_heartbeat_at?: string | null;
    capture_state?: string | null;
  },
  local?: LectureLocalProgress | null,
): boolean {
  if (lecture.status !== 'uploading' && lecture.status !== 'transcribing') return false;
  if (local && local.waiting > 0) return false;
  const quietMs = Date.now() - new Date(lecture.updated_at).getTime();
  const hour = 60 * 60 * 1000;
  if (effectiveCaptureState(lecture, local) === 'stopped') return quietMs > hour;
  if (lecture.last_heartbeat_at) {
    return Date.now() - new Date(lecture.last_heartbeat_at).getTime() > 2.5 * hour && quietMs > 2.5 * hour;
  }
  return quietMs > 3.5 * hour;
}

/**
 * Stop was pressed on THIS phone. The journal says so the moment it happens;
 * the server learns it from a heartbeat and the Stop count, both of which can
 * be stuck on bad wifi for a while. A screen that trusted only the server
 * told the student the lecture was "still being recorded" after they had
 * stopped it.
 */
export function isLectureStoppedHere(local: LectureLocalProgress | null | undefined): boolean {
  return Boolean(local?.stopped);
}

/** The server's capture_state, overridden by a Stop this phone has already made. */
export function effectiveCaptureState(
  lecture: { capture_state?: string | null },
  local?: LectureLocalProgress | null,
): 'recording' | 'paused' | 'stopped' | null {
  if (isLectureStoppedHere(local)) return 'stopped';
  const s = lecture.capture_state;
  return s === 'recording' || s === 'paused' || s === 'stopped' ? s : null;
}

/**
 * Whether the app is on screen, as React state. Polling hooks below return
 * no interval while it is not: TanStack Query's focusManager has no
 * `document` in React Native and reports "focused" forever, so a lecture
 * screen left open on a locked phone polled every 4 seconds for a whole class.
 * 'unknown' (before the first AppState event) counts as on screen.
 */
function subscribeAppState(onChange: () => void) {
  const sub = AppState.addEventListener('change', onChange);
  return () => sub.remove();
}
function appIsActiveNow(): boolean {
  const s = AppState.currentState;
  return s !== 'background' && s !== 'inactive';
}
export function useAppIsActive(): boolean {
  return useSyncExternalStore(subscribeAppState, appIsActiveNow, () => true);
}

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session;
}

/**
 * Who is signed in, or null.
 *
 * Deliberately does not throw: the recorder needs an owner to file audio under
 * and must carry on capturing when it cannot get one, because a locked phone
 * that cannot read its session is the situation this whole path exists for.
 */
export async function currentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  return session?.user.id ?? null;
}

/**
 * Call one of the lecture Edge Functions.
 *
 * Server error strings are surfaced verbatim (they are already localized by the
 * function using the `locale` we send), and `code`/`status` ride along on the
 * Error so callers can branch — the paywall on FREE_LECTURE_USED, a retry
 * affordance on PROVIDER_BUSY — without string matching.
 */
/**
 * Call a lecture Edge Function, with an optional time limit.
 *
 * The limit exists for calls nothing should wait on: a transcription nudge that
 * hung for 23 minutes while the app was suspended used to hold up every part
 * behind it. `x-semora-app-version` lets the server tell an app that records
 * reliably from one that should be updated (older apps send none).
 */
export async function callLectureFunction<T>(
  fn: string,
  payload: Record<string, unknown>,
  timeoutMs?: number,
): Promise<T> {
  const session = await getSession();
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Supabase URL not configured');

  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        'x-semora-app-version': String(Constants.expoConfig?.version ?? ''),
        'x-semora-platform': Platform.OS,
      },
      body: JSON.stringify({ ...payload, locale: getAppLocale() }),
      signal: controller?.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: response.statusText }));
      const e = new Error(err?.error || `Server error: ${response.status}`) as Error & {
        code?: string;
        status?: number;
        lectureId?: string;
      };
      e.code = err?.code;
      e.status = response.status;
      // A refusal that names the lecture in the way (TOO_MANY_IN_FLIGHT).
      if (typeof err?.lectureId === 'string') e.lectureId = err.lectureId;
      throw e;
    }
    return (await response.json()) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function callLectureFn<T>(fn: string, payload: Record<string, unknown>): Promise<T> {
  return callLectureFunction<T>(fn, payload);
}

/**
 * Tell the server this phone is still recording (every minute), paused, or
 * stopped — with, at Stop, how long the session ran and how much audio it
 * captured. Best effort: a heartbeat that fails changes nothing on the phone.
 */
export async function sendLectureHeartbeat(input: {
  lectureId: string;
  state: 'recording' | 'paused' | 'stopped';
  wallSeconds?: number | null;
  capturedSeconds?: number | null;
}): Promise<void> {
  try {
    await supabase.rpc('lecture_heartbeat', {
      p_lecture_id: input.lectureId,
      p_state: input.state,
      p_wall_seconds: input.wallSeconds == null ? null : Math.round(input.wallSeconds),
      p_captured_seconds: input.capturedSeconds == null ? null : Math.round(input.capturedSeconds),
      p_app_build: String(Constants.expoConfig?.version ?? '').slice(0, 32) || null,
    });
  } catch {
    // A heartbeat is a hint to the server, never a reason to disturb a recording.
  }
}

/**
 * Send the lecture's "Mark important" moments (145). true when the server has
 * them — or can never take them (a lecture that is gone, a server without the
 * feature), so the phone stops retrying. false means try again later.
 */
export async function sendLectureImportantMarks(lectureId: string, marks: number[]): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('lecture_add_important_marks', {
      p_lecture_id: lectureId,
      p_seconds: marks.map((m) => Math.max(0, Math.floor(m))),
    });
    // null = not this session's lecture (signed out, another account) or gone:
    // not delivered. The queue retries as the owner, and forgets a deleted one.
    if (!error) return Array.isArray(data);
    return error.code === 'PGRST202' || error.code === '42883';
  } catch {
    return false;
  }
}

export type LectureError = Error & { code?: string; status?: number };

// ── Queries ─────────────────────────────────────────────────────────────────

const LECTURE_LIST_COLUMNS = [
  'id', 'user_id', 'course_id', 'title', 'duration_seconds', 'segment_count', 'status', 'error_code',
  'notes_md', 'quiz', 'deck_id', 'quiz_generating', 'notes_started_at', 'quiz_started_at', 'audio_deleted_at',
  'parts_missing', 'parts_missing_since', 'parts_unrecoverable_at', 'notes_stale', 'source', 'language',
  'last_heartbeat_at', 'capture_state', 'notes_truncated', 'quiz_stale', 'important_marks', 'created_at', 'updated_at',
].join(', ');

/**
 * Lecture ids whose TRANSCRIPT contains every word of the query (4.10). Runs
 * on the server, debounced by the caller, so the phone never holds every
 * transcript in memory. Empty query, or fewer than 3 characters, searches
 * nothing.
 */
export function useLectureTranscriptSearch(query: string, enabled: boolean) {
  const words = query.trim().split(/\s+/).filter((w) => w.length >= 2);
  const key = words.join(' ').toLowerCase();
  return useQuery({
    queryKey: ['lectureTranscriptSearch', key],
    enabled: enabled && key.length >= 3,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      let q = supabase.from('lecture_recordings').select('id');
      for (const w of words) q = q.ilike('transcript', `%${w.replace(/[%_\\]/g, '\\$&')}%`);
      const { data, error } = await q.limit(200);
      if (error) return [];
      return (data ?? []).map((r) => r.id as string);
    },
  });
}

export function useLectures(enabled = true) {
  return useQuery({
    queryKey: lectureKeys.all,
    queryFn: async () => {
      // Everything but the transcript: a term of 3-hour lectures is tens of
      // megabytes of transcript, and the list never shows one. Search reaches
      // transcripts through useLectureTranscriptSearch.
      const { data, error } = await supabase
        .from('lecture_recordings')
        .select(`${LECTURE_LIST_COLUMNS}, courses(name, color)` as '*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LectureWithCourse[];
    },
    // Defaults to on, so the Notes screen is unaffected. The command palette
    // passes its own visibility — it is mounted by the desktop shell on every
    // screen, and an always-on hook there would turn one list into a fetch on
    // every page load whether or not anyone opened search.
    enabled,
  });
}

/**
 * What the detail screen polls for: the lecture's STATE. Never the
 * transcript, notes or quiz — a 3-hour lecture's row is ~150 KB, and polling
 * it every 4 seconds while the notes were written re-downloaded it 15 times
 * a minute. Those columns are fetched again only when this projection shows
 * the row changed (updated_at or status).
 */
const LECTURE_POLL_COLUMNS = [
  'id', 'status', 'error_code', 'capture_state', 'notes_started_at', 'quiz_generating', 'quiz_started_at',
  'parts_missing', 'notes_stale', 'notes_truncated', 'duration_seconds', 'segment_count', 'updated_at', 'important_marks',
].join(', ');

export function useLecture(id: string | null | undefined) {
  const qc = useQueryClient();
  const appActive = useAppIsActive();
  return useQuery({
    queryKey: lectureKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const previous = qc.getQueryData<LectureWithCourse | null>(lectureKeys.detail(id));
      if (previous) {
        // A refetch: ask for the light projection first, and take the whole
        // row again only when it says something changed.
        const { data: light, error: lightErr } = await supabase
          .from('lecture_recordings')
          .select(LECTURE_POLL_COLUMNS)
          .eq('id', id!)
          .maybeSingle();
        if (lightErr) throw lightErr;
        if (!light) return null;
        const changed = light as unknown as Partial<LectureRecording>;
        if (changed.updated_at === previous.updated_at && changed.status === previous.status) {
          return { ...previous, ...changed } as LectureWithCourse;
        }
      }
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
    // wifi. Polling stops the moment the lecture reaches a terminal state —
    // and whenever the app is off screen (the interval restarts on return).
    refetchInterval: (query) => {
      if (!appActive) return false;
      const lecture = query.state.data as LectureWithCourse | null | undefined;
      if (!lecture) return false;
      // Only while the quiz claim is fresh: the server resets a dead one after
      // 5 minutes (143), and polling every 3 seconds forever helped nobody.
      if (lecture.quiz_generating && lecture.quiz_started_at &&
        Date.now() - new Date(lecture.quiz_started_at).getTime() < 6 * 60 * 1000) return 3000;
      // A recording that looks stalled is still asked about, slowly: late
      // parts are folded in for days, and a screen that stopped looking would
      // never show the notes that arrive.
      if (isLectureStalled(lecture, getLectureLocalProgress(lecture.id))) return 60_000;
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
  otherLiveRecording?: boolean;
  /** Remote switch (LECTURE_BACKGROUND_UPLOADS). Absent from older servers = allowed. */
  backgroundUploads?: boolean;
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

/**
 * Tell the server capture is complete and it should assemble the transcript.
 *
 * Separate from finishLecture (a plain row update) because finalization has to
 * happen server-side under the service role. Safe to call more than once, and
 * never waited on for long: the server finishes the lecture on its own when the
 * last part is transcribed.
 */
export async function finalizeLecture(lectureId: string): Promise<void> {
  try {
    await callLectureFunction('lecture-transcribe', { action: 'finalize', lectureId }, 30_000);
  } catch {
    // The upload queue and the lecture screen both nudge again; a failed nudge
    // must never stop the student leaving the recorder.
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
export async function finishLecture(input: {
  lectureId: string;
  segmentCount: number;
  durationSeconds: number;
}): Promise<void> {
  const { data, error } = await supabase
    .from('lecture_recordings')
    .update({
      segment_count: input.segmentCount,
      duration_seconds: Math.round(input.durationSeconds),
      status: 'uploading',
    })
    .eq('id', input.lectureId)
    .select('id');
  if (error) throw error;
  // Signed out, or signed in as someone else: row security matches nothing and
  // PostgREST reports success. That is NOT a delivered count — throwing leaves
  // the journal's stopDeclared false, so the queue sends it as the owner later.
  if (!data || data.length === 0) {
    throw Object.assign(new Error('The lecture could not be updated from this session.'), { code: 'NOT_DECLARED' });
  }
}

/** Delete every local audio file still held for a lecture, and its journal. */
export async function deleteLocalLectureAudio(lectureId: string): Promise<void> {
  await FileSystem.deleteAsync(lectureDir(lectureId), { idempotent: true }).catch(() => {});
  forgetLectureJournalStore(lectureId);
}

/**
 * Ask for the notes once a transcript exists.
 *
 * Safe to call repeatedly — the server returns cached notes rather than
 * regenerating, which matters because this is driven by a status the UI may
 * observe more than once.
 */
export async function generateLectureNotes(
  lectureId: string,
): Promise<{ ok?: boolean; inProgress?: boolean; continue?: boolean; notesMd?: string } | null> {
  return callLectureFn('lecture-study-kit', { lectureId, mode: 'notes' });
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
      // A long lecture's notes arrive in sections; keep going while asked to.
      for (let step = 0; step < 8; step++) {
        const result = await generateLectureNotes(lectureId);
        qc.invalidateQueries({ queryKey: lectureKeys.detail(lectureId) });
        if (!result?.continue) break;
      }
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
export async function purgeLectureAudio(lectureId: string, ownerId?: string | null): Promise<{ serverDone: boolean }> {
  // The tombstone goes down FIRST, before a single network call, and the queue
  // is told to leave this lecture alone and allowed to finish anything it was
  // already sending — a part that lands AFTER the delete would put audio back
  // into the bucket with nothing pointing at it.
  await markLectureDiscarded(lectureId);

  // The server's copy is remembered on this phone until it is confirmed gone:
  // a discard made offline used to leave the row and any uploaded parts
  // alive, and the server finished them into notes the student had thrown
  // away. Remembered NOW, as the recording session's owner when it says who
  // that is (a signed-out phone in the locked-keychain window cannot), and
  // before the queue gets a chance to remove the folder the journal — the
  // last place the owner could be read from — lives in.
  const owner = ownerId
    ?? (await currentUserId().catch(() => null))
    ?? (await readJournal(lectureJournalFs, lectureDir(lectureId)).catch(() => null))?.journal.ownerId
    ?? null;
  if (owner) addPendingDiscard(lectureId, owner);

  cancelLectureUploads(lectureId);
  // Bounded: a background upload can wait for a network that is not there. The
  // tombstone and the cancel above already keep the queue off this lecture, and
  // a part that lands later is removed by the retention job's orphan sweep.
  await Promise.race([waitForUploadQueueIdle(), new Promise((r) => setTimeout(r, 8_000))]);

  const serverDone = await discardLectureOnServer(lectureId).catch(() => false);
  if (serverDone) removePendingDiscard(lectureId);

  await deleteLocalLectureAudio(lectureId);
  return { serverDone };
}

/**
 * Remove a lecture from the server: its audio, then its row (which cascades
 * the parts, releases its capacity reservation and drops the notes mirror).
 * true when nothing of it is left there; false means try again later.
 */
export async function discardLectureOnServer(lectureId: string): Promise<boolean> {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return false;
  const { data: segments, error: segErr } = await supabase
    .from('lecture_segments')
    .select('storage_path')
    .eq('lecture_id', lectureId);
  if (segErr) return false;
  const paths = (segments ?? [])
    .map((s) => s.storage_path)
    .filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    // Reported rather than swallowed. The delete still goes ahead — the intent
    // is recorded and the row is going — but audio left in the bucket is the
    // retention job's problem and it can only act on what it is told about.
    const { error } = await supabase.storage.from('lectures').remove(paths);
    if (error) {
      trackLectureFailure('lecture_audio_purge_failed', 'lecture_detail',
        classifyLectureFailure(error, 'reconcile'), -1, 1);
    }
  }
  const { error } = await supabase.from('lecture_recordings').delete().eq('id', lectureId);
  // No error = deleted, or nothing of ours to delete. (Signed out is caught
  // above; another account's row is invisible and stays pending for its owner.)
  return !error;
}

const PENDING_DISCARDS_KEY = 'semora_lecture_pending_discards';
interface PendingDiscard { lectureId: string; ownerId: string; since: number }

function readPendingDiscards(): PendingDiscard[] {
  try {
    const raw = getDeviceItem(PENDING_DISCARDS_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((d) => d && typeof d.lectureId === 'string' && typeof d.ownerId === 'string') : [];
  } catch {
    return [];
  }
}

function writePendingDiscards(list: PendingDiscard[]) {
  try {
    setDeviceItem(PENDING_DISCARDS_KEY, JSON.stringify(list));
  } catch {
    // best effort; the row is retried from the next successful launch's replay
  }
}

export function addPendingDiscard(lectureId: string, ownerId: string) {
  const list = readPendingDiscards().filter((d) => d.lectureId !== lectureId);
  writePendingDiscards([...list, { lectureId, ownerId, since: Date.now() }]);
}

export function removePendingDiscard(lectureId: string) {
  writePendingDiscards(readPendingDiscards().filter((d) => d.lectureId !== lectureId));
}

/** Lectures this phone deleted while offline: finish deleting them as their owner. */
export async function replayPendingDiscards(userId: string | null): Promise<void> {
  if (!userId) return;
  for (const d of readPendingDiscards()) {
    if (d.ownerId !== userId) continue;
    if (await discardLectureOnServer(d.lectureId).catch(() => false)) {
      removePendingDiscard(d.lectureId);
      track('lecture_discard_replayed', { screen: 'upload_queue', ageHours: Math.round((Date.now() - d.since) / 3_600_000) });
    }
  }
}

/**
 * Stop the queue touching this lecture, permanently.
 *
 * The journal's discardIntent survives an app restart; the queue never uploads
 * a discarded lecture again. It deliberately does not CREATE a journal: no
 * journal means nothing is queued.
 */
export async function markLectureDiscarded(lectureId: string): Promise<void> {
  try {
    const existing = await readJournal(lectureJournalFs, lectureDir(lectureId));
    if (!existing) return;
    const store = lectureJournalStore(existing.journal.ownerId, lectureId);
    await store.update((journal) => ({ ...journal, discardIntent: true, captureState: 'discarded' }));
  } catch {
    // The directory is going anyway. A tombstone that cannot be written is not
    // a reason to refuse the deletion the student asked for.
  }
}

/**
 * Delete a lecture. Resolves `{ serverDone }`: false means the phone's copy
 * is gone and the server's is remembered for the next time it is online — a
 * success from the student's side, not an error. (It used to throw, so the
 * screen showed "Couldn't delete" over audio that was already deleted.)
 */
export function useDeleteLecture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lectureId: string): Promise<{ serverDone: boolean }> => {
      // Normally there is nothing left in the bucket — the server deletes the
      // audio the moment the transcript is written — but a lecture deleted
      // mid-transcription still has segments in storage and on the device.
      return purgeLectureAudio(lectureId);
    },
    onSuccess: ({ serverDone }, lectureId) => {
      track('lecture_deleted', { screen: 'lecture_detail', serverDone });
      // Off the list now, whatever the network said: on this phone it is gone,
      // and the server's copy follows when it can be reached.
      qc.setQueryData(lectureKeys.all, (prev: LectureWithCourse[] | undefined) =>
        prev ? prev.filter((l) => l.id !== lectureId) : prev,
      );
      if (serverDone) {
        qc.invalidateQueries({ queryKey: lectureKeys.all });
        qc.invalidateQueries({ queryKey: ['freeActionUsed'] });
      }
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

/**
 * The parts' sentence timings, for the timestamped transcript (145). Fetched
 * only when the transcript is opened. A server without timings, or a lecture
 * from before them, returns parts with no timings and the screen shows the
 * plain transcript.
 */
export function useLectureTimeline(lectureId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: lectureKeys.timeline(lectureId),
    enabled: Boolean(lectureId) && enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TimelinePart[]> => {
      const { data, error } = await supabase
        .from('lecture_segments')
        .select('seq, seconds, status, timings')
        .eq('lecture_id', lectureId!)
        .order('seq', { ascending: true });
      if (error) return [];
      return (data ?? []) as TimelinePart[];
    },
  });
}

export function useRenameLecture(lectureId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) => {
      if (!lectureId) throw new Error('No lecture');
      const clean = title.replace(/\s+/g, ' ').trim().slice(0, 120);
      if (!clean) throw new Error('Give the lecture a name.');
      const { error } = await supabase
        .from('lecture_recordings')
        .update({ title: clean })
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
 * What this phone still holds for a lecture, live.
 *
 * Read from the upload queue (lib/lectureUploadQueue.ts), which is driven by
 * the on-device journal — the only record of a part that never reached the
 * server. Null when the phone holds nothing for it.
 */
export function useLectureLocalProgress(lectureId: string | null | undefined): LectureLocalProgress | null {
  const [value, setValue] = useState<LectureLocalProgress | null>(() => getLectureLocalProgress(lectureId));
  useEffect(() => {
    setValue(getLectureLocalProgress(lectureId));
    return subscribeUploadQueue(() => setValue(getLectureLocalProgress(lectureId)));
  }, [lectureId]);
  return value;
}

/**
 * How much of a recording has reached the server, and how much is still on
 * this phone.
 *
 * Three separate facts, because they used to be one and it lied: a part that
 * never reached the server has no row, so counting rows alone let a lecture
 * missing half its audio read as "All parts uploaded".
 */
export interface LectureProgress {
  /** Parts known anywhere: server rows plus parts only this phone has. */
  total: number;
  uploaded: number;
  transcribed: number;
  /** Still on this phone, whatever the server has heard about. */
  waitingLocally: number;
  /** Parts that stopped retrying and need the student. */
  needsAttention: number;
  /** Waiting only because this phone is signed out or signed in as someone else. */
  waitingForSignIn: number;
  /** What the phone declared at Stop, or null when it never got to say. */
  expected: number | null;
}

export function useLectureSegmentProgress(lectureId: string | null, enabled: boolean) {
  const local = useLectureLocalProgress(lectureId);
  const appActive = useAppIsActive();
  const query = useQuery({
    queryKey: lectureKeys.segmentProgress(lectureId),
    enabled: Boolean(lectureId) && enabled,
    // Matches the detail screen's own poll; this is the same wait — and, like
    // it, nothing is polled while the app is off screen.
    refetchInterval: enabled && appActive ? 4000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('lecture_segments')
        .select('seq, status')
        .eq('lecture_id', lectureId as string);
      if (error) throw error;
      return (data ?? []) as { seq: number; status: string }[];
    },
  });

  const rows = query.data ?? [];
  // A part counts once whether the server, the phone, or both know it.
  const data: LectureProgress | undefined = query.data || local ? {
    total: Math.max(rows.length, local?.total ?? 0),
    uploaded: rows.filter((r) => r.status !== 'pending').length,
    transcribed: rows.filter((r) => r.status === 'done').length,
    waitingLocally: local?.waiting ?? 0,
    needsAttention: local?.needsAttention ?? 0,
    waitingForSignIn: local?.waitingForSignIn ?? 0,
    expected: local?.expected ?? null,
  } : undefined;
  return { ...query, data };
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
