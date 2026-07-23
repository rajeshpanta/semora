import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_PAGES = 12;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Provider = 'canvas' | 'blackboard' | 'moodle' | 'google_classroom';
type LmsCourse = { id: string; name: string; code?: string; instructor?: string };
type LmsAssignment = {
  external_id: string;
  external_course_id: string;
  title: string;
  description?: string | null;
  type: 'assignment' | 'quiz' | 'exam' | 'project' | 'reading' | 'other';
  due_date?: string | null;
  due_time?: string | null;
  due_at?: string | null;
  points_possible?: number | null;
  points_earned?: number | null;
  score?: number | null;
  is_completed?: boolean;
  completed_at?: string | null;
  submitted_late?: boolean;
  external_updated_at?: string | null;
  url?: string | null;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function cleanText(value: unknown, max = 10_000): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return text ? text.slice(0, max) : null;
}

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '' || typeof value === 'boolean') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function classify(name: string): LmsAssignment['type'] {
  const lower = name.toLowerCase();
  if (/\b(midterm|final|exam|test)\b/.test(lower)) return 'exam';
  if (/\bquiz\b/.test(lower)) return 'quiz';
  if (/\bproject\b/.test(lower)) return 'project';
  if (/\b(read|reading|chapter)\b/.test(lower)) return 'reading';
  return 'assignment';
}

function splitDue(value: unknown): { due_date: string | null; due_time: string | null } {
  if (typeof value !== 'string' || !value) return { due_date: null, due_time: null };
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return { due_date: null, due_time: null };
  return {
    due_date: date.toISOString().slice(0, 10),
    due_time: date.toISOString().slice(11, 19),
  };
}

function safeBaseUrl(raw: unknown, provider: Provider): string {
  if (provider === 'google_classroom') return 'https://classroom.googleapis.com';
  if (typeof raw !== 'string') throw new Error('School LMS URL is required.');
  const normalized = raw.trim().replace(/\/+$/, '');
  const url = new URL(normalized);
  if (url.protocol !== 'https:') throw new Error('The LMS URL must use HTTPS.');
  const host = url.hostname.toLowerCase();
  const blocked =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) throw new Error('Private network LMS addresses are not supported.');
  return normalized;
}

async function fetchJson(
  url: string,
  init: RequestInit,
  expectedOrigin?: string,
  redirects = 0,
): Promise<{ data: any; response: Response }> {
  const response = await fetch(url, { ...init, redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    if (redirects >= 3) throw new Error('LMS returned too many redirects.');
    const location = response.headers.get('location');
    if (!location) throw new Error('LMS returned an invalid redirect.');
    const next = new URL(location, url);
    if (expectedOrigin && next.origin !== expectedOrigin) {
      throw new Error('LMS redirected to an untrusted host.');
    }
    return fetchJson(next.toString(), init, expectedOrigin, redirects + 1);
  }
  const raw = await response.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`LMS returned an unreadable response (${response.status}).`);
  }
  if (!response.ok) {
    const message =
      cleanText(data?.message, 300) ??
      cleanText(data?.error_description, 300) ??
      cleanText(data?.error, 300) ??
      `LMS request failed (${response.status}).`;
    const error = new Error(message);
    (error as any).status = response.status;
    throw error;
  }
  return { data, response };
}

function nextLink(link: string | null): string | null {
  if (!link) return null;
  for (const section of link.split(',')) {
    if (/rel="?next"?/i.test(section)) {
      return section.match(/<([^>]+)>/)?.[1] ?? null;
    }
  }
  return null;
}

async function canvasPages(base: string, path: string, token: string): Promise<any[]> {
  let url: string | null = `${base}${path}${path.includes('?') ? '&' : '?'}per_page=100`;
  const all: any[] = [];
  for (let page = 0; url && page < MAX_PAGES; page++) {
    const result = await fetchJson(
      url,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
      new URL(base).origin,
    );
    if (Array.isArray(result.data)) all.push(...result.data);
    url = nextLink(result.response.headers.get('link'));
  }
  return all;
}

async function canvasDiscover(base: string, token: string): Promise<LmsCourse[]> {
  const rows = await canvasPages(base, '/api/v1/courses?enrollment_state=active', token);
  return rows
    .filter((row) => row?.id != null && row?.name)
    .map((row) => ({
      id: String(row.id),
      name: cleanText(row.name, 240) ?? 'Untitled course',
      code: cleanText(row.course_code, 120) ?? undefined,
    }));
}

