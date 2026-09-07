import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { duePhrase, nextSemesterPriority, stakePhrase } from '@/lib/semesterPriority';
import { getStudySuggestions } from '@/lib/studySuggestions';

const s = (taskId: string, over: Record<string, unknown> = {}) =>
  ({ taskId, title: taskId, type: 'exam', courseId: 'c1', courseName: 'Cell Biology 240',
     courseColor: null, dueDate: '2026-09-11', daysUntilDue: 5, score: 1,
     reason: { timing: 'days', days: 5, stake: null }, tier: 'soon', line: '', ...over }) as any;

// ── choosing what to offer next ──────────────────────────────────────

Deno.test('the next priority is the top of the list that is not the current task', () => {
  const list = [s('a'), s('b'), s('c')];
  assertEquals(nextSemesterPriority(list, 'a')?.taskId, 'b');
  assertEquals(nextSemesterPriority(list, 'b')?.taskId, 'a', 'order is the list order, not "the one after"');
  assertEquals(nextSemesterPriority(list, null)?.taskId, 'a');
});

Deno.test('a finished-everything semester offers nothing rather than inventing work', () => {
  assertEquals(nextSemesterPriority([], 'a'), null);
  assertEquals(nextSemesterPriority([s('a')], 'a'), null, 'the only item is the one just done');
});

Deno.test('the offer may be another course, and may be the same one', () => {
  const list = [s('a', { courseId: 'c1' }), s('b', { courseId: 'c2', courseName: 'Statistics 210' })];
  // Crossing courses is allowed, not required: the ranking decides, not the course.
  assertEquals(nextSemesterPriority(list, 'a')?.courseName, 'Statistics 210');
  assertEquals(nextSemesterPriority([s('a'), s('b')], 'b')?.courseId, 'c1');
});

// ── the ranking is not re-implemented here ───────────────────────────

Deno.test('the offer takes the SAME order the Up next card renders', () => {
  // One list, ranked once. If this ever diverges, two surfaces are telling the
  // student different things about the same day — the exact bug S0 removed.
  const tasks = [
    { id: 'lab', title: 'Lab Report', type: 'assignment', due_date: '2026-09-13', course_id: 'c1', courses: { name: 'Cell Biology 240' } },
    { id: 'exam', title: 'Exam 2', type: 'exam', due_date: '2026-09-11', course_id: 'c1', courses: { name: 'Cell Biology 240' } },
  ];
  const now = new Date('2026-09-06T12:00:00Z');
  const ranked = getStudySuggestions(tasks as any, undefined, now, 5);
  assertEquals(ranked[0].taskId, 'exam', 'the exam outranks the nearer-dated assignment');
  // The conductor offers the runner-up once the exam is the session in play.
  assertEquals(nextSemesterPriority(ranked, 'exam')?.taskId, 'lab');
});

Deno.test('every suggestion carries the course it belongs to, so an offer can open it', () => {
  const tasks = [{ id: 't1', title: 'Exam 2', type: 'exam', due_date: '2026-09-11', course_id: 'course-abc', courses: { name: 'Cell Biology 240' } }];
  const ranked = getStudySuggestions(tasks as any, undefined, new Date('2026-09-06T12:00:00Z'), 5);
  assertEquals(ranked[0].courseId, 'course-abc');
});

Deno.test('a task with no course still ranks, and reports no course rather than a wrong one', () => {
  const tasks = [{ id: 't1', title: 'Read chapter 4', type: 'reading', due_date: '2026-09-08' }];
  const ranked = getStudySuggestions(tasks as any, undefined, new Date('2026-09-06T12:00:00Z'), 5);
  assertEquals(ranked[0].courseId, null);
});

// ── the phrases both surfaces say ────────────────────────────────────

Deno.test('due phrasing is whole strings i18n can match', () => {
  assertEquals(duePhrase({ daysUntilDue: 0 }), 'due today');
  assertEquals(duePhrase({ daysUntilDue: 1 }), 'due tomorrow');
  assertEquals(duePhrase({ daysUntilDue: 5 }), 'due in 5 days');
  // Overdue work never reaches this surface (studySuggestions drops days < 0),
  // and if it somehow did, "due today" is the honest floor rather than "due in -2 days".
  assertEquals(duePhrase({ daysUntilDue: -2 }), 'due today');
});

Deno.test('the stake names the KIND, never the single task', () => {
  assertEquals(stakePhrase({ bucket: 'exam', weightPercent: 30 }), 'exams are 30%');
  assertEquals(stakePhrase({ bucket: 'assignment', weightPercent: 20 }), 'assignments are 20%');
  assertEquals(stakePhrase({ bucket: 'lab', weightPercent: 50 }), 'labs are 50%');
});

Deno.test('no phrase makes a claim about time to complete', () => {
  // S7 must not grow "about 45 minutes" by accident — Semora has no basis for it.
  for (const d of [0, 1, 3, 30]) {
    const phrase = duePhrase({ daysUntilDue: d });
    assertEquals(/minute|hour|hr|min\b/i.test(phrase), false, phrase);
  }
});
