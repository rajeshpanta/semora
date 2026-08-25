/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/taskStatus.test.ts
 *
 * Every case here is a row that two screens used to describe differently.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isCompletedOnTime, wasCompletedLate, stillNeedsAttention } from './taskStatus';

// `completed_at` is supplied on purpose in the cases below: it is exactly the
// field the old derivation used, and the point of these tests is that it no
// longer changes the answer.

Deno.test('not completed has no on-time answer', () => {
  assertEquals(isCompletedOnTime({ is_completed: false, submitted_late: false }), null);
  assertEquals(wasCompletedLate({ is_completed: false, submitted_late: true }), false);
});

Deno.test('manual: completed before the deadline is on time', () => {
  // TaskCompletionFlow auto-answers false without asking.
  assertEquals(isCompletedOnTime({ is_completed: true, submitted_late: false }), true);
});

Deno.test('manual: ticked after the deadline, student says it was submitted on time', () => {
  // The regression: due 15:00, ticked 18:00, student answered "yes, on time".
  // The old derivation compared the tick time to the deadline and called this
  // late, contradicting Task detail.
  const task = { is_completed: true, submitted_late: false };
  assertEquals(isCompletedOnTime(task), true);
  assertEquals(wasCompletedLate(task), false);
});

Deno.test('manual: ticked after the deadline and declared late', () => {
  const task = { is_completed: true, submitted_late: true };
  assertEquals(isCompletedOnTime(task), false);
  assertEquals(wasCompletedLate(task), true);
});

Deno.test('Canvas: submission flagged late', () => {
  assertEquals(isCompletedOnTime({ is_completed: true, submitted_late: true }), false);
});

Deno.test('Canvas: submission on time', () => {
  assertEquals(isCompletedOnTime({ is_completed: true, submitted_late: false }), true);
});

Deno.test('Canvas: complete with no submission timestamp still counts', () => {
  // Migration 092 can leave completed_at null. These rows used to be dropped
  // from the on-time rate entirely because the old code required it.
  assertEquals(isCompletedOnTime({ is_completed: true, submitted_late: false }), true);
});

Deno.test('reopened: lateness is cleared', () => {
  // The normalize_task_submission trigger forces submitted_late to false when
  // is_completed goes false, and the client mirrors it.
  assertEquals(isCompletedOnTime({ is_completed: false, submitted_late: false }), null);
});

Deno.test('missing submitted_late is treated as on time, never as unknown', () => {
  assertEquals(isCompletedOnTime({ is_completed: true }), true);
  assertEquals(isCompletedOnTime({ is_completed: true, submitted_late: null }), true);
});

// ── What still needs attention ──────────────────────────────────────────────

Deno.test('due-today counts exclude completed work', () => {
  // The DecisionStrip regression: `useTodayTasks` returns completed rows too,
  // on purpose, and the headline tile counted them. A student who finished all
  // three of today's tasks read "3 today" all evening.
  const today = [
    { id: 'a', is_completed: true },
    { id: 'b', is_completed: false },
    { id: 'c', is_completed: true },
  ];
  assertEquals(stillNeedsAttention(today).map((t) => t.id), ['b']);
  assertEquals(stillNeedsAttention(today).length, 1);
});

Deno.test('everything done leaves nothing needing attention', () => {
  assertEquals(stillNeedsAttention([{ is_completed: true }, { is_completed: true }]).length, 0);
});

Deno.test('nothing done leaves the list untouched', () => {
  const rows = [{ is_completed: false }, { is_completed: false }];
  assertEquals(stillNeedsAttention(rows).length, 2);
});

Deno.test('an empty day is empty', () => {
  assertEquals(stillNeedsAttention([]).length, 0);
});
