import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  AiTask, asUntrustedDocument, callOpenAIResponses, isProviderConfigured, logAiCall,
  modelFor, openAIText, providerFor, usageFromOpenAI,
} from '../_shared/ai.ts';
import { withRequestLogging, errorFields } from '../_shared/log.ts';

// ── Study material from a lecture transcript ────────────────────────────────
// Structured on generate-flashcards/index.ts. Two modes:
//
//   notes → runs automatically once lecture-transcribe finishes. NOT Pro-gated:
//           the transcript alone is a wall of unpunctuated speech, so notes are
//           what makes a recorded lecture useful at all. Gating them would mean
//           the one free lecture delivers nothing a student would keep.
//   quiz  → on demand, Pro-gated, exactly like AI flashcard generation.
//
// The quiz is generated from the NOTES, not the transcript: the notes are
// already the distilled version, and a verbatim transcript is mostly filler,
// admin chatter and false starts that produce weak questions.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// A 90-minute lecture transcribes to roughly 70k characters, so this ceiling is
// headroom rather than a routine truncation point.
const MAX_TRANSCRIPT_CHARS = 80_000;
const MAX_NOTES_CHARS = 12_000;
const MIN_QUIZ_QUESTIONS = 3;
const MAX_QUIZ_QUESTIONS = 10;
const MAX_FIELD_CHARS = 400;

const NOTES_PROMPT = `You are writing study notes for a college student from a transcript of a class lecture they recorded.

The transcript is raw speech-to-text: it has no punctuation reliability, contains filler words, false starts, and administrative chatter, and may have gaps.

Write notes the student can revise from. Rules:
- Lead with the actual academic content: concepts, definitions, formulas, worked examples, and the reasoning the instructor gave.
- Capture any deadlines, exam dates, readings, or logistics the instructor mentioned in a final "Action items" section — students miss these constantly.
- Do NOT invent content. If the transcript is unclear about something, leave it out rather than guessing.
- If a section of the transcript is marked as missing or interrupted, do not fabricate what was said there.
- Be concise and skimmable.

Return ONLY GitHub-flavored markdown using this structure, no commentary and no code fences:

## Key concepts
- bullet points

## Details
- bullet points, with sub-detail where the instructor worked through something

## Action items
- deadlines, readings, exam dates, logistics (omit this heading entirely if none were mentioned)`;

const QUIZ_PROMPT = `You are writing a practice quiz for a college student from their own lecture notes.

Rules:
- Test the academic content: concepts, definitions, formulas, cause-and-effect. Never test administrative trivia (office hours, due dates, room numbers).
- Each question has exactly 4 options, exactly one correct.
- Wrong options must be plausible to someone who half-learned the material — not obviously silly.
- explanation states, in one or two sentences, why the correct answer is correct.
- Write between 5 and 8 questions. If the material genuinely does not support that many, write fewer rather than padding.

Return ONLY valid JSON in this exact shape, no commentary, no markdown fences:
{"questions": [{"question": "...", "choices": ["...", "...", "...", "..."], "answerIndex": 0, "explanation": "..."}]}`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

type Locale = 'en' | 'es';

const MSG = {
  transient: {
    en: 'Service temporarily unavailable',
    es: 'El servicio no está disponible temporalmente.',
  },
  notReady: {
    en: 'This lecture has no transcript yet.',
    es: 'Esta clase todavía no tiene transcripción.',
  },
  noNotes: {
    en: 'Generate the lecture notes first.',
    es: 'Genera primero los apuntes de la clase.',
  },
  proRequired: {
    en: 'Practice quizzes from your lectures are a Pro feature. Upgrade to Pro to try it.',
    es: 'Los cuestionarios de práctica de tus clases son una función Pro. Hazte Pro para probarlo.',
  },
  notesFailed: {
    en: "Couldn't write notes for this lecture. Please try again.",
    es: 'No se pudieron redactar los apuntes de esta clase. Inténtalo de nuevo.',
  },
  quizFailed: {
    en: "Couldn't build a quiz from this lecture. Please try again.",
    es: 'No se pudo crear un cuestionario de esta clase. Inténtalo de nuevo.',
  },
  busy: {
    en: 'The AI is busy right now — please try again in a minute.',
    es: 'La IA está saturada ahora mismo. Inténtalo de nuevo en un minuto.',
  },
} as const;

const t = (key: keyof typeof MSG, locale: Locale) => MSG[key][locale];

async function makeSafetyIdentifier(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `semora_${hex.slice(0, 32)}`;
}

