import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// AI flashcard generation. Structured on tutor-chat/index.ts (CORS, JWT
// verification, service-role client, OpenAI call with retries,
// is_pro gate) — reuses the same grounding sources tutor-chat already reads
// (parse_runs.final_results for the syllabus, course_notes.extracted_text
// for uploaded lecture notes) instead of a chat reply, this asks Luna for
// a JSON array of {front, back} pairs and bulk-inserts them into `cards`.
//
// Server-side Pro gate matters MORE here than for manual card entry: typing
// your own flashcards costs nothing, but every generation call is a paid
// AI request — flashcards previously had ZERO server-side enforcement
// (RLS is owner-only, no is_pro() check anywhere), unlike every other Pro
// feature. This function is that enforcement point for the AI path; manual
// creation stays as-is (no API cost to protect there).
//
// Optional `taskId` scopes generation to one specific task (exam, quiz,
// assignment, or reading — see lib/flashcards.ts's useScopeTasks for which
// types the client offers) instead of the whole course. The "what's likely
// covered by then" cutoff is built from real due dates/completion status on
// the course's OTHER tasks (see step 3a-2) — not from inferring syllabus
// topic order, since individual syllabus topics are usually undated.

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_MODEL = Deno.env.get('FLASHCARDS_OPENAI_MODEL')?.trim() || 'gpt-5.6-terra'; // mid tier: $2/$12 per 1M vs luna $0.20/$1.20 — better quality at ~10x cost; per-user quotas bound the spend
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const MAX_SYLLABUS_CHARS = 8000;
const MAX_NOTES_CHARS = 24000;
const MAX_TASKS = 60; // syllabus items, matches tutor-chat's cap
const MIN_CARDS = 1;
const MAX_CARDS = 30;
const MAX_FIELD_CHARS = 300; // defensive clamp on a single card's front/back

const GENERATION_PROMPT = `You are generating flashcards for a college student from their course material.

Rules:
- Cover the actual academic content: concepts, terms, definitions, formulas, key facts from the syllabus topics and lecture notes below.
- Do NOT make cards out of administrative/logistics info (office hours, grading policy, late-work rules, class meeting times) — that's not quizzable material.
- front = a short question or term. back = a concise, correct answer or definition (1-3 sentences max).
- Generate between 10 and 20 cards. Fewer, high-quality cards beat padding with weak ones.
- If the material genuinely doesn't support that many good cards, generate fewer rather than inventing filler.

Return ONLY valid JSON in this exact shape, no commentary, no markdown fences:
{"cards": [{"front": "...", "back": "..."}]}`;

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

function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n…[truncated]';
}

const OPENAI_RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);
const OPENAI_MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type OpenAIResult = {
  data: any | null;
  status: number;
  networkError: boolean;
};

function readOpenAIOutputText(data: any): string | null {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim();
  }
  if (!Array.isArray(data?.output)) return null;
  const chunks: string[] = [];
  for (const item of data.output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type === 'output_text' && typeof part.text === 'string') chunks.push(part.text);
    }
  }
  const joined = chunks.join('\n').trim();
  return joined || null;
}

async function callOpenAIResponses(
  payload: Record<string, unknown>,
  label: string,
): Promise<OpenAIResult> {
  if (!OPENAI_API_KEY) return { data: null, status: 0, networkError: false };

  let lastStatus = 0;
  let networkError = false;
  for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(OPENAI_RESPONSES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      networkError = true;
      console.warn(
        `[generate-flashcards] OpenAI ${label} network error (attempt ${attempt}/${OPENAI_MAX_ATTEMPTS}):`,
        error,
      );
      if (attempt < OPENAI_MAX_ATTEMPTS) {
        await sleep(600 * attempt);
        continue;
      }
      break;
    }

    networkError = false;
    lastStatus = response.status;
    if (response.ok) {
      try {
        return { data: await response.json(), status: response.status, networkError: false };
      } catch (error) {
        console.error(`[generate-flashcards] OpenAI ${label} returned invalid JSON:`, error);
        return { data: null, status: response.status, networkError: false };
      }
    }

    const errorBody = await response.text().catch(() => '');
    console.warn(
      `[generate-flashcards] OpenAI ${label} HTTP ${response.status} (attempt ${attempt}/${OPENAI_MAX_ATTEMPTS}):`,
      errorBody.slice(0, 300),
    );
    if (OPENAI_RETRYABLE.has(response.status) && attempt < OPENAI_MAX_ATTEMPTS) {
      await sleep(600 * attempt);
      continue;
    }
    break;
  }
  return { data: null, status: lastStatus, networkError };
}

