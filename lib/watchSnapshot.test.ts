/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/watchSnapshot.test.ts
 *
 * The risk this module carries is not arithmetic — it is DRIFT. The Watch must
 * agree with the Today tab about what is overdue, what is due today and what is
 * next, and the only way it can disagree is if this file starts deciding things
 * for itself. So most of these cases pin the boundary: the builder must trust
 * the arrays it is given, and must not re-filter, re-sort, or re-interpret them.
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildWatchSnapshot,
  signedOutWatchSnapshot,
  WATCH_MAX_ITEMS,
  WATCH_MAX_OVERDUE_ITEMS,
  type WatchSourceTask,
} from './watchSnapshot';

const TODAY = '2026-08-28';

let seq = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
const task = (over: Partial<WatchSourceTask> & { title: string; due_date: string }): WatchSourceTask => ({
  id: uuid(),
  courses: { name: 'Biology 101', color: '#22AA55' },
  ...over,
});

// ── Counts ─────────────────────────────────────────────────────────────────

Deno.test('counts come from the source arrays, not the rendered rows', () => {
  const overdue = Array.from({ length: 9 }, (_, i) =>
    task({ title: `late ${i}`, due_date: '2026-08-20' }));
  const upcoming = Array.from({ length: 5 }, (_, i) =>
    task({ title: `today ${i}`, due_date: TODAY }));

  const snap = buildWatchSnapshot({ overdue, upcoming, todayKey: TODAY });

  // Rows are capped; the headline numbers must stay true.
  assertEquals(snap.overdueCount, 9);
  assertEquals(snap.dueTodayCount, 5);
  assert(snap.items.length <= WATCH_MAX_ITEMS);
});

Deno.test('due-today counts only exact-today rows', () => {
  const snap = buildWatchSnapshot({
    overdue: [],
    upcoming: [
      task({ title: 'now', due_date: TODAY }),
      task({ title: 'tomorrow', due_date: '2026-08-29' }),
      task({ title: 'next week', due_date: '2026-09-04' }),
    ],
    todayKey: TODAY,
  });
  assertEquals(snap.dueTodayCount, 1);
  assertEquals(snap.overdueCount, 0);
});

Deno.test('an empty semester is a valid answer, not a missing one', () => {
  const snap = buildWatchSnapshot({ overdue: [], upcoming: [], todayKey: TODAY });
  assertEquals(snap.state, 'ready');
  assertEquals(snap.dueTodayCount, 0);
  assertEquals(snap.overdueCount, 0);
  assertEquals(snap.items, []);
});

// ── Ordering and bucketing ─────────────────────────────────────────────────

Deno.test('rows run overdue → today → upcoming', () => {
  const snap = buildWatchSnapshot({
    overdue: [task({ title: 'late', due_date: '2026-08-25' })],
    upcoming: [
      task({ title: 'today', due_date: TODAY }),
      task({ title: 'later', due_date: '2026-08-30' }),
    ],
    todayKey: TODAY,
  });
  assertEquals(snap.items.map((i) => i.bucket), ['overdue', 'today', 'upcoming']);
  assertEquals(snap.items.map((i) => i.title), ['late', 'today', 'later']);
});

Deno.test('the caller\'s order inside each bucket is preserved', () => {
  // useTasks orders by due_date then due_time in Postgres. Re-sorting here
  // would silently discard the due_time tiebreak.
  const snap = buildWatchSnapshot({
    overdue: [],
    upcoming: [
      task({ title: '9am', due_date: TODAY, due_time: '09:00' }),
      task({ title: '2pm', due_date: TODAY, due_time: '14:00' }),
      task({ title: 'no time', due_date: TODAY, due_time: null }),
    ],
    todayKey: TODAY,
  });
  assertEquals(snap.items.map((i) => i.title), ['9am', '2pm', 'no time']);
});

Deno.test('a backlog cannot crowd out today and next-up', () => {
  // The regression that matters: 20 overdue used to mean the Watch showed
  // nothing but overdue, hiding the thing actually due in two hours.
  const snap = buildWatchSnapshot({
    overdue: Array.from({ length: 20 }, (_, i) =>
      task({ title: `late ${i}`, due_date: '2026-08-01' })),
    upcoming: [
      task({ title: 'due today', due_date: TODAY }),
      task({ title: 'due friday', due_date: '2026-09-04' }),
    ],
    todayKey: TODAY,
  });
  const overdueRows = snap.items.filter((i) => i.bucket === 'overdue');
  assertEquals(overdueRows.length, WATCH_MAX_OVERDUE_ITEMS);
  assert(snap.items.some((i) => i.title === 'due today'), 'today must survive a backlog');
  assert(snap.items.some((i) => i.title === 'due friday'), 'next-up must survive a backlog');
  assertEquals(snap.overdueCount, 20);
});

