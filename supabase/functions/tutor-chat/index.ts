import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// AI Tutor chat endpoint. Structured on parse-syllabus/index.ts (CORS, JWT
// verification of the caller, service-role client, Gemini call with
// retry/model-fallback, error logging). Differences from parse-syllabus:
//   * Pro-only (verified server-side via the is_pro RPC).
//   * Grounded chat: builds context from the course's syllabus/tasks + the
//     user's uploaded notes, then answers as a tutor.
//   * Cost accounting lives in tutor_usage, NOT gemini_call_log — logging
//     here must never consume the free syllabus-scan quota (which counts
//     gemini_call_log 'success' rows; see lib/queries.useScanCount).

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Per-user daily message cap — enforced EVEN for Pro to bound Gemini cost.
// Overridable via env without a redeploy.
const DAILY_MESSAGE_CAP = (() => {
  const raw = parseInt(Deno.env.get('TUTOR_DAILY_CAP') ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 50;
})();

// Context-size guards. Grounding text can be large (multiple uploaded note
// files, dozens of tasks) — cap each source so the Gemini request stays a
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

    if (!GEMINI_API_KEY) {
      return jsonResponse({ error: 'Gemini API key not configured on server' }, 500);
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

    // 3. Per-user daily cap from tutor_usage (rolling 24h). Bounds Gemini cost
    //    even for Pro. tutor_usage is a dedicated ledger — deliberately NOT
    //    gemini_call_log, so tutor calls never eat the free scan quota.
    //    ATOMIC: try_consume_tutor_usage counts + inserts under a per-user
    //    advisory lock so a concurrent burst can't all pass the gate and
    //    overrun the cap. The slot is reserved BEFORE the paid Gemini call.
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

    // 4. Parse and validate request body.
    //    { conversationId, message, courseId? }
    let body: { conversationId?: unknown; message?: unknown; courseId?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : null;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const courseId = typeof body.courseId === 'string' ? body.courseId : null;
    if (!conversationId) {
      return jsonResponse({ error: 'conversationId is required' }, 400);
    }
    if (!message) {
      return jsonResponse({ error: 'message is required' }, 400);
    }
    if (message.length > MAX_MESSAGE_CHARS) {
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

    // 5. Build grounding context (all reads via service role, but every query
    //    is scoped to the authenticated userId as defense in depth).
    let syllabusText = '';
    let notesText = '';
    let deadlinesText = '';
    let courseHeader = '';

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
      }

      // 5d. Uploaded notes. extracted_text is cached on the row; when missing,
      //     read the file from storage and have Gemini OCR/extract it, then
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

    // 7. Assemble the Gemini request. System prompt + grounding context go in
    //    the first user turn (Gemini has no dedicated system role in v1beta
    //    generateContent the way we call it), then the replayed history, then
    //    the new message.
    const contextBlock = [
      syllabusText ? `SYLLABUS / COURSE:\n${syllabusText}` : '',
      deadlinesText ? `DEADLINES:\n${clamp(deadlinesText, MAX_SYLLABUS_CHARS)}` : '',
      notesText ? `LECTURE NOTES:\n${notesText}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const groundingIntro = contextBlock
      ? `${TUTOR_SYSTEM_PROMPT}\n\n--- COURSE CONTEXT ---\n${contextBlock}\n--- END CONTEXT ---`
      : `${TUTOR_SYSTEM_PROMPT}\n\n(No course material is attached to this conversation yet — help using general knowledge and invite the student to add their syllabus or notes for grounded answers.)`;

    const contents: { role: string; parts: { text: string }[] }[] = [
      { role: 'user', parts: [{ text: groundingIntro }] },
      { role: 'model', parts: [{ text: "Got it — I'm ready to help with this course. What would you like to work on?" }] },
      ...priorTurns.map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: String(m.content ?? '') }],
      })),
      { role: 'user', parts: [{ text: message }] },
    ];

    // 8. Call Gemini with retry + model fallback (same policy as parse-syllabus).
    const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
    const MAX_ATTEMPTS = 3;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    let geminiResponse: Response | null = null;
    let servedModel = '';
    let lastStatus = 0;
    let networkError = false;

    modelLoop:
    for (const model of MODELS) {
      const reqBody = {
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: model.startsWith('gemini-2.5') ? 2048 : 2048,
        },
      };
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        let resp: Response;
        try {
          resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody),
          });
        } catch (err) {
          networkError = true;
          console.warn(`[tutor-chat] ${model} network error (attempt ${attempt}/${MAX_ATTEMPTS}):`, err);
          if (attempt < MAX_ATTEMPTS) { await sleep(600 * attempt); continue; }
          break;
        }
        networkError = false;
        if (resp.ok) { geminiResponse = resp; servedModel = model; break modelLoop; }
        lastStatus = resp.status;
        const errBody = await resp.text().catch(() => '');
        console.warn(`[tutor-chat] ${model} HTTP ${resp.status} (attempt ${attempt}/${MAX_ATTEMPTS}):`, errBody.slice(0, 200));
        if (RETRYABLE.has(resp.status)) {
          if (attempt < MAX_ATTEMPTS) { await sleep(600 * attempt); continue; }
          break;
        }
        break modelLoop;
      }
    }

    if (!geminiResponse) {
      console.error(`[tutor-chat] Gemini failed after retries+fallback (network=${networkError}, status=${lastStatus})`);
      const msg = networkError
        ? 'AI service unreachable. Please try again.'
        : (lastStatus === 503 || lastStatus === 429)
          ? 'The tutor is busy right now — please try again in a minute.'
          : `AI processing failed (status ${lastStatus}). Please try again.`;
      return jsonResponse({ error: msg }, 502);
    }

    const data = await geminiResponse.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply || typeof reply !== 'string' || !reply.trim()) {
      // A safety block or empty completion — surface a friendly message.
      console.error('[tutor-chat] Gemini empty/blocked response:', JSON.stringify(data).slice(0, 500));
      return jsonResponse(
        { error: "The tutor couldn't answer that one. Try rephrasing your question." },
        502,
      );
    }
    const assistantText = reply.trim();

    // 9. Persist BOTH turns (user message + assistant reply). The user message
    //    is written here (not client-side) so history stays consistent even if
    //    the client crashes after send. Non-fatal if the insert fails — the
    //    reply is still returned.
    const { error: insertErr } = await adminClient.from('tutor_messages').insert([
      { user_id: userId, conversation_id: conversationId, role: 'user', content: message },
      { user_id: userId, conversation_id: conversationId, role: 'assistant', content: assistantText },
    ]);
    if (insertErr) {
      console.warn('[tutor-chat] failed to persist messages (non-fatal):', insertErr);
    }

    // Usage was already reserved atomically in step 3 (try_consume_tutor_usage)
    // BEFORE the paid Gemini call, so there is no post-success insert here —
    // that would double-count. Reserving up front means a rare failed call
    // still consumes one of the 50/day slots, an acceptable trade for a
    // burst-proof cap.

    return jsonResponse(
      {
        reply: assistantText,
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

// Read a note file from the private course-notes bucket and have Gemini
// extract its text, caching the result on the row so later turns skip it.
// Bounded to a single retry-less call — extraction is best-effort grounding,
// not the critical path, so a failure just drops that note from context.
async function extractNoteText(
  adminClient: ReturnType<typeof createClient>,
  note: { id: string; storage_path: string; mime_type: string | null },
  userId: string,
): Promise<string | null> {
  if (!GEMINI_API_KEY) return null;

  const { data: file, error: dlErr } = await adminClient.storage
    .from('course-notes')
    .download(note.storage_path);
  if (dlErr || !file) {
    console.warn('[tutor-chat] note download failed:', dlErr);
    return null;
  }

  const buf = new Uint8Array(await file.arrayBuffer());
  // Guard: only send reasonably sized files to Gemini inline (base64 inflates
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: 'Extract ALL readable text from this document (lecture notes/slides), preserving structure. Return ONLY the extracted text, no commentary.' },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 8192 },
    }),
  });
  if (!resp.ok) {
    console.warn('[tutor-chat] note extraction HTTP', resp.status);
    return null;
  }
  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text || typeof text !== 'string') return null;
  const extracted = text.trim();

  // Cache on the row (scoped to owner) so we never re-OCR this file.
  await adminClient
    .from('course_notes')
    .update({ extracted_text: extracted })
    .eq('id', note.id)
    .eq('user_id', userId)
    .then(undefined, (e: unknown) => console.warn('[tutor-chat] cache extracted_text failed:', e));

  return extracted;
}
