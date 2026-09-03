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
 * The last call on a task with no due time.
 *
 * Negative because the anchor for an untimed task is an arbitrary 9:00 AM while
 * the real deadline is the end of the day, so the evening nudge lands AFTER the
 * anchor: 9:00 plus 600 minutes is 7:00 PM. The scheduler's post-deadline guard
 * still applies, and 7pm is comfortably inside a 23:59 deadline.
 *
 * This reproduces what the app did before the redesign. Phase 1 collapsed it to
 * a flat two-hours-before, which for an untimed task meant 7:00 AM — two
 * reminders in the same morning instead of a heads-up and an evening nudge.
 */
export const EVENING_LAST_CALL = -600;

/**
 * A rung of the ladder, most distant first. The order is also the shedding
 * order within a task: distance is the cheapest thing to give up.
 */
export type ReminderRung = 'week' | 'threeDay' | 'oneDay' | 'lastCall' | 'dueTime';

/**
 * A rung's offset. Only the last call depends on the task: two hours before a
 * stated deadline, or the evening of an all-day one.
 */
function offsetForRung(rung: ReminderRung, dueTime?: string | null): number {
  switch (rung) {
    case 'week': return WEEK_BEFORE;
    case 'threeDay': return THREE_DAYS_BEFORE;
    case 'oneDay': return ONE_DAY_BEFORE;
    case 'lastCall': return dueTime ? TWO_HOURS_BEFORE : EVENING_LAST_CALL;
    case 'dueTime': return AT_DUE_TIME;
  }
}

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

/**
 * Marking a task high priority gives it an exam's ladder.
 *
 * This is the escape hatch for a type that is wrong or too blunt. Canvas calls
 * a lot of things "assignment", and a syllabus parser cannot tell a weekly
 * problem set from the capstone that decides the grade — but the student can,
 * and the task editor has had a Priority control the whole time that did
 * nothing for reminders. Sixteen tasks in production use it. Wiring it here
 * makes an existing, visible, already-understood control mean something, which
 * is a better answer than a new switch nobody would find.
 */
