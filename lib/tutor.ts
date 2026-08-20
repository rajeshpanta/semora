import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFileSize, readFileAsBase64 } from '@/lib/readFileBase64';
import { supabase } from '@/lib/supabase';
import { getAppLocale } from '@/lib/i18n';
import {
  courseNoteTooLargeMessage,
  MAX_COURSE_NOTE_BYTES,
  normalizeSupportedDocument,
  unsupportedDocumentMessage,
} from '@/lib/documentFiles';
import { parseUploadJson, requestWithUploadProgress } from '@/lib/httpUpload';
import { track } from '@/lib/analytics';
import { streamSse } from '@/lib/sse';

// ── AI Tutor client ─────────────────────────────────────────
// Talks to the tutor-chat edge function (Pro-gated, grounded on the course's
// syllabus + uploaded notes). Conversations/messages are persisted in
// Supabase; the edge function writes both turns server-side (so history stays
// consistent even if the client dies mid-send) — this module reads them back.
//
// Note-file text extraction is done SERVER-SIDE by tutor-chat. The client
// uploads the raw file to the private course-notes bucket, inserts a row, then
// asks the function to extract and cache its text before reporting "Ready".
// Older rows are prepared lazily before Tutor/Flashcards uses them.

export interface TutorMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: TutorCitation[];
  created_at: string;
  /** 1 helpful, -1 unhelpful, null/absent unrated (migration 087). */
  rating?: number | null;
}

export interface TutorCitation {
  kind: 'syllabus' | 'deadline' | 'note' | 'assignment';
  label: string;
}

/** One tutoring turn's answer, as the edge function returns it. */
export interface TutorReply {
  reply: string;
  citations: TutorCitation[];
  /**
   * Whether the server managed to store the turn. False means the answer is
   * real but the thread did not keep it — see heldTurns below.
   */
  persisted: boolean;
  usage?: TutorUsage | null;
}

/** Messages spent and allowed in the rolling 24h window, per the server. */
export interface TutorUsage {
  used: number;
  cap: number;
}

/**
 * The grade the course screen is showing, passed to the tutor so it can answer
 * "what do I need on the final".
 *
 * Computed by lib/grades.ts on the client and sent, rather than recomputed on
 * the server: category weights, drop-lowest and extra-credit policy are two
 * hundred lines of rules, and a second implementation would eventually disagree
 * with the number the student is looking at.
 */
export interface TutorGradeSnapshot {
  percentage: number | null;
  letter: string | null;
  weightRemaining?: number | null;
  categories?: { name: string; weight: number; average: number | null; graded: number }[];
}

/**
 * Mirrors TUTOR_DAILY_CAP in the edge function. Only used to render a counter
 * before the first answer of a session arrives — every response carries the
 * server's own figure, which always wins.
 */
export const TUTOR_DAILY_CAP = 50;

export interface TutorPracticeQuestion {
  id: string;
  mode: 'practice' | 'quiz';
  prompt: string;
  choices: string[];
  topics: string[];
  citations: TutorCitation[];
}

export interface TutorPracticeEvaluation {
  correct: boolean;
  feedback: string;
  topics: string[];
}

export interface CourseTopicMastery {
  id: string;
  course_id: string;
  topic: string;
  attempts: number;
  correct: number;
  last_practiced_at: string;
}

export interface TutorConversation {
  id: string;
  user_id: string;
  course_id: string | null;
  title: string | null;
  created_at: string;
  /** Last turn, not creation — what the thread list sorts by (migration 087). */
  updated_at?: string | null;
}

export interface CourseNote {
  id: string;
  course_id: string;
  storage_path: string;
  filename: string;
  mime_type: string | null;
  created_at: string;
  /**
   * Whether the server has already cached this file's text (generated column,
   * migration 087). Lets the client skip asking about a note it can already
   * see is ready — see prepareCourseNotes.
   */
  extracted?: boolean | null;
}

export type CourseNoteUploadProgress = {
  stage: 'validating' | 'preparing' | 'uploading' | 'saving' | 'reading' | 'ready';
  percent?: number;
  filename: string;
};

export type CourseNoteReadProgress = {
  completed: number;
  total: number;
  filename: string;
};

