import { calculateGrade, DEFAULT_GRADE_SCALE } from '@/lib/constants';
import type {
  ExtraCreditPolicy, GpaScaleEntry, GradeCategory, GradeThreshold,
} from '@/types/database';

export const DEFAULT_GPA_SCALE: GpaScaleEntry[] = [
  { letter: 'A+', points: 4 }, { letter: 'A', points: 4 }, { letter: 'A-', points: 3.7 },
  { letter: 'B+', points: 3.3 }, { letter: 'B', points: 3 }, { letter: 'B-', points: 2.7 },
  { letter: 'C+', points: 2.3 }, { letter: 'C', points: 2 }, { letter: 'C-', points: 1.7 },
  { letter: 'D+', points: 1.3 }, { letter: 'D', points: 1 }, { letter: 'D-', points: 0.7 },
  { letter: 'F', points: 0 },
];

export interface GradeTask {
  id?: string;
  grade_category_id?: string | null;
  weight: number | null;
  score: number | null;
  points_earned?: number | null;
  points_possible?: number | null;
  is_extra_credit: boolean;
}

export interface CategoryGradeBreakdown {
  categoryId: string;
  name: string;
  weight: number;
  average: number | null;
  gradedCount: number;
  droppedTaskIds: string[];
}

export interface CourseGradeResult {
  percentage: number | null;
  letter: string | null;
  weightAttempted: number;
  weightTotal: number;
  earnedPoints: number;
  droppedTaskIds: string[];
  categoryBreakdown: CategoryGradeBreakdown[];
  usesCategories: boolean;
}

