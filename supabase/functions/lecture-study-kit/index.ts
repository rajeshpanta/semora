import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  AiTask, asUntrustedDocument, callOpenAIResponses, isProviderConfigured, logAiCall,
  modelFor, openAIIncompleteReason, openAIText, providerFor, usageFromOpenAI,
} from '../_shared/ai.ts';
import {
  assembleSectionedNotes, parseSectionResult, sha256Hex, SECTION_TARGET_CHARS, SINGLE_PASS_CHARS,
  splitTranscriptSections, type SectionResult,
} from '../_shared/lectureNotesSections.ts';
import {
  excerptsInSection, markedExcerpts, markedMomentsInstruction, type TimedPart,
} from '../_shared/lectureMoments.ts';
import { autoTitleFromNotes } from '../_shared/lectureTitle.ts';
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

/**
 * Remote kill switch (plan Phase 5): LECTURE_SECTIONED_NOTES=off writes every
 * lecture's notes in a single call again, however long, as before 143.
 */
const SECTIONED_NOTES = (Deno.env.get('LECTURE_SECTIONED_NOTES') ?? '').trim().toLowerCase() !== 'off';

/**
 * Kill switch for the notes worker itself (147, audit): LECTURE_NOTES=off makes
 * every `notes` request — the app's and the scheduler's — answer the transient
 * 503 without claiming the lecture or calling the model, for a billing incident
 * or a bad prompt. Quizzes are unaffected. The scheduler's SQL still stamps
 * notes_auto_attempts before each request it sends (109), so a lecture that
 * waits out a long switch-off reaches 3 and stops being asked for — clear the
 * column when the switch is lifted (see DEPLOY_CHECKLIST R3).
 */
const NOTES_ON = (Deno.env.get('LECTURE_NOTES') ?? '').trim().toLowerCase() !== 'off';

// 143: there is no transcript ceiling any more. The 80,000-character one cut
// long lectures off silently (the longest in the week to 2026-09-16 was already
// 62,832). Transcripts up to SINGLE_PASS_CHARS are written in one call; longer
// ones a section at a time (_shared/lectureNotesSections.ts).

/**
 * Longest notes kept from one call.
 *
 * Was 12,000 characters, and that cap — not the model — cut the notes of every
 * lecture over ~40 minutes off mid-word: 13 of 20 note sets in the week to
 * 2026-09-16, including their Key terms and Action items. 48,000 matches the
 * call's own output budget (12,000 tokens at ~4 characters each); whether the
 * model itself ran out is read from the API (openAIIncompleteReason), not
 * guessed from the length.
 */
const MAX_NOTES_CHARS = 48_000;
/** Notes assembled from sections can legitimately be longer. */
const MAX_SECTIONED_NOTES_CHARS = 120_000;
/** Below this there is nothing to write notes from (matches the notes job). */
const MIN_NOTES_TRANSCRIPT_CHARS = 200;
/**
 * Everything one invocation may spend on the model, retries included. The
 * platform kills an edge function at 150 seconds, and the notes must be SAVED
 * inside that — the reason 148.5-second calls used to lose finished notes.
 */
const NOTES_BUDGET_MS = 118_000;

/**
 * A notes refresh whose claim is older than this is presumed dead (the isolate
 * was killed) and may be taken over. The slowest notes call on record is under
 * 150 seconds, the same bound sweep_stalled_lectures uses for 'generating'.
 */
const REFRESH_CLAIM_STALE_MS = 4 * 60 * 1000;
const MIN_QUIZ_QUESTIONS = 3;
// Raised from 10. A 50-minute lecture holds far more than ten testable ideas,
// and the cap was silently discarding the tail of a good quiz — the student saw
// a short quiz and had no way to know questions had been dropped.
const MAX_QUIZ_QUESTIONS = 25;
const MAX_FIELD_CHARS = 400;

// NOTE FOR MAINTAINERS (147: moved out of the prompt, where it cost ~80 tokens
// on every notes call and told the model about our App Store builds): bold is
// deliberately NOT requested in NOTES_PROMPT even though the current app
// renders it. The shipped App Store build (1.6/46, cut before the inline-bold
// renderer existed) prints ** as literal asterisks, and this function serves
// that build too — a prompt change reaches every version at once, while a
// renderer change reaches only the next one. Re-introduce **bold** once 1.6/46
// is no longer the floor. SECTION_PROMPT follows the same rule.
const NOTES_PROMPT = `You are writing study notes for a college student from a transcript of a class lecture they recorded.

The transcript is raw speech-to-text: it has no punctuation reliability, contains filler words, false starts, and administrative chatter, and may have gaps.

These notes are what the student revises from weeks later, when they remember none of the lecture. They must be able to answer an exam question from the notes alone, without the recording. Err on the side of MORE detail, not less.

Rules:
- Lead with the actual academic content: concepts, definitions, formulas, worked examples, and the reasoning the instructor gave for each.
- Explain, do not just name. "Covered the chain rule" is useless; state what it says, when it applies, and reproduce the example the instructor worked through, including the steps.
- Reproduce formulas, equations and numbers exactly as given.
- Where the instructor explained WHY something is true, or contrasted two ideas, keep that reasoning — it is the part a textbook will not give them.
- Capture any deadlines, exam dates, readings, or logistics in the final "Action items" section — students miss these constantly.
- Do NOT invent content. If the transcript is unclear about something, leave it out rather than guessing.
- If a section of the transcript is marked as missing or interrupted, do not fabricate what was said there.
- Never pad. Length must come from real content in the transcript, never from restating the same point in different words.

FORMATTING — the app renders a small subset of markdown and prints anything else literally, as the characters you typed.

- Headings (#, ##, ###) and "- " bullets (indent two spaces to nest) are supported. Use no inline formatting at all — no bold, no italics.
- Do NOT use tables, code fences, links, images, blockquotes, numbered lists, or *italics* — they will appear as raw punctuation in the middle of the notes.
- Write formulas as plain text (E = mc^2, dy/dx). A single * is read as multiplication, never as emphasis.

Return ONLY markdown in the structure below, no commentary and no code fences:

# A specific headline naming what this lecture was actually about

One or two sentences summarising the lecture as a whole, so the student knows what they are about to read.

## Key points
- The 3-6 things worth remembering if they remember nothing else. One line each.

## Notes
Organise the substance under your own H3 (###) subheadings, named after what the instructor actually covered — one per topic, in the order taught. Under each:
- Bullets carrying the explanation, with nested sub-bullets for steps, derivations and worked examples.
- Keep worked examples intact, showing the working rather than just the answer.

## Key terms
- Term — definition as the instructor gave it. Omit this heading entirely if the lecture introduced no new terminology.

## Action items
- deadlines, readings, exam dates, logistics (omit this heading entirely if none were mentioned)`;

