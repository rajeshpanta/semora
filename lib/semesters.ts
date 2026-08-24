// Semester naming + preset suggestions. Used by:
//   - lib/syllabus.ts (parser fallback when the AI doesn't name the term)
//   - app/semester/new.tsx (quick-pick chips above the name input)
//
// US academic calendar conventions, with month *and* day boundaries
// (the old month-bucket heuristic in syllabus.ts misrouted syllabus
// uploads near term transitions — Dec 28 → "Fall ${year}" but the user
// is uploading Spring next-year). Quarter systems and non-US calendars
// are deferred; users on those can still type a name freely.

export type Term = 'Spring' | 'Summer' | 'Fall';

// Rough US academic-calendar boundaries. Approximate — start dates
// are when most schools' classes begin, end dates when finals wrap.
// Users can override the prefilled dates on the create form.
//
// Format: [startMonth (0-indexed), startDay] inclusive.
const TERM_STARTS: Record<Term, [number, number]> = {
  Spring: [0, 8],   // Jan 8
  Summer: [4, 16],  // May 16
  Fall:   [7, 15],  // Aug 15
};

const TERM_ENDS: Record<Term, [number, number]> = {
  Spring: [4, 15],  // May 15
  Summer: [7, 14],  // Aug 14
  Fall:   [11, 18], // Dec 18
};

const TERM_ORDER: ReadonlyArray<Term> = ['Spring', 'Summer', 'Fall'];

const dayOfYear = (d: Date) => {
  const start = new Date(d.getFullYear(), 0, 0);
  // Round to ignore sub-day differences (DST etc).
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
};

const termStartDay = (term: Term, year: number) => {
  const [m, d] = TERM_STARTS[term];
  return dayOfYear(new Date(year, m, d));
};

/** Which term contains this date? Boundaries fall as documented above;
 *  the gap between Dec 18 (Fall end) and Jan 8 (Spring start) belongs
 *  to whichever side is closer — winter break is not its own term. */
export function termForDate(d: Date): { term: Term; year: number } {
  const today = dayOfYear(d);
  const year = d.getFullYear();
  if (today >= termStartDay('Fall', year)) return { term: 'Fall', year };
  if (today >= termStartDay('Summer', year)) return { term: 'Summer', year };
  if (today >= termStartDay('Spring', year)) return { term: 'Spring', year };
  // Before Jan 8 → still belongs to previous Fall
  return { term: 'Fall', year: year - 1 };
}

/** Suggest a single semester name for the syllabus parser fallback.
 *  When we're within 14 days of the next term starting, prefer that
 *  term — students upload syllabi a couple weeks before classes begin. */
const LOOKAHEAD_DAYS = 14;

export function suggestCurrentSemesterName(now: Date = new Date()): string {
  const { term, year } = termForDate(now);
  // Walk to next term; wraps Fall → Spring of next year. Plain Date
  // math (no dayOfYear) so cross-year boundaries work correctly —
  // dayOfYear can't compare Jan 5 of year+1 to a "current year" frame.
  const nextIdx = (TERM_ORDER.indexOf(term) + 1) % TERM_ORDER.length;
  const nextTerm = TERM_ORDER[nextIdx]!;
  const nextYear = nextIdx === 0 ? year + 1 : year;
  const [nm, nd] = TERM_STARTS[nextTerm];
  const nextStartDate = new Date(nextYear, nm, nd);
  const daysUntilNext = (nextStartDate.getTime() - now.getTime()) / 86400000;
  if (daysUntilNext > 0 && daysUntilNext <= LOOKAHEAD_DAYS) {
    return `${nextTerm} ${nextYear}`;
  }
  return `${term} ${year}`;
}

/** Three quick-pick suggestions for the create form: the current term
 *  + next two, in chronological order. Each carries rough start/end
 *  dates the user can override. */
export function suggestSemesters(now: Date = new Date()): Array<{
  name: string;
  start: Date;
  end: Date;
}> {
  const { term, year } = termForDate(now);
  const out: Array<{ name: string; start: Date; end: Date }> = [];
  let t = term;
  let y = year;
  for (let i = 0; i < 3; i++) {
    const [sm, sd] = TERM_STARTS[t];
    const [em, ed] = TERM_ENDS[t];
    out.push({
      name: `${t} ${y}`,
      start: new Date(y, sm, sd),
      end: new Date(y, em, ed),
    });
    const nextIdx = (TERM_ORDER.indexOf(t) + 1) % TERM_ORDER.length;
    if (nextIdx === 0) y += 1;
    t = TERM_ORDER[nextIdx]!;
  }
  return out;
}

/**
 * The rough calendar window for a named term, as ISO dates.
 *
 * Exposed so term matching (lib/termMatch.ts) can answer "does this Canvas
 * coursework belong to the semester the student called 'Fall 2026'?" for the
 * many semesters that carry no start_date/end_date — those fields are
 * optional on the create form, so a large share of real rows have neither.
 * The constants stay private to this file; everything that needs a term's
 * boundaries asks for them here rather than re-deriving its own.
 */
export function termWindow(term: Term, year: number): { start: string; end: string } {
  const [sm, sd] = TERM_STARTS[term];
  const [em, ed] = TERM_ENDS[term];
  const iso = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { start: iso(year, sm, sd), end: iso(year, em, ed) };
}

/**
 * Read a term out of a human-written name: "Fall 2026", "FALL26", "2026 Fall",
 * "Otoño 2026". Returns null for anything that is not recognisably one of the
 * three US terms with a year — "Term 3", "Michaelmas", "My classes" — because
 * a wrong guess here silently files a semester's worth of work in the wrong
 * place, and no answer is the safe answer.
 */
export function parseTermName(raw: string | null | undefined): { term: Term; year: number } | null {
  if (!raw) return null;
  const text = raw.toLowerCase();
  const term: Term | null =
    /\b(fall|autumn|oto[ñn]o)\b|\bfa\d/.test(text) ? 'Fall'
    : /\b(spring|primavera)\b|\bsp\d/.test(text) ? 'Spring'
    : /\b(summer|verano)\b|\bsu\d/.test(text) ? 'Summer'
    : null;
  if (!term) return null;
  // Four-digit year first. A bare two-digit year ("FA26") is only read when no
  // four-digit one is present, and only in the 2000s — "Fall 99" in a student
  // planner means 2099 far less often than it means a typo, but either way a
  // 1999 semester is not a thing anyone is importing Canvas into.
  const four = text.match(/\b(20\d{2})\b/);
  if (four) return { term, year: Number(four[1]) };
  const two = text.match(/(?:fa|sp|su|fall|spring|summer)\s*'?(\d{2})\b/);
  if (two) return { term, year: 2000 + Number(two[1]) };
  return null;
}
