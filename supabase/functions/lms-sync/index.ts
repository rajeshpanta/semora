import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  normalizeCanvasCalendarFeedUrl,
  parseCanvasCalendarFeed,
} from '../_shared/canvas-calendar.ts';
import { withRequestLogging, errorFields, type EdgeLogger } from '../_shared/log.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_PAGES = 12;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Provider = 'canvas' | 'blackboard' | 'moodle' | 'google_classroom';
type ConnectionMethod = 'legacy_token' | 'calendar_feed' | 'oauth';
// The Edge worker intentionally operates on several dynamic PostgREST rows.
// Keep its service client type local instead of coupling this function to a
// generated database schema that is not bundled into Supabase deployments.
type AdminClient = any;
type LmsCourse = {
  id: string;
  name: string;
  code?: string;
  instructor?: string;
  // Evidence for "which semester is this?", carried back to the client so the
  // connect screen can propose an answer instead of filing everything under
  // whichever semester happened to be selected in the app.
  //
  // Populated only where the provider gives it away cheaply: a Canvas calendar
  // feed is parsed in full at discovery, so counts and date spans are free. The
  // token/API providers list courses without their assignments, and fetching
  // every course's work just to show a number would turn a connect into dozens
  // of extra requests.
  item_count?: number;
  first_due?: string | null;
  last_due?: string | null;
  // Canvas's OWN term, from the API. Authoritative — when the school says
  // "Fall 2026" there is nothing left to infer. Never present on a calendar
  // feed: RFC 5545 has no term property and Canvas adds none.
  term_name?: string | null;
  term_start?: string | null;
  term_end?: string | null;
};
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

type SyncTrigger = 'initial' | 'manual' | 'foreground_auto' | 'background';
type SyncConnection = {
  id: string;
  user_id: string;
  provider: Provider;
  connection_method: ConnectionMethod;
  base_url: string | null;
  display_name: string;
  sync_enabled: boolean;
  background_sync_enabled: boolean;
  consecutive_sync_failures: number;
  links: Array<{
    id: string;
    external_course_id: string;
    local_course_id: string;
    sync_enabled: boolean;
  }>;
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

function privateResolvedAddress(value: string): boolean {
  const address = value.toLowerCase();
  return /^127\./.test(address) ||
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^169\.254\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
    address === '::' ||
    address === '::1' ||
    address.startsWith('fc') ||
    address.startsWith('fd') ||
    /^fe[89ab]/.test(address) ||
    /^::ffff:(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
}

async function assertPublicCalendarHost(url: URL) {
  // Resolve before fetching as defense in depth for custom Canvas vanity
  // domains. The URL validator already rejects literal local/private hosts.
  try {
    const [ipv4, ipv6] = await Promise.all([
      Deno.resolveDns(url.hostname, 'A').catch(() => [] as string[]),
      Deno.resolveDns(url.hostname, 'AAAA').catch(() => [] as string[]),
    ]);
    const addresses = [...ipv4, ...ipv6];
    if (!addresses.length) throw new Error('unresolved');
    if (addresses.some(privateResolvedAddress)) {
      const denied: any = new Error('Private network calendar feeds are not supported.');
      denied.status = 400;
      throw denied;
    }
  } catch (error) {
    if ((error as any)?.status === 400) throw error;
    const unavailable: any = new Error('Semora could not reach that Canvas school address. Check the Calendar Feed URL and try again.');
    unavailable.status = 400;
    throw unavailable;
  }
}

async function fetchCanvasCalendar(rawUrl: string) {
  const normalized = normalizeCanvasCalendarFeedUrl(rawUrl);
  const expectedOrigin = new URL(normalized).origin;
  let current = new URL(normalized);
  await assertPublicCalendarHost(current);

  for (let redirects = 0; redirects <= 3; redirects++) {
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(20_000),
        headers: {
          Accept: 'text/calendar, text/plain;q=0.9',
          'User-Agent': 'Semora-Canvas-Calendar/1.0',
        },
      });
    } catch {
      throw new Error('Canvas did not respond. Check your school connection and try again.');
    }

    if (response.status >= 300 && response.status < 400) {
      if (redirects === 3) throw new Error('Canvas returned too many redirects.');
      const location = response.headers.get('location');
      if (!location) throw new Error('Canvas returned an invalid redirect.');
      const next = new URL(location, current);
      if (next.origin !== expectedOrigin) throw new Error('Canvas redirected the calendar feed to an untrusted host.');
      current = next;
      continue;
    }

    if ([401, 403, 404, 410].includes(response.status)) {
      const expired: any = new Error('This Canvas Calendar Feed is no longer available. Copy a fresh Calendar Feed URL from Canvas and reconnect.');
      expired.status = 401;
      throw expired;
    }
    if (!response.ok) throw new Error(`Canvas Calendar Feed request failed (${response.status}).`);
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > 5 * 1024 * 1024) {
      throw new Error('This Canvas Calendar Feed is too large to import safely.');
    }
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > 5 * 1024 * 1024) {
      throw new Error('This Canvas Calendar Feed is too large to import safely.');
    }
    return parseCanvasCalendarFeed(body);
  }
  throw new Error('Canvas Calendar Feed could not be loaded.');
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
  // include[]=term is the whole reason a token connection is better than a
  // calendar feed at answering "which semester". Canvas returns the school's
  // own enrollment term — name, start and end — so nothing has to be inferred
  // from due dates. One extra query parameter, no extra requests.
  const rows = await canvasPages(
    base,
    '/api/v1/courses?enrollment_state=active&include[]=term',
    token,
  );
  return rows
    .filter((row) => row?.id != null && row?.name)
    .map((row) => ({
      id: String(row.id),
      name: cleanText(row.name, 240) ?? 'Untitled course',
      code: cleanText(row.course_code, 120) ?? undefined,
      term_name: cleanText(row?.term?.name, 120) ?? null,
      term_start: isoDay(row?.term?.start_at),
      term_end: isoDay(row?.term?.end_at),
    }));
}

