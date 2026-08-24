import { parseTermName, termForDate, termWindow, type Term } from './semesters';

/**
 * Which semester does a set of imported coursework belong to?
 *
 * This module exists because Semora used to answer that question with
 * `selectedSemesterId` — whatever the student happened to be looking at when
 * they connected Canvas. That is not evidence about the coursework, and it
 * filed a Fall term into a Summer semester for a real user.
 *
 * The answer here comes from the work itself: the term Canvas named, or the
 * dates the deadlines actually fall on. It is deliberately willing to say "I
 * do not know" — `confidence: 'none'` means the UI must ask rather than pick,
 * because a confident wrong answer is the failure mode being fixed.
 *
 * Two callers, one brain, on purpose:
 *   - the Canvas connect screen, matching freshly discovered courses
 *   - the new-term prompt, matching courses a later sync discovered
 * A new semester arriving mid-year is the same question asked later, so it
 * must not get a second implementation that can disagree with the first.
 *
 * Imports are relative and this file pulls in nothing but `./semesters`
 * (itself dependency-free), so the whole thing runs under `deno test` —
 * see lib/termMatch.test.ts. Matching rules are exactly the kind of logic
 * that needs tests and the app has no other test runner.
 */

/** What we know about one course from an LMS, however we learned it. */
export interface CourseFacts {
  id: string;
  name: string;
  code?: string;
  /** How many dated items the provider listed. Absent for providers that do
   *  not return assignments during discovery (Blackboard, Moodle, Classroom). */
  itemCount?: number | null;
  /** 'YYYY-MM-DD' of the earliest and latest dated item. */
  firstDue?: string | null;
  lastDue?: string | null;
  /** Canvas's OWN term, available on token/API connections. Authoritative:
   *  when the school says "Fall 2026", no inference can beat it. */
  termName?: string | null;
  termStart?: string | null;
  termEnd?: string | null;
}

export interface DateSpan {
  first: string;
  last: string;
}

/** The subset of a semester row this module needs. */
export interface SemesterLike {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

export type MatchConfidence = 'strong' | 'weak' | 'none';

export interface SemesterMatch {
  semesterId: string | null;
  confidence: MatchConfidence;
  /** 0–1, how much of the coursework falls inside the matched window. */
  coverage: number;
}

/** A window has to hold this much of the coursework before Semora will
 *  pre-select it. Below this the UI shows the suggestion but selects nothing —
 *  a coin-flip default is what caused the original mis-filing. */
const STRONG_COVERAGE = 0.8;

const DAY = 86_400_000;

function toTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  // Date-only strings are parsed as UTC midnight by Date, which is what we
  // want: every comparison here is between date-only values, so as long as
  // they are all read the same way the arithmetic is timezone-free.
  const time = Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(time) ? null : time;
}

