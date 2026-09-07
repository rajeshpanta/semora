// Study-suggestions engine — a deterministic (NO AI) ranker that turns the
// student's incomplete deadlines into a short, prioritized "start on this next"
// list. Scoring lives in lib/taskPriority, shared with the timed planner; the
// stake that makes a heavy exam outrank a light reading comes from
// lib/taskStake, inferred from the syllabus grade breakdown at read time.
//
// Pure functions only — no React, no fetching. The card/screen callers pass in
// the tasks (and optionally meetings + a fixed `now` for testing) they already
// hold.

import type { TaskType } from '@/lib/constants';
import { type WorkloadTask } from '@/lib/workload';
import { TASK_TYPE_LABELS } from '@/lib/constants';
import { priorityScore, reasonFor, type PriorityContext, type PriorityReason } from '@/lib/taskPriority';

export type UrgencyTier = 'now' | 'soon' | 'ahead';

export interface Suggestion {
  taskId: string;
  title: string;
  type: TaskType;
  /**
   * The course this belongs to. Present so a caller can open the task's study
   * session directly — S7's end-of-session offer needs it, and deriving it a
   * second time from the task list is how two surfaces start disagreeing.
   * Null only for a task with no course, which the ranker still accepts.
   */
  courseId: string | null;
  courseName: string;
  courseColor: string | null;
  dueDate: string;
  /** Whole days from `now` until the due date (0 = due today). */
  daysUntilDue: number;
  /** From lib/taskPriority — the one ranking Semora uses everywhere. */
  score: number;
  /**
   * Why this is here, as parts for the caller to translate. Never a score:
   * a student should read "Friday, and exams are 30% of this course".
   */
  reason: PriorityReason;
  tier: UrgencyTier;
  /** Ready-to-render one-liner, e.g. "Start on Midterm for Chem — exam due in 3 days". */
  line: string;
}

// A course meeting, only the shape we might use. Meetings are accepted so the
// signature can grow (e.g. avoiding suggesting study on a day already full of
// classes) without a breaking change; the current ranking doesn't need them,
// but the param is part of the documented contract.
interface MeetingLike {
  course_id: string;
  days_of_week: number[];
}

/** Whole calendar days between `now` (at local midnight) and a yyyy-MM-dd due
 *  date. Parsed as local midnight to avoid the UTC day-shift (see lib/dates.ts). */
function daysUntil(dueDate: string, now: Date): number {
  const due = new Date(dueDate + 'T00:00:00');
  if (Number.isNaN(due.getTime())) return NaN;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((due.getTime() - start.getTime()) / MS_PER_DAY);
}

function tierFor(days: number): UrgencyTier {
  if (days <= 1) return 'now';
  if (days <= 4) return 'soon';
  return 'ahead';
}

/** "in 3 days" / "tomorrow" / "today" — the tail of the suggestion line. */
function duephrase(days: number): string {
  if (days <= 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

/**
 * Rank the student's incomplete, dated, still-future tasks into a prioritized
 * study list. Ranked by lib/taskPriority — the one scoring Semora uses
 * everywhere, so this card and the timed planner cannot disagree about what
 * matters most. Deterministic: same input always yields the same order (ties
 * broken by due date then title).
 *
 * @param tasks    incomplete/complete task rows (completed + past + undated are filtered out)
 * @param meetings optional course meetings (reserved; see MeetingLike)
 * @param now      injectable clock for tests; defaults to new Date()
 * @param limit    max suggestions to return (default 5)
 */
export function getStudySuggestions(
  tasks: WorkloadTask[],
  meetings?: MeetingLike[],
  now: Date = new Date(),
  limit = 5,
  /** Exam/risk boosts and derived stakes. Absent = plain deadline ranking. */
  context: Omit<PriorityContext, 'now'> = {},
): Suggestion[] {
  const ctx: PriorityContext = { ...context, now };
  const suggestions: Suggestion[] = [];

  for (const t of tasks ?? []) {
    if (t.is_completed) continue;
    if (!t.due_date) continue;
    const days = daysUntil(t.due_date, now);
    if (Number.isNaN(days)) continue;
    // Only future/today work — overdue tasks belong to the Today tab's
    // "overdue" surface, not a "start on this next" planner.
    if (days < 0) continue;
    // A start date is a real availability boundary, not decorative metadata.
    // Keep the task out of "what to start next" until that day arrives.
    if (t.start_date) {
      const startDays = daysUntil(t.start_date, now);
      if (!Number.isNaN(startDays) && startDays > 0) continue;
    }

    const courseName = t.courses?.name ?? 'your course';
    // One ranking, shared with the timed planner. This used to be a local
    // expression that ignored priority, exam proximity, grade risk and the
    // derived stake — which is why the two "Smart Plan" surfaces could put
    // different work first for the same student on the same day.
    const result = priorityScore(
      { id: t.id, type: t.type, due_date: t.due_date, weight: t.weight ?? null,
        priority: (t as { priority?: 'high' | 'normal' | 'low' | null }).priority ?? null,
        course_id: (t as { course_id?: string | null }).course_id ?? null },
      ctx,
    );
    const score = result.score;
    const tier = tierFor(days);
    const typeLabel = (TASK_TYPE_LABELS[t.type] ?? 'task').toLowerCase();

    suggestions.push({
      taskId: t.id,
      title: t.title,
      type: t.type,
      courseId: (t as { course_id?: string | null }).course_id ?? null,
      courseName,
      courseColor: t.courses?.color ?? null,
      dueDate: t.due_date,
      daysUntilDue: days,
      score,
      reason: reasonFor(result),
      tier,
      line: `Start on ${t.title} for ${courseName} — ${typeLabel} ${duephrase(days)}`,
    });
  }

  suggestions.sort(
    (a, b) =>
      b.score - a.score ||
      a.dueDate.localeCompare(b.dueDate) ||
      a.title.localeCompare(b.title),
  );

  return suggestions.slice(0, Math.max(0, limit));
}