/** 'YYYY-MM-DD' from whatever Canvas put in a timestamp field, or null. */
function isoDay(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw) return null;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? null : new Date(time).toISOString().slice(0, 10);
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

function validProvider(value: unknown): value is Provider {
  return ['canvas', 'blackboard', 'moodle', 'google_classroom'].includes(String(value));
}

function errorCode(error: unknown): 'credentials_required' | 'provider_error' {
  const status = Number((error as any)?.status);
  return status === 401 || status === 403 || /reconnect|permission|unauthor|token/i.test(String((error as Error)?.message ?? ''))
    ? 'credentials_required'
    : 'provider_error';
}

/**
 * How long a healthy connection waits before its next background sync.
 *
 * Calendar feeds were on ONE hour. That was set when there were three
 * connections and nothing downstream of it; at scale it is the single number
 * that decides whether the worker keeps up. The arithmetic, from production:
 * a fixed-rate cron of 96 runs/day serving N connections can only hold an
 * interval of N x (24 / (96 x batch)) hours, so the hourly promise saturated
 * at ~80 connections and then silently degraded for everyone.
 *
 * Three hours is not a compromise on usefulness. What this sync actually
 * catches is an instructor moving a due date, which happens on the scale of
 * days — a student is not refreshed into a different decision by learning it
 * 55 minutes sooner. It is a 3x capacity increase for no behaviour a student
 * could notice.
 *
 * DORMANT is the other half. A connection whose student has not opened Semora
 * in weeks was consuming exactly the same hourly slot as one being used every
 * day, forever, because nothing in the worker had ever asked whether anyone was
 * still there. Dormant connections drop to once a day — reduced, never stopped,
 * so their data stays close enough that a return is not a rebuild — and
 * lms_wake_returning_connections() (106) pulls them straight back the moment
 * the student reopens the app.
 */
const SYNC_HOURS = {
  calendarFeed: 3,
  token: 4,
  /** Any connection whose student has been away longer than DORMANT_AFTER_DAYS. */
  dormant: 24,
} as const;