export const tutorKeys = {
  conversation: (courseId?: string | null) => ['tutorConversation', courseId ?? 'general'] as const,
  threads: (courseId?: string | null) => ['tutorThreads', courseId ?? 'general'] as const,
  messages: (conversationId: string | null) => ['tutorMessages', conversationId] as const,
  notes: (courseId?: string | null) => ['courseNotes', courseId ?? null] as const,
  mastery: (courseId?: string | null) => ['courseTopicMastery', courseId ?? null] as const,
  usage: () => ['tutorUsage'] as const,
};

// A document's extracted text is cached permanently in course_notes by the
// server. Mirror that readiness for the lifetime of this app session so every
// Tutor question does not make another network round-trip just to rediscover
// the same cached state. Unknown/older rows are still checked once.
const preparedCourseNoteIds = new Set<string>();

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session;
}

async function callTutor(payload: Record<string, unknown>) {
  const session = await getSession();
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Supabase URL not configured');
  const response = await fetch(`${supabaseUrl}/functions/v1/tutor-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body: JSON.stringify({ ...payload, locale: getAppLocale() }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    const e = new Error(err.error || `Server error: ${response.status}`) as Error & { code?: string; status?: number };
    e.code = err.code;
    e.status = response.status;
    throw e;
  }
  return response.json();
}

export async function prepareCourseNotes(
  courseId: string,
  notes: Pick<CourseNote, 'id' | 'filename' | 'extracted'>[],
  onProgress?: (progress: CourseNoteReadProgress) => void,
): Promise<void> {
  // `extracted` is the server's own answer to "is this note read yet", so a
  // note carrying it needs no round trip at all. Without it this ran one
  // sequential edge invocation per note before the FIRST message of every
  // session — the in-memory Set below is empty on every app launch — so ten
  // attached notes meant ten round trips and a "Reading your documents… 1 of
  // 10" bar in front of a question that needed none of them.
  const pendingNotes = notes.filter(
    (note) => note.extracted !== true && !preparedCourseNoteIds.has(note.id),
  );
  for (let index = 0; index < pendingNotes.length; index++) {
    const note = pendingNotes[index];
    onProgress?.({ completed: index, total: pendingNotes.length, filename: note.filename });
    await callTutor({ action: 'prepare_note', courseId, noteId: note.id });
    preparedCourseNoteIds.add(note.id);
    onProgress?.({ completed: index + 1, total: pendingNotes.length, filename: note.filename });
  }
}

// ── Conversation ────────────────────────────────────────────

// Find the most recent conversation for this course (or the most recent
// general one when courseId is null), creating one if none exists. A single
// rolling thread per course keeps the UX simple — no thread list to manage.
export function useTutorConversation(courseId?: string | null) {
  return useQuery({
    queryKey: tutorKeys.conversation(courseId),
    queryFn: async () => {
      const session = await getSession();
      const userId = session.user.id;

      let query = supabase
        .from('tutor_conversations')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      // .is() for a null course (general thread); .eq() when scoped.
      query = courseId ? query.eq('course_id', courseId) : query.is('course_id', null);

      const { data, error } = await query.maybeSingle();
      if (error) throw error;
      if (data) return data as TutorConversation;

      const { data: created, error: createErr } = await supabase
        .from('tutor_conversations')
        .insert({ user_id: userId, course_id: courseId ?? null })
        .select()
        .single();
      if (createErr) throw createErr;
      return created as TutorConversation;
    },
  });
}

/**
 * Every thread for this scope, most recently used first.
 *
 * The app used to reuse ONE conversation per course for ever — it read the
 * newest and created one only if none existed — so a question about the midterm
 * in September sat above a question about the final in December, with the
 * twelve-turn history window quietly dropping everything between. A thread is
 * now a thing a student can start, name, find again and throw away.
 */
export function useTutorThreads(courseId?: string | null) {
  return useQuery({
    queryKey: tutorKeys.threads(courseId),
    queryFn: async () => {
      const session = await getSession();
      let query = supabase
        .from('tutor_conversations')
        .select('*')
        .eq('user_id', session.user.id)
        .order('updated_at', { ascending: false })
        .limit(50);
      query = courseId ? query.eq('course_id', courseId) : query.is('course_id', null);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as TutorConversation[];
    },
  });
}

export function useCreateTutorThread(courseId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<TutorConversation> => {
      const session = await getSession();
      const { data, error } = await supabase
        .from('tutor_conversations')
        .insert({ user_id: session.user.id, course_id: courseId ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as TutorConversation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tutorKeys.threads(courseId) });
      // The find-or-create hook caches the newest thread; a new one supersedes
      // whatever it is holding.
      qc.invalidateQueries({ queryKey: tutorKeys.conversation(courseId) });
      track('tutor_thread_created', { screen: 'tutor' });
    },
  });
}

export function useRenameTutorThread(courseId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const clean = title.trim().slice(0, 80);
      const { error } = await supabase
        .from('tutor_conversations')
        .update({ title: clean || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: tutorKeys.threads(courseId) }),
  });
}

export function useDeleteTutorThread(courseId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Messages cascade with the thread (migration 025), so this is the whole
      // deletion — nothing of the conversation is left behind.
      const { error } = await supabase.from('tutor_conversations').delete().eq('id', id);
      if (error) throw error;
      heldTurns.delete(id);
    },
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: tutorKeys.messages(id) });
      qc.invalidateQueries({ queryKey: tutorKeys.threads(courseId) });
      qc.invalidateQueries({ queryKey: tutorKeys.conversation(courseId) });
      track('tutor_thread_deleted', { screen: 'tutor' });
    },
  });
}

// ── Messages ────────────────────────────────────────────────

/**
 * Turns the tutor answered but the server did not manage to store.
 *
 * tutor-chat writes both turns itself and treats a failed insert as non-fatal:
 * it still returns the reply, because an answer the student waited eight
 * seconds for should not be thrown away over a logging problem. But this screen
 * renders the thread from the DATABASE, so a dropped write meant the question
 * vanished (the draft is cleared on send) and no answer ever appeared — no
 * error, no bubble, nothing to retry. The reply was in hand the whole time.
 *
 * So a reply the canonical list comes back without is held here and merged into
 * every later read for the rest of the session. Deliberately memory-only: this
 * is a repair for a write that failed, not a second store to keep in sync, and
 * a turn the server never took has no business surviving an app restart.
 */
const heldTurns = new Map<string, TutorMessage[]>();

/** Identity for a turn the server has not given us an id for. */
const turnKey = (m: Pick<TutorMessage, 'role' | 'content'>) => `${m.role}\u0000${m.content}`;

/**
 * Server rows plus any held turns they are still missing, in order.
 *
 * Also self-clearing: if a held turn turns up in the canonical list (a delayed
 * write, or a retry that landed) it is dropped, so the student never sees the
 * same answer twice.
 */
function mergeHeldTurns(conversationId: string | null, rows: TutorMessage[]): TutorMessage[] {
  if (!conversationId) return rows;
  const held = heldTurns.get(conversationId);
  if (!held?.length) return rows;

  const onServer = new Set(rows.map(turnKey));
  const missing = held.filter((m) => !onServer.has(turnKey(m)));
  if (missing.length !== held.length) {
    if (missing.length) heldTurns.set(conversationId, missing);
    else heldTurns.delete(conversationId);
  }
  if (!missing.length) return rows;

  const seen = new Set(rows.map((m) => m.id));
  return [...rows, ...missing.filter((m) => !seen.has(m.id))]
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function useTutorMessages(conversationId: string | null) {
  return useQuery({
    queryKey: tutorKeys.messages(conversationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tutor_messages')
        .select('*')
        .eq('conversation_id', conversationId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      // Merged HERE rather than in the screen so every read — the poll after a
      // send, a refocus, a manual invalidation — keeps the rescued turns.
      return mergeHeldTurns(conversationId, (data ?? []) as TutorMessage[]);
    },
    enabled: !!conversationId,
  });
}

export type TutorSendInput = {
  message: string;
  mode?: 'chat' | 'explain_assignment';
  assignmentId?: string | null;
  /** A photo of the problem, read for this turn only and never stored. */
  image?: { base64: string; mimeType: string } | null;
  /** What the course screen shows, so the tutor can talk about grades. */
  grades?: TutorGradeSnapshot | null;
  /** Called with the answer SO FAR as it arrives. */
  onDelta?: (textSoFar: string) => void;
};

/**
 * Send one tutoring turn, streaming the answer as it is written.
 *
 * The transport is XHR rather than fetch because React Native's fetch cannot
 * read a body incrementally (see lib/sse.ts). If nothing streams — an older
 * deployment, an error, a proxy that buffers — the same response is parsed as
 * ordinary JSON and everything downstream behaves exactly as it did before, so
 * there is no version of this that leaves a student without their answer.
 */
export function useSendTutorMessage(conversationId: string | null, courseId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: TutorSendInput): Promise<TutorReply> => {
      if (!conversationId) throw new Error('No conversation');
      const session = await getSession();
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) throw new Error('Supabase URL not configured');

      let text = '';
      let done: { citations?: TutorCitation[]; persisted?: boolean; usage?: TutorUsage } | null = null;
      let failure: { error?: string; code?: string } | null = null;

      const result = await streamSse({
        url: `${supabaseUrl}/functions/v1/tutor-chat`,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          conversationId,
          courseId: courseId ?? null,
          message: input.message,
          mode: input.mode ?? 'chat',
          assignmentId: input.assignmentId ?? null,
          image: input.image ?? null,
          grades: input.grades ?? null,
          stream: true,
          locale: getAppLocale(),
        }),
        onFrame: (frame) => {
          if (frame?.type === 'delta' && typeof frame.text === 'string') {
            text += frame.text;
            input.onDelta?.(text);
          } else if (frame?.type === 'done') {
            done = frame as typeof done;
          } else if (frame?.type === 'error') {
            failure = frame as typeof failure;
          }
        },
      });

      // A non-2xx never streams: the function returns JSON before opening the
      // stream precisely so this path stays the one it always was.
      if (!result.ok) {
        let parsed: any = null;
        try { parsed = JSON.parse(result.body); } catch { /* not JSON */ }
        const error = new Error(parsed?.error || `Server error: ${result.status}`) as Error & {
          code?: string; status?: number; usage?: TutorUsage;
        };
        error.code = parsed?.code;
        error.status = result.status;
        if (parsed?.usage) error.usage = parsed.usage;
        throw error;
      }

      const streamFailure = failure as { error?: string; code?: string } | null;
      const completion = done as { citations?: TutorCitation[]; persisted?: boolean; usage?: TutorUsage } | null;

      if (result.streamed) {
        // Text already on screen wins over a late failure frame. Taking a
        // partial answer away to replace it with an error is worse for the
        // student than keeping what arrived and letting them ask again.
        if (!text.trim()) {
          const error = new Error(streamFailure?.error || "The tutor couldn't answer that one. Try rephrasing your question.") as Error & { code?: string };
          error.code = streamFailure?.code;
          throw error;
        }
        return {
          reply: text,
          citations: Array.isArray(completion?.citations) ? completion!.citations : [],
          // No `done` frame means the connection ended mid-answer, so nothing
          // confirmed the write. Treated as unpersisted, which makes the rescue
          // below hold the turn rather than lose it.
          persisted: completion?.persisted === true,
          usage: completion?.usage ?? null,
        };
      }

      const data = JSON.parse(result.body) as {
        reply?: string; citations?: TutorCitation[]; persisted?: boolean; usage?: TutorUsage;
      };
      if (!data?.reply) throw new Error("The tutor couldn't answer that one. Try rephrasing your question.");
      return {
        reply: data.reply,
        citations: Array.isArray(data.citations) ? data.citations : [],
        // An older deployment does not send `persisted`; absent means "assume
        // it worked", which is the behaviour that shipped before this field.
        persisted: data.persisted !== false,
        usage: data.usage ?? null,
      };
    },
    onMutate: async (input: TutorSendInput) => {
      // Show the user's turn immediately. The answer now streams, but the
      // question still has to appear the instant it is sent — the draft is
      // cleared on tap, so without this it vanishes.
      await qc.cancelQueries({ queryKey: tutorKeys.messages(conversationId) });
      const previous = qc.getQueryData<TutorMessage[]>(tutorKeys.messages(conversationId));
      const optimistic = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId ?? '',
        role: 'user',
        content: input.message,
        created_at: new Date().toISOString(),
      } as TutorMessage;
      qc.setQueryData<TutorMessage[]>(
        tutorKeys.messages(conversationId),
        (old = []) => [...old, optimistic],
      );
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      // Roll back the optimistic bubble; the screen restores the draft so the
      // user doesn't lose what they typed.
      if (ctx?.previous) {
        qc.setQueryData(tutorKeys.messages(conversationId), ctx.previous);
      }
    },
    onSuccess: async (result, input, ctx) => {
      if (result.usage) qc.setQueryData(tutorKeys.usage(), result.usage);
      // A new thread's title and its position in the list are both set by this
      // turn, server-side.
      qc.invalidateQueries({ queryKey: tutorKeys.threads(courseId) });

      await qc.refetchQueries({ queryKey: tutorKeys.messages(conversationId) });
      if (!conversationId) return;

      // Two independent ways to learn the turn was dropped. The server now says
      // so outright; the count check stays as the backstop for a deployment
      // that predates that field, and for a stream that ended before the
      // confirmation frame arrived.
      const replies = (list: TutorMessage[]) =>
        list.filter((m) => m.role === 'assistant' && m.content === result.reply).length;
      const canonical = qc.getQueryData<TutorMessage[]>(tutorKeys.messages(conversationId)) ?? [];

      // The server confirming the write settles it, even if this refetch raced
      // and came back without the row — the next read will have it, and
      // rescuing here would briefly show the answer twice.
      if (result.persisted) return;
      // Otherwise fall back to looking: an older deployment sends no such flag,
      // and a stream cut short before the confirmation frame reports false when
      // the write may well have landed.
      if (replies(canonical) > replies(ctx?.previous ?? [])) return;

      // The reply is not in the thread, so the server's insert failed. Both
      // turns go in one statement, so the question is missing too — hold the
      // pair and put them straight into the cache the refetch just replaced.
      const sentAt = Date.now();
      const rescued: TutorMessage[] = [
        {
          id: `local-user-${sentAt}`,
          conversation_id: conversationId,
          role: 'user',
          content: input.message,
          citations: [],
          created_at: new Date(sentAt).toISOString(),
        },
        {
          id: `local-assistant-${sentAt}`,
          conversation_id: conversationId,
          role: 'assistant',
          content: result.reply,
          citations: result.citations,
          created_at: new Date(sentAt + 1).toISOString(),
        },
      ];
      heldTurns.set(conversationId, [...(heldTurns.get(conversationId) ?? []), ...rescued]);
      qc.setQueryData<TutorMessage[]>(
        tutorKeys.messages(conversationId),
        (old = []) => mergeHeldTurns(conversationId, old),
      );
      // The student now sees their answer, but the server still lost the turn —
      // which also means Luna gets no history from it on the next question. That
      // was invisible before; make it countable.
      track('tutor_reply_unpersisted', { screen: 'tutor' });
    },
  });
}

/**
 * Say whether an answer helped.
 *
 * There is otherwise NO signal about tutor quality — not a rating, not a
 * report, nothing — so a prompt change that made answers worse would be
 * invisible until students stopped opening the screen. Optimistic, because a
 * tap that waits on a round trip to acknowledge itself reads as broken.
 */
export function useRateTutorMessage(conversationId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ messageId, rating }: { messageId: string; rating: 1 | -1 | null }) => {
      // A rescued turn exists only on this device, so there is no row to rate.
      if (messageId.startsWith('local-') || messageId.startsWith('optimistic-')) return;
      const { error } = await supabase
        .from('tutor_messages')
        .update({ rating, rated_at: rating == null ? null : new Date().toISOString() })
        .eq('id', messageId);
      if (error) throw error;
    },
    onMutate: async ({ messageId, rating }) => {
      await qc.cancelQueries({ queryKey: tutorKeys.messages(conversationId) });
      const previous = qc.getQueryData<TutorMessage[]>(tutorKeys.messages(conversationId));
      qc.setQueryData<TutorMessage[]>(
        tutorKeys.messages(conversationId),
        (old = []) => old.map((m) => (m.id === messageId ? { ...m, rating } : m)),
      );
      return { previous };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.previous) qc.setQueryData(tutorKeys.messages(conversationId), ctx.previous);
    },
    onSuccess: (_data, { rating }) => {
      if (rating != null) track('tutor_answer_rated', { screen: 'tutor', helpful: rating === 1 });
    },
  });
}

/**
 * Messages left today.
 *
 * The cap has always been enforced and never shown, so the first a student knew
 * of it was a refusal. Read from the same ledger the server counts (RLS allows
 * SELECT on own rows), then replaced by the server's own figure as soon as an
 * answer comes back.
 */
export function useTutorQuota() {
  return useQuery({
    queryKey: tutorKeys.usage(),
    queryFn: async (): Promise<TutorUsage> => {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id;
      if (!userId) return { used: 0, cap: TUTOR_DAILY_CAP };
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await supabase
        .from('tutor_usage')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', since);
      if (error) throw error;
      return { used: count ?? 0, cap: TUTOR_DAILY_CAP };
    },
    staleTime: 60_000,
  });
}

export function useGenerateTutorPractice(conversationId: string | null, courseId?: string | null) {
  return useMutation({
    mutationFn: async ({ mode, focus }: { mode: 'practice' | 'quiz'; focus?: string }) => {
      if (!conversationId || !courseId) throw new Error('Open the Tutor from a course first');
      const data = await callTutor({
        conversationId, courseId, mode,
        message: focus?.trim() || `Create a ${mode} question from the most important current course material.`,
      }) as { practice: TutorPracticeQuestion };
      return data.practice;
    },
  });
}

/**
 * The practice question the student left unanswered, if any.
 *
 * Generated questions used to live in React state and nowhere else, so checking
 * the notes the question was about — the obvious thing to do when stuck — threw
 * it away. The row was in the database the whole time; it just had no client
 * SELECT policy, deliberately, because it carries the expected answer. So the
 * server hands back the question without it.
 */
export function useOpenPractice(courseId?: string | null) {
  return useQuery({
    queryKey: ['tutorOpenPractice', courseId ?? null],
    queryFn: async (): Promise<TutorPracticeQuestion | null> => {
      const data = await callTutor({ action: 'open_practice', courseId }) as {
        practice: TutorPracticeQuestion | null;
      };
      return data.practice ?? null;
    },
    enabled: !!courseId,
    staleTime: 5 * 60_000,
  });
}

export function useEvaluateTutorPractice(conversationId: string | null, courseId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ practiceId, answer }: { practiceId: string; answer: string }) => {
      if (!conversationId || !courseId) throw new Error('Open the Tutor from a course first');
      const data = await callTutor({
        conversationId, courseId, action: 'evaluate_practice', practiceId, answer,
      }) as { evaluation: TutorPracticeEvaluation };
      return data.evaluation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tutorKeys.mastery(courseId) });
      // Answering closes the open question — otherwise reopening the screen
      // would restore a question the student has already been graded on.
      qc.setQueryData(['tutorOpenPractice', courseId ?? null], null);
    },
  });
}

export function useCourseTopicMastery(courseId?: string | null) {
  return useQuery({
    queryKey: tutorKeys.mastery(courseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_topic_mastery')
        .select('*')
        .eq('course_id', courseId!)
        .order('correct', { ascending: true })
        .order('attempts', { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data || []) as CourseTopicMastery[];
    },
    enabled: !!courseId,
  });
}

// ── Notes ───────────────────────────────────────────────────

export function useCourseNotes(courseId?: string | null) {
  return useQuery({
    queryKey: tutorKeys.notes(courseId),
    queryFn: async () => {
      // `source = 'upload'` only. Lecture notes are mirrored into course_notes
      // so the tutor and flashcard generator can ground on them, but they are
      // NOT files the student uploaded: they have no storage object behind
      // them, and every row this hook returns is rendered as a chip that
      // deletes on tap. Showing them here would offer to delete a lecture from
      // a screen that has no idea it is doing that — and would call
      // storage.remove([null]). The lecture screen owns their lifecycle.
      const { data, error } = await supabase
        .from('course_notes')
        .select('id, course_id, storage_path, filename, mime_type, created_at, extracted')
        .eq('course_id', courseId!)
        .eq('source', 'upload')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CourseNote[];
    },
    enabled: !!courseId,
  });
}

// Base64 → bytes for the storage upload. Mirrors lib/syllabus.ts decode().
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Upload a supported course-material file for a course, reporting real network
// bytes as it moves to private storage. The new row is immediately prepared by
// tutor-chat so the UI can finish on "Ready" only after its text is cached.
export function useUploadCourseNote(courseId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: {
      uri: string;
      filename: string;
      mimeType: string;
      onProgress?: (progress: CourseNoteUploadProgress) => void;
    }) => {
      if (!courseId) throw new Error('No course');
      file.onProgress?.({ stage: 'validating', filename: file.filename });
      const session = await getSession();
      const userId = session.user.id;

      // Validate again at the shared mutation boundary so future upload UIs
      // cannot bypass the picker-level guard or silently store unreadable
      // files. The 6 MB cap matches both note-extraction Edge Functions.
      const document = normalizeSupportedDocument(file.filename, file.mimeType);
      if (!document) throw new Error(unsupportedDocumentMessage(file.filename));
      const fileSize = await getFileSize(file.uri);
      if (fileSize > MAX_COURSE_NOTE_BYTES) throw new Error(courseNoteTooLargeMessage());

      file.onProgress?.({ stage: 'preparing', filename: document.fileName });
      const base64 = await readFileAsBase64(file.uri);
      // Sanitize the filename for the storage key — spaces/slashes in the
      // path segment break the folder convention the RLS check relies on.
      const safeName = document.fileName.replace(/[^\w.\-]+/g, '_');
      const storagePath = `${userId}/${Date.now()}_${safeName}`;

      const bucket = supabase.storage.from('course-notes');
      const { data: signed, error: signedErr } = await bucket
        .createSignedUploadUrl(storagePath, { upsert: true });
      if (signedErr || !signed) throw signedErr ?? new Error('Could not prepare the upload.');

      const bytes = decode(base64);
      const rawBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const uploadResponse = await requestWithUploadProgress({
        url: signed.signedUrl,
        method: 'PUT',
        headers: {
          'Content-Type': document.mimeType,
          'cache-control': 'max-age=3600',
          'x-upsert': 'true',
        },
        body: rawBytes,
        onProgress: (percent) => file.onProgress?.({
          stage: 'uploading', percent, filename: document.fileName,
        }),
      });
      if (!uploadResponse.ok) {
        const uploadError = parseUploadJson<{ message?: string; error?: string }>(uploadResponse);
        throw new Error(uploadError?.message || uploadError?.error || 'The file could not be uploaded. Please try again.');
      }

      file.onProgress?.({ stage: 'saving', percent: 100, filename: document.fileName });
      const { data, error } = await supabase
        .from('course_notes')
        .insert({
          user_id: userId,
          course_id: courseId,
          storage_path: storagePath,
          filename: document.fileName,
          mime_type: document.mimeType,
        })
        .select('id, course_id, storage_path, filename, mime_type, created_at, extracted')
        .single();
      if (error) {
        bucket.remove([storagePath]).catch(() => {});
        throw error;
      }

      file.onProgress?.({ stage: 'reading', filename: document.fileName });
      try {
        await prepareCourseNotes(courseId, [data as CourseNote]);
      } catch (error) {
        // Roll back ONLY when the document itself is the problem. This used to
        // delete the row and the uploaded object on ANY failure — so a network
        // blip or a 503 while extracting text destroyed a file the student had
        // just watched upload to 100%, and the retry they were told to attempt
        // had nothing left to retry. Text extraction is resumable; the upload
        // is not.
        const code = (error as { code?: string })?.code;
        if (code === 'DOCUMENT_EXTRACTION_FAILED' || code === 'UNSUPPORTED_DOCUMENT') {
          await supabase.from('course_notes').delete().eq('id', data.id);
          await bucket.remove([storagePath]).catch(() => {});
        }
        throw error;
      }
      file.onProgress?.({ stage: 'ready', percent: 100, filename: document.fileName });
      return data as CourseNote;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tutorKeys.notes(courseId) });
    },
  });
}

export function useDeleteCourseNote(courseId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (note: { id: string; storage_path: string }) => {
      // Remove the file first (fire-and-forget — a dangling object is harmless
      // and RLS keeps it private), then the row.
      supabase.storage.from('course-notes').remove([note.storage_path]).catch(() => {});
      const { error } = await supabase.from('course_notes').delete().eq('id', note.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tutorKeys.notes(courseId) });
    },
  });
}
