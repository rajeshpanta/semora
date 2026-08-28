/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/reminderPlan.test.ts
 *
 * The cases that matter here are the heavy ones. A planner that behaves well
 * for four tasks proves nothing: the failure this module exists to fix only
 * appeared for students with fifty, and it appeared silently.
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildReminderPlan,
  offsetsForSingleTask,
  offsetsForTask,
  REMINDER_HORIZON_DAYS,
  REMINDER_BUDGET,
  EXAM_PROTECTION_DAYS,
  ONE_DAY_BEFORE,
  AT_DUE_TIME,
  WEEK_BEFORE,
  type PlanTask,
} from './reminderPlan';

const TODAY = new Date(2026, 8, 1); // 1 Sep 2026, local
const ALL_ON = { reminder_same_day: true, reminder_1day: true, reminder_3day: true };
const FREE = { reminder_same_day: true, reminder_1day: false, reminder_3day: false };

let seq = 0;
const at = (days: number, type: string | null, over?: number[] | null): PlanTask => {
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + days);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { id: `t${++seq}`, type, dueDate: iso, dueTime: '23:59:00', overrideOffsets: over };
};
const plan = (tasks: PlanTask[], prefs = ALL_ON, budget?: number) =>
  buildReminderPlan({ tasks, today: TODAY, prefs, budget });

// ── horizon ────────────────────────────────────────────────────────────────

Deno.test('work beyond the horizon claims no slots', () => {
  // 68% of production's upcoming tasks are more than 30 days out. They were
  // consuming the same budget as tomorrow's deadline.
  const p = plan([at(5, 'assignment'), at(45, 'assignment'), at(200, 'exam')]);
  assertEquals(p.tasksInHorizon, 1);
  assertEquals(p.tasksBeyondHorizon, 2);
  assert(p.reminders.every((r) => r.taskId === 't1' || r.taskId.startsWith('t1')));
});

Deno.test('the horizon boundary is inclusive', () => {
  assertEquals(plan([at(REMINDER_HORIZON_DAYS, 'assignment')]).tasksInHorizon, 1);
  assertEquals(plan([at(REMINDER_HORIZON_DAYS + 1, 'assignment')]).tasksInHorizon, 0);
});

Deno.test('overdue work is not scheduled and not counted as projected', () => {
  const past = at(-3, 'assignment');
  const soon = at(1, 'assignment');
  const p = plan([past, soon]);
  assertEquals(p.tasksInHorizon, 1);
  assert(p.reminders.every((r) => r.taskId === soon.id));
  assert(!p.reminders.some((r) => r.taskId === past.id));
});

// ── ladder ─────────────────────────────────────────────────────────────────

Deno.test('an exam earns more slots than a reading', () => {
  const exam = plan([at(20, 'exam')]);
  const reading = plan([at(20, 'reading')]);
  assertEquals(exam.reminders.length, 4);
  // The exam's rungs are all advance warning — none at the deadline itself.
  assert(!exam.reminders.some((r) => r.offsetMinutes === AT_DUE_TIME));
  assertEquals(reading.reminders.length, 1);
  assertEquals(reading.reminders[0].offsetMinutes, AT_DUE_TIME);
});

Deno.test('every type has a defined ladder and none is empty', () => {
  for (const type of ['exam', 'project', 'assignment', 'quiz', 'reading', 'other']) {
    const p = plan([at(20, type)]);
    assert(p.reminders.length > 0, `${type} got no reminders`);
  }
});

Deno.test('an unknown type behaves like an assignment', () => {
  assertEquals(
    plan([at(20, 'made_up')]).reminders.length,
    plan([at(20, 'assignment')]).reminders.length,
  );
  assertEquals(plan([at(20, null)]).reminders.length, plan([at(20, 'assignment')]).reminders.length);
});

// ── preferences (the free/Pro boundary is unchanged in this phase) ──────────

Deno.test('a free account still gets only same-day reminders', () => {
  const p = plan([at(20, 'exam')], FREE);
  assert(p.reminders.every((r) => r.offsetMinutes <= 120),
    'no advance rung may survive with the advance switches off');
});

Deno.test('turning off the 3-day switch drops the week rung too', () => {
  const p = plan([at(20, 'exam')], { reminder_same_day: true, reminder_1day: true, reminder_3day: false });
  assert(!p.reminders.some((r) => r.offsetMinutes === WEEK_BEFORE));
  assert(p.reminders.some((r) => r.offsetMinutes === ONE_DAY_BEFORE));
});

