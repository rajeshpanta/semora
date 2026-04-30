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
  "meeting_time": "MWF 10:00-10:50 AM, Room 320" (class meeting days/times/location if visible, or null),
  "office_hours": "Tue/Thu 2:00-3:30 PM, Office 412" (professor office hours if visible, or null),
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

    // 5. Validate and clean items
    const items = (result.items || [])
      .filter(
        (item: any) =>
          item.title && item.due_date && /^\d{4}-\d{2}-\d{2}$/.test(item.due_date),
      )
      .map((item: any) => ({
        title: item.title,
        type: ['assignment', 'quiz', 'exam', 'project', 'reading', 'other'].includes(item.type)
          ? item.type
          : 'other',
        due_date: item.due_date,
        due_time: item.due_time && /^\d{2}:\d{2}$/.test(item.due_time) ? item.due_time : null,
        weight: typeof item.weight === 'number' ? item.weight : null,
        description: item.description || null,
        confidence:
          typeof item.confidence === 'number'
            ? Math.min(Math.max(item.confidence, 0), 1)
            : 0.5,
      }));

    const extraction = {
      course_name: result.course_name || 'Unknown Course',
      course_code: result.course_code || null,
      instructor: result.instructor || null,
      meeting_time: result.meeting_time || null,
      office_hours: result.office_hours || null,
      semester_name: result.semester_name || null,
      semester_start: result.semester_start || null,
      semester_end: result.semester_end || null,
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
