import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  Semester, Course, Task, NewSemester, NewCourse, NewTask,
  CourseMeeting, NewCourseMeeting,
  CourseOfficeHours, NewCourseOfficeHours,
  TaskSubtask, NewTaskSubtask, StudyBlock, StudyPlannerSettings, StudyPlanChange,
  GradeCategory, NewGradeCategory, GpaScaleEntry,
} from '@/types/database';
import { format, addDays } from 'date-fns';
import { useAppStore } from '@/store/appStore';
import { scheduleTaskReminders, cancelTaskReminders } from '@/lib/notifications';
import {
  syncTaskToCalendar, removeTaskFromCalendar, isSyncEnabled, isSyncTrackingActive,
  syncMeetingToCalendar, removeMeetingFromCalendar, isMeetingSyncEnabled, isMeetingSyncTrackingActive,
} from '@/lib/calendarSync';
import { showTaskCelebration } from '@/lib/taskCelebration';
import {
  enqueueOfflineMutation,
  isDeviceOnline,
  isNetworkFailure,
} from '@/lib/offlineSync';
import type { QueryClient } from '@tanstack/react-query';

// ── Query Keys ──────────────────────────────────────────────

export const queryKeys = {
  semesters: ['semesters'] as const,
  courses: (semesterId: string) => ['courses', semesterId] as const,
  allCourses: ['courses'] as const,
  tasks: (filters?: TaskFilters) => ['tasks', filters] as const,
  taskStats: (sid?: string | null) => ['taskStats', sid] as const,
  task: (id: string) => ['task', id] as const,
  subtasks: (taskId: string) => ['taskSubtasks', taskId] as const,
  studyBlocks: (semesterId?: string | null) => ['studyBlocks', semesterId] as const,
  studyPlanChanges: (semesterId?: string | null) => ['studyPlanChanges', semesterId] as const,
  studyPlannerSettings: ['studyPlannerSettings'] as const,
  gradeCategories: (courseId: string) => ['gradeCategories', courseId] as const,
  semesterGradeCategories: (semesterId: string) => ['gradeCategories', 'semester', semesterId] as const,
  gpaScale: ['gpaScale'] as const,
  course: (id: string) => ['course', id] as const,
  // Course meetings live as joined data on the course rows (useCourses/
  // useCourse select with course_meetings(*)). Mutations invalidate the
  // course caches above. No standalone key needed for fetching.
};

// ── Types ───────────────────────────────────────────────────

export interface TaskFilters {
  courseId?: string;
  isCompleted?: boolean;
  dueDateFrom?: string;
  dueDateTo?: string;
  semesterId?: string | null;
}

export type TaskWithCourse = Task & {
  courses: Pick<Course, 'name' | 'color' | 'icon' | 'semester_id'>;
};

export type StudyBlockWithTask = StudyBlock & {
  tasks: Pick<Task, 'title' | 'type' | 'due_date' | 'due_time' | 'course_id'> & {
    courses: Pick<Course, 'name' | 'color' | 'semester_id'>;
  };
};

// ── Query Hooks ─────────────────────────────────────────────

export function useSemesters() {
  return useQuery({
    queryKey: queryKeys.semesters,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('semesters')
        .select('*')
        .order('start_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Semester[];
    },
  });
}

export function useCourses(semesterId: string | null) {
  return useQuery({
    queryKey: queryKeys.courses(semesterId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('*, course_meetings(*), course_office_hours(*)')
        .eq('semester_id', semesterId!)
        .order('name');
      if (error) throw error;
      return data as Course[];
    },
    enabled: !!semesterId,
  });
}

