import {
  eachWeekOfInterval,
  endOfWeek,
  format,
  isAfter,
  parseISO,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { calculateCourseGrade } from '@/lib/grades';
import type { Course, GradeCategory, Task } from '@/types/database';

export interface CourseProgressInsight {
  courseId: string;
  name: string;
  color: string;
  grade: number | null;
  letter: string | null;
  gradeTrend: number | null;
  completionRate: number;
  onTimeRate: number | null;
  missingCount: number;
  gradedCount: number;
}

export interface WeeklyCompletionInsight {
  weekStart: string;
  label: string;
  completed: number;
  onTime: number;
}

export interface ProgressInsights {
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  onTimeRate: number | null;
  missingCount: number;
  gradedTasks: number;
  bestCompletionDay: string | null;
  bestCompletionHour: string | null;
  currentWeeklyStreak: number;
  courseInsights: CourseProgressInsight[];
  weekly: WeeklyCompletionInsight[];
}

function dueAt(task: Pick<Task, 'due_date' | 'due_time'>) {
  return new Date(`${task.due_date}T${task.due_time || '23:59:59'}`);
}

function isOnTime(task: Task) {
  if (!task.is_completed || !task.completed_at) return null;
  if (task.submitted_late) return false;
  const completed = parseISO(task.completed_at);
  const due = dueAt(task);
  if (!Number.isFinite(completed.getTime()) || !Number.isFinite(due.getTime())) return null;
  return completed <= due;
}

function taskScore(task: Task): number | null {
  if (task.score != null && Number.isFinite(task.score)) return task.score;
  if (task.points_earned != null && task.points_possible != null && task.points_possible > 0) {
    return task.points_earned / task.points_possible * 100;
  }
  return null;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function gradeTrend(tasks: Task[]): number | null {
  const graded = tasks
    .filter((task) => taskScore(task) != null)
    .sort((a, b) =>
      (a.completed_at || a.updated_at).localeCompare(b.completed_at || b.updated_at),
    );
  if (graded.length < 4) return null;
  const split = Math.max(2, Math.floor(graded.length / 2));
  const previous = average(graded.slice(0, split).map((task) => taskScore(task)!));
  const recent = average(graded.slice(split).map((task) => taskScore(task)!));
  return previous == null || recent == null ? null : round(recent - previous);
}

export function buildProgressInsights(
  courses: Course[],
  tasks: Task[],
  categories: GradeCategory[] = [],
  now = new Date(),
): ProgressInsights {
  const completed = tasks.filter((task) => task.is_completed);
  const onTimeValues = completed.map(isOnTime).filter((value): value is boolean => value != null);
  const missing = tasks.filter(
    (task) => !task.is_completed && isAfter(now, dueAt(task)),
  );
  const graded = tasks.filter((task) => taskScore(task) != null);

  const completionDays = new Map<string, number>();
  const completionHours = new Map<number, number>();
  completed.forEach((task) => {
    if (!task.completed_at) return;
    const date = parseISO(task.completed_at);
    if (!Number.isFinite(date.getTime())) return;
    const day = format(date, 'EEEE');
    completionDays.set(day, (completionDays.get(day) ?? 0) + 1);
    completionHours.set(date.getHours(), (completionHours.get(date.getHours()) ?? 0) + 1);
  });
  const bestCompletionDay =
    [...completionDays.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const bestHour = [...completionHours.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const bestCompletionHour = bestHour == null
    ? null
    : format(new Date(2020, 0, 1, bestHour), 'h a');

  const firstWeek = startOfWeek(subWeeks(now, 7), { weekStartsOn: 1 });
  const lastWeek = startOfWeek(now, { weekStartsOn: 1 });
  const weekStarts = eachWeekOfInterval(
    { start: firstWeek, end: lastWeek },
    { weekStartsOn: 1 },
  );
  const weekly = weekStarts.map((weekStart) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const rows = completed.filter((task) => {
      if (!task.completed_at) return false;
      const date = parseISO(task.completed_at);
      return date >= weekStart && date <= weekEnd;
    });
    return {
      weekStart: format(weekStart, 'yyyy-MM-dd'),
      label: format(weekStart, 'MMM d'),
      completed: rows.length,
      onTime: rows.filter((task) => isOnTime(task) === true).length,
    };
  });

  let currentWeeklyStreak = 0;
  for (let index = weekly.length - 1; index >= 0; index--) {
    if (weekly[index].completed === 0) break;
    currentWeeklyStreak++;
  }

  const courseInsights = courses.map((course) => {
    const rows = tasks.filter((task) => task.course_id === course.id);
    const courseCompleted = rows.filter((task) => task.is_completed);
    const courseOnTime = courseCompleted
      .map(isOnTime)
      .filter((value): value is boolean => value != null);
    const result = calculateCourseGrade(
      rows,
      categories.filter((category) => category.course_id === course.id),
      course.grade_scale,
      course.extra_credit_policy,
    );
    return {
      courseId: course.id,
      name: course.name,
      color: course.color,
      grade: result.percentage,
      letter: result.letter,
      gradeTrend: gradeTrend(rows),
      completionRate: rows.length ? round(courseCompleted.length / rows.length * 100) : 0,
      onTimeRate: courseOnTime.length
        ? round(courseOnTime.filter(Boolean).length / courseOnTime.length * 100)
        : null,
      missingCount: rows.filter((task) => !task.is_completed && isAfter(now, dueAt(task))).length,
      gradedCount: rows.filter((task) => taskScore(task) != null).length,
    };
  });

  return {
    totalTasks: tasks.length,
    completedTasks: completed.length,
    completionRate: tasks.length ? round(completed.length / tasks.length * 100) : 0,
    onTimeRate: onTimeValues.length
      ? round(onTimeValues.filter(Boolean).length / onTimeValues.length * 100)
      : null,
    missingCount: missing.length,
    gradedTasks: graded.length,
    bestCompletionDay,
    bestCompletionHour,
    currentWeeklyStreak,
    courseInsights,
    weekly,
  };
}
