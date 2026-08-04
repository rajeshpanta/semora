import * as SecureStore from 'expo-secure-store';
import { Platform, Share } from 'react-native';
import { supabase } from '@/lib/supabase';
import { MARKETING_URL } from '@/lib/constants';
import type {
  CourseCollaboration,
  CourseCollaborationMember,
  GroupAssignment,
  SharedDeadline,
} from '@/types/database';

export type CollaborationSummary = CourseCollaboration & {
  membership: CourseCollaborationMember;
  member_count: number;
};

export interface CollaborationDetail {
  collaboration: CourseCollaboration;
  members: CourseCollaborationMember[];
  deadlines: SharedDeadline[];
  groupAssignments: GroupAssignment[];
}

const PENDING_COLLABORATION_TOKEN = 'semora.pending-collaboration-token';

export async function savePendingCollaborationToken(token: string) {
  const value = token.trim().slice(0, 128);
  if (!value) return;
  if (Platform.OS === 'web') localStorage.setItem(PENDING_COLLABORATION_TOKEN, value);
  else await SecureStore.setItemAsync(PENDING_COLLABORATION_TOKEN, value);
}

export function readPendingCollaborationToken(): string | null {
  try {
    return Platform.OS === 'web'
      ? localStorage.getItem(PENDING_COLLABORATION_TOKEN)
      : SecureStore.getItem(PENDING_COLLABORATION_TOKEN);
  } catch {
    return null;
  }
}

export async function clearPendingCollaborationToken() {
  try {
    if (Platform.OS === 'web') localStorage.removeItem(PENDING_COLLABORATION_TOKEN);
    else await SecureStore.deleteItemAsync(PENDING_COLLABORATION_TOKEN);
  } catch {}
}

export async function listCollaborations(userId: string): Promise<CollaborationSummary[]> {
  const { data: memberships, error } = await supabase
    .from('course_collaboration_members')
    .select('*, collaboration:course_collaborations(*)')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false });
  if (error) throw error;
  const collaborationIds = (memberships ?? []).map((row: any) => row.collaboration_id);
  const counts = new Map<string, number>();
  if (collaborationIds.length) {
    const { data: members, error: memberError } = await supabase
      .from('course_collaboration_members')
      .select('collaboration_id')
      .in('collaboration_id', collaborationIds);
    if (memberError) throw memberError;
    (members ?? []).forEach((row: any) => {
      counts.set(row.collaboration_id, (counts.get(row.collaboration_id) ?? 0) + 1);
    });
  }
  return (memberships ?? [])
    .filter((row: any) => row.collaboration?.is_active)
    .map((row: any) => ({
      ...row.collaboration,
      membership: {
        collaboration_id: row.collaboration_id,
        user_id: row.user_id,
        role: row.role,
        display_name: row.display_name,
        local_course_id: row.local_course_id,
        joined_at: row.joined_at,
      },
      member_count: counts.get(row.collaboration_id) ?? 1,
    }));
}

export async function getCollaborationDetail(id: string): Promise<CollaborationDetail> {
  const [collaborationResult, membersResult, deadlinesResult, assignmentsResult] = await Promise.all([
    supabase.from('course_collaborations').select('*').eq('id', id).single(),
    supabase.from('course_collaboration_members').select('*').eq('collaboration_id', id).order('joined_at'),
    supabase.from('shared_deadlines').select('*').eq('collaboration_id', id).order('due_date').order('due_time'),
    supabase.from('group_assignments').select('*').eq('collaboration_id', id).order('due_date').order('due_time'),
  ]);
  if (collaborationResult.error) throw collaborationResult.error;
  if (membersResult.error) throw membersResult.error;
  if (deadlinesResult.error) throw deadlinesResult.error;
  if (assignmentsResult.error) throw assignmentsResult.error;
  return {
    collaboration: collaborationResult.data as CourseCollaboration,
    members: (membersResult.data ?? []) as CourseCollaborationMember[],
    deadlines: (deadlinesResult.data ?? []) as SharedDeadline[],
    groupAssignments: (assignmentsResult.data ?? []) as GroupAssignment[],
  };
}

export async function createCourseCollaboration(courseId: string): Promise<CourseCollaboration> {
  const { data, error } = await supabase.rpc('create_course_collaboration', {
    p_course_id: courseId,
  });
  if (error) throw error;
  return data as CourseCollaboration;
}

export async function joinCourseCollaboration(token: string, displayName?: string | null) {
  const { data, error } = await supabase.rpc('join_course_collaboration', {
    p_token: token.trim(),
    p_display_name: displayName?.trim() || null,
  });
  if (error) throw error;
  await clearPendingCollaborationToken();
  return data as CourseCollaboration;
}

export async function inviteClassmates(collaborationId: string, courseName: string) {
  const { data: token, error } = await supabase.rpc('create_course_collaboration_invite', {
    p_collaboration_id: collaborationId,
  });
  if (error) throw error;
  // https landing page rather than a bare `semora://` deep link — see the note
  // on inviteLink() in lib/referral.ts. Classmates being invited to a course
  // space are precisely the people who do not have the app yet.
  const url = `${MARKETING_URL}/collaborate/${encodeURIComponent(String(token))}`;
  await Share.share({
    title: `Join ${courseName} in Semora`,
    message:
      `Join my ${courseName} course space in Semora to share deadlines and group work:\n${url}`,
    url,
  });
  return url;
}