serve(withRequestLogging('lecture-study-kit', async (req, log) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const MAX_BODY_BYTES = 4 * 1024;
    const contentLengthRaw = req.headers.get('content-length');
    if (!contentLengthRaw) return jsonResponse({ error: 'Content-Length required' }, 411);
    const contentLength = parseInt(contentLengthRaw, 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return jsonResponse({ error: 'Invalid Content-Length' }, 400);
    }
    if (contentLength > MAX_BODY_BYTES) return jsonResponse({ error: 'Request too large' }, 413);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Authentication required' }, 401);
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401);
    }
    const userId = userData.user.id;
    log.setUser(userId);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }
    const locale: Locale = body.locale === 'es' ? 'es' : 'en';
    const lectureId = typeof body.lectureId === 'string' ? body.lectureId : null;
    const mode = body.mode === 'quiz' ? 'quiz' : 'notes';
    if (!lectureId) return jsonResponse({ error: 'lectureId is required' }, 400);

    if (!isProviderConfigured(providerFor(AiTask.contentGeneration))) {
      log.error('provider_not_configured');
      return jsonResponse({ error: t('transient', locale) }, 503);
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // service_role bypasses RLS, so ownership is re-checked explicitly here.
    const { data: lecture, error: lectureErr } = await adminClient
      .from('lecture_recordings')
      .select('id, user_id, course_id, title, status, transcript, notes_md, duration_seconds')
      .eq('id', lectureId)
      .eq('user_id', userId)
      .maybeSingle();
    if (lectureErr) {
      log.error('lecture_lookup_failed', errorFields(lectureErr));
      return jsonResponse({ error: t('transient', locale) }, 503);
    }
    if (!lecture) return jsonResponse({ error: 'Lecture not found' }, 404);

    if (mode === 'quiz') {
      // Pro gate, fail-closed-as-transient on an RPC blip so a paying user is
      // never demoted by a database hiccup.
      const { data: proResult, error: proErr } = await adminClient.rpc('is_pro', { uid: userId });
      if (proErr) {
        log.error('is_pro_failed', errorFields(proErr));
        return jsonResponse({ error: t('transient', locale) }, 503);
      }
      if (proResult !== true) {
        return jsonResponse({ error: t('proRequired', locale), code: 'PRO_REQUIRED' }, 402);
      }
      return await handleQuiz(adminClient, userId, lecture, locale, log);
    }

    return await handleNotes(adminClient, userId, lecture, locale, log);
  } catch (err) {
    log.error('handler_error', errorFields(err));
    return jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
  }
}));

