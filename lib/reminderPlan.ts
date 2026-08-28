/**
 * Decides which reminders are worth an iOS notification slot.
 *
 * iOS keeps at most 64 pending local notifications per app and drops the rest
 * silently. Semora had been spending that budget on whatever happened to be
 * scheduled first, which in practice meant work months away: 68% of upcoming
 * tasks in production are due more than 30 days out, and the average Pro
 * student had 57 future tasks against a ceiling of roughly 15 once every task
 * claimed four reminders. Forty of forty-three Pro students with upcoming work
 * were over that ceiling — the people who paid for advance warning were the
 * ones silently losing it.
 *
 * Two ideas fix that, and neither needs a bigger budget:
 *
 *   a horizon   A reminder for an essay due in November helps nobody in
 *               August, and it costs the same slot as one for tomorrow.
 *   a ladder    A final exam and a chapter of reading are not the same event,
 *               and giving them the same four reminders is how a reminder
 *               system teaches students to ignore it.
 *
 * This module is pure: it decides WHICH offsets each task deserves and, when
 * the total still will not fit, WHICH to give up. Turning an offset into a
 * trigger date — quiet hours, past-deadline suppression, locale — stays in
 * lib/notifications.ts, which already does it correctly.
 */

import type { TaskType } from '@/lib/constants';

/**
 * How far ahead reminders are scheduled at all.
 *
 * Sized against how often students actually open the app, because that is what
 * refills the window: the median gap between opens is 1 day, the 90th
 * percentile is 4, and the longest observed gap in 60 days is 31. Thirty days
 * covers essentially every real silence with room to spare, while cutting the
 * scheduled set to a third of what it was. Anything further out is picked up
 * the next time the app is opened, which is also the moment its reminders start
 * being useful.
 */
export const REMINDER_HORIZON_DAYS = 30;

/**
 * Slots the planner will claim.
 *
 * Below the 60 the OS-level pruner uses, which is itself below the 64 iOS
 * enforces. The gap absorbs single-task scheduling that happens between full
 * plans — a task created from the Today screen adds its rungs immediately,
 * without the planner's global view.
 */
export const REMINDER_BUDGET = 56;

/** Minutes before the deadline. `0` means at the due time itself. */
export const WEEK_BEFORE = 10080;
export const THREE_DAYS_BEFORE = 4320;
export const ONE_DAY_BEFORE = 1440;
export const TWO_HOURS_BEFORE = 120;
export const AT_DUE_TIME = 0;

/**
 * A rung of the ladder, most distant first. The order is also the shedding
 * order within a task: distance is the cheapest thing to give up.
 */
export type ReminderRung = 'week' | 'threeDay' | 'oneDay' | 'lastCall' | 'dueTime';

const RUNG_OFFSET: Record<ReminderRung, number> = {
  week: WEEK_BEFORE,
  threeDay: THREE_DAYS_BEFORE,
  oneDay: ONE_DAY_BEFORE,
  lastCall: TWO_HOURS_BEFORE,
  dueTime: AT_DUE_TIME,
};

/**
 * What each kind of work is worth, in slots.
 *
 * The distribution is what makes this affordable rather than generous. Of the
 * 1,597 tasks due inside 30 days across production, exams are 114 — about 7%.
 * Giving exams the richest ladder costs almost nothing. Readings and "other"
 * are 34% and are the cheapest thing a student can be reminded of twice, so
 * they drop to a single nudge at the deadline. Average consumption falls from
 * four slots per task to roughly two.
 */
const LADDER: Record<TaskType, ReminderRung[]> = {
  // No at-the-deadline rung: an alert at 14:00 for an exam that starts at 14:00
  // is not a reminder. The two-hour warning is the one that changes what a
  // student does next, so it takes that slot instead.
  exam: ['week', 'threeDay', 'oneDay', 'lastCall'],
  project: ['week', 'oneDay', 'dueTime'],
  assignment: ['oneDay', 'dueTime'],
  quiz: ['oneDay', 'dueTime'],
  // One nudge, when it is actually due. A reading is the most common thing in
  // the app after assignments and the least costly to miss by an hour.
  reading: ['dueTime'],
  other: ['dueTime'],
};

/*
 * Why these totals and not richer ones.
 *
 * The ceiling is not taste, it is arithmetic. The 90th-percentile student has
 * 25 tasks inside the horizon in a typical mix, and the budget is 56 slots. An
 * earlier draft gave assignments and quizzes a two-hour last call as well —
 * three rungs each — which put that same student at 65 and made shedding a
 * routine event for a load the planner should absorb without complaint. Pruning
 * ought to be the exception that the metrics catch, not the normal case.
 *
 * The mix above costs that student 49 slots. Exams keep the richest ladder
 * because they are only about 7% of near-term work in production, so protecting
 * every one of them is nearly free.
 */

