import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_MODEL = Deno.env.get('SYLLABUS_OPENAI_MODEL')?.trim() || 'gpt-5.6-terra'; // mid tier: $2/$12 per 1M vs luna $0.20/$1.20 — better quality at ~10x cost; per-user quotas bound the spend
const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const DAILY_CAP = 20;

// Global 24h ceiling on AI calls across ALL users — a circuit breaker
// that bounds worst-case API spend if the endpoint is abused at scale (many
// accounts, each under their per-user cap). Overridable via env without a
// redeploy of the constant.
const GLOBAL_DAILY_CAP = (() => {
  const raw = parseInt(Deno.env.get('GLOBAL_DAILY_CAP') ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1500;
})();

// Free tier: 5 successful extractions per CALENDAR MONTH (UTC), matching
// lib/queries FREE_SCAN_LIMIT and the enforce_free_scan_limit trigger.
// Enforced server-side below so it can't be bypassed.
const FREE_SCAN_LIMIT = 5;

// Multi-page photo scans: each page is one inline_data part. 5 pages of
// phone photos (~2-4MB base64 each) stays comfortably under the body cap
// while covering effectively every paper syllabus.
const MAX_PAGES = 5;

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
];

// The multi-page `pages` shape is images-only: PDFs are inherently
// multi-page already, so the client keeps them single-file.
const ALLOWED_PAGE_MIME_TYPES = ALLOWED_MIME_TYPES.filter((t) => t !== 'application/pdf');

const EXTRACTION_PROMPT = `You are analyzing a document that is supposed to be an academic course syllabus. FIRST classify whether it actually is one, THEN extract the course information AND all deadlines.

Return a single JSON object with this structure:
{
  "is_syllabus": true (boolean — true ONLY if this is an academic course syllabus, course outline, or class schedule that contains course info and/or graded deadlines. Set false for a receipt, invoice, article, form, random screenshot, menu, ID card, or any non-syllabus document. When false, set every other field to null or [] and do NOT invent any course data.),
  "course_name": "Introduction to Computer Science" (the full course name),
  "course_code": "CS 101" (short code if visible, or null),
  "instructor": "Prof. Smith" (instructor name if visible, or null),
  "meetings": [
    {
      "days_of_week": [1, 3, 5] (REQUIRED, non-empty. JS getDay() values: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday. Map "MWF" -> [1,3,5], "TR" or "TTh" -> [2,4], etc.),
      "start_time": "10:00" (HH:MM 24-hour, or null if not stated),
      "end_time": "10:50" (HH:MM 24-hour, or null if not stated),
      "kind": "lecture" (one of: lecture, lab, discussion, other. Default lecture if uncertain),
      "location": "Boyd 312" (room/online location if stated, or null)
    }
  ] (Each meeting block represents one recurring time slot. A class with lecture MWF 10-11 + lab Tu 2-4 returns TWO entries. Return [] if no schedule is stated.),
  "office_hours_blocks": [
    {
      "days_of_week": [2, 4] (Same encoding as meetings. May be null/omitted for "by appointment"),
      "start_time": "14:00" (HH:MM 24-hour, or null),
      "end_time": "15:30" (HH:MM 24-hour, or null),
      "location": "Office 412" (or "Zoom: link" or null)
    }
  ] (One entry per recurring office hour block. Return [] if none stated.),
  "semester_name": "Fall 2026" (semester/term name if visible, or null),
  "semester_start": "2026-08-25" (semester start date in YYYY-MM-DD if visible, or null),
  "semester_end": "2026-12-15" (semester end date in YYYY-MM-DD if visible, or null),
  "grade_scale": [{"letter":"A","min":93},{"letter":"A-","min":90},{"letter":"B+","min":87},{"letter":"B","min":83},...] (the grading scale/letter grade cutoffs if listed in the syllabus, sorted highest to lowest. Include plus/minus grades if specified. Return null if no grading scale is found),
  "items": [
    {
      "title": "Homework 1",
      "type": "assignment|quiz|exam|project|reading|other",
      "due_date": "2026-09-15" (YYYY-MM-DD format, if year not specified assume current/next academic year),
      "due_time": "23:59" (HH:MM 24hr format, or null),
      "weight": 5 (percentage of final grade, or null),
      "description": "Problems 1-20 from Chapter 2" (or null),
      "confidence": 0.95 (0-1 how confident you are)
    }
  ]
}

Extract ALL assignments, exams, quizzes, projects, readings, and deadlines you can find.
For course_name, use the course code + full name if both are available (e.g., "CS 101 - Intro to Computer Science").
If the document is NOT a course syllabus, return {"is_syllabus": false} with all other fields null/empty — never guess a course name, semester, or deadlines for a non-syllabus document.
Return ONLY valid JSON. No markdown, no explanation.`;

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

