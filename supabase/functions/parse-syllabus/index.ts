import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const DAILY_CAP = 20;

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/heic',
  'image/heif',
  'image/webp',
];

const EXTRACTION_PROMPT = `You are analyzing a course syllabus document. Extract the course information AND all deadlines.

Return a single JSON object with this structure:
{
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
    const MAX_BODY_BYTES = 11 * 1024 * 1024;
    const contentLengthRaw = req.headers.get('content-length');
    if (!contentLengthRaw) {
      return jsonResponse({ error: 'Content-Length required' }, 411);
    }
    const contentLength = parseInt(contentLengthRaw, 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return jsonResponse({ error: 'Invalid Content-Length' }, 400);
    }
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'File too large. Maximum size is approximately 7.5 MB.' }, 413);
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

    // 2. Per-user rolling 24h rate limit (service role bypasses RLS)
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count: recentCount, error: countError } = await adminClient
      .from('gemini_call_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
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

    // 3. Parse and validate request body
    let body: { base64?: string; mimeType?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    const { base64, mimeType } = body;
    if (!base64 || !mimeType) {
      return jsonResponse({ error: 'Missing base64 or mimeType in request body' }, 400);
    }
    if (typeof base64 !== 'string') {
      return jsonResponse({ error: 'base64 must be a string' }, 400);
    }
    if (base64.length > 10_000_000) {
      return jsonResponse({ error: 'File too large. Maximum size is approximately 7.5 MB.' }, 413);
    }
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      return jsonResponse({ error: `Unsupported file type: ${mimeType}` }, 400);
    }

    // 4. Call Gemini
    const geminiBody = {
      contents: [
        {
          parts: [
            { text: EXTRACTION_PROMPT },
            { inline_data: { mime_type: mimeType, data: base64 } },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    };

    let geminiResponse: Response;
    try {
      geminiResponse = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      });
    } catch (err) {
      console.error('[parse-syllabus] Gemini fetch failed:', err);
      await logCall(adminClient, userId, 'failed', Date.now() - startTime, 'fetch_error');
      return jsonResponse({ error: 'AI service unreachable. Please try again.' }, 502);
    }

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text().catch(() => '');
      console.error(`[parse-syllabus] Gemini ${geminiResponse.status}:`, errorText);
      await logCall(
        adminClient,
        userId,
        'failed',
        Date.now() - startTime,
        `http_${geminiResponse.status}`,
      );
      return jsonResponse(
        { error: `AI processing failed (status ${geminiResponse.status}). Please try again.` },
        502,
      );
    }

    const data = await geminiResponse.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

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

    const items = (result.items || [])
      .filter((item: any) => item.title && isValidDate(item.due_date))
      .map((item: any) => ({
        title: item.title,
        type: ['assignment', 'quiz', 'exam', 'project', 'reading', 'other'].includes(item.type)
          ? item.type
          : 'other',
        due_date: item.due_date,
        due_time: item.due_time && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.due_time) ? item.due_time : null,
        weight: typeof item.weight === 'number' ? item.weight : null,
        description: item.description || null,
        confidence:
          typeof item.confidence === 'number'
            ? Math.min(Math.max(item.confidence, 0), 1)
            : 0.5,
      }));

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
      // Validate before persisting — these go straight to a Postgres
      // `date` column and a bad string (e.g. "Fall 2026") would 22007 on
      // insert. The isValidDate check also catches Gemini-mangled values
      // like 2026-02-30. Null is fine for both fields.
      semester_start: isValidDate(result.semester_start) ? result.semester_start : null,
      semester_end: isValidDate(result.semester_end) ? result.semester_end : null,
      grade_scale:
        Array.isArray(result.grade_scale) && result.grade_scale.length > 0
          ? result.grade_scale
              .filter((g: any) => g.letter && typeof g.min === 'number')
              .sort((a: any, b: any) => b.min - a.min)
          : null,
      items,
    };

    // 6. Log success and return
    await logCall(adminClient, userId, 'success', Date.now() - startTime);

    return jsonResponse(extraction, 200);
  } catch (err) {
    console.error('[parse-syllabus] Unhandled error:', err);
    return jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
  }
});
