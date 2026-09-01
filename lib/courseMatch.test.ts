/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --allow-read --config lib/deno.test.json lib/courseMatch.test.ts
 *
 * Every course name below is REAL — taken from the 500 courses in production on
 * 2026-09-01. That matters more than the count of assertions: this rule decides
 * whether to suggest that a student merge two pieces of their own coursework,
 * and a fixture invented to make the matcher look good would prove nothing.
 *
 * The suite is weighted toward false positives, because a wrong suggestion
 * invites a student to combine two different classes, while a missed one just
 * leaves the behaviour that shipped before this existed.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classifyCourseMatch,
  courseCodeTokens,
  matchExistingCourses,
  type CourseCandidate,
} from './courseMatch';

const c = (id: string, name: string): CourseCandidate => ({ id, name });

// ── The nine true positives found in production ─────────────────────────────

Deno.test('the real duplicates in production are all detected', () => {
  const pairs: [string, string][] = [
    ['Section Merge: Elect. and Mag.(202627FA)-UP-PHYS212', 'PHYS 212 - PHYS 212'],
    ['FA26-BL-BUS-X180-12244', 'BUS X180 - JLLC Community Development'],
    ['FA26-BL-BUS-X170-8436', 'BUS-X 170 - How Business Works'],
    ['CE133-01-74922-2267', 'CE 133 - Design of Steel Structures'],
    ['CE180A-01-74866-2267', 'CE 180A - Project Design'],
    ['BIO-103 - 30708', 'BIO 103-01 - BIO 103 - General Biology'],
    ['Fall 2026 ASTR 101-09 21873', 'ASTR 101-09 #21873 - ASTR 101 - Introduction to As'],
    ['Fall 2026 AMST 201-16 16581', 'AMST 201 - Introduction to American Studies'],
    ['PSYCH 100, Section 001: Intro Psychology (22681--UP---P-PSYCH---100-------001-)',
     'PSYCH 100 - Intro Psychology'],
  ];
  for (const [canvas, manual] of pairs) {
    const outcome = classifyCourseMatch(canvas, [c('x', manual)]);
    assertEquals(outcome.kind, 'single', `missed: ${canvas} <-> ${manual}`);
  }
});

// ── False positives: the expensive mistake ──────────────────────────────────

Deno.test('a term code is never mistaken for a course code', () => {
  // FA26 / 2026FS / 202636 / 2027 all appear in real feed names.
  assertEquals(courseCodeTokens('FA26-BL-BUS-X180-12244').includes('FA26'), false);
  assertEquals(courseCodeTokens('Fall 2026 AMST 201-16 16581').includes('FALL2026'), false);
  assertEquals(courseCodeTokens('NRS-250-001-2027-010'), ['NRS250']);
  assertEquals(courseCodeTokens('LA-POLS-3550-001-59331-202636'), ['POLS3550']);
});

Deno.test('a name with no course code matches nothing', () => {
  for (const name of ['Freshman Seminar', 'Adult Education Math', 'Unknown Course', '2026/27 JLLC PDS']) {
    assertEquals(courseCodeTokens(name), [], name);
    assertEquals(classifyCourseMatch(name, [c('a', 'PHYS 212 - PHYS 212')]).kind, 'none', name);
  }
});

Deno.test('an existing course with no code is never proposed', () => {
  // The Canvas side has a perfectly good code; the local side has none, so
  // there is no evidence and no suggestion.
  const outcome = classifyCourseMatch('FA26-BL-BUS-X180-12244', [c('a', 'Freshman Seminar')]);
  assertEquals(outcome.kind, 'none');
});

Deno.test('adjacent course numbers do not match each other', () => {
  // The pair most likely to be confused: same subject, neighbouring number,
  // and both really exist for the same student.
  assertEquals(classifyCourseMatch('FA26-BL-BUS-X170-8436',
    [c('a', 'BUS X180 - JLLC Community Development')]).kind, 'none');
  assertEquals(classifyCourseMatch('CE133-01-74922-2267',
    [c('a', 'CE 180A - Project Design')]).kind, 'none');
});

