/**
 * Run with:  ~/.deno/bin/deno test --no-lock lib/termMatch.test.ts
 *
 * termMatch has no React Native or Supabase imports precisely so it can be
 * tested this way — the app has no other test runner, and semester matching is
 * the last logic in this codebase that should go untested. Every case below is
 * a situation that actually reached production or is one step away from it.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  conflictsWith,
  coursesOutside,
  formatSpan,
  matchSemester,
  semesterWindow,
  spanOf,
  suggestNewSemester,
  type CourseFacts,
  type SemesterLike,
} from './termMatch.ts';

const fall2026: CourseFacts[] = [
  { id: '1', name: 'CSC-413', itemCount: 22, firstDue: '2026-09-02', lastDue: '2026-12-11' },
  { id: '2', name: 'MTH-201', itemCount: 18, firstDue: '2026-09-08', lastDue: '2026-12-12' },
];

const summerSemester: SemesterLike = {
  id: 'sum', name: 'Summer 2026', start_date: '2026-05-16', end_date: '2026-08-14',
};
const fallSemester: SemesterLike = {
  id: 'fal', name: 'Fall 2026', start_date: '2026-08-24', end_date: '2026-12-18',
};
/** The common real-world row: a name and nothing else. */
const fallNoDates: SemesterLike = {
  id: 'fal2', name: 'Fall 2026', start_date: null, end_date: null,
};

Deno.test('spanOf takes the outer bounds across courses', () => {
  assertEquals(spanOf(fall2026), { first: '2026-09-02', last: '2026-12-12' });
});

Deno.test('spanOf returns null when nothing is dated', () => {
  assertEquals(spanOf([{ id: '1', name: 'X' }]), null);
});

Deno.test('the reported bug: Fall work does not match a Summer semester', () => {
  const match = matchSemester(fall2026, [summerSemester]);
  assertEquals(match.semesterId, null);
  assertEquals(match.confidence, 'none');
  assertEquals(conflictsWith(fall2026, summerSemester), true);
});

Deno.test('Fall work matches the Fall semester strongly', () => {
  const match = matchSemester(fall2026, [summerSemester, fallSemester]);
  assertEquals(match.semesterId, 'fal');
  assertEquals(match.confidence, 'strong');
  assertEquals(conflictsWith(fall2026, fallSemester), false);
});

Deno.test('a semester with no dates is matched from its name', () => {
  assertEquals(semesterWindow(fallNoDates), { first: '2026-08-15', last: '2026-12-18' });
  const match = matchSemester(fall2026, [summerSemester, fallNoDates]);
  assertEquals(match.semesterId, 'fal2');
  assertEquals(match.confidence, 'strong');
});

Deno.test('an unrecognisable semester name yields no window and no match', () => {
  const odd: SemesterLike = { id: 'odd', name: 'Term 3', start_date: null, end_date: null };
  assertEquals(semesterWindow(odd), null);
  assertEquals(matchSemester(fall2026, [odd]).confidence, 'none');
  // And it must never be reported as a conflict — we know nothing about it.
  assertEquals(conflictsWith(fall2026, odd), false);
});

Deno.test("Canvas's own term name beats date inference", () => {
  // Dates that would otherwise read as Spring, but Canvas says Fall 2026.
  const reported: CourseFacts[] = [{
    id: '1', name: 'CSC-413',
    firstDue: '2027-01-20', lastDue: '2027-04-30',
    termName: 'Fall 2026', termStart: '2026-08-24', termEnd: '2026-12-18',
  }];
  const match = matchSemester(reported, [fallSemester, summerSemester]);
  assertEquals(match.semesterId, 'fal');
  assertEquals(match.confidence, 'strong');
});

Deno.test('partial overlap is weak, not strong — the UI must ask', () => {
  const straddling: CourseFacts[] = [
    { id: '1', name: 'X', firstDue: '2026-07-01', lastDue: '2026-10-15' },
  ];
  const match = matchSemester(straddling, [summerSemester]);
  assertEquals(match.semesterId, 'sum');
  assertEquals(match.confidence, 'weak');
});

Deno.test('a feed spanning two terms flags the out-of-window courses', () => {
  const mixed: CourseFacts[] = [
    ...fall2026,
    { id: '3', name: 'SUM-100', itemCount: 4, firstDue: '2026-06-02', lastDue: '2026-07-20' },
  ];
  assertEquals([...coursesOutside(mixed, fallSemester)], ['3']);
});

Deno.test('suggestNewSemester names the term and covers the real work', () => {
  const suggestion = suggestNewSemester(fall2026)!;
  assertEquals(suggestion.name, 'Fall 2026');
  // Preset start (Aug 15) is earlier than the first deadline, so it wins;
  // the end must cover the last exam.
  assertEquals(suggestion.startDate, '2026-08-15');
  assertEquals(suggestion.endDate, '2026-12-18');
});

