import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// AI Tutor chat endpoint. Structured on parse-syllabus/index.ts (CORS, JWT
// verification of the caller, service-role client, OpenAI call with retries,
// and error logging). Differences from parse-syllabus:
//   * Pro-only (verified server-side via the is_pro RPC).
//   * Grounded chat: builds context from the course's syllabus/tasks + the
//     user's uploaded notes, then answers as a tutor.
//   * Cost accounting lives in tutor_usage, NOT gemini_call_log — logging
//     here must never consume the free syllabus-scan quota (which counts
//     gemini_call_log 'success' rows; see lib/queries.useScanCount).

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_MODEL = Deno.env.get('TUTOR_OPENAI_MODEL')?.trim() || 'gpt-5.6-luna';
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Per-user daily message cap — enforced EVEN for Pro to bound AI cost.
// Overridable via env without a redeploy.
const DAILY_MESSAGE_CAP = (() => {
  const raw = parseInt(Deno.env.get('TUTOR_DAILY_CAP') ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 50;
})();

// Context-size guards. Grounding text can be large (multiple uploaded note
// files, dozens of tasks) — cap each source so the OpenAI request stays a
// bounded size and cost. Chars, not tokens: a coarse but safe ceiling.
const MAX_SYLLABUS_CHARS = 8000;
const MAX_NOTES_CHARS = 24000; // shared budget across all note files
const MAX_TASKS = 60;
// Recent conversation turns replayed for continuity. Older turns are
// dropped — a tutoring session rarely needs deep history and it bounds cost.
const MAX_HISTORY_TURNS = 12;
const MAX_MESSAGE_CHARS = 4000; // reject absurdly long single messages

const TUTOR_SYSTEM_PROMPT = `You are Semora's AI study tutor helping a college student with a specific course.

Ground your answers in the COURSE CONTEXT provided (syllabus info, uploaded lecture notes, and the student's deadlines). Prefer that material over generic knowledge, and cite it naturally ("your syllabus lists…", "from your Week 3 notes…") when relevant.

Rules:
- Be a tutor, not an answer key. Explain concepts, walk through reasoning, and check understanding. For graded work, guide the student to the answer rather than just handing it over.
- If the course context doesn't cover the question, say so briefly, then help using general knowledge.
- Be concise and encouraging. Use short paragraphs or bullet points. Plain text only — no markdown headers.
- If asked about deadlines/dates, use the DEADLINES section; never invent dates.`;

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

// Truncate helper — keeps the head of a string and marks where it was cut so
// the model knows the source was abridged.
function clamp(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '\n…[truncated]';
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
type TutorMode = 'chat' | 'explain_assignment' | 'practice' | 'quiz';
type TutorCitation = { kind: 'syllabus' | 'deadline' | 'note' | 'assignment'; label: string };

function normalizeAnswer(value: string) {
  return value.trim().toLocaleLowerCase().replace(/^[a-d][).:\s-]+/, '').replace(/\s+/g, ' ');
}

function parseModelJson(raw: string) {
  const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  try { return JSON.parse(cleaned); } catch { return null; }
}

const OPENAI_RETRYABLE = new Set([408, 409, 429, 500, 502, 503, 504]);
const OPENAI_MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type OpenAIResult = {
  data: any | null;
  status: number;
  networkError: boolean;
};

// Raw REST responses do not expose the SDK's output_text convenience getter,
// so support both that field and the canonical output message structure.
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

async function callOpenAIResponses(payload: Record<string, unknown>, label: string): Promise<OpenAIResult> {
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
      console.warn(`[tutor-chat] OpenAI ${label} network error (attempt ${attempt}/${OPENAI_MAX_ATTEMPTS}):`, error);
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
        console.error(`[tutor-chat] OpenAI ${label} returned invalid JSON:`, error);
        return { data: null, status: response.status, networkError: false };
      }
    }

    const errorBody = await response.text().catch(() => '');
    console.warn(
      `[tutor-chat] OpenAI ${label} HTTP ${response.status} (attempt ${attempt}/${OPENAI_MAX_ATTEMPTS}):`,
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

// OpenAI recommends a stable safety identifier for end-user applications.
// Hash the Supabase UUID so the external provider never receives the raw ID.
async function makeSafetyIdentifier(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `semora_${hex.slice(0, 32)}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // 0. Bound the request body. The chat payload is small (a message + a few
    //    ids), so a tight cap is safe and blocks abuse. Require Content-Length
    //    like parse-syllabus so a chunked stream can't bypass the check.
    const MAX_BODY_BYTES = 256 * 1024;
    const contentLengthRaw = req.headers.get('content-length');
    if (!contentLengthRaw) {
      return jsonResponse({ error: 'Content-Length required' }, 411);
    }
    const contentLength = parseInt(contentLengthRaw, 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return jsonResponse({ error: 'Invalid Content-Length' }, 400);
    }
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Message too large' }, 413);
    }

    // 1. Validate JWT against Supabase auth
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

    // 2. Pro gate (server-side). is_pro() is SECURITY DEFINER, granted to
    //    service_role, same RPC parse-syllabus uses. Fail closed as TRANSIENT
    //    (503) on an RPC blip so a paying user is never demoted.
    const { data: proResult, error: proErr } = await adminClient.rpc('is_pro', { uid: userId });
    if (proErr) {
      console.error('[tutor-chat] is_pro check failed:', proErr);
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }
    if (proResult !== true) {
      return jsonResponse(
        { error: 'The AI tutor is a Pro feature. Upgrade to Pro to start studying with it.', code: 'PRO_REQUIRED' },
        402,
      );
    }

    // 3. Per-user daily cap from tutor_usage (rolling 24h). Bounds AI cost
    //    even for Pro. tutor_usage is a dedicated ledger — deliberately NOT
    //    gemini_call_log, so tutor calls never eat the free scan quota.
    //    ATOMIC: try_consume_tutor_usage counts + inserts under a per-user
    //    advisory lock so a concurrent burst can't all pass the gate and
    //    overrun the cap. The slot is reserved BEFORE the paid model call.
    const { data: reserved, error: usageErr } = await adminClient.rpc('try_consume_tutor_usage', {
      uid: userId,
      cap: DAILY_MESSAGE_CAP,
    });
    if (usageErr) {
      console.error('[tutor-chat] usage reservation failed:', usageErr);
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }
    if (reserved !== true) {
      return jsonResponse(
        { error: `You've reached today's tutor limit of ${DAILY_MESSAGE_CAP} messages. Please try again in 24 hours.` },
        429,
      );
    }

    // 4. Parse and validate request body. Practice generation and evaluation
    // use the same protected endpoint, course grounding, and cost controls as
    // chat rather than creating a weaker second AI path.
    let body: {
      conversationId?: unknown; message?: unknown; courseId?: unknown; mode?: unknown;
      action?: unknown; assignmentId?: unknown; practiceId?: unknown; answer?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const courseId = typeof body.courseId === 'string' ? body.courseId : null;
    const mode: TutorMode = body.mode === 'quiz' || body.mode === 'practice' || body.mode === 'explain_assignment'
      ? body.mode
      : 'chat';
    const action = body.action === 'evaluate_practice' ? 'evaluate_practice' : 'chat';
    const assignmentId = typeof body.assignmentId === 'string' ? body.assignmentId : null;
    const practiceId = typeof body.practiceId === 'string' ? body.practiceId : null;
    const submittedAnswer = typeof body.answer === 'string' ? body.answer.trim() : '';
    if (!conversationId) {
      return jsonResponse({ error: 'conversationId is required' }, 400);
    }
    if (!message && action !== 'evaluate_practice') {
      return jsonResponse({ error: 'message is required' }, 400);
    }
    if ((message.length > MAX_MESSAGE_CHARS) || (submittedAnswer.length > MAX_MESSAGE_CHARS)) {
      return jsonResponse({ error: 'Message too long' }, 400);
    }

    // 4a. Verify the conversation belongs to the caller (service role bypasses
    //     RLS, so we must check ownership explicitly). Also authoritatively
    //     resolve the course to ground on FROM THE CONVERSATION — never trust
    //     a client-supplied courseId for cross-tenant reads.
    const { data: convo, error: convoErr } = await adminClient
      .from('tutor_conversations')
      .select('id, user_id, course_id')
      .eq('id', conversationId)
      .maybeSingle();
    if (convoErr) {
      console.error('[tutor-chat] conversation lookup failed:', convoErr);
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }
    if (!convo || convo.user_id !== userId) {
      return jsonResponse({ error: 'Conversation not found' }, 404);
    }
    // The conversation's own course_id is authoritative; the body courseId is
    // only a hint for brand-new threads the client just created with it.
    const groundCourseId = (convo.course_id as string | null) ?? courseId;

    if (action === 'evaluate_practice') {
      if (!practiceId || !submittedAnswer || !groundCourseId) {
        return jsonResponse({ error: 'A course, practice question, and answer are required' }, 400);
      }
      const { data: question } = await adminClient
        .from('tutor_practice_questions')
        .select('id, course_id, expected_answer, explanation, topics')
        .eq('id', practiceId)
        .eq('user_id', userId)
        .eq('course_id', groundCourseId)
        .maybeSingle();
      if (!question) return jsonResponse({ error: 'Practice question not found' }, 404);

      const correct = normalizeAnswer(submittedAnswer) === normalizeAnswer(String(question.expected_answer));
      const feedback = correct
        ? `Correct. ${String(question.explanation)}`
        : `Not quite. The best answer is ${String(question.expected_answer)}. ${String(question.explanation)}`;
      const topics = Array.isArray(question.topics) ? question.topics.filter((topic: unknown) => typeof topic === 'string').slice(0, 5) : [];
      const { error: recordErr } = await adminClient.rpc('record_tutor_practice_attempt', {
        p_user_id: userId,
        p_course_id: groundCourseId,
        p_question_id: practiceId,
        p_answer: submittedAnswer,
        p_is_correct: correct,
        p_feedback: feedback,
        p_topics: topics,
      });
      if (recordErr) {
        console.error('[tutor-chat] record practice attempt failed:', recordErr);
        return jsonResponse({ error: 'Could not save your practice result' }, 503);
      }
      return jsonResponse({ evaluation: { correct, feedback, topics } }, 200);
    }

    // 5. Build grounding context (all reads via service role, but every query
    //    is scoped to the authenticated userId as defense in depth).
    let syllabusText = '';
    let notesText = '';
    let deadlinesText = '';
    let courseHeader = '';
    const citations: TutorCitation[] = [];

    if (groundCourseId) {
      // 5a. Course + schedule + grade scale.
      const { data: course } = await adminClient
        .from('courses')
        .select('id, user_id, name, instructor, grade_scale, course_meetings(days_of_week, start_time, end_time, kind, location)')
        .eq('id', groundCourseId)
        .eq('user_id', userId)
        .maybeSingle();

      if (course) {
        courseHeader = `Course: ${course.name}${course.instructor ? ` (instructor: ${course.instructor})` : ''}`;
        const parts: string[] = [courseHeader];
        const meetings = Array.isArray((course as any).course_meetings) ? (course as any).course_meetings : [];
        if (meetings.length > 0) {
          const lines = meetings.map((m: any) => {
            const days = Array.isArray(m.days_of_week) ? m.days_of_week.map((d: number) => DOW[d] ?? d).join('/') : '';
            const time = m.start_time && m.end_time ? ` ${m.start_time}-${m.end_time}` : '';
            const loc = m.location ? ` @ ${m.location}` : '';
            return `- ${m.kind ?? 'meeting'}: ${days}${time}${loc}`;
          });
          parts.push('Schedule:\n' + lines.join('\n'));
        }
        if (Array.isArray((course as any).grade_scale) && (course as any).grade_scale.length > 0) {
          const scale = (course as any).grade_scale
            .filter((g: any) => g && g.letter)
            .map((g: any) => `${g.letter}: ${g.min}%+`)
            .join(', ');
          if (scale) parts.push('Grade scale: ' + scale);
        }

        // 5b. Latest parse run's extracted items — the closest thing we have to
        //     "the syllabus" (final_results holds the structured deadline set).
        const { data: run } = await adminClient
          .from('parse_runs')
          .select('final_results, created_at')
          .eq('course_id', groundCourseId)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const items = run && Array.isArray((run as any).final_results) ? (run as any).final_results : [];
        if (items.length > 0) {
          const lines = items.slice(0, MAX_TASKS).map((it: any) => {
            const w = typeof it.weight === 'number' ? ` (${it.weight}%)` : '';
            const d = it.due_date ? ` — due ${it.due_date}${it.due_time ? ` ${it.due_time}` : ''}` : '';
            return `- ${it.title}${w}${d}${it.type ? ` [${it.type}]` : ''}`;
          });
          parts.push('Syllabus items:\n' + lines.join('\n'));
        }
        syllabusText = clamp(parts.join('\n\n'), MAX_SYLLABUS_CHARS);
        citations.push({ kind: 'syllabus', label: `${course.name} syllabus & schedule` });
      }

      // 5c. Live tasks/deadlines (the user may have edited these after import;
      //     they're the source of truth for "what's due").
      const { data: tasks } = await adminClient
        .from('tasks')
        .select('title, type, due_date, due_time, weight, is_completed')
        .eq('course_id', groundCourseId)
        .eq('user_id', userId)
        .order('due_date', { ascending: true })
        .limit(MAX_TASKS);
      if (tasks && tasks.length > 0) {
        deadlinesText = tasks
          .map((t: any) => {
            const status = t.is_completed ? '[done] ' : '';
            const w = typeof t.weight === 'number' ? ` (${t.weight}%)` : '';
            const time = t.due_time ? ` ${t.due_time}` : '';
            return `- ${status}${t.title}${w} — ${t.due_date ?? 'no date'}${time}`;
          })
          .join('\n');
        citations.push({ kind: 'deadline', label: 'Current course deadlines' });
      }

      if (mode === 'explain_assignment' && assignmentId) {
        const { data: assignment } = await adminClient
          .from('tasks')
          .select('title, description, type, due_date, due_time, weight, score, points_earned, points_possible')
          .eq('id', assignmentId)
          .eq('course_id', groundCourseId)
          .eq('user_id', userId)
          .maybeSingle();
        if (!assignment) return jsonResponse({ error: 'Assignment not found in this course' }, 404);
        const details = [
          `Title: ${assignment.title}`,
          assignment.description ? `Description: ${assignment.description}` : '',
          `Type: ${assignment.type}`,
          assignment.due_date ? `Due: ${assignment.due_date}${assignment.due_time ? ` ${assignment.due_time}` : ''}` : '',
          assignment.weight != null ? `Weight: ${assignment.weight}%` : '',
        ].filter(Boolean).join('\n');
        deadlinesText += `\n\nASSIGNMENT TO EXPLAIN:\n${details}`;
        citations.push({ kind: 'assignment', label: assignment.title });
      }

      // 5d. Uploaded notes. extracted_text is cached on the row; when missing,
      //     read the file from storage and have OpenAI OCR/extract it, then
      //     persist the text so later turns skip the re-read. Robust-simple
      //     path: the edge function owns extraction (the client just uploads
      //     the raw file), which keeps note upload dumb and cheap on-device.
      const { data: notes } = await adminClient
        .from('course_notes')
        .select('id, storage_path, filename, mime_type, extracted_text')
        .eq('course_id', groundCourseId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (notes && notes.length > 0) {
        const chunks: string[] = [];
        let budget = MAX_NOTES_CHARS;
        for (const note of notes as any[]) {
          if (budget <= 0) break;
          let text: string | null = note.extracted_text;
          if (!text) {
            text = await extractNoteText(adminClient, note, userId).catch((e) => {
              console.warn('[tutor-chat] note extraction failed (non-fatal):', e);
              return null;
            });
          }
          if (text) {
            const slice = text.slice(0, budget);
            budget -= slice.length;
            chunks.push(`### ${note.filename}\n${slice}`);
            citations.push({ kind: 'note', label: note.filename });
          }
        }
        notesText = chunks.join('\n\n');
      }
    }

    // 6. Recent conversation history for continuity (oldest→newest of the last
    //    N turns). The just-sent user message is appended AFTER, below.
    const { data: history } = await adminClient
      .from('tutor_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(MAX_HISTORY_TURNS);
    const priorTurns = (history ?? []).reverse();

    // 7. Assemble the OpenAI Responses request. Course grounding is supplied
    //    as developer instructions, followed by bounded conversation history
    //    and the new user message.
    const contextBlock = [
      syllabusText ? `SYLLABUS / COURSE:\n${syllabusText}` : '',
      deadlinesText ? `DEADLINES:\n${clamp(deadlinesText, MAX_SYLLABUS_CHARS)}` : '',
      notesText ? `LECTURE NOTES:\n${notesText}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const modeInstruction = mode === 'quiz'
      ? 'Create one concise multiple-choice quiz question from the grounded course material. Return ONLY valid JSON with keys: prompt (string), choices (array of 2-4 strings), expected_answer (must exactly equal one choice), explanation (string), topics (array of 1-3 short topic names).'
      : mode === 'practice'
        ? 'Create one low-stakes multiple-choice practice question from the grounded course material. Return ONLY valid JSON with keys: prompt (string), choices (array of 2-4 strings), expected_answer (must exactly equal one choice), explanation (string), topics (array of 1-3 short topic names).'
        : mode === 'explain_assignment'
          ? 'Explain the selected assignment as a student-friendly checklist: what it asks for, a first step, suggested milestones, and one question to ask the instructor if the brief is unclear. Do not fabricate requirements.'
          : '';
    const groundingIntro = contextBlock
      ? `${TUTOR_SYSTEM_PROMPT}\n${modeInstruction ? `\nMODE: ${modeInstruction}\n` : ''}\n--- COURSE CONTEXT ---\n${contextBlock}\n--- END CONTEXT ---`
      : `${TUTOR_SYSTEM_PROMPT}\n\n(No course material is attached to this conversation yet — help using general knowledge and invite the student to add their syllabus or notes for grounded answers.)`;

    const input: { role: 'user' | 'assistant'; content: string }[] = [
      ...priorTurns.map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: String(m.content ?? ''),
      })),
      { role: 'user', content: message },
    ];

    // 8. Call GPT-5.6 Luna. Low reasoning gives the Tutor useful planning and
    //    explanation ability while keeping latency and reasoning-token cost
    //    bounded. Responses are not stored by OpenAI.
    const openAIResult = await callOpenAIResponses({
      model: OPENAI_MODEL,
      instructions: groundingIntro,
      input,
      reasoning: { effort: 'low' },
      text: { verbosity: 'low' },
      max_output_tokens: 2048,
      store: false,
      safety_identifier: await makeSafetyIdentifier(userId),
    }, 'tutor completion');

    if (!openAIResult.data) {
      console.error(
        `[tutor-chat] OpenAI failed after retries (network=${openAIResult.networkError}, status=${openAIResult.status})`,
      );
      const msg = openAIResult.networkError
        ? 'AI service unreachable. Please try again.'
        : (openAIResult.status === 503 || openAIResult.status === 429)
          ? 'The tutor is busy right now — please try again in a minute.'
          : `AI processing failed (status ${openAIResult.status}). Please try again.`;
      return jsonResponse({ error: msg }, 502);
    }

    const reply = readOpenAIOutputText(openAIResult.data);
    const servedModel = typeof openAIResult.data.model === 'string' ? openAIResult.data.model : OPENAI_MODEL;
    if (!reply) {
      // A safety block or empty completion — surface a friendly message.
      console.error('[tutor-chat] OpenAI empty/blocked response:', JSON.stringify(openAIResult.data).slice(0, 500));
      return jsonResponse(
        { error: "The tutor couldn't answer that one. Try rephrasing your question." },
        502,
      );
    }
    const assistantText = reply;

    if (mode === 'practice' || mode === 'quiz') {
      if (!groundCourseId) {
        return jsonResponse({ error: 'Open the Tutor from a course to generate practice.' }, 400);
      }
      const practice = parseModelJson(assistantText);
      const prompt = typeof practice?.prompt === 'string' ? practice.prompt.trim().slice(0, 4000) : '';
      const choices = Array.isArray(practice?.choices)
        ? practice.choices.filter((choice: unknown) => typeof choice === 'string')
          .map((choice: string) => choice.trim().slice(0, 500)).filter(Boolean).slice(0, 4)
        : [];
      const expectedAnswer = typeof practice?.expected_answer === 'string' ? practice.expected_answer.trim().slice(0, 500) : '';
      const explanation = typeof practice?.explanation === 'string' ? practice.explanation.trim().slice(0, 4000) : '';
      const topics = Array.isArray(practice?.topics)
        ? practice.topics.filter((topic: unknown) => typeof topic === 'string')
          .map((topic: string) => topic.trim().slice(0, 160)).filter(Boolean).slice(0, 3)
        : [];
      if (!prompt || choices.length < 2 || !expectedAnswer || !choices.some((choice) => normalizeAnswer(choice) === normalizeAnswer(expectedAnswer)) || !explanation || !topics.length) {
        console.error('[tutor-chat] invalid practice JSON:', assistantText.slice(0, 500));
        return jsonResponse({ error: "Couldn't create a usable practice question. Please try again." }, 502);
      }
      const { data: saved, error: saveErr } = await adminClient
        .from('tutor_practice_questions')
        .insert({
          user_id: userId, course_id: groundCourseId, mode, prompt, choices,
          expected_answer: expectedAnswer, explanation, topics, citations,
        })
        .select('id')
        .single();
      if (saveErr || !saved) {
        console.error('[tutor-chat] practice save failed:', saveErr);
        return jsonResponse({ error: 'Could not save your practice question. Please try again.' }, 503);
      }
      return jsonResponse({
        practice: { id: saved.id, mode, prompt, choices, topics, citations },
        model: servedModel || null,
        duration_ms: Date.now() - startTime,
      }, 200);
    }

    // 9. Persist BOTH turns (user message + assistant reply). The user message
    //    is written here (not client-side) so history stays consistent even if
    //    the client crashes after send. Non-fatal if the insert fails — the
    //    reply is still returned.
    const { error: insertErr } = await adminClient.from('tutor_messages').insert([
      { user_id: userId, conversation_id: conversationId, role: 'user', content: message },
      { user_id: userId, conversation_id: conversationId, role: 'assistant', content: assistantText, citations },
    ]);
    if (insertErr) {
      console.warn('[tutor-chat] failed to persist messages (non-fatal):', insertErr);
    }

    // Usage was already reserved atomically in step 3 (try_consume_tutor_usage)
    // BEFORE the paid model call, so there is no post-success insert here —
    // that would double-count. Reserving up front means a rare failed call
    // still consumes one of the 50/day slots, an acceptable trade for a
    // burst-proof cap.

    return jsonResponse(
      {
        reply: assistantText,
        citations,
        model: servedModel || null,
        duration_ms: Date.now() - startTime,
      },
      200,
    );
  } catch (err) {
    console.error('[tutor-chat] Unhandled error:', err);
    return jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
  }
});

// Read a note file from the private course-notes bucket and have OpenAI Luna
// extract its text, caching the result on the row so later turns skip it.
// Extraction is best-effort grounding, so a failure drops that note from the
// current context rather than failing the student's Tutor message.
async function extractNoteText(
  adminClient: ReturnType<typeof createClient>,
  note: { id: string; storage_path: string; filename: string; mime_type: string | null },
  userId: string,
): Promise<string | null> {
  if (!OPENAI_API_KEY) return null;

  const { data: file, error: dlErr } = await adminClient.storage
    .from('course-notes')
    .download(note.storage_path);
  if (dlErr || !file) {
    console.warn('[tutor-chat] note download failed:', dlErr);
    return null;
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  // Guard: only send reasonably sized files to OpenAI inline (base64 inflates
  // 4/3). ~6MB raw keeps the request well within limits.
  if (buf.byteLength > 6 * 1024 * 1024) {
    console.warn('[tutor-chat] note too large to extract inline, skipping');
    return null;
  }
  // Chunked base64 to avoid a huge apply() spread on large buffers.
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
    console.warn('[tutor-chat] OpenAI note extraction failed', result.status);
    return null;
  }
  const extracted = readOpenAIOutputText(result.data);
  if (!extracted) return null;

  // Cache on the row (scoped to owner) so we never re-OCR this file.
  await adminClient
    .from('course_notes')
    .update({ extracted_text: extracted })
    .eq('id', note.id)
    .eq('user_id', userId)
    .then(undefined, (e: unknown) => console.warn('[tutor-chat] cache extracted_text failed:', e));

  return extracted;
}