Deno.test('all switches off means no reminders at all', () => {
  const p = plan([at(10, 'exam')], { reminder_same_day: false, reminder_1day: false, reminder_3day: false });
  assertEquals(p.reminders.length, 0);
});

// ── explicit overrides ─────────────────────────────────────────────────────

Deno.test('an explicit choice replaces the ladder and is never shed', () => {
  const heavy = Array.from({ length: 60 }, () => at(20, 'reading'));
  const chosen = at(25, 'reading', [WEEK_BEFORE]);
  const p = plan([...heavy, chosen], ALL_ON, 10);
  const mine = p.reminders.filter((r) => r.taskId === chosen.id);
  assertEquals(mine.length, 1);
  assertEquals(mine[0].rung, 'override');
  assertEquals(mine[0].offsetMinutes, WEEK_BEFORE);
});

Deno.test('an empty override means never remind me about this one', () => {
  const p = plan([at(10, 'exam', [])]);
  assertEquals(p.reminders.length, 0);
  // Still counted as considered — it was in the horizon, it just wanted nothing.
  assertEquals(p.tasksInHorizon, 1);
});

Deno.test('duplicate offsets in an override collapse', () => {
  const p = plan([at(10, 'exam', [1440, 1440, 1440])]);
  assertEquals(p.reminders.length, 1);
});

// ── budget and shedding ────────────────────────────────────────────────────

Deno.test('a realistic heavy load fits without shedding anything', () => {
  // The 90th percentile student: 25 tasks inside 30 days, typical mix.
  const tasks = [
    ...Array.from({ length: 10 }, (_, i) => at(3 + i, 'assignment')),
    ...Array.from({ length: 6 }, (_, i) => at(5 + i, 'quiz')),
    ...Array.from({ length: 6 }, (_, i) => at(4 + i, 'reading')),
    ...Array.from({ length: 2 }, (_, i) => at(12 + i, 'exam')),
    at(20, 'project'),
  ];
  const p = plan(tasks);
  assert(p.scheduled <= REMINDER_BUDGET, `used ${p.scheduled}`);
  assertEquals(p.pruned.length, 0, 'the p90 student should never be pruned');
});

Deno.test('the worst observed load stays within budget and keeps every exam', () => {
  // 91 tasks inside 30 days is the production maximum.
  const tasks = [
    ...Array.from({ length: 40 }, (_, i) => at(1 + (i % 30), 'assignment')),
    ...Array.from({ length: 25 }, (_, i) => at(1 + (i % 30), 'reading')),
    ...Array.from({ length: 20 }, (_, i) => at(1 + (i % 30), 'quiz')),
    ...Array.from({ length: 6 }, (_, i) => at(3 + i, 'exam')),
  ];
  const p = plan(tasks);
  assert(p.projected > REMINDER_BUDGET, 'this load should genuinely overflow');

  // Every exam rung survives — exams within the protection window are protected.
  const examRungs = p.reminders.filter((r) => r.type === 'exam');
  assertEquals(examRungs.length, 6 * 4, 'no exam reminder may be shed');

  // Readings are what paid for it.
  const shedReadings = p.pruned.filter((x) => x.type === 'reading')
    .reduce((n, x) => n + x.count, 0);
  assert(shedReadings >= 0);
  assert(p.pruned.length > 0, 'something must be reported as shed');
});

Deno.test('anything due within 48 hours is never shed', () => {
  const imminent = [at(0, 'reading'), at(1, 'reading'), at(2, 'other')];
  const filler = Array.from({ length: 80 }, () => at(20, 'reading'));
  const p = plan([...imminent, ...filler], ALL_ON, 10);
  for (const t of imminent) {
    assert(p.reminders.some((r) => r.taskId === t.id), `${t.id} due in ≤2 days was shed`);
  }
});

Deno.test('an exam inside the protection window survives an extreme shortage', () => {
  const exam = at(EXAM_PROTECTION_DAYS, 'exam');
  const filler = Array.from({ length: 100 }, () => at(20, 'assignment'));
  const p = plan([exam, ...filler], ALL_ON, 5);
  assertEquals(p.reminders.filter((r) => r.taskId === exam.id).length, 4);
});

Deno.test('an exam beyond the protection window is shed before a near deadline', () => {
  const farExam = at(28, 'exam');
  const filler = Array.from({ length: 80 }, (_, i) => at(1 + (i % 2), 'assignment'));
  const p = plan([farExam, ...filler], ALL_ON, 20);
  // Not protected, so its distant rungs can go — but the imminent work stayed.
  assert(p.reminders.filter((r) => r.daysUntilDue <= 2).length > 0);
});

