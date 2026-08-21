import { supabase } from '@/lib/supabase';
import {
  getGoogleClassroomAccessToken,
  refreshGoogleClassroomAccessToken,
} from '@/lib/auth';
import { rescheduleAllTaskReminders } from '@/lib/notifications';
import {
  readLmsCredential,
  removeLmsCredential,
  storeLmsCredential,
} from '@/lib/lmsCredentialStore';
import type {
  LmsConnection,
  LmsConnectionMethod,
  LmsCourseLink,
  LmsProvider,
} from '@/types/database';

export interface DiscoveredLmsCourse {
  id: string;
  name: string;
  code?: string;
  instructor?: string;
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
export function normalizeCanvasCalendarFeedUrl(raw: string): string {
  let candidate = raw.trim();
  if (!candidate) throw new Error('Paste your Canvas Calendar Feed URL.');
  if (candidate.length > 4096) throw new Error('The Canvas Calendar Feed URL is too long.');
  if (/^webcal:\/\//i.test(candidate)) candidate = `https://${candidate.slice(candidate.indexOf('//') + 2)}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Paste the complete Calendar Feed URL copied from Canvas.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Canvas Calendar Feed URLs must use secure HTTPS.');
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.includes(':')) {
    throw new Error('Canvas Calendar Feed URLs must use your school’s Canvas hostname.');
  }
  if (!/\/feeds\/calendars\/user_[^/]+\.ics$/i.test(url.pathname)) {
    throw new Error('This is not a Canvas user Calendar Feed URL. In Canvas, open Calendar → Calendar Feed and copy the URL shown there.');
  }
  url.hash = '';
  return url.toString();
}

export function canvasCalendarOrigin(raw: string): string {
  return new URL(normalizeCanvasCalendarFeedUrl(raw)).origin;
}

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

export async function connectLms(input: {
  userId: string;
  semesterId: string;
  provider: LmsProvider;
  connectionMethod?: LmsConnectionMethod;
  displayName: string;
  baseUrl?: string | null;
  credential: LmsCredential;
  courses: DiscoveredLmsCourse[];
}): Promise<{ connectionId: string; processed: number; skipped: number }> {
  if (!input.courses.length) throw new Error('Select at least one course to import.');

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
    try {
      await invokeLms({
        action: 'enable_background',
        connection_id: connection.id,
        access_token: input.credential.accessToken,
        refresh_token: input.credential.refreshToken ?? null,
        expires_at: input.credential.expiresAt ?? null,
      });
    } catch {
      // Left off deliberately: the student hears about it from the "Finish
      // Canvas setup" prompt, not from a connection that vanished.
    }
    const result = await syncLmsConnection(connection.id, 'initial');
    return { connectionId: connection.id, ...result };
  } catch (error) {
    await supabase.from('lms_connections').delete().eq('id', connection.id);
    if (createdCourseIds.length) {
      await supabase
        .from('courses')
        .delete()
        .eq('user_id', input.userId)
        .in('id', createdCourseIds);
    }
    await removeLmsCredential(connection.id);
    throw error;
  }
}

export async function syncLmsConnection(
  connectionId: string,
  trigger: 'initial' | 'manual' | 'foreground_auto' = 'manual',
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

    const data = await invokeLms<{ processed: number; skipped: number }>({
      action: 'sync',
      connection_id: connectionId,
      ...(credential?.accessToken ? { access_token: credential.accessToken } : {}),
      trigger,
    });
    rescheduleAllTaskReminders(connection.user_id).catch(() => {});
    return {
      processed: Number(data?.processed ?? 0),
      skipped: Number(data?.skipped ?? 0),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LMS synchronization failed.';
    await supabase
      .from('lms_connections')
      .update({
        last_sync_status: /reconnect|permission|unauthor|token/i.test(message)
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

export type CanvasOffer = 'none' | 'needs_attention' | 'healthy' | 'locked';

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

export const canvasFreePromoQuery = {
  queryKey: ['canvasFreePromo'] as const,
  queryFn: canvasFreePromoActive,
  // An offer does not start and stop within a session. Read it once and leave
  // it alone — this sits on the render path of six screens.
  staleTime: 10 * 60_000,
};

/**
 * Is Canvas free for THIS account right now?
 *
 * Two ways to qualify, and the second is the one that makes "limited time"
 * honest: the offer is live, or this account already connected while it was.
 * A claim is stamped by the database on the connection row (090), so ending
 * the offer never reaches backwards and switches off somebody who took it.
 *
 * Separate from canvasOfferFor because the settings screens need this answer
 * before the connection list has loaded — canvasOfferFor deliberately reports
 * 'healthy' while loading so no prompt flashes, and a screen that gated on
 * that would show a paywall for a beat to a student who does not owe anything.
 */
export function canvasFreeFor(
  connections: (LmsConnection & { links: LmsCourseLink[] })[] | undefined,
  isPro?: boolean,
  freePromoActive?: boolean,
): boolean {
  if (isPro !== false) return false;
  if (freePromoActive === true) return true;
  return (connections ?? []).some((c) => c.free_promo_claimed_at != null);
}

export function canvasOfferFor(
  connections: (LmsConnection & { links: LmsCourseLink[] })[] | undefined,
  isPro?: boolean,
  freePromoActive?: boolean,
): { offer: CanvasOffer; connection: LmsConnection | null; free: boolean } {
  // While the query is loading, offer nothing. Flashing "Connect Canvas" at a
  // student who connected it last term, then swapping it out a beat later, is
  // worse than showing it a moment late.
  if (!connections) return { offer: 'healthy', connection: null, free: false };

  const canvas = connections.find((c) => c.provider === 'canvas') ?? null;

  // Pro, the offer is live, or this account claimed it while it was. See
  // canvasFreeFor — lms_access_allowed answers the same question server-side.
  const free = canvasFreeFor(connections, isPro, freePromoActive);

  // Not Pro, and the offer is not open to them.
  //
  // lms-sync refuses this caller server-side, so a free student who taps
  // "Connect Canvas" reaches Settings, then the paywall — a dead end dressed
  // as a feature, and the second-worst way to learn something costs money. The
  // worst is finding out after connecting.
  //
  // 'locked' still SHOWS the offer, deliberately: hiding it from exactly the
  // people who have not upgraded would be the wrong lesson from "do not
  // dead-end them". It carries a PRO badge and goes straight to the paywall.
  //
  // Checked before the healthy case on purpose. When Pro lapses the server
  // disables background sync and deletes the credential, so a lapsed
  // subscriber's connection is not healthy no matter what the row says — and
  // reconnecting is what they will have to do.
  if (isPro === false && !free) return { offer: 'locked', connection: canvas, free: false };

  if (!canvas) return { offer: 'none', connection: null, free };

  const stalled =
    !canvas.background_sync_enabled ||
    ['error', 'credentials_required'].includes(canvas.last_sync_status ?? '');

  return { offer: stalled ? 'needs_attention' : 'healthy', connection: canvas, free };
}

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