async function canvasAssignments(
  base: string,
  token: string,
  courseIds: string[],
): Promise<LmsAssignment[]> {
  const output: LmsAssignment[] = [];
  for (const courseId of courseIds.slice(0, 50)) {
    const rows = await canvasPages(
      base,
      `/api/v1/courses/${encodeURIComponent(courseId)}/assignments?order_by=due_at&include[]=submission`,
      token,
    );
    for (const row of rows) {
      if (row?.id == null || !row?.name) continue;
      const due = splitDue(row.due_at);
      const submissionTypes = Array.isArray(row.submission_types) ? row.submission_types.join(' ') : '';
      const submission = row.submission;
      const submissionState = String(submission?.workflow_state ?? '');
      const possible = numberOrNull(row.points_possible);
      const earned = numberOrNull(submission?.score);
      output.push({
        external_id: String(row.id),
        external_course_id: courseId,
        title: cleanText(row.name, 240) ?? 'Untitled assignment',
        description: cleanText(row.description),
        type: /quiz/i.test(submissionTypes) ? 'quiz' : classify(String(row.name)),
        ...due,
        due_at: typeof row.due_at === 'string' ? row.due_at : null,
        points_possible: possible,
        points_earned: earned,
        score: possible && earned != null ? earned / possible * 100 : null,
        is_completed: ['submitted', 'graded', 'pending_review'].includes(submissionState),
        completed_at: typeof submission?.submitted_at === 'string' ? submission.submitted_at : null,
        submitted_late: submission?.late === true,
        external_updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
        url: typeof row.html_url === 'string' ? row.html_url : null,
      });
    }
  }
  return output;
}