Deno.test('a longer number is not matched by a shorter one', () => {
  assertEquals(classifyCourseMatch('MATH 1100 Calculus', [c('a', 'MATH 110 - Algebra')]).kind, 'none');
  assertEquals(classifyCourseMatch('MATH 110 - Algebra', [c('a', 'MATH 1100 Calculus')]).kind, 'none');
});

Deno.test('a letter suffix is part of the identity', () => {
  assertEquals(classifyCourseMatch('CE180A-01-74866-2267', [c('a', 'CE 180 - Other')]).kind, 'none');
  assertEquals(classifyCourseMatch('CE180A-01-74866-2267', [c('a', 'CE 180A - Project Design')]).kind, 'single');
});

Deno.test('different subjects never match on the number alone', () => {
  assertEquals(classifyCourseMatch('Fall 2026 AMST 201-16 16581',
    [c('a', 'SOC 201 - Something Else')]).kind, 'none');
});

// ── Decision flow ───────────────────────────────────────────────────────────

Deno.test('no candidates -> none (import behaves exactly as before)', () => {
  assertEquals(classifyCourseMatch('FA26-BL-BUS-X180-12244', []).kind, 'none');
});

Deno.test('one candidate -> single, and it is the right one', () => {
  const outcome = classifyCourseMatch('Fall 2026 AMST 201-16 16581', [
    c('other', 'Freshman Seminar'),
    c('amst', 'AMST 201 - Introduction to American Studies'),
  ]);
  assertEquals(outcome.kind, 'single');
  if (outcome.kind === 'single') assertEquals(outcome.candidate.id, 'amst');
});

Deno.test('several candidates -> ambiguous, and the student chooses', () => {
  // A real shape: a student who typed the class twice, or kept a lecture and a
  // lab under the same code.
  const outcome = classifyCourseMatch('Fall 2026 AMST 201-16 16581', [
    c('one', 'AMST 201 - Introduction to American Studies'),
    c('two', 'AMST 201 lecture notes'),
  ]);
  assertEquals(outcome.kind, 'ambiguous');
  if (outcome.kind === 'ambiguous') assertEquals(outcome.candidates.length, 2);
});

Deno.test('there is no automatic-merge outcome at all', () => {
  // The type has three arms and none of them means "linked without asking".
  const kinds = new Set<string>();
  for (const candidates of [[], [c('a', 'PHYS 212')], [c('a', 'PHYS 212'), c('b', 'PHYS 212 lab')]]) {
    kinds.add(classifyCourseMatch('Section Merge: Elect. and Mag.(202627FA)-UP-PHYS212', candidates).kind);
  }
  assertEquals([...kinds].sort(), ['ambiguous', 'none', 'single']);
});

// ── Robustness ──────────────────────────────────────────────────────────────

Deno.test('empty and malformed names are safe', () => {
  for (const bad of ['', '   ', '---', '2026', '12345']) {
    assertEquals(courseCodeTokens(bad), [], JSON.stringify(bad));
  }
  assertEquals(courseCodeTokens(null as any), []);
  assertEquals(courseCodeTokens(undefined as any), []);
});

Deno.test('matching is case and separator insensitive', () => {
  assert(matchExistingCourses('fa26-bl-bus-x180-12244', [c('a', 'BUS X180')]).length === 1);
  assert(matchExistingCourses('BUS_X180', [c('a', 'bus-x180')]).length === 1);
});

Deno.test('a code buried mid-word is not extracted', () => {
  // "SUBPHYS212" must not yield PHYS212 — the boundary guard is what stops a
  // suggestion being built out of a coincidence inside a longer token.
  assertEquals(courseCodeTokens('SUBPHYS212').includes('PHYS212'), false);
});
