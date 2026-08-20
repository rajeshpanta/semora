import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { withRequestLogging, errorFields, type EdgeLogger } from '../_shared/log.ts';

// Google Calendar one-way sync endpoint (Pro). Structured on
// parse-syllabus/index.ts + tutor-chat/index.ts (CORS, JWT verification of
// the caller, service-role admin client, server-side Pro gate, error
// logging). Complements the device/EventKit sync in lib/calendarSync.ts and
// the .ics export — this pushes the user's incomplete tasks (and optionally
// class meetings) into a dedicated "Semora" calendar in their GOOGLE account,
// via the Google Calendar REST API.
//
// Actions (POST { action, ... }):
//   * 'connect'    — exchange the GoogleSignin serverAuthCode for access +
//                    refresh tokens, store them (service-role only, secrets),
//                    create/find the "Semora" Google calendar, then run an
//                    initial sync.
//   * 'sync'       — refresh the access token if expired, push all incomplete
//                    tasks of the semester as events (upsert by the
//                    task→event map), delete events for tasks no longer in the
//                    set. Optionally class meetings as recurring events.
//   * 'disconnect' — mark sync disabled and clear the stored tokens (best
//                    effort: also revoke the refresh token with Google).
//
// Token secrecy: google_calendar_tokens has NO client RLS access — only this
// function (service role) reads/writes it. The client never sees a token.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// OAuth client used for the serverAuthCode → token exchange and refreshes.
// This is the WEB OAuth client (the same client id GoogleSignin is configured
// with as webClientId, so the code it mints exchanges against this client),
// plus its secret. The secret is a server-only credential — set it in the
// edge function's env (supabase secrets set GOOGLE_OAUTH_CLIENT_SECRET=...),
// NEVER in the app bundle.
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const CAL_API = 'https://www.googleapis.com/calendar/v3';

// The Semora Google calendar's title + description. summary is the visible
// name; we match on it when finding an already-created calendar so a
// reconnect adopts the existing one instead of creating a second.
const SEMORA_CAL_SUMMARY = 'Semora';
const SEMORA_CAL_DESCRIPTION = 'Deadlines and classes synced from Semora.';

// Bound how many tasks/meetings we push per sync — a coarse cost/latency
// ceiling. A semester never has this many graded items.
const MAX_TASKS = 300;
const MAX_MEETINGS = 60;

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

type AdminClient = ReturnType<typeof createClient>;

interface TokenRow {
  user_id: string;
  refresh_token: string | null;
  access_token: string | null;
  expires_at: string | null;
  google_calendar_id: string | null;
  sync_enabled: boolean;
}

// Raised when Google reports the grant is gone (refresh token revoked by the
// user in their Google account, or the app's access removed). Callers catch
// this to mark the connection disconnected instead of surfacing a hard error.
class RevokedError extends Error {}

// ── Google OAuth ────────────────────────────────────────────

// Exchange the GoogleSignin serverAuthCode for access + refresh tokens.
// offlineAccess:true on the client is what makes Google return a refresh
// token here (the app requested offline server access). redirect_uri is empty
// for the installed-app/serverAuthCode flow.
async function exchangeAuthCode(log: EdgeLogger, authCode: string): Promise<{
  access_token: string;
  refresh_token: string | null;
  expires_in: number;
}> {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: authCode,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: '',
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    log.error('auth_code_exchange_failed', { status: resp.status, provider_error: JSON.stringify(data).slice(0, 300) });
    throw new Error('Could not connect your Google account. Please try again.');
  }
  return {
    access_token: data.access_token,
    // Google only returns a refresh_token the first time a user grants offline
    // access for this client. A reconnect may return none — the caller keeps
    // the previously stored one in that case.
    refresh_token: data.refresh_token ?? null,
    expires_in: typeof data.expires_in === 'number' ? data.expires_in : 3600,
  };
}

// Refresh an expired access token from the stored refresh token. A Google
// 'invalid_grant' means the refresh token was revoked — surface it as
// RevokedError so the caller can mark the connection dead rather than retry.
async function refreshAccessToken(log: EdgeLogger, refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const resp = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (data?.error === 'invalid_grant') {
      throw new RevokedError('Google access was revoked.');
    }
    log.error('token_refresh_failed', { status: resp.status, provider_error: JSON.stringify(data).slice(0, 300) });
    throw new Error('Could not refresh Google access. Please reconnect.');
  }
  return {
    access_token: data.access_token,
    expires_in: typeof data.expires_in === 'number' ? data.expires_in : 3600,
  };
}

