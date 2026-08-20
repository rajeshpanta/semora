import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  normalizeSupportedDocument,
  SUPPORTED_DOCUMENT_ERROR,
  type NormalizedDocument,
  sniffFormat,
  HEIC_SERVER_HELP,
} from '../_shared/document-files.ts';
import { prepareImagePayload } from '../_shared/heic.ts';
import { createLogger, errorFields, type EdgeLogger } from '../_shared/log.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const OPENAI_MODEL = Deno.env.get('SYLLABUS_OPENAI_MODEL')?.trim() || 'gpt-5.6-luna'; // $0.20/$1.20 per 1M — 10x cheaper than terra ($2/$12) and verified sufficient for this task; override per function with the *_OPENAI_MODEL secret
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

// Free tier is ONE AI action per account for life — scan or lecture — and the
// rule is NOT duplicated here. See migration 071: free_action_used(). The old
// FREE_SCAN_LIMIT constant is gone deliberately; a second copy of a number is
// how the four enforcement layers drifted apart the first time.

// Multi-page photo scans: each page is one inline_data part. 5 pages of
// phone photos (~2-4MB base64 each) stays comfortably under the body cap
// while covering effectively every paper syllabus.
const MAX_PAGES = 5;

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
  "grade_categories": [
    {
      "name": "Problem Sets" (the category exactly as the syllabus names it),
      "weight_percent": 20 (its share of the final grade, as a number without the % sign),
      "drop_lowest_count": 1 (how many lowest scores are dropped, if the syllabus says so — e.g. "lowest two quiz scores dropped" is 2. Use 0 when not mentioned.)
    }
  ] (The GRADE WEIGHTING TABLE — the breakdown of what the final grade is made of, e.g. "Homework 20%, Midterm 25%, Final 30%, Participation 25%". This is a DIFFERENT thing from grade_scale: grade_scale is letter cutoffs, this is what the percentage is built from. Copy the category names verbatim so they match the assignment names elsewhere in the syllabus. Weights normally total 100 — return them as stated even if they do not. Return [] if the syllabus states no weighting breakdown.),
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
  /**
   * The provider's own error envelope, truncated. Carried out of the retry
   * loop rather than only logged: edge-function logs live ~24h, and a 12.5%
   * http_400 rate went three days without anyone being able to read the
   * reason. Never surfaced to the client verbatim.
   */
  errorBody?: string;
  attempts?: number;
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

async function callOpenAIResponses(payload: Record<string, unknown>, log: EdgeLogger): Promise<OpenAIResult> {
  if (!OPENAI_API_KEY) return { data: null, status: 0, networkError: false, attempts: 0 };

  let lastStatus = 0;
  let networkError = false;
  let lastErrorBody = '';
  let usedAttempts = 0;
  for (let attempt = 1; attempt <= OPENAI_MAX_ATTEMPTS; attempt++) {
    usedAttempts = attempt;
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
      log.warn('openai_network_error', { attempt, max_attempts: OPENAI_MAX_ATTEMPTS, ...errorFields(error) });
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
        return { data: await response.json(), status: response.status, networkError: false, attempts: usedAttempts };
      } catch (error) {
        log.error('openai_invalid_json', errorFields(error));
        return {
          data: null, status: response.status, networkError: false,
          errorBody: 'provider returned invalid JSON', attempts: usedAttempts,
        };
      }
    }

    const errorBody = await response.text().catch(() => '');
    lastErrorBody = errorBody;
    log.warn('openai_http_error', {
      status: response.status,
      attempt,
      max_attempts: OPENAI_MAX_ATTEMPTS,
      // The provider's own error envelope, not the document — safe and the
      // fastest way to tell a quota error from a malformed request.
      provider_error: errorBody.slice(0, 200),
    });
    if (OPENAI_RETRYABLE.has(response.status) && attempt < OPENAI_MAX_ATTEMPTS) {
      await sleep(600 * attempt);
      continue;
    }
    break;
  }
  return { data: null, status: lastStatus, networkError, errorBody: lastErrorBody, attempts: usedAttempts };
}

async function makeSafetyIdentifier(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `semora_${hex.slice(0, 32)}`;
}