Deno.test('suggestNewSemester widens the preset when work runs past it', () => {
  const late: CourseFacts[] = [
    { id: '1', name: 'X', firstDue: '2027-01-05', lastDue: '2027-05-30' },
  ];
  const suggestion = suggestNewSemester(late)!;
  assertEquals(suggestion.name, 'Spring 2027');
  assertEquals(suggestion.startDate, '2027-01-05');
  assertEquals(suggestion.endDate, '2027-05-30');
});

Deno.test('suggestNewSemester prefers the term Canvas reported', () => {
  const reported: CourseFacts[] = [{
    id: '1', name: 'X', firstDue: '2027-01-20', lastDue: '2027-05-08',
    termName: 'Spring 2027', termStart: '2027-01-12', termEnd: '2027-05-15',
  }];
  assertEquals(suggestNewSemester(reported)!.name, 'Spring 2027');
});

Deno.test('the rollover case: Spring courses, only a Fall semester exists', () => {
  const spring: CourseFacts[] = [
    { id: '9', name: 'BIO-110', itemCount: 31, firstDue: '2027-01-12', lastDue: '2027-05-08' },
  ];
  const match = matchSemester(spring, [fallSemester]);
  assertEquals(match.confidence, 'none');
  assertEquals(suggestNewSemester(spring)!.name, 'Spring 2027');
});

Deno.test('single-deadline course inside a window counts as covered', () => {
  const one: CourseFacts[] = [{ id: '1', name: 'X', firstDue: '2026-10-01', lastDue: '2026-10-01' }];
  assertEquals(matchSemester(one, [fallSemester]).confidence, 'strong');
});

Deno.test('formatSpan reads as a range, and collapses a single day', () => {
  assertEquals(formatSpan({ first: '2026-09-02', last: '2026-12-12' }), 'Sep 2 – Dec 12');
  assertEquals(formatSpan({ first: '2026-09-02', last: '2026-09-02' }), 'Sep 2');
  assertEquals(formatSpan(null), '');
});

// ── Courses that exist before any coursework does ──────────────────────────
// Canvas shells are created before professors publish anything, so a course
// can be listed with zero dated items. It must never be silently dropped, and
// it must never be guessed into a semester on no evidence.

Deno.test('a course with no dated work yields no span and no match', () => {
  const empty: CourseFacts[] = [{ id: 'e1', name: 'PHY-150', itemCount: 0 }];
  assertEquals(spanOf(empty), null);
  assertEquals(matchSemester(empty, [fallSemester]).confidence, 'none');
  // Critically: not a conflict either. "I know nothing" must not render as
  // "this is wrong", or the student is warned away from a correct choice.
  assertEquals(conflictsWith(empty, fallSemester), false);
  assertEquals([...coursesOutside(empty, fallSemester)], []);
});

Deno.test('a dateless course still matches when Canvas named the term', () => {
  // The token/API path: no assignments published, but the school states the
  // term outright, which is better evidence than any date could be.
  const empty: CourseFacts[] = [{
    id: 'e1', name: 'PHY-150', itemCount: 0,
    termName: 'Fall 2026', termStart: '2026-08-24', termEnd: '2026-12-18',
  }];
  const match = matchSemester(empty, [summerSemester, fallSemester]);
  assertEquals(match.semesterId, 'fal');
  assertEquals(match.confidence, 'strong');
  assertEquals(suggestNewSemester(empty)!.name, 'Fall 2026');
});

Deno.test('dated courses still decide the term when one of them is empty', () => {
  // A mixed batch — the usual shape at the start of a term, when one professor
  // has published and another has not. The empty one must not drag the
  // suggestion toward today's date.
  const mixed: CourseFacts[] = [
    ...fall2026,
    { id: 'e1', name: 'PHY-150', itemCount: 0 },
  ];
  assertEquals(spanOf(mixed), { first: '2026-09-02', last: '2026-12-12' });
  assertEquals(matchSemester(mixed, [fallSemester]).confidence, 'strong');
  assertEquals(suggestNewSemester(mixed)!.name, 'Fall 2026');
});

Deno.test('an entirely dateless batch falls back to the current term, not to nothing', () => {
  // suggestNewSemester must still offer something creatable: a student looking
  // at a course with no published work yet should not be stuck with a create
  // button that has no name in it.
  const empty: CourseFacts[] = [{ id: 'e1', name: 'PHY-150', itemCount: 0 }];
  const suggestion = suggestNewSemester(empty, new Date('2026-10-01T12:00:00Z'))!;
  assertEquals(suggestion.name, 'Fall 2026');
});
