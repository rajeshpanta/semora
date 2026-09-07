/**
 * One answer to "what deserves attention first".
 *
 * Semora had two, both shipped under the name "Smart Plan", and on real
 * production data they disagreed about the single most important task for 137
 * of 186 students. Feeding them an identical row set — future-dated only, no
 * boosts, no overdue — still left 19.5% with a different top item, so the
 * disagreement was in the arithmetic, not just the filters:
 *
 *   lib/studySuggestions.ts   taskLoadScore / max(days, 0.5)
 *   lib/studyPlanner.ts      (taskLoadScore x priority x exam x risk) / max(0.5, days+0.5) + pace
 *
 * The planner's expression is a strict superset. So this module lifts the
 * shared core out of it rather than inventing a third: the planner keeps adding
 * its own pacing term on top (it alone knows how much of a task is left and how
 * many days remain to spread it over), and the card now scores the same way for
 * everything else. Extracting the superset means the planner's behaviour does
 * not change at all and only the card moves — the right direction, since the
 * card was the one recommending finals a hundred days out.
 *
 * WHAT IT DOES NOT USE. No topic mastery: three real courses have any learning
 * evidence and the only one above the evidence floor is an administrative
 * label, so mastery here would be noise wearing the clothes of insight. No
 * AI. No time estimates the data cannot support. Priority is decided from
 * deadlines, stakes and the student's own flags — nothing inferred about them.
 *
 * Pure and dependency-free.
 */

import type { TaskType } from '@/lib/constants';
import { taskLoadScore } from '@/lib/workload';
import type { TaskStake } from '@/lib/taskStake';

export type PriorityTier = 'overdue' | 'now' | 'soon' | 'ahead';

export interface PriorityTask {
  id: string;
  type: TaskType;
  due_date: string | null;
  weight?: number | string | null;
  priority?: 'high' | 'normal' | 'low' | null;
  course_id?: string | null;
}

export interface PriorityContext {
  now?: Date;
  /** Tasks the coach has flagged as an exam within the boost window. */
  examTaskIds?: ReadonlySet<string> | readonly string[];
  /** Courses academicRisk has flagged. */
  riskCourseIds?: ReadonlySet<string> | readonly string[];
  /** Derived stakes from lib/taskStake — supplies the weight the row lacks. */
  stakes?: ReadonlyMap<string, TaskStake>;
}

export interface PriorityResult {
  score: number;
  /** Whole days until due; negative when overdue. NaN when undated. */
  daysUntilDue: number;
  tier: PriorityTier;
  /** The weight actually used, and where it came from — for the reason line. */
  stake: TaskStake | null;
}

// The planner's own constants, kept here so both callers read one copy.
const PRIORITY_MULT = { high: 1.55, low: 0.78, normal: 1 } as const;
const EXAM_BOOST = 1.7;
const GRADE_RISK_BOOST = 1.28;

function has(set: PriorityContext['examTaskIds'], id: string): boolean {
  if (!set) return false;
  return Array.isArray(set) ? set.includes(id) : (set as ReadonlySet<string>).has(id);
}

/** Whole calendar days from local midnight today to a yyyy-MM-dd due date. */
export function daysUntilDue(dueDate: string | null | undefined, now: Date): number {
  if (!dueDate) return NaN;
  const due = new Date(dueDate + 'T00:00:00');
  if (Number.isNaN(due.getTime())) return NaN;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

export function tierFor(days: number): PriorityTier {
  if (days < 0) return 'overdue';
  if (days <= 1) return 'now';
  if (days <= 4) return 'soon';
  return 'ahead';
}

/**
 * The shared core. The planner adds its pacing term to this; every other
 * surface uses it as-is.
 *
 * The derived stake is fed in as the task's weight when the row has none of its
 * own, which is where it earns its keep: taskLoadScore falls back to a flat
 * BASE_WEIGHT otherwise, so nine tasks in ten were being ranked on type alone.
 * A weight the student typed always wins over one Semora inferred.
 */
export function priorityScore(task: PriorityTask, ctx: PriorityContext = {}): PriorityResult {
  const now = ctx.now ?? new Date();
  const days = daysUntilDue(task.due_date, now);
  const stake = ctx.stakes?.get(task.id) ?? null;

  // `weight` is a Postgres numeric and can arrive as a string.
  const rawWeight = typeof task.weight === 'string' ? Number(task.weight) : task.weight;
  const ownWeight = typeof rawWeight === 'number' && Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : null;
  const weight = ownWeight ?? stake?.weightPercent ?? null;

  // Overdue work does not keep climbing forever. Clamping at the due date means
  // a month-late reading cannot outrank tomorrow's exam purely by being old.
  const effectiveDays = Number.isNaN(days) ? 30 : Math.max(days, 0);
  const urgencyDays = Math.max(0.5, effectiveDays + 0.5);

  const priority = PRIORITY_MULT[task.priority ?? 'normal'] ?? 1;
  const examBoost = has(ctx.examTaskIds, task.id) ? EXAM_BOOST : 1;
  const riskBoost = task.course_id && has(ctx.riskCourseIds, task.course_id) ? GRADE_RISK_BOOST : 1;

  const score = (taskLoadScore({ type: task.type, weight }) * priority * examBoost * riskBoost) / urgencyDays;

  return { score, daysUntilDue: days, tier: Number.isNaN(days) ? 'ahead' : tierFor(days), stake };
}

/**
 * The reason a student is being shown this, as PARTS rather than a sentence.
 *
 * Composing here would mean one English string with a number in it, which the
 * Spanish build could not reuse. The caller renders these through its own
 * translator instead. There is deliberately no score in the output: a student
 * should read "Friday, and exams are 30% of this course", never "priority 87.4".
 */
export interface PriorityReason {
  timing: 'overdue' | 'today' | 'tomorrow' | 'days' | 'undated';
  /** Days late when overdue, days remaining when timing is 'days'. */
  days: number;
  /** Present only when a stake is known and worth naming. */
  stake: { bucket: TaskStake['bucket']; weightPercent: number } | null;
}

/** The minimum share of a course grade worth interrupting a student to mention. */
export const STAKE_WORTH_NAMING = 10;

export function reasonFor(result: PriorityResult): PriorityReason {
  const d = result.daysUntilDue;
  const timing: PriorityReason['timing'] = Number.isNaN(d)
    ? 'undated'
    : d < 0 ? 'overdue'
    : d === 0 ? 'today'
    : d === 1 ? 'tomorrow'
    : 'days';

  // A 5% category is true and not a reason to reorder someone's evening.
  const stake = result.stake && result.stake.weightPercent >= STAKE_WORTH_NAMING
    ? { bucket: result.stake.bucket, weightPercent: result.stake.weightPercent }
    : null;

  return { timing, days: Number.isNaN(d) ? 0 : Math.abs(d), stake };
}

/** Rank a whole set, highest first. Ties break by due date then title. */
export function rankByPriority<T extends PriorityTask & { title?: string }>(
  tasks: readonly T[],
  ctx: PriorityContext = {},
): { task: T; result: PriorityResult }[] {
  return (tasks ?? [])
    .map((task) => ({ task, result: priorityScore(task, ctx) }))
    .sort(
      (a, b) =>
        b.result.score - a.result.score ||
        String(a.task.due_date ?? '').localeCompare(String(b.task.due_date ?? '')) ||
        String(a.task.title ?? '').localeCompare(String(b.task.title ?? '')),
    );
}