export function useCourse(id: string) {
  return useQuery({
    queryKey: queryKeys.course(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courses')
        .select('*, course_meetings(*), course_office_hours(*)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as Course;
    },
    // Guard against an empty id (e.g. the AI tutor in general, no-course mode):
    // .eq('id','').single() throws on the uuid column and retries a doomed
    // request. Every real caller passes a route-provided id, so this is a no-op
    // for them.
    enabled: !!id,
  });
}

export function useTasks(filters?: TaskFilters) {
  return useQuery({
    queryKey: queryKeys.tasks(filters),
    queryFn: async () => {
      let query = supabase
        .from('tasks')
        .select('*, courses!inner(name, color, icon, semester_id)');

      if (filters?.semesterId) {
        query = query.eq('courses.semester_id', filters.semesterId);
      }
      if (filters?.courseId) {
        query = query.eq('course_id', filters.courseId);
      }
      if (filters?.isCompleted !== undefined) {
        query = query.eq('is_completed', filters.isCompleted);
      }
      if (filters?.dueDateFrom) {
        query = query.gte('due_date', filters.dueDateFrom);
      }
      if (filters?.dueDateTo) {
        query = query.lte('due_date', filters.dueDateTo);
      }

      const { data, error } = await query
        .order('due_date')
        .order('due_time', { nullsFirst: false });

      if (error) throw error;
      return data as TaskWithCourse[];
    },
    enabled: !filters || !('semesterId' in filters) || !!filters.semesterId,
  });
}

export function useTask(id: string) {
  return useQuery({
    queryKey: queryKeys.task(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, courses(name, color, icon)')
        .eq('id', id)
        .single();
      if (error) throw error;
      return data as TaskWithCourse;
    },
  });
}

export function useTaskSubtasks(taskId: string) {
  return useQuery({
    queryKey: queryKeys.subtasks(taskId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_subtasks')
        .select('*')
        .eq('task_id', taskId)
        .order('position')
        .order('created_at');
      if (error) throw error;
      return data as TaskSubtask[];
    },
    enabled: !!taskId,
  });
}

export function useStudyPlannerSettings() {
  return useQuery({
    queryKey: queryKeys.studyPlannerSettings,
    queryFn: async () => {
      const userId = await getUserId();
      const { data, error } = await supabase
        .from('profiles')
        .select('study_daily_minutes, study_session_minutes, study_weekday_start, study_weekend_start, study_include_weekends, study_auto_reschedule, study_avoid_calendar_conflicts')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data as StudyPlannerSettings;
    },
  });
}

export function useGradeCategories(courseId?: string | null) {
  return useQuery({
    queryKey: queryKeys.gradeCategories(courseId || ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grade_categories')
        .select('*')
        .eq('course_id', courseId!)
        .order('position')
        .order('created_at');
      if (error) throw error;
      return (data || []) as GradeCategory[];
    },
    enabled: !!courseId,
  });
}

export function useSemesterGradeCategories(semesterId?: string | null) {
  return useQuery({
    queryKey: queryKeys.semesterGradeCategories(semesterId || ''),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grade_categories')
        .select('*, courses!inner(semester_id)')
        .eq('courses.semester_id', semesterId!)
        .order('position');
      if (error) throw error;
      return (data || []) as unknown as GradeCategory[];
    },
    enabled: !!semesterId,
  });
}

export function useGpaScale() {
  return useQuery({
    queryKey: queryKeys.gpaScale,
    queryFn: async () => {
      const userId = await getUserId();
      const { data, error } = await supabase
        .from('profiles')
        .select('gpa_scale')
        .eq('id', userId)
        .single();
      if (error) throw error;
      return (data.gpa_scale || []) as GpaScaleEntry[];
    },
  });
}

export function useStudyBlocks(semesterId?: string | null) {
  return useQuery({
    queryKey: queryKeys.studyBlocks(semesterId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('study_blocks')
        .select('*, tasks!inner(title, type, due_date, due_time, course_id, courses!inner(name, color, semester_id))')
        .order('scheduled_date')
        .order('start_time');
      if (error) throw error;
      const rows = (data || []) as unknown as StudyBlockWithTask[];
      return semesterId
        ? rows.filter((block) => block.tasks.courses.semester_id === semesterId)
        : rows;
    },
    enabled: semesterId !== null,
  });
}

export function useStudyPlanChanges(semesterId?: string | null) {
  return useQuery({
    queryKey: queryKeys.studyPlanChanges(semesterId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('study_plan_changes')
        .select('*')
        .eq('semester_id', semesterId!)
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) throw error;
      return (data || []) as StudyPlanChange[];
    },
    enabled: !!semesterId,
  });
}

export function useTodayTasks(semesterId: string | null) {
  const today = format(new Date(), 'yyyy-MM-dd');
  return useTasks(
    semesterId
      ? { semesterId, dueDateFrom: today, dueDateTo: today }
      : { semesterId: null }
  );
}

export function useDueSoonTasks(semesterId: string | null) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const soon = format(addDays(new Date(), 3), 'yyyy-MM-dd');
  return useTasks(
    semesterId
      ? { semesterId, dueDateFrom: today, dueDateTo: soon, isCompleted: false }
      : { semesterId: null }
  );
}

export function useTaskStats(semesterId: string | null) {
  return useQuery({
    queryKey: queryKeys.taskStats(semesterId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('is_completed, courses!inner(semester_id)')
        .eq('courses.semester_id', semesterId!);
      if (error) throw error;

      const total = data.length;
      const completed = data.filter((t: any) => t.is_completed).length;
      return { total, completed, pending: total - completed };
    },
    enabled: !!semesterId,
  });
}

/**
 * Whether the user has ANY incomplete task, across all semesters. Gates the
 * "turn on reminders" nudge so it only reaches users who actually have
 * deadlines to be reminded about — brand-new users with no tasks never see it
 * (they get the in-context primer at their first syllabus save instead).
 * Scoped to user_id, not the selected semester, to match
 * rescheduleAllTaskReminders, which schedules across every incomplete task.
 */
