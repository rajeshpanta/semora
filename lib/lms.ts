import { Platform } from 'react-native';
import * as Localization from 'expo-localization';
import { supabase } from '@/lib/supabase';
import type { CourseFacts } from '@/lib/termMatch';
import {
  getGoogleClassroomAccessToken,
  refreshGoogleClassroomAccessToken,
} from '@/lib/auth';
import { reconcileTaskReminders, rescheduleAllTaskReminders } from '@/lib/notifications';
import {
  readLmsCredential,
  removeLmsCredential,
  storeLmsCredential,
} from '@/lib/lmsCredentialStore';
import type {
  LmsConnection,
  LmsConnectionMethod,
  LmsCourseLink,
  LmsPendingCourse,
  LmsProvider,
} from '@/types/database';

// The promotion's decision logic lives in lib/canvasPromo.ts, which imports
// nothing — this module reaches supabase and the notification scheduler at
// import time, so nothing defined here can be unit-tested. Re-exported rather
// than re-implemented: every existing call site keeps importing these from
// '@/lib/lms', and there is still exactly one definition of each.
export {
  CANVAS_PROMO_SOURCE,
  CANVAS_SOURCE_DEFAULT,
  canvasSourceOf,
  lmsFailureCode,
  canvasFreeFor,
  canvasOfferFor,
  canvasPromoPlacementFor,
} from '@/lib/canvasPromo';
export type { CanvasOffer, CanvasConnectionFacts } from '@/lib/canvasPromo';
import { PRO_CANVAS_EDU_FLAG_KEY } from '@/lib/proCanvasEducation';

export interface DiscoveredLmsCourse {
  id: string;
  name: string;
  code?: string;
  instructor?: string;
  /**
   * What the provider told us about this course's dated work. Present for
   * Canvas calendar feeds (parsed in full at discovery) and absent for the
   * token providers, which list courses without their assignments.
   *
   * This is the evidence lib/termMatch.ts uses to propose a semester. Before
   * it existed, imports were filed under whichever semester was selected in
   * the app — which put a real student's Fall term inside their Summer one.
   */
  item_count?: number | null;
  first_due?: string | null;
  last_due?: string | null;
  /** Canvas's own enrollment term, from the API. Authoritative when present. */
  term_name?: string | null;
  term_start?: string | null;
  term_end?: string | null;
}

/** Adapt a discovered course to the shape lib/termMatch.ts reasons about. */
export function courseFactsOf(course: DiscoveredLmsCourse): CourseFacts {
  return {
    id: course.id,
    name: course.name,
    code: course.code,
    itemCount: course.item_count ?? null,
    firstDue: course.first_due ?? null,
    lastDue: course.last_due ?? null,
    termName: course.term_name ?? null,
    termStart: course.term_start ?? null,
    termEnd: course.term_end ?? null,
  };
}

interface LmsAssignment {
  external_id: string;
  external_course_id: string;
  title: string;
  description?: string | null;
  type?: string;
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
}

export interface LmsCredential {
  accessToken: string;
  accountLabel?: string | null;
  /** Present when an OAuth provider gives Semora a renewable server credential. */
  refreshToken?: string | null;
  expiresAt?: string | null;
}

