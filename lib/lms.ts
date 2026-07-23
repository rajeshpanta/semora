import { supabase } from '@/lib/supabase';
import { getGoogleClassroomAccessToken } from '@/lib/auth';
import { rescheduleAllTaskReminders } from '@/lib/notifications';
import {
  readLmsCredential,
  removeLmsCredential,
  storeLmsCredential,
} from '@/lib/lmsCredentialStore';
import type {
  LmsConnection,
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
}

const COLORS = ['#4F46E5', '#0F766E', '#C2410C', '#9333EA', '#0369A1', '#BE123C'];
export const LMS_PROVIDER_LABELS: Record<LmsProvider, string> = {
  canvas: 'Canvas',
  blackboard: 'Blackboard',
  moodle: 'Moodle',
  google_classroom: 'Google Classroom',
};

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
  baseUrl?: string | null;
  credential: LmsCredential;
}): Promise<DiscoveredLmsCourse[]> {
  const data = await invokeLms<{ courses: DiscoveredLmsCourse[] }>({
    action: 'discover',
    provider: input.provider,
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
    await storeLmsCredential(connection.id, input.credential);
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
    const result = await syncLmsConnection(connection.id);
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
): Promise<{ processed: number; skipped: number }> {
  const { data: connection, error: connectionError } = await supabase
    .from('lms_connections')
    .select('*, links:lms_course_links(*)')
    .eq('id', connectionId)
    .single();
  if (connectionError) throw connectionError;

  const links = ((connection as any).links ?? []).filter((link: LmsCourseLink) => link.sync_enabled);
  if (!links.length) throw new Error('This LMS connection has no enabled courses.');

  await supabase
    .from('lms_connections')
    .update({ last_sync_status: 'syncing', last_error: null })
    .eq('id', connectionId);

  try {
    const credential = await getLmsCredential(connectionId);
    if (!credential) {
      await supabase
        .from('lms_connections')
        .update({
          last_sync_status: 'credentials_required',
          last_error: 'Reconnect this LMS on this device to continue syncing.',
        })
        .eq('id', connectionId);
      throw new Error('Reconnect this LMS on this device to continue syncing.');
    }

    const data = await invokeLms<{ assignments: LmsAssignment[]; removal_safe?: boolean }>({
      action: 'assignments',
      provider: connection.provider,
      base_url: connection.base_url,
      access_token: credential.accessToken,
      course_ids: links.map((link: LmsCourseLink) => link.external_course_id),
    });
    const localByExternal = new Map(
      links.map((link: LmsCourseLink) => [link.external_course_id, link.local_course_id]),
    );
    const items = (data.assignments ?? []).map((item) => {
      let localDue: { due_date?: string | null; due_time?: string | null } = {};
      if (item.due_at) {
        const date = new Date(item.due_at);
        if (Number.isFinite(date.getTime())) {
          localDue = {
            due_date:
              `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
            due_time:
              `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`,
          };
        }
      }
      return {
        ...item,
        ...localDue,
        local_course_id: localByExternal.get(item.external_course_id) ?? null,
      };
    });
    const { data: applied, error: applyError } = await supabase.rpc('apply_lms_assignment_sync', {
      p_connection_id: connectionId,
      p_items: items,
      p_external_course_ids: data.removal_safe
        ? links.map((link: LmsCourseLink) => link.external_course_id)
        : [],
    });
    if (applyError) throw applyError;
    rescheduleAllTaskReminders(connection.user_id).catch(() => {});
    return {
      processed: Number(applied?.processed ?? 0),
      skipped: Number(applied?.skipped ?? 0),
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

export async function reconnectLmsConnection(
  connectionId: string,
  credential: LmsCredential,
): Promise<void> {
  await storeLmsCredential(connectionId, credential);
  await supabase
    .from('lms_connections')
    .update({
      account_label: credential.accountLabel ?? null,
      last_sync_status: 'never',
      last_error: null,
    })
    .eq('id', connectionId);
}

export async function disconnectLms(connectionId: string): Promise<void> {
  const { error } = await supabase.from('lms_connections').delete().eq('id', connectionId);
  if (error) throw error;
  await removeLmsCredential(connectionId);
}
