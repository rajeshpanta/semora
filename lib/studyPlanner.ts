import { addDays, differenceInCalendarDays, format } from 'date-fns';
import type { TaskType } from '@/lib/constants';
import type {
  StudyPlannerSettings, StudySessionMinutes, TaskPriority,
} from '@/types/database';
import { taskLoadScore } from '@/lib/workload';
import type { AdaptivePlannerContext } from '@/lib/studyCoach';

export const DEFAULT_STUDY_PLANNER_SETTINGS: StudyPlannerSettings = {
  study_daily_minutes: 90,
  study_session_minutes: 45,
  study_weekday_start: '17:00:00',
  study_weekend_start: '10:00:00',
  study_include_weekends: true,
  study_auto_reschedule: true,
  study_avoid_calendar_conflicts: true,
};

export const DAILY_MINUTE_OPTIONS = [60, 90, 120, 180] as const;
export const STUDY_SESSION_OPTIONS: StudySessionMinutes[] = [25, 45, 50];
export const STUDY_PLAN_HORIZON_DAYS = 14;

// Free tier gets a real, working plan — just a shorter one. A locked teaser
// teaches people the feature is not for them; one working week teaches the
// habit, and the second week becomes a concrete reason to upgrade rather than
// an abstract one. Enforced server-side too (migration 049) so calling the
// replace_study_plan RPC directly cannot widen it.
export const FREE_STUDY_PLAN_HORIZON_DAYS = 7;

export interface PlannerTask {
  id: string;
  title: string;
  type: TaskType;
  course_id: string;
  due_date: string;
  due_time?: string | null;
  start_date?: string | null;
  priority?: TaskPriority | null;
  weight?: number | null;
  estimated_minutes?: number | null;
  is_completed: boolean;
  courses?: { name?: string | null; color?: string | null } | null;
}

export interface PlannerMeeting {
  days_of_week: number[];
  start_time: string | null;
  end_time: string | null;
}

export interface PlannerBusyInterval {
  date: string;
  start_time: string;
  end_time: string;
  title?: string;
}

export interface CompletedStudyBlock {
  task_id: string;
  duration_minutes: number;
  is_completed: boolean;
  scheduled_date?: string;
  start_time?: string;
}

export interface PlannedStudyBlock {
  task_id: string;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  taskTitle: string;
  courseName: string;
  courseColor: string | null;
  dueDate: string;
  /** A concise reason shown beside a session when coach signals affected its priority. */
  coachReason?: 'exam' | 'grade_risk';
}

export interface GeneratedStudyPlan {
  blocks: PlannedStudyBlock[];
  /** Work due inside the planning horizon that could not fit. */
  atRiskMinutes: number;
  /** All effort remaining after the horizon, including intentionally later work. */
  unscheduledMinutes: number;
  totalPlannedMinutes: number;
  taskCount: number;
}

type TaskState = PlannerTask & { remaining: number; carry: number };
type MinuteRange = { start: number; end: number };

const BASE_EFFORT: Record<TaskType, number> = {
  reading: 45,
  assignment: 90,
  quiz: 75,
  exam: 240,
  project: 360,
  other: 60,
};

function roundTo15(minutes: number) {
  return Math.max(15, Math.ceil(minutes / 15) * 15);
}

/** A transparent fallback for tasks where the student has not entered effort. */
export function estimateTaskMinutes(task: Pick<PlannerTask, 'type' | 'weight' | 'estimated_minutes'>): number {
  if (task.estimated_minutes != null && task.estimated_minutes >= 15) {
    return Math.min(2880, Math.round(task.estimated_minutes));
  }
  const base = BASE_EFFORT[task.type] ?? BASE_EFFORT.other;
  const weight = task.weight ?? 0;
  const multiplier = weight >= 25 ? 1.5 : weight >= 15 ? 1.25 : weight >= 8 ? 1.1 : 1;
  return roundTo15(base * multiplier);
}