export function useHasPendingTasks() {
  return useQuery({
    // Rides the ['tasks'] key prefix on purpose: every task mutation already
    // calls invalidateQueries({ queryKey: ['tasks'] }), so this gate refreshes
    // automatically with no per-mutation wiring and no in-session staleness.
    queryKey: ['tasks', 'hasPending'],
    queryFn: async () => {
      const userId = await getUserId();
      const { count, error } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_completed', false);
      if (error) throw error;
      return (count ?? 0) > 0;
    },
  });
}

// Free users get FREE_SCAN_LIMIT syllabus scans per CALENDAR MONTH (not
// lifetime). The window resets at the start of each month, UTC. Everything
// that counts scans — this hook, the processSyllabus pre-check, the
// parse-syllabus edge function, and the enforce_free_scan_limit DB trigger —
// MUST use this same UTC month boundary and the same limit, or the three
// layers disagree and the user is either blocked early or bypasses the cap.
export const FREE_SCAN_LIMIT = 5;

/**
 * Start of the current calendar month, in UTC, as an ISO string — the lower
 * bound of the free-scan counting window. Anchored to UTC (Date.UTC) so it
 * exactly matches the DB trigger's `date_trunc('month', now() AT TIME ZONE
 * 'UTC') AT TIME ZONE 'UTC'` and the edge function's identical computation.
 */
export function freeScanWindowStartIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export function useScanCount() {
  return useQuery({
    queryKey: ['scanCount'],
    // Always treat as stale so the count is re-fetched whenever the scan tab
    // mounts/focuses (and on explicit invalidation after a scan completes).
    // A 60s-cached count let the pill claim "free scans left" right after the
    // user burned one — the server gate then disagreed, which read as a bug.
    staleTime: 0,
    queryFn: async () => {
      const userId = await getUserId();
      // Mirror the server's free-scan gate EXACTLY (parse-syllabus step 2b):
      // effective scans this month = max(gemini_call_log 'success' rows,
      // syllabus_uploads rows) since the start of the UTC month. Counting
      // uploads alone let the pill promise a free scan the server then 402'd —
      // a client that abandoned an extraction (or an old build that failed the
      // post-extraction insert) has a success-log row but no upload row. The
      // call-log read needs migration 022's SELECT-own-rows policy.
      const monthStart = freeScanWindowStartIso();
      const [uploadsRes, callLogRes] = await Promise.all([
        supabase
          .from('syllabus_uploads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .gte('created_at', monthStart),
        supabase
          .from('gemini_call_log')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'success')
          .gte('created_at', monthStart),
      ]);
      if (uploadsRes.error) throw uploadsRes.error;
      const uploads = uploadsRes.count ?? 0;
      // Degrade gracefully, in this order: if the call-log read fails (e.g.
      // migration 022 not yet applied in prod), fall back to uploads-only
      // counting — a slightly optimistic pill beats a broken scan tab, and
      // the server gate still has the final say at scan time.
      if (callLogRes.error) return uploads;
      return Math.max(uploads, callLogRes.count ?? 0);
    },
  });
}

// Latest uploaded syllabus for a course. Used by the course detail
// screen to render a "View Syllabus" link — the storage path is signed
// on demand when the user taps, so we only persist the cheap pointer
// here. Returns null when nothing has been uploaded for this course.
export function useLatestSyllabus(courseId: string | null | undefined) {
  return useQuery({
    queryKey: ['syllabusUploads', 'latest', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('syllabus_uploads')
        .select('storage_path, file_name, created_at')
        .eq('course_id', courseId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });
}

// ── Mutation Hooks ──────────────────────────────────────────

// Last id seen from a real session. Kept because getUserId() runs inside
// mutations, which must still work with no network.
let lastKnownUserId: string | null = null;
supabase.auth.onAuthStateChange((_event, session) => {
  lastKnownUserId = session?.user.id ?? null;
});

/**
 * The signed-in user's id, without requiring the network.
 *
 * getSession() refreshes an expired access token, and a refresh is an HTTP
 * call. Offline it stalls for the full timeout and then throws, so every
 * mutation that needed an id threw BEFORE reaching the offline queue — a task
 * you completed on a plane was simply dropped, and the queue that exists to
 * catch exactly that never saw it. Tokens last an hour, which is why offline
 * edits worked right after going offline and silently stopped later.
 *
 * The id is stable for the life of a session, so a cached one is as correct as
 * a freshly fetched one; only the token needs refreshing, and the request the
 * caller is about to make will surface an auth failure by itself.
 */
async function getUserId() {
  try {
    const settled = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    const id = settled?.data?.session?.user?.id;
    if (id) {
      lastKnownUserId = id;
      return id;
    }
  } catch {
    // fall through to the cached id
  }
  if (lastKnownUserId) return lastKnownUserId;
  throw new Error('Not authenticated');
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['taskStats'] });
    qc.invalidateQueries({ queryKey: ['courses'] });
    qc.invalidateQueries({ queryKey: ['semesters'] });
  };
}

