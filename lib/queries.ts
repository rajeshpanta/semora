import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  Semester, Course, Task, NewSemester, NewCourse, NewTask,
  CourseMeeting, NewCourseMeeting,
  CourseOfficeHours, NewCourseOfficeHours,
} from '@/types/database';
import { format, addDays } from 'date-fns';
import { scheduleTaskReminders, cancelTaskReminders } from '@/lib/notifications';
import { syncTaskToCalendar, removeTaskFromCalendar, isSyncEnabled } from '@/lib/calendarSync';

// ── Query Keys ──────────────────────────────────────────────

export const queryKeys = {
  semesters: ['semesters'] as const,
  courses: (semesterId: string) => ['courses', semesterId] as const,
  allCourses: ['courses'] as const,
  tasks: (filters?: TaskFilters) => ['tasks', filters] as const,
  taskStats: (sid?: string | null) => ['taskStats', sid] as const,
  task: (id: string) => ['task', id] as const,
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

export function useTodayTasks(semesterId: string | null) {
  const today = format(new Date(), 'yyyy-MM-dd');
  return useTasks(
    semesterId
      ? { semesterId, dueDateFrom: today, dueDateTo: today, isCompleted: false }
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

export const FREE_SCAN_LIMIT = 2;

export function useScanCount() {
  return useQuery({
    queryKey: ['scanCount'],
    queryFn: async () => {
      const userId = await getUserId();
      const { count, error } = await supabase
        .from('syllabus_uploads')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) throw error;
      return count ?? 0;
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

async function getUserId() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  return session.user.id;
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
        const syncOn = isSyncEnabled();
        for (const t of tasks) {
          cancelTaskReminders(t.id).catch(() => {});
          if (syncOn) removeTaskFromCalendar(t.id).catch(() => {});
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
      const { data: result, error } = await supabase
        .from('courses')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return result as Course;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses(result.semester_id) });
      qc.invalidateQueries({ queryKey: queryKeys.course(result.id) });
      qc.invalidateQueries({ queryKey: queryKeys.allCourses });
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
        const syncOn = isSyncEnabled();
        for (const t of tasks) {
          cancelTaskReminders(t.id).catch(() => {});
          if (syncOn) removeTaskFromCalendar(t.id).catch(() => {});
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
    mutationFn: async (data: NewTask & { _courseName?: string }) => {
      const { _courseName, ...insertData } = data;
      const user_id = await getUserId();
      const { data: result, error } = await supabase
        .from('tasks')
        .insert({ ...insertData, source: insertData.source || 'manual', user_id })
        .select()
        .single();
      if (error) throw error;

      // Schedule local notifications
      scheduleTaskReminders(
        result.id,
        result.title,
        _courseName || 'Course',
        result.due_date,
        result.due_time,
        result.user_id,
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
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, _courseName, ...data }: { id: string; _courseName?: string } & Partial<NewTask>) => {
      const { data: result, error } = await supabase
        .from('tasks')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;

      // Resolve course name once for calendar and notifications
      let courseName = _courseName || '';
      if (!courseName) {
        const { data: course } = await supabase
          .from('courses')
          .select('name')
          .eq('id', result.course_id)
          .single();
        courseName = course?.name || 'Course';
      }

      // Re-sync to calendar if enabled (only for incomplete tasks)
      if (isSyncEnabled() && !result.is_completed) {
        syncTaskToCalendar(result as Task, courseName).catch(() => {});
      }

      // Reschedule notifications if due_date or due_time changed (only for incomplete tasks)
      if (!result.is_completed && (data.due_date !== undefined || data.due_time !== undefined)) {
        await cancelTaskReminders(id).catch(() => {});
        scheduleTaskReminders(
          id, result.title, courseName, result.due_date, result.due_time, result.user_id,
        ).catch(() => {});
      }

      return result as Task;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['taskStats'] });
      qc.invalidateQueries({ queryKey: queryKeys.task(result.id) });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      cancelTaskReminders(id).catch(() => {});

      if (isSyncEnabled()) {
        removeTaskFromCalendar(id).catch(() => {});
      }

      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['taskStats'] });
    },
  });
}

export function useToggleTaskComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_completed, submitted_late }: { id: string; is_completed: boolean; submitted_late?: boolean }) => {
      const updateData: any = {
        is_completed,
        completed_at: is_completed ? new Date().toISOString() : null,
      };
      if (submitted_late !== undefined) updateData.submitted_late = submitted_late;

      const { data, error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', id)
        .select('*, courses(name)')
        .single();
      if (error) throw error;

      // Cancel reminders and remove from calendar when completing,
      // reschedule and re-sync when un-completing
      const courseName = (data as any).courses?.name || 'Course';
      if (is_completed) {
        cancelTaskReminders(id).catch(() => {});
        if (isSyncEnabled()) {
          removeTaskFromCalendar(id).catch(() => {});
        }
      } else {
        scheduleTaskReminders(id, data.title, courseName, data.due_date, data.due_time, data.user_id).catch(() => {});
        if (isSyncEnabled()) {
          syncTaskToCalendar(data as Task, courseName).catch(() => {});
        }
      }

      return data as Task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['taskStats'] });
    },
  });
}