/**
 * How long a student must be away before their connection is treated as
 * dormant. Deliberately generous: the cost of being wrong in one direction is
 * a connection syncing 8x more often than it needs to, and in the other it is a
 * real student's deadlines going a day stale. Three weeks is far outside any
 * normal gap in term-time use, including a reading week.
 */
const DORMANT_AFTER_DAYS = 21;

function nextSyncHours(connection: SyncConnection, active: boolean) {
  if (!active) return SYNC_HOURS.dormant;
  return connection.connection_method === 'calendar_feed'
    ? SYNC_HOURS.calendarFeed
    : SYNC_HOURS.token;
}

/**
 * Which of these users have opened Semora recently enough to count as active.
 *
 * ONE query for the whole batch rather than one per connection — this runs
 * inside the worker's hot path, and a per-connection lookup would add a round
 * trip to every sync to answer a question that changes daily.
 *
 * Fails OPEN. If this read errors the whole batch is treated as active, which
 * costs a little capacity and costs no student anything. Failing closed would
 * silently park every connection on the 24-hour cadence the first time
 * analytics had a bad minute.
 */
async function activeUserIds(
  log: EdgeLogger,
  admin: AdminClient,
  userIds: string[],
): Promise<Set<string> | null> {
  if (!userIds.length) return new Set();
  try {
    // Through the RPC, not a table select: DISTINCT happens in Postgres, so
    // this returns at most one row per user instead of one row per event.
    const { data, error } = await admin.rpc('lms_active_user_ids', {
      p_user_ids: userIds,
      p_days: DORMANT_AFTER_DAYS,
    });
    if (error) throw error;
    return new Set(
      (Array.isArray(data) ? data : [])
        .map((row: any) => (typeof row === 'string' ? row : row?.lms_active_user_ids ?? row?.user_id))
        .filter(Boolean),
    );
  } catch (error) {
    log.error('active_user_lookup_failed', errorFields(error));
    return null; // null = "unknown", and unknown means active.
  }
}

function nextBackgroundAttempt(failures: number) {
  // 4h after a healthy sync. Failures back off 1h → 2h → 4h → 8h → 24h,
  // keeping Semora considerate of institution API rate limits.
  const hours = Math.min(24, Math.max(1, 2 ** Math.min(Math.max(failures - 1, 0), 4)));
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

async function requireUser(req: Request) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    const error: any = new Error('Authentication required');
    error.status = 401;
    throw error;
  }
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    const authError: any = new Error('Invalid or expired session');
    authError.status = 401;
    throw authError;
  }
  return data.user;
}

// Canvas sync is not a Pro feature right now — it is the offer.
//
// This used to be is_pro() and nothing else. It is now lms_access_allowed(),
// which answers Pro OR the canvas_free promo is live OR this account claimed
// the promo while it was. The rule lives in the database (090) rather than
// here because the same question is asked by enforce_free_course_limit on
// every course insert, and 044 already recorded what happens when one rule is
// written twice: "the three layers disagree and the user is either blocked
// early or bypasses the cap."
//
// Still a hard server-side gate. When the promo is off and the account never
// claimed it, this refuses exactly as before — the client cannot talk its way
// past it, which is what makes it safe to be generous in the UI.
async function requireLmsAccess(log: EdgeLogger, admin: AdminClient, userId: string) {
  const { data, error } = await admin.rpc('lms_access_allowed', { uid: userId });
  if (error) {
    log.error('lms_access_check_failed', errorFields(error));
    const unavailable: any = new Error('Service temporarily unavailable');
    unavailable.status = 503;
    throw unavailable;
  }
  if (data !== true) {
    const denied: any = new Error('Connecting a learning platform is a Pro feature. Upgrade to import your courses and assignments.');
    denied.status = 402;
    denied.code = 'PRO_REQUIRED';
    throw denied;
  }
}