async function blackboardPaged(base: string, path: string, token: string): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const { data } = await fetchJson(
      `${base}${path}${separator}limit=100&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
      new URL(base).origin,
    );
    const rows = Array.isArray(data?.results) ? data.results : [];
    all.push(...rows);
    if (rows.length < 100) break;
    offset += rows.length;
  }
  return all;
}

async function blackboardDiscover(base: string, token: string): Promise<LmsCourse[]> {
  const rows = await blackboardPaged(base, '/learn/api/public/v1/users/me/courses?expand=course', token);
  return rows
    .map((row) => row?.course ?? row)
    .filter((row) => row?.id && (row?.name || row?.courseId))
    .map((row) => ({
      id: String(row.id),
      name: cleanText(row.name, 240) ?? cleanText(row.courseId, 240) ?? 'Untitled course',
      code: cleanText(row.courseId, 120) ?? undefined,
    }));
}

async function blackboardAssignments(
  base: string,
  token: string,
  courseIds: string[],
): Promise<LmsAssignment[]> {
  const output: LmsAssignment[] = [];
  for (const courseId of courseIds.slice(0, 50)) {
    const rows = await blackboardPaged(
      base,
      `/learn/api/public/v2/courses/${encodeURIComponent(courseId)}/gradebook/columns`,
      token,
    );
    for (const row of rows) {
      if (!row?.id || !row?.name) continue;
      const due = splitDue(row.due);
      output.push({
        external_id: String(row.id),
        external_course_id: courseId,
        title: cleanText(row.name, 240) ?? 'Untitled assignment',
        description: cleanText(row.description),
        type: classify(String(row.name)),
        ...due,
        due_at: typeof row.due === 'string' ? row.due : null,
        points_possible: numberOrNull(row.score?.possible),
        external_updated_at:
          typeof row.modified === 'string' ? row.modified : typeof row.created === 'string' ? row.created : null,
        url: row.contentId
          ? `${base}/ultra/courses/${encodeURIComponent(courseId)}/outline/item/${encodeURIComponent(row.contentId)}`
          : null,
      });
    }
  }
  return output;
}

async function moodleCall(base: string, token: string, fn: string, values: URLSearchParams) {
  const body = new URLSearchParams(values);
  body.set('wstoken', token);
  body.set('wsfunction', fn);
  body.set('moodlewsrestformat', 'json');
  const { data } = await fetchJson(
    `${base}/webservice/rest/server.php`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: body.toString(),
    },
    new URL(base).origin,
  );
  if (data?.exception) throw new Error(cleanText(data.message, 300) ?? 'Moodle request failed.');
  return data;
}

async function moodleDiscover(base: string, token: string): Promise<LmsCourse[]> {
  const site = await moodleCall(base, token, 'core_webservice_get_site_info', new URLSearchParams());
  if (site?.userid == null) throw new Error('Moodle token does not expose a user account.');
  const rows = await moodleCall(
    base,
    token,
    'core_enrol_get_users_courses',
    new URLSearchParams({ userid: String(site.userid) }),
  );
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.id != null && (row?.fullname || row?.shortname))
    .map((row) => ({
      id: String(row.id),
      name: cleanText(row.fullname, 240) ?? cleanText(row.shortname, 240) ?? 'Untitled course',
      code: cleanText(row.shortname, 120) ?? undefined,
    }));
}

async function moodleAssignments(
  base: string,
  token: string,
  courseIds: string[],
): Promise<LmsAssignment[]> {
  const params = new URLSearchParams();
  courseIds.slice(0, 50).forEach((id, index) => params.set(`courseids[${index}]`, id));
  const data = await moodleCall(base, token, 'mod_assign_get_assignments', params);
  const output: LmsAssignment[] = [];
  for (const course of Array.isArray(data?.courses) ? data.courses : []) {
    for (const row of Array.isArray(course?.assignments) ? course.assignments : []) {
      if (row?.id == null || !row?.name) continue;
      const due = typeof row.duedate === 'number' && row.duedate > 0
        ? splitDue(new Date(row.duedate * 1000).toISOString())
        : { due_date: null, due_time: null };
      // Moodle uses negative grade values for non-numeric scales. They are not
      // point totals and must not flow into GPA math as "-1 possible points".
      const possiblePoints = numberOrNull(row.grade);
      output.push({
        external_id: String(row.id),
        external_course_id: String(course.id),
        title: cleanText(row.name, 240) ?? 'Untitled assignment',
        description: cleanText(row.intro),
        type: classify(String(row.name)),
        ...due,
        due_at:
          typeof row.duedate === 'number' && row.duedate > 0
            ? new Date(row.duedate * 1000).toISOString()
            : null,
        points_possible: possiblePoints != null && possiblePoints > 0 ? possiblePoints : null,
        external_updated_at:
          typeof row.timemodified === 'number' ? new Date(row.timemodified * 1000).toISOString() : null,
        url: row.cmid ? `${base}/mod/assign/view.php?id=${encodeURIComponent(row.cmid)}` : null,
      });
    }
  }
  return output;
}

async function googlePages(path: string, token: string): Promise<any[]> {
  const all: any[] = [];
  let pageToken = '';
  for (let page = 0; page < MAX_PAGES; page++) {
    const separator = path.includes('?') ? '&' : '?';
    const url = `https://classroom.googleapis.com/v1/${path}${separator}pageSize=100${
      pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''
    }`;
    const { data } = await fetchJson(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    }, 'https://classroom.googleapis.com');
    const rows =
      data?.courses ?? data?.courseWork ?? data?.studentSubmissions ?? [];
    if (Array.isArray(rows)) all.push(...rows);
    pageToken = typeof data?.nextPageToken === 'string' ? data.nextPageToken : '';
    if (!pageToken) break;
  }
  return all;
}

async function googleDiscover(token: string): Promise<LmsCourse[]> {
  const rows = await googlePages('courses?courseStates=ACTIVE', token);
  return rows
    .filter((row) => row?.id && row?.name)
    .map((row) => ({
      id: String(row.id),
      name: cleanText(row.name, 240) ?? 'Untitled course',
      code: cleanText(row.section, 120) ?? undefined,
    }));
}

function googleDue(row: any): {
  due_date: string | null;
  due_time: string | null;
  due_at: string | null;
} {
  if (!row?.dueDate) return { due_date: null, due_time: null, due_at: null };
  const year = Number(row.dueDate.year);
  const month = Number(row.dueDate.month);
  const day = Number(row.dueDate.day);
  if (![year, month, day].every(Number.isFinite)) {
    return { due_date: null, due_time: null, due_at: null };
  }
  const due_date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const time = row.dueTime;
  const due_time = time
    ? `${String(time.hours ?? 0).padStart(2, '0')}:${String(time.minutes ?? 0).padStart(2, '0')}:${String(time.seconds ?? 0).padStart(2, '0')}`
    : null;
  // Classroom documents dueDate/dueTime as UTC. Send the absolute timestamp
  // as well so the app can convert it to the student's device-local calendar
  // date instead of silently shifting the deadline by their UTC offset.
  const due_at = time
    ? new Date(Date.UTC(
        year,
        month - 1,
        day,
        Number(time.hours ?? 0),
        Number(time.minutes ?? 0),
        Number(time.seconds ?? 0),
      )).toISOString()
    : null;
  return { due_date, due_time, due_at };
}

function googleTurnedInAt(submission: any): string | null {
  const timestamps = (Array.isArray(submission?.submissionHistory)
    ? submission.submissionHistory
    : [])
    .map((entry: any) => entry?.stateHistory)
    .filter((history: any) =>
      history?.state === 'TURNED_IN' &&
      typeof history?.stateTimestamp === 'string' &&
      Number.isFinite(new Date(history.stateTimestamp).getTime())
    )
    .map((history: any) => history.stateTimestamp)
    .sort((left: string, right: string) =>
      new Date(left).getTime() - new Date(right).getTime()
    );
  if (timestamps.length) return timestamps[timestamps.length - 1];

  // Older Classroom responses can omit history. updateTime is an acceptable
  // fallback only while the work is still turned in; after RETURNED it may be
  // the teacher's grading timestamp and must not be treated as submission time.
  return submission?.state === 'TURNED_IN' &&
    typeof submission?.updateTime === 'string'
    ? submission.updateTime
    : null;
}

async function googleAssignments(token: string, courseIds: string[]): Promise<LmsAssignment[]> {
  const output: LmsAssignment[] = [];
  for (const courseId of courseIds.slice(0, 50)) {
    const work = await googlePages(
      `courses/${encodeURIComponent(courseId)}/courseWork?courseWorkStates=PUBLISHED&orderBy=dueDate%20asc`,
      token,
    );
    const submissionMap = new Map<string, any>();
    try {
      const submissions = await googlePages(
        `courses/${encodeURIComponent(courseId)}/courseWork/-/studentSubmissions?userId=me`,
        token,
      );
      submissions.forEach((row) => submissionMap.set(String(row.courseWorkId), row));
    } catch {
      // Coursework import still works when the optional submission scope is
      // unavailable. Completion and posted grades simply remain student-owned.
    }
    for (const row of work) {
      if (!row?.id || !row?.title) continue;
      const submission = submissionMap.get(String(row.id));
      const state = String(submission?.state ?? '');
      output.push({
        external_id: String(row.id),
        external_course_id: courseId,
        title: cleanText(row.title, 240) ?? 'Untitled assignment',
        description: cleanText(row.description),
        type: row.workType === 'SHORT_ANSWER_QUESTION' || row.workType === 'MULTIPLE_CHOICE_QUESTION'
          ? 'quiz'
          : classify(String(row.title)),
        ...googleDue(row),
        points_possible: numberOrNull(row.maxPoints),
        points_earned: numberOrNull(submission?.assignedGrade ?? submission?.draftGrade),
        score:
          numberOrNull(row.maxPoints) && numberOrNull(submission?.assignedGrade ?? submission?.draftGrade) != null
            ? (numberOrNull(submission?.assignedGrade ?? submission?.draftGrade)! / numberOrNull(row.maxPoints)!) * 100
            : null,
        is_completed: ['TURNED_IN', 'RETURNED'].includes(state),
        completed_at: ['TURNED_IN', 'RETURNED'].includes(state)
          ? googleTurnedInAt(submission)
          : null,
        submitted_late: submission?.late === true,
        external_updated_at: typeof row.updateTime === 'string' ? row.updateTime : null,
        url: typeof row.alternateLink === 'string' ? row.alternateLink : null,
      });
    }
  }
  return output;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const length = Number(req.headers.get('content-length'));
    if (!Number.isFinite(length) || length < 0) return json({ error: 'Content-Length required' }, 411);
    if (length > MAX_BODY_BYTES) return json({ error: 'Request too large' }, 413);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401);
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Invalid or expired session' }, 401);

    const body = await req.json();
    const provider = body?.provider as Provider;
    const action = body?.action;
    const token = typeof body?.access_token === 'string' ? body.access_token.trim() : '';
    const courseIds = Array.isArray(body?.course_ids)
      ? body.course_ids.filter((id: unknown) => typeof id === 'string').slice(0, 50)
      : [];
    if (!['canvas', 'blackboard', 'moodle', 'google_classroom'].includes(provider)) {
      return json({ error: 'Unsupported LMS provider' }, 400);
    }
    if (!['discover', 'assignments'].includes(action)) return json({ error: 'Invalid action' }, 400);
    if (!token || token.length > 8192) return json({ error: 'A valid LMS access token is required' }, 400);
    if (action === 'assignments' && courseIds.length === 0) {
      return json({ error: 'Select at least one course' }, 400);
    }

    const base = safeBaseUrl(body?.base_url, provider);
    let result: LmsCourse[] | LmsAssignment[];
    if (action === 'discover') {
      if (provider === 'canvas') result = await canvasDiscover(base, token);
      else if (provider === 'blackboard') result = await blackboardDiscover(base, token);
      else if (provider === 'moodle') result = await moodleDiscover(base, token);
      else result = await googleDiscover(token);
      return json({ courses: result.slice(0, 500) });
    }

    if (provider === 'canvas') result = await canvasAssignments(base, token, courseIds);
    else if (provider === 'blackboard') result = await blackboardAssignments(base, token, courseIds);
    else if (provider === 'moodle') result = await moodleAssignments(base, token, courseIds);
    else result = await googleAssignments(token, courseIds);
    // Provider pagination is intentionally bounded. Never authorize the
    // client to infer deletions from this response: an extremely large course
    // or a provider-side visibility rule could otherwise make valid local
    // assignments look removed.
    return json({ assignments: result.slice(0, 5000), removal_safe: false });
  } catch (error) {
    const status = Number((error as any)?.status);
    const message = cleanText((error as Error)?.message, 400) ?? 'LMS synchronization failed.';
    if (status === 401 || status === 403) return json({ error: message, code: 'credentials_required' }, 401);
    console.error('[lms-sync] request failed:', message);
    return json({ error: message }, 400);
  }
});