/**
 * An RPC that must not fail open, retried once.
 *
 * is_pro() and free_action_used() are both fail-closed-as-transient: a blip
 * returns 503 rather than risk demoting a paying user or handing out a second
 * free action. That is the right call, but it means every momentary hiccup is
 * a user staring at "Service temporarily unavailable" — six of them in 24h on
 * 2026-08-19, each one a scan someone had to start over.
 *
 * One retry, 250ms apart, because these are sub-millisecond index lookups: if
 * the first attempt failed it was the connection, not the query, and a second
 * attempt either succeeds immediately or confirms something real is wrong.
 * Deliberately not more — a scan already makes the user wait, and retrying a
 * genuinely broken database just makes them wait longer for the same answer.
 */
async function rpcOnceRetried(
  client: any,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: any; error: any }> {
  const first = await client.rpc(fn, args);
  if (!first.error) return first;
  await sleep(250);
  return await client.rpc(fn, args);
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
  // The provider's own words about why it refused. `error_code` says
  // 'http_400'; this says which field it objected to. Without it a 400 can
  // only be diagnosed from edge-function logs, which are gone in ~24h — and
  // that is exactly how 16 of these became unreadable before anyone looked.
  detail?: { errorBody?: string; attempts?: number },
) {
  try {
    // Legacy table name retained for production compatibility. It is the
    // provider-neutral syllabus extraction quota/cost ledger now.
    await adminClient.from('gemini_call_log').insert({
      user_id: userId,
      status,
      error_code: errorCode ?? null,
      duration_ms: durationMs,
      // Truncated here rather than in the column: provider bodies can echo
      // request fragments, and a base64 syllabus does not belong in a ledger.
      error_detail: detail?.errorBody ? detail.errorBody.slice(0, 500) : null,
      attempts: detail?.attempts ?? null,
      model: OPENAI_MODEL,
    });

    // Charge the account's one free action, here and only here.
    //
    // WHY THIS SPOT. This helper runs at exactly one moment: a real syllabus
    // was extracted and is being returned. Charging earlier would bill a
    // student for a photo of a menu that got rejected as NOT_SYLLABUS;
    // charging in the client would make the quota opt-in. Only 'success'
    // counts, matching lecture-transcribe, which explicitly does not charge a
    // recording whose transcription failed.
    //
    // scan_usage_log, not syllabus_uploads: the user can delete an upload, and
    // at a one-scan allowance "delete and rescan" would be the obvious way
    // around the paywall. This table is service-role-only (migration 071).
    //
    // A failure here is logged, never thrown. The extraction is already done
    // and about to be handed back; turning a bookkeeping error into a failed
    // request would take the student's work away over our accounting.
    if (status === 'success') {
      const { error: chargeErr } = await adminClient.from('scan_usage_log').insert({
        user_id: userId,
        status: 'success',
      });
      if (chargeErr) {
        console.error(JSON.stringify({ lvl: 'error', fn: 'parse-syllabus', evt: 'free_action_charge_failed', err_message: String(chargeErr.message ?? chargeErr).slice(0, 200) }));
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ lvl: 'error', fn: 'parse-syllabus', evt: 'log_call_failed', err_message: String(err).slice(0, 200) }));
  }
}