Deno.test('low-value rungs shed before high-value ones', () => {
  const tasks = Array.from({ length: 40 }, (_, i) => at(10 + (i % 20), 'assignment'));
  const p = plan(tasks, ALL_ON, 40);
  const keptRungs = new Set(p.reminders.map((r) => r.rung));
  const shedRungs = new Set(p.pruned.map((x) => x.rung));
  // The deadline reminder is the last thing to go.
  assert(keptRungs.has('dueTime'));
  assert(!shedRungs.has('dueTime'), 'due-time reminders must outlive advance ones');
});

Deno.test('readings shed before assignments at equal distance', () => {
  const readings = Array.from({ length: 30 }, () => at(15, 'reading'));
  const assignments = Array.from({ length: 30 }, () => at(15, 'assignment'));
  const p = plan([...readings, ...assignments], ALL_ON, 40);
  const keptReadings = p.reminders.filter((r) => r.type === 'reading').length;
  const keptAssignments = p.reminders.filter((r) => r.type === 'assignment').length;
  assert(keptAssignments > keptReadings,
    `assignments ${keptAssignments} should outrank readings ${keptReadings}`);
});

Deno.test('protection may legitimately exceed the budget, and it is reported honestly', () => {
  // 30 exams in the next fortnight is not a real week, but the planner must not
  // silently break its own promise if it happens.
  const exams = Array.from({ length: 30 }, (_, i) => at(1 + (i % 10), 'exam'));
  const p = plan(exams, ALL_ON, 10);
  assertEquals(p.reminders.length, 30 * 4);
  assertEquals(p.scheduled, p.reminders.length);
});

// ── accounting ─────────────────────────────────────────────────────────────

Deno.test('projected and scheduled add up with what was shed', () => {
  const tasks = Array.from({ length: 50 }, (_, i) => at(5 + (i % 20), 'reading'));
  const p = plan(tasks, ALL_ON, 10);
  const shed = p.pruned.reduce((n, x) => n + x.count, 0);
  assertEquals(p.scheduled + shed, p.projected);
});

Deno.test('the pruned summary carries no identifying detail', () => {
  const p = plan(Array.from({ length: 90 }, () => at(20, 'reading')), ALL_ON, 10);
  for (const bucket of p.pruned) {
    assertEquals(Object.keys(bucket).sort(), ['count', 'rung', 'type']);
  }
});

Deno.test('offsetsForTask returns just that task', () => {
  const a = at(10, 'exam');
  const b = at(10, 'reading');
  const p = plan([a, b]);
  assertEquals(offsetsForTask(p, b.id).length, 1);
  assertEquals(offsetsForTask(p, a.id).length, 4);
  assertEquals(offsetsForTask(p, 'nope'), []);
});

// ── single-task path ───────────────────────────────────────────────────────

Deno.test('the single-task ladder matches the planner for the same type', () => {
  for (const type of ['exam', 'project', 'assignment', 'quiz', 'reading', 'other']) {
    const fromPlan = plan([at(20, type)]).reminders.map((r) => r.offsetMinutes).sort((x, y) => x - y);
    const single = offsetsForSingleTask(type, ALL_ON).sort((x, y) => x - y);
    assertEquals(single, fromPlan, `${type} disagrees between the two paths`);
  }
});

Deno.test('the single-task ladder honours preferences', () => {
  assert(offsetsForSingleTask('exam', FREE).every((o) => o <= 120));
  assertEquals(offsetsForSingleTask('exam', { reminder_same_day: false, reminder_1day: false, reminder_3day: false }), []);
});

// ── priority as the importance override ────────────────────────────────────

import { describeLadder } from './reminderPlan';

const hi = (days: number, type: string): PlanTask => ({ ...at(days, type), priority: 'high' });

Deno.test('marking a task high priority gives it an exam ladder', () => {
  // The escape hatch for a wrong imported type: Canvas calls the capstone and
  // a weekly problem set the same thing.
  const normal = plan([at(20, 'assignment')]);
  const important = plan([hi(20, 'assignment')]);
  assertEquals(normal.reminders.length, 2);
  assertEquals(important.reminders.length, 4);
  assertEquals(
    important.reminders.map((r) => r.offsetMinutes).sort((a, b) => a - b),
    plan([at(20, 'exam')]).reminders.map((r) => r.offsetMinutes).sort((a, b) => a - b),
  );
});