// Best-effort revoke on disconnect so Semora's grant disappears from the
// user's Google "third-party access" list. Failure is non-fatal — we clear
// local tokens regardless.
async function revokeToken(log: EdgeLogger, token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }),
    });
  } catch (e) {
    log.warn('token_revoke_failed', errorFields(e));
  }
}

// Return a VALID access token for the user, refreshing + persisting when the
// cached one is expired (or within a 60s skew). Throws RevokedError if the
// grant is gone.
async function getValidAccessToken(log: EdgeLogger, admin: AdminClient, row: TokenRow): Promise<string> {
  const now = Date.now();
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (row.access_token && exp - 60_000 > now) {
    return row.access_token;
  }
  if (!row.refresh_token) {
    throw new RevokedError('No refresh token stored.');
  }
  const refreshed = await refreshAccessToken(log, row.refresh_token);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await admin
    .from('google_calendar_tokens')
    .update({ access_token: refreshed.access_token, expires_at: expiresAt })
    .eq('user_id', row.user_id);
  return refreshed.access_token;
}

// ── Google Calendar REST helpers ────────────────────────────

// Thin fetch wrapper: adds the Bearer token, parses JSON, and maps a 401 to
// RevokedError (an expired/revoked access token that a refresh couldn't fix).
async function calFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const resp = await fetch(`${CAL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (resp.status === 401) {
    throw new RevokedError('Google rejected the access token.');
  }
  const text = await resp.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!resp.ok) {
    const err: any = new Error(data?.error?.message ?? `Google Calendar API error ${resp.status}`);
    err.status = resp.status;
    err.googleError = data?.error;
    throw err;
  }
  return data;
}

// Find the existing "Semora" calendar (owner access) or create it. Reuses a
// stored id when it still exists so reconnects don't spawn duplicates —
// mirrors getOrCreateCalendar's adopt logic in lib/calendarSync.ts.
async function getOrCreateSemoraCalendar(
  log: EdgeLogger,
  accessToken: string,
  storedId: string | null,
): Promise<string> {
  // Verify a stored id still points at a live calendar we own.
  if (storedId) {
    try {
      const cal = await calFetch(accessToken, `/calendars/${encodeURIComponent(storedId)}`);
      if (cal?.id) return cal.id;
    } catch (e) {
      if (e instanceof RevokedError) throw e;
      // 404/410 — stored calendar was deleted in Google; fall through to
      // find/create a fresh one.
    }
  }

  // Adopt an already-created Semora calendar (owner access) if present.
  try {
    const list = await calFetch(accessToken, '/users/me/calendarList?minAccessRole=owner&maxResults=250');
    const items: any[] = Array.isArray(list?.items) ? list.items : [];
    const existing = items.find((c) => c.summary === SEMORA_CAL_SUMMARY);
    if (existing?.id) return existing.id;
  } catch (e) {
    if (e instanceof RevokedError) throw e;
    log.warn('calendarlist_lookup_failed', errorFields(e));
  }

  const created = await calFetch(accessToken, '/calendars', {
    method: 'POST',
    body: JSON.stringify({
      summary: SEMORA_CAL_SUMMARY,
      description: SEMORA_CAL_DESCRIPTION,
    }),
  });
  if (!created?.id) throw new Error('Could not create the Semora calendar in Google.');
  return created.id;
}

// ── Event shaping (mirrors lib/calendarSync.ts semantics) ───

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const RRULE_DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// The Google event body for a task. Timed tasks get a 1h timed event with a
// 60-min-before popup reminder; dateless-time tasks become all-day with a
// 9:00 reminder — same policy as syncTaskToCalendar in lib/calendarSync.ts.
// Uses `date`/`dateTime` with an explicit timeZone so Google places the event
// at the intended wall-clock time regardless of the calendar's default zone.
function taskEventBody(task: any, courseName: string, timeZone: string): Record<string, any> {
  const title = `${task.title} — ${courseName}`;
  const [y, m, d] = String(task.due_date).split('-').map(Number);
  const pad = (n: number) => String(n).padStart(2, '0');

  if (task.due_time) {
    const [h, min] = String(task.due_time).split(':').map(Number);
    const startLocal = `${y}-${pad(m)}-${pad(d)}T${pad(h)}:${pad(min)}:00`;
    // +1h end.
    const endDate = new Date(y, m - 1, d, h, min);
    endDate.setHours(endDate.getHours() + 1);
    const endLocal = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:00`;
    return {
      summary: title,
      description: task.description || undefined,
      start: { dateTime: startLocal, timeZone },
      end: { dateTime: endLocal, timeZone },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] },
    };
  }

  // All-day: Google's end.date is EXCLUSIVE, so end = next day.
  const start = `${y}-${pad(m)}-${pad(d)}`;
  const endDt = new Date(y, m - 1, d + 1);
  const end = `${endDt.getFullYear()}-${pad(endDt.getMonth() + 1)}-${pad(endDt.getDate())}`;
  return {
    summary: title,
    description: task.description || undefined,
    start: { date: start },
    end: { date: end },
    // -540 min before start = 9:00 AM the day of (all-day events anchor at
    // midnight); mirrors the +540 relativeOffset on the EventKit side.
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: -540 }] },
  };
}

