/**
 * Does this Canvas course look like a class the student already has?
 *
 * Connecting Canvas creates a brand-new course for every selection, with no
 * look at what is already there. That is safe — nothing is overwritten — but it
 * is not harmless: five of the six students who had manual courses before
 * connecting ended up with the same class twice. One of them now has "PHYS 212
 * - PHYS 212" holding 55 tasks beside "Section Merge: Elect. and
 * Mag.(202627FA)-UP-PHYS212" holding 66, with nothing on either to say they are
 * the same class.
 *
 * This module only ever PROPOSES. It never merges, and the caller must put the
 * decision in front of the student, because there is no deterministic identity
 * to lean on: a Canvas calendar feed gives a numeric course id that no
 * hand-typed course could ever share, and a free-text name. `code` is not a
 * separate signal — canvas-calendar.ts sets name and code to the same string,
 * whatever Canvas wrote inside the trailing [brackets] of the ICS SUMMARY.
 *
 * So the only real evidence is a course code appearing in both names, and the
 * bar is set where a false positive is worse than a miss. Offering to link two
 * unrelated classes invites a student to merge work that does not belong
 * together; failing to notice a match just leaves today's behaviour.
 *
 * No dependencies — same reason as lib/canvasPromo.ts. The rule that decides
 * whether to suggest touching a student's existing coursework should be
 * provable by a test.
 */

/**
 * Tokens that look like a course code but are a term, campus or section.
 *
 * Drawn from real production feed names: FA26-BL-BUS-X180-12244,
 * LA-POLS-3550-001-59331-202636, JOURN-1300W-08-60456-2026FS, NRS-250-001-2027-010.
 * Without this, "FA26" is indistinguishable from "CS 26" to a pattern matcher.
 */
const TERM_PREFIXES = new Set([
  'FA', 'SP', 'SU', 'WI', 'FALL', 'SPR', 'SPRING', 'SUMMER', 'WINTER',
  'SEM', 'TERM', 'SESS', 'YR', 'AY', 'QTR',
]);

/**
 * A four-digit number in this range is a calendar year, not a course number.
 *
 * Real feeds carry 2026, 2027, 202609 and 202636. A genuine four-digit course
 * number (MATH 2210, NURS 3014) is common, so the range is deliberately narrow:
 * only 1900-2099 is rejected, which costs nothing — no institution numbers a
 * course 2026 and also expects it matched by name in 2026.
 */
function looksLikeYear(digits: string): boolean {
  if (digits.length !== 4) return false;
  const value = Number(digits);
  return value >= 1900 && value <= 2099;
}

/**
 * Every plausible "SUBJECT NUMBER" code in a course name, normalised.
 *
 * Handles the shapes production actually contains:
 *
 *   "AMST 201 - Introduction to American Studies"  -> AMST201
 *   "Fall 2026 AMST 201-16 16581"                  -> AMST201
 *   "BUS-X 170 - How Business Works"               -> BUSX170
 *   "FA26-BL-BUS-X180-12244"                       -> BUSX180
 *   "Section Merge: Elect. and Mag.(202627FA)-UP-PHYS212" -> PHYS212
 *   "JOURN-1300W-08-60456-2026FS-FUND OF WRITTEN JOURN-WI" -> JOURN1300W
 *   "Freshman Seminar"                             -> (none)
 *
 * The Indiana-style single-letter prefix (BUS-X180, K201) is why the subject
 * part allows an optional leading letter on the number rather than requiring
 * the subject to carry it: "BUS X180" and "K201" are both real, and both must
 * survive.
 */
export function courseCodeTokens(name: string): string[] {
  if (typeof name !== 'string' || !name.trim()) return [];
  const upper = name.toUpperCase();
  const found = new Set<string>();

  // SUBJECT, optional separators, optional single letter, 2-4 digits, optional
  // trailing letter. Anchored on a non-alphanumeric boundary so a code is never
  // pulled out of the middle of a longer word.
  // The letter prefix may be separated from its digits as well as from its
  // subject: production carries both "FA26-BL-BUS-X180-12244" (no gap) and
  // "BUS-X 170 - How Business Works" (a space). Before this allowed a gap the
  // two halves of that exact pair produced BUSX170 and X170 and never matched
  // each other — a silent miss on a real duplicate.
  const pattern = /(^|[^A-Z0-9])([A-Z]{1,8})[\s\-:._]{0,2}(?:([A-Z])[\s\-:._]{0,2})?(\d{2,4})([A-Z]?)(?![0-9])/g;
  for (const match of upper.matchAll(pattern)) {
    const subject = match[2];
    const letterPrefix = match[3] ?? '';
    const digits = match[4];
    const suffix = match[5];

    if (TERM_PREFIXES.has(subject)) continue;
    if (looksLikeYear(digits)) continue;
    // A bare one-letter subject with no letter prefix ("A101") is too weak to
    // hang a merge suggestion on; the Indiana form always has the letter on the
    // number side (K201 parses as subject K, which we keep, but only because it
    // is followed by three digits and nothing else claims it).
    if (subject.length === 1 && letterPrefix) continue;

    found.add(`${subject}${letterPrefix}${digits}${suffix}`);
  }
  return [...found];
}

export interface CourseCandidate {
  id: string;
  name: string;
}

/**
 * Existing courses that plausibly represent the same class as `canvasName`.
 *
 * Match rule: the two names share at least one identical normalised course
 * code. Nothing softer — no fuzzy string distance, no title-word overlap, no
 * instructor comparison. Titles collide constantly across a real catalogue
 * ("Introduction to...", "Seminar", "Freshman Seminar") and a wrong suggestion
 * here is an invitation to merge two different classes.
 *
 * A course whose name yields no code at all can never match, which is the
 * correct outcome for "Freshman Seminar" and "Adult Education Math": we have no
 * evidence, so we make no claim.
 */
export function matchExistingCourses(
  canvasName: string,
  candidates: readonly CourseCandidate[],
): CourseCandidate[] {
  const canvasCodes = new Set(courseCodeTokens(canvasName));
  if (canvasCodes.size === 0) return [];
  return candidates.filter((candidate) =>
    courseCodeTokens(candidate.name).some((code) => canvasCodes.has(code)),
  );
}

export type CourseMatchOutcome =
  /** Nothing plausible. Create a Canvas-backed course, exactly as today. */
  | { kind: 'none' }
  /** Exactly one plausible course. Confirm before linking. */
  | { kind: 'single'; candidate: CourseCandidate }
  /** Several. The student picks, or keeps Canvas separate. */
  | { kind: 'ambiguous'; candidates: CourseCandidate[] };

/**
 * Classify a Canvas course against what the student already has.
 *
 * There is deliberately no 'automatic' outcome. The brief allowed one for an
 * "exceptionally strong deterministic identity match", and none exists here: a
 * calendar feed's course id is a Canvas-internal number, and a course a student
 * typed by hand has no field that could ever equal it. Every link therefore
 * goes through the student.
 */
export function classifyCourseMatch(
  canvasName: string,
  candidates: readonly CourseCandidate[],
): CourseMatchOutcome {
  const matches = matchExistingCourses(canvasName, candidates);
  if (matches.length === 0) return { kind: 'none' };
  if (matches.length === 1) return { kind: 'single', candidate: matches[0] };
  return { kind: 'ambiguous', candidates: matches };
}