// 143: notes for a long lecture are written a section at a time. Same rules and
// formatting as NOTES_PROMPT; each section returns only its own topics plus the
// terms and action items it contains, which are gathered across all sections.
const SECTION_PROMPT = `You are writing study notes for a college student from ONE SECTION of a transcript of a long class lecture they recorded. Other sections are written separately and joined in order afterwards.

The transcript is raw speech-to-text: it has no punctuation reliability, contains filler words, false starts, and administrative chatter, and may have gaps.

These notes are what the student revises from weeks later. They must be able to answer an exam question from the notes alone. Err on the side of MORE detail, not less.

Rules:
- Lead with the actual academic content: concepts, definitions, formulas, worked examples, and the reasoning the instructor gave for each.
- Explain, do not just name. Reproduce worked examples with their steps.
- Reproduce formulas, equations and numbers exactly as given.
- Do NOT invent content. If the transcript is unclear, leave it out.
- If part of the transcript is marked as missing or interrupted, do not fabricate what was said there.
- Never pad, and do not write an introduction or a summary of the whole lecture — only this section's substance.

FORMATTING of notes_md — the app renders a small subset of markdown:
- Use ### subheadings named after what the instructor covered, in the order taught, and "- " bullets (indent two spaces to nest).
- No #, ## headings, no bold, no italics, no tables, code fences, links, images, blockquotes or numbered lists.
- Write formulas as plain text (E = mc^2, dy/dx).

Return ONLY a JSON object, no commentary:
{"notes_md": "### Topic\\n- ...", "key_terms": ["Term — definition as the instructor gave it"], "action_items": ["deadline, reading, exam date or logistics mentioned in this section"]}
Use empty arrays when a section has no new terms or no action items.`;

const OVERVIEW_PROMPT = `You are writing the opening of a student's study notes for a long class lecture. The detailed notes for every section of the lecture are below, in order; they will appear under this opening unchanged.

Write ONLY this, in markdown, no commentary and no code fences:

# A specific headline naming what this lecture was actually about

One or two sentences summarising the lecture as a whole.

## Key points
- The 3-8 things worth remembering if they remember nothing else, across the whole lecture. One line each.

Rules: no bold or italics, no other headings, do not invent anything that is not in the section notes.`;

const QUIZ_PROMPT = `You are writing a practice quiz for a college student from their own lecture notes.

Rules:
- Test the academic content: concepts, definitions, formulas, cause-and-effect. Never test administrative trivia (office hours, due dates, room numbers).
- Each question has exactly 4 options, exactly one correct.
- Wrong options must be plausible to someone who half-learned the material — not obviously silly.
- explanation states, in one or two sentences, why the correct answer is correct.
- Cover the lecture. Write one question for every distinct idea worth testing — a definition, a mechanism, a formula, a cause-and-effect, a contrast between two things, a worked example's method. A full lecture usually supports 12 to 20; a short or thin one supports fewer.
- Work through the notes in order so the quiz covers the whole lecture rather than clustering on whatever came first.
- Never pad to reach a number. Two questions testing the same fact in different words is worse than one question, and a student notices immediately.

Return ONLY valid JSON in this exact shape, no commentary, no markdown fences:
{"questions": [{"question": "...", "choices": ["...", "...", "...", "..."], "answerIndex": 2, "explanation": "..."}]}

answerIndex is 0-based and must point at the correct entry in choices. Vary which position is correct across questions — the options are re-ordered after you answer, so never assume the first option is the right one.`;

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
  freeUsed: {
    // "Free accounts support" is what every shipped client matches on; see
    // the note in parse-syllabus.
    en: 'Free accounts support one AI action, and you have used it. Upgrade to Pro for unlimited notes, lectures and scans.',
    es: 'Ya usaste tu acción gratuita. Hazte Pro para generar apuntes, clases y escaneos sin límite.',
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
  quizInProgress: {
    en: 'Your quiz is already being built. It will be ready in a moment.',
    es: 'Ya se está creando tu cuestionario. Estará listo en un momento.',
  },
  tooShort: {
    en: 'This recording is too short to write notes from. Its transcript is saved on the lecture.',
    es: 'Esta grabación es demasiado corta para redactar apuntes. Su transcripción está guardada en la clase.',
  },
} as const;

const t = (key: keyof typeof MSG, locale: Locale) => MSG[key][locale];

/** Mirrors lecture_transcript_words (138): the words, without gap markers or layout. */
const GAP_MARKERS = /\[(Part of this recording could not be transcribed|Falta una parte de la grabación|Recording resumed after an interruption|La grabación se reanudó tras una interrupción)\.\]/g;
function transcriptWords(text: string): string {
  return text.replace(GAP_MARKERS, ' ').replace(/\s+/g, ' ').trim();
}

/** The language notes are written in: the lecture's, then the student's saved one, then the request's. */
async function notesLocaleFor(admin: any, userId: string, lecture: any, fallback: Locale): Promise<Locale> {
  if (lecture.language === 'es' || lecture.language === 'en') return lecture.language;
  const { data: profile } = await admin
    .from('profiles')
    .select('preferred_language')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.preferred_language === 'es' || profile?.preferred_language === 'en') return profile.preferred_language;
  return fallback;
}

async function makeSafetyIdentifier(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  return `semora_${hex.slice(0, 32)}`;
}