// ── Task sync ───────────────────────────────────────────────

// Push every incomplete task of the semester into the Semora Google calendar,
// upserting by the task→event map, and prune events for tasks no longer in
// the set. Returns the number of events created/updated.
async function syncTasks(
  log: EdgeLogger,
  admin: AdminClient,
  accessToken: string,
  calendarId: string,
  userId: string,
  semesterId: string,
  timeZone: string,
): Promise<number> {
  const { data: tasks, error } = await admin
    .from('tasks')
    .select('id, title, description, due_date, due_time, courses!inner(name, semester_id)')
    .eq('user_id', userId)
    .eq('courses.semester_id', semesterId)
    .eq('is_completed', false)
    .order('due_date')
    .limit(MAX_TASKS);
  if (error) {
    log.error('task_load_failed', errorFields(error));
    throw new Error('Could not load your tasks — please try again.');
  }
  const rows = tasks ?? [];

  // Existing map for this user (task_id → google_event_id + row id).
  const { data: mapRows } = await admin
    .from('task_google_event_map')
    .select('id, task_id, google_event_id')
    .eq('user_id', userId);
  const existing = new Map<string, { id: string; google_event_id: string }>();
  for (const r of mapRows ?? []) {
    existing.set((r as any).task_id, { id: (r as any).id, google_event_id: (r as any).google_event_id });
  }

  let count = 0;
  const liveTaskIds = new Set<string>();

  for (const task of rows as any[]) {
    liveTaskIds.add(task.id);
    const body = taskEventBody(task, task.courses.name, timeZone);
    const mapped = existing.get(task.id);

    if (mapped) {
      // Update in place. If the user deleted the event in Google (404/410),
      // recreate and rewrite the mapping — same fallback as the EventKit side.
      try {
        await calFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(mapped.google_event_id)}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        count++;
        continue;
      } catch (e: any) {
        if (e instanceof RevokedError) throw e;
        if (e?.status !== 404 && e?.status !== 410) {
          log.warn('task_event_update_failed', errorFields(e));
          continue;
        }
        // fall through to create
      }
    }

    try {
      const created = await calFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (created?.id) {
        await admin
          .from('task_google_event_map')
          .upsert(
            { user_id: userId, task_id: task.id, google_event_id: created.id },
            { onConflict: 'user_id,task_id' },
          );
        count++;
      }
    } catch (e) {
      if (e instanceof RevokedError) throw e;
      log.warn('task_event_create_failed', errorFields(e));
    }
  }

  // Prune: delete Google events + map rows for tasks no longer live (completed
  // elsewhere, deleted, or moved out of this semester). Mirrors syncAllTasks'
  // prune in lib/calendarSync.ts.
  for (const [taskId, mapped] of existing.entries()) {
    if (liveTaskIds.has(taskId)) continue;
    try {
      await calFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(mapped.google_event_id)}`, {
        method: 'DELETE',
      });
    } catch (e: any) {
      if (e instanceof RevokedError) throw e;
      // 404/410 → already gone; any other error we still drop the map row so
      // it doesn't wedge future syncs (the event, if any, is orphaned in
      // Google — the user can delete it, same trade-off as the EventKit side).
      if (e?.status !== 404 && e?.status !== 410) {
        log.warn('task_event_delete_failed', errorFields(e));
      }
    }
    await admin.from('task_google_event_map').delete().eq('id', mapped.id);
  }

  return count;
}

// ── Class-meeting sync (optional) ───────────────────────────

// Push class meetings as weekly-recurring Google events until the semester
// ends. Simpler than the EventKit idempotent-series logic: we key events by a
// deterministic extendedProperties.private tag (meetingId + weekday) so a
// re-sync finds and replaces its own events without a local map. Best effort —
// returns the count created; failures are logged and skipped.
async function syncMeetings(
  log: EdgeLogger,
  admin: AdminClient,
  accessToken: string,
  calendarId: string,
  userId: string,
  semesterId: string,
  timeZone: string,
): Promise<number> {
  const [{ data: sem }, { data: meetings, error }] = await Promise.all([
    admin.from('semesters').select('end_date').eq('id', semesterId).eq('user_id', userId).maybeSingle(),
    admin
      .from('course_meetings')
      .select('id, days_of_week, start_time, end_time, location, kind, courses!inner(name, semester_id)')
      .eq('user_id', userId)
      .eq('courses.semester_id', semesterId)
      .limit(MAX_MEETINGS),
  ]);
  if (error) {
    log.warn('meeting_load_failed', errorFields(error));
    return 0;
  }
  const rows = meetings ?? [];
  if (rows.length === 0) return 0;

  // Recurrence bound: semester end at 23:59:59, or ~16 weeks out when absent
  // (mirrors semesterEndOrDefault). UNTIL is a UTC timestamp (Z) per RFC 5545.
  const until = (() => {
    const raw = (sem as any)?.end_date as string | null | undefined;
    let d: Date;
    if (raw) {
      const [y, m, dd] = raw.split('-').map(Number);
      d = new Date(Date.UTC(y, m - 1, dd, 23, 59, 59));
    } else {
      d = new Date();
      d.setUTCDate(d.getUTCDate() + 7 * 16);
    }
    return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  })();

  const pad = (n: number) => String(n).padStart(2, '0');
  // First date on/after today that falls on `weekday`, as a local Y-M-D.
  function firstOnOrAfter(weekday: number): { y: number; m: number; d: number } {
    const now = new Date();
    const delta = (weekday - now.getDay() + 7) % 7;
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta);
    return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  }

  let count = 0;
  for (const meeting of rows as any[]) {
    if (!meeting.start_time) continue; // no clock position — nothing to place
    const title = meetingTitle(meeting.courses.name, meeting.kind);
    const tag = `semora_meeting_${meeting.id}`;

    // Delete this meeting's previous events (found by the private tag) so a
    // re-sync replaces rather than duplicates. privateExtendedProperty filters
    // events created with that tag.
    try {
      const found = await calFetch(
        accessToken,
        `/calendars/${encodeURIComponent(calendarId)}/events?privateExtendedProperty=${encodeURIComponent('semoraMeeting=' + meeting.id)}&maxResults=250&showDeleted=false`,
      );
      for (const ev of (found?.items ?? []) as any[]) {
        try {
          await calFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(ev.id)}`, { method: 'DELETE' });
        } catch (e: any) {
          if (e instanceof RevokedError) throw e;
        }
      }
    } catch (e) {
      if (e instanceof RevokedError) throw e;
      // Non-fatal — worst case is a duplicate the user can remove.
    }

    const [sh, sm] = String(meeting.start_time).split(':').map(Number);
    const [eh, em] = meeting.end_time
      ? String(meeting.end_time).split(':').map(Number)
      : [sh + 1, sm]; // no end time — assume ~1h block (matches EventKit side)

    for (const weekday of (meeting.days_of_week ?? []) as number[]) {
      const { y, m, d } = firstOnOrAfter(weekday);
      const startLocal = `${y}-${pad(m)}-${pad(d)}T${pad(sh)}:${pad(sm)}:00`;
      const endLocal = `${y}-${pad(m)}-${pad(d)}T${pad(eh)}:${pad(em)}:00`;
      try {
        await calFetch(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
          method: 'POST',
          body: JSON.stringify({
            summary: title,
            location: meeting.location || undefined,
            start: { dateTime: startLocal, timeZone },
            end: { dateTime: endLocal, timeZone },
            recurrence: [`RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DOW[weekday]};UNTIL=${until}`],
            // No reminders on class events — an alert before every class is noise.
            reminders: { useDefault: false, overrides: [] },
            extendedProperties: { private: { semoraMeeting: String(meeting.id) } },
          }),
        });
        count++;
      } catch (e) {
        if (e instanceof RevokedError) throw e;
        log.warn('meeting_event_create_failed', errorFields(e));
      }
    }
  }
  return count;
}