function findCachedTask(qc: QueryClient, id: string): TaskWithCourse | Task | null {
  const detail = qc.getQueryData<TaskWithCourse>(queryKeys.task(id));
  if (detail) return detail;
  for (const [, rows] of qc.getQueriesData<TaskWithCourse[]>({ queryKey: ['tasks'] })) {
    const match = rows?.find((task) => task.id === id);
    if (match) return match;
  }
  return null;
}

function patchCachedTask(qc: QueryClient, id: string, patch: Record<string, unknown>) {
  qc.setQueryData(queryKeys.task(id), (current: any) =>
    current ? { ...current, ...patch } : current,
  );
  qc.setQueriesData({ queryKey: ['tasks'] }, (current: any) =>
    Array.isArray(current)
      ? current.map((task) => (task?.id === id ? { ...task, ...patch } : task))
      : current,
  );
}

// Semesters

export function useCreateSemester() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: NewSemester) => {
      const user_id = await getUserId();
      const { data: result, error } = await supabase
        .from('semesters')
        .insert({ ...data, user_id })
        .select()
        .single();
      if (error) throw error;
      return result as Semester;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.semesters });
    },
  });
}

export function useUpdateSemester() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<NewSemester>) => {
      const { data: result, error } = await supabase
        .from('semesters')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result as Semester;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.semesters });
    },
  });
}

export function useDeleteSemester() {
  const invalidateAll = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: string) => {
      // Postgres cascades the child tasks, but local notifications and
      // synced calendar events live on the device — clean them up first
      // so the user doesn't get push reminders for deleted tasks.
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, courses!inner(semester_id)')
        .eq('courses.semester_id', id);
      if (tasks?.length) {
        const syncOn = isSyncTrackingActive();
        for (const t of tasks) {
          cancelTaskReminders(t.id).catch(() => {});
          if (syncOn) removeTaskFromCalendar(t.id).catch(() => {});
        }
      }

      // Class-schedule events are keyed by meeting id — collect them before
      // the cascade removes the rows they belong to.
      if (isMeetingSyncTrackingActive()) {
        const { data: meetings } = await supabase
          .from('course_meetings')
          .select('id, courses!inner(semester_id)')
          .eq('courses.semester_id', id);
        for (const m of meetings ?? []) {
          removeMeetingFromCalendar(m.id).catch(() => {});
        }
      }

      const { error } = await supabase.from('semesters').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });
}

// Courses

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: NewCourse) => {
      const user_id = await getUserId();
      const { data: result, error } = await supabase
        .from('courses')
        .insert({ ...data, user_id })
        .select()
        .single();
      if (error) throw error;
      return result as Course;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses(variables.semester_id) });
      qc.invalidateQueries({ queryKey: queryKeys.allCourses });
    },
  });
}

export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<NewCourse>) => {
      const userId = await getUserId();
      // Same queue-and-replay the task edits use. The offline queue is
      // entity-agnostic, so a course edit made on a plane is held and applied
      // on reconnect instead of spinning until the app is closed.
      const queueOffline = async () => {
        const cached = qc.getQueryData<Course>(queryKeys.course(id));
        if (!cached) {
          throw new Error('Open this course once while online before editing it offline.');
        }
        await enqueueOfflineMutation({
          userId,
          entity: 'courses',
          operation: 'update',
          recordId: id,
          payload: data as Record<string, unknown>,
          baseUpdatedAt: cached.updated_at ?? null,
        });
        const optimistic = { ...cached, ...data, updated_at: new Date().toISOString() } as Course;
        qc.setQueryData(queryKeys.course(id), optimistic);
        return optimistic;
      };

      if (!isDeviceOnline()) return await queueOffline();
      try {
        const { data: result, error } = await supabase
          .from('courses')
          .update(data)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return result as Course;
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        return await queueOffline();
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses(result.semester_id) });
      qc.invalidateQueries({ queryKey: queryKeys.course(result.id) });
      qc.invalidateQueries({ queryKey: queryKeys.allCourses });
      // Task rows carry a joined snapshot of course.name/color/icon
      // (see useTasks select). Invalidate so open lists pick up the
      // edit instead of waiting out the 1-min stale time.
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteCourse() {
  const invalidateAll = useInvalidateAll();
  return useMutation({
    mutationFn: async (id: string) => {
      // Same as semester delete: tear down device-side reminders and
      // calendar events for cascaded tasks before the DB delete.
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id')
        .eq('course_id', id);
      if (tasks?.length) {
        const syncOn = isSyncTrackingActive();
        for (const t of tasks) {
          cancelTaskReminders(t.id).catch(() => {});
          if (syncOn) removeTaskFromCalendar(t.id).catch(() => {});
        }
      }

      // Same for the course's class-schedule events (keyed by meeting id).
      if (isMeetingSyncTrackingActive()) {
        const { data: meetings } = await supabase
          .from('course_meetings')
          .select('id')
          .eq('course_id', id);
        for (const m of meetings ?? []) {
          removeMeetingFromCalendar(m.id).catch(() => {});
        }
      }

      const { error } = await supabase.from('courses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
  });
}

// Course meetings
//
// Meetings are read as joined data on courses (useCourses/useCourse).
// These mutations write directly to course_meetings and invalidate the
// course caches so the join refreshes. The cross-tenant FK trigger
// (migration 018) blocks writes whose course_id resolves to another
// user's course.

export function useCreateCourseMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: NewCourseMeeting) => {
      const user_id = await getUserId();
      const { data: result, error } = await supabase
        .from('course_meetings')
        .insert({ ...data, user_id })
        .select()
        .single();
      if (error) throw error;

      // Push the new block to the device calendar when class-schedule sync
      // is on — same fire-and-forget pattern as the task mutations.
      if (isMeetingSyncEnabled()) {
        syncMeetingToCalendar(result as CourseMeeting).catch(() => {});
      }

      return result as CourseMeeting;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.course(result.course_id) });
      qc.invalidateQueries({ queryKey: queryKeys.allCourses });
    },
  });
}

