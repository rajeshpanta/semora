/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/reminderReconcile.test.ts
 *
 * Every case here is a way a task can stop being due. The ones that matter are
 * the ones where the phone holding the reminder is not the thing that finished
 * the work — those are the reminders that used to fire anyway.
 *
 * `liveTaskIds` in these tests stands for the answer to "which of the tasks I
 * have reminders scheduled for are still incomplete and still mine?" — i.e.
 * exactly what reconcileTaskReminders asks the database.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { groupRemindersByTask, planReminderReconciliation } from './reminderReconcile';

/** A scheduled task reminder, as expo-notifications reports it. */
const reminder = (identifier: string, taskId: string) => ({
  identifier,
  content: { data: { taskId, taskTitle: 'Essay', fireAt: 1 } },
});

/** Anything scheduled that is NOT a task reminder. */
const pomodoro = (identifier: string) => ({
  identifier,
  content: { data: { tag: 'semora-pomodoro', fireAt: 1 } },
});

// ── 1. Incomplete task → reminder remains ───────────────────────────────────

Deno.test('an open task keeps every reminder it has', () => {
  const scheduled = [reminder('n1', 'task-a'), reminder('n2', 'task-a'), reminder('n3', 'task-a')];
  const plan = planReminderReconciliation(scheduled, ['task-a']);
  assertEquals(plan.cancel, []);
  assertEquals(plan.staleTaskIds, []);
});

Deno.test('open and finished tasks are separated, not swept together', () => {
  const scheduled = [reminder('n1', 'open'), reminder('n2', 'done'), reminder('n3', 'open')];
  const plan = planReminderReconciliation(scheduled, ['open']);
  assertEquals(plan.cancel, ['n2']);
  assertEquals(plan.staleTaskIds, ['done']);
});

// ── 2. Locally completed task → reminder cancelled ──────────────────────────

Deno.test('a task completed on this phone has its reminder withdrawn', () => {
  // cancelTaskReminders already did this at completion time; reconciliation
  // must agree rather than resurrect anything.
  const plan = planReminderReconciliation([reminder('n1', 'task-a')], []);
  assertEquals(plan.cancel, ['n1']);
});

// ── 3. Web-completed task → stale iPhone reminder removed ───────────────────

Deno.test('a task completed on the web app loses its phone reminder', () => {
  // The phone never ran a completion mutation, so nothing cancelled locally.
  // The database is the only thing that knows, which is why it is the input.
  const scheduled = [reminder('n1', 'essay'), reminder('n2', 'essay'), reminder('n3', 'lab')];
  const plan = planReminderReconciliation(scheduled, ['lab']);
  assertEquals(plan.cancel, ['n1', 'n2']);
  assertEquals(plan.staleTaskIds, ['essay']);
});

// ── 4. Canvas-completed task → stale reminder removed ───────────────────────

Deno.test('an assignment Canvas marked submitted loses its reminder', () => {
  // Set server-side by the sync RPC on a pg_cron job. No device was involved,
  // so all three advance reminders (3-day, 1-day, same-day) are still pending.
  const scheduled = [
    reminder('n-3day', 'canvas-hw'),
    reminder('n-1day', 'canvas-hw'),
    reminder('n-same', 'canvas-hw'),
    reminder('n-other', 'still-open'),
  ];
  const plan = planReminderReconciliation(scheduled, ['still-open']);
  assertEquals(plan.cancel, ['n-3day', 'n-1day', 'n-same']);
});

// ── 5. Deleted task → stale reminder removed ────────────────────────────────

Deno.test('a deleted task loses its reminder', () => {
  // Absent from the query for the same reason a completed one is: it did not
  // come back. Both must stop reminding.
  const plan = planReminderReconciliation([reminder('n1', 'gone')], []);
  assertEquals(plan.cancel, ['n1']);
});

Deno.test("a task belonging to a different account loses its reminder", () => {
  // The query is filtered by user_id, so another account's task cannot come
  // back as live — and must not keep notifying whoever is signed in now.
  const plan = planReminderReconciliation([reminder('n1', 'someone-elses')], ['mine']);
  assertEquals(plan.cancel, ['n1']);
});

// ── 6. Unrelated notifications remain untouched ─────────────────────────────

Deno.test('notifications without a taskId are never considered', () => {
  // The Pomodoro timer schedules { tag, fireAt } and no task id. Flashcard,
  // re-engagement and ops notifications are REMOTE pushes and never appear in
  // the scheduled list at all — so this covers everything the app can hold.
  const scheduled = [pomodoro('p1'), pomodoro('p2')];
  const plan = planReminderReconciliation(scheduled, []);
  assertEquals(plan.cancel, []);
  assertEquals(plan.scheduledTaskIds, []);
});

Deno.test('a pomodoro survives a sweep that cancels every task reminder', () => {
  const scheduled = [pomodoro('p1'), reminder('n1', 'done'), pomodoro('p2')];
  const plan = planReminderReconciliation(scheduled, []);
  assertEquals(plan.cancel, ['n1']);
});

Deno.test('malformed notification data is skipped, not crashed on', () => {
  const scheduled = [
    { identifier: 'a', content: null },
    { identifier: 'b', content: { data: null } },
    { identifier: 'c', content: { data: {} } },
    { identifier: 'd', content: { data: { taskId: '' } } },
    { identifier: 'e', content: { data: { taskId: 42 as unknown as string } } },
    reminder('f', 'real'),
  ];
  const plan = planReminderReconciliation(scheduled, []);
  assertEquals(plan.cancel, ['f']);
});

// ── Grouping ────────────────────────────────────────────────────────────────

Deno.test('all reminders for one task group under it', () => {
  const grouped = groupRemindersByTask([
    reminder('n1', 'a'), reminder('n2', 'b'), reminder('n3', 'a'),
  ]);
  assertEquals(grouped.get('a'), ['n1', 'n3']);
  assertEquals(grouped.get('b'), ['n2']);
  assertEquals(grouped.size, 2);
});

Deno.test('nothing scheduled means nothing to do', () => {
  const plan = planReminderReconciliation([], []);
  assertEquals(plan.cancel, []);
  assertEquals(plan.scheduledTaskIds, []);
});
