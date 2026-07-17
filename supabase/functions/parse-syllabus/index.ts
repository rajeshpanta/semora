import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const DAILY_CAP = 20;

// Global 24h ceiling on Gemini calls across ALL users — a circuit breaker
// that bounds worst-case API spend if the endpoint is abused at scale (many
// accounts, each under their per-user cap). Overridable via env without a
// redeploy of the constant.
const GLOBAL_DAILY_CAP = (() => {
  const raw = parseInt(Deno.env.get('GLOBAL_DAILY_CAP') ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1500;
})();

// Free tier: 2 successful extractions, lifetime (matches lib/queries
// FREE_SCAN_LIMIT). Enforced server-side below so it can't be bypassed.
const FREE_SCAN_LIMIT = 2;

// Multi-page photo scans: each page is one inline_data part. 5 pages of
// phone photos (~2-4MB base64 each) stays comfortably under the body cap
// while covering effectively every paper syllabus.
const MAX_PAGES = 5;

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/heic',
  'image/heif',
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

async function logCall(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  status: 'success' | 'failed' | 'rate_limited',
  durationMs: number,
  errorCode?: string,
) {
  try {
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

    if (!GEMINI_API_KEY) {
      return jsonResponse({ error: 'Gemini API key not configured on server' }, 500);
    }

    // 2. Rate limits (service role bypasses RLS)
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 2a-pre. Global circuit breaker: total Gemini API attempts across ALL
    // users in the last 24h. The per-user cap bounds one abusive account; this
    // bounds the aggregate (many accounts each under their own cap) so
    // worst-case daily Gemini spend has a hard ceiling. 503 (transient) —
    // legit users retry later without burning anything.
    //
    // Only rows that represent an actual Gemini call count toward the cap.
    // 'rate_limited' rows are written when the per-user cap rejects a request
    // BEFORE any Gemini call (the only pre-call status we log) — counting
    // them would let an attacker trip the app-wide breaker with cost-free
    // rejected retries. Mirrors the per-user filter below.
    //
    // Known check-then-act race, accepted: rows only land AFTER the 10-60s
    // Gemini round trip, so a coordinated parallel burst can overshoot the
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

    // 2b. Free-tier hard cap (2 lifetime extractions), enforced server-side
    // BEFORE the paid Gemini call. The syllabus_uploads DB trigger only fires
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
      // after the server returned it still counts — the paid Gemini work was
      // done and delivered.
      const [successRes, uploadRes] = await Promise.all([
        adminClient
          .from('gemini_call_log')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'success'),
        adminClient
          .from('syllabus_uploads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId),
      ]);
      if (successRes.error || uploadRes.error) {
        console.error('[parse-syllabus] scan count failed:', successRes.error ?? uploadRes.error);
        return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
      }
      const scanCount = Math.max(successRes.count ?? 0, uploadRes.count ?? 0);
      if (scanCount >= FREE_SCAN_LIMIT) {
        return jsonResponse(
          { error: `You've used your ${FREE_SCAN_LIMIT} free scans. Upgrade to Pro for unlimited syllabus scanning.` },
          402,
        );
      }
    }

    // 3. Parse and validate request body. Two accepted shapes:
    //    legacy (1.2/1.3 clients + PDFs):  { base64, mimeType }
    //    multi-page photo scans:           { pages: [{ base64, mimeType }, ...] }
    //    Both shapes cost the user exactly one scan — the success log and the
    //    client's upload row are per-request, not per-page.
    //    Either shape may additionally carry apiVersion (new clients send 2)
    //    to opt in to response features that shipped clients can't render.
    let body: {
      base64?: unknown;
      mimeType?: unknown;
      pages?: { base64?: unknown; mimeType?: unknown }[];
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

    let pages: { base64: string; mimeType: string }[];
    if (Array.isArray(body.pages) && body.pages.length > 0) {
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
    // budget one PDF used to have, so multi-page can't inflate Gemini cost
    // or edge-function memory beyond the existing cap.
    const totalBase64Chars = pages.reduce((sum, p) => sum + p.base64.length, 0);
    if (totalBase64Chars > 15_000_000) {
      return jsonResponse({ error: 'File too large. Maximum size is approximately 11 MB.' }, 413);
    }

    // 4. Call Gemini — one inline_data part per page, prompt first. For
    //    multi-page scans, tell the model the images are one document so it
    //    doesn't treat each photo as a separate syllabus.
    const promptText = pages.length > 1
      ? `${EXTRACTION_PROMPT}\n\nThe ${pages.length} images that follow are sequential pages of the SAME syllabus document. Read them together as one document and return ONE combined JSON object.`
      : EXTRACTION_PROMPT;
    const geminiBody = {
      contents: [
        {
          parts: [
            { text: promptText },
            ...pages.map((p) => ({ inline_data: { mime_type: p.mimeType, data: p.base64 } })),
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        // 8192 truncated dense syllabi mid-JSON -> JSON.parse failed and the
        // call was logged as a confusing 'parse_error'. gemini-2.5-flash
        // supports up to 65536; 24576 comfortably fits a full multi-course
        // syllabus's structured JSON.
        maxOutputTokens: 24576,
      },
    };

    // Gemini intermittently returns 503 (model overloaded) and occasionally
    // 429/5xx. A single no-retry call surfaced those to the user as a hard
    // "AI processing failed (status 503)". Retry with backoff, and fall back
    // to a secondary model if the primary stays overloaded, so a capacity
    // blip self-heals instead of failing the scan. Non-retryable statuses
    // (400/403 — bad request / auth) stop immediately; a fallback can't help.
    const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
    const MAX_ATTEMPTS = 3;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    let geminiResponse: Response | null = null;
    // Which model actually answered — returned to the client so parse_runs
    // records the real model (fallback included) instead of a hardcoded name.
    let servedModel = '';
    let lastStatus = 0;
    let networkError = false;

    modelLoop:
    for (const model of MODELS) {
      // gemini-2.0-flash caps output at 8192 tokens; only 2.5+ supports the
      // larger budget. Sending too-large a value to 2.0 risks a 400.
      const reqBody = {
        ...geminiBody,
        generationConfig: {
          ...geminiBody.generationConfig,
          maxOutputTokens: model.startsWith('gemini-2.5') ? 24576 : 8192,
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
          console.warn(`[parse-syllabus] ${model} network error (attempt ${attempt}/${MAX_ATTEMPTS}):`, err);
          if (attempt < MAX_ATTEMPTS) { await sleep(600 * attempt); continue; }
          break; // exhausted this model -> try fallback
        }
        networkError = false;
        if (resp.ok) { geminiResponse = resp; servedModel = model; break modelLoop; }
        lastStatus = resp.status;
        const errBody = await resp.text().catch(() => '');
        console.warn(`[parse-syllabus] ${model} HTTP ${resp.status} (attempt ${attempt}/${MAX_ATTEMPTS}):`, errBody.slice(0, 200));
        if (RETRYABLE.has(resp.status)) {
          if (attempt < MAX_ATTEMPTS) { await sleep(600 * attempt); continue; }
          break; // retries exhausted on this model -> try fallback model
        }
        break modelLoop; // non-retryable (bad request / auth) — stop
      }
    }

    if (!geminiResponse) {
      const code = networkError ? 'fetch_error' : `http_${lastStatus || 0}`;
      console.error(`[parse-syllabus] Gemini failed after retries+fallback: ${code}`);
      await logCall(adminClient, userId, 'failed', Date.now() - startTime, code);
      const msg = networkError
        ? 'AI service unreachable. Please try again.'
        : (lastStatus === 503 || lastStatus === 429)
          ? 'The AI is busy right now — please try again in a minute.'
          : `AI processing failed (status ${lastStatus}). Please try again.`;
      return jsonResponse({ error: msg }, 502);
    }

    const data = await geminiResponse.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    // Truncated output: even with the raised token budget, a very dense
    // syllabus can still hit the cap, leaving the JSON cut off mid-stream.
    // Detect it explicitly so the user gets an actionable message instead of
    // an opaque parse_error, and so it's diagnosable separately in the logs.
    if (data.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
      console.error('[parse-syllabus] Gemini hit MAX_TOKENS — output truncated');
      await logCall(adminClient, userId, 'failed', Date.now() - startTime, 'max_tokens');
      return jsonResponse(
        { error: 'This syllabus is very dense and the response was cut off. Try scanning one course (or fewer pages) at a time.' },
        502,
      );
    }

    if (!text) {
      console.error('[parse-syllabus] Gemini empty response:', JSON.stringify(data).slice(0, 500));
      await logCall(adminClient, userId, 'failed', Date.now() - startTime, 'empty_response');
      return jsonResponse({ error: 'No response from Gemini' }, 502);
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
    // the whole upload because Gemini got one row wrong.
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
      // 22007 on insert. isValidDate also catches Gemini-mangled values
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
      // Telemetry: the model that actually answered (primary or fallback).
      // The client writes this to parse_runs.gemini_model.
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