export interface LmsSyncRun {
  id: string;
  connection_id: string;
  user_id: string;
  trigger: 'initial' | 'manual' | 'foreground_auto' | 'background';
  status: 'running' | 'success' | 'partial' | 'error' | 'credentials_required';
  processed: number;
  skipped: number;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

const COLORS = ['#4F46E5', '#0F766E', '#C2410C', '#9333EA', '#0369A1', '#BE123C'];
export const LMS_PROVIDER_LABELS: Record<LmsProvider, string> = {
  canvas: 'Canvas',
  blackboard: 'Blackboard',
  moodle: 'Moodle',
  google_classroom: 'Google Classroom',
};

/** Canvas exposes webcal://, while Edge fetch supports HTTPS. Keep the feed
 * secret out of logs and reject anything except Canvas's user feed path. */
// Moved to lib/canvasFeedUrl.ts, which is import-free and therefore testable
// under Deno. Re-exported here so every existing caller keeps working.
export {
  normalizeCanvasCalendarFeedUrl,
  canvasCalendarOrigin,
  describeCanvasFeedInput,
  extractCanvasFeedCandidate,
  CANVAS_FEED_HINTS,
  type CanvasFeedVerdict,
  type CanvasFeedProblem,
} from '@/lib/canvasFeedUrl';

export async function getLmsCredential(connectionId: string): Promise<LmsCredential | null> {
  return readLmsCredential(connectionId);
}

async function invokeLms<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('lms-sync', { body });
  if (error) {
    let message = error.message || 'The LMS could not be reached.';
    try {
      const response = (error as any).context as Response | undefined;
      const payload = response ? await response.clone().json() : null;
      if (typeof payload?.error === 'string') message = payload.error;
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function requestGoogleClassroomCredential(): Promise<LmsCredential> {
  const result = await getGoogleClassroomAccessToken();
  return { accessToken: result.accessToken, accountLabel: result.accountLabel };
}

export async function discoverLmsCourses(input: {
  provider: LmsProvider;
  connectionMethod?: LmsConnectionMethod;
  baseUrl?: string | null;
  credential: LmsCredential;
}): Promise<DiscoveredLmsCourse[]> {
  const data = await invokeLms<{ courses: DiscoveredLmsCourse[] }>({
    action: 'discover',
    provider: input.provider,
    connection_method: input.connectionMethod ?? 'legacy_token',
    base_url: input.baseUrl ?? null,
    access_token: input.credential.accessToken,
  });
  return Array.isArray(data.courses) ? data.courses : [];
}

export async function listLmsConnections(): Promise<
  (LmsConnection & { links: LmsCourseLink[] })[]
> {
  const { data, error } = await supabase
    .from('lms_connections')
    .select('*, links:lms_course_links(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ ...row, links: row.links ?? [] }));
}

/**
 * Guarantee the account has a timezone before an LMS connection depends on it.
 *
 * Reads first and only writes when the column is empty, so a student who has
 * deliberately set a timezone (or is travelling) is never overwritten by the
 * device's current one. Every failure is swallowed: the worst case is the
 * status quo, and the best case is a deadline that lands on the right day.
 */
async function ensureProfileTimezone(userId: string): Promise<void> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('timezone')
      .eq('id', userId)
      .maybeSingle();
    if (profile?.timezone) return;

    const detected = Platform.OS === 'web'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : Localization.getCalendars()[0]?.timeZone
        ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detected) return;

    await supabase.from('profiles').upsert({ id: userId, timezone: detected });
  } catch {
    // Never block a connection on this.
  }
}

export async function connectLms(input: {
  userId: string;
  semesterId: string;
  provider: LmsProvider;
  connectionMethod?: LmsConnectionMethod;
  displayName: string;
  baseUrl?: string | null;
  credential: LmsCredential;
  courses: DiscoveredLmsCourse[];
  /**
   * Courses that were discovered and deliberately NOT ticked.
   *
   * Recorded as already-dismissed so the initial sync — which now reports
   * every unlinked course it sees — does not immediately hand them back as
   * "new courses found". A choice the student just made must not reappear as
   * a notification thirty seconds later.
   */
  declined?: DiscoveredLmsCourse[];
  /**
   * external_course_id -> an EXISTING local course to attach it to.
   *
   * Present only for selections the student explicitly chose to link (see
   * components/CourseLinkChoiceSheet). Anything absent behaves exactly as
   * before: a new course is created. Linking writes nothing to the existing
   * course — not its name, colour, source, semester or settings — it only adds
   * the lms_course_links row that makes the next sync deliver Canvas items
   * into it.
   */
  linkTo?: Record<string, string>;
}): Promise<{ connectionId: string; processed: number; skipped: number }> {
  if (!input.courses.length) throw new Error('Select at least one course to import.');

  // A profile timezone is a precondition for correct Canvas due dates, not a
  // preference. lms-sync converts every `due_at` into local wall-clock time
  // with `profiles.timezone`, and falls back to UTC when it is missing — which
  // for anyone west of Greenwich moves an 11:59pm deadline onto the following
  // day, in every list, on the calendar, and in the reminders.
  //
  // syncProfileSettings already writes it on sign-in, so today no account with
  // an LMS connection is missing one (checked: 19 of 273 profiles have no
  // timezone, and none of them has ever connected an LMS). This closes the
  // door rather than trusting that to hold: the one moment the value becomes
  // load-bearing is the moment a connection is created, so it is written here
  // if it is absent. Best-effort — a profile write must never be the reason a
  // student cannot connect Canvas.
  await ensureProfileTimezone(input.userId);

  const { data: connection, error: connectionError } = await supabase
    .from('lms_connections')
    .insert({
      user_id: input.userId,
      provider: input.provider,
      connection_method: input.connectionMethod ?? 'legacy_token',
      display_name: input.displayName.trim() || LMS_PROVIDER_LABELS[input.provider],
      base_url: input.provider === 'google_classroom' ? null : input.baseUrl?.trim() || null,
      account_label: input.credential.accountLabel ?? null,
      last_sync_status: 'syncing',
    })
    .select('*')
    .single();
  if (connectionError) throw connectionError;

  const createdCourseIds: string[] = [];
  try {
    if ((input.connectionMethod ?? 'legacy_token') !== 'calendar_feed') {
      await storeLmsCredential(connection.id, input.credential);
    }
    for (let index = 0; index < input.courses.length; index++) {
      const external = input.courses[index];

      // The student said this Canvas course is a class Semora already has.
      //
      // Link only. No insert, and deliberately no update either: their course
      // keeps its own name, colour, instructor, semester and grade setup, and
      // every task already in it is untouched. All that changes is where the
      // next sync puts Canvas's items. Not pushed onto createdCourseIds, so the
      // rollback below can never delete a course the student already had.
      const existingCourseId = input.linkTo?.[external.id];
      if (existingCourseId) {
        const { error: linkExistingError } = await supabase.from('lms_course_links').insert({
          user_id: input.userId,
          connection_id: connection.id,
          external_course_id: external.id,
          external_name: external.name,
          local_course_id: existingCourseId,
        });
        if (linkExistingError) throw linkExistingError;
        continue;
      }

      const { data: course, error: courseError } = await supabase
        .from('courses')
        .insert({
          user_id: input.userId,
          semester_id: input.semesterId,
          name: external.name,
          instructor: external.instructor ?? null,
          color: COLORS[index % COLORS.length],
          icon: 'book',
          // Not decoration. enforce_free_course_limit (090) reads this column
          // to decide whether the row counts against the free four-per-semester
          // cap, and it runs BEFORE INSERT — before the lms_course_links row
          // below exists to prove where the class came from. Drop this and a
          // free student importing five Canvas classes is refused by Postgres
          // on the fifth, halfway through, with the connection already made.
          source: 'lms',
        })
        .select('id')
        .single();
      if (courseError) throw courseError;
      createdCourseIds.push(course.id);

      const { error: linkError } = await supabase.from('lms_course_links').insert({
        user_id: input.userId,
        connection_id: connection.id,
        external_course_id: external.id,
        external_name: external.name,
        local_course_id: course.id,
      });
      if (linkError) throw linkError;
    }
    // Automatic sync is ON from the moment you connect.
    //
    // Nobody connects Canvas wanting a one-time snapshot. They connect it so a
    // deadline their instructor moves is right in Semora without anyone doing
    // anything — which is what background sync does and a one-off import does
    // not. Making it a second, separate toggle in Settings got the default
    // backwards: the only real Canvas connection in production sat with
    // background_sync_enabled = false for three weeks, importing nothing after
    // its first run, and the student had no way to know.
    //
    // This ran for calendar_feed only. Token connections were left off, which
    // is exactly why that account never synced.
    //
    // NON-FATAL, unlike before. Unguarded inside this try, a failure to enable
    // auto-sync fell through to the catch below and DELETED the whole
    // connection — punishing a student who had a perfectly good one because an
    // optional extra did not take. A connection that synced once is still worth
    // keeping; canvasOfferFor() reports it as needs_attention and every entry
    // point offers to finish the job.
    //
    // RETRIED, AND LOUD WHEN IT STILL FAILS. This is one network round trip
    // standing between a student and every future sync: a calendar-feed
    // connection has no device credential, so if the Vault never receives the
    // feed URL the background worker has nothing to sync WITH and the
    // connection imports once and then goes quiet forever. That is the exact
    // shape of the three-week silent failure 053 recorded.
    //
    // A single transient error should not cost that, so it gets a second
    // attempt. And when both fail the reason is written to the connection
    // instead of being discarded — `needs_attention` told the student
    // something was wrong but nobody could see WHAT, which made it
    // undiagnosable from the outside.
    let backgroundEnabled = false;
    let backgroundError = '';
    for (let attempt = 0; attempt < 2 && !backgroundEnabled; attempt++) {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 800));
      try {
        await invokeLms({
          action: 'enable_background',
          connection_id: connection.id,
          access_token: input.credential.accessToken,
          refresh_token: input.credential.refreshToken ?? null,
          expires_at: input.credential.expiresAt ?? null,
        });
        backgroundEnabled = true;
      } catch (error) {
        backgroundError = error instanceof Error ? error.message : 'Automatic sync could not be enabled.';
      }
    }
    if (!backgroundEnabled) {
      // Still non-fatal. A connection that syncs once is worth keeping, and
      // every entry point offers to finish the job — it just says why now.
      await supabase
        .from('lms_connections')
        .update({ last_error: `Automatic sync could not be turned on: ${backgroundError}`.slice(0, 500) })
        .eq('id', connection.id)
        .then(() => {}, () => {});
    }
    // Before the first sync, not after: the sync is what records unlinked
    // courses, so these have to be on the ignore list by the time it runs.
    if (input.declined?.length) {
      try {
        await setLmsCoursesIgnored({
          connectionId: connection.id,
          courses: input.declined,
          ignored: true,
        });
      } catch {
        // Worst case they are offered again under "new courses", where the
        // same dismiss button is one tap away. Not worth failing a connect.
      }
    }
    const result = await syncLmsConnection(
      connection.id,
      'initial',
      // See the parameter's own note: never let the first sync depend on the
      // Vault write above having landed.
      input.credential.accessToken,
    );
    return { connectionId: connection.id, ...result };
  } catch (error) {
    // The rollback is not guaranteed to work, and the screen above says
    // "Nothing was saved" on the strength of it. That sentence is only true if
    // both deletes below actually succeeded — they were unchecked, so a
    // student whose rollback failed was told nothing had been added while
    // looking at a course list that now had four new classes in it.
    //
    // Check them, and tell the caller which sentence is the honest one.
    let rolledBack = true;
    const { error: connectionDeleteError } = await supabase
      .from('lms_connections').delete().eq('id', connection.id);
    if (connectionDeleteError) rolledBack = false;
    if (createdCourseIds.length) {
      const { error: courseDeleteError } = await supabase
        .from('courses')
        .delete()
        .eq('user_id', input.userId)
        .in('id', createdCourseIds);
      if (courseDeleteError) rolledBack = false;
    }
    await removeLmsCredential(connection.id);
    if (!rolledBack && error instanceof Error) {
      (error as any).partialImport = true;
    }
    throw error;
  }
}