export function useUpdateCourseMeeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<NewCourseMeeting>) => {
      const { data: result, error } = await supabase
        .from('course_meetings')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      // Re-sync the meeting's recurring events (handles day/time/kind
      // changes by replacing the series — see applyMeetingEvents).
      if (isMeetingSyncEnabled()) {
        syncMeetingToCalendar(result as CourseMeeting).catch(() => {});
      }

      return result as CourseMeeting;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.course(result.course_id) });
      qc.invalidateQueries({ queryKey: queryKeys.allCourses });
    },
  });
}

export function useDeleteCourseMeeting() {
  const qc = useQueryClient();
  return useMutation({
    // Pass courseId alongside id so onSuccess can scope invalidation
    // without re-fetching the row that was just deleted.
    mutationFn: async ({ id }: { id: string; courseId: string }) => {
      // Tracking (not Pro) gate, matching task deletes: removing stale
      // events must keep working after a subscription lapses.
      if (isMeetingSyncTrackingActive()) {
        removeMeetingFromCalendar(id).catch(() => {});
      }

      const { error } = await supabase.from('course_meetings').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.course(variables.courseId) });
      qc.invalidateQueries({ queryKey: queryKeys.allCourses });
    },
  });
}

// Course office hours — same shape as course meetings; reads via the
// useCourse / useCourses join, mutations invalidate course caches.

export function useCreateCourseOfficeHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: NewCourseOfficeHours) => {
      const user_id = await getUserId();
      const { data: result, error } = await supabase
        .from('course_office_hours')
        .insert({ ...data, user_id })
        .select()
        .single();
      if (error) throw error;
      return result as CourseOfficeHours;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.course(result.course_id) });
      qc.invalidateQueries({ queryKey: queryKeys.allCourses });
    },
  });
}

export function useUpdateCourseOfficeHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<NewCourseOfficeHours>) => {
      const { data: result, error } = await supabase
        .from('course_office_hours')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result as CourseOfficeHours;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.course(result.course_id) });
      qc.invalidateQueries({ queryKey: queryKeys.allCourses });
    },
  });
}

export function useDeleteCourseOfficeHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; courseId: string }) => {
      const { error } = await supabase.from('course_office_hours').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.course(variables.courseId) });
      qc.invalidateQueries({ queryKey: queryKeys.allCourses });
    },
  });
}