/** Unknown or missing type behaves like an assignment — the commonest case. */
const FALLBACK_TYPE: TaskType = 'assignment';

function ladderForType(type: string | null | undefined): ReminderRung[] {
  return LADDER[(type as TaskType)] ?? LADDER[FALLBACK_TYPE];
}

/**
 * Which rungs the student's existing preferences allow.
 *
 * Phase 1 does not move the free/Pro boundary, so this maps the ladder onto the
 * three switches that already exist rather than replacing them:
 *
 *   reminder_same_day  the deadline itself, and the two-hour last call
 *   reminder_1day      the day-before rung
 *   reminder_3day      everything earlier than that
 *
 * Free accounts keep exactly what they have today — same-day only — because the
 * two advance switches are already forced off for them upstream.
 */
export interface ReminderPreferences {
  reminder_same_day: boolean;
  reminder_1day: boolean;
  reminder_3day: boolean;
}

function rungAllowed(rung: ReminderRung, prefs: ReminderPreferences): boolean {
  switch (rung) {
    case 'dueTime':
    case 'lastCall':
      return prefs.reminder_same_day;
    case 'oneDay':
      return prefs.reminder_1day;
    case 'threeDay':
    case 'week':
      return prefs.reminder_3day;
  }
}

export interface PlanTask {
  id: string;
  type: string | null | undefined;
  /** yyyy-MM-dd */
  dueDate: string;
  /** HH:mm[:ss] or null */
  dueTime?: string | null;
  /**
   * The student's own choice for this task. `null`/`undefined` means "follow
   * the defaults"; `[]` means "never remind me about this one".
   */
  overrideOffsets?: number[] | null;
}

export interface PlannedReminder {
  taskId: string;
  offsetMinutes: number;
  rung: ReminderRung | 'override';
  type: string;
  /** Days from today to the deadline. Drives protection and ordering. */
  daysUntilDue: number;
  /** True when this reminder may never be shed to make room. */
  isProtected: boolean;
}

export interface PrunedSummary {
  rung: string;
  type: string;
  count: number;
}

export interface ReminderPlan {
  reminders: PlannedReminder[];
  /** Tasks considered — those inside the horizon with a real deadline. */
  tasksInHorizon: number;
  /** Tasks skipped for being beyond the horizon. */
  tasksBeyondHorizon: number;
  /** Slots wanted before the budget was applied. */
  projected: number;
  /** Slots actually claimed. */
  scheduled: number;
  /** What was given up, aggregated. Never contains titles or course names. */
  pruned: PrunedSummary[];
}

/**
 * Reminders that must survive any shortage.
 *
 *   an exam within a fortnight   the single highest-stakes thing the app knows
 *                                about, and rare enough that protecting every
 *                                one costs about 29 slots across all students
 *   anything due within 48h      by then a reminder is not advance warning,
 *                                it is the last thing standing between the
 *                                student and a missed deadline
 *   an explicit choice           a student who set their own reminder has said
 *                                something; the planner has no standing to
 *                                overrule it
 */
export const EXAM_PROTECTION_DAYS = 14;
export const IMMINENT_PROTECTION_DAYS = 2;

function isProtected(task: PlanTask, daysUntilDue: number, isOverride: boolean): boolean {
  if (isOverride) return true;
  if (daysUntilDue <= IMMINENT_PROTECTION_DAYS) return true;
  if (task.type === 'exam' && daysUntilDue <= EXAM_PROTECTION_DAYS) return true;
  return false;
}

/**
 * Value order for shedding. Lower sheds first.
 *
 * Deliberately NOT distance-first, which is what the old OS-level pruner did.
 * Dropping the furthest notifications meant a final exam three weeks out lost
 * its week's warning while forty readings due tomorrow each kept two slots. The
 * rung matters more than the date: a week-out nudge for a reading is the least
 * useful thing in the queue, and the deadline reminder for anything is the
 * most.
 */
const RUNG_VALUE: Record<ReminderRung | 'override', number> = {
  override: 100,
  dueTime: 40,
  lastCall: 30,
  oneDay: 20,
  threeDay: 10,
  week: 5,
};

const TYPE_WEIGHT: Record<string, number> = {
  exam: 5,
  project: 4,
  assignment: 3,
  quiz: 3,
  reading: 1,
  other: 1,
};

function value(reminder: PlannedReminder): number {
  const rung = RUNG_VALUE[reminder.rung] ?? 20;
  const type = TYPE_WEIGHT[reminder.type] ?? 2;
  // Proximity breaks ties inside a rung: a day-before reminder for tomorrow
  // outranks one for a fortnight away.
  const proximity = Math.max(0, REMINDER_HORIZON_DAYS - reminder.daysUntilDue);
  return rung * 1000 + type * 100 + proximity;
}