/**
 * Hide or restore an LMS-imported task.
 *
 * Deliberately NOT a delete. Deleting the row worked exactly once: the next
 * background sync read the item from the feed, found no matching task and
 * created it again, so the assignment came back within the hour. The student
 * was left with a delete button that visibly did nothing — and a reasonable
 * fear that it had deleted something in Canvas, which Semora cannot do and has
 * never done (the calendar feed is read-only).
 *
 * The RPC writes the task's lms_hidden_at and its lms_suppressed_items row
 * together; either half alone reappears or vanishes wrongly. See migration 120.
 */
export async function setLmsTaskHidden(taskId: string, hidden: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_lms_task_hidden', {
    p_task_id: taskId,
    p_hidden: hidden,
  });
  if (error) throw error;
}

/** Everything the student has hidden, newest first, for the restore screen. */
export async function listHiddenLmsTasks(): Promise<
  { id: string; title: string; due_date: string; lms_hidden_at: string; courseName: string }[]
> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, due_date, lms_hidden_at, courses(name)')
    .not('lms_hidden_at', 'is', null)
    .order('lms_hidden_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: row.id,
    title: row.title,
    due_date: row.due_date,
    lms_hidden_at: row.lms_hidden_at,
    courseName: (Array.isArray(row.courses) ? row.courses[0]?.name : row.courses?.name) ?? 'Class',
  }));
}

