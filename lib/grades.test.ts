/**
 * Run with:  ~/.deno/bin/deno test --no-lock --sloppy-imports lib/grades.test.ts
 *
 * The course grade is the number a student trusts most and can check least —
 * they cannot see the weights the engine used, only the letter it produced. So
 * every case below is one where the engine used to answer confidently and
 * wrongly, plus the cases that must keep answering exactly as they do today.
 *
 * `--sloppy-imports` is required because lib/ uses extensionless imports for
 * the Metro bundler; Deno needs to be told those are `.ts`.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { calculateCourseGrade, type GradeTask } from './grades';

const SCALE = [
  { letter: 'A', min: 90 }, { letter: 'B', min: 80 }, { letter: 'C', min: 70 },
  { letter: 'D', min: 60 }, { letter: 'F', min: 0 },
] as any;

const task = (over: Partial<GradeTask> = {}): GradeTask => ({
  weight: null, score: null, is_extra_credit: false, ...over,
});

const category = (id: string, weight: number, name = id) =>
  ({ id, name, weight_percent: weight, drop_lowest_count: 0, position: 0 });

const grade = (tasks: GradeTask[], cats: any[] = []) =>
  calculateCourseGrade(tasks, cats, SCALE, 'bonus');

// ── Weight-based courses ────────────────────────────────────────────────────

Deno.test('all weighted: unchanged weighted average', () => {
  // Scenario A. 20×90 + 30×80 over 50 attempted = 84.
  const result = grade([
    task({ weight: 20, score: 90 }),
    task({ weight: 30, score: 80 }),
    task({ weight: 50, score: null }),
  ]);
  assertEquals(result.percentage, 84);
  assertEquals(result.letter, 'B');
  assertEquals(result.weightAttempted, 50);
  assertEquals(result.weightTotal, 100);
  // Nothing was imputed, so nothing to warn about.
  assertEquals(result.unweightedGradedCount, 0);
});

Deno.test('all unweighted: straight average, exactly as before', () => {
  const result = grade([
    task({ score: 90 }), task({ score: 80 }), task({ score: 70 }),
  ]);
  assertEquals(result.percentage, 80);
  assertEquals(result.letter, 'B');
  assertEquals(result.weightTotal, 0);
  assertEquals(result.unweightedGradedCount, 3);
});

Deno.test('all unweighted with ungraded work: ungraded does not dilute', () => {
  const result = grade([
    task({ score: 90 }), task({ score: 70 }), task({ score: null }),
  ]);
  assertEquals(result.percentage, 80);
});

Deno.test('MIXED: unweighted grades are not discarded', () => {
  // The audit's executed failure: this returned 100 / A, built by throwing
  // away five of the six grades. 20% declared leaves 80% shared by five
  // tasks (16 each): (20×100 + 5×16×60) / 100 = 68.
  const result = grade([
    task({ score: 60 }), task({ score: 60 }), task({ score: 60 }),
    task({ score: 60 }), task({ score: 60 }),
    task({ weight: 20, score: 100 }),
  ]);
  assertEquals(result.percentage, 68);
  assertEquals(result.letter, 'D');
  assertEquals(result.unweightedGradedCount, 5);
  assertEquals(result.imputedWeight, 16);
});

Deno.test('MIXED: declared weights already at 100 still count unweighted work', () => {
  // Nothing left to share out, so each unweighted task takes the mean declared
  // weight rather than vanishing. 100 declared over one task = 100 each:
  // (100×100 + 100×0) / 200 = 50.
  const result = grade([
    task({ weight: 100, score: 100 }),
    task({ score: 0 }),
  ]);
  assertEquals(result.percentage, 50);
  assertEquals(result.unweightedGradedCount, 1);
});

Deno.test('zero is a real grade, not a missing one', () => {
  assertEquals(grade([task({ weight: 100, score: 0 })]).percentage, 0);
  assertEquals(grade([task({ weight: 100, score: 0 })]).letter, 'F');
  // A zero must drag a weighted average down, not be skipped.
  assertEquals(grade([
    task({ weight: 50, score: 100 }),
    task({ weight: 50, score: 0 }),
  ]).percentage, 50);
});

Deno.test('points-only grading counts in the weight-based path too', () => {
  // Used to return null ("No grades yet") here while the category path
  // returned 0 for the same row.
  const result = grade([
    task({ weight: 100, score: null, points_earned: 0, points_possible: 100 }),
  ]);
  assertEquals(result.percentage, 0);
  assertEquals(result.letter, 'F');
});

Deno.test('ungraded tasks alone produce no grade', () => {
  const result = grade([task({ weight: 50 }), task({ weight: 50 })]);
  assertEquals(result.percentage, null);
  assertEquals(result.letter, null);
});

Deno.test('no tasks at all produce no grade', () => {
  assertEquals(grade([]).percentage, null);
});

Deno.test('extra credit still adds bonus without growing the denominator', () => {
  // 30×80 + 20×100 = 4400 over 50 attempted = 88, plus a 5-weight EC at 100.
  const result = grade([
    task({ weight: 30, score: 80 }),
    task({ weight: 20, score: 100 }),
    task({ weight: 5, score: 100, is_extra_credit: true }),
  ]);
  assertEquals(result.percentage, 98);
  assertEquals(result.weightAttempted, 50);
});

// ── Category courses ────────────────────────────────────────────────────────

Deno.test('categories: all tasks categorized', () => {
  // Scenario A again, through the category path.
  const result = grade([
    task({ score: 90, grade_category_id: 'hw' }),
    task({ score: 80, grade_category_id: 'mid' }),
    task({ score: null, grade_category_id: 'fin' }),
  ], [category('hw', 20), category('mid', 30), category('fin', 50)]);
  assertEquals(result.percentage, 84);
  assertEquals(result.letter, 'B');
  assertEquals(result.uncategorized.gradedCount, 0);
  assertEquals(result.uncategorized.counted, false);
});

Deno.test('categories: one uncategorized graded task is counted, not dropped', () => {
  // Categories cover 60%, leaving 40% for work outside them.
  // (60×100 + 40×0) / 100 = 60.
  const result = grade([
    task({ score: 100, grade_category_id: 'hw' }),
    task({ score: 0 }),
  ], [category('hw', 60)]);
  assertEquals(result.percentage, 60);
  assertEquals(result.uncategorized.gradedCount, 1);
  assertEquals(result.uncategorized.counted, true);
  assertEquals(result.uncategorized.weight, 40);
  assertEquals(result.uncategorized.average, 0);
});

Deno.test('categories: an uncategorized ZERO cannot silently disappear', () => {
  // The audit's executed failure: one 100 in a category and one uncategorized
  // 0 reported 100% / A. With categories at 100% the zero cannot be weighted
  // honestly, so it stays out of the number — but it is REPORTED, and the card
  // renders the warning from these fields.
  const result = grade([
    task({ score: 100, grade_category_id: 'hw' }),
    task({ score: 0 }),
  ], [category('hw', 100)]);
  assertEquals(result.uncategorized.gradedCount, 1);
  assertEquals(result.uncategorized.average, 0);
  assertEquals(result.uncategorized.counted, false);
});

Deno.test('categories: multiple uncategorized graded tasks average together', () => {
  // Categories cover 50%. Uncategorized average = (80 + 40) / 2 = 60.
  // (50×100 + 50×60) / 100 = 80.
  const result = grade([
    task({ score: 100, grade_category_id: 'hw' }),
    task({ score: 80 }),
    task({ score: 40 }),
  ], [category('hw', 50)]);
  assertEquals(result.percentage, 80);
  assertEquals(result.uncategorized.gradedCount, 2);
  assertEquals(result.uncategorized.average, 60);
  assertEquals(result.uncategorized.counted, true);
});

Deno.test('categories: ungraded uncategorized work changes nothing', () => {
  const result = grade([
    task({ score: 90, grade_category_id: 'hw' }),
    task({ score: null }),
  ], [category('hw', 50)]);
  assertEquals(result.percentage, 90);
  assertEquals(result.uncategorized.gradedCount, 0);
  assertEquals(result.uncategorized.counted, false);
});

Deno.test('categories: drop-lowest still applies and is reported', () => {
  const result = grade([
    task({ id: 'a', score: 100, grade_category_id: 'hw' }),
    task({ id: 'b', score: 0, grade_category_id: 'hw' }),
  ], [{ ...category('hw', 100), drop_lowest_count: 1 }]);
  assertEquals(result.percentage, 100);
  assertEquals(result.droppedTaskIds, ['b']);
});
