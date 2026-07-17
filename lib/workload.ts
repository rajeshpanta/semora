// Workload analysis engine — pure functions over the tasks/courses/meetings/
// semester the app already fetches. No React, no data-fetching: every helper
// takes plain arrays and returns plain data so the dashboard screen (and any
// future caller) can memoize freely and tests can call directly.
//
// The whole point of this module is Semora's differentiator vs. extraction-only
// competitors: once a syllabus is scanned we don't just list deadlines, we tell
// the student WHERE the crunch weeks are and WHAT to start on. That analysis all
// lives here.
//
// Weighting model (shared with lib/studySuggestions.ts):
//   loadScore(item) = weight(or base) × typeWeight
// where weight is the grade weight the scan extracted (0–100) and typeWeight
// scales by how much prep a task type usually demands. An exam with no weight
// still reads as heavier than a reading with no weight because of typeWeight.

import type { TaskType } from '@/lib/constants';
import { calculateGrade } from '@/lib/constants';
import type { GradeThreshold } from '@/types/database';
import {
  startOfISOWeek, addWeeks, format, differenceInCalendarISOWeeks,
} from 'date-fns';

// Prep-effort multiplier per task type. Exams/projects dominate a week even at
// the same grade weight as a reading, so the multiplier — not just the grade
// weight — drives the crunch signal. Unknown/legacy types fall back to 1.
const TYPE_WEIGHT: Record<TaskType, number> = {
  exam: 3,
  project: 2.5,
  quiz: 1.5,
  assignment: 1.2,
  reading: 1,
  other: 1,
};

// A dated task with just the fields the workload math needs. Accepts the full
// TaskWithCourse rows from useTasks without forcing callers to reshape — the
// extra fields are simply ignored.
export interface WorkloadTask {
  id: string;
  title: string;
  type: TaskType;
  due_date: string;
  weight: number | null;
  is_completed: boolean;
  is_extra_credit?: boolean;
  course_id?: string;
  courses?: { name?: string | null; color?: string | null } | null;
}

interface SemesterLike {
  start_date: string | null;
  end_date: string | null;
}

export interface WeekBucket {
  /** yyyy-MM-dd of the ISO week's Monday. Stable key for React lists. */
  weekStart: string;
  /** Short human label, e.g. "Sep 2". */
  weekLabel: string;
  items: WorkloadTask[];
  /** Summed weight×typeWeight over the week's incomplete items. */
  loadScore: number;
  /** True when this week is a statistical outlier (mean + 1σ) with ≥2 items. */
  isCrunch: boolean;
}

// Base weight applied to tasks whose grade weight is null/unknown, so an
// un-weighted exam still contributes to the crunch signal (via typeWeight)
// without swamping weeks that have real weights. Deliberately small.
const BASE_WEIGHT = 5;

/** weight×typeWeight for one task. weight falls back to BASE_WEIGHT when the
 *  scan didn't extract a grade weight; typeWeight falls back to 1 for any
 *  legacy/unknown type. Exported so studySuggestions can share the exact math. */
export function taskLoadScore(task: Pick<WorkloadTask, 'type' | 'weight'>): number {
  const w = task.weight != null && task.weight > 0 ? task.weight : BASE_WEIGHT;
  const typeW = TYPE_WEIGHT[task.type] ?? 1;
  return w * typeW;
}

/** Parse a yyyy-MM-dd due_date as local midnight (never UTC — see lib/dates.ts
 *  for the rationale; a raw new Date('2026-05-01') is UTC and shifts west of
 *  UTC by a day). Returns null on empty/garbage so callers can skip the row. */