async function callOpenAIResponses(payload: Record<string, unknown>): Promise<OpenAIResult> {
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
      console.warn(`[parse-syllabus] OpenAI network error (attempt ${attempt}/${OPENAI_MAX_ATTEMPTS}):`, error);
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
        console.error('[parse-syllabus] OpenAI returned invalid JSON:', error);
        return { data: null, status: response.status, networkError: false };
      }
    }

    const errorBody = await response.text().catch(() => '');
    console.warn(
      `[parse-syllabus] OpenAI HTTP ${response.status} (attempt ${attempt}/${OPENAI_MAX_ATTEMPTS}):`,
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

async function logCall(
  // Supabase's overloaded generic factory does not preserve its concrete
  // schema through ReturnType in Deno. The client is created and scoped in
  // this function before being passed here.
  adminClient: any,
  userId: string,
  status: 'success' | 'failed' | 'rate_limited',
  durationMs: number,
  errorCode?: string,
) {
  try {
    // Legacy table name retained for production compatibility. It is the
    // provider-neutral syllabus extraction quota/cost ledger now.
    await adminClient.from('gemini_call_log').insert({
      user_id: userId,
      status,
      error_code: errorCode ?? null,
      duration_ms: durationMs,
    });
  } catch (err) {
    console.error('[parse-syllabus] Failed to log call:', err);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // 0. Bound the request body before req.json() buffers it.
    //    Base64-encoded PDFs are checked at 10M chars after parse; the
    //    JSON wrapper adds a few dozen bytes, so 11MB is the right cap
    //    on the raw HTTP body.
    //    Two-step defense:
    //      a) Require a numeric Content-Length header. Chunked-encoded
    //         requests omit it; without this, a malicious caller could
    //         stream 100MB and exhaust edge-function memory before the
    //         post-parse length check kicks in.
    //      b) Reject when the declared length exceeds the cap.
    //    Legitimate clients (supabase-js, native fetch with a JSON body)
    //    always set Content-Length, so this is safe to require.
    const MAX_BODY_BYTES = 16 * 1024 * 1024;
    const contentLengthRaw = req.headers.get('content-length');
    if (!contentLengthRaw) {
      return jsonResponse({ error: 'Content-Length required' }, 411);
    }
    const contentLength = parseInt(contentLengthRaw, 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return jsonResponse({ error: 'Invalid Content-Length' }, 400);
    }
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'File too large. Maximum size is approximately 11 MB.' }, 413);
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

    // 2. Rate limits (service role bypasses RLS)
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 2a-pre. Global circuit breaker: total AI API attempts across ALL
    // users in the last 24h. The per-user cap bounds one abusive account; this
    // bounds the aggregate (many accounts each under their own cap) so
    // worst-case daily AI spend has a hard ceiling. 503 (transient) —
    // legit users retry later without burning anything.
    //
    // Only rows that represent an actual AI call count toward the cap.
    // 'rate_limited' rows are written when the per-user cap rejects a request
    // BEFORE any AI call (the only pre-call status we log) — counting
    // them would let an attacker trip the app-wide breaker with cost-free
    // rejected retries. Mirrors the per-user filter below.
    //
    // Known check-then-act race, accepted: rows only land AFTER the 10-60s
    // AI round trip, so a coordinated parallel burst can overshoot the
    // cap by at most the number of concurrently in-flight requests before any
    // rows exist. Per-user caps and OAuth-only signup keep realistic overshoot
    // small, and this is a coarse spend circuit breaker, not an exact quota —
    // deliberately not worth in-flight accounting.
    const { count: globalCount, error: globalErr } = await adminClient
      .from('gemini_call_log')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'rate_limited')
      .gte('created_at', oneDayAgo);

    if (globalErr) {
      console.error('[parse-syllabus] Global cap check failed:', globalErr);
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }
    if ((globalCount ?? 0) >= GLOBAL_DAILY_CAP) {
      console.error(`[parse-syllabus] GLOBAL_DAILY_CAP hit: ${globalCount}/${GLOBAL_DAILY_CAP}`);
      return jsonResponse(
        { error: "We're seeing unusually high demand right now — please try again shortly." },
        503,
      );
    }

    // 2a. Per-user rolling 24h rate limit
    const { count: recentCount, error: countError } = await adminClient
      .from('gemini_call_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      // Don't count throttle rows toward the cap — otherwise every rejected
      // retry extends the lockout and a legit user stays blocked early.
      .neq('status', 'rate_limited')
      .gte('created_at', oneDayAgo);

    if (countError) {
      console.error('[parse-syllabus] Rate limit check failed:', countError);
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }

    if ((recentCount ?? 0) >= DAILY_CAP) {
      await logCall(adminClient, userId, 'rate_limited', Date.now() - startTime);
      return jsonResponse(
        { error: `You've reached the daily scan limit of ${DAILY_CAP}. Please try again in 24 hours.` },
        429,
      );
    }

    // 2b. Free-tier hard cap (5 successful extractions per UTC calendar
    // month), enforced server-side
    // BEFORE the paid AI call. The syllabus_uploads DB trigger only fires
    // when the client voluntarily inserts an upload row AFTER extraction — so
    // a client that skips that insert (or calls this endpoint directly) would
    // otherwise get unlimited free extractions. is_pro() is SECURITY DEFINER
    // and granted to service_role, so the admin client can call it.
    const { data: proResult, error: proErr } = await adminClient.rpc('is_pro', { uid: userId });
    if (proErr) {
      // Fail closed AS TRANSIENT (503) — never demote a paying user to the
      // free cap on an RPC blip.
      console.error('[parse-syllabus] is_pro check failed:', proErr);
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }
    if (proResult !== true) {
      // Effective scan count = max(server-side successes, client-inserted
      // uploads). gemini_call_log 'success' rows are written by THIS function
      // (step 6) only after a real syllabus was extracted and returned —
      // NOT_SYLLABUS rejections and failures log status='failed' and never
      // count. Counting only syllabus_uploads (as before) let a scripted
      // client that skips the post-extraction insert take unlimited free
      // extractions; counting only gemini_call_log would miss legacy scans
      // made before this deploy. max() closes the bypass while legacy data
      // still counts. Trade-off, accepted: an extraction the client abandons
      // after the server returned it still counts — the paid AI work was
      // done and delivered.
      // Free scans are per CALENDAR MONTH (UTC), not lifetime. This window
      // boundary MUST match the client (freeScanWindowStartIso in queries.ts)
      // and the enforce_free_scan_limit DB trigger exactly, or the layers
      // disagree. Anchored to UTC month start.
      const now = new Date();
      const monthStartIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const [successRes, uploadRes] = await Promise.all([
        adminClient
          .from('gemini_call_log')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'success')
          .gte('created_at', monthStartIso),
        adminClient
          .from('syllabus_uploads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', monthStartIso),
      ]);
      if (successRes.error || uploadRes.error) {
        console.error('[parse-syllabus] scan count failed:', successRes.error ?? uploadRes.error);
        return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
      }
      const scanCount = Math.max(successRes.count ?? 0, uploadRes.count ?? 0);
      if (scanCount >= FREE_SCAN_LIMIT) {
        return jsonResponse(
          { error: `You've used your ${FREE_SCAN_LIMIT} free scans this month. Upgrade to Pro for unlimited syllabus scanning.` },
          402,
        );
      }
    }

    // 3. Parse and validate request body. Three accepted shapes:
    //    legacy (1.2/1.3 clients + PDFs):  { base64, mimeType }
    //    multi-page photo scans:           { pages: [{ base64, mimeType }, ...] }
    //    pasted text (web, no file/photo): { text }
    //    All shapes cost the user exactly one scan — the success log and the
    //    client's upload row are per-request, not per-page.
    //    Any shape may additionally carry apiVersion (new clients send 2)
    //    to opt in to response features that shipped clients can't render.
    let body: {
      base64?: unknown;
      mimeType?: unknown;
      pages?: { base64?: unknown; mimeType?: unknown }[];
      text?: unknown;
      apiVersion?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    // Dateless items (due_date: null) are a v2 response feature: shipped
    // 1.2/1.3 review screens default-accept every item and then hard-block
    // the save with a confusing "Check dates" alert on a null date. Only
    // clients that declare apiVersion >= 2 (and render the "Needs a date"
    // section) receive them; legacy requests get the old behavior — dateless
    // items silently dropped below.
    const clientAcceptsDatelessItems =
      typeof body.apiVersion === 'number' && body.apiVersion >= 2;

    // A desktop user copy-pasting from a PDF/LMS page — skips the image/OCR
    // step entirely and feeds the raw text straight to Luna. Checked first
    // since it's mutually exclusive with the file-based shapes below.
    const MIN_TEXT_CHARS = 20;
    const MAX_TEXT_CHARS = 60_000; // generous for any real syllabus; bounds AI cost
    let pastedText: string | null = null;
    if (typeof body.text === 'string' && body.text.trim().length > 0) {
      const trimmed = body.text.trim();
      if (trimmed.length < MIN_TEXT_CHARS) {
        return jsonResponse({ error: 'Paste more of the syllabus text — that looks too short to extract anything from.' }, 400);
      }
      if (trimmed.length > MAX_TEXT_CHARS) {
        return jsonResponse({ error: `That's a lot of text — please paste no more than ${MAX_TEXT_CHARS.toLocaleString()} characters at a time.` }, 413);
      }
      pastedText = trimmed;
    }

    let pages: { base64: string; mimeType: string }[] = [];
    if (pastedText != null) {
      // No file pages in the text path.
    } else if (Array.isArray(body.pages) && body.pages.length > 0) {
      if (body.pages.length > MAX_PAGES) {
        return jsonResponse({ error: `Too many pages. Maximum is ${MAX_PAGES} per scan.` }, 400);
      }
      for (const page of body.pages) {
        if (!page || typeof page.base64 !== 'string' || !page.base64) {
          return jsonResponse({ error: 'Each page needs a base64 string' }, 400);
        }
        if (typeof page.mimeType !== 'string' || !ALLOWED_PAGE_MIME_TYPES.includes(page.mimeType)) {
          return jsonResponse({ error: `Unsupported page type: ${page.mimeType}. Pages must be images; send PDFs as a single file.` }, 400);
        }
      }
      pages = body.pages as { base64: string; mimeType: string }[];
    } else {
      const { base64, mimeType } = body;
      if (!base64 || !mimeType) {
        return jsonResponse({ error: 'Missing base64 or mimeType in request body' }, 400);
      }
      if (typeof base64 !== 'string') {
        return jsonResponse({ error: 'base64 must be a string' }, 400);
      }
      if (typeof mimeType !== 'string' || !ALLOWED_MIME_TYPES.includes(mimeType)) {
        return jsonResponse({ error: `Unsupported file type: ${mimeType}` }, 400);
      }
      pages = [{ base64, mimeType }];
    }

    // Same total-payload ceiling regardless of shape — 5 pages share the
    // budget one PDF used to have, so multi-page can't inflate AI cost
    // or edge-function memory beyond the existing cap.
    const totalBase64Chars = pages.reduce((sum, p) => sum + p.base64.length, 0);
    if (totalBase64Chars > 15_000_000) {
      return jsonResponse({ error: 'File too large. Maximum size is approximately 11 MB.' }, 413);
    }

    // 4. Call OpenAI Luna. Multi-page scans are sent as one user message so
    //    the model reads the images together as one syllabus document.
    const promptText = pages.length > 1
      ? `${EXTRACTION_PROMPT}\n\nThe ${pages.length} images that follow are sequential pages of the SAME syllabus document. Read them together as one document and return ONE combined JSON object.`
      : EXTRACTION_PROMPT;
    // The Responses API rejects `text.format: json_object` unless the word
    // "json" appears in the INPUT messages — it does not count the word
    // appearing in `instructions`, which is where EXTRACTION_PROMPT lives.
    // Without this line every scan failed with HTTP 400:
    //   "Response input messages must contain the word 'json' in some form
    //    to use 'text.format' of type 'json_object'."
    const jsonDirective = {
      type: 'input_text',
      text: 'Extract this syllabus and return the single JSON object described in the instructions.',
    };
    const inputContent = [jsonDirective, ...(pastedText != null
      ? [{ type: 'input_text', text: pastedText }]
      : pages.map((page, index) => page.mimeType === 'application/pdf'
        ? {
          type: 'input_file',
          filename: `syllabus-${index + 1}.pdf`,
          file_data: `data:${page.mimeType};base64,${page.base64}`,
          detail: 'high',
        }
        : {
          type: 'input_image',
          image_url: `data:${page.mimeType};base64,${page.base64}`,
          detail: 'high',
        }))];

    const openAIResult = await callOpenAIResponses({
      model: OPENAI_MODEL,
      instructions: promptText,
      input: [{ role: 'user', content: inputContent }],
      reasoning: { effort: 'none' },
      text: { format: { type: 'json_object' }, verbosity: 'low' },
      max_output_tokens: 24576,
      store: false,
      safety_identifier: await makeSafetyIdentifier(userId),
    });

    if (!openAIResult.data) {
      const code = openAIResult.networkError ? 'fetch_error' : `http_${openAIResult.status || 0}`;
      console.error(`[parse-syllabus] OpenAI failed after retries: ${code}`);
      await logCall(adminClient, userId, 'failed', Date.now() - startTime, code);
      const msg = openAIResult.networkError
        ? 'AI service unreachable. Please try again.'
        : (openAIResult.status === 503 || openAIResult.status === 429)
          ? 'The AI is busy right now — please try again in a minute.'
          : `AI processing failed (status ${openAIResult.status}). Please try again.`;
      return jsonResponse({ error: msg }, 502);
    }

    const data = openAIResult.data;
    const text = readOpenAIOutputText(data);
    const servedModel = typeof data.model === 'string' ? data.model : OPENAI_MODEL;

    // Truncated output: even with the raised token budget, a very dense
    // syllabus can still hit the cap, leaving the JSON cut off mid-stream.
    // Detect it explicitly so the user gets an actionable message instead of
    // an opaque parse_error, and so it's diagnosable separately in the logs.
    if (data.status === 'incomplete' && data.incomplete_details?.reason === 'max_output_tokens') {
      console.error('[parse-syllabus] OpenAI hit max_output_tokens — output truncated');
      await logCall(adminClient, userId, 'failed', Date.now() - startTime, 'max_tokens');
      return jsonResponse(
        { error: 'This syllabus is very dense and the response was cut off. Try scanning one course (or fewer pages) at a time.' },
        502,
      );
    }

    if (!text) {
      console.error('[parse-syllabus] OpenAI empty response:', JSON.stringify(data).slice(0, 500));
      await logCall(adminClient, userId, 'failed', Date.now() - startTime, 'empty_response');
      return jsonResponse({ error: 'No response from the AI service' }, 502);
    }

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('[parse-syllabus] JSON parse failed:', parseErr, 'text:', cleaned.slice(0, 500));
      await logCall(adminClient, userId, 'failed', Date.now() - startTime, 'parse_error');
      return jsonResponse(
        { error: 'Failed to parse AI response. Please try again with a clearer document.' },
        502,
      );
    }

    // 4b. Document-type gate. A receipt / random paper must NOT create a
    // phantom course + semester (or burn a free scan). Every DB write happens
    // later in processSyllabus, so returning HERE creates ZERO rows. Trip on
    // an explicit is_syllabus===false (an older model that omits the field is
    // unaffected) OR a totally empty extraction (no course name, no items, no
    // meetings — nothing usable, almost certainly not a syllabus). 422 (not
    // 402/403/P0001) so the client's isFreeLimitError never reads it as an upsell.
    const nothingExtracted =
      !result.course_name &&
      (!Array.isArray(result.items) || result.items.length === 0) &&
      (!Array.isArray(result.meetings) || result.meetings.length === 0);
    if (result.is_syllabus === false || nothingExtracted) {
      console.warn(`[parse-syllabus] Rejected non-syllabus (is_syllabus=${result.is_syllabus}, empty=${nothingExtracted})`);
      await logCall(adminClient, userId, 'failed', Date.now() - startTime, result.is_syllabus === false ? 'not_syllabus' : 'empty_extraction');
      return jsonResponse(
        { error: "This doesn't look like a course syllabus. Try scanning your syllabus, course outline, or class schedule.", code: 'NOT_SYLLABUS' },
        422,
      );
    }

    // 5. Validate and clean items.
    // Date validation is two-stage: format regex catches obvious junk,
    // round-trip Date check catches logical errors like 2026-02-30 or
    // 2026-13-01 that the regex accepts. UTC construction avoids the
    // Edge Function's process timezone shifting the comparison.
    const isValidDate = (s: unknown): s is string => {
      if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
      const [y, m, d] = s.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      return (
        dt.getUTCFullYear() === y &&
        dt.getUTCMonth() === m - 1 &&
        dt.getUTCDate() === d
      );
    };

    // Semester dates are validated here (before the items pass) because the
    // plausibility window below prefers them when present.
    const semesterStart = isValidDate(result.semester_start) ? result.semester_start : null;
    const semesterEnd = isValidDate(result.semester_end) ? result.semester_end : null;

    // Date-plausibility window. Professors recycle last year's PDFs — a
    // prior-year date passes format validation but is almost certainly wrong
    // for THIS import. Items outside the window are flagged (date_suspect),
    // never dropped: the review screen warns and the user decides. YYYY-MM-DD
    // strings compare correctly lexicographically, so the window bounds stay
    // strings; UTC date math avoids the edge runtime's timezone shifting a day.
    const addDaysIso = (iso: string, days: number): string => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
    };
    const todayIso = new Date().toISOString().slice(0, 10);
    // With both semester dates: the term itself ±45d (early postings, finals
    // week spillover). Without: a generous window around today that admits a
    // full upcoming term but flags clearly-stale years.
    const windowStart = semesterStart && semesterEnd ? addDaysIso(semesterStart, -45) : addDaysIso(todayIso, -120);
    const windowEnd = semesterStart && semesterEnd ? addDaysIso(semesterEnd, 45) : addDaysIso(todayIso, 300);

    // For apiVersion >= 2 clients, items keep flowing through even without a
    // parseable date — "Final Exam — date TBA" used to vanish here silently.
    // due_date: null tells the new review screen to park it in the "Needs a
    // date" section. Legacy clients still get dateless items filtered out
    // (see clientAcceptsDatelessItems above). date_suspect stays
    // unconditional — old clients ignore unknown fields harmlessly.
    const items = (result.items || [])
      .filter((item: any) => item.title)
      .map((item: any) => {
        const dueDate = isValidDate(item.due_date) ? item.due_date : null;
        return {
          title: item.title,
          type: ['assignment', 'quiz', 'exam', 'project', 'reading', 'other'].includes(item.type)
            ? item.type
            : 'other',
          due_date: dueDate,
          due_time: item.due_time && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.due_time) ? item.due_time : null,
          weight: typeof item.weight === 'number' ? item.weight : null,
          description: item.description || null,
          confidence:
            typeof item.confidence === 'number'
              ? Math.min(Math.max(item.confidence, 0), 1)
              : 0.5,
          // Optional flag — omitted when in-window so legacy clients (which
          // ignore unknown fields anyway) see the smallest possible delta.
          ...(dueDate && (dueDate < windowStart || dueDate > windowEnd)
            ? { date_suspect: true }
            : {}),
        };
      })
      // Legacy-shape requests (no apiVersion marker) drop dateless items,
      // exactly matching the pre-v2 behavior those clients were built against.
      .filter((item: any) => clientAcceptsDatelessItems || item.due_date !== null);

    // Strict per-row validation for the structured schedule blocks. Bad
    // rows are dropped; partial extraction is preferred over rejecting
    // the whole upload because the model got one row wrong.
    const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
    const isValidDays = (v: unknown): v is number[] =>
      Array.isArray(v) && v.length > 0 && v.every((n) => Number.isInteger(n) && n >= 0 && n <= 6);
    const cleanTime = (v: unknown) =>
      typeof v === 'string' && TIME_RE.test(v) ? `${v}:00` : null;

    const meetings = (Array.isArray(result.meetings) ? result.meetings : [])
      .filter((m: any) => isValidDays(m?.days_of_week))
      .map((m: any) => ({
        days_of_week: m.days_of_week,
        start_time: cleanTime(m.start_time),
        end_time: cleanTime(m.end_time),
        kind: ['lecture', 'lab', 'discussion', 'other'].includes(m.kind) ? m.kind : 'lecture',
        location: typeof m.location === 'string' && m.location.trim() ? m.location.trim() : null,
      }))
      // Time-order check mirrors the DB constraint so the client
      // doesn't have to handle a 23514 error per row.
      .filter((m: any) => !m.start_time || !m.end_time || m.start_time < m.end_time);

    const office_hours_blocks = (Array.isArray(result.office_hours_blocks) ? result.office_hours_blocks : [])
      // days_of_week is nullable here ("by appointment"); only filter rows where it's
      // present-but-malformed.
      .filter((o: any) =>
        o?.days_of_week == null || isValidDays(o.days_of_week),
      )
      .map((o: any) => ({
        days_of_week: o.days_of_week ?? null,
        start_time: cleanTime(o.start_time),
        end_time: cleanTime(o.end_time),
        location: typeof o.location === 'string' && o.location.trim() ? o.location.trim() : null,
      }))
      .filter((o: any) => !o.start_time || !o.end_time || o.start_time < o.end_time);

    const extraction = {
      course_name: result.course_name || 'Unknown Course',
      course_code: result.course_code || null,
      instructor: result.instructor || null,
      meetings,
      office_hours_blocks,
      semester_name: result.semester_name || null,
      // Validated above (semesterStart/semesterEnd) — these go straight to a
      // Postgres `date` column and a bad string (e.g. "Fall 2026") would
      // 22007 on insert. isValidDate also catches model-mangled values
      // like 2026-02-30. Null is fine for both fields.
      semester_start: semesterStart,
      semester_end: semesterEnd,
      grade_scale:
        Array.isArray(result.grade_scale) && result.grade_scale.length > 0
          ? result.grade_scale
              .filter((g: any) => g.letter && typeof g.min === 'number')
              .sort((a: any, b: any) => b.min - a.min)
          : null,
      items,
      // Telemetry: the model that actually answered. The legacy field name is
      // retained because parse_runs.gemini_model already exists in production;
      // its value now records gpt-5.6-luna.
      gemini_model: servedModel || null,
    };

    // 6. Log success and return
    await logCall(adminClient, userId, 'success', Date.now() - startTime);

    return jsonResponse(extraction, 200);
  } catch (err) {
    console.error('[parse-syllabus] Unhandled error:', err);
    return jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
  }
});