// ── Field mapping and defaults ─────────────────────────────────────────────

Deno.test('course name and colour carry through', () => {
  const snap = buildWatchSnapshot({
    overdue: [],
    upcoming: [task({ title: 'Lab report', due_date: TODAY, courses: { name: 'Chem 210', color: '#FF8800' } })],
    todayKey: TODAY,
  });
  assertEquals(snap.items[0].course, 'Chem 210');
  assertEquals(snap.items[0].colorHex, '#FF8800');
  assertEquals(snap.items[0].dueDate, TODAY);
});

Deno.test('the task id is carried through so a row can be completed', () => {
  const t = task({ title: 'Essay', due_date: TODAY });
  const snap = buildWatchSnapshot({ overdue: [], upcoming: [t], todayKey: TODAY });
  assertEquals(snap.items[0].id, t.id);
});

Deno.test('a task with no course still renders', () => {
  const snap = buildWatchSnapshot({
    overdue: [],
    upcoming: [{ id: uuid(), title: 'Orphan', due_date: TODAY, courses: null }],
    todayKey: TODAY,
  });
  assertEquals(snap.items[0].course, 'Course');
  assertEquals(snap.items[0].colorHex, '#6B46C1');
});

Deno.test('blank course fields fall back rather than rendering empty', () => {
  const snap = buildWatchSnapshot({
    overdue: [],
    upcoming: [{ id: uuid(), title: 'Thing', due_date: TODAY, courses: { name: '   ', color: '' } }],
    todayKey: TODAY,
  });
  assertEquals(snap.items[0].course, 'Course');
  assertEquals(snap.items[0].colorHex, '#6B46C1');
});

Deno.test('an untitled task is named, not blank', () => {
  const snap = buildWatchSnapshot({
    overdue: [],
    upcoming: [{ id: uuid(), title: '  ', due_date: TODAY }],
    todayKey: TODAY,
  });
  assertEquals(snap.items[0].title, 'Untitled task');
});

Deno.test('due time is preserved, including its absence', () => {
  const snap = buildWatchSnapshot({
    overdue: [],
    upcoming: [
      task({ title: 'timed', due_date: TODAY, due_time: '23:59' }),
      task({ title: 'untimed', due_date: TODAY }),
    ],
    todayKey: TODAY,
  });
  assertEquals(snap.items[0].dueTime, '23:59');
  assertEquals(snap.items[1].dueTime, null);
});

// ── Privacy surface ────────────────────────────────────────────────────────

Deno.test('only the task id crosses; nothing that identifies the account', () => {
  // The Watch has no account of its own and never will in this design. If a
  // future edit widens the row shape, this fails before it ships.
  const snap = buildWatchSnapshot({
    overdue: [],
    upcoming: [{
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      title: 'Essay', due_date: TODAY, courses: { name: 'Eng', color: '#111111' },
      // Extra fields a real TaskWithCourse carries — must not be copied through.
      ...(({ user_id: 'user-uuid', course_id: 'course-uuid' }) as any),
    }],
    todayKey: TODAY,
  });
  const keys = Object.keys(snap.items[0]).sort();
  // The task's own id is present BECAUSE completion needs it (see the comment
  // on WatchTaskItem). Nothing that identifies the account or the course is.
  assertEquals(keys, ['bucket', 'colorHex', 'course', 'dueDate', 'dueTime', 'id', 'title']);
  const blob = JSON.stringify(snap);
  assert(!blob.includes('user-uuid'), 'no user id');
  assert(!blob.includes('course-uuid'), 'no course id');
});

// ── Sign-out ───────────────────────────────────────────────────────────────

Deno.test('sign-out is a distinct state, not an empty day', () => {
  const snap = signedOutWatchSnapshot();
  assertEquals(snap.state, 'signed_out');
  assertEquals(snap.items, []);
  assertEquals(snap.dueTodayCount, 0);
  assertEquals(snap.overdueCount, 0);
  // Must be distinguishable from a genuinely empty semester.
  assert(snap.state !== buildWatchSnapshot({ overdue: [], upcoming: [], todayKey: TODAY }).state);
});