function parseDueDate(due: string | null | undefined): Date | null {
  if (!due) return null;
  const d = new Date(due + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Bucket INCOMPLETE dated tasks into ISO weeks spanning the semester
 * (start..end). When the semester has no dates, fall back to the min..max of
 * the tasks' own due dates so the chart still renders. Empty/degenerate inputs
 * return [] rather than throwing or dividing by zero.
 *
 * loadScore per week = Σ taskLoadScore(item). Crunch weeks are those whose
 * loadScore is ≥ mean + 1 standard deviation AND that hold ≥2 items (a single
 * heavy exam shouldn't paint a whole week red on its own).
 */
export function buildWeeklyWorkload(
  tasks: WorkloadTask[],
  semester?: SemesterLike | null,
): WeekBucket[] {
  const incomplete = (tasks ?? []).filter(
    (t) => !t.is_completed && parseDueDate(t.due_date) != null,
  );
  if (incomplete.length === 0) return [];

  // Determine the week range. Prefer the semester's real bounds; otherwise
  // derive from the tasks themselves so a user without semester dates still
  // gets a sensible chart.
  const dueDates = incomplete
    .map((t) => parseDueDate(t.due_date)!)
    .sort((a, b) => a.getTime() - b.getTime());

  const semStart = parseDueDate(semester?.start_date);
  const semEnd = parseDueDate(semester?.end_date);

  // Clamp the range so a stray far-future/past task can't blow the chart out to
  // hundreds of weeks: the window is the semester bounds when present, else the
  // task min/max. Always widen to include every incomplete task so nothing is
  // silently dropped from a bucket.
  const rangeStart = semStart ?? dueDates[0];
  const rangeEnd = semEnd ?? dueDates[dueDates.length - 1];
  const firstMonday = startOfISOWeek(
    rangeStart <= dueDates[0] ? rangeStart : dueDates[0],
  );
  const lastAnchor = rangeEnd >= dueDates[dueDates.length - 1]
    ? rangeEnd
    : dueDates[dueDates.length - 1];

  const weekCount = differenceInCalendarISOWeeks(lastAnchor, firstMonday) + 1;
  // Guard against a pathological negative/NaN span — never build fewer than one
  // bucket, and cap the upper bound so a garbage far-future date can't allocate
  // a runaway array.
  const totalWeeks = Math.max(1, Math.min(weekCount, 104));

  const buckets: WeekBucket[] = [];
  for (let i = 0; i < totalWeeks; i++) {
    const weekStartDate = addWeeks(firstMonday, i);
    buckets.push({
      weekStart: format(weekStartDate, 'yyyy-MM-dd'),
      weekLabel: format(weekStartDate, 'MMM d'),
      items: [],
      loadScore: 0,
      isCrunch: false,
    });
  }

  // Assign each task to its ISO-week bucket. Tasks landing beyond the final
  // bucket (only possible when clamped at 104 weeks) fold into the last bucket
  // so they're never dropped from the counts.
  for (const t of incomplete) {
    const due = parseDueDate(t.due_date)!;
    const idx = Math.min(
      Math.max(differenceInCalendarISOWeeks(due, firstMonday), 0),
      totalWeeks - 1,
    );
    const bucket = buckets[idx];
    bucket.items.push(t);
    bucket.loadScore += taskLoadScore(t);
  }

  // Crunch detection over weeks that actually carry load (empty weeks would
  // drag the mean down and mislabel a moderate week as an outlier).
  const loaded = buckets.filter((b) => b.loadScore > 0);
  if (loaded.length >= 2) {
    const scores = loaded.map((b) => b.loadScore);
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const variance =
      scores.reduce((s, v) => s + (v - mean) * (v - mean), 0) / scores.length;
    const std = Math.sqrt(variance);
    // A crunch week is a genuine OUTLIER above the norm. If every loaded week
    // carries (near-)identical load, std ≈ 0 and mean+std ≈ mean, which would
    // paint every week coral and dilute the signal. Require real spread before
    // flagging anything.
    if (std > 1e-9) {
      const threshold = mean + std;
      for (const b of buckets) {
        if (b.loadScore >= threshold && b.items.length >= 2) b.isCrunch = true;
      }
    }
  }

  return buckets;
}

export interface CourseLoad {
  courseId: string;
  courseName: string;
  courseColor: string;
  /** Incomplete task count for this course. */
  remainingCount: number;
  /** Total incomplete task count including completed, for context. */
  totalCount: number;
  /** Summed taskLoadScore over incomplete tasks — the "how heavy" bar value. */
  loadScore: number;
  /** weightTotal − weightAttempted from calculateGrade: % of the grade still
   *  in play. null when the course has no weighted tasks. */
  weightRemaining: number | null;
  /** Soonest incomplete due_date (yyyy-MM-dd), or null. */
  nextDueDate: string | null;
  nextDueTitle: string | null;
}

interface CourseLike {
  id: string;
  name: string;
  color: string;
  grade_scale?: GradeThreshold[] | null;
}

/**
 * Per-course remaining load: incomplete count, summed loadScore, weight still
 * in play (reuses calculateGrade so the "weight remaining" number matches what
 * the grade card shows), and the next deadline. Sorted heaviest-first so the
 * dashboard leads with the course that needs the most attention. Courses with
 * no incomplete work are omitted.
 */
export function perCourseLoad(
  tasks: WorkloadTask[],
  courses: CourseLike[],
): CourseLoad[] {
  const byCourse = new Map<string, WorkloadTask[]>();
  for (const t of tasks ?? []) {
    if (!t.course_id) continue;
    const list = byCourse.get(t.course_id) ?? [];
    list.push(t);
    byCourse.set(t.course_id, list);
  }

  const rows: CourseLoad[] = [];
  for (const course of courses ?? []) {
    const courseTasks = byCourse.get(course.id) ?? [];
    if (courseTasks.length === 0) continue;
    const incomplete = courseTasks.filter((t) => !t.is_completed);
    if (incomplete.length === 0) continue;

    const loadScore = incomplete.reduce((s, t) => s + taskLoadScore(t), 0);

    // Weight remaining via the shared grade engine: total weighted coursework
    // minus what's already been graded. calculateGrade tolerates missing
    // weights/scores and never divides by zero.
    const gradeTasks = courseTasks.map((t) => ({
      weight: t.weight,
      score: null as number | null, // score isn't on WorkloadTask; only weight math matters here
      is_extra_credit: !!t.is_extra_credit,
    }));
    // We only need weightTotal here (weightAttempted requires scores we don't
    // carry). weightTotal is the sum of all non-EC task weights — the grade
    // still "in play" for a workload view where nothing's been scored yet.
    const { weightTotal } = calculateGrade(gradeTasks, []);
    const weightRemaining = weightTotal > 0 ? weightTotal : null;

    // Next deadline: earliest incomplete due_date, tie-broken by title for
    // determinism.
    const sorted = [...incomplete].sort(
      (a, b) => a.due_date.localeCompare(b.due_date) || a.title.localeCompare(b.title),
    );
    const next = sorted[0] ?? null;

    rows.push({
      courseId: course.id,
      courseName: course.name,
      courseColor: course.color,
      remainingCount: incomplete.length,
      totalCount: courseTasks.length,
      loadScore,
      weightRemaining,
      nextDueDate: next?.due_date ?? null,
      nextDueTitle: next?.title ?? null,
    });
  }

  rows.sort((a, b) => b.loadScore - a.loadScore);
  return rows;
}

export interface ExamWeek {
  weekStart: string;
  weekLabel: string;
  exams: WorkloadTask[];
}

/**
 * Incomplete exams grouped by ISO week, for the exam-density strip. Only weeks
 * that actually contain an exam are returned, earliest first. Empty input → [].
 */
export function examDensity(tasks: WorkloadTask[]): ExamWeek[] {
  const exams = (tasks ?? []).filter(
    (t) => t.type === 'exam' && !t.is_completed && parseDueDate(t.due_date) != null,
  );
  if (exams.length === 0) return [];

  const byWeek = new Map<string, WorkloadTask[]>();
  for (const e of exams) {
    const monday = startOfISOWeek(parseDueDate(e.due_date)!);
    const key = format(monday, 'yyyy-MM-dd');
    const list = byWeek.get(key) ?? [];
    list.push(e);
    byWeek.set(key, list);
  }

  return [...byWeek.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, weekExams]) => ({
      weekStart,
      weekLabel: format(new Date(weekStart + 'T00:00:00'), 'MMM d'),
      exams: weekExams.sort((a, b) => a.due_date.localeCompare(b.due_date)),
    }));
}
