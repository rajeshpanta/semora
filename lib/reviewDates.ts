/**
 * Which extracted items can actually become tasks.
 *
 * `tasks.due_date` is NOT NULL, so an item the parser returned without a date
 * cannot be saved until someone supplies one. That constraint is deliberate
 * and stays: a task with no deadline is not a task Semora can remind anyone
 * about.
 *
 * A bulk "set all dateless items to this date" action briefly lived here and
 * was removed on 2026-08-26, before shipping, once the production extractions
 * were examined. The all-dateless scans carried 38, 29 and 25 items with EVERY
 * title distinct, spanning exams, quizzes, readings and assignments — a whole
 * semester of coursework. One shared date across those would have replaced an
 * inert failure (a dateless item simply cannot be saved, so it harms nothing)
 * with durable wrong data: a pile of tasks all due the same day, all reminding
 * at once, all overdue the next morning, all feeding the grade engine.
 *
 * So nothing in this module writes a date. Dates come from the student, one
 * item at a time, and the review screen's job is to make dating only the items
 * they care about feel allowed rather than mandatory.
 */

/**
 * A date string the database will accept.
 *
 * The round-trip check catches impossible calendar dates: 2026-02-30 parses
 * happily and rolls forward to March 2, which would silently file an
 * assignment in the wrong month. null — the parser found no date — fails by
 * design, because tasks.due_date is NOT NULL and a dateless row must never
 * reach the insert.
 */
export function isRealDate(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/** The fields this module needs; the review screen's item carries more. */
export interface DatableItem {
  due_date: string | null;
  accepted: boolean;
  /** Fixed at parse time. Marks the section, and never changes as dates are
   *  typed — otherwise a card would jump between sections mid-keystroke. */
  needsDate: boolean;
}

/** How many items still cannot be saved because they have no usable date.
 *  Drives the section copy, and falls as the student fills them in. */
export function countStillMissingDates<T extends DatableItem>(items: T[]): number {
  return items.filter((item) => item.needsDate && !isRealDate(item.due_date)).length;
}

/**
 * The items that could legally be saved right now.
 *
 * Select-all is built from this, so a dateless row can never be swept into the
 * save set by a control the student did not aim at that row.
 */
export function saveableItems<T extends DatableItem>(items: T[]): T[] {
  return items.filter((item) => isRealDate(item.due_date));
}

/**
 * Accepted items that still have no usable date.
 *
 * The last gate before the insert. Anything here would violate the NOT NULL
 * constraint, so the save is refused and these are named back to the student
 * rather than silently dropped mid-write.
 */
export function invalidAcceptedItems<T extends DatableItem>(items: T[]): T[] {
  return items.filter((item) => item.accepted && !isRealDate(item.due_date));
}
