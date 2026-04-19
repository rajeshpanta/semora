import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Semester, Course, Task, NewSemester, NewCourse, NewTask } from '@/types/database';
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
        .select('*')
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
        .select('*')
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
      const { error } = await supabase.from('courses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidateAll,
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

      // Re-sync to calendar if enabled
      if (isSyncEnabled()) {
        syncTaskToCalendar(result as Task, courseName).catch(() => {});
      }

      // Reschedule notifications if due_date or due_time changed
      if (data.due_date !== undefined || data.due_time !== undefined) {
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

      // Fetch task info before deleting so we can remove the calendar event
      if (isSyncEnabled()) {
        const { data: task } = await supabase
          .from('tasks')
          .select('title, due_date, courses(name)')
          .eq('id', id)
          .single();
        if (task) {
          const courseName = (task as any).courses?.name || 'Course';
          removeTaskFromCalendar(task.title, courseName, task.due_date).catch(() => {});
        }
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

      // Cancel reminders when completing, reschedule when un-completing
      if (is_completed) {
        cancelTaskReminders(id).catch(() => {});
      } else {
        const courseName = (data as any).courses?.name || 'Course';
        scheduleTaskReminders(id, data.title, courseName, data.due_date, data.due_time, data.user_id).catch(() => {});
      }

      return data as Task;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['taskStats'] });
    },
  });
}