function round(value: number, digits = 2) {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

function letterFor(percentage: number | null, scale: GradeThreshold[]) {
  if (percentage == null) return null;
  const sorted = [...(scale.length ? scale : DEFAULT_GRADE_SCALE)]
    .sort((a, b) => b.min - a.min);
  return sorted.find((entry) => percentage >= entry.min)?.letter ?? 'F';
}

function taskPercent(task: GradeTask): number | null {
  if (task.score != null && Number.isFinite(task.score)) return task.score;
  if (
    task.points_earned != null && task.points_possible != null &&
    task.points_possible > 0
  ) {
    return (task.points_earned / task.points_possible) * 100;
  }
  return null;
}

function averageTasks(tasks: GradeTask[]): number | null {
  if (!tasks.length) return null;
  const allHavePoints = tasks.every(
    (task) => task.points_earned != null && task.points_possible != null && task.points_possible > 0,
  );
  if (allHavePoints) {
    const earned = tasks.reduce((sum, task) => sum + (task.points_earned ?? 0), 0);
    const possible = tasks.reduce((sum, task) => sum + (task.points_possible ?? 0), 0);
    return possible > 0 ? (earned / possible) * 100 : null;
  }
  const percentages = tasks.map(taskPercent).filter((score): score is number => score != null);
  return percentages.length
    ? percentages.reduce((sum, score) => sum + score, 0) / percentages.length
    : null;
}

/**
 * Category-aware course grade. Courses without categories keep the original
 * per-task weighted behavior, so adding V2 never changes an existing grade.
 */
export function calculateCourseGrade(
  tasks: GradeTask[],
  categories: Pick<GradeCategory, 'id' | 'name' | 'weight_percent' | 'drop_lowest_count' | 'position'>[] = [],
  scale: GradeThreshold[] = DEFAULT_GRADE_SCALE as unknown as GradeThreshold[],
  extraCreditPolicy: ExtraCreditPolicy = 'bonus',
): CourseGradeResult {
  if (!categories.length) {
    const legacy = calculateGrade(tasks, scale);
    return {
      ...legacy,
      droppedTaskIds: [],
      categoryBreakdown: [],
      usesCategories: false,
    };
  }

  const ordered = [...categories].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
  const breakdown: CategoryGradeBreakdown[] = [];
  const droppedTaskIds: string[] = [];
  let attemptedWeight = 0;
  let earnedPoints = 0;

  for (const category of ordered) {
    const categoryTasks = tasks.filter((task) => task.grade_category_id === category.id);
    const candidates = categoryTasks.filter((task) =>
      taskPercent(task) != null &&
      (extraCreditPolicy === 'category' || !task.is_extra_credit),
    );
    const sortedLowest = [...candidates].sort((a, b) =>
      (taskPercent(a) ?? 0) - (taskPercent(b) ?? 0),
    );
    const dropCount = Math.min(
      Math.max(0, category.drop_lowest_count),
      Math.max(0, sortedLowest.length - 1),
    );
    const dropped = sortedLowest.slice(0, dropCount);
    const droppedIds = dropped.map((task) => task.id).filter((id): id is string => !!id);
    const droppedSet = new Set(dropped);
    const counted = candidates.filter((task) => !droppedSet.has(task));
    const average = averageTasks(counted);

    if (average != null) {
      attemptedWeight += category.weight_percent;
      earnedPoints += category.weight_percent * average / 100;
    }
    droppedTaskIds.push(...droppedIds);
    breakdown.push({
      categoryId: category.id,
      name: category.name,
      weight: category.weight_percent,
      average: average == null ? null : round(average),
      gradedCount: counted.length,
      droppedTaskIds: droppedIds,
    });
  }

  if (attemptedWeight <= 0) {
    return {
      percentage: null,
      letter: null,
      weightAttempted: 0,
      weightTotal: round(ordered.reduce((sum, category) => sum + category.weight_percent, 0), 1),
      earnedPoints: 0,
      droppedTaskIds,
      categoryBreakdown: breakdown,
      usesCategories: true,
    };
  }

  if (extraCreditPolicy === 'bonus') {
    earnedPoints += tasks
      .filter((task) => task.is_extra_credit && taskPercent(task) != null && task.weight != null)
      .reduce((sum, task) => sum + (task.weight ?? 0) * (taskPercent(task) ?? 0) / 100, 0);
  }

  const percentage = Math.min(100, earnedPoints / attemptedWeight * 100);
  return {
    percentage: round(percentage),
    letter: letterFor(percentage, scale),
    weightAttempted: round(attemptedWeight, 1),
    weightTotal: round(ordered.reduce((sum, category) => sum + category.weight_percent, 0), 1),
    earnedPoints: round(earnedPoints),
    droppedTaskIds,
    categoryBreakdown: breakdown,
    usesCategories: true,
  };
}

export function gradePointForLetterWithScale(
  letter: string | null,
  scale: GpaScaleEntry[] = DEFAULT_GPA_SCALE,
): number | null {
  if (!letter) return null;
  const normalized = letter.trim().toUpperCase();
  const exact = scale.find((entry) => entry.letter.trim().toUpperCase() === normalized);
  if (exact) return exact.points;
  const leading = normalized.match(/^[A-F][+-]?/)?.[0];
  const fallback = leading
    ? scale.find((entry) => entry.letter.trim().toUpperCase() === leading)
    : null;
  return fallback?.points ?? null;
}

export function calculateSemesterGpaWithScale(
  courseGrades: { letter: string | null; creditHours: number | null | undefined }[],
  scale: GpaScaleEntry[] = DEFAULT_GPA_SCALE,
) {
  const reporting = courseGrades
    .map((course) => ({
      points: gradePointForLetterWithScale(course.letter, scale),
      credits: Math.max(0.5, course.creditHours ?? 3),
    }))
    .filter((course): course is { points: number; credits: number } => course.points != null);
  const credits = reporting.reduce((sum, course) => sum + course.credits, 0);
  const qualityPoints = reporting.reduce((sum, course) => sum + course.points * course.credits, 0);
  return {
    gpa: credits > 0 ? round(qualityPoints / credits) : null,
    reportingCourses: reporting.length,
    reportingCredits: round(credits, 1),
  };
}
