import { differenceInCalendarDays, format, subDays } from 'date-fns';
import type { AcademicRiskReport } from '@/lib/academicRisk';
import type { Task, StudyBlock } from '@/types/database';

export type StudyPlanChangeKind =
  | 'habit'
  | 'missed'
  | 'calendar'
  | 'exam'
  | 'grade_risk'
  | 'capacity';

export interface StudyPlanChange {
  kind: StudyPlanChangeKind;
  /** Stable key lets the database avoid filling the activity trail with duplicates. */
  key: string;
  title: string;
  detail: string;
  metadata?: Record<string, unknown>;
}

export interface StudyCoachProfile {
  /** Completed sessions used to learn habits. We never infer a habit from one day. */
  sampleSize: number;
  completionRate: number | null;
  /** Local clock minutes, indexed Sunday (0) through Saturday (6). */
  preferredStartByWeekday: Array<number | null>;
  /** A modest fallback for days without enough data of their own. */
  preferredStartMinutes: number | null;
  reliableWeekdays: number[];
}

export interface AdaptivePlannerContext {
  preferredStartByWeekday: Array<number | null>;
  preferredStartMinutes: number | null;
  examTaskIds: string[];
  gradeRiskCourseIds: string[];
}

type CoachBlock = Pick<StudyBlock,
  'scheduled_date' | 'start_time' | 'is_completed' | 'completed_at' | 'duration_minutes'>;

function localDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function scheduledStart(block: CoachBlock) {
  const parsed = new Date(`${block.scheduled_date}T${block.start_time}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function clockMinutes(date: Date) {
  // A completion timestamp records when the student said the work was done.
  // Round to a planner slot so learned times never create odd 7:13 PM blocks.
  return Math.round((date.getHours() * 60 + date.getMinutes()) / 15) * 15;
}

export function formatCoachTime(minutes: number) {
  const safe = Math.max(0, Math.min(23 * 60 + 45, minutes));
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

export function weekdayLabel(weekday: number) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday] || 'that day';
}

/**
 * Learn only from recent, completed sessions. The planner keeps user-selected
 * preferences as a floor; this profile can suggest a later start when evidence
 * shows the student consistently works later, never a surprising earlier one.
 */
export function buildStudyCoachProfile(
  blocks: CoachBlock[],
  now = new Date(),
  taskCompletionTimes: Array<string | null> = [],
): StudyCoachProfile {
  const cutoff = subDays(now, 42).getTime();
  const historical = blocks.filter((block) => {
    const start = scheduledStart(block);
    return !!start && start.getTime() >= cutoff && start.getTime() < now.getTime();
  });
  const completed = historical.filter((block) => block.is_completed);
  const completionRate = historical.length >= 4 ? completed.length / historical.length : null;

  const completedByWeekday: number[][] = Array.from({ length: 7 }, () => []);
  for (const block of completed) {
    const completion = localDate(block.completed_at) || scheduledStart(block);
    if (!completion) continue;
    completedByWeekday[completion.getDay()].push(clockMinutes(completion));
  }
  // A student may finish a task from its detail screen instead of completing a
  // Smart Plan block. Those completion timestamps are still a useful, private
  // signal about when study work actually gets finished.
  for (const timestamp of taskCompletionTimes) {
    const completion = localDate(timestamp);
    if (!completion || completion.getTime() < cutoff || completion > now) continue;
    completedByWeekday[completion.getDay()].push(clockMinutes(completion));
  }

  const preferredStartByWeekday = completedByWeekday.map((values) =>
    values.length >= 2 ? median(values) : null,
  );
  const allCompletionTimes = completedByWeekday.flat();
  const preferredStartMinutes = allCompletionTimes.length >= 4 ? median(allCompletionTimes) : null;

  const reliableWeekdays: number[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const scheduled = historical.filter((block) => scheduledStart(block)?.getDay() === weekday);
    const done = scheduled.filter((block) => block.is_completed);
    if (scheduled.length >= 2 && done.length / scheduled.length >= 0.75) reliableWeekdays.push(weekday);
  }

  return {
    sampleSize: completed.length + taskCompletionTimes.filter((timestamp) => {
      const completion = localDate(timestamp);
      return !!completion && completion.getTime() >= cutoff && completion <= now;
    }).length,
    completionRate,
    preferredStartByWeekday,
    preferredStartMinutes,
    reliableWeekdays,
  };
}

export function buildAdaptivePlannerContext(
  tasks: Pick<Task, 'id' | 'course_id' | 'type' | 'due_date' | 'is_completed' | 'completed_at'>[],
  blocks: CoachBlock[],
  riskReport: AcademicRiskReport,
  now = new Date(),
): { profile: StudyCoachProfile; context: AdaptivePlannerContext } {
  const profile = buildStudyCoachProfile(
    blocks,
    now,
    tasks.filter((task) => task.is_completed).map((task) => task.completed_at),
  );
  const examTaskIds = tasks
    .filter((task) => !task.is_completed && task.type === 'exam'
      && differenceInCalendarDays(new Date(`${task.due_date}T00:00:00`), now) >= 0
      && differenceInCalendarDays(new Date(`${task.due_date}T00:00:00`), now) <= 7)
    .map((task) => task.id);
  const gradeRiskCourseIds = riskReport.risks
    .filter((risk) => risk.kind === 'falling_grade' || risk.kind === 'missing_work')
    .map((risk) => risk.courseId)
    .filter((id): id is string => !!id);

  return {
    profile,
    context: {
      preferredStartByWeekday: profile.preferredStartByWeekday,
      preferredStartMinutes: profile.preferredStartMinutes,
      examTaskIds,
      gradeRiskCourseIds: [...new Set(gradeRiskCourseIds)],
    },
  };
}

export function buildStudyCoachChanges({
  profile,
  missedCount,
  calendarConflictCount,
  riskReport,
  tasks,
  atRiskMinutes,
  now = new Date(),
}: {
  profile: StudyCoachProfile;
  missedCount: number;
  calendarConflictCount: number;
  riskReport: AcademicRiskReport;
  tasks: Pick<Task, 'id' | 'title' | 'type' | 'due_date' | 'is_completed'>[];
  atRiskMinutes: number;
  now?: Date;
}): StudyPlanChange[] {
  const changes: StudyPlanChange[] = [];
  if (missedCount > 0) {
    changes.push({
      kind: 'missed',
      key: 'missed-sessions',
      title: 'Unfinished time moved forward',
      detail: `${missedCount} missed session${missedCount === 1 ? '' : 's'} was carried into the next available study slots.`,
      metadata: { missed_count: missedCount },
    });
  }

  if (profile.preferredStartMinutes != null) {
    const reliableDays = profile.reliableWeekdays.slice(0, 2).map(weekdayLabel);
    changes.push({
      kind: 'habit',
      key: `habit-start-${profile.preferredStartMinutes}`,
      title: 'Matched to your study rhythm',
      detail: reliableDays.length
        ? `Recent completions suggest you follow through best on ${reliableDays.join(' and ')}. Sessions now begin no earlier than your preferences and learned rhythm.`
        : `Recent completions cluster around ${formatCoachTime(profile.preferredStartMinutes)}, so sessions now respect that rhythm without overriding your selected start time.`,
      metadata: { samples: profile.sampleSize, preferred_start_minutes: profile.preferredStartMinutes },
    });
  }

  if (calendarConflictCount > 0) {
    changes.push({
      kind: 'calendar',
      key: `calendar-${calendarConflictCount > 4 ? 'busy' : calendarConflictCount}`,
      title: 'Protected your calendar',
      detail: `${calendarConflictCount} class or calendar conflict${calendarConflictCount === 1 ? '' : 's'} was kept clear, including a 10-minute transition buffer.`,
      metadata: { conflict_count: calendarConflictCount },
    });
  }

  const upcomingExams = tasks
    .filter((task) => !task.is_completed && task.type === 'exam'
      && differenceInCalendarDays(new Date(`${task.due_date}T00:00:00`), now) >= 0
      && differenceInCalendarDays(new Date(`${task.due_date}T00:00:00`), now) <= 7)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  if (upcomingExams.length) {
    changes.push({
      kind: 'exam',
      key: `exam-${upcomingExams[0].id}`,
      title: 'Exam preparation came forward',
      detail: `${upcomingExams[0].title} is within a week, so its review time is spread across earlier available sessions.`,
      metadata: { task_id: upcomingExams[0].id },
    });
  }

  const gradeRisk = riskReport.risks.find((risk) => risk.kind === 'falling_grade' || risk.kind === 'missing_work');
  if (gradeRisk) {
    changes.push({
      kind: 'grade_risk',
      key: `grade-risk-${gradeRisk.courseId || gradeRisk.taskId || gradeRisk.id}`,
      title: 'Higher-impact work moved up',
      detail: gradeRisk.detail,
      metadata: { course_id: gradeRisk.courseId || null, task_id: gradeRisk.taskId || null },
    });
  }

  if (atRiskMinutes > 0) {
    changes.push({
      kind: 'capacity',
      key: 'capacity-warning',
      title: 'Your current capacity is tight',
      detail: `${Math.ceil(atRiskMinutes / 15) * 15} minutes due in the planning window did not fit. The plan prioritized the closest and highest-impact work first.`,
      metadata: { at_risk_minutes: atRiskMinutes },
    });
  }

  return changes.slice(0, 4);
}

export function coachStatusLine(profile: StudyCoachProfile) {
  if (profile.preferredStartMinutes != null) {
    return `Learning from ${profile.sampleSize} completed session${profile.sampleSize === 1 ? '' : 's'} · usually around ${formatCoachTime(profile.preferredStartMinutes)}`;
  }
  return 'Complete a few sessions and Smart Plan will learn your rhythm.';
}

export function coachHistoryDate(value: string) {
  return format(new Date(value), 'MMM d');
}