export function formatStudyDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  if (!mins) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function parseDateKey(value: string): Date | null {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateKey(date: Date) {
  return format(date, 'yyyy-MM-dd');
}

function parseClock(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return Math.max(0, Math.min(1439, hours * 60 + minutes));
}

function clockString(totalMinutes: number) {
  const safe = Math.max(0, Math.min(1439, Math.round(totalMinutes)));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

function plannerDayEnabled(date: Date, settings: StudyPlannerSettings) {
  const day = date.getDay();
  return settings.study_include_weekends || (day !== 0 && day !== 6);
}

function daysAvailable(from: Date, task: PlannerTask, settings: StudyPlannerSettings) {
  const due = parseDateKey(task.due_date) ?? from;
  if (due < from) return 1;
  // A distant deadline should not make today's contribution round to zero,
  // but also should not force an unbounded date walk for bad imported dates.
  const span = Math.min(120, differenceInCalendarDays(due, from));
  let count = 0;
  for (let offset = 0; offset <= span; offset++) {
    const day = addDays(from, offset);
    if (plannerDayEnabled(day, settings)) count += 1;
  }
  return Math.max(1, count);
}

function classRangesForDay(date: Date, meetings: PlannerMeeting[]): MinuteRange[] {
  const weekday = date.getDay();
  return (meetings ?? [])
    .filter((meeting) => meeting.start_time && meeting.days_of_week?.includes(weekday))
    .map((meeting) => {
      const start = parseClock(meeting.start_time, 0);
      const parsedEnd = parseClock(meeting.end_time, start + 60);
      return { start, end: parsedEnd > start ? parsedEnd : start + 60 };
    })
    .sort((a, b) => a.start - b.start);
}

function completedBlockRangesForDay(
  dayKey: string,
  completedBlocks: CompletedStudyBlock[],
): MinuteRange[] {
  return (completedBlocks ?? [])
    .filter((block) => block.is_completed && block.scheduled_date === dayKey && block.start_time)
    .map((block) => {
      const start = parseClock(block.start_time, 0);
      // Keep the same transition buffer used between generated sessions.
      return { start, end: Math.min(24 * 60, start + block.duration_minutes + 10) };
    });
}

function completedMinutesForDay(dayKey: string, completedBlocks: CompletedStudyBlock[]): number {
  return (completedBlocks ?? [])
    .filter((block) => block.is_completed && block.scheduled_date === dayKey)
    .reduce((sum, block) => sum + Math.max(0, block.duration_minutes), 0);
}

function nextFreeStart(cursor: number, duration: number, blocked: MinuteRange[], dayEnd: number): number | null {
  let candidate = cursor;
  while (candidate + duration <= dayEnd) {
    const conflict = blocked.find((range) => candidate < range.end && candidate + duration > range.start);
    if (!conflict) return candidate;
    candidate = conflict.end;
  }
  return null;
}

function taskUrgency(
  task: TaskState,
  day: Date,
  settings: StudyPlannerSettings,
  adaptive?: AdaptivePlannerContext,
) {
  const due = parseDateKey(task.due_date) ?? day;
  const days = differenceInCalendarDays(due, day);
  const urgencyDays = Math.max(0.5, days + 0.5);
  const priority = task.priority === 'high' ? 1.55 : task.priority === 'low' ? 0.78 : 1;
  const pace = task.remaining / daysAvailable(day, task, settings);
  const examBoost = adaptive?.examTaskIds.includes(task.id) ? 1.7 : 1;
  const gradeRiskBoost = adaptive?.gradeRiskCourseIds.includes(task.course_id) ? 1.28 : 1;
  return ((taskLoadScore({ type: task.type, weight: task.weight ?? null }) * priority * examBoost * gradeRiskBoost) / urgencyDays) + pace;
}

function normalizeSettings(settings?: Partial<StudyPlannerSettings>): StudyPlannerSettings {
  const session = settings?.study_session_minutes;
  return {
    study_daily_minutes: Math.max(30, Math.min(480, settings?.study_daily_minutes ?? 90)),
    study_session_minutes: STUDY_SESSION_OPTIONS.includes(session as StudySessionMinutes)
      ? session as StudySessionMinutes
      : 45,
    study_weekday_start: settings?.study_weekday_start || '17:00:00',
    study_weekend_start: settings?.study_weekend_start || '10:00:00',
    study_include_weekends: settings?.study_include_weekends ?? true,
    study_auto_reschedule: settings?.study_auto_reschedule ?? true,
    study_avoid_calendar_conflicts: settings?.study_avoid_calendar_conflicts ?? true,
  };
}

/**
 * Build a deterministic two-week plan. Completed block minutes reduce each
 * task's remaining effort; open blocks are intentionally ignored because the
 * replace RPC removes and rebuilds them. Every visit can therefore carry
 * unfinished work forward without duplicating completed work.
 */
export function generateStudyPlan(
  tasks: PlannerTask[],
  meetings: PlannerMeeting[],
  completedBlocks: CompletedStudyBlock[],
  rawSettings?: Partial<StudyPlannerSettings>,
  now: Date = new Date(),
  horizonDays = STUDY_PLAN_HORIZON_DAYS,
  calendarBusy: PlannerBusyInterval[] = [],
  adaptive?: AdaptivePlannerContext,
): GeneratedStudyPlan {
  const settings = normalizeSettings(rawSettings);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const completedByTask = new Map<string, number>();
  for (const block of completedBlocks ?? []) {
    if (!block.is_completed) continue;
    completedByTask.set(
      block.task_id,
      (completedByTask.get(block.task_id) ?? 0) + Math.max(0, block.duration_minutes),
    );
  }

  const taskStates: TaskState[] = (tasks ?? [])
    .filter((task) => !task.is_completed && !!parseDateKey(task.due_date))
    .map((task) => ({
      ...task,
      remaining: roundTo15(Math.max(0, estimateTaskMinutes(task) - (completedByTask.get(task.id) ?? 0))),
      carry: 0,
    }))
    .filter((task) => estimateTaskMinutes(task) > (completedByTask.get(task.id) ?? 0));

  const blocks: PlannedStudyBlock[] = [];
  const totalDays = Math.max(1, Math.min(31, horizonDays));

  for (let offset = 0; offset < totalDays; offset++) {
    const day = addDays(today, offset);
    if (!plannerDayEnabled(day, settings)) continue;

    const dayKey = dateKey(day);
    const isToday = offset === 0;
    const preferred = parseClock(
      day.getDay() === 0 || day.getDay() === 6
        ? settings.study_weekend_start
        : settings.study_weekday_start,
      day.getDay() === 0 || day.getDay() === 6 ? 10 * 60 : 17 * 60,
    );
    const roundedNow = Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15;
    // The student-selected start remains the floor. Once enough completions
    // exist, the coach can gently avoid placing work earlier than the time the
    // student actually tends to finish it on this weekday.
    const learnedStart = adaptive?.preferredStartByWeekday[day.getDay()]
      ?? adaptive?.preferredStartMinutes
      ?? 0;
    let cursor = Math.max(preferred, learnedStart, isToday ? roundedNow : 0);
    const dayEnd = 23 * 60;
    // Completed sessions stay fixed as history, so reserve their time just as
    // we reserve class meetings. This prevents a rebuild from stacking a new
    // session on top of work the student already completed.
    const blocked = [
      ...classRangesForDay(day, meetings),
      ...completedBlockRangesForDay(dayKey, completedBlocks),
      ...(settings.study_avoid_calendar_conflicts
        ? calendarBusy
          .filter((interval) => interval.date === dayKey)
          .map((interval) => ({
            start: Math.max(0, parseClock(interval.start_time, 0) - 10),
            end: Math.min(24 * 60, parseClock(interval.end_time, 24 * 60) + 10),
          }))
        : []),
    ].sort((a, b) => a.start - b.start);
    // Daily capacity is a ceiling for the whole day, including sessions the
    // student has already finished before rebuilding the plan.
    let capacity = Math.max(
      0,
      settings.study_daily_minutes - completedMinutesForDay(dayKey, completedBlocks),
    );

    const candidates = taskStates
      .filter((task) => {
        if (task.remaining <= 0) return false;
        if (!task.start_date) return true;
        return task.start_date <= dayKey;
      })
      .sort((a, b) =>
        taskUrgency(b, day, settings, adaptive) - taskUrgency(a, day, settings, adaptive)
        || a.due_date.localeCompare(b.due_date)
        || a.title.localeCompare(b.title),
      );

    for (const task of candidates) {
      if (capacity < 15 || task.remaining <= 0) break;
      const availableDays = daysAvailable(day, task, settings);
      const due = parseDateKey(task.due_date) ?? day;
      const isDueOrOverdue = differenceInCalendarDays(due, day) <= 0;
      task.carry += task.remaining / availableDays;
      let targetToday = isDueOrOverdue
        ? task.remaining
        : Math.min(task.remaining, Math.floor(task.carry / 15) * 15);
      let scheduledForTask = 0;

      while (targetToday >= 15 && capacity >= 15 && task.remaining > 0) {
        const duration = Math.min(
          settings.study_session_minutes,
          targetToday,
          task.remaining,
          capacity,
        );
        if (duration < 15) break;

        // If a task is due later today, stay before its due time. Once that
        // time has already passed, keep it actionable and use the normal day
        // window instead of dropping overdue work from the plan.
        const taskDueMinute = task.due_date === dayKey && task.due_time
          ? parseClock(task.due_time, dayEnd)
          : dayEnd;
        const taskDayEnd = taskDueMinute > cursor ? Math.min(dayEnd, taskDueMinute) : dayEnd;
        const start = nextFreeStart(cursor, duration, blocked, taskDayEnd);
        if (start == null) break;

        blocks.push({
          task_id: task.id,
          scheduled_date: dayKey,
          start_time: clockString(start),
          duration_minutes: duration,
          taskTitle: task.title,
          courseName: task.courses?.name || 'Course',
          courseColor: task.courses?.color || null,
          dueDate: task.due_date,
          coachReason: adaptive?.examTaskIds.includes(task.id)
            ? 'exam'
            : adaptive?.gradeRiskCourseIds.includes(task.course_id)
              ? 'grade_risk'
              : undefined,
        });
        task.remaining -= duration;
        targetToday -= duration;
        scheduledForTask += duration;
        capacity -= duration;
        cursor = start + duration + 10;
      }
      task.carry = Math.max(0, task.carry - scheduledForTask);
    }
  }

  const horizonEnd = addDays(today, totalDays - 1);
  return {
    blocks,
    atRiskMinutes: taskStates.reduce((sum, task) => {
      const due = parseDateKey(task.due_date);
      return sum + (due && due <= horizonEnd ? Math.max(0, task.remaining) : 0);
    }, 0),
    unscheduledMinutes: taskStates.reduce((sum, task) => sum + Math.max(0, task.remaining), 0),
    totalPlannedMinutes: blocks.reduce((sum, block) => sum + block.duration_minutes, 0),
    taskCount: new Set(blocks.map((block) => block.task_id)).size,
  };
}