function ladderFor(type: string | null | undefined, priority?: string | null): ReminderRung[] {
  if (priority === 'high') return LADDER.exam;
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

/**
 * When a student has no advance warning at all, one reminder is not enough.
 *
 * Free accounts — and anyone on Light — only ever see same-day rungs. Before the
 * redesign every task gave them two: a heads-up and a last call. Type-awareness
 * quietly reduced that to one, because most ladders carry only a single same-day
 * rung. That was a real downgrade to the free tier hidden inside a change that
 * was supposed to be about budgeting, so the pair is restored whenever the
 * same-day rungs are all a student has.
 *
 * It costs nothing above that: an account with the day-before rung available
 * already has two moments, and its ladder is left exactly as the type defines.
 */
function withSameDayPair(
  rungs: ReminderRung[],
  prefs: ReminderPreferences,
  dueTime?: string | null,
): ReminderRung[] {
  const hasAdvance = prefs.reminder_1day || prefs.reminder_3day;
  if (hasAdvance || !prefs.reminder_same_day) return rungs;
  const out = [...rungs];
  if (!out.includes('dueTime')) out.push('dueTime');
  if (!out.includes('lastCall')) out.push('lastCall');
  // Chronological, earliest first — which is not the same as ladder order once
  // both same-day rungs are present. For a timed task the last call is two
  // hours BEFORE the deadline; for an all-day one it is the evening, which
  // falls AFTER the 9:00 AM anchor. Sorting by offset gets both right, and it
  // is what makes the sentence describing them read in the order they arrive.
  return out.sort((a, b) => offsetForRung(b, dueTime) - offsetForRung(a, dueTime));
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
  /** 'high' | 'normal' | 'low'. High is treated as an exam. */
  priority?: string | null;
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
  /**
   * Slots claimed per task type. Answers which kind of work is actually eating
   * the budget, which is the question that decides whether a ladder is too
   * generous — and the one the earlier design could only guess at.
   */
  slotsByType: Record<string, number>;
  /** Tasks the student marked important, and what that cost. */
  highPriorityTasks: number;
  highPrioritySlots: number;
  /** Tasks carrying an explicit per-task choice, i.e. defaults overridden. */
  tasksWithOverride: number;
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
  // A student who marked something high priority has told us it matters as much
  // as an exam. Protecting it on their word is the point of the control.
  if ((task.type === 'exam' || task.priority === 'high') && daysUntilDue <= EXAM_PROTECTION_DAYS) {
    return true;
  }
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
  // dueTime and lastCall are deliberately equal: both are a task's FINAL
  // warning, and which one a task gets depends only on its type. An exam has no
  // due-time rung — an alert at 14:00 for an exam at 14:00 is useless — so its
  // two-hour warning is its deadline reminder. Ranking lastCall lower meant
  // every ordinary assignment's due-time nudge outranked an exam's last
  // warning, and under pressure exams lost the rung that mattered most while
  // readings kept theirs. The type weight below is what separates them.
  dueTime: 40,
  lastCall: 40,
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
  const highPriorityIds = new Set<string>();
  let tasksWithOverride = 0;

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
    if (task.priority === 'high') highPriorityIds.add(task.id);

    if (task.overrideOffsets) tasksWithOverride += 1;
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

    for (const rung of withSameDayPair(ladderFor(type, task.priority), prefs, task.dueTime)) {
      if (!rungAllowed(rung, prefs)) continue;
      candidates.push({
        taskId: task.id,
        offsetMinutes: offsetForRung(rung, task.dueTime),
        rung,
        // High priority ranks as an exam when the budget has to choose, not
        // only when the ladder is built — otherwise the extra rungs it just
        // earned would be the first ones taken away again.
        type: task.priority === 'high' ? 'exam' : type,
        daysUntilDue,
        isProtected: isProtected(task, daysUntilDue, false),
      });
    }
  }

  const projected = candidates.length;

  const summarise = (kept: PlannedReminder[]) => {
    const slotsByType: Record<string, number> = {};
    let highPrioritySlots = 0;
    for (const reminder of kept) {
      slotsByType[reminder.type] = (slotsByType[reminder.type] ?? 0) + 1;
      if (highPriorityIds.has(reminder.taskId)) highPrioritySlots += 1;
    }
    return { slotsByType, highPrioritySlots };
  };

  if (projected <= budget) {
    return {
      reminders: candidates, tasksInHorizon, tasksBeyondHorizon,
      projected, scheduled: projected, pruned: [],
      highPriorityTasks: highPriorityIds.size,
      tasksWithOverride,
      ...summarise(candidates),
    };
  }

  // Shed from the bottom until it fits. Protection wins the CONTEST; it no
  // longer wins an exemption from the budget.
  //
  // `|| reminder.isProtected` used to let a protected reminder past the cap
  // unconditionally, on the reasoning that a student with more than 56
  // protected reminders has a genuinely full fortnight and should be told so.
  // That reasoning had one thing wrong with it: iOS does not accept more than
  // 64 pending notifications per app, and it does not report a refusal. Past
  // the ceiling the OS silently keeps an arbitrary subset, so the exemption
  // did not deliver the extra reminders — it decided, at random and invisibly,
  // WHICH of the student's promised reminders would be thrown away, including
  // the protected ones the exemption existed to guarantee.
  //
  // A real 189-task Canvas import projects 149 reminders here and used to keep
  // 69. The 5 over the ceiling did not arrive; 5 unknowable others did not
  // either. Class reminders share the same 64, so the true overflow was worse.
  //
  // Ranking protected first and then taking the top `budget` keeps every
  // guarantee that can actually be honoured, and turns the rest from silent
  // OS-level loss into a shed count the student's plan can report.
  const sorted = [...candidates].sort((a, b) => {
    if (a.isProtected !== b.isProtected) return a.isProtected ? -1 : 1;
    return value(b) - value(a);
  });
  const kept: PlannedReminder[] = sorted.slice(0, budget);
  const shed: PlannedReminder[] = sorted.slice(budget);

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
    highPriorityTasks: highPriorityIds.size,
    tasksWithOverride,
    ...summarise(kept),
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
  priority?: string | null,
  dueTime?: string | null,
): number[] {
  return withSameDayPair(ladderFor(type, priority), prefs, dueTime)
    .filter((rung) => rungAllowed(rung, prefs))
    .map((rung) => offsetForRung(rung, dueTime));
}

/**
 * Plain English for what a task will actually do, for the task editor.
 *
 * The reason this exists at all: production showed 322 students and not one
 * change to a reminder setting, with the notification screen opened twice in
 * thirty days. The problem was never a shortage of controls — it was that the
 * behaviour was invisible, so there was nothing to react to. Saying it where
 * the student already is beats another screen they will not visit.
 */
export function describeLadder(
  type: string | null | undefined,
  prefs: ReminderPreferences,
  priority?: string | null,
  dueTime?: string | null,
): string {
  const rungs = withSameDayPair(ladderFor(type, priority), prefs, dueTime)
    .filter((rung) => rungAllowed(rung, prefs));
  if (rungs.length === 0) return 'No reminders';
  const label: Record<ReminderRung, string> = {
    week: '1 week',
    threeDay: '3 days',
    oneDay: '1 day',
    // An all-day task's last call is an evening nudge, not a two-hour warning
    // against a deadline it does not have.
    lastCall: dueTime ? '2 hours' : 'that evening',
    dueTime: 'when due',
  };
  // Two kinds of thing appear here and they read differently: lead times ("1
  // week") want a trailing "before", while moments ("when it's due", "that
  // evening") already are one. Mixing them naively produced "2 hours and when
  // it's due", which drops the word that makes the first half mean anything.
  const leads: string[] = [];
  const moments: string[] = [];
  for (const rung of rungs) {
    if (rung === 'dueTime') moments.push("when it's due");
    else if (rung === 'lastCall' && !dueTime) moments.push('that evening');
    else moments.length ? moments.push(label[rung]) : leads.push(label[rung]);
  }

  const join = (list: string[]) =>
    list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;

  if (leads.length === 0) return `Reminds you ${join(moments)}`;
  const leadPhrase = `${join(leads)} before`;
  if (moments.length === 0) return `Reminds you ${leadPhrase}`;
  return `Reminds you ${leadPhrase}, and ${join(moments)}`;
}
