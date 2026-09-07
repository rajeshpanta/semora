/**
 * What a piece of work is worth, when the student never said.
 *
 * Semora's syllabus scan already extracts the grade breakdown — 1,132 category
 * weights across 216 real courses, most summing to exactly 100%. But only 25 of
 * 8,441 tasks carry a grade_category_id, because linking a task to a category
 * is a thing students do by hand in the grading screen and almost nobody does.
 * So the ranker sees a weight on fewer than one task in ten and falls back to
 * `type ÷ days` for the rest: a 30%-of-the-grade exam and a participation post
 * look the same to it.
 *
 * This closes that gap at READ TIME. Nothing is written. The association is an
 * inference and must never masquerade as the student's own answer — the moment
 * it were persisted to grade_category_id it would start counting in the real
 * computed grade (lib/grades.ts), and a guess would silently become a number on
 * their transcript screen. This feeds RANKING and COPY only.
 *
 * IT IS ALLOWED TO SAY IT DOES NOT KNOW, and does so often. A task earns a
 * stake only when the course's own breakdown contains a category of the same
 * KIND. Anything ambiguous, vetoed, or unmatched simply keeps today's
 * behaviour, which is not a downgrade — it is exactly what ships now.
 *
 * WHY THE COPY TALKS ABOUT THE CATEGORY, NOT THE TASK. Almost every confident
 * match shares its category with a dozen sibling tasks, so "this quiz is 30% of
 * your grade" is false — the category is 30%, split across every quiz in it.
 * The honest sentence is "quizzes are 30% of this course", and that phrasing
 * has a second benefit: the professor's free-text category name ("Quizzes (3)
 * and In-Class 'Pops'") never enters the string, so it stays translatable.
 *
 * Pure and dependency-free.
 */

import type { TaskType } from '@/lib/constants';

/**
 * The kinds of work a grade breakdown distinguishes. Deliberately coarse — the
 * question is "what sort of thing is this", not "which row of the syllabus".
 */
export type StakeBucket = 'exam' | 'quiz' | 'assignment' | 'project' | 'reading' | 'lab';

export interface StakeCategory {
  id: string;
  course_id: string;
  name: string;
  /**
   * Matches the column and lib/grades.ts — a share of the course, 0-100.
   * Postgres `numeric` reaches some clients as a string, so this accepts both
   * rather than silently scoring every category as zero.
   */
  weight_percent: number | string | null;
}

export interface StakeTask {
  id: string;
  title: string;
  type: TaskType;
  course_id?: string | null;
}

export interface TaskStake {
  bucket: StakeBucket;
  /** Total share of the course grade this KIND of work carries, 1-100. */
  weightPercent: number;
  /** How many categories were summed — >1 means "exams" spans several rows. */
  categoryCount: number;
}

/**
 * Category names that describe presence rather than work. A course can weight
 * attendance at 10%, but no task maps to it and "attendance is 10%" is not a
 * reason to study anything.
 */
const NOT_WORK = /\b(attendance|participation|engagement|professionalism|conduct|effort|preparedness)\b/i;

/**
 * Ordered because names overlap: "final project" is a project, "reading quiz"
 * is a quiz, "lab report" is a lab. First match wins, so the more specific
 * patterns come first.
 */
const CATEGORY_BUCKETS: [RegExp, StakeBucket][] = [
  [/\b(final project|capstone|term project|group project|projects?)\b/i, 'project'],
  [/\b(lab|labs|laboratory|lab report)/i, 'lab'],
  [/\b(quiz|quizzes|pop quiz)/i, 'quiz'],
  [/\b(exam|exams|midterm|midterms|final|finals|test|tests)\b/i, 'exam'],
  [/\b(homework|assignment|assignments|problem set|problem sets|psets?|discussion|discussions|paper|papers|essay|essays)\b/i, 'assignment'],
  [/\b(reading|readings|textbook)\b/i, 'reading'],
];

/** A task's own kind. Anything else declines rather than guessing. */
const TASK_BUCKETS: Partial<Record<TaskType, StakeBucket>> = {
  exam: 'exam',
  quiz: 'quiz',
  assignment: 'assignment',
  project: 'project',
  reading: 'reading',
};

/**
 * Titles that look like graded work and are not. "Practice Exam #1" sitting in
 * a course where exams are 20% would otherwise be priced as the real thing, and
 * a calendar marker like "Finals week begins" is not an assessment at all.
 */
const NOT_GRADED = /\b(practice|mock|sample|optional|ungraded|not graded|study guide|pretest|pre-test|review session|extra credit|bonus)\b/i;
const CALENDAR_MARKER = /\b(finals? week|begins?|starts?|ends?|deadline|grace period|make-?up|re-?take|last day|drop|withdraw|withdrawal|no class|holiday|break|orientation|census|closes?|opens?)\b/i;

/** A `numeric` column, whether it arrives as a number or a string. */
function numeric(v: number | string | null | undefined): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

export function bucketForCategory(name: string | null | undefined): StakeBucket | null {
  const n = String(name ?? '').trim();
  if (!n || NOT_WORK.test(n)) return null;
  for (const [re, bucket] of CATEGORY_BUCKETS) if (re.test(n)) return bucket;
  return null;
}

/**
 * The stake for one task, or null when Semora should stay quiet.
 *
 * Categories of the same kind are SUMMED, because a course with "Exam 1" 15%,
 * "Exam 2" 15% and "Final" 30% is a course where exams are 60% — that is the
 * true and useful statement, and it is what makes any single exam in it worth
 * ranking highly. Presenting one row's 15% instead would understate the kind.
 */
export function stakeForTask(
  task: StakeTask | null | undefined,
  categories: readonly StakeCategory[] | null | undefined,
): TaskStake | null {
  if (!task?.course_id) return null;

  const bucket = TASK_BUCKETS[task.type];
  if (!bucket) return null;

  const title = String(task.title ?? '');
  if (NOT_GRADED.test(title) || CALENDAR_MARKER.test(title)) return null;

  let total = 0;
  let count = 0;
  for (const c of categories ?? []) {
    if (c.course_id !== task.course_id) continue;
    if (bucketForCategory(c.name) !== bucket) continue;
    const w = numeric(c.weight_percent);
    if (w <= 0) continue;
    total += w;
    count += 1;
  }

  // Nothing of this kind in the breakdown, or the course weights it at zero.
  if (count === 0 || total <= 0) return null;
  // A kind cannot be worth more than the whole course. A breakdown that says so
  // was misparsed, and inventing 140% would distort every other course's
  // ranking — decline instead.
  if (total > 100) return null;

  return { bucket, weightPercent: Math.round(total), categoryCount: count };
}

/** Every task's stake in one pass, for callers ranking a whole semester. */
export function stakesByTask(
  tasks: readonly StakeTask[] | null | undefined,
  categories: readonly StakeCategory[] | null | undefined,
): Map<string, TaskStake> {
  const out = new Map<string, TaskStake>();
  for (const t of tasks ?? []) {
    const s = stakeForTask(t, categories);
    if (s) out.set(t.id, s);
  }
  return out;
}