function toIso(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** Earliest and latest dated item across these courses, or null if none are dated. */
export function spanOf(courses: CourseFacts[]): DateSpan | null {
  let first: number | null = null;
  let last: number | null = null;
  for (const course of courses) {
    const start = toTime(course.firstDue);
    const end = toTime(course.lastDue) ?? start;
    if (start !== null) first = first === null ? start : Math.min(first, start);
    if (end !== null) last = last === null ? end : Math.max(last, end);
  }
  if (first === null || last === null) return null;
  return { first: toIso(first), last: toIso(Math.max(first, last)) };
}

/** Total dated items across these courses, or null when no provider gave counts. */
export function itemCountOf(courses: CourseFacts[]): number | null {
  let total: number | null = null;
  for (const course of courses) {
    if (typeof course.itemCount === 'number') total = (total ?? 0) + course.itemCount;
  }
  return total;
}

/**
 * The date window a semester occupies.
 *
 * Real dates when the student entered them. Otherwise inferred from the name,
 * because `start_date` and `end_date` are optional on the create form and a
 * great many semesters have neither — refusing to match those would mean
 * refusing to match most accounts. Returns null when the name carries no
 * recognisable term either, which is the honest answer for "Term 3".
 */
export function semesterWindow(semester: SemesterLike): DateSpan | null {
  const start = semester.start_date;
  const end = semester.end_date;
  if (start && end) return { first: start.slice(0, 10), last: end.slice(0, 10) };
  const parsed = parseTermName(semester.name);
  if (!parsed) {
    // One date but not the other: better than nothing, but only if we can
    // bound the other end. A start with no end would otherwise match forever.
    return null;
  }
  const window = termWindow(parsed.term, parsed.year);
  return {
    first: (start ?? window.start).slice(0, 10),
    last: (end ?? window.end).slice(0, 10),
  };
}

/** Fraction of `span` that lies inside `window`. 0 when they do not touch. */
function coverageOf(span: DateSpan, window: DateSpan): number {
  const spanStart = toTime(span.first);
  const spanEnd = toTime(span.last);
  const windowStart = toTime(window.first);
  const windowEnd = toTime(window.last);
  if (spanStart === null || spanEnd === null || windowStart === null || windowEnd === null) return 0;
  const overlap = Math.min(spanEnd, windowEnd) - Math.max(spanStart, windowStart);
  if (overlap < 0) return 0;
  const length = spanEnd - spanStart;
  // A single-day span either sits inside the window or it does not; there is
  // no ratio to take, and dividing by zero would say "no match" for a course
  // with one deadline.
  if (length <= 0) return overlap >= 0 ? 1 : 0;
  return Math.min(1, (overlap + DAY) / (length + DAY));
}

/** The term Canvas itself reported for these courses, if any of them carry one. */
function reportedTerm(courses: CourseFacts[]): { name: string; span: DateSpan | null } | null {
  const named = courses.find((course) => course.termName);
  if (!named?.termName) return null;
  const start = named.termStart ?? null;
  const end = named.termEnd ?? null;
  return {
    name: named.termName,
    span: start && end ? { first: start.slice(0, 10), last: end.slice(0, 10) } : null,
  };
}

function sameTerm(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = parseTermName(a);
  const right = parseTermName(b);
  if (!left || !right) return false;
  return left.term === right.term && left.year === right.year;
}

/**
 * Pick the semester these courses belong in.
 *
 * Order of authority:
 *   1. Canvas's own term name matching a semester's name. The school said it;
 *      nothing inferred from dates can beat that.
 *   2. Date coverage — how much of the coursework the semester's window holds.
 *
 * `confidence: 'strong'` is the only result a caller should pre-select on.
 */
export function matchSemester(courses: CourseFacts[], semesters: SemesterLike[]): SemesterMatch {
  const none: SemesterMatch = { semesterId: null, confidence: 'none', coverage: 0 };
  if (!semesters.length) return none;

  const reported = reportedTerm(courses);
  if (reported) {
    const byName = semesters.find((semester) => sameTerm(semester.name, reported.name));
    if (byName) return { semesterId: byName.id, confidence: 'strong', coverage: 1 };
  }

  const span = reported?.span ?? spanOf(courses);
  if (!span) return none;

  let best: SemesterMatch = none;
  for (const semester of semesters) {
    const window = semesterWindow(semester);
    if (!window) continue;
    const coverage = coverageOf(span, window);
    if (coverage > best.coverage) {
      best = {
        semesterId: semester.id,
        coverage,
        confidence: coverage >= STRONG_COVERAGE ? 'strong' : 'weak',
      };
    }
  }
  return best.coverage > 0 ? best : none;
}

/**
 * Does importing into this semester contradict the coursework?
 *
 * True only when we KNOW both windows and they do not touch at all — Fall work
 * into a Summer semester. Uncertainty never raises this: a warning shown on a
 * guess trains people to click through warnings.
 */
export function conflictsWith(courses: CourseFacts[], semester: SemesterLike): boolean {
  const window = semesterWindow(semester);
  if (!window) return false;
  const reported = reportedTerm(courses);
  if (reported && sameTerm(semester.name, reported.name)) return false;
  const span = reported?.span ?? spanOf(courses);
  if (!span) return false;
  return coverageOf(span, window) === 0;
}

/** Which of these courses fall outside the chosen semester's window. */
export function coursesOutside(courses: CourseFacts[], semester: SemesterLike): Set<string> {
  const window = semesterWindow(semester);
  const outside = new Set<string>();
  if (!window) return outside;
  for (const course of courses) {
    const span = spanOf([course]);
    if (!span) continue;
    if (coverageOf(span, window) === 0) outside.add(course.id);
  }
  return outside;
}

export interface SemesterSuggestion {
  name: string;
  startDate: string;
  endDate: string;
}

/**
 * The semester to offer creating when nothing existing fits.
 *
 * Named from Canvas's term when it gave one, otherwise from the term the first
 * deadline falls in. The dates are the term's usual boundaries WIDENED to
 * cover the actual coursework — a preset that ended before the last exam would
 * make the new semester conflict with the very work it was created to hold.
 */
export function suggestNewSemester(
  courses: CourseFacts[],
  now: Date = new Date(),
): SemesterSuggestion | null {
  const reported = reportedTerm(courses);
  const span = spanOf(courses);
  let term: Term;
  let year: number;

  const parsed = parseTermName(reported?.name);
  if (parsed) {
    term = parsed.term;
    year = parsed.year;
  } else if (span) {
    // The MIDPOINT of the coursework, not its first deadline.
    //
    // termForDate puts the winter break with the previous Fall — correct for
    // "what term is it today", wrong here: a Spring course whose first item is
    // due Jan 5 would be named "Fall 2026" off its opening date alone. A
    // term's identity is where the bulk of its work sits, and the midpoint of
    // Jan 5 – May 30 lands in March, which is unambiguously Spring.
    const first = Date.parse(`${span.first}T12:00:00Z`);
    const last = Date.parse(`${span.last}T12:00:00Z`);
    const at = termForDate(new Date(first + (last - first) / 2));
    term = at.term;
    year = at.year;
  } else {
    const at = termForDate(now);
    term = at.term;
    year = at.year;
  }

  const preset = termWindow(term, year);
  const known = reported?.span ?? span;
  const startCandidates = [preset.start, known?.first].filter(Boolean) as string[];
  const endCandidates = [preset.end, known?.last].filter(Boolean) as string[];
  return {
    name: `${term} ${year}`,
    startDate: startCandidates.sort()[0]!,
    endDate: endCandidates.sort()[endCandidates.length - 1]!,
  };
}

/** "Sep 2 – Dec 12" / "2 sep – 12 dic". The proof line the UI shows. */
export function formatSpan(span: DateSpan | null, locale: 'en' | 'es' = 'en'): string {
  if (!span) return '';
  const tag = locale === 'es' ? 'es-US' : 'en-US';
  const format = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(tag, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  const first = format(span.first);
  const last = format(span.last);
  return first === last ? first : `${first} – ${last}`;
}