// Display title mirrors meetingEventTitle in lib/calendarSync.ts.
function meetingTitle(courseName: string, kind: string): string {
  if (kind === 'lab') return `${courseName} — Lab`;
  if (kind === 'discussion') return `${courseName} — Discussion`;
  return courseName;
}

// Mark the connection disconnected (tokens cleared) — used both on explicit
// disconnect and on graceful revocation handling. Keeps the row so the map's
// FK stays valid and a later reconnect updates in place.
async function markDisconnected(log: EdgeLogger, admin: AdminClient, userId: string): Promise<void> {
  await admin
    .from('google_calendar_tokens')
    .update({ sync_enabled: false, refresh_token: null, access_token: null, expires_at: null })
    .eq('user_id', userId);
}

// ── Handler ─────────────────────────────────────────────────

serve(withRequestLogging('google-cal-sync', async (req, log) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Small body (an action + a few ids/a code). Require Content-Length so a
    // chunked stream can't bypass the cap (same guard as the other functions).
    const MAX_BODY_BYTES = 64 * 1024;
    const contentLengthRaw = req.headers.get('content-length');
    if (!contentLengthRaw) {
      return jsonResponse({ error: 'Content-Length required' }, 411);
    }
    const contentLength = parseInt(contentLengthRaw, 10);
    if (!Number.isFinite(contentLength) || contentLength < 0) {
      return jsonResponse({ error: 'Invalid Content-Length' }, 400);
    }
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request too large' }, 413);
    }

    // 1. Validate JWT against Supabase auth.
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

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      log.error('google_oauth_client_not_configured_on_server');
      return jsonResponse({ error: 'Google Calendar is not configured on the server.' }, 500);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. Pro gate (server-side). Same is_pro RPC + fail-closed-transient policy
    //    as tutor-chat. Google Calendar sync is a Pro feature.
    const { data: proResult, error: proErr } = await admin.rpc('is_pro', { uid: userId });
    if (proErr) {
      log.error('is_pro_check_failed', errorFields(proErr));
      return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
    }
    if (proResult !== true) {
      return jsonResponse(
        { error: 'Google Calendar sync is a Pro feature. Upgrade to Pro to connect your calendar.', code: 'PRO_REQUIRED' },
        402,
      );
    }

    // 3. Parse body.
    let body: { action?: unknown; serverAuthCode?: unknown; semesterId?: unknown; includeMeetings?: unknown; timeZone?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }
    const action = typeof body.action === 'string' ? body.action : '';
    const semesterId = typeof body.semesterId === 'string' ? body.semesterId : null;
    const includeMeetings = body.includeMeetings === true;
    // The device's IANA zone (e.g. "America/New_York") so timed events land at
    // the right wall-clock. Fall back to UTC if the client didn't send one.
    const timeZone = typeof body.timeZone === 'string' && body.timeZone ? body.timeZone : 'UTC';

    // ── connect ──────────────────────────────────────────────
    if (action === 'connect') {
      const serverAuthCode = typeof body.serverAuthCode === 'string' ? body.serverAuthCode : '';
      if (!serverAuthCode) {
        return jsonResponse({ error: 'Missing authorization code' }, 400);
      }

      let tokens;
      try {
        tokens = await exchangeAuthCode(log, serverAuthCode);
      } catch (e: any) {
        return jsonResponse({ error: e?.message ?? 'Could not connect your Google account.' }, 502);
      }
      if (!tokens.access_token) {
        return jsonResponse({ error: 'Google did not return an access token. Please try again.' }, 502);
      }

      // Provision (or adopt) the Semora calendar.
      let calendarId: string;
      try {
        calendarId = await getOrCreateSemoraCalendar(log, tokens.access_token, null);
      } catch (e) {
        if (e instanceof RevokedError) {
          return jsonResponse({ error: 'Google access was not granted. Please reconnect and allow calendar access.' }, 502);
        }
        log.error('calendar_provisioning_failed', errorFields(e));
        return jsonResponse({ error: 'Could not set up your Google calendar. Please try again.' }, 502);
      }

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      // Upsert the token row. A reconnect that returns no new refresh_token
      // must NOT null the stored one — only overwrite when present.
      const upsertRow: Record<string, any> = {
        user_id: userId,
        access_token: tokens.access_token,
        expires_at: expiresAt,
        google_calendar_id: calendarId,
        sync_enabled: true,
      };
      if (tokens.refresh_token) upsertRow.refresh_token = tokens.refresh_token;
      const { error: upErr } = await admin
        .from('google_calendar_tokens')
        .upsert(upsertRow, { onConflict: 'user_id' });
      if (upErr) {
        log.error('token_upsert_failed', errorFields(upErr));
        return jsonResponse({ error: 'Could not save your Google connection. Please try again.' }, 500);
      }

      // Initial sync (best effort — connection is already saved).
      let taskCount = 0;
      let meetingCount = 0;
      try {
        if (semesterId) {
          taskCount = await syncTasks(log, admin, tokens.access_token, calendarId, userId, semesterId, timeZone);
          if (includeMeetings) {
            meetingCount = await syncMeetings(log, admin, tokens.access_token, calendarId, userId, semesterId, timeZone);
          }
        }
      } catch (e) {
        if (e instanceof RevokedError) {
          await markDisconnected(log, admin, userId);
          return jsonResponse({ error: 'Google access was revoked. Please reconnect.', code: 'REVOKED' }, 409);
        }
        log.warn('initial_sync_failed', errorFields(e));
      }

      return jsonResponse({ connected: true, taskCount, meetingCount }, 200);
    }

    // ── sync ─────────────────────────────────────────────────
    if (action === 'sync') {
      const { data: row, error: rowErr } = await admin
        .from('google_calendar_tokens')
        .select('user_id, refresh_token, access_token, expires_at, google_calendar_id, sync_enabled')
        .eq('user_id', userId)
        .maybeSingle();
      if (rowErr) {
        log.error('token_row_load_failed', errorFields(rowErr));
        return jsonResponse({ error: 'Service temporarily unavailable' }, 503);
      }
      if (!row || !(row as any).sync_enabled || !(row as any).refresh_token) {
        return jsonResponse({ error: 'Google Calendar is not connected.', code: 'NOT_CONNECTED' }, 409);
      }
      if (!semesterId) {
        return jsonResponse({ error: 'No semester selected.' }, 400);
      }

      try {
        const accessToken = await getValidAccessToken(log, admin, row as TokenRow);
        const calendarId = await getOrCreateSemoraCalendar(log, accessToken, (row as any).google_calendar_id);
        // Persist a (possibly) newly (re)created calendar id.
        if (calendarId !== (row as any).google_calendar_id) {
          await admin.from('google_calendar_tokens').update({ google_calendar_id: calendarId }).eq('user_id', userId);
        }
        const taskCount = await syncTasks(log, admin, accessToken, calendarId, userId, semesterId, timeZone);
        let meetingCount = 0;
        if (includeMeetings) {
          meetingCount = await syncMeetings(log, admin, accessToken, calendarId, userId, semesterId, timeZone);
        }
        return jsonResponse({ synced: true, taskCount, meetingCount }, 200);
      } catch (e) {
        if (e instanceof RevokedError) {
          await markDisconnected(log, admin, userId);
          return jsonResponse({ error: 'Google access was revoked. Please reconnect.', code: 'REVOKED' }, 409);
        }
        log.error('sync_failed', errorFields(e));
        return jsonResponse({ error: 'Could not sync to Google Calendar. Please try again.' }, 502);
      }
    }

    // ── disconnect ───────────────────────────────────────────
    if (action === 'disconnect') {
      const { data: row } = await admin
        .from('google_calendar_tokens')
        .select('refresh_token')
        .eq('user_id', userId)
        .maybeSingle();
      // Best-effort revoke so Semora leaves the user's Google access list.
      const rt = (row as any)?.refresh_token;
      if (rt) await revokeToken(log, rt);
      await markDisconnected(log, admin, userId);
      // Clear the map so a future reconnect starts clean (events were in the
      // Google calendar the user may keep or delete — we don't delete their
      // calendar on disconnect, matching the "don't destroy calendar data"
      // stance in lib/calendarSync.ts).
      await admin.from('task_google_event_map').delete().eq('user_id', userId);
      return jsonResponse({ disconnected: true }, 200);
    }

    return jsonResponse({ error: 'Unknown action' }, 400);
  } catch (err) {
    log.error('handler_error', errorFields(err));
    return jsonResponse({ error: 'An unexpected error occurred. Please try again.' }, 500);
  }
}));