export async function syncLmsConnection(
  connectionId: string,
  trigger: 'initial' | 'manual' | 'foreground_auto' = 'manual',
  // The credential to sync WITH, when the caller already has it in hand.
  //
  // Only the connect flow passes this, and only because of an ordering trap it
  // could not otherwise escape. A calendar-feed connection holds no device
  // credential by design — the feed URL goes straight to the Vault and the
  // server reads it back on every sync. So the very first sync, moments after
  // connecting, depends on a Vault write that happened seconds earlier through
  // a DIFFERENT edge-function call. When that write failed the first sync got
  // a 401, the connect threw, and the catch below deleted a connection whose
  // feed URL was perfectly good.
  //
  // Passing it explicitly removes the dependency entirely: the first sync uses
  // the URL the student just gave us, whatever the Vault did.
  explicitCredential?: string | null,
): Promise<{ processed: number; skipped: number }> {
  const { data: connection, error: connectionError } = await supabase
    .from('lms_connections')
    .select('*, links:lms_course_links(*)')
    .eq('id', connectionId)
    .single();
  if (connectionError) throw connectionError;

  const links = ((connection as any).links ?? []).filter((link: LmsCourseLink) => link.sync_enabled);
  if (!links.length) throw new Error('This LMS connection has no enabled courses.');

  try {
    let credential = connection.connection_method === 'calendar_feed'
      ? null
      : await getLmsCredential(connectionId);
    if (connection.provider === 'google_classroom') {
      try {
        credential = await refreshGoogleClassroomAccessToken(connection.account_label);
        await storeLmsCredential(connectionId, credential);
      } catch {
        // The locally stored token may still be valid. If it is not, the
        // provider request below records credentials_required for the user.
      }
    }
    if (!credential && connection.connection_method !== 'calendar_feed') {
      await supabase
        .from('lms_connections')
        .update({
          last_sync_status: 'credentials_required',
          last_error: 'Reconnect this LMS on this device to continue syncing.',
        })
        .eq('id', connectionId);
      throw new Error('Reconnect this LMS on this device to continue syncing.');
    }

    // The explicit credential wins when the caller supplied one. For a
    // calendar-feed connection it is the only credential that exists on this
    // device; for a token connection it is the same value getLmsCredential
    // would have returned. Either way the server prefers `access_token` over
    // its Vault lookup, so this cannot pick up a stale token.
    const syncToken = explicitCredential || credential?.accessToken || '';
    const data = await invokeLms<{ processed: number; skipped: number }>({
      action: 'sync',
      connection_id: connectionId,
      ...(syncToken ? { access_token: syncToken } : {}),
      trigger,
    });
    rescheduleAllTaskReminders(connection.user_id, 'lms_sync').catch(() => {});
    // A sync can mark assignments submitted (the apply RPC ORs is_completed in
    // from Canvas's submission state), and rescheduleAllTaskReminders above
    // cannot clear those: it iterates INCOMPLETE tasks, so an assignment that
    // just became complete is not in its list to be cancelled. Reconciliation
    // is the half that withdraws the reminder.
    reconcileTaskReminders(connection.user_id).catch(() => {});
    return {
      processed: Number(data?.processed ?? 0),
      skipped: Number(data?.skipped ?? 0),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LMS synchronization failed.';
    // `credentials_required` is not a status, it is an instruction: it disables
    // background sync, purges the stored feed URL and tells the student to go
    // and fetch a new one from Canvas. Reaching it by keyword match on an error
    // string is how a rate limit, a timeout or a five-minute Canvas outage
    // ended up costing a student a working connection.
    //
    // So the test is now narrow and has an explicit escape: anything that
    // names throttling or a transport failure is a temporary error, whatever
    // other words it happens to contain, and the sync simply retries.
    const transient = /rate.?limit|throttl|too many requests|timed? ?out|network|did not respond|temporarily/i.test(message);
    await supabase
      .from('lms_connections')
      .update({
        last_sync_status: !transient && /reconnect|no longer available|unauthor|expired|revoked/i.test(message)
          ? 'credentials_required'
          : 'error',
        last_error: message.slice(0, 500),
      })
      .eq('id', connectionId);
    throw error;
  }
}

/**
 * Lets a student opt into scheduled sync. The credential is sent over TLS to
 * the authenticated edge function, encrypted in Supabase Vault, and never
 * returned to the client or exposed in a public table.
 */
export async function enableLmsBackgroundSync(connectionId: string): Promise<void> {
  const { data: connection, error } = await supabase
    .from('lms_connections')
    .select('*')
    .eq('id', connectionId)
    .single();
  if (error) throw error;

  let credential = await getLmsCredential(connectionId);
  if (connection.provider === 'google_classroom') {
    try {
      credential = await refreshGoogleClassroomAccessToken(connection.account_label);
      await storeLmsCredential(connectionId, credential);
    } catch {
      // The existing credential may still be valid; the server confirms it on
      // the next scheduled run and records reconnect guidance if it is not.
    }
  }
  if (!credential?.accessToken) {
    throw new Error('Reconnect this LMS on this device before enabling automatic sync.');
  }
  await invokeLms({
    action: 'enable_background',
    connection_id: connectionId,
    access_token: credential.accessToken,
    refresh_token: credential.refreshToken ?? null,
    expires_at: credential.expiresAt ?? null,
  });
}

export async function disableLmsBackgroundSync(connectionId: string): Promise<void> {
  await invokeLms({ action: 'disable_background', connection_id: connectionId });
}

export async function listLmsSyncRuns(connectionId: string): Promise<LmsSyncRun[]> {
  const { data, error } = await supabase
    .from('lms_sync_runs')
    .select('*')
    .eq('connection_id', connectionId)
    .order('started_at', { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data ?? []) as LmsSyncRun[];
}

export async function setLmsCourseMapping(input: {
  linkId: string;
  localCourseId: string;
  syncEnabled: boolean;
}): Promise<void> {
  const { error } = await supabase.rpc('set_lms_course_mapping', {
    p_link_id: input.linkId,
    p_local_course_id: input.localCourseId,
    p_sync_enabled: input.syncEnabled,
  });
  if (error) throw error;
}

export async function reconnectLmsConnection(
  connectionId: string,
  credential: LmsCredential,
  baseUrl?: string | null,
  connectionMethod?: LmsConnectionMethod,
): Promise<void> {
  const method = connectionMethod ?? 'legacy_token';
  if (method !== 'calendar_feed') await storeLmsCredential(connectionId, credential);
  const { error } = await supabase
    .from('lms_connections')
    .update({
      ...(baseUrl !== undefined ? { base_url: baseUrl?.trim() || null } : {}),
      connection_method: method,
      account_label: credential.accountLabel ?? null,
      last_sync_status: 'never',
      last_error: null,
    })
    .eq('id', connectionId);
  if (error) throw error;
  if (method === 'calendar_feed') {
    await invokeLms({
      action: 'enable_background',
      connection_id: connectionId,
      access_token: credential.accessToken,
    });
    await removeLmsCredential(connectionId);
  }
}

export async function disconnectLms(connectionId: string): Promise<void> {
  const { error } = await supabase.from('lms_connections').delete().eq('id', connectionId);
  if (error) throw error;
  await removeLmsCredential(connectionId);
}

// ── Canvas status, in one place ─────────────────────────────────────────────
//
// Canvas sync is the thing Semora does that nothing else on a student's phone
// does: when an instructor moves a deadline, it moves here too, without anyone
// asking. It also lived exclusively in Settings, behind a Pro wall, and had
// exactly one connection in three weeks. Surfacing it where students actually
// start — the empty course list and the "+" menu — means the same question
// ("should we be offering Canvas right now, and how?") gets asked from three
// screens, and three copies of that rule would drift.
//
// The states are deliberately about what to OFFER, not about what is true:
//
//   none            → offer "Connect Canvas". Nothing is set up.
//   needs_attention → offer "Finish setup". Connected, but not actually
//                     syncing on its own: background sync is off, or the last
//                     run failed, or the feed URL stopped working.
//   healthy         → offer NOTHING. It is connected and working, and a
//                     student who has already done this should never be shown
//                     a prompt to do it again — that is how a useful feature
//                     turns into nagging.


/**
 * Is Canvas sync free for everyone right now?
 *
 * A row in the database, not a constant in this bundle. Semora ships no OTA
 * updates (expo-updates is not installed), so a promo compiled into the app
 * could only be ended by an App Store release — and every install that had not
 * updated would keep advertising a free offer the server had already stopped
 * honouring. That is a 402 at the end of a promise. Reading it from the server
 * means ending the offer is one UPDATE and lands on builds that shipped months
 * ago.
 */
export async function canvasFreePromoActive(): Promise<boolean> {
  const { data, error } = await supabase.rpc('promo_active', { p_key: 'canvas_free' });
  // Fail CLOSED on the copy, not on the feature. If this read fails we simply
  // do not shout about a free offer; the server still decides who may sync, so
  // a Pro subscriber and a grandfathered account are unaffected either way.
  if (error) return false;
  return data === true;
}

/**
 * Is the Pro Canvas education modal switched on?
 *
 * The same promo_active() mechanism as the free Canvas offer, on a DIFFERENT
 * key (pro_canvas_education_v2), so the two switches are genuinely independent:
 * turning this one off cannot disturb the free-tier promotion or its
 * grandfathering, and vice versa.
 *
 * Lives beside canvasFreePromoQuery because it is the same one-row read against
 * the same RPC — a second mechanism for a second boolean would be architecture
 * for its own sake. See lib/proCanvasEducation.ts for what it gates.
 *
 * Fails CLOSED. A failed read returns false, which silences the modal — the
 * correct direction for a kill switch, and the opposite of the free promo's
 * concern (there, failing closed only withholds an advertisement).
 */
export async function proCanvasEducationActive(): Promise<boolean> {
  const { data, error } = await supabase.rpc('promo_active', { p_key: PRO_CANVAS_EDU_FLAG_KEY });
  if (error) return false;
  return data === true;
}

export const proCanvasEducationQuery = {
  // Keyed to the flag version so a bundle can never serve a cached answer
  // that was fetched for the retired key.
  queryKey: ['proCanvasEducationFlagV2'] as const,
  queryFn: proCanvasEducationActive,
  // Matches the free promo's window: a switch does not flip mid-session, and
  // this sits on the Today tab's render path.
  staleTime: 10 * 60_000,
};

export const canvasFreePromoQuery = {
  queryKey: ['canvasFreePromo'] as const,
  queryFn: canvasFreePromoActive,
  // An offer does not start and stop within a session. Read it once and leave
  // it alone — this sits on the render path of six screens.
  staleTime: 10 * 60_000,
};

/**
 * Shared query. One key, so connecting Canvas on one screen updates the offer
 * everywhere else without a refresh.
 */
export const lmsConnectionsQuery = {
  queryKey: ['lmsConnections'] as const,
  queryFn: listLmsConnections,
  // Cheap, indexed, and read on screens the student opens constantly; a stale
  // answer here shows the wrong call to action.
  staleTime: 30_000,
};

// ── New-term courses ────────────────────────────────────────────────────────

/**
 * Courses a sync found that are not linked yet, newest term first.
 *
 * Read straight from the table rather than through the edge function: it is
 * the student's own data, RLS-scoped, and the review screen needs it to render
 * before any network round-trip to Canvas would finish.
 */
export const pendingLmsCoursesQuery = {
  queryKey: ['lmsPendingCourses'] as const,
  queryFn: async (): Promise<LmsPendingCourse[]> => {
    const { data, error } = await supabase
      .from('lms_pending_courses')
      .select('*')
      .is('ignored_at', null)
      .is('resolved_at', null)
      .order('first_due', { ascending: true, nullsFirst: false })
      .order('external_name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as LmsPendingCourse[];
  },
};

/** Everything ever dismissed on a connection, for the "not mine" list. */
export async function ignoredLmsCourses(connectionId: string): Promise<LmsPendingCourse[]> {
  const { data, error } = await supabase
    .from('lms_pending_courses')
    .select('*')
    .eq('connection_id', connectionId)
    .not('ignored_at', 'is', null)
    .order('external_name');
  if (error) throw error;
  return (data ?? []) as LmsPendingCourse[];
}

/** Pending rows read as discovered courses, so one review component serves both. */
export function pendingAsDiscovered(pending: LmsPendingCourse): DiscoveredLmsCourse {
  return {
    id: pending.external_course_id,
    name: pending.external_name,
    code: pending.code ?? undefined,
    item_count: pending.item_count,
    first_due: pending.first_due,
    last_due: pending.last_due,
    term_name: pending.term_name,
    term_start: pending.term_start,
    term_end: pending.term_end,
  };
}

/**
 * Turn reviewed courses into real ones, in the semester the student chose.
 *
 * One database call, one transaction: a half-applied import would leave either
 * courses with no link (never synced again) or links with no course (skipped by
 * the sync RPC forever), and both are invisible failures.
 */
export async function linkPendingCourses(input: {
  connectionId: string;
  semesterId: string;
  externalCourseIds: string[];
}): Promise<number> {
  const { data, error } = await supabase.rpc('link_lms_pending_courses', {
    p_connection_id: input.connectionId,
    p_semester_id: input.semesterId,
    p_external_course_ids: input.externalCourseIds,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

/**
 * "Not mine" — and its undo.
 *
 * Also called at connect time for the courses a student did NOT tick. Without
 * that, the very first sync would re-offer them as new discoveries and turn a
 * deliberate choice into a nag.
 */
export async function setLmsCoursesIgnored(input: {
  connectionId: string;
  courses: DiscoveredLmsCourse[];
  ignored: boolean;
}): Promise<void> {
  if (!input.courses.length) return;
  const { error } = await supabase.rpc('set_lms_pending_ignored', {
    p_connection_id: input.connectionId,
    p_courses: input.courses.map((course) => ({
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
    p_ignored: input.ignored,
  });
  if (error) throw error;
}
