// The public marketing site. app.semoraai.com is the application only —
// anything that means "go back to the website" belongs here, not to
// app/welcome.tsx, which predates semoraai.com and duplicates it.
export const MARKETING_URL = 'https://semoraai.com';

// The one public support address. Only a fallback in the app — support goes
// through the form at MARKETING_URL/support, which stores the message before
// it tries to email it. This is what we show if that page cannot be opened.
export const SUPPORT_EMAIL = 'semora365@gmail.com';

// The App Store listing, and the same listing opened straight onto the review
// composer. `?action=write-review` is what turns a "Rate Semora" tap into a
// star picker instead of a product page the user then has to scroll.
//
// This is deliberately NOT StoreReview.requestReview(). That API is for
// unprompted moments — Apple rate-limits it to roughly three prompts a year and
// silently does nothing once you are over, which makes it the wrong thing
// behind a button someone deliberately pressed. It also has no web
// implementation at all, so on app.semoraai.com it could only ever apologise.
export const APP_STORE_URL = 'https://apps.apple.com/us/app/semora-ai-syllabus-scanner/id6762589321';
export const APP_STORE_REVIEW_URL = `${APP_STORE_URL}?action=write-review`;

// Android's equivalents. `showAllReviews=true` is Play's nearest thing to
// Apple's write-review composer — Play has no URL that opens the star picker
// directly, so this lands on the reviews sheet instead of the listing top.
// Keyed off the applicationId in app.json, not a numeric id like Apple's.
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.rajeshpanta.syllabussnap';
export const PLAY_STORE_REVIEW_URL = `${PLAY_STORE_URL}&showAllReviews=true`;

import { Platform } from 'react-native';

// Caps main content width so screens read well on iPad (portrait, full
// screen) instead of stretching edge-to-edge. Applied to each screen's
// scroll/content container via `width:'100%', maxWidth, alignSelf:'center'`.
export const SCREEN_MAX_WIDTH = 600;

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

// Typography. `display` is the Fraunces serif used for headlines (loaded in
// app/_layout.tsx); body text stays on the system font for legibility.
export const FONTS = {
  display: 'Fraunces_700Bold',
  displaySemibold: 'Fraunces_600SemiBold',
  displayItalic: 'Fraunces_400Regular_Italic',
} as const;

// Soft elevation for card surfaces — desktop web only. Native keeps its flat
// hairline-border look (shadowColor/elevation weren't tuned for these card
// shapes there); spread into a card's style object, e.g.
// `{ ...cardStyle, ...WEB_CARD_SHADOW }`. Skip it on any element that also
// sets `overflow: 'hidden'` — that clips a same-node box-shadow to nothing.
export const WEB_CARD_SHADOW = Platform.select({
  web: { boxShadow: '0 1px 2px rgba(17,17,17,0.03), 0 10px 28px rgba(17,17,17,0.05)' },
  default: {},
}) as object;

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
  const allGraded = tasks.filter((t) => t.score != null);
  const sorted = [...(scale?.length ? scale : DEFAULT_GRADE_SCALE)].sort((a, b) => b.min - a.min);

  // Total weight across ALL tasks (graded + ungraded)
  const weightTotal = allWithWeight
    .filter((t) => !t.is_extra_credit)
    .reduce((sum, t) => sum + t.weight!, 0);

  if (graded.length === 0) {
    // Many instructors do not publish category weights. In that case, keep
    // grade and GPA tracking useful with a straight average of posted grades.
    if (allGraded.length > 0) {
      const rawPercentage = allGraded.reduce((sum, task) => sum + task.score!, 0) / allGraded.length;
      const percentage = Math.min(rawPercentage, 100);
      const letter = sorted.find((grade) => percentage >= grade.min)?.letter ?? 'F';
      return {
        percentage: Math.round(percentage * 100) / 100,
        letter,
        weightAttempted: 0,
        weightTotal,
        earnedPoints: 0,
      };
    }
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

const LETTER_GRADE_POINTS: Record<string, number> = {
  'A+': 4,
  A: 4,
  'A-': 3.7,
  'B+': 3.3,
  B: 3,
  'B-': 2.7,
  'C+': 2.3,
  C: 2,
  'C-': 1.7,
  'D+': 1.3,
  D: 1,
  'D-': 0.7,
  F: 0,
};

export function gradePointForLetter(letter: string | null): number | null {
  if (!letter) return null;
  const normalized = letter.trim().toUpperCase();
  if (normalized in LETTER_GRADE_POINTS) return LETTER_GRADE_POINTS[normalized];
  // Custom labels such as "A (Excellent)" still map by their leading grade.
  const leading = normalized.match(/^[A-F][+-]?/)?.[0];
  return leading && leading in LETTER_GRADE_POINTS ? LETTER_GRADE_POINTS[leading] : null;
}

export function calculateSemesterGpa(
  courseGrades: { letter: string | null; creditHours: number | null | undefined }[],
) {
  const reporting = courseGrades
    .map((course) => ({
      points: gradePointForLetter(course.letter),
      credits: Math.max(0.5, course.creditHours ?? 3),
    }))
    .filter((course): course is { points: number; credits: number } => course.points != null);
  const credits = reporting.reduce((sum, course) => sum + course.credits, 0);
  const qualityPoints = reporting.reduce((sum, course) => sum + course.points * course.credits, 0);
  return {
    gpa: credits > 0 ? Math.round((qualityPoints / credits) * 100) / 100 : null,
    reportingCourses: reporting.length,
    reportingCredits: Math.round(credits * 10) / 10,
  };
}

/**
 * Background for the "premium dark card" surfaces — the paywall hero, the Me
 * tab's Pro card, the invite hero, the flashcard AI button.
 *
 * Deliberately NOT the theme's `colors.ink`. Those cards paint their text with
 * a hardcoded white, which only works over a dark background; in dark mode
 * `colors.ink` resolves to a near-white (#E8E6E3), and the card rendered white
 * text on a near-white field. Pinning the surface keeps light mode byte-identical
 * and makes the card stay dark in both themes, which is what the design intends.
 */
export const PROMO_SURFACE = COLORS.ink;