async function makeSafetyIdentifier(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `semora_${hex.slice(0, 32)}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 0. Bound the request body — small payload (a couple of ids + an
    //    optional title), same pattern as tutor-chat.
    const MAX_BODY_BYTES = 8 * 1024;
    const contentLengthRaw = req.headers.get('content-length');
    if (!contentLengthRaw) {
      return jsonResponse({ error: 'Content-Length required' }, 411);
    }
    const contentLength = parseInt(contentLengthRaw, 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return jsonResponse({ error: 'Invalid Content-Length' }, 400);
    }
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request too large' }, 413);
    }

    // 1. Validate JWT.
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

    if (!OPENAI_API_KEY) {
      return jsonResponse({ error: 'OpenAI API key not configured on server' }, 500);
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Pro gate (server-side). Fail closed as transient (503) on an RPC
    //    blip so a paying user is never demoted.
    const { data: proResult, error: proErr } = await adminClient.rpc('is_pro', { uid: userId });
    if (proErr) {
      console.error('[generate-flashcards] is_pro check failed:', proErr);
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }
    if (proResult !== true) {
      return jsonResponse(
        { error: 'Generating flashcards with AI is a Pro feature. Upgrade to Pro to try it.', code: 'PRO_REQUIRED' },
        402,
      );
    }

    // 3. Parse and validate request body: { courseId, deckId?, deckTitle?, taskId?, noteIds? }
    //    taskId scopes generation to one specific exam/quiz (student picked
    //    "Midterm Exam" instead of "whole course"). noteId optionally points
    //    at a just-uploaded course_notes row (e.g. a teacher's review packet)
    //    to make sure it's included even if extraction hasn't cached yet —
    //    in practice this isn't required (the course_notes query below reads
    //    everything for the course), it's just an explicit signal the client
    //    can pass right after an upload for a same-request guarantee.
    let body: { courseId?: unknown; deckId?: unknown; deckTitle?: unknown; taskId?: unknown; noteIds?: unknown; locale?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }
    const courseId = typeof body.courseId === 'string' ? body.courseId : null;
    const deckId = typeof body.deckId === 'string' ? body.deckId : null;
    const requestedTitle = typeof body.deckTitle === 'string' ? body.deckTitle.trim().slice(0, 80) : '';
    const taskId = typeof body.taskId === 'string' ? body.taskId : null;
    const noteIds = Array.isArray(body.noteIds)
      ? body.noteIds.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 10)
      : [];
    const locale = body.locale === 'es' ? 'es' : 'en';
    if (!courseId) {
      return jsonResponse({ error: 'courseId is required' }, 400);
    }

    // 3a. Verify the course belongs to the caller.
    const { data: course, error: courseErr } = await adminClient
      .from('courses')
      .select('id, user_id, name')
      .eq('id', courseId)
      .eq('user_id', userId)
      .maybeSingle();
    if (courseErr) {
      console.error('[generate-flashcards] course lookup failed:', courseErr);
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }
    if (!course) {
      return jsonResponse({ error: 'Course not found' }, 404);
    }

    // 3a-2. If scoped to one specific task (exam/quiz/assignment/reading —
    //       not just exams; a student reviewing for a specific problem set
    //       or reading is just as real a case), verify it belongs to this
    //       course/caller, then split the course's OTHER tasks into what's
    //       "already covered by then" vs. "not yet" using real due dates.
    //       This is a stronger signal than inferring from syllabus topic
    //       order (which is what the previous version relied on): topics
    //       themselves are usually undated, but every task IS dated, so
    //       "everything due on/before the target, or already completed"
    //       is real evidence of what's been assigned/taught so far — and
    //       anything due strictly after the target is dropped from context
    //       entirely rather than left for the model to (maybe) ignore.
    let targetTask: { id: string; title: string; type: string; due_date: string | null } | null = null;
    let coveredTasksText = '';
    if (taskId) {
      const { data: task, error: taskErr } = await adminClient
        .from('tasks')
        .select('id, title, type, due_date')
        .eq('id', taskId)
        .eq('course_id', courseId)
        .eq('user_id', userId)
        .maybeSingle();
      if (taskErr) {
        console.error('[generate-flashcards] task lookup failed:', taskErr);
        return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
      }
      if (!task) {
        return jsonResponse({ error: 'That item was not found' }, 404);
      }
      targetTask = task;

      const { data: allTasks } = await adminClient
        .from('tasks')
        .select('id, title, type, due_date, is_completed')
        .eq('course_id', courseId)
        .eq('user_id', userId)
        .neq('id', taskId)
        .order('due_date', { ascending: true, nullsFirst: false });

      if (allTasks && allTasks.length > 0) {
        // No due_date on the target means we can't compute a real cutoff —
        // fall back to "everything completed so far" only, rather than
        // silently including material that might be from later in the term.
        const covered = (allTasks as any[]).filter((t) =>
          t.is_completed || (targetTask!.due_date && t.due_date && t.due_date <= targetTask!.due_date),
        );
        if (covered.length > 0) {
          coveredTasksText = covered
            .slice(0, MAX_TASKS)
            .map((t: any) => `- ${t.title} [${t.type}]${t.due_date ? ` — due ${t.due_date}` : ''}`)
            .join('\n');
        }
      }
    }

    // 3b. If adding to an existing deck, verify it's the caller's own.
    if (deckId) {
      const { data: deck, error: deckErr } = await adminClient
        .from('decks')
        .select('id, user_id')
        .eq('id', deckId)
        .eq('user_id', userId)
        .maybeSingle();
      if (deckErr) {
        console.error('[generate-flashcards] deck lookup failed:', deckErr);
        return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
      }
      if (!deck) {
        return jsonResponse({ error: 'Deck not found' }, 404);
      }
    }

    // 4. Build grounding context — same sources as tutor-chat (parse_runs +
    //    course_notes), but only the material that's actually quizzable:
    //    syllabus topics/readings and note content. Meeting times/office
    //    hours are irrelevant to flashcard content, so unlike tutor-chat
    //    this doesn't read `course_meetings` at all. `tasks` IS read, but
    //    only when scoped (step 3a-2 above) — for the "covered so far" cutoff,
    //    not as general grounding material.
    let syllabusText = '';
    let notesText = '';

    const { data: run } = await adminClient
      .from('parse_runs')
      .select('final_results, created_at')
      .eq('course_id', courseId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const items = run && Array.isArray((run as any).final_results) ? (run as any).final_results : [];
    if (items.length > 0) {
      const lines = items.slice(0, MAX_TASKS).map((it: any) => {
        const type = it.type ? ` [${it.type}]` : '';
        return `- ${it.title}${type}`;
      });
      syllabusText = clamp(`Course: ${course.name}\n\nSyllabus topics/items:\n${lines.join('\n')}`, MAX_SYLLABUS_CHARS);
    }

    let notesQuery = adminClient
      .from('course_notes')
      .select('id, storage_path, filename, mime_type, extracted_text')
      .eq('course_id', courseId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (noteIds.length > 0) notesQuery = notesQuery.in('id', noteIds);
    const { data: notes } = await notesQuery.limit(10);

    if (notes && notes.length > 0) {
      const chunks: string[] = [];
      let budget = MAX_NOTES_CHARS;
      for (const note of notes as any[]) {
        if (budget <= 0) break;
        let text: string | null = note.extracted_text;
        if (!text) {
          text = await extractNoteText(adminClient, note, userId).catch((e) => {
            console.warn('[generate-flashcards] note extraction failed (non-fatal):', e);
            return null;
          });
        }
        if (text) {
          const slice = text.slice(0, budget);
          budget -= slice.length;
          chunks.push(`### ${note.filename}\n${slice}`);
        }
      }
      notesText = chunks.join('\n\n');
    }

    if (!syllabusText && !notesText) {
      return jsonResponse(
        { error: "Nothing to generate from yet — scan this course's syllabus or upload lecture notes first." },
        422,
      );
    }

    // 4a. Scoped-to-one-task focus directive. syllabusText itself still isn't
    //     date-filtered (topics are usually undated in the source syllabus),
    //     but coveredTasksText below IS built from real due dates/completion
    //     status — a genuine "here's what's been assigned by now" signal,
    //     not an inferred one. Anything due strictly after the target was
    //     already excluded when coveredTasksText was built, so the model
    //     never even sees later material to (maybe) ignore.
    const focusDirective = targetTask
      ? [
          `FOCUS: generate cards ONLY for material relevant to this specific task — ${targetTask.type}: "${targetTask.title}"${targetTask.due_date ? ` (due ${targetTask.due_date})` : ''}.`,
          'Use the COVERED SO FAR list below (real assignments/readings/exams already due or completed in this course) as your strongest signal for what material is actually in scope — prefer syllabus topics that plausibly relate to those over topics that don\'t.',
          'Do not generate cards for material that would only be relevant to something later in the course.',
          coveredTasksText ? `COVERED SO FAR (already due or completed, ordered by date):\n${coveredTasksText}` : 'Nothing else in this course is due yet or completed — treat all syllabus topics as fair game, but favor foundational/early material.',
        ].filter(Boolean).join('\n')
      : '';

    // 5. Generate cards with OpenAI Luna. This high-volume structured task
    //    uses explicit no-reasoning mode and JSON output to preserve latency,
    //    cost, and the existing parser contract.
    const modelInput = [
      GENERATION_PROMPT,
      locale === 'es'
        ? 'LANGUAGE: Write every flashcard front and back in natural, neutral Spanish. Keep proper names and course-specific terminology accurate.'
        : 'LANGUAGE: Write every flashcard in clear U.S. English.',
      focusDirective,
      syllabusText ? `--- SYLLABUS ---\n${syllabusText}` : '',
      notesText ? `--- LECTURE NOTES ---\n${notesText}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    const openAIResult = await callOpenAIResponses({
      model: OPENAI_MODEL,
      input: [{ role: 'user', content: modelInput }],
      reasoning: { effort: 'none' },
      text: { format: { type: 'json_object' }, verbosity: 'low' },
      max_output_tokens: 4096,
      store: false,
      safety_identifier: await makeSafetyIdentifier(userId),
    }, 'card generation');

    if (!openAIResult.data) {
      console.error(
        `[generate-flashcards] OpenAI failed after retries (network=${openAIResult.networkError}, status=${openAIResult.status})`,
      );
      const msg = openAIResult.networkError
        ? 'AI service unreachable. Please try again.'
        : (openAIResult.status === 503 || openAIResult.status === 429)
          ? 'The AI is busy right now — please try again in a minute.'
          : `AI processing failed (status ${openAIResult.status}). Please try again.`;
      return jsonResponse({ error: msg }, 502);
    }

    const data = openAIResult.data;
    const servedModel = typeof data.model === 'string' ? data.model : OPENAI_MODEL;
    if (data.status === 'incomplete' && data.incomplete_details?.reason === 'max_output_tokens') {
      console.error('[generate-flashcards] OpenAI hit max_output_tokens — output truncated');
      return jsonResponse(
        { error: 'That generated more than fits in one batch. Try again — it usually succeeds on retry.' },
        502,
      );
    }
    const text = readOpenAIOutputText(data);
    if (!text) {
      console.error('[generate-flashcards] OpenAI empty/blocked response:', JSON.stringify(data).slice(0, 500));
      return jsonResponse({ error: "Couldn't generate flashcards. Please try again." }, 502);
    }

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[generate-flashcards] JSON parse failed:', parseErr, 'text:', cleaned.slice(0, 500));
      return jsonResponse({ error: "Couldn't generate flashcards. Please try again." }, 502);
    }

    // 6. Validate + sanitize cards. Drop malformed entries rather than hard-
    //    failing on partial garbage — a model that gets 14/16 cards right
    //    shouldn't cost the user the 14 good ones.
    const rawCards = Array.isArray(parsed?.cards) ? parsed.cards : [];
    const cleanCards = rawCards
      .map((c: any) => ({
        front: typeof c?.front === 'string' ? c.front.trim().slice(0, MAX_FIELD_CHARS) : '',
        back: typeof c?.back === 'string' ? c.back.trim().slice(0, MAX_FIELD_CHARS) : '',
      }))
      .filter((c: { front: string; back: string }) => c.front.length > 0 && c.back.length > 0)
      .slice(0, MAX_CARDS);

    if (cleanCards.length < MIN_CARDS) {
      console.error('[generate-flashcards] no valid cards after sanitizing:', cleaned.slice(0, 500));
      return jsonResponse(
        { error: "Couldn't generate flashcards from this course yet. Try again, or add more material first." },
        502,
      );
    }

    // 7. Create the deck (if needed) and bulk-insert the cards.
    let targetDeckId = deckId;
    let deckTitle = requestedTitle;
    if (!targetDeckId) {
      deckTitle = requestedTitle || (targetTask
        ? `${course.name} — ${targetTask.title}`
        : `${course.name} — ${locale === 'es' ? 'Generado con IA' : 'AI Generated'}`);
      const { data: newDeck, error: deckInsertErr } = await adminClient
        .from('decks')
        .insert({ user_id: userId, course_id: courseId, title: deckTitle })
        .select('id, title')
        .single();
      if (deckInsertErr || !newDeck) {
        console.error('[generate-flashcards] deck creation failed:', deckInsertErr);
        return jsonResponse({ error: 'Could not create the deck. Please try again.' }, 502);
      }
      targetDeckId = newDeck.id;
      deckTitle = newDeck.title;
    } else {
      const { data: existingDeck } = await adminClient.from('decks').select('title').eq('id', targetDeckId).maybeSingle();
      deckTitle = existingDeck?.title ?? deckTitle;
    }

    const { error: cardsInsertErr } = await adminClient.from('cards').insert(
      cleanCards.map((c: { front: string; back: string }) => ({
        user_id: userId,
        deck_id: targetDeckId,
        front: c.front,
        back: c.back,
      })),
    );
    if (cardsInsertErr) {
      console.error('[generate-flashcards] cards insert failed:', cardsInsertErr);
      return jsonResponse({ error: 'Generated the cards but could not save them. Please try again.' }, 502);
    }

    return jsonResponse(
      { deckId: targetDeckId, deckTitle, cardsAdded: cleanCards.length, model: servedModel || null },
      200,
    );
  } catch (err) {
    console.error('[generate-flashcards] Unhandled error:', err);
    return jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
  }
});

// Identical in behavior to tutor-chat's note extraction. Kept local so each
// deployed Edge Function remains self-contained.
async function extractNoteText(
  // Supabase's overloaded generic factory collapses to an unusable
  // unknown/never schema through ReturnType in Deno.
  adminClient: any,
  note: { id: string; storage_path: string; filename: string; mime_type: string | null },
  userId: string,
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;

  const { data: file, error: dlErr } = await adminClient.storage
    .from('course-notes')
    .download(note.storage_path);
  if (dlErr || !file) {
    console.warn('[generate-flashcards] note download failed:', dlErr);
    return null;
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf.byteLength > 6 * 1024 * 1024) {
    console.warn('[generate-flashcards] note too large to extract inline, skipping');
    return null;
  }
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    binary += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  const base64 = btoa(binary);
  const mimeType = note.mime_type || 'application/pdf';

  const attachment = mimeType.startsWith('image/')
    ? { type: 'input_image', image_url: `data:${mimeType};base64,${base64}`, detail: 'high' }
    : {
      type: 'input_file',
      filename: note.filename || 'course-note.pdf',
      file_data: `data:${mimeType};base64,${base64}`,
      detail: 'high',
    };
  const result = await callOpenAIResponses({
    model: OPENAI_MODEL,
    instructions: 'Extract all readable text from the supplied lecture notes or slides. Preserve headings, lists, and logical structure. Return only the extracted text with no commentary.',
    input: [{
      role: 'user',
      content: [
        attachment,
        { type: 'input_text', text: 'Extract the complete readable text from this course note.' },
      ],
    }],
    reasoning: { effort: 'none' },
    text: { verbosity: 'low' },
    max_output_tokens: 8192,
    store: false,
    safety_identifier: await makeSafetyIdentifier(userId),
  }, 'note extraction');
  if (!result.data) {
    console.warn('[generate-flashcards] OpenAI note extraction failed', result.status);
    return null;
  }
  const extracted = readOpenAIOutputText(result.data);
  if (!extracted) return null;

  await adminClient
    .from('course_notes')
    .update({ extracted_text: extracted })
    .eq('id', note.id)
    .eq('user_id', userId)
    .then(undefined, (e: unknown) => console.warn('[generate-flashcards] cache extracted_text failed:', e));

  return extracted;
}