export async function publishCourseDeadlines(collaborationId: string): Promise<number> {
  const { data, error } = await supabase.rpc('publish_course_deadlines', {
    p_collaboration_id: collaborationId,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function syncCollaborationToPlanner(
  collaborationId: string,
  semesterId: string,
): Promise<{ course_id: string; deadlines_synced: number; group_assignments_synced: number }> {
  const { data, error } = await supabase.rpc('sync_collaboration_to_planner', {
    p_collaboration_id: collaborationId,
    p_semester_id: semesterId,
  });
  if (error) throw error;
  return data as any;
}

export async function createGroupAssignment(input: {
  collaborationId: string;
  userId: string;
  assignedTo?: string | null;
  title: string;
  description?: string | null;
  dueDate: string;
  dueTime?: string | null;
}) {
  const { data, error } = await supabase
    .from('group_assignments')
    .insert({
      collaboration_id: input.collaborationId,
      created_by: input.userId,
      assigned_to: input.assignedTo ?? null,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      due_date: input.dueDate,
      due_time: input.dueTime ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as GroupAssignment;
}

export async function setGroupAssignmentCompleted(
  id: string,
  userId: string,
  isCompleted: boolean,
) {
  const { data, error } = await supabase
    .from('group_assignments')
    .update({
      is_completed: isCompleted,
      completed_by: isCompleted ? userId : null,
      completed_at: isCompleted ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as GroupAssignment;
}

// ─── Membership & space lifecycle (migration 042 RPCs) ─────

export interface OutstandingInvite {
  id: string;
  token: string;
  expires_at: string;
  max_uses: number;
  use_count: number;
  created_at: string;
}

// The caller removes themselves. Blocked server-side if they are the sole owner.
export async function leaveCollaboration(collaborationId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_group', { p_collaboration_id: collaborationId });
  if (error) throw error;
}

// Owner only. Cannot remove another owner if they would be the last owner.
export async function removeCollaborationMember(
  collaborationId: string,
  memberUserId: string,
): Promise<void> {
  const { error } = await supabase.rpc('remove_member', {
    p_collaboration_id: collaborationId,
    p_member_user_id: memberUserId,
  });
  if (error) throw error;
}

// Owner only. Roles are owner/editor/viewer; a viewer cannot edit shared work.
export async function setCollaborationMemberRole(
  collaborationId: string,
  memberUserId: string,
  role: 'owner' | 'editor' | 'viewer',
): Promise<void> {
  const { error } = await supabase.rpc('set_member_role', {
    p_collaboration_id: collaborationId,
    p_member_user_id: memberUserId,
    p_role: role,
  });
  if (error) throw error;
}

// Owner only. Soft-delete: removes the space from every member's hub but leaves
// already-synced planner tasks intact (their collaboration FKs go null).
export async function archiveCollaboration(collaborationId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_group', { p_collaboration_id: collaborationId });
  if (error) throw error;
}

// Owner only. Hard-delete cascades members/invites/deadlines/group assignments.
export async function deleteCollaboration(collaborationId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_group', { p_collaboration_id: collaborationId });
  if (error) throw error;
}

// Owner only. Invalidate a single outstanding invite, or all when no id given.
export async function revokeCollaborationInvite(
  collaborationId: string,
  inviteId?: string | null,
): Promise<number> {
  const { data, error } = await supabase.rpc('revoke_invite', {
    p_collaboration_id: collaborationId,
    p_invite_id: inviteId ?? null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

// Outstanding invites the caller created for this space (RLS: invite_creators_read).
export async function listOutstandingInvites(collaborationId: string): Promise<OutstandingInvite[]> {
  const { data, error } = await supabase
    .from('course_collaboration_invites')
    .select('id, token, expires_at, max_uses, use_count, created_at')
    .eq('collaboration_id', collaborationId)
    .eq('revoked', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as OutstandingInvite[]).filter((invite) => invite.use_count < invite.max_uses);
}

// Points the caller's membership at one of their own local courses so synced
// deadlines/group work land in the course they already track (migration 037 RPC).
export async function setCollaborationLocalCourse(
  collaborationId: string,
  courseId: string,
): Promise<void> {
  const { error } = await supabase.rpc('set_collaboration_local_course', {
    p_collaboration_id: collaborationId,
    p_course_id: courseId,
  });
  if (error) throw error;
}

export function subscribeToCollaboration(
  id: string,
  onChange: () => void,
  scope = 'detail',
) {
  const channel = supabase
    .channel(`collaboration:${scope}:${id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'course_collaboration_members', filter: `collaboration_id=eq.${id}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shared_deadlines', filter: `collaboration_id=eq.${id}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'group_assignments', filter: `collaboration_id=eq.${id}` },
      onChange,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