async function loadConnection(
  admin: AdminClient,
  connectionId: string,
  expectedUserId?: string,
): Promise<SyncConnection> {
  let query = admin
    .from('lms_connections')
    .select('*, links:lms_course_links(*)')
    .eq('id', connectionId);
  if (expectedUserId) query = query.eq('user_id', expectedUserId);
  const { data, error } = await query.single();
  if (error || !data) {
    const missing: any = new Error('LMS connection not found');
    missing.status = 404;
    throw missing;
  }
  return { ...data, links: Array.isArray((data as any).links) ? (data as any).links : [] } as SyncConnection;
}

async function fetchAssignmentsForConnection(
  connection: SyncConnection,
  token: string,
): Promise<{ assignments: LmsAssignment[]; removalSafe: boolean; discovered: LmsCourse[] }> {
  const links = connection.links.filter((link) => link.sync_enabled);
  if (!links.length) throw new Error('This LMS connection has no enabled courses.');
  const courseIds = links.map((link) => link.external_course_id);
  if (connection.provider === 'canvas' && connection.connection_method === 'calendar_feed') {
    const feed = await fetchCanvasCalendar(token);
    const selected = new Set(courseIds);
    const assignments = feed.assignments.filter((assignment) => selected.has(assignment.external_course_id));
    return {
      // Everything the feed listed, linked or not. The caller compares this
      // against the links to find courses from a term that started after this
      // connection was made — the ones that used to be discarded here without
      // a trace.
      discovered: feed.courses,
      assignments,
      // Canvas bounds feeds to 1,000 items, and an empty response can be
      // transient. Reconcile missing in-window items only from a clearly
      // complete response containing work for at least one selected course.
      removalSafe: assignments.length > 0 && feed.assignments.length < 1000,
    };
  }
  const base = safeBaseUrl(connection.base_url, connection.provider);
  let assignments: LmsAssignment[];
  if (connection.provider === 'canvas') assignments = await canvasAssignments(base, token, courseIds);
  else if (connection.provider === 'blackboard') assignments = await blackboardAssignments(base, token, courseIds);
  else if (connection.provider === 'moodle') assignments = await moodleAssignments(base, token, courseIds);
  else assignments = await googleAssignments(token, courseIds);

  // One extra listing call per sync so a token connection can notice a new
  // term too, and — for Canvas — learn the school's own name for it. Courses
  // are one bounded paginated request; assignments are not, which is why this
  // asks what exists and never what is in it.
  let discovered: LmsCourse[] = [];
  try {
    if (connection.provider === 'canvas') discovered = await canvasDiscover(base, token);
    else if (connection.provider === 'blackboard') discovered = await blackboardDiscover(base, token);
    else if (connection.provider === 'moodle') discovered = await moodleDiscover(base, token);
    else discovered = await googleDiscover(token);
  } catch {
    // Never fail a sync over this. Assignments for the courses the student
    // already chose are the job; noticing new ones is the improvement.
    discovered = [];
  }

  // Current provider pagination is bounded; no result is trusted as a complete
  // deletion feed. Imported work is therefore preserved when an API response is
  // truncated or restricted by a school.
  return { assignments: assignments.slice(0, 5000), removalSafe: false, discovered };
}

function timeZoneParts(value: string, timeZone: string): { due_date: string; due_time: string } | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
    const year = part('year');
    const month = part('month');
    const day = part('day');
    const hour = part('hour');
    const minute = part('minute');
    const second = part('second');
    return year && month && day && hour && minute && second
      ? { due_date: `${year}-${month}-${day}`, due_time: `${hour}:${minute}:${second}` }
      : null;
  } catch {
    return timeZone === 'UTC' ? null : timeZoneParts(value, 'UTC');
  }
}

function normalizeAssignments(connection: SyncConnection, assignments: LmsAssignment[], timeZone: string) {
  const localByExternal = new Map(
    connection.links.map((link) => [link.external_course_id, link.local_course_id]),
  );
  return assignments.map((item) => {
    let localDue: { due_date?: string | null; due_time?: string | null } = {};
    if (item.due_at) {
      localDue = timeZoneParts(item.due_at, timeZone) ?? {};
    }
    return { ...item, ...localDue, local_course_id: localByExternal.get(item.external_course_id) ?? null };
  });
}

