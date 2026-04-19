import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent`;

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Gemini API key not configured on server' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { base64, mimeType } = await req.json();

    if (!base64 || !mimeType) {
      return new Response(
        JSON.stringify({ error: 'Missing base64 or mimeType in request body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Reject payloads over ~7.5MB (10MB base64)
    if (typeof base64 === 'string' && base64.length > 10_000_000) {
      return new Response(
        JSON.stringify({ error: 'File too large. Maximum size is approximately 7.5 MB.' }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const body = {
      contents: [
        {
          parts: [
            { text: EXTRACTION_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 8192,
      },
    };

    const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(
        JSON.stringify({ error: `AI processing failed (status ${response.status}). Please try again.` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return new Response(
        JSON.stringify({ error: 'No response from Gemini' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let result: any;
    try {
      result = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response. Please try again with a clearer document.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Validate and clean items
    const items = (result.items || [])
      .filter((item: any) => item.title && item.due_date && /^\d{4}-\d{2}-\d{2}$/.test(item.due_date))
      .map((item: any) => ({
        title: item.title,
        type: ['assignment', 'quiz', 'exam', 'project', 'reading', 'other'].includes(item.type) ? item.type : 'other',
        due_date: item.due_date,
        due_time: item.due_time && /^\d{2}:\d{2}$/.test(item.due_time) ? item.due_time : null,
        weight: typeof item.weight === 'number' ? item.weight : null,
        description: item.description || null,
        confidence: typeof item.confidence === 'number' ? Math.min(Math.max(item.confidence, 0), 1) : 0.5,
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
      grade_scale: Array.isArray(result.grade_scale) && result.grade_scale.length > 0
        ? result.grade_scale
            .filter((g: any) => g.letter && typeof g.min === 'number')
            .sort((a: any, b: any) => b.min - a.min)
        : null,
      items,
    };

    return new Response(
      JSON.stringify(extraction),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
