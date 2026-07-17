// Study-suggestions engine — a deterministic (NO AI) ranker that turns the
// student's incomplete deadlines into a short, prioritized "start on this next"
// list. Shares the weight×typeWeight model with lib/workload.ts and divides by
// urgency so a heavy exam three days out outranks a light reading due tomorrow.
//
// Pure functions only — no React, no fetching. The card/screen callers pass in
// the tasks (and optionally meetings + a fixed `now` for testing) they already
// hold.

import type { TaskType } from '@/lib/constants';
import { taskLoadScore, type WorkloadTask } from '@/lib/workload';
import { TASK_TYPE_LABELS } from '@/lib/constants';

export type UrgencyTier = 'now' | 'soon' | 'ahead';

export interface Suggestion {
  taskId: string;
  title: string;
  type: TaskType;
  courseName: string;
  courseColor: string | null;
  dueDate: string;
  /** Whole days from `now` until the due date (0 = due today). */
  daysUntilDue: number;
  /** weight×typeWeight ÷ max(daysUntilDue, 0.5) — higher = do sooner. */
  score: number;
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
 * study list. score = taskLoadScore ÷ max(daysUntilDue, 0.5): heavier work and
 * nearer deadlines both push a task up. Deterministic — same input always
 * yields the same order (ties broken by due date then title).
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
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const t of tasks ?? []) {
    if (t.is_completed) continue;
    if (!t.due_date) continue;
    const days = daysUntil(t.due_date, now);
    if (Number.isNaN(days)) continue;
    // Only future/today work — overdue tasks belong to the Today tab's
    // "overdue" surface, not a "start on this next" planner.
    if (days < 0) continue;

    const courseName = t.courses?.name ?? 'your course';
    // Divide by urgency, flooring at 0.5 so a task due today doesn't explode to
    // infinity or divide by zero.
    const score = taskLoadScore(t) / Math.max(days, 0.5);
    const tier = tierFor(days);
    const typeLabel = (TASK_TYPE_LABELS[t.type] ?? 'task').toLowerCase();

    suggestions.push({
      taskId: t.id,
      title: t.title,
      type: t.type,
      courseName,
      courseColor: t.courses?.color ?? null,
      dueDate: t.due_date,
      daysUntilDue: days,
      score,
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