export interface BuildPlanInput {
  tasks: PlanTask[];
  /** Today, for horizon and proximity. Passed in so this stays pure. */
  today: Date;
  prefs: ReminderPreferences;
  budget?: number;
  horizonDays?: number;
}

function daysBetween(today: Date, dueDate: string): number | null {
  const [y, m, d] = dueDate.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  const due = new Date(y, m - 1, d);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due.getTime() - start.getTime()) / 86_400_000);
}

/**
 * Build the whole plan in one pass.
 *
 * One pass matters as much as the result. The previous batch path called the
 * OS pruner inside each task's scheduling, re-reading every pending
 * notification each time — quadratic in the number of tasks, on the JS thread,
 * for a student with 293 of them.
 */
export function buildReminderPlan({
  tasks,
  today,
  prefs,
  budget = REMINDER_BUDGET,
  horizonDays = REMINDER_HORIZON_DAYS,
}: BuildPlanInput): ReminderPlan {
  const candidates: PlannedReminder[] = [];
  let tasksInHorizon = 0;
  let tasksBeyondHorizon = 0;

  for (const task of tasks) {
    const daysUntilDue = task.dueDate ? daysBetween(today, task.dueDate) : null;
    if (daysUntilDue === null) continue;

    // Already past. The scheduler drops past triggers anyway; skipping here
    // keeps them out of the projected count so the metric means something.
    if (daysUntilDue < 0) continue;

    if (daysUntilDue > horizonDays) {
      tasksBeyondHorizon += 1;
      continue;
    }
    tasksInHorizon += 1;

    const type = (task.type as string) || FALLBACK_TYPE;

    // An explicit empty array is a decision, not an absence: this student has
    // said they do not want reminders for this task.
    if (task.overrideOffsets && task.overrideOffsets.length === 0) continue;

    if (task.overrideOffsets && task.overrideOffsets.length > 0) {
      for (const offsetMinutes of [...new Set(task.overrideOffsets)]) {
        candidates.push({
          taskId: task.id, offsetMinutes, rung: 'override', type, daysUntilDue,
          isProtected: true,
        });
      }
      continue;
    }

    for (const rung of ladderForType(type)) {
      if (!rungAllowed(rung, prefs)) continue;
      candidates.push({
        taskId: task.id,
        offsetMinutes: RUNG_OFFSET[rung],
        rung,
        type,
        daysUntilDue,
        isProtected: isProtected(task, daysUntilDue, false),
      });
    }
  }

  const projected = candidates.length;
  if (projected <= budget) {
    return {
      reminders: candidates, tasksInHorizon, tasksBeyondHorizon,
      projected, scheduled: projected, pruned: [],
    };
  }

  // Shed from the bottom until it fits, never touching a protected reminder.
  const sorted = [...candidates].sort((a, b) => value(b) - value(a));
  const kept: PlannedReminder[] = [];
  const shed: PlannedReminder[] = [];
  for (const reminder of sorted) {
    if (kept.length < budget || reminder.isProtected) kept.push(reminder);
    else shed.push(reminder);
  }

  // Protection can legitimately carry the plan past the budget — a student with
  // more than 56 protected reminders is one whose next fortnight is genuinely
  // that full. Reporting it honestly is more useful than silently dropping
  // something that was promised.
  const byBucket = new Map<string, PrunedSummary>();
  for (const reminder of shed) {
    const key = `${reminder.rung}:${reminder.type}`;
    const existing = byBucket.get(key);
    if (existing) existing.count += 1;
    else byBucket.set(key, { rung: reminder.rung, type: reminder.type, count: 1 });
  }

  return {
    reminders: kept,
    tasksInHorizon,
    tasksBeyondHorizon,
    projected,
    scheduled: kept.length,
    pruned: [...byBucket.values()].sort((a, b) => b.count - a.count),
  };
}

/** The offsets one task ended up with, for handing to the scheduler. */
export function offsetsForTask(plan: ReminderPlan, taskId: string): number[] {
  return plan.reminders.filter((r) => r.taskId === taskId).map((r) => r.offsetMinutes);
}

/**
 * The ladder a single task deserves, with no global view.
 *
 * Used by the create/edit paths, which schedule one task without knowing what
 * else is pending. They can afford to be slightly generous: the next full plan
 * — app open, sync, resume — rebalances everything.
 */
export function offsetsForSingleTask(
  type: string | null | undefined,
  prefs: ReminderPreferences,
): number[] {
  return ladderForType(type)
    .filter((rung) => rungAllowed(rung, prefs))
    .map((rung) => RUNG_OFFSET[rung]);
}
