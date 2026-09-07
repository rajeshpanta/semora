import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { stakeForTask, stakesByTask, bucketForCategory, type StakeCategory } from '@/lib/taskStake';
import { priorityScore, rankByPriority, reasonFor, tierFor, daysUntilDue } from '@/lib/taskPriority';

const NOW = new Date('2026-09-06T12:00:00');
const C = 'course-1';
const D = (n: number) => {
  const d = new Date(NOW); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const task = (o: Partial<any> & { id: string }) =>
  ({ title: 'T', type: 'assignment', course_id: C, due_date: D(7), weight: null, priority: null, ...o });
const cat = (name: string, w: number | string | null, course = C): StakeCategory =>
  ({ id: name + course, course_id: course, name, weight_percent: w });

// ── stake association ────────────────────────────────────────────────

Deno.test('a task inherits the weight of its KIND, summed across the breakdown', () => {
  // The real shape: three exam rows in one course. Exams are 60% here, and
  // that is the true statement about any one of them.
  const cats = [cat('Exam 1', 15), cat('Exam 2', 15), cat('Final exam', 30), cat('Homework', 20)];
  const s = stakeForTask(task({ id: 'a', type: 'exam', title: 'Exam 2' }), cats);
  assertEquals(s, { bucket: 'exam', weightPercent: 60, categoryCount: 3 });
  const hw = stakeForTask(task({ id: 'b', type: 'assignment', title: 'Problem set 4' }), cats);
  assertEquals(hw, { bucket: 'assignment', weightPercent: 20, categoryCount: 1 });
});

Deno.test('numeric columns arriving as strings still count', () => {
  // Postgres numeric reaches some clients as '20'. This silently scored every
  // category as zero until it was handled.
  assertEquals(stakeForTask(task({ id: 'a', type: 'quiz' }), [cat('Quizzes', '30')])?.weightPercent, 30);
});

Deno.test('it declines rather than guessing', () => {
  const cats = [cat('Quizzes', 30), cat('Attendance', 10)];
  // no category of this kind
  assertEquals(stakeForTask(task({ id: 'a', type: 'project' }), cats), null);
  // type carries no kind at all
  assertEquals(stakeForTask(task({ id: 'b', type: 'other' }), cats), null);
  // no course to scope by
  assertEquals(stakeForTask(task({ id: 'c', type: 'quiz', course_id: null }), cats), null);
  // no categories at all — the 391 courses with no parsed breakdown
  assertEquals(stakeForTask(task({ id: 'd', type: 'quiz' }), []), null);
  assertEquals(stakeForTask(task({ id: 'e', type: 'quiz' }), null), null);
  // another course's breakdown never leaks in
  assertEquals(stakeForTask(task({ id: 'f', type: 'quiz' }), [cat('Quizzes', 30, 'other-course')]), null);
});

Deno.test('ungraded and calendar rows are never priced as real work', () => {
  const cats = [cat('Exams', 40)];
  for (const title of ['Practice Exam #1', 'Mock midterm', 'Optional review session',
    'Study guide for Exam 2', 'Finals week begins', 'Last day to drop', 'Exam 2 make-up']) {
    assertEquals(stakeForTask(task({ id: 'x', type: 'exam', title }), cats), null, title);
  }
  // ...while the real one still prices.
  assertEquals(stakeForTask(task({ id: 'y', type: 'exam', title: 'Exam 2' }), cats)?.weightPercent, 40);
});

Deno.test('presence categories are not work, and a misparsed breakdown declines', () => {
  assertEquals(bucketForCategory('Attendance'), null);
  assertEquals(bucketForCategory('Class participation'), null);
  assertEquals(bucketForCategory('Quizzes'), 'quiz');
  assertEquals(bucketForCategory('Final project'), 'project');
  assertEquals(bucketForCategory('Reading quizzes'), 'quiz', 'more specific pattern wins');
  // A breakdown summing past 100 for one kind was misread — say nothing.
  assertEquals(stakeForTask(task({ id: 'a', type: 'exam' }), [cat('Exam 1', 80), cat('Exam 2', 40)]), null);
});

// ── ranking ──────────────────────────────────────────────────────────

Deno.test('scenario: urgent low-stakes task vs later high-stakes exam', () => {
  const cats = [cat('Exams', 50), cat('Discussion posts', 5)];
  const rows = [
    task({ id: 'post', type: 'assignment', title: 'Discussion post', due_date: D(1) }),
    task({ id: 'exam', type: 'exam', title: 'Exam 2', due_date: D(4) }),
  ];
  const stakes = stakesByTask(rows, cats);
  const ranked = rankByPriority(rows, { now: NOW, stakes });
  assertEquals(ranked[0].task.id, 'exam', 'a 50% exam in four days outranks a 5% post tomorrow');
});

Deno.test('scenario: two assessments the same day, different weights', () => {
  const cats = [cat('Exams', 40, 'c1'), cat('Quizzes', 5, 'c2')];
  const rows = [
    task({ id: 'quiz', type: 'quiz', title: 'Quiz 3', course_id: 'c2', due_date: D(3) }),
    task({ id: 'exam', type: 'exam', title: 'Exam 1', course_id: 'c1', due_date: D(3) }),
  ];
  const stakes = stakesByTask(rows, cats);
  assertEquals(rankByPriority(rows, { now: NOW, stakes })[0].task.id, 'exam');
});

Deno.test('scenario: no weights anywhere falls back to urgency and type, unchanged', () => {
  const rows = [
    task({ id: 'far', type: 'exam', due_date: D(20) }),
    task({ id: 'near', type: 'reading', due_date: D(1) }),
  ];
  const ranked = rankByPriority(rows, { now: NOW });
  assertEquals(ranked[0].task.id, 'near', 'tomorrow beats an exam three weeks out');
  assertEquals(ranked.every((r) => r.result.stake === null), true);
});

Deno.test("scenario: a student's own weight always beats an inferred one", () => {
  const cats = [cat('Quizzes', 60)];
  const rows = [task({ id: 'q', type: 'quiz', title: 'Quiz 1', weight: 2 })];
  const r = priorityScore(rows[0], { now: NOW, stakes: stakesByTask(rows, cats) });
  const inferredOnly = priorityScore(task({ id: 'q2', type: 'quiz', title: 'Quiz 1' }), {
    now: NOW, stakes: stakesByTask([task({ id: 'q2', type: 'quiz', title: 'Quiz 1' })], cats),
  });
  assert(r.score < inferredOnly.score, 'the typed 2% ranks below the inferred 60%');
});

Deno.test('scenario: overdue is urgent but does not climb forever', () => {
  const yesterday = priorityScore(task({ id: 'a', due_date: D(-1) }), { now: NOW });
  const monthLate = priorityScore(task({ id: 'b', due_date: D(-40) }), { now: NOW });
  assertEquals(yesterday.score, monthLate.score, 'lateness is clamped at the due date');
  assertEquals(yesterday.tier, 'overdue');
  const examTomorrow = priorityScore(task({ id: 'c', type: 'exam', due_date: D(1), weight: 30 }), { now: NOW });
  assert(examTomorrow.score > monthLate.score, "a month-late reading cannot outrank tomorrow's exam");
});

Deno.test('scenario: a task with no due date never dominates', () => {
  const undated = priorityScore(task({ id: 'u', due_date: null }), { now: NOW });
  assert(Number.isNaN(undated.daysUntilDue));
  assertEquals(undated.tier, 'ahead');
  assert(undated.score < priorityScore(task({ id: 'd', due_date: D(2) }), { now: NOW }).score);
});

Deno.test('scenario: new student with nothing, and a student with everything done', () => {
  assertEquals(rankByPriority([], { now: NOW }), []);
  assertEquals(rankByPriority(null as never, { now: NOW }), []);
});

Deno.test('exam and grade-risk boosts still apply, and are the planner\'s own', () => {
  const plain = priorityScore(task({ id: 'a', type: 'exam' }), { now: NOW });
  const boosted = priorityScore(task({ id: 'a', type: 'exam' }), { now: NOW, examTaskIds: ['a'] });
  assertEquals(Math.round((boosted.score / plain.score) * 100) / 100, 1.7);
  const risky = priorityScore(task({ id: 'a', type: 'exam' }), { now: NOW, riskCourseIds: [C] });
  assertEquals(Math.round((risky.score / plain.score) * 100) / 100, 1.28);
  // Arrays and Sets both work — callers hold whichever.
  assertEquals(priorityScore(task({ id: 'a' }), { now: NOW, riskCourseIds: new Set([C]) }).score,
               priorityScore(task({ id: 'a' }), { now: NOW, riskCourseIds: [C] }).score);
});

// ── the reason line ──────────────────────────────────────────────────

Deno.test('the reason is parts, never a score and never a sentence', () => {
  const cats = [cat('Exams', 30)];
  const t = task({ id: 'a', type: 'exam', title: 'Exam 2', due_date: D(2) });
  const r = reasonFor(priorityScore(t, { now: NOW, stakes: stakesByTask([t], cats) }));
  assertEquals(r, { timing: 'days', days: 2, stake: { bucket: 'exam', weightPercent: 30 } });
  // Nothing in the payload is a number a student would read as a rank.
  assertEquals(Object.keys(r).sort(), ['days', 'stake', 'timing']);
});

Deno.test('timing words cover every case the UI must render', () => {
  const mk = (d: number | null) => reasonFor(priorityScore(task({ id: 'a', due_date: d === null ? null : D(d) }), { now: NOW }));
  assertEquals(mk(0).timing, 'today');
  assertEquals(mk(1).timing, 'tomorrow');
  assertEquals(mk(5).timing, 'days');
  assertEquals(mk(5).days, 5);
  assertEquals(mk(-3).timing, 'overdue');
  assertEquals(mk(-3).days, 3, 'days late, not negative');
  assertEquals(mk(null).timing, 'undated');
});

Deno.test('a stake too small to matter is not mentioned', () => {
  const cats = [cat('Discussion', 5)];
  const t = task({ id: 'a', type: 'assignment', title: 'Post 3' });
  const res = priorityScore(t, { now: NOW, stakes: stakesByTask([t], cats) });
  assertEquals(res.stake?.weightPercent, 5, 'still used for ranking');
  assertEquals(reasonFor(res).stake, null, 'but not worth a sentence');
});

// ── invariants ───────────────────────────────────────────────────────

Deno.test('ranking is deterministic and total', () => {
  const rows = [
    task({ id: 'a', due_date: D(3), title: 'Alpha' }),
    task({ id: 'b', due_date: D(3), title: 'Beta' }),
    task({ id: 'c', due_date: D(3), title: 'Alpha' }),
  ];
  const once = rankByPriority(rows, { now: NOW }).map((r) => r.task.id);
  const twice = rankByPriority(rows, { now: NOW }).map((r) => r.task.id);
  assertEquals(once, twice);
  assertEquals(once.length, 3, 'nothing is dropped — filtering is the caller\'s job');
});

Deno.test('tier boundaries', () => {
  assertEquals([-1, 0, 1, 2, 4, 5].map(tierFor), ['overdue', 'now', 'now', 'soon', 'soon', 'ahead']);
});

Deno.test('a garbage due date is treated as undated, not as epoch', () => {
  assert(Number.isNaN(daysUntilDue('not-a-date', NOW)));
  assert(Number.isNaN(daysUntilDue(null, NOW)));
  assertEquals(priorityScore(task({ id: 'a', due_date: 'garbage' }), { now: NOW }).tier, 'ahead');
});

// ── localization ─────────────────────────────────────────────────────
// Every phrase the card composes must survive the Spanish build. These are
// assembled from interpolated values, so they never appear in the phrase map
// as whole sentences and rely on spanishPattern in lib/i18n.ts.

Deno.test('every phrase the Up next card renders has Spanish', async () => {
  const { translate } = await import('@/lib/i18n');
  const phrases = [
    'Up next', 'Open plan', 'Do now', 'Coming up', 'Plan ahead',
    'due today', 'due tomorrow', 'due in 3 days', 'due in 12 days',
    'exams are 30%', 'quizzes are 15%', 'assignments are 20%',
    'projects are 25%', 'readings are 10%', 'labs are 40%',
  ];
  for (const p of phrases) {
    const es = translate(p, 'es');
    assert(es !== p, `no Spanish for ${JSON.stringify(p)}`);
  }
  // The stake clause names the KIND, and Spanish keeps the space before %.
  assertEquals(translate('exams are 30%', 'es'), 'los exámenes son el 30 %');
  assertEquals(translate('due in 3 days', 'es'), 'vence en 3 días');
});

Deno.test('"Up next" is not the Pro product name', async () => {
  const { translate } = await import('@/lib/i18n');
  // The website sells "Smart Plan" as Pro. The free card must not carry it,
  // in either language.
  assert(translate('Up next', 'es') !== translate('Smart Plan', 'es'));
  assertEquals(translate('Smart Plan', 'es'), 'Plan inteligente');
});
