// Copy-on-join course sharing — "get my classmate's deadlines".
//
//   createShareLink(courseId)  — SENDING (Pro). Calls the share-course edge
//     function (which enforces Pro + ownership and builds the snapshot),
//     returns a semora://join?token=... URL for the native Share sheet.
//
//   importSharedCourse(token)  — RECEIVING (FREE, the growth loop). Resolves
//     the token via the resolve_course_share RPC (migration 026) — which any
//     authenticated user can call by token — then writes a PRIVATE COPY into
//     the caller's account: a new course (their user_id) + copies of the tasks
//     (new ids, their user_id, completion/score reset). Nothing is shared live.
//
// Insert patterns mirror lib/queries.ts (useCreateCourse / useCreateTask) and
// lib/syllabus.ts (findOrCreateSemester + isFreeLimitError). We deliberately do
// NOT add hooks to lib/queries.ts (contended); callers invalidate caches with
// the exported query keys after a successful import.

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { suggestCurrentSemesterName } from '@/lib/semesters';
import { isFreeLimitError } from '@/lib/syllabus';

// Pending-share-token stash. A friend without an account taps a share link;
// join.tsx stashes the token here and sends them to auth. AuthGate reads it
// after sign-in and reopens /join to finish the import. Lives here (not in the
// join route) so app/_layout can read it WITHOUT importing a route screen —
// that would create a cycle, since join imports useSession from _layout.
const PENDING_SHARE_TOKEN_KEY = 'semora_pending_share_token';

export function stashPendingShareToken(token: string) {
  if (Platform.OS === 'web') return;
  try { SecureStore.setItem(PENDING_SHARE_TOKEN_KEY, token); } catch {}
}
export function readPendingShareToken(): string | null {
  if (Platform.OS === 'web') return null;
  try { return SecureStore.getItem(PENDING_SHARE_TOKEN_KEY); } catch { return null; }
}
export function clearPendingShareToken() {
  if (Platform.OS === 'web') return;
  try { SecureStore.deleteItemAsync(PENDING_SHARE_TOKEN_KEY).catch(() => {}); } catch {}
}
import { TASK_TYPES, type TaskType } from '@/lib/constants';
import type { GradeThreshold } from '@/types/database';

// ── Snapshot shape (built by the share-course edge function) ────────
// Kept permissive on read: an older/newer sender could omit fields, so every
// consumer coalesces. Mirrors migration 026's documented snapshot json.
export interface SharedCourseSnapshot {
  course: {
    name: string;
    instructor: string | null;
    color: string;
    icon: string;
    grade_scale: GradeThreshold[] | null;
  };
  tasks: Array<{
    title: string;
    type: string;
    due_date: string | null;
    due_time: string | null;
    weight: number | null;
    description: string | null;
    is_extra_credit: boolean;
  }>;
  owner_name: string | null;
  shared_at: string;
}

// resolve_course_share returns one of these statuses. Only 'ok' carries a
// snapshot; the join screen shows a clean state for the rest.
export type ShareResolveStatus = 'ok' | 'not_found' | 'expired' | 'revoked';

export interface ResolvedShare {
  status: ShareResolveStatus;
  snapshot: SharedCourseSnapshot | null;
}

export interface ImportResult {
  courseId: string;
  semesterId: string;
  courseName: string;
  taskCount: number;
}

async function getUserId(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session.user.id;
}

// ── SENDING (Pro) ───────────────────────────────────────────────────

/**
 * Create a share link for a course. Returns the semora://join?token=... URL to
 * hand to the native Share sheet. Throws with a `.code` of 'PRO_REQUIRED' when
 * the server rejects a free user (the caller routes to the paywall).
 */
export async function createShareLink(courseId: string): Promise<{ token: string; url: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('Supabase URL not configured');

  // Direct fetch (like lib/tutor.ts) so we can read the server's structured
  // { error, code } body — supabase.functions.invoke swallows the JSON on
  // non-2xx, which would lose the PRO_REQUIRED code the caller needs.
  const response = await fetch(`${supabaseUrl}/functions/v1/share-course`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ action: 'create', courseId }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    const e = new Error(err.error || `Server error: ${response.status}`) as Error & {
      code?: string;
      status?: number;
    };
    e.code = err.code;
    e.status = response.status;
    throw e;
  }

  const data = (await response.json()) as { token: string; url: string };
  return data;
}

// ── RECEIVING (free) ────────────────────────────────────────────────

/**
 * Resolve a share token to its snapshot + status. Any authenticated user can
 * call this (RPC is granted to `authenticated`); a recipient never reads the
 * owner's rows or the course_shares table directly.
 */
export async function resolveShare(token: string): Promise<ResolvedShare> {
  const { data, error } = await supabase.rpc('resolve_course_share', { share_token: token });
  if (error) throw error;
  // The RPC returns jsonb { status, snapshot }. Coalesce defensively so a
  // malformed row surfaces as 'not_found' rather than crashing the screen.
  const status = (data?.status as ShareResolveStatus) ?? 'not_found';
  const snapshot = (data?.snapshot as SharedCourseSnapshot | null) ?? null;
  return { status, snapshot };
}