async function createRun(
  admin: AdminClient,
  connection: SyncConnection,
  trigger: SyncTrigger,
) {
  const { data, error } = await admin
    .from('lms_sync_runs')
    .insert({ connection_id: connection.id, user_id: connection.user_id, trigger, status: 'running' })
    .select('id')
    .single();
  if (error || !data) throw error ?? new Error('Could not create LMS sync record.');
  return data.id as string;
}

async function performConnectionSync(
  log: EdgeLogger,
  admin: AdminClient,
  connection: SyncConnection,
  token: string,
  trigger: SyncTrigger,
  // Only the background worker knows (or cares) whether the student is still
  // around. Every interactive caller — initial, manual, foreground_auto —
  // defaults to active, so a sync a student asked for is never scheduled as if
  // they were gone.
  active = true,
) {
  const runId = await createRun(admin, connection, trigger);
  await admin.from('lms_connections').update({
    last_sync_status: 'syncing', last_error: null, last_sync_attempt_at: new Date().toISOString(),
  }).eq('id', connection.id);

  try {
    const { assignments, removalSafe, discovered } = await fetchAssignmentsForConnection(connection, token);

    // ── New-term detection ──────────────────────────────────────────────
    // Courses the provider is listing that this connection has never linked.
    // Their assignments are still not imported — nothing arrives in a
    // student's semester without them saying so — but they stop being thrown
    // away in silence. Recording them is what lets the app say "4 new Canvas
    // courses found for Spring 2027" instead of a connection that reports
    // perfect health while importing nothing for four months.
    //
    // Deliberately outside the try/catch-free path below: a failure to record
    // a question must never fail the sync that answers the existing ones.
    try {
      const linked = new Set(connection.links.map((link) => link.external_course_id));
      const unlinked = discovered.filter((course) => !linked.has(course.id));
      // Called even when the list is empty: that is how a course the student
      // has since linked, or one the provider stopped listing, gets its
      // pending row cleared and the badge count brought back to zero.
      const { error: pendingError } = await admin.rpc('record_lms_pending_courses', {
        p_connection_id: connection.id,
        p_courses: unlinked.map((course) => ({
          external_course_id: course.id,
          external_name: course.name,
          code: course.code ?? null,
          item_count: course.item_count ?? 0,
          first_due: course.first_due ?? null,
          last_due: course.last_due ?? null,
          term_name: course.term_name ?? null,
          term_start: course.term_start ?? null,
          term_end: course.term_end ?? null,
        })),
      });
      if (pendingError) log.error('pending_courses_record_failed', errorFields(pendingError));
      else if (unlinked.length) {
        log.info('pending_courses_detected', { connection_id: connection.id, count: unlinked.length });
      }
    } catch (error) {
      log.error('pending_courses_record_threw', errorFields(error));
    }
    let timeZone = 'UTC';
    if (connection.provider === 'canvas' && connection.connection_method === 'calendar_feed') {
      const { data: profile } = await admin
        .from('profiles')
        .select('timezone')
        .eq('id', connection.user_id)
        .maybeSingle();
      if (typeof profile?.timezone === 'string' && profile.timezone) timeZone = profile.timezone;
    }
    const items = normalizeAssignments(connection, assignments, timeZone);
    const { data: applied, error: applyError } = await admin.rpc('apply_lms_assignment_sync_service', {
      p_user_id: connection.user_id,
      p_connection_id: connection.id,
      p_items: items,
      p_external_course_ids: removalSafe
        ? connection.links.filter((link) => link.sync_enabled).map((link) => link.external_course_id)
        : [],
    });
    if (applyError) throw applyError;
    if (connection.provider === 'canvas' && connection.connection_method === 'calendar_feed' && removalSafe) {
      const { error: removalError } = await admin.rpc('mark_canvas_calendar_feed_removed', {
        p_user_id: connection.user_id,
        p_connection_id: connection.id,
        p_received_ids: assignments.map((assignment) => assignment.external_id),
      });
      if (removalError) throw removalError;
    }
    const processed = Number((applied as any)?.processed ?? 0);
    const skipped = Number((applied as any)?.skipped ?? 0);
    const status = skipped > 0 ? 'partial' : 'success';
    const finishedAt = new Date().toISOString();
    await Promise.all([
      admin.from('lms_sync_runs').update({ status, processed, skipped, finished_at: finishedAt }).eq('id', runId),
      admin.from('lms_connections').update({
        // A SUCCESSFUL sync used to record nothing about itself. The failure
        // branch below writes last_sync_status, but this one only touched the
        // scheduling fields — so three things were wrong at once:
        //
        //   * last_sync_status was left at the 'syncing' this run set on entry,
        //     so a connection that worked perfectly displayed "syncing" for
        //     ever on the LMS settings screen (it renders the value verbatim).
        //   * last_successful_sync_at and last_synced_at were never written by
        //     ANY code path, so the screen's "last synced" label was always
        //     blank no matter how many times it had synced.
        //   * consecutive_sync_failures only ever incremented. Nothing reset
        //     it, so nextBackgroundAttempt() kept computing the backoff from a
        //     stale count: a connection that hit five transient errors months
        //     ago and has worked ever since stayed pinned at the 24-hour
        //     maximum interval, permanently. That is the damaging one — the
        //     recovery path existed but could never be reached.
        last_sync_status: status,
        last_error: null,
        last_synced_at: finishedAt,
        last_successful_sync_at: finishedAt,
        consecutive_sync_failures: 0,
        next_background_sync_at: connection.background_sync_enabled
          ? new Date(Date.now() + nextSyncHours(connection, active) * 60 * 60 * 1000).toISOString()
          : null,
        background_sync_paused_at: null,
      }).eq('id', connection.id),
    ]);
    return { processed, skipped };
  } catch (error) {
    const code = errorCode(error);
    const message = cleanText((error as Error)?.message, 500) ?? 'LMS synchronization failed.';
    const failures = Number(connection.consecutive_sync_failures ?? 0) + 1;
    const credentialsRequired = code === 'credentials_required';
    await Promise.all([
      admin.from('lms_sync_runs').update({
        status: credentialsRequired ? 'credentials_required' : 'error',
        error_code: code,
        error_message: message,
        finished_at: new Date().toISOString(),
      }).eq('id', runId),
      admin.from('lms_connections').update({
        last_sync_status: credentialsRequired ? 'credentials_required' : 'error',
        last_error: message,
        consecutive_sync_failures: failures,
        // Authorization errors are never retried behind the student's back.
        // Temporary provider failures use capped backoff and remain visible.
        background_sync_enabled: credentialsRequired ? false : connection.background_sync_enabled,
        background_sync_paused_at: credentialsRequired ? new Date().toISOString() : null,
        next_background_sync_at: credentialsRequired
          ? null
          : connection.background_sync_enabled
            ? nextBackgroundAttempt(failures)
            : null,
      }).eq('id', connection.id),
    ]);
    // A rejected/revoked credential must not remain in the vault waiting for
    // a student to notice a status message. Remove it immediately; reconnecting
    // supplies a fresh credential and explicitly authorizes storage again.
    if (credentialsRequired && connection.background_sync_enabled) {
      const { error: revokeError } = await admin.rpc('disable_lms_background_sync', {
        p_connection_id: connection.id,
      });
      if (revokeError) log.error('could_not_remove_expired_background_credential', errorFields(revokeError));
    }
    throw error;
  }
}