Deno.test('a high-priority reading is treated as important, not as a reading', () => {
  assertEquals(plan([hi(20, 'reading')]).reminders.length, 4);
});

Deno.test('normal and low priority change nothing', () => {
  const base = plan([at(20, 'assignment')]).reminders.length;
  assertEquals(plan([{ ...at(20, 'assignment'), priority: 'normal' }]).reminders.length, base);
  assertEquals(plan([{ ...at(20, 'assignment'), priority: 'low' }]).reminders.length, base);
  assertEquals(plan([{ ...at(20, 'assignment'), priority: null }]).reminders.length, base);
});

Deno.test('a high-priority task is protected like an exam', () => {
  const important = hi(EXAM_PROTECTION_DAYS, 'assignment');
  const filler = Array.from({ length: 100 }, () => at(20, 'assignment'));
  const p = plan([important, ...filler], ALL_ON, 5);
  assertEquals(p.reminders.filter((r) => r.taskId === important.id).length, 4,
    'the student said this matters; the budget may not overrule them');
});

Deno.test('high priority outranks a plain assignment when the budget bites', () => {
  // Outside the protection window, so value ordering alone decides. Both sets
  // are the same distance away; the only difference is that the student said
  // one set matters.
  const important = Array.from({ length: 10 }, () => hi(15, 'assignment'));
  const ordinary = Array.from({ length: 40 }, () => at(15, 'assignment'));
  const p = plan([...important, ...ordinary], ALL_ON, 30);
  const keptImportant = p.reminders.filter((r) => important.some((t) => t.id === r.taskId)).length;
  const keptOrdinary = p.reminders.filter((r) => ordinary.some((t) => t.id === r.taskId)).length;
  assert(keptImportant > 0, 'an important task must not be shed to zero');
  // Every important task keeps its final warning before any ordinary task's is
  // considered — this is the ranking bug that ate exams' two-hour reminders.
  const importantFinal = p.reminders.filter(
    (r) => important.some((t) => t.id === r.taskId) && r.rung === 'lastCall',
  ).length;
  assertEquals(importantFinal, 10, 'every important task keeps its last warning');
  assert(keptImportant + keptOrdinary === p.scheduled);
});

Deno.test('an exam never loses its last warning to an ordinary due-time nudge', () => {
  // The regression this ordering exists to prevent: lastCall IS an exam's
  // deadline reminder, so it must rank with dueTime rather than below it.
  const exams = Array.from({ length: 5 }, () => at(20, 'exam'));
  const readings = Array.from({ length: 60 }, () => at(20, 'reading'));
  const p = plan([...exams, ...readings], ALL_ON, 20);
  const examFinal = p.reminders.filter((r) => r.type === 'exam' && r.rung === 'lastCall').length;
  assertEquals(examFinal, 5);
});

Deno.test('an explicit per-task choice still beats priority', () => {
  const p = plan([{ ...hi(20, 'assignment'), overrideOffsets: [AT_DUE_TIME] }]);
  assertEquals(p.reminders.length, 1);
  assertEquals(p.reminders[0].rung, 'override');
});

// ── the description shown in the task editor ───────────────────────────────

Deno.test('the description matches what will actually be scheduled', () => {
  for (const type of ['exam', 'project', 'assignment', 'quiz', 'reading', 'other']) {
    const count = plan([at(20, type)]).reminders.length;
    const text = describeLadder(type, ALL_ON);
    assert(text.length > 0);
    // A single-rung type must not claim more than one moment.
    if (count === 1) assert(!text.includes(' and '), `${type}: "${text}" oversells one reminder`);
  }
});

Deno.test('the description tracks preferences and priority', () => {
  assertEquals(describeLadder('reading', ALL_ON), "Reminds you when it's due");
  assert(describeLadder('exam', ALL_ON).includes('1 week'));
  // A free account sees the truth about what it gets, not the Pro ladder.
  assert(!describeLadder('exam', FREE).includes('1 week'));
  // Priority is reflected, so the editor explains why the answer changed.
  assertEquals(describeLadder('assignment', ALL_ON, 'high'), describeLadder('exam', ALL_ON));
});

Deno.test('the description says so when everything is switched off', () => {
  assertEquals(
    describeLadder('exam', { reminder_same_day: false, reminder_1day: false, reminder_3day: false }),
    'No reminders',
  );
});