// Tasks

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: NewTask & { _courseName?: string; _subtasks?: string[] }) => {
      const { _courseName, _subtasks, ...insertData } = data;
      const user_id = await getUserId();
      const { data: result, error } = await supabase
        .from('tasks')
        .insert({ ...insertData, source: insertData.source || 'manual', user_id })
        .select()
        .single();
      if (error) throw error;

      if (_subtasks?.length) {
        const { error: subtaskError } = await supabase.from('task_subtasks').insert(
          _subtasks.map((title, position) => ({
            user_id, task_id: result.id, title: title.trim(), position,
          })),
        );
        if (subtaskError) {
          // Keep creation all-or-nothing from the student's perspective. A
          // retry after a partial save would otherwise duplicate the task.
          await supabase.from('tasks').delete().eq('id', result.id);
          throw subtaskError;
        }
      }

      // Schedule local notifications
      scheduleTaskReminders(
        result.id,
        result.title,
        _courseName || 'Course',
        result.due_date,
        result.due_time,
        result.user_id,
        undefined,
        result.reminder_offsets_minutes,
      ).catch(() => {}); // Non-critical

      // Sync to calendar if enabled
      if (isSyncEnabled()) {
        syncTaskToCalendar(result as Task, _courseName || 'Course').catch(() => {});
      }

      return result as Task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['taskStats'] });
      qc.invalidateQueries({ queryKey: ['studyBlocks'] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      _courseName,
      _seriesScope = 'occurrence',
      ...data
    }: {
      id: string;
      _courseName?: string;
      _seriesScope?: 'occurrence' | 'future' | 'all';
    } & Partial<NewTask>) => {
      const userId = await getUserId();
      const cached = findCachedTask(qc, id);
      const queueOffline = async () => {
        if (_seriesScope !== 'occurrence') {
          throw new Error('Connect to the internet to edit an entire recurring series.');
        }
        if (!cached) throw new Error('Open this task once while online before editing it offline.');
        await enqueueOfflineMutation({
          userId,
          entity: 'tasks',
          operation: 'update',
          recordId: id,
          payload: data as Record<string, unknown>,
          baseUpdatedAt: cached.updated_at ?? null,
        });
        const optimistic = {
          ...cached,
          ...data,
          updated_at: new Date().toISOString(),
        } as Task;
        patchCachedTask(qc, id, optimistic as unknown as Record<string, unknown>);
        return optimistic;
      };
      let result: Task;
      let affected: Task[];

      if (!isDeviceOnline()) {
        result = await queueOffline();
        affected = [result];
      } else {
        try {
          if (_seriesScope === 'occurrence') {
            const { data: updated, error } = await supabase
              .from('tasks')
              .update(data)
              .eq('id', id)
              .select()
              .single();
            if (error) throw error;
            result = updated as Task;
            affected = [result];
          } else {
            const { data: updated, error } = await supabase.rpc('update_recurring_task_series', {
              p_task_id: id,
              p_scope: _seriesScope,
              p_patch: data,
            });
            if (error) throw error;
            affected = (updated || []) as Task[];
            result = affected.find((task) => task.id === id) || affected[0];
            if (!result) throw new Error('No recurring tasks were updated.');
          }
        } catch (error) {
          if (!isNetworkFailure(error)) throw error;
          result = await queueOffline();
          affected = [result];
        }
      }

      // Resolve course name once for calendar and notifications
      let courseName = _courseName || (cached as TaskWithCourse | null)?.courses?.name || '';
      if (!courseName && isDeviceOnline()) {
        const { data: course } = await supabase
          .from('courses')
          .select('name')
          .eq('id', result.course_id)
          .single();
        courseName = course?.name || 'Course';
      }

      const reminderFieldsChanged = (
        data.due_date !== undefined || data.due_time !== undefined ||
        data.title !== undefined || data.reminder_offsets_minutes !== undefined
      );

      // Multi-occurrence edits need every future device reminder/calendar row
      // refreshed, not just the occurrence whose detail screen is open.
      for (const updatedTask of affected) {
        if (updatedTask.is_completed) continue;
        if (isSyncEnabled()) {
          syncTaskToCalendar(updatedTask, courseName).catch(() => {});
        }
        if (reminderFieldsChanged || _seriesScope !== 'occurrence') {
          await cancelTaskReminders(updatedTask.id).catch(() => {});
          scheduleTaskReminders(
            updatedTask.id,
            updatedTask.title,
            courseName,
            updatedTask.due_date,
            updatedTask.due_time,
            updatedTask.user_id,
            undefined,
            updatedTask.reminder_offsets_minutes,
          ).catch(() => {});
        }
      }

      return result as Task;
    },
    networkMode: 'always',
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['taskStats'] });
      qc.invalidateQueries({ queryKey: queryKeys.task(result.id) });
      qc.invalidateQueries({ queryKey: ['studyBlocks'] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      cancelTaskReminders(id).catch(() => {});

      if (isSyncTrackingActive()) {
        removeTaskFromCalendar(id).catch(() => {});
      }

      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['taskStats'] });
      qc.invalidateQueries({ queryKey: ['studyBlocks'] });
    },
  });
}