async function handleNotes(
  admin: any,
  userId: string,
  lecture: any,
  locale: Locale,
  log: any,
): Promise<Response> {
  // Idempotent: notes generation is kicked off automatically by the client the
  // moment it observes status='transcribed', and Realtime can deliver that more
  // than once. Returning the cached notes is both correct and free.
  //
  // The mirror still runs on this path. A student who records a lecture without
  // picking a course and attaches one afterwards would otherwise never get
  // their notes into that course's material — the mirror only ever ran at the
  // end of a fresh generation, which by then can never happen again.
  if (lecture.notes_md) {
    await mirrorToCourseNotes(admin, userId, lecture, lecture.notes_md, log);
    return jsonResponse({ ok: true, notesMd: lecture.notes_md, cached: true }, 200);
  }
  const transcript = typeof lecture.transcript === 'string' ? lecture.transcript.trim() : '';
  if (!transcript) {
    return jsonResponse({ error: t('notReady', locale), code: 'NO_TRANSCRIPT' }, 409);
  }

  // Stamp the claim so a client can tell "working on it" from "the isolate died
  // three minutes ago" — without it, a killed invocation leaves the lecture in
  // 'generating' and the detail screen spins forever with no retry offered.
  await admin.from('lecture_recordings')
    .update({ status: 'generating', notes_started_at: new Date().toISOString() })
    .eq('id', lecture.id)
    .eq('status', 'transcribed');

  const input = [
    NOTES_PROMPT,
    locale === 'es'
      ? 'LANGUAGE: Write the notes in natural, neutral Spanish. Keep proper names and technical terminology accurate.'
      : 'LANGUAGE: Write the notes in clear U.S. English.',
    lecture.title ? `COURSE / LECTURE TITLE: ${String(lecture.title).slice(0, 120)}` : '',
    // The transcript is a recording of whatever was said in the room, which can
    // include someone reading instructions aloud. Wrap it so the model treats
    // it as data, never as instructions addressed to it.
    asUntrustedDocument(transcript.slice(0, MAX_TRANSCRIPT_CHARS), 'LECTURE_TRANSCRIPT'),
  ].filter(Boolean).join('\n\n');

  const result = await callOpenAIResponses({
    model: modelFor(AiTask.contentGeneration),
    input: [{ role: 'user', content: input }],
    reasoning: { effort: 'none' },
    text: { verbosity: 'low' },
    max_output_tokens: 4096,
    store: false,
    safety_identifier: await makeSafetyIdentifier(userId),
  }, 'lecture-notes');

  await logAiCall(admin, userId, {
    task: AiTask.contentGeneration,
    provider: providerFor(AiTask.contentGeneration),
    model: modelFor(AiTask.contentGeneration),
    status: result.ok ? 'success' : 'failed',
    errorCode: result.ok ? null : String(result.status),
    durationMs: result.durationMs,
    attempts: result.attempts,
    ...(result.ok ? usageFromOpenAI(result.data) : {}),
  });

  const notes = result.ok ? openAIText(result.data) : null;
  if (!notes) {
    // Back to 'transcribed', not 'failed': the transcript is intact and
    // valuable on its own, and the client can offer a retry.
    await admin.from('lecture_recordings')
      .update({ status: 'transcribed', error_code: 'NOTES_FAILED', notes_started_at: null })
      .eq('id', lecture.id);
    log.error('notes_generation_failed', { status: result.status });
    const busy = result.status === 429 || result.status === 503;
    return jsonResponse(
      { error: busy ? t('busy', locale) : t('notesFailed', locale), code: 'NOTES_FAILED' },
      502,
    );
  }

  const notesMd = notes.replace(/```(?:markdown)?\n?/g, '').trim().slice(0, MAX_NOTES_CHARS);

  const { error: writeErr } = await admin
    .from('lecture_recordings')
    .update({ notes_md: notesMd, status: 'ready', error_code: null, notes_started_at: null })
    .eq('id', lecture.id);
  if (writeErr) {
    log.error('notes_write_failed', errorFields(writeErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }

  await mirrorToCourseNotes(admin, userId, lecture, notesMd, log);

  log.info('lecture_notes_generated', { lecture_id: lecture.id, chars: notesMd.length });
  return jsonResponse({ ok: true, notesMd }, 200);
}

/**
 * Copy the generated notes into `course_notes` so the AI Tutor and the
 * flashcard generator pick up lecture content with NO changes to those code
 * paths — both already ground on `course_notes.extracted_text`.
 *
 * The NOTES are mirrored, never the raw transcript. tutor-chat shares a 24,000
 * character budget across every note for a course; a single 70,000-character
 * transcript would consume all of it on the first row and silently drop the
 * syllabus and every uploaded slide deck from the tutor's context.
 *
 * Best-effort: the notes are already saved and shown on the lecture screen, so
 * a failure here degrades tutor grounding rather than the feature the student
 * is looking at.
 */
async function mirrorToCourseNotes(
  admin: any,
  userId: string,
  lecture: any,
  notesMd: string,
  log: any,
): Promise<void> {
  if (!lecture.course_id) return;
  try {
    const filename = `${String(lecture.title || 'Lecture').slice(0, 80)} (lecture notes)`;
    const { data: existing } = await admin
      .from('course_notes')
      .select('id')
      .eq('source_recording_id', lecture.id)
      .maybeSingle();

    if (existing) {
      await admin.from('course_notes')
        .update({ extracted_text: notesMd, filename })
        .eq('id', existing.id);
      return;
    }

    const { error } = await admin.from('course_notes').insert({
      user_id: userId,
      course_id: lecture.course_id,
      storage_path: null,       // generated text — there is no file behind it
      filename,
      mime_type: 'text/markdown',
      extracted_text: notesMd,  // populated up front, so extraction never runs
      source: 'lecture',
      source_recording_id: lecture.id,
    });
    // 23505 = the partial unique index caught a concurrent mirror. Not an error.
    if (error && (error as any).code !== '23505') {
      log.warn('course_note_mirror_failed', errorFields(error));
    }
  } catch (err) {
    log.warn('course_note_mirror_failed', errorFields(err));
  }
}

async function handleQuiz(
  admin: any,
  userId: string,
  lecture: any,
  locale: Locale,
  log: any,
): Promise<Response> {
  const notesMd = typeof lecture.notes_md === 'string' ? lecture.notes_md.trim() : '';
  if (!notesMd) {
    return jsonResponse({ error: t('noNotes', locale), code: 'NO_NOTES' }, 409);
  }

  // Same claim-stamp reasoning as notes: without a timestamp, an invocation
  // killed mid-generation leaves quiz_generating stuck true and the Quiz button
  // permanently disabled with a spinner on it.
  await admin.from('lecture_recordings')
    .update({ quiz_generating: true, quiz_started_at: new Date().toISOString() })
    .eq('id', lecture.id);

  const input = [
    QUIZ_PROMPT,
    locale === 'es'
      ? 'LANGUAGE: Write every question, option and explanation in natural, neutral Spanish.'
      : 'LANGUAGE: Write every question, option and explanation in clear U.S. English.',
    asUntrustedDocument(notesMd, 'LECTURE_NOTES'),
  ].join('\n\n');

  const result = await callOpenAIResponses({
    model: modelFor(AiTask.contentGeneration),
    input: [{ role: 'user', content: input }],
    reasoning: { effort: 'none' },
    text: { format: { type: 'json_object' }, verbosity: 'low' },
    max_output_tokens: 4096,
    store: false,
    safety_identifier: await makeSafetyIdentifier(userId),
  }, 'lecture-quiz');

  await logAiCall(admin, userId, {
    task: AiTask.contentGeneration,
    provider: providerFor(AiTask.contentGeneration),
    model: modelFor(AiTask.contentGeneration),
    status: result.ok ? 'success' : 'failed',
    errorCode: result.ok ? null : String(result.status),
    durationMs: result.durationMs,
    attempts: result.attempts,
    ...(result.ok ? usageFromOpenAI(result.data) : {}),
  });

  const clearFlag = () => admin.from('lecture_recordings')
    .update({ quiz_generating: false, quiz_started_at: null }).eq('id', lecture.id);

  const raw = result.ok ? openAIText(result.data) : null;
  if (!raw) {
    await clearFlag();
    log.error('quiz_generation_failed', { status: result.status });
    const busy = result.status === 429 || result.status === 503;
    return jsonResponse(
      { error: busy ? t('busy', locale) : t('quizFailed', locale), code: 'QUIZ_FAILED' },
      502,
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch (err) {
    await clearFlag();
    log.error('quiz_parse_failed', errorFields(err));
    return jsonResponse({ error: t('quizFailed', locale), code: 'QUIZ_FAILED' }, 502);
  }

  // Validate hard. A malformed answerIndex would render a quiz that marks the
  // right answer wrong, which is worse than no quiz at all — so questions are
  // dropped individually rather than trusted.
  const rawQuestions = Array.isArray(parsed?.questions) ? parsed.questions : [];
  const questions = rawQuestions
    .map((q: any) => {
      const choices = Array.isArray(q?.choices)
        ? q.choices
          .filter((c: any) => typeof c === 'string' && c.trim())
          .map((c: string) => c.trim().slice(0, MAX_FIELD_CHARS))
        : [];
      const answerIndex = Number.isInteger(q?.answerIndex) ? q.answerIndex : -1;
      return {
        question: typeof q?.question === 'string' ? q.question.trim().slice(0, MAX_FIELD_CHARS) : '',
        choices,
        answerIndex,
        explanation: typeof q?.explanation === 'string'
          ? q.explanation.trim().slice(0, MAX_FIELD_CHARS)
          : '',
      };
    })
    .filter((q: any) =>
      q.question.length > 0 &&
      q.choices.length === 4 &&
      // Deduplicated choices: a repeated option means two "correct" answers.
      new Set(q.choices).size === 4 &&
      q.answerIndex >= 0 && q.answerIndex < 4)
    .slice(0, MAX_QUIZ_QUESTIONS);

  if (questions.length < MIN_QUIZ_QUESTIONS) {
    await clearFlag();
    log.error('quiz_too_few_valid', { valid: questions.length, raw: rawQuestions.length });
    return jsonResponse({ error: t('quizFailed', locale), code: 'QUIZ_FAILED' }, 502);
  }

  const { error: writeErr } = await admin
    .from('lecture_recordings')
    .update({ quiz: questions, quiz_generating: false, quiz_started_at: null })
    .eq('id', lecture.id);
  if (writeErr) {
    await clearFlag();
    log.error('quiz_write_failed', errorFields(writeErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }

  log.info('lecture_quiz_generated', { lecture_id: lecture.id, questions: questions.length });
  return jsonResponse({ ok: true, quiz: questions }, 200);
}