async function handleRequest(req: Request, log: EdgeLogger, startTime: number): Promise<Response> {
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
    // Anonymous sessions are not a supported entry point: guest mode was removed
    // and the project has anonymous sign-ins disabled. Rejected here, before any
    // counting or model work — a session with no account behind it is free to
    // mint, so it must never reach a paid extraction.
    if (userData.user.is_anonymous === true) {
      log.info('anonymous_scan_rejected', {});
      return jsonResponse(
        { error: 'Please sign in to scan a syllabus.', code: 'ACCOUNT_REQUIRED' },
        401,
      );
    }

    const userId = userData.user.id;
    log.setUser(userId);

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
      log.error('global_cap_check_failed', errorFields(globalErr));
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }
    if ((globalCount ?? 0) >= GLOBAL_DAILY_CAP) {
      log.error('global_daily_cap_hit', { count: globalCount, cap: GLOBAL_DAILY_CAP });
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
      log.error('rate_limit_check_failed', errorFields(countError));
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
    const { data: proResult, error: proErr } = await rpcOnceRetried(adminClient, 'is_pro', { uid: userId });
    if (proErr) {
      // Fail closed AS TRANSIENT (503) — never demote a paying user to the
      // free cap on an RPC blip.
      log.error('is_pro_check_failed', errorFields(proErr));
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }
    if (proResult !== true) {
      // ONE free AI action per account, lifetime — a syllabus scan or a
      // lecture recording, whichever the student reaches first. The rule lives
      // in free_action_used() (migration 071) and is asked, never re-derived:
      // this function, lecture-transcribe, the DB trigger and the client all
      // call the same thing, because the previous design repeated a monthly
      // count in four places and 044's own comment warned they would drift.
      //
      // Fail closed AS TRANSIENT (503) for the same reason as is_pro above: an
      // RPC blip must not silently hand out a second free action, and must not
      // accuse a user of spending one they still have.
      const { data: usedResult, error: usedErr } = await rpcOnceRetried(
        adminClient, 'free_action_used', { uid: userId });
      if (usedErr) {
        log.error('free_action_check_failed', errorFields(usedErr));
        return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
      }
      if (usedResult === true) {
        return jsonResponse(
          {
            error: "You've used your free scan. Upgrade to Pro for unlimited syllabus scanning and lecture recordings.",
            code: 'FREE_ACTION_USED',
          },
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
      fileName?: unknown;
      pages?: { base64?: unknown; mimeType?: unknown }[];
      text?: unknown;
      apiVersion?: unknown;
      locale?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    // Scan errors were English-only while the rest of the app ships Spanish,
    // so a Spanish user hit an English wall at the one step most likely to
    // fail. Defaults to 'en' for older clients that send no locale.
    const locale = body.locale === 'es' ? 'es' : 'en';
    const localized = (english: string, spanish: string) => (locale === 'es' ? spanish : english);

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
    let singleDocument: NormalizedDocument | null = null;
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
      }
      // Prepare every page in one pass: the header decides the format, HEIC is
      // decoded to JPEG rather than refused, and a mislabelled JPEG/PNG is
      // corrected. Sequential rather than parallel on purpose — each HEIC
      // decode holds well over a hundred megabytes while it runs, and five at
      // once would take the invocation out on memory.
      // Recorded BEFORE the loop, because this is the stretch that kills the
      // worker and a killed worker logs nothing. Five 546s (edge worker limit)
      // arrived on 2026-08-19 with no accompanying function log at all — the
      // invocation died mid-request. This line is what makes the next one
      // diagnosable: if 546s correlate with page count or HEIC, it will show.
      const payloadChars = body.pages.reduce(
        (n: number, pg: any) => n + (typeof pg?.base64 === 'string' ? pg.base64.length : 0),
        0,
      );
      log.info('scan_payload', { pages: body.pages.length, base64_chars: payloadChars });

      const prepared: { base64: string; mimeType: string }[] = [];
      let convertedCount = 0;
      for (const page of body.pages) {
        const ready = await prepareImagePayload(
          page.base64 as string,
          typeof page.mimeType === 'string' ? page.mimeType : null,
        );
        if (!ready.ok) return jsonResponse({ error: ready.error, code: ready.code }, 400);
        if (ready.converted) convertedCount++;
        const normalizedPage = normalizeSupportedDocument(null, ready.mimeType);
        if (!normalizedPage?.isImage) {
          return jsonResponse({ error: `Unsupported page type: ${ready.mimeType}. Pages must be images; send PDFs as a single file.` }, 400);
        }
        prepared.push({ base64: ready.base64, mimeType: normalizedPage.mimeType });

        // Drop the ORIGINAL now that its converted form is held.
        //
        // Sequential conversion (above) stops five HEIC decodes running at
        // once, but it does nothing about what is merely being *retained*:
        // without this line `body.pages` keeps all five originals alive for the
        // whole loop while `prepared` fills up with five converted copies, so
        // by the last page the invocation is holding two full sets of image
        // data — and that is precisely when the >100MB decode runs on top.
        // Releasing each original as it is consumed keeps one set resident
        // instead of two, which is the difference between peaking under the
        // worker's memory ceiling and being killed at it.
        page.base64 = '';
      }
      if (convertedCount) log.info('heic_pages_converted', { count: convertedCount });
      pages = prepared;
    } else {
      const { base64, mimeType } = body;
      if (!base64 || !mimeType) {
        return jsonResponse({ error: 'Missing base64 or mimeType in request body' }, 400);
      }
      if (typeof base64 !== 'string') {
        return jsonResponse({ error: 'base64 must be a string' }, 400);
      }
      // Same treatment as the multi-page branch. A HEIC reaches here from the
      // iOS document picker and from a browser drag-and-drop that could not
      // transcode it in-page (anything but Safari).
      const ready = await prepareImagePayload(base64, typeof mimeType === 'string' ? mimeType : null);
      if (!ready.ok) return jsonResponse({ error: ready.error, code: ready.code }, 400);
      if (ready.converted) log.info('heic_converted', { path: 'single' });
      singleDocument = normalizeSupportedDocument(
        // A converted HEIC is a JPEG now, so the original .heic filename must
        // not be what decides the type — the header already did.
        ready.converted ? 'syllabus_photo.jpg' : (typeof body.fileName === 'string' ? body.fileName : null),
        ready.mimeType || null,
      );
      if (!singleDocument) {
        return jsonResponse({ error: SUPPORTED_DOCUMENT_ERROR }, 400);
      }
      pages = [{ base64: ready.base64, mimeType: singleDocument.mimeType }];
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
      : pages.map((page, index) => {
        const document = index === 0 && singleDocument
          ? singleDocument
          : normalizeSupportedDocument(null, page.mimeType)!;
        if (document.isImage) {
          return {
            type: 'input_image',
            image_url: `data:${page.mimeType};base64,${page.base64}`,
            detail: 'high',
          };
        }
        return {
          type: 'input_file',
          filename: document.fileName,
          file_data: `data:${page.mimeType};base64,${page.base64}`,
          // `detail` affects PDF page images only. Office/text files are
          // text-extracted by the Responses API and should omit it.
          ...(document.isPdf ? { detail: 'high' } : {}),
        };
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
    }, log);

    if (!openAIResult.data) {
      const code = openAIResult.networkError ? 'fetch_error' : `http_${openAIResult.status || 0}`;
      log.error('openai_failed_after_retries', {
        code,
        attempts: openAIResult.attempts,
        // Logged AND persisted: the log line is the fast path while it is
        // still in retention, the ledger is what is still there next week.
        error_body: (openAIResult.errorBody ?? '').slice(0, 300),
      });
      await logCall(adminClient, userId, 'failed', Date.now() - startTime, code, {
        errorBody: openAIResult.errorBody,
        attempts: openAIResult.attempts,
      });
      // "Please try again" is the right advice for a 5xx or a 429 and the
      // WRONG advice for a 4xx: the provider rejected this exact request and
      // will reject an identical retry. The ledger shows a student burning
      // three attempts on one photo inside a minute doing what we told them.
      // A 4xx therefore asks for a DIFFERENT input, not the same one again.
      const retryable = openAIResult.status === 503 || openAIResult.status === 429 ||
        openAIResult.status >= 500;
      const msg = openAIResult.networkError
        ? 'AI service unreachable. Please try again.'
        : retryable
          ? 'The AI is busy right now — please try again in a minute.'
          : "Semora couldn't read this file. Try a PDF of the syllabus, or retake the photo straight-on in good light — one page at a time.";
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
      log.error('openai_max_output_tokens');
      await logCall(adminClient, userId, 'failed', Date.now() - startTime, 'max_tokens');
      return jsonResponse(
        { error: 'This syllabus is very dense and the response was cut off. Try scanning one course (or fewer pages) at a time.' },
        502,
      );
    }

    if (!text) {
      log.error('openai_empty_response', { response_keys: Object.keys(data ?? {}).join(','), response_bytes: JSON.stringify(data ?? {}).length });
      await logCall(adminClient, userId, 'failed', Date.now() - startTime, 'empty_response');
      return jsonResponse({ error: 'No response from the AI service' }, 502);
    }

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch (parseErr) {
      log.error('model_json_parse_failed', { ...errorFields(parseErr), output_chars: cleaned.length, starts_with: cleaned.slice(0, 24) });
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
    // These are two different failures and they need two different answers.
    // An explicit is_syllabus===false is the model saying "wrong document" —
    // the right advice is to go find the syllabus. An empty extraction with no
    // such verdict is far more often a REAL syllabus the model could not read:
    // a dark or skewed photo, an image-only PDF. Telling that student the
    // document "doesn't look like a syllabus" sends them hunting for a
    // different file when the fix is to retake the photo or upload the PDF.
    // The ledger already separated these (not_syllabus vs empty_extraction);
    // only the user-facing message was collapsing them.
    const explicitlyNotSyllabus = result.is_syllabus === false;
    if (explicitlyNotSyllabus || nothingExtracted) {
      const errorCode = explicitlyNotSyllabus ? 'not_syllabus' : 'empty_extraction';
      log.warn('document_rejected', {
        reason: errorCode,
        is_syllabus: result.is_syllabus ?? null,
        empty: nothingExtracted,
        source: pastedText ? 'text' : 'file',
      });
      await logCall(adminClient, userId, 'failed', Date.now() - startTime, errorCode);
      return jsonResponse(
        explicitlyNotSyllabus
          ? {
              // Names what Semora actually needs rather than repeating the word
              // "syllabus". The old copy told the student to "try scanning your
              // syllabus, course outline, or class schedule" — circular advice
              // for someone who just scanned exactly that and was rejected. What
              // matters is the PAGE: the one listing graded work with dates.
              error: localized(
                "Semora couldn't find any assignments or exam dates here. It needs the part of your syllabus that lists graded work with due dates — often a table called Course Schedule or Calendar, usually a page or two in. You can also copy that section and paste it as text.",
                'Semora no encontró tareas ni fechas de exámenes aquí. Necesita la parte del programa que lista el trabajo evaluado con sus fechas de entrega: suele ser una tabla llamada Calendario o Cronograma, normalmente una o dos páginas más adelante. También puedes copiar esa sección y pegarla como texto.',
              ),
              code: 'NOT_SYLLABUS',
            }
          : {
              error: localized(
                "Semora couldn't read any text in this. If it's a photo, retake it with the page flat, fully in frame and well lit. If it's a scanned PDF, the text may be an image — try the original file from your course site, or paste the schedule as text.",
                'Semora no pudo leer texto aquí. Si es una foto, repítela con la hoja plana, completa dentro del encuadre y bien iluminada. Si es un PDF escaneado, puede que el texto sea una imagen: prueba con el archivo original de tu plataforma del curso, o pega el calendario como texto.',
              ),
              code: 'UNREADABLE_DOCUMENT',
            },
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
      // The grade weighting table. Every constraint on public.grade_categories
      // (036) is enforced here rather than left to the insert, because a single
      // bad row would 23514 the whole batch and the student would silently get
      // no categories at all: name must be non-blank, weight must land in
      // (0, 100], drop-count in 0..20, and names must be unique per course.
      grade_categories: (() => {
        if (!Array.isArray(result.grade_categories)) return [];
        const seen = new Set<string>();
        return result.grade_categories
          .map((c: any) => ({
            name: typeof c?.name === 'string' ? c.name.trim().slice(0, 80) : '',
            weight_percent: Number(c?.weight_percent),
            drop_lowest_count: Number.isFinite(Number(c?.drop_lowest_count))
              ? Math.min(20, Math.max(0, Math.trunc(Number(c.drop_lowest_count))))
              : 0,
          }))
          .filter((c: { name: string; weight_percent: number }) => {
            if (!c.name) return false;
            if (!Number.isFinite(c.weight_percent) || c.weight_percent <= 0 || c.weight_percent > 100) return false;
            const key = c.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .slice(0, 20);
      })(),
      items,
      // Telemetry: the model that actually answered. The legacy field name is
      // retained because parse_runs.gemini_model already exists in production;
      // its value now records gpt-5.6-luna.
      gemini_model: servedModel || null,
    };

    // 6. Log success and return.
    // The counts are the extraction-quality signal: a run that returns a course
    // but zero items is technically a success and a bad outcome for the
    // student, and without this it is indistinguishable from a good one.
    log.info('extraction_ok', {
      source: pastedText ? 'text' : 'file',
      items: items.length,
      meetings: Array.isArray(result.meetings) ? result.meetings.length : 0,
      has_course_name: Boolean(result.course_name),
      has_grading_scale: Boolean(result.grading_scale),
      dateless_items: items.filter((i: any) => !i.due_date).length,
      suspect_dates: items.filter((i: any) => i.date_suspect).length,
      model: servedModel || null,
    });
    await logCall(adminClient, userId, 'success', Date.now() - startTime);

    return jsonResponse(extraction, 200);
  } catch (err) {
    log.error('unhandled_error', errorFields(err));
    return jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
  }
}

/**
 * The handler is wrapped rather than logging at each `return` because this
 * function has ~30 exit points and any one of them added later would silently
 * skip the terminal line. Wrapping means `request_done` is emitted exactly once
 * per invocation no matter which branch answered, which is what makes error
 * rate and latency queryable rather than approximate.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const log = createLogger('parse-syllabus', req);
  const startTime = Date.now();
  const response = await handleRequest(req, log, startTime);
  log.done(
    response.status < 400 ? 'ok' : response.status < 500 ? 'client_error' : 'server_error',
    response.status,
  );
  return response;
});