export function useToggleTaskComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id, is_completed, submitted_late, late_penalty_percent,
    }: {
      id: string;
      is_completed: boolean;
      submitted_late?: boolean;
      late_penalty_percent?: number | null;
    }) => {
      const userId = await getUserId();
      const updateData: any = {
        is_completed,
        completed_at: is_completed ? new Date().toISOString() : null,
      };
      if (!is_completed) {
        updateData.submitted_late = false;
        updateData.late_penalty_percent = null;
      } else {
        if (submitted_late !== undefined) updateData.submitted_late = submitted_late;
        if (late_penalty_percent !== undefined) updateData.late_penalty_percent = late_penalty_percent;
        if (submitted_late === false) updateData.late_penalty_percent = null;
      }

      const cached = findCachedTask(qc, id);
      const queueOffline = async () => {
        if (!cached) throw new Error('Open this task once while online before completing it offline.');
        await enqueueOfflineMutation({
          userId,
          entity: 'tasks',
          operation: 'update',
          recordId: id,
          payload: updateData,
          baseUpdatedAt: cached.updated_at ?? null,
        });
        const optimistic = {
          ...cached,
          ...updateData,
          updated_at: new Date().toISOString(),
        } as TaskWithCourse;
        patchCachedTask(qc, id, optimistic as unknown as Record<string, unknown>);
        return optimistic;
      };

      let data: any;
      if (!isDeviceOnline()) {
        data = await queueOffline();
      } else {
        try {
          const response = await supabase
            .from('tasks')
            .update(updateData)
            .eq('id', id)
            .select('*, courses(name)')
            .single();
          if (response.error) throw response.error;
          data = response.data;
        } catch (error) {
          if (!isNetworkFailure(error)) throw error;
          data = await queueOffline();
        }
      }

      // Cancel reminders and remove from calendar when completing,
      // reschedule and re-sync when un-completing
      const courseName = (data as any).courses?.name || 'Course';
      if (is_completed) {
        cancelTaskReminders(id).catch(() => {});
        if (isSyncTrackingActive()) {
          removeTaskFromCalendar(id).catch(() => {});
        }
      } else {
        scheduleTaskReminders(
          id, data.title, courseName, data.due_date, data.due_time, data.user_id,
          undefined, data.reminder_offsets_minutes,
        ).catch(() => {});
        if (isSyncEnabled()) {
          syncTaskToCalendar(data as Task, courseName).catch(() => {});
        }
      }

      // The database creates the next occurrence atomically on completion.
      // Schedule its local reminder/calendar event as soon as it exists.
      if (
        is_completed &&
        data.recurrence_frequency &&
        data.recurrence_series_id &&
        isDeviceOnline()
      ) {
        const { data: next } = await supabase
          .from('tasks')
          .select('*, courses(name)')
          .eq('recurrence_series_id', data.recurrence_series_id)
          .eq('is_completed', false)
          .gt('due_date', data.due_date)
          .order('due_date')
          .limit(1)
          .maybeSingle();
        if (next) {
          const nextCourseName = (next as any).courses?.name || courseName;
          scheduleTaskReminders(
            next.id, next.title, nextCourseName, next.due_date, next.due_time, next.user_id,
            undefined, next.reminder_offsets_minutes,
          ).catch(() => {});
          if (isSyncEnabled()) syncTaskToCalendar(next as Task, nextCourseName).catch(() => {});
        }
      }

      return data as Task;
    },
    networkMode: 'always',
    onSuccess: (data, vars) => {
      // Feeds the review-prompt milestone (10th lifetime completion). Lives
      // here — not in per-screen handlers — because Today, Calendar, course
      // detail, and task detail all complete tasks through this mutation;
      // counting only one screen made the milestone unreachable for users
      // who complete elsewhere. Completion ACTIONS only: un-completing
      // never decrements (see tasksCompletedCount in store/appStore.ts).
      // getState() keeps this hook-free — zustand supports module-scope use.
      if (vars.is_completed) {
        useAppStore.getState().incrementTasksCompleted();
        showTaskCelebration(data.title);
      }
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['taskStats'] });
      // ['tasks'] does NOT prefix-match the single-task key ['task', id] —
      // without this, the task detail screen shows a stale completion state.
      qc.invalidateQueries({ queryKey: ['task'] });
      qc.invalidateQueries({ queryKey: ['studyBlocks'] });
    },
  });
}

export function useCreateTaskSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewTaskSubtask) => {
      const user_id = await getUserId();
      const { data, error } = await supabase
        .from('task_subtasks')
        .insert({ ...input, title: input.title.trim(), user_id })
        .select()
        .single();
      if (error) throw error;
      return data as TaskSubtask;
    },
    onSuccess: (result) => qc.invalidateQueries({ queryKey: queryKeys.subtasks(result.task_id) }),
  });
}

export function useToggleTaskSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, taskId, is_completed }: { id: string; taskId: string; is_completed: boolean }) => {
      const userId = await getUserId();
      const cached = qc.getQueryData<TaskSubtask[]>(queryKeys.subtasks(taskId))?.find((row) => row.id === id);
      const queueOffline = async () => {
        if (!cached) throw new Error('Open this task once while online before editing subtasks offline.');
        await enqueueOfflineMutation({
          userId,
          entity: 'task_subtasks',
          operation: 'update',
          recordId: id,
          payload: { is_completed },
          baseUpdatedAt: cached.updated_at ?? null,
        });
        qc.setQueryData<TaskSubtask[]>(queryKeys.subtasks(taskId), (rows) =>
          rows?.map((row) => row.id === id ? { ...row, is_completed } : row),
        );
      };
      if (!isDeviceOnline()) await queueOffline();
      else {
        try {
          const { error } = await supabase.from('task_subtasks').update({ is_completed }).eq('id', id);
          if (error) throw error;
        } catch (error) {
          if (!isNetworkFailure(error)) throw error;
          await queueOffline();
        }
      }
      return taskId;
    },
    networkMode: 'always',
    onSuccess: (taskId) => qc.invalidateQueries({ queryKey: queryKeys.subtasks(taskId) }),
  });
}

export function useDeleteTaskSubtask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, taskId }: { id: string; taskId: string }) => {
      const { error } = await supabase.from('task_subtasks').delete().eq('id', id);
      if (error) throw error;
      return taskId;
    },
    onSuccess: (taskId) => qc.invalidateQueries({ queryKey: queryKeys.subtasks(taskId) }),
  });
}

export function useUpdateStudyPlannerSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: StudyPlannerSettings) => {
      const userId = await getUserId();
      const { data, error } = await supabase
        .from('profiles')
        .update(settings)
        .eq('id', userId)
        .select('study_daily_minutes, study_session_minutes, study_weekday_start, study_weekend_start, study_include_weekends, study_auto_reschedule, study_avoid_calendar_conflicts')
        .single();
      if (error) throw error;
      return data as StudyPlannerSettings;
    },
    onSuccess: (settings) => qc.setQueryData(queryKeys.studyPlannerSettings, settings),
  });
}

export function useCreateGradeCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewGradeCategory) => {
      const user_id = await getUserId();
      const { data, error } = await supabase
        .from('grade_categories')
        .insert({ ...input, name: input.name.trim(), user_id })
        .select()
        .single();
      if (error) throw error;
      return data as GradeCategory;
    },
    onSuccess: (category) => {
      qc.invalidateQueries({ queryKey: queryKeys.gradeCategories(category.course_id) });
      qc.invalidateQueries({ queryKey: ['gradeCategories'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateGradeCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Partial<NewGradeCategory>) => {
      const userId = await getUserId();
      // Grade weights are edited from the same screens a student opens without
      // signal (a lecture hall, a basement library), so this queues like tasks
      // rather than hanging.
      const queueOffline = async () => {
        const lists = qc.getQueriesData<GradeCategory[]>({ queryKey: ['gradeCategories'] });
        const cached = lists
          .flatMap(([, rows]) => rows ?? [])
          .find((row) => row.id === id);
        if (!cached) {
          throw new Error('Open this course\'s grade setup once while online before editing it offline.');
        }
        await enqueueOfflineMutation({
          userId,
          entity: 'grade_categories',
          operation: 'update',
          recordId: id,
          payload: input as Record<string, unknown>,
          baseUpdatedAt: cached.updated_at ?? null,
        });
        return { ...cached, ...input, updated_at: new Date().toISOString() } as GradeCategory;
      };

      if (!isDeviceOnline()) return await queueOffline();
      try {
        const { data, error } = await supabase
          .from('grade_categories')
          .update(input)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data as GradeCategory;
      } catch (error) {
        if (!isNetworkFailure(error)) throw error;
        return await queueOffline();
      }
    },
    onSuccess: (category) => {
      qc.invalidateQueries({ queryKey: queryKeys.gradeCategories(category.course_id) });
      qc.invalidateQueries({ queryKey: ['gradeCategories'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useDeleteGradeCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, courseId }: { id: string; courseId: string }) => {
      const { error } = await supabase.from('grade_categories').delete().eq('id', id);
      if (error) throw error;
      return courseId;
    },
    onSuccess: (courseId) => {
      qc.invalidateQueries({ queryKey: queryKeys.gradeCategories(courseId) });
      qc.invalidateQueries({ queryKey: ['gradeCategories'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}

export function useUpdateGpaScale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (scale: GpaScaleEntry[]) => {
      const userId = await getUserId();
      const { error } = await supabase
        .from('profiles')
        .update({ gpa_scale: scale })
        .eq('id', userId);
      if (error) throw error;
      return scale;
    },
    onSuccess: (scale) => qc.setQueryData(queryKeys.gpaScale, scale),
  });
}

export function useReplaceStudyPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      semesterId,
      blocks,
    }: {
      semesterId: string;
      blocks: Array<{
        task_id: string;
        scheduled_date: string;
        start_time: string;
        duration_minutes: number;
        reschedule_reason?: 'missed' | 'conflict' | 'rebuild' | null;
        rescheduled_from_date?: string | null;
        coach_reason?: 'exam' | 'grade_risk';
      }>;
    }) => {
      const { data, error } = await supabase.rpc('replace_study_plan', {
        p_semester_id: semesterId,
        p_blocks: blocks,
      });
      if (error) throw error;
      return (data || []) as StudyBlock[];
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.studyBlocks(variables.semesterId) });
      qc.invalidateQueries({ queryKey: ['studyBlocks'] });
    },
  });
}

export function useRecordStudyPlanChanges() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      semesterId,
      changes,
    }: {
      semesterId: string;
      changes: Array<{
        kind: 'habit' | 'missed' | 'calendar' | 'exam' | 'grade_risk' | 'capacity';
        key: string;
        title: string;
        detail: string;
        metadata?: Record<string, unknown>;
      }>;
    }) => {
      if (!changes.length) return;
      const { error } = await supabase.rpc('record_study_plan_changes', {
        p_semester_id: semesterId,
        p_changes: changes,
      });
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.studyPlanChanges(variables.semesterId) });
    },
  });
}

export function useToggleStudyBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_completed }: { id: string; is_completed: boolean }) => {
      const { data, error } = await supabase
        .from('study_blocks')
        .update({ is_completed })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as StudyBlock;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['studyBlocks'] }),
  });
}