// Coerce an arbitrary snapshot task `type` to a valid TaskType (the sender
// could be a newer build). Unknown → 'other', matching the parser's fallback.
function coerceTaskType(t: unknown): TaskType {
  return (TASK_TYPES as readonly string[]).includes(t as string) ? (t as TaskType) : 'other';
}

/**
 * Find (or create) the recipient's current semester to attach the imported
 * course to. Mirrors lib/syllabus.findOrCreateSemester's name resolution but
 * without syllabus-specific term hints — a shared course has no term metadata,
 * so we file it under the recipient's current term. A free user's single-
 * semester cap is enforced by the DB trigger; the error surfaces via the
 * import caller's isFreeLimitError handling.
 */
async function findOrCreateCurrentSemester(userId: string): Promise<string> {
  const name = suggestCurrentSemesterName();

  const escapedName = name.replace(/[%_]/g, '\\$&');
  const { data: existing } = await supabase
    .from('semesters')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', escapedName)
    .limit(1);
  if (existing && existing.length > 0) return existing[0].id;

  // No matching term — fall back to the user's most recent semester if they
  // already have one, so a free user at their 1-semester cap can still import
  // (the course lands in their existing term instead of tripping the semester
  // trigger). Only create a brand-new semester when they have none at all.
  const { data: anySemester } = await supabase
    .from('semesters')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (anySemester && anySemester.length > 0) return anySemester[0].id;

  const { data: created, error } = await supabase
    .from('semesters')
    .insert({ user_id: userId, name })
    .select('id')
    .single();
  // Preserve the original error so the caller can detect P0001 (free-tier
  // semester trigger) via isFreeLimitError.
  if (error) throw error;
  return created.id;
}

/**
 * Import a shared course into the caller's account as a PRIVATE COPY. FREE for
 * the recipient — the DB triggers (enforce_free_course_limit) still gate the
 * copy, so a free user past their course cap gets a P0001 the caller surfaces
 * as an Upgrade prompt via isFreeLimitError.
 *
 * Returns the new course/semester ids + task count for navigation + UX.
 */
export async function importSharedCourse(token: string): Promise<ImportResult> {
  const userId = await getUserId();

  const { status, snapshot } = await resolveShare(token);
  if (status !== 'ok' || !snapshot) {
    // Surface the exact status so the join screen can distinguish
    // expired/revoked/invalid. Coded error for the caller to branch on.
    const e = new Error(
      status === 'expired'
        ? 'This share link has expired.'
        : status === 'revoked'
          ? 'This share link was turned off by its owner.'
          : 'This share link is invalid.',
    ) as Error & { code?: string };
    e.code = `SHARE_${status.toUpperCase()}`;
    throw e;
  }

  const semesterId = await findOrCreateCurrentSemester(userId);

  // 1. Create the course copy under the recipient's user_id. The
  //    enforce_free_course_limit trigger fires here for free users; its P0001
  //    is preserved (not wrapped) so isFreeLimitError catches it.
  const { data: course, error: courseErr } = await supabase
    .from('courses')
    .insert({
      user_id: userId,
      semester_id: semesterId,
      name: snapshot.course.name,
      instructor: snapshot.course.instructor ?? null,
      color: snapshot.course.color,
      icon: snapshot.course.icon,
      // grade_scale is optional on insert (courses has a default); only set it
      // when the snapshot carried one so we don't overwrite the default with null.
      ...(snapshot.course.grade_scale ? { grade_scale: snapshot.course.grade_scale } : {}),
    })
    .select('id, name')
    .single();
  if (courseErr) throw courseErr;

  // 2. Copy the tasks. New ids (server default), recipient's user_id, and a
  //    reset completion/score state so they start fresh — only deadlines +
  //    weights + descriptions carry over. Tasks without a due_date are skipped
  //    (tasks.due_date is NOT NULL — the sender's snapshot may include TBA
  //    items the free/legacy review path dropped; skip rather than fail).
  const taskRows = (snapshot.tasks ?? [])
    .filter((t) => typeof t.due_date === 'string' && t.due_date)
    .map((t) => ({
      user_id: userId,
      course_id: course.id,
      title: t.title,
      type: coerceTaskType(t.type),
      due_date: t.due_date as string,
      due_time: t.due_time ?? null,
      weight: typeof t.weight === 'number' ? t.weight : null,
      description: t.description ?? null,
      is_extra_credit: t.is_extra_credit ?? false,
      is_completed: false,
      source: 'manual' as const,
    }));

  if (taskRows.length > 0) {
    const { error: tasksErr } = await supabase.from('tasks').insert(taskRows);
    // A task-copy failure shouldn't strand the user with a half-imported
    // course, but the course itself is already valuable (matches syllabus's
    // "course + tasks already saved are more valuable" philosophy). Throw so
    // the caller can show the real error — the course row remains and the
    // user can retry or add tasks manually.
    if (tasksErr) throw tasksErr;
  }

  return {
    courseId: course.id,
    semesterId,
    courseName: course.name,
    taskCount: taskRows.length,
  };
}
