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
}

export interface TutorCitation {
  kind: 'syllabus' | 'deadline' | 'note' | 'assignment';
  label: string;
}

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
}

export interface CourseNote {
  id: string;
  course_id: string;
  storage_path: string;
  filename: string;
  mime_type: string | null;
  created_at: string;
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
  messages: (conversationId: string | null) => ['tutorMessages', conversationId] as const,
  notes: (courseId?: string | null) => ['courseNotes', courseId ?? null] as const,
  mastery: (courseId?: string | null) => ['courseTopicMastery', courseId ?? null] as const,
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
  notes: Pick<CourseNote, 'id' | 'filename'>[],
  onProgress?: (progress: CourseNoteReadProgress) => void,
): Promise<void> {
  const pendingNotes = notes.filter((note) => !preparedCourseNoteIds.has(note.id));
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

// ── Messages ────────────────────────────────────────────────

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
      return data as TutorMessage[];
    },
    enabled: !!conversationId,
  });
}

// POST a message to the tutor-chat edge function. The function persists both
// the user turn and the assistant reply, then returns the reply text. On
// success we invalidate the message list so it re-reads the canonical history.
export function useSendTutorMessage(conversationId: string | null, courseId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string | { message: string; mode?: 'chat' | 'explain_assignment'; assignmentId?: string }): Promise<string> => {
      if (!conversationId) throw new Error('No conversation');
      const request = typeof input === 'string' ? { message: input } : input;
      const data = await callTutor({
        conversationId, courseId: courseId ?? null, message: request.message,
        mode: request.mode ?? 'chat', assignmentId: request.assignmentId ?? null,
      }) as { reply: string };
      return data.reply;
    },
    onMutate: async (input: string | { message: string; mode?: 'chat' | 'explain_assignment'; assignmentId?: string }) => {
      // Show the user's turn immediately. The server round-trip is 3-10s and
      // without an optimistic bubble the just-sent message vanishes (draft is
      // cleared) until the reply lands. Rolled back on error below.
      await qc.cancelQueries({ queryKey: tutorKeys.messages(conversationId) });
      const previous = qc.getQueryData<TutorMessage[]>(tutorKeys.messages(conversationId));
      const message = typeof input === 'string' ? input : input.message;
      const optimistic = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId ?? '',
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      } as TutorMessage;
      qc.setQueryData<TutorMessage[]>(
        tutorKeys.messages(conversationId),
        (old = []) => [...old, optimistic],
      );
      return { previous };
    },
    onError: (_err, _message, ctx) => {
      // Roll back the optimistic bubble; the screen restores the draft so the
      // user doesn't lose what they typed.
      if (ctx?.previous) {
        qc.setQueryData(tutorKeys.messages(conversationId), ctx.previous);
      }
    },
    onSuccess: () => {
      // The edge function wrote both turns; re-read the canonical list.
      qc.invalidateQueries({ queryKey: tutorKeys.messages(conversationId) });
    },
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
    onSuccess: () => qc.invalidateQueries({ queryKey: tutorKeys.mastery(courseId) }),
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
        .select('id, course_id, storage_path, filename, mime_type, created_at')
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
        .select('id, course_id, storage_path, filename, mime_type, created_at')
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