async function backgroundCredential(admin: AdminClient, connectionId: string) {
  const { data, error } = await admin.rpc('read_lms_background_credential', { p_connection_id: connectionId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const token = typeof row?.access_token === 'string' ? row.access_token : '';
  if (!token) {
    const credentialError: any = new Error('Reconnect this LMS to continue automatic syncing.');
    credentialError.status = 401;
    throw credentialError;
  }
  return token;
}

async function verifyCron(req: Request, admin: AdminClient) {
  const supplied = req.headers.get('x-semora-lms-cron-secret') ?? '';
  const { data, error } = await admin.rpc('read_lms_cron_secret');
  if (error || typeof data !== 'string' || !supplied || supplied !== data) {
    const denied: any = new Error('Unauthorized scheduler');
    denied.status = 401;
    throw denied;
  }
}

serve(withRequestLogging('lms-sync', async (req, log) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const length = Number(req.headers.get('content-length'));
    if (!Number.isFinite(length) || length < 0) return json({ error: 'Content-Length required' }, 411);
    if (length > MAX_BODY_BYTES) return json({ error: 'Request too large' }, 413);
    const body = await req.json();
    const action = body?.action;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === 'background') {
      await verifyCron(req, admin);
      // Ceiling raised from 30 to 120 because the loop below is no longer
      // sequential. It stayed a clamp rather than becoming unbounded: `limit`
      // arrives in a request body, and a batch big enough to exceed the cron's
      // 120s http_post timeout would leave every connection in it stuck on
      // 'syncing' until the next run.
      const limit = Math.min(Math.max(Number(body?.limit) || 20, 1), 120);
      const { data: rows, error } = await admin
        .from('lms_connections')
        .select('*, links:lms_course_links(*)')
        .eq('sync_enabled', true)
        .eq('background_sync_enabled', true)
        .lte('next_background_sync_at', new Date().toISOString())
        // Oldest due first. Under saturation this is what stops a backlog from
        // starving anyone: the connection that has waited longest goes first,
        // rather than the queue being re-served in id order every run.
        .order('next_background_sync_at', { ascending: true })
        .limit(limit);
      if (error) throw error;

      const due = (rows ?? []).map((row) => (
        { ...row, links: (row as any).links ?? [] } as SyncConnection
      ));

      // One activity lookup for the whole batch — see activeUserIds. `null`
      // means the lookup failed, and unknown is treated as active.
      const activeIds = await activeUserIds(log, admin, [...new Set(due.map((c) => c.user_id))]);
      const isActive = (userId: string) => activeIds === null || activeIds.has(userId);

      let succeeded = 0;
      let failed = 0;
      let dormant = 0;

      const syncOne = async (connection: SyncConnection) => {
        const active = isActive(connection.user_id);
        if (!active) dormant += 1;
        try {
          await requireLmsAccess(log, admin, connection.user_id);
          await performConnectionSync(
            log, admin, connection, await backgroundCredential(admin, connection.id), 'background', active,
          );
          succeeded += 1;
        } catch (error) {
          failed += 1;
          if ((error as any)?.code === 'PRO_REQUIRED') {
            // Reachable by two routes now, and it matters which: a subscriber
            // whose Pro lapsed, or — once the canvas_free promo is switched
            // off — a free account that never claimed it. A free account that
            // DID claim it never lands here at all; lms_access_allowed keeps
            // returning true for them forever, which is the whole point of
            // stamping free_promo_claimed_at (090). Turning off an offer must
            // not reach backwards and switch off the people who took it.
            //
            // Through the RPC, not a direct update: disable_lms_background_sync
            // also DELETES the lms_sync_credentials row (whose delete trigger
            // purges the vault secrets). The previous direct update here left a
            // lapsed-Pro user's encrypted LMS token in the vault indefinitely,
            // while the privacy policy shipped with this feature says the
            // credential is deleted when automatic sync turns off.
            const { error: disableError } = await admin.rpc('disable_lms_background_sync', {
              p_connection_id: connection.id,
            });
            if (disableError) {
              log.error('disable_lapsed_pro_connection_failed', { connection_id: connection.id, message: disableError.message });
            } else {
              // The RPC covers the sync flags; record WHY it was paused so the
              // settings screen can explain rather than showing a bare error.
              await admin.from('lms_connections').update({
                last_sync_status: 'error',
                last_error: 'Automatic LMS sync is available with Semora Pro.',
              }).eq('id', connection.id);
            }
          }
          log.error('background_connection_failed', { connection_id: connection.id, message: (error as Error)?.message ?? null });
        }
      };

      // BOUNDED CONCURRENCY, and the reason the batch limit could be raised.
      //
      // The loop used to be sequential. Measured over a week of production, a
      // sync takes p50 1.9s / p95 5.3s, so a batch of 20 already ran ~106s
      // against the cron's 120s timeout — the limit was pinned not by database
      // load but by wall-clock, and raising it would have bought timeouts
      // rather than throughput. Each sync is one HTTPS fetch of a feed plus a
      // handful of round trips, so it is almost entirely waiting.
      //
      // Six at a time, not more: every worker shares one Postgres connection
      // pool and the institution feeds deserve to not be hit in a burst. Six
      // takes a p95 batch of 60 from ~318s to ~53s, comfortably inside the
      // timeout with room for the 20s outliers that do occur.
      const CONCURRENCY = 6;
      const queue = [...due];
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
          for (let next = queue.shift(); next; next = queue.shift()) {
            // Never rejects — syncOne owns its own try/catch, so one bad
            // connection cannot cancel the rest of the batch.
            await syncOne(next);
          }
        }),
      );

      return json({ processed_connections: due.length, succeeded, failed, dormant });
    }

    const user = await requireUser(req);
    await requireLmsAccess(log, admin, user.id);
    const provider = body?.provider as Provider;
    const token = typeof body?.access_token === 'string' ? body.access_token.trim() : '';

    if (action === 'discover') {
      if (!validProvider(provider)) return json({ error: 'Unsupported LMS provider' }, 400);
      if (!token || token.length > 8192) return json({ error: 'A valid LMS access token is required' }, 400);
      const base = safeBaseUrl(body?.base_url, provider);
      let courses: LmsCourse[];
      if (provider === 'canvas' && body?.connection_method === 'calendar_feed') {
        const feed = await fetchCanvasCalendar(token);
        courses = feed.courses;
      } else if (provider === 'canvas') courses = await canvasDiscover(base, token);
      else if (provider === 'blackboard') courses = await blackboardDiscover(base, token);
      else if (provider === 'moodle') courses = await moodleDiscover(base, token);
      else courses = await googleDiscover(token);
      return json({ courses: courses.slice(0, 500) });
    }

    const connectionId = typeof body?.connection_id === 'string' ? body.connection_id : '';
    if (!connectionId) return json({ error: 'LMS connection is required' }, 400);
    const connection = await loadConnection(admin, connectionId, user.id);

    if (action === 'sync') {
      const syncToken = token || await backgroundCredential(admin, connection.id);
      const trigger: SyncTrigger = body?.trigger === 'foreground_auto' ? 'foreground_auto' : body?.trigger === 'initial' ? 'initial' : 'manual';
      const result = await performConnectionSync(log, admin, connection, syncToken, trigger);
      return json(result);
    }

    if (action === 'enable_background') {
      if (!token || token.length > 8192) return json({ error: 'Reconnect this LMS before enabling automatic sync.' }, 400);
      const { error } = await admin.rpc('store_lms_background_credential', {
        p_connection_id: connection.id,
        p_access_token: token,
        p_refresh_token: typeof body?.refresh_token === 'string' ? body.refresh_token : null,
        p_expires_at: typeof body?.expires_at === 'string' ? body.expires_at : null,
      });
      if (error) throw error;
      return json({ enabled: true });
    }

    if (action === 'disable_background') {
      const { error } = await admin.rpc('disable_lms_background_sync', { p_connection_id: connection.id });
      if (error) throw error;
      return json({ enabled: false });
    }

    return json({ error: 'Invalid action' }, 400);
  } catch (error) {
    const status = Number((error as any)?.status);
    const message = cleanText((error as Error)?.message, 500) ?? 'LMS synchronization failed.';
    const code = (error as any)?.code ?? (status === 401 || status === 403 ? 'credentials_required' : undefined);
    if (status === 401 || status === 403) return json({ error: message, code }, 401);
    if (status === 402) return json({ error: message, code: 'PRO_REQUIRED' }, 402);
    if (status === 503) return json({ error: message }, 503);
    log.error('request_failed', errorFields(message));
    return json({ error: message, code }, status >= 400 && status < 500 ? status : 400);
  }
}));