serve(withRequestLogging('lecture-study-kit', async (req, log) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  // Everything this invocation spends on the model is measured from here.
  const startedAt = Date.now();

  try {
    const MAX_BODY_BYTES = 4 * 1024;
    const contentLengthRaw = req.headers.get('content-length');
    if (!contentLengthRaw) return jsonResponse({ error: 'Content-Length required' }, 411);
    const contentLength = parseInt(contentLengthRaw, 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return jsonResponse({ error: 'Invalid Content-Length' }, 400);
    }
    if (contentLength > MAX_BODY_BYTES) return jsonResponse({ error: 'Request too large' }, 413);

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Two ways in, and they are not equal. A student presents a JWT and may ask
    // for anything they own. The scheduler (109) presents a shared secret, may
    // only ever ask for 'notes', and does not get to say WHOSE lecture it is —
    // the owner is read off the row further down. That asymmetry is the whole
    // security model here: the secret authorises "finish this lecture's notes",
    // never "act as this user".
    const cronSecret = req.headers.get('x-semora-lecture-cron-secret') ?? '';
    const isCron = cronSecret.length > 0;
    let userId = '';

    if (isCron) {
      const { data: expected, error: secretErr } = await adminClient.rpc('read_lecture_cron_secret');
      if (secretErr || typeof expected !== 'string' || cronSecret !== expected) {
        log.warn('cron_secret_rejected');
        return jsonResponse({ error: 'Unauthorized scheduler' }, 401);
      }
    } else {
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
      userId = userData.user.id;
      log.setUser(userId);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }
    const locale: Locale = body.locale === 'es' ? 'es' : 'en';
    const lectureId = typeof body.lectureId === 'string' ? body.lectureId : null;
    // The scheduler is pinned to 'notes' regardless of what it sent. Quiz is
    // Pro-gated and on-demand; nothing unattended should ever be able to reach
    // a gated, billable path on a student's behalf.
    const mode = isCron ? 'notes' : (body.mode === 'quiz' ? 'quiz' : 'notes');
    if (!lectureId) return jsonResponse({ error: 'lectureId is required' }, 400);

    // 147: notes switched off (LECTURE_NOTES=off). Answered before the lecture
    // is even read, so nothing is claimed and no attempt is spent here.
    if (mode === 'notes' && !NOTES_ON) {
      log.warn('notes_switched_off', { lecture_id: lectureId, via_cron: isCron });
      return jsonResponse({ error: t('transient', locale), code: 'NOTES_PAUSED' }, 503);
    }

    if (!isProviderConfigured(providerFor(AiTask.contentGeneration))) {
      log.error('provider_not_configured');
      return jsonResponse({ error: t('transient', locale) }, 503);
    }

    // service_role bypasses RLS, so ownership is re-checked explicitly here.
    // For a student that means "this row must be yours". For the scheduler
    // there is no claimed identity to check against, so the row itself is the
    // authority and its owner is adopted below.
    let lectureQuery = adminClient
      .from('lecture_recordings')
      .select('id, user_id, course_id, title, status, transcript, notes_md, duration_seconds, source, notes_stale, transcript_rev, notes_rewrite_requested, error_code, language, quiz_generating, quiz_started_at')
      .eq('id', lectureId);
    if (!isCron) lectureQuery = lectureQuery.eq('user_id', userId);

    const { data: lecture, error: lectureErr } = await lectureQuery.maybeSingle();
    if (lectureErr) {
      log.error('lecture_lookup_failed', errorFields(lectureErr));
      return jsonResponse({ error: t('transient', locale) }, 503);
    }
    if (!lecture) return jsonResponse({ error: 'Lecture not found' }, 404);

    if (isCron) {
      userId = lecture.user_id;
      log.setUser(userId);
      // A student who opened the lecture in the meantime is already generating.
      // Re-entering here would stamp a second claim over theirs and race the
      // write. 'transcribed' is the only state this worker has any business in,
      // plus (138) a finished lecture whose notes predate parts that arrived late.
      const refresh = Boolean(lecture.notes_md) &&
        (lecture.notes_stale === true || lecture.notes_rewrite_requested === true) &&
        (lecture.status === 'transcribed' || lecture.status === 'ready');
      if (refresh) {
        return await refreshNotes(adminClient, userId, lecture, locale, log, startedAt);
      }
      if (lecture.status !== 'transcribed' || lecture.notes_md) {
        log.info('cron_notes_skipped', { lecture_id: lecture.id, status: lecture.status });
        return jsonResponse({ ok: true, skipped: true }, 200);
      }
    }

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

    return await handleNotes(adminClient, userId, lecture, locale, log, startedAt, isCron);
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
  startedAt: number,
  isCron = false,
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
  // 143: a RECORDING is not written up from a sentence or two. The row is
  // settled as 'ready' first, so no app version is left spinning "Writing
  // notes" on it, and every version shows this message as-is. A DOCUMENT is a
  // deliberate upload and keeps getting notes however short, as before.
  if (lecture.source !== 'document' && transcriptWords(transcript).length < MIN_NOTES_TRANSCRIPT_CHARS) {
    await admin.from('lecture_recordings')
      .update({ status: 'ready', error_code: 'TOO_SHORT_FOR_NOTES', notes_started_at: null })
      .eq('id', lecture.id)
      .eq('status', 'transcribed');
    return jsonResponse({ error: t('tooShort', locale), code: 'TOO_SHORT_FOR_NOTES' }, 409);
  }

  // 143: the lecture's own language, then the student's saved one, then the
  // request's. The scheduler sends no locale, and a long lecture written in
  // sections by the app and the scheduler in turn must not change language
  // half-way through.
  locale = await notesLocaleFor(admin, userId, lecture, locale);

  // ── Free tier ────────────────────────────────────────────────────────────
  // A document-sourced note is an AI action and has to draw from the same
  // single free allowance as a scan or a recording (migration 071). Without
  // this it would be the way around the paywall: upload a PDF instead of
  // recording, unlimited, forever.
  //
  // Only the DOCUMENT path is charged here. A recording has already paid at
  // transcription time (lecture-transcribe charges lecture_usage_log when the
  // audio is processed); charging again here would take two actions for one
  // lecture. `source` is the whole distinction.
  //
  // Charged BEFORE generation, because there is no earlier moment that costs
  // anything — the upload itself is free — and a student who is out of free
  // actions should be told before the model runs rather than after.
  //
  // 143: the charge names THIS document (upload_id = lecture id), so
  //   - a long document written over several invocations is charged once and
  //     is not refused its own continuation, and
  //   - a generation that fails gives the action back (status 'failed'), where
  //     it used to leave a free student with nothing and nothing left to spend.
  if (lecture.source === 'document') {
    const { data: proResult, error: proErr } = await admin.rpc('is_pro', { uid: userId });
    if (proErr) {
      log.error('is_pro_failed', errorFields(proErr));
      return jsonResponse({ error: t('transient', locale) }, 503);
    }
    if (proResult !== true) {
      const { count: alreadyCharged } = await admin
        .from('scan_usage_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('upload_id', lecture.id)
        .eq('status', 'success');
      if (!alreadyCharged) {
        const { data: usedResult, error: usedErr } = await admin
          .rpc('free_action_used', { uid: userId });
        if (usedErr) {
          log.error('free_action_check_failed', errorFields(usedErr));
          return jsonResponse({ error: t('transient', locale) }, 503);
        }
        if (usedResult === true) {
          return jsonResponse({ error: t('freeUsed', locale), code: 'FREE_ACTION_USED' }, 402);
        }
        // Recorded in scan_usage_log rather than lecture_usage_log: that table
        // carries audio_seconds and feeds the daily transcription-capacity
        // ledger, neither of which a document touches. free_action_used() reads
        // both, so either one spends the allowance.
        const { error: chargeErr } = await admin.from('scan_usage_log').insert({
          user_id: userId,
          upload_id: lecture.id,
          status: 'success',
        });
        if (chargeErr) {
          // Logged, not thrown — same rule as parse-syllabus. The student is
          // about to receive their notes; losing them over our bookkeeping is
          // the worse outcome.
          log.error('free_action_charge_failed', errorFields(chargeErr));
        }
      }
    }
  }

  // Stamp the claim so a client can tell "working on it" from "the isolate died
  // three minutes ago" — without it, a killed invocation leaves the lecture in
  // 'generating' and the detail screen spins forever with no retry offered.
  const { data: claimed } = await admin.from('lecture_recordings')
    .update({ status: 'generating', notes_started_at: new Date().toISOString() })
    .eq('id', lecture.id)
    .eq('status', 'transcribed')
    .select('transcript')
    .maybeSingle();
  // 143: nothing matched means someone else holds the claim — the app's own
  // request and the scheduler's, or two taps. The second one used to carry on
  // anyway and pay for the same notes twice.
  if (!claimed) {
    log.info('notes_already_in_progress', { lecture_id: lecture.id });
    return jsonResponse({ ok: true, inProgress: true }, 202);
  }
  // 138: a late part can grow the transcript between the read above and this
  // claim; write the notes from what is there now.
  const claimedTranscript = typeof claimed.transcript === 'string' ? claimed.transcript.trim() : '';

  const outcome = await writeNotes(admin, userId, lecture.id, lecture.title,
    claimedTranscript || transcript, locale, log, startedAt, !isCron);

  if (outcome.kind === 'continue') {
    // A long lecture, written a section at a time. What is done is kept in
    // lecture_note_sections; give the claim back so the next request — the
    // app's, or the scheduler's within minutes — picks up where this stopped.
    await admin.from('lecture_recordings')
      .update({ status: 'transcribed', notes_started_at: null, error_code: null, notes_auto_attempts: 0 })
      .eq('id', lecture.id)
      .eq('status', 'generating');
    return jsonResponse({ ok: true, inProgress: true, continue: true }, 202);
  }

  if (outcome.kind === 'failed') {
    await outcome.logThisCall();
    // Back to 'transcribed', not 'failed': the transcript is intact and
    // valuable on its own, and the client can offer a retry.
    await admin.from('lecture_recordings')
      .update({ status: 'transcribed', error_code: 'NOTES_FAILED', notes_started_at: null })
      .eq('id', lecture.id);
    // 143: the free action is given back when nothing was delivered.
    if (lecture.source === 'document') {
      await admin.from('scan_usage_log')
        .update({ status: 'failed', error_code: 'NOTES_FAILED' })
        .eq('user_id', userId)
        .eq('upload_id', lecture.id)
        .eq('status', 'success')
        .then(undefined, () => {});
    }
    log.error('notes_generation_failed', { status: outcome.status });
    const busy = outcome.status === 429 || outcome.status === 503 || outcome.status === 0;
    return jsonResponse(
      { error: busy ? t('busy', locale) : t('notesFailed', locale), code: 'NOTES_FAILED' },
      502,
    );
  }

  const notesMd = outcome.notesMd;

  // THE STUDENT'S NOTES GO FIRST. Nothing else touches the database until this
  // has landed.
  //
  // This ordering is not stylistic. On 2026-08-31 lecture 96575255 asked for
  // notes on a 16,027-character PDF. The model answered — successfully, 3,815
  // tokens, after 148.5 seconds — and the isolate was killed in the gap between
  // writing the ai_call_log row and writing the notes. The log row survived.
  // The notes did not. Bookkeeping is replaceable. Their notes are not.
  const { error: writeErr } = await admin
    .from('lecture_recordings')
    .update({
      notes_md: notesMd,
      status: 'ready',
      error_code: null,
      notes_started_at: null,
      notes_truncated: outcome.truncated,
    })
    .eq('id', lecture.id);
  if (writeErr) {
    await outcome.logThisCall();
    log.error('notes_write_failed', errorFields(writeErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }

  // Safe now — the notes are durable, so everything from here is bookkeeping
  // and may be lost to a timeout without costing the student anything.
  await outcome.logThisCall();
  if (outcome.truncated) {
    log.warn('lecture_notes_truncated', { lecture_id: lecture.id, chars: notesMd.length });
  }

  // 147: a recording still wearing its made-up name takes the notes' headline.
  const titled = await maybeAutoTitle(admin, lecture, notesMd, log);
  await mirrorToCourseNotes(admin, userId, titled ? { ...lecture, title: titled } : lecture, notesMd, log);

  log.info('lecture_notes_generated', { lecture_id: lecture.id, chars: notesMd.length, sectioned: outcome.sectioned });
  return jsonResponse({ ok: true, notesMd }, 200);
}

type NotesOutcome =
  | { kind: 'done'; notesMd: string; truncated: boolean; sectioned: boolean; logThisCall: () => Promise<void> }
  | { kind: 'continue' }
  | { kind: 'failed'; status: number; logThisCall: () => Promise<void> };

const noLog = async () => {};

function languageLine(locale: Locale): string {
  return locale === 'es'
    ? 'LANGUAGE: Write the notes in natural, neutral Spanish. Keep proper names and technical terminology accurate.'
    : 'LANGUAGE: Write the notes in clear U.S. English.';
}

/**
 * Notes for one transcript, by whichever route fits it.
 *
 * Up to SINGLE_PASS_CHARS: one call, exactly as before (138), with room for the
 * whole of a long lecture's notes — the old 12,000-character cap cut every
 * lecture over ~40 minutes off mid-word, including its Key terms and Action
 * items. Longer: a section at a time (see _shared/lectureNotesSections.ts), so
 * no transcript is ever truncated to fit.
 */
async function writeNotes(
  admin: any,
  userId: string,
  lectureId: string,
  title: string | null,
  transcript: string,
  locale: Locale,
  log: any,
  startedAt: number,
  /** A student asked: sections that used up their attempts get another go. */
  studentRetry = false,
): Promise<NotesOutcome> {
  const left = () => NOTES_BUDGET_MS - (Date.now() - startedAt);
  // 145: what the student marked important while recording. Best effort.
  const marked = await markedMomentExcerpts(admin, lectureId).catch(() => [] as string[]);

  // A single call that ran out of time on an earlier try left section rows
  // behind (below): from then on this lecture is written in sections, which
  // each fit the budget with room to spare. Without this the same transcript
  // timed out on every attempt (audit).
  const sectionedBefore = SECTIONED_NOTES && transcript.length > SECTION_TARGET_CHARS &&
    Boolean((await admin.from('lecture_note_sections').select('idx', { count: 'exact', head: true })
      .eq('lecture_id', lectureId)).count);

  if ((transcript.length <= SINGLE_PASS_CHARS && !sectionedBefore) || !SECTIONED_NOTES) {
    const { result, notes, logThisCall } = await writeNotesWithModel(
      admin, userId, title, transcript, locale, Math.max(20_000, left()), marked);
    if (!notes && result.timedOut && SECTIONED_NOTES && transcript.length > SECTION_TARGET_CHARS) {
      // Too slow in one call: switch this lecture to sections. The rows mark
      // the switch; the next invocation (the app's retry, or the scheduler's
      // within minutes) writes them.
      await logThisCall();
      const sections = splitTranscriptSections(transcript);
      const hashes = await Promise.all(sections.map((s) => sha256Hex(s)));
      await admin.from('lecture_note_sections').upsert(
        sections.map((_, i) => ({ lecture_id: lectureId, idx: i, text_hash: hashes[i], status: 'pending', result: null, attempts: 0 })),
        { onConflict: 'lecture_id,idx' },
      );
      log.warn('notes_single_pass_timed_out_switching_to_sections', { lecture_id: lectureId, chars: transcript.length });
      return { kind: 'continue' };
    }
    if (!notes) return { kind: 'failed', status: result.status, logThisCall };
    const cleaned = notes.replace(/```(?:markdown)?\n?/g, '').trim();
    const truncated = openAIIncompleteReason(result.data) === 'max_output_tokens' || cleaned.length > MAX_NOTES_CHARS;
    return { kind: 'done', notesMd: cleaned.slice(0, MAX_NOTES_CHARS), truncated, sectioned: false, logThisCall };
  }

  const sections = splitTranscriptSections(transcript);
  const hashes = await Promise.all(sections.map((s) => sha256Hex(s)));

  const { data: rows, error: rowsErr } = await admin
    .from('lecture_note_sections')
    .select('idx, text_hash, status, result, attempts, updated_at')
    .eq('lecture_id', lectureId);
  if (rowsErr) {
    log.error('note_sections_read_failed', errorFields(rowsErr));
    return { kind: 'failed', status: 503, logThisCall: noLog };
  }
  const byIdx = new Map<number, any>(((rows ?? []) as any[]).map((r) => [r.idx, r]));

  // Sections that no longer exist (the transcript got shorter, which only a
  // rewrite could do) are dropped; sections whose text changed start again.
  await admin.from('lecture_note_sections').delete().eq('lecture_id', lectureId).gte('idx', sections.length);
  for (let i = 0; i < sections.length; i++) {
    const row = byIdx.get(i);
    if (!row || row.text_hash !== hashes[i]) {
      const fresh = { lecture_id: lectureId, idx: i, text_hash: hashes[i], status: 'pending', result: null, attempts: 0 };
      await admin.from('lecture_note_sections').upsert(fresh, { onConflict: 'lecture_id,idx' });
      byIdx.set(i, fresh);
    }
  }

  const done: SectionResult[] = [];
  for (let i = 0; i < sections.length; i++) {
    const row = byIdx.get(i);
    if (row.status === 'done' && row.result) {
      done.push(row.result as SectionResult);
      continue;
    }
    if (row.attempts >= 3) {
      const updatedMs = row.updated_at ? new Date(row.updated_at).getTime() : 0;
      if (!studentRetry && Date.now() - updatedMs < 60 * 60 * 1000) {
        log.error('note_section_exhausted', { lecture_id: lectureId, idx: i });
        return { kind: 'failed', status: 502, logThisCall: noLog };
      }
      // A student pressing "Try again", or an hour later: a fresh set of tries.
      row.attempts = 0;
    }
    // Stop while there is still time to save: the next invocation carries on.
    if (left() < 50_000) return { kind: 'continue' };

    await admin.from('lecture_note_sections')
      .update({ attempts: row.attempts + 1, updated_at: new Date().toISOString() })
      .eq('lecture_id', lectureId).eq('idx', i);

    const result = await callOpenAIResponses({
      model: modelFor(AiTask.contentGeneration),
      input: [{
        role: 'user',
        content: [
          SECTION_PROMPT,
          languageLine(locale),
          title ? `COURSE / LECTURE TITLE: ${String(title).slice(0, 120)}` : '',
          `This is part ${i + 1} of ${sections.length} of the lecture, in order.`,
          markedBlock(excerptsInSection(marked, sections[i])),
          asUntrustedDocument(sections[i], 'LECTURE_TRANSCRIPT_SECTION'),
        ].filter(Boolean).join('\n\n'),
      }],
      reasoning: { effort: 'none' },
      text: { format: { type: 'json_object' }, verbosity: 'medium' },
      max_output_tokens: 10000,
      store: false,
      safety_identifier: await makeSafetyIdentifier(userId),
    }, 'lecture-notes-section', { deadlineMs: Math.min(80_000, left() - 8_000) });

    await logAiCall(admin, userId, {
      task: AiTask.contentGeneration,
      provider: providerFor(AiTask.contentGeneration),
      model: modelFor(AiTask.contentGeneration),
      status: result.ok ? 'success' : 'failed',
      errorCode: result.ok ? null : (result.timedOut ? 'timeout' : String(result.status)),
      errorDetail: result.ok ? null : result.errorBody,
      durationMs: result.durationMs,
      attempts: result.attempts,
      ...(result.ok ? usageFromOpenAI(result.data) : {}),
    });

    const parsed = result.ok ? parseSectionResult(openAIText(result.data)) : null;
    if (!parsed) {
      log.warn('note_section_failed', { lecture_id: lectureId, idx: i, status: result.status });
      // Two more tries are left for this section; let another invocation have
      // them rather than spending this one's remaining time on the same wall.
      return row.attempts + 1 >= 3 ? { kind: 'failed', status: result.status, logThisCall: noLog } : { kind: 'continue' };
    }
    await admin.from('lecture_note_sections')
      .update({ status: 'done', result: parsed, updated_at: new Date().toISOString() })
      .eq('lecture_id', lectureId).eq('idx', i).eq('text_hash', hashes[i]);
    done.push(parsed);
  }

  if (left() < 30_000) return { kind: 'continue' };

  const overview = await callOpenAIResponses({
    model: modelFor(AiTask.contentGeneration),
    input: [{
      role: 'user',
      content: [
        OVERVIEW_PROMPT,
        languageLine(locale),
        title ? `COURSE / LECTURE TITLE: ${String(title).slice(0, 120)}` : '',
        asUntrustedDocument(done.map((s) => s.notes_md).join('\n\n').slice(0, 60_000), 'LECTURE_SECTION_NOTES'),
      ].filter(Boolean).join('\n\n'),
    }],
    reasoning: { effort: 'none' },
    text: { verbosity: 'low' },
    max_output_tokens: 2500,
    store: false,
    safety_identifier: await makeSafetyIdentifier(userId),
  }, 'lecture-notes-overview', { deadlineMs: Math.min(45_000, left() - 6_000) });

  const logOverview = () => logAiCall(admin, userId, {
    task: AiTask.contentGeneration,
    provider: providerFor(AiTask.contentGeneration),
    model: modelFor(AiTask.contentGeneration),
    status: overview.ok ? 'success' : 'failed',
    errorCode: overview.ok ? null : (overview.timedOut ? 'timeout' : String(overview.status)),
    errorDetail: overview.ok ? null : overview.errorBody,
    durationMs: overview.durationMs,
    attempts: overview.attempts,
    ...(overview.ok ? usageFromOpenAI(overview.data) : {}),
  });

  const head = overview.ok ? openAIText(overview.data) : null;
  if (!head) return { kind: 'failed', status: overview.status, logThisCall: logOverview };

  const assembled = assembleSectionedNotes(head.replace(/```(?:markdown)?\n?/g, '').trim(), done);
  return {
    kind: 'done',
    notesMd: assembled.slice(0, MAX_SECTIONED_NOTES_CHARS),
    truncated: assembled.length > MAX_SECTIONED_NOTES_CHARS,
    sectioned: true,
    logThisCall: logOverview,
  };
}

/** The marked-moments instruction plus the excerpts, as data. '' when none. */
function markedBlock(excerpts: string[]): string {
  if (!excerpts.length) return '';
  return [
    markedMomentsInstruction(excerpts),
    asUntrustedDocument(excerpts.map((e, i) => `${i + 1}. ${e}`).join('\n'), 'MARKED_MOMENTS'),
  ].join('\n\n');
}

/** Excerpts for a recording's important marks (145); [] for anything else. */
async function markedMomentExcerpts(admin: any, lectureId: string): Promise<string[]> {
  const { data: lecture } = await admin.from('lecture_recordings')
    .select('important_marks, source').eq('id', lectureId).maybeSingle();
  const marks = (lecture?.important_marks ?? []) as number[];
  if (lecture?.source !== 'recording' || !marks.length) return [];
  const { data: parts } = await admin.from('lecture_segments')
    .select('seq, seconds, timings').eq('lecture_id', lectureId).order('seq', { ascending: true });
  return markedExcerpts((parts ?? []) as TimedPart[], marks);
}

/**
 * What this student's course has coming up and what they find hard (4.9), so a
 * quiz practises what the next exam will ask. Best effort: '' when there is
 * nothing, or the lookup fails.
 */
async function quizContext(admin: any, userId: string, courseId: string | null): Promise<string> {
  if (!courseId) return '';
  const today = new Date().toISOString().slice(0, 10);
  const until = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [assessments, topics] = await Promise.all([
    admin.from('tasks').select('title, type, due_date')
      .eq('user_id', userId).eq('course_id', courseId)
      .in('type', ['exam', 'quiz']).eq('is_completed', false)
      .gte('due_date', today).lte('due_date', until)
      .order('due_date', { ascending: true }).limit(5),
    admin.from('course_topic_mastery').select('topic, attempts, correct')
      .eq('user_id', userId).eq('course_id', courseId).gte('attempts', 3)
      .order('updated_at', { ascending: false }).limit(30),
  ]);
  const upcoming = ((assessments.data ?? []) as { title: string; due_date: string }[])
    .map((a) => `${String(a.title).slice(0, 80)} (${a.due_date})`);
  const hard = ((topics.data ?? []) as { topic: string; attempts: number; correct: number }[])
    .filter((t) => t.attempts > 0 && t.correct / t.attempts < 0.6)
    .slice(0, 8)
    .map((t) => String(t.topic).slice(0, 80));
  if (!upcoming.length && !hard.length) return '';
  // The instruction is ours; the titles and topics are the student's words, so
  // they go in as data.
  const data = [
    upcoming.length ? `Upcoming exams and quizzes: ${upcoming.join('; ')}` : '',
    hard.length ? `Topics often answered wrong in practice: ${hard.join('; ')}` : '',
  ].filter(Boolean).join('\n');
  return [
    'STUDENT CONTEXT: below are this course\'s upcoming exams and quizzes and the topics this student has been getting wrong. Use it only to choose emphasis — favour material likely to be assessed soon and, where the notes cover a hard topic, include questions on it. Every question must still come from the notes.',
    asUntrustedDocument(data, 'STUDENT_CONTEXT'),
  ].join('\n\n');
}

/**
 * One single-pass notes request to the model. The caller decides when to log
 * the call: after the notes are saved.
 */
async function writeNotesWithModel(
  admin: any,
  userId: string,
  title: string | null,
  transcript: string,
  locale: Locale,
  budgetMs: number,
  marked: string[] = [],
) {
  const input = [
    NOTES_PROMPT,
    languageLine(locale),
    title ? `COURSE / LECTURE TITLE: ${String(title).slice(0, 120)}` : '',
    markedBlock(marked),
    // The transcript is a recording of whatever was said in the room, which can
    // include someone reading instructions aloud. Wrap it so the model treats
    // it as data, never as instructions addressed to it.
    asUntrustedDocument(transcript, 'LECTURE_TRANSCRIPT'),
  ].filter(Boolean).join('\n\n');

  const result = await callOpenAIResponses({
    model: modelFor(AiTask.contentGeneration),
    input: [{ role: 'user', content: input }],
    reasoning: { effort: 'none' },
    // Notes are the one output here meant to be LONG. Nothing pads to fill the
    // room — the prompt forbids restating a point to reach a length.
    text: { verbosity: 'medium' },
    max_output_tokens: 12000,
    store: false,
    safety_identifier: await makeSafetyIdentifier(userId),
  }, 'lecture-notes', { deadlineMs: budgetMs });

  // Deliberately NOT logged yet. See the write in handleNotes.
  const logThisCall = () => logAiCall(admin, userId, {
    task: AiTask.contentGeneration,
    provider: providerFor(AiTask.contentGeneration),
    model: modelFor(AiTask.contentGeneration),
    status: result.ok ? 'success' : 'failed',
    errorCode: result.ok ? null : (result.timedOut ? 'timeout' : String(result.status)),
    errorDetail: result.ok ? null : result.errorBody,
    durationMs: result.durationMs,
    attempts: result.attempts,
    ...(result.ok ? usageFromOpenAI(result.data) : {}),
  });

  const notes = result.ok ? openAIText(result.data) : null;
  return { result, notes, logThisCall };
}

/**
 * Rewrite notes whose transcript has since grown (138), or that a maintenance
 * rewrite asked for quietly (143, notes_rewrite_requested).
 *
 * What the student has is never taken away to do this. The lecture stays
 * 'ready' (or 'transcribed') and its current notes stay on screen the whole
 * time; the claim is notes_started_at alone, and a failure only clears that
 * claim. The new notes replace the old ones in a single write.
 *
 * notes_stale is cleared only if transcript_rev did not move while the model
 * was writing. If another part landed meanwhile, the better notes are still
 * saved but stay stale, and the next scheduler pass rewrites them again.
 *
 * Only a stale refresh stamps notes_refreshed_at, which is what sends "your
 * notes were updated". A quiet rewrite changes the notes without a message.
 *
 * No free-allowance charge: refreshing notes the student already has is not a
 * new action.
 */
async function refreshNotes(
  admin: any,
  userId: string,
  lecture: any,
  locale: Locale,
  log: any,
  startedAt: number,
): Promise<Response> {
  const now = new Date();
  const deadClaim = new Date(now.getTime() - REFRESH_CLAIM_STALE_MS).toISOString();
  const { data: claimed, error: claimErr } = await admin
    .from('lecture_recordings')
    .update({ notes_started_at: now.toISOString() })
    .eq('id', lecture.id)
    .or('notes_stale.eq.true,notes_rewrite_requested.eq.true')
    .in('status', ['transcribed', 'ready'])
    .or(`notes_started_at.is.null,notes_started_at.lt.${deadClaim}`)
    .select('transcript, transcript_rev, title, course_id, notes_stale, quiz')
    .maybeSingle();
  if (claimErr) {
    log.error('notes_refresh_claim_failed', errorFields(claimErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }
  if (!claimed) {
    log.info('notes_refresh_skipped', { lecture_id: lecture.id });
    return jsonResponse({ ok: true, skipped: true }, 200);
  }

  // The scheduler sends no locale, and these notes replace ones the student
  // may have had written in Spanish. The lecture's own language decides, then
  // the student's saved one.
  const { data: profile } = await admin
    .from('profiles')
    .select('preferred_language')
    .eq('id', userId)
    .maybeSingle();
  const notesLocale: Locale = lecture.language === 'es' ? 'es'
    : lecture.language === 'en' ? 'en'
    : profile?.preferred_language === 'es' ? 'es'
    : profile?.preferred_language === 'en' ? 'en' : locale;

  const transcript = typeof claimed.transcript === 'string' ? claimed.transcript.trim() : '';
  const outcome = await writeNotes(admin, userId, lecture.id, claimed.title, transcript, notesLocale, log, startedAt);

  if (outcome.kind !== 'done') {
    if (outcome.kind === 'failed') await outcome.logThisCall();
    // The old notes are untouched and the flag is still set, so the scheduler
    // tries again. A long lecture that made progress keeps its sections and
    // gets its attempts back.
    await admin.from('lecture_recordings')
      .update({
        notes_started_at: null,
        ...(outcome.kind === 'continue' ? { notes_auto_attempts: 0 } : {}),
      })
      .eq('id', lecture.id);
    if (outcome.kind === 'continue') {
      return jsonResponse({ ok: true, inProgress: true, continue: true }, 202);
    }
    log.error('notes_refresh_failed', { lecture_id: lecture.id, status: outcome.status });
    return jsonResponse({ error: t('notesFailed', locale), code: 'NOTES_FAILED' }, 502);
  }

  const notesMd = outcome.notesMd;
  const wasStale = claimed.notes_stale === true;
  const hadQuiz = Array.isArray(claimed.quiz) && claimed.quiz.length > 0;
  const common = {
    notes_md: notesMd,
    status: 'ready',
    error_code: null,
    notes_started_at: null,
    notes_truncated: outcome.truncated,
    notes_rewrite_requested: false,
    // 143: a quiz built from the old notes is offered for rebuilding.
    ...(hadQuiz ? { quiz_stale: true } : {}),
  };

  // Notes first, for the reason handleNotes gives. Clearing stale is guarded on
  // the revision the notes were written from.
  const { data: current, error: writeErr } = await admin
    .from('lecture_recordings')
    .update({
      ...common,
      notes_stale: false,
      ...(wasStale ? { notes_refreshed_at: new Date().toISOString() } : {}),
    })
    .eq('id', lecture.id)
    .eq('transcript_rev', claimed.transcript_rev)
    .in('status', ['transcribed', 'ready'])
    .select('id')
    .maybeSingle();
  let upToDate = Boolean(current);
  if (!writeErr && !current) {
    // The transcript moved on while the model was writing. These notes still
    // cover more than the ones on screen, so save them, and leave the lecture
    // stale for the next pass.
    const { error: laterErr } = await admin
      .from('lecture_recordings')
      .update(common)
      .eq('id', lecture.id)
      .in('status', ['transcribed', 'ready']);
    if (laterErr) {
      await outcome.logThisCall();
      log.error('notes_refresh_write_failed', errorFields(laterErr));
      return jsonResponse({ error: t('transient', locale) }, 503);
    }
    upToDate = false;
  }
  if (writeErr) {
    await outcome.logThisCall();
    log.error('notes_refresh_write_failed', errorFields(writeErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }

  await outcome.logThisCall();
  const refreshed = { ...lecture, title: claimed.title, course_id: claimed.course_id };
  const titled = await maybeAutoTitle(admin, refreshed, notesMd, log);
  await mirrorToCourseNotes(admin, userId, titled ? { ...refreshed, title: titled } : refreshed, notesMd, log);

  log.info('lecture_notes_refreshed', {
    lecture_id: lecture.id, chars: notesMd.length, up_to_date: upToDate, quiet: !wasStale,
  });
  return jsonResponse({ ok: true, refreshed: true, upToDate }, 200);
}

/**
 * Name a RECORDING after its notes (147, market-parity-8): when the title is
 * still the app's fallback ("Biology 101 · Tue, Sep 16", "Lecture") and the
 * notes open with a real headline, the headline becomes the title. A title the
 * student typed is never touched, and the write is guarded on the title the
 * notes were written under, so a rename made while the model was writing wins.
 * Best effort; returns the new title, or null when nothing changed.
 */
async function maybeAutoTitle(admin: any, lecture: any, notesMd: string, log: any): Promise<string | null> {
  if (lecture.source !== 'recording') return null;
  const next = autoTitleFromNotes(lecture.title, notesMd);
  if (!next) return null;
  try {
    const { data, error } = await admin
      .from('lecture_recordings')
      .update({ title: next })
      .eq('id', lecture.id)
      .eq('title', lecture.title)
      .select('id')
      .maybeSingle();
    if (error || !data) {
      if (error) log.warn('auto_title_failed', errorFields(error));
      return null;
    }
    log.info('lecture_auto_titled', { lecture_id: lecture.id, chars: next.length });
    return next;
  } catch (err) {
    log.warn('auto_title_failed', errorFields(err));
    return null;
  }
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

  // 147: the quiz is in the language the notes are in — the lecture's, then
  // the student's saved one, then the request's — the same rule as notes. A
  // Spanish app in an English class got English notes and a Spanish quiz.
  locale = await notesLocaleFor(admin, userId, lecture, locale);

  // Same claim-stamp reasoning as notes: without a timestamp, an invocation
  // killed mid-generation leaves quiz_generating stuck true and the Quiz button
  // permanently disabled with a spinner on it (the sweep also resets one after
  // 5 minutes, 143).
  //
  // 143: and a CLAIM, not a bare write. Two requests used to both run and both
  // pay; the second now matches nothing and is told a quiz is on its way.
  const quizDeadClaim = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: quizClaim } = await admin.from('lecture_recordings')
    .update({ quiz_generating: true, quiz_started_at: new Date().toISOString() })
    .eq('id', lecture.id)
    .or(`quiz_generating.eq.false,quiz_started_at.is.null,quiz_started_at.lt.${quizDeadClaim}`)
    .select('id')
    .maybeSingle();
  if (!quizClaim) {
    // 409, not 202: every app version treats a 2xx as "the quiz is here" and
    // opens the quiz screen, which would say the quiz is not available.
    log.info('quiz_already_in_progress', { lecture_id: lecture.id });
    return jsonResponse({ error: t('quizInProgress', locale), code: 'QUIZ_IN_PROGRESS' }, 409);
  }

  const input = [
    QUIZ_PROMPT,
    locale === 'es'
      ? 'LANGUAGE: Write every question, option and explanation in natural, neutral Spanish.'
      : 'LANGUAGE: Write every question, option and explanation in clear U.S. English.',
    // 145: points the student marked while recording carry a ⭐ in the notes.
    notesMd.includes('⭐')
      ? 'Bullets starting with ⭐ are points the student marked important during the lecture: write at least one question on every one of them.'
      : '',
    await quizContext(admin, userId, lecture.course_id ?? null).catch(() => ''),
    asUntrustedDocument(notesMd, 'LECTURE_NOTES'),
  ].filter(Boolean).join('\n\n');

  const result = await callOpenAIResponses({
    model: modelFor(AiTask.contentGeneration),
    input: [{ role: 'user', content: input }],
    reasoning: { effort: 'none' },
    text: { format: { type: 'json_object' }, verbosity: 'low' },
    // Asking for up to 20 questions inside a 4096 cap is asking for a truncated
    // JSON object — which parses as nothing and fails the whole quiz, not just
    // its tail. Each question is roughly 120-180 tokens with four options and
    // an explanation, so 20 needs ~3.5k for the questions alone before any
    // JSON overhead. Verbosity stays 'low': terse questions are good questions.
    max_output_tokens: 10000,
    store: false,
    safety_identifier: await makeSafetyIdentifier(userId),
  }, 'lecture-quiz');

  await logAiCall(admin, userId, {
    task: AiTask.contentGeneration,
    provider: providerFor(AiTask.contentGeneration),
    model: modelFor(AiTask.contentGeneration),
    status: result.ok ? 'success' : 'failed',
    errorCode: result.ok ? null : String(result.status),
    errorDetail: result.ok ? null : result.errorBody,
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
    .slice(0, MAX_QUIZ_QUESTIONS)
    // Shuffle every question's options.
    //
    // The correct answer was landing on option A in essentially every
    // question. The cause is this file: the prompt's own example ends
    // `"answerIndex": 0`, and a model reproducing the shape of an example
    // reproduces its values too. A student notices that within one quiz and
    // the whole thing stops testing anything.
    //
    // Fixed here rather than in the prompt on purpose. "Vary which option is
    // correct" is an instruction a model follows unreliably and silently, and
    // there is no way to tell from the response whether it did. Shuffling the
    // array after the fact is deterministic, costs nothing, and holds no
    // matter what the model returns or which model serves the request.
    .map((q: any) => {
      const correct = q.choices[q.answerIndex];
      const shuffled = [...q.choices];
      // Fisher-Yates. crypto.getRandomValues rather than Math.random so the
      // ordering is not predictable across questions generated together.
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return { ...q, choices: shuffled, answerIndex: shuffled.indexOf(correct) };
    });

  if (questions.length < MIN_QUIZ_QUESTIONS) {
    await clearFlag();
    log.error('quiz_too_few_valid', { valid: questions.length, raw: rawQuestions.length });
    return jsonResponse({ error: t('quizFailed', locale), code: 'QUIZ_FAILED' }, 502);
  }

  const { error: writeErr } = await admin
    .from('lecture_recordings')
    .update({ quiz: questions, quiz_generating: false, quiz_started_at: null, quiz_stale: false })
    .eq('id', lecture.id);
  if (writeErr) {
    await clearFlag();
    log.error('quiz_write_failed', errorFields(writeErr));
    return jsonResponse({ error: t('transient', locale) }, 503);
  }

  log.info('lecture_quiz_generated', { lecture_id: lecture.id, questions: questions.length });
  return jsonResponse({ ok: true, quiz: questions }, 200);
}
