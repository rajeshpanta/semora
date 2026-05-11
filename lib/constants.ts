export const TASK_TYPES = [
  'assignment',
  'quiz',
  'exam',
  'project',
  'reading',
  'other',
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  assignment: 'Assignment',
  quiz: 'Quiz',
  exam: 'Exam',
  project: 'Project',
  reading: 'Reading',
  other: 'Other',
};

export const SOURCE_TYPES = ['manual', 'rule_parsed', 'gemini_parsed'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const COURSE_COLORS = [
  '#6366f1', // indigo
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#8b5cf6', // violet
  '#14b8a6', // teal
  '#f97316', // orange
  '#06b6d4', // cyan
];

export const COURSE_ICONS = [
  'book',
  'flask',
  'calculator',
  'pencil',
  'music',
  'paint-brush',
  'code',
  'globe',
  'heartbeat',
  'balance-scale',
] as const;

export type CourseIcon = (typeof COURSE_ICONS)[number];

// ── Design System Colors ────────────────────────────────────
export const COLORS = {
  brand: '#6B46C1',
  brand50: '#EEEDFE',
  brand100: '#CECBF6',
  paper: '#FAF9F5',
  card: '#FFFFFF',
  ink: '#1C1B1F',
  ink2: '#55555C',
  ink3: '#8C8B94',
  line: 'rgba(28,27,31,0.08)',
  coral: '#D85A30',
  coral50: '#FAECE7',
  teal: '#0F6E56',
  teal50: '#E1F5EE',
  blue: '#185FA5',
  blue50: '#E6F1FB',
  amber: '#BA7517',
  amber50: '#FAEEDA',
} as const;

export const DEFAULT_GRADE_SCALE = [
  { letter: 'A', min: 90 },
  { letter: 'B', min: 80 },
  { letter: 'C', min: 70 },
  { letter: 'D', min: 60 },
  { letter: 'F', min: 0 },
] as const;

export function calculateGrade(
  tasks: { weight: number | null; score: number | null; is_extra_credit: boolean }[],
  scale: { letter: string; min: number }[],
) {
  const allWithWeight = tasks.filter((t) => t.weight != null);
  const graded = allWithWeight.filter((t) => t.score != null);

  // Total weight across ALL tasks (graded + ungraded)
  const weightTotal = allWithWeight
    .filter((t) => !t.is_extra_credit)
    .reduce((sum, t) => sum + t.weight!, 0);

  if (graded.length === 0) {
    return { percentage: null, letter: null, weightAttempted: 0, weightTotal, earnedPoints: 0 };
  }

  // Weight attempted = only graded tasks (what's been scored so far)
  const weightAttempted = graded
    .filter((t) => !t.is_extra_credit)
    .reduce((sum, t) => sum + t.weight!, 0);

  // Weighted sum of scores
  let weightedSum = 0;
  for (const t of graded) {
    weightedSum += (t.weight! * t.score!);
  }

  if (weightAttempted === 0) {
    return { percentage: null, letter: null, weightAttempted: 0, weightTotal, earnedPoints: 0 };
  }

  // Current grade = base weighted average + extra-credit bonus.
  // EC weights contribute to weightedSum but not weightAttempted, so they
  // act as bonus points that inflate the numerator without growing the
  // denominator. Display is clamped to 100% — every letter scale tops
  // out at A+, so a raw 108% adds no useful signal beyond "maxed out".
  //
  // Example: midterm 30%/80 + homework 20%/100 + EC 5%/100
  //   weightedSum     = 30*80 + 20*100 + 5*100 = 4900
  //   weightAttempted = 30 + 20 = 50   (EC excluded)
  //   raw %           = 4900 / 50 = 98%   (= 88% base + 10% EC bonus)
  const rawPercentage = weightedSum / weightAttempted;
  const percentage = Math.min(rawPercentage, 100);
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  const letter = sorted.find((g) => percentage >= g.min)?.letter ?? 'F';

  // Earned points toward final grade = sum(weight * score / 100)
  const earnedPoints = graded.reduce((sum, t) => sum + (t.weight! * t.score! / 100), 0);

  return {
    percentage: Math.round(percentage * 100) / 100,
    letter,
    weightAttempted: Math.round(weightAttempted * 10) / 10,
    weightTotal: Math.round(weightTotal * 10) / 10,
    earnedPoints: Math.round(earnedPoints * 100) / 100,
  };
}
