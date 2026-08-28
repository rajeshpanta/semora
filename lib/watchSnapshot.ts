/**
 * Shapes the Apple Watch payload.
 *
 * This module deliberately computes NOTHING. "Overdue", "due today" and "what's
 * next" are already answered by the Today tab's queries — `useTasks` with
 * `dueDateTo: yesterday, isCompleted: false` for overdue, and
 * `dueDateFrom: today, isCompleted: false` for everything ahead, both ordered by
 * `due_date` then `due_time` in Postgres. Re-deriving any of that here would
 * create a second source of truth that drifts the first time a filter changes,
 * which is exactly the failure lib/taskStatus.ts was written to end.
 *
 * So the contract is narrow: hand this the two arrays the Today screen already
 * holds, and it selects, orders and trims them for a 40mm screen.
 */

/** Bumped only alongside the Watch-side decoder in targets/watch/index.swift. */
export const WATCH_SCHEMA_VERSION = 2;

/**
 * Total rows the Watch renders. A watch face is a glance, not a backlog: past
 * roughly this many the student is scrolling, and scrolling is what the phone
 * is for.
 */
export const WATCH_MAX_ITEMS = 8;

/**
 * How many of those rows overdue work may occupy.
 *
 * Without a cap, a student with eleven late assignments gets a Watch that only
 * ever shows late assignments — the thing due in two hours falls off the end,
 * and the screen becomes a guilt list instead of a plan. Three is enough to
 * convey "you have a backlog" while guaranteeing today and next-up still fit.
 * The count in the header stays honest regardless of how many rows are shown.
 */
export const WATCH_MAX_OVERDUE_ITEMS = 3;

export type WatchBucket = 'overdue' | 'today' | 'upcoming';

/** The minimum a row needs to render. No ids, no user, no course id. */
export interface WatchTaskItem {
  title: string;
  course: string;
  colorHex: string;
  /** yyyy-MM-dd. The Watch re-derives its own labels from this at render time. */
  dueDate: string;
  /** HH:mm[:ss] or null. */
  dueTime: string | null;
  bucket: WatchBucket;
}

export type WatchState = 'ready' | 'signed_out';

export interface WatchSnapshot {
  state: WatchState;
  /** Honest totals — never the truncated row count. */
  dueTodayCount: number;
  overdueCount: number;
  items: WatchTaskItem[];
}

/** The shape this module needs from a task row. A structural subset of
 *  TaskWithCourse so lib/queries.ts stays the owner of the real type. */
export interface WatchSourceTask {
  title: string;
  due_date: string;
  due_time?: string | null;
  courses?: { name?: string | null; color?: string | null } | null;
}

/** Matches the app's brand purple, used when a course has no colour set. */
const FALLBACK_COLOR = '#6B46C1';
const FALLBACK_COURSE = 'Course';

function toItem(task: WatchSourceTask, bucket: WatchBucket): WatchTaskItem {
  return {
    // A row with no title would render as a blank line the student cannot
    // interpret; name it rather than showing nothing.
    title: task.title?.trim() ? task.title : 'Untitled task',
    course: task.courses?.name?.trim() ? task.courses.name : FALLBACK_COURSE,
    colorHex: task.courses?.color?.trim() ? task.courses.color : FALLBACK_COLOR,
    dueDate: task.due_date,
    dueTime: task.due_time ?? null,
    bucket,
  };
}

export interface BuildWatchSnapshotInput {
  /**
   * Incomplete tasks already past due, oldest first — the Today screen's
   * `overdueTasks`.
   */
  overdue: WatchSourceTask[];
  /**
   * Incomplete tasks due today or later, soonest first — the Today screen's
   * `upcomingTasks`.
   */
  upcoming: WatchSourceTask[];
  /** Today as yyyy-MM-dd, from the same `format(today, 'yyyy-MM-dd')` the
   *  caller already computed. Passed in rather than read from the clock so this
   *  stays pure and testable across timezones. */
  todayKey: string;
}

/**
 * Build the payload.
 *
 * Row order is urgency order: overdue, then today, then the next thing coming.
 * That is the same priority the Today tab renders in, so a student who looks at
 * both does not have to reconcile two different pictures of their day.
 */
export function buildWatchSnapshot({
  overdue,
  upcoming,
  todayKey,
}: BuildWatchSnapshotInput): WatchSnapshot {
  const dueToday = upcoming.filter((task) => task.due_date === todayKey);
  const later = upcoming.filter((task) => task.due_date > todayKey);

  const items: WatchTaskItem[] = [
    ...overdue.slice(0, WATCH_MAX_OVERDUE_ITEMS).map((t) => toItem(t, 'overdue')),
    ...dueToday.map((t) => toItem(t, 'today')),
    ...later.map((t) => toItem(t, 'upcoming')),
  ].slice(0, WATCH_MAX_ITEMS);

  return {
    state: 'ready',
    // Counts come from the full arrays, not from `items`. The header must say
    // "4 overdue" even when only three rows fit.
    dueTodayCount: dueToday.length,
    overdueCount: overdue.length,
    items,
  };
}

/**
 * The payload pushed on sign-out.
 *
 * Not merely an empty snapshot: application context persists on the watch
 * across launches and survives the phone signing out, so leaving zeros behind
 * would render as a cheerful "nothing due" for an account that is no longer
 * signed in — and the previous account's rows would still be there if the
 * delivery were skipped. `signed_out` gives the Watch something unambiguous to
 * show instead. Same reasoning as clearTodayWidget in lib/widgetBridge.ts.
 */
export function signedOutWatchSnapshot(): WatchSnapshot {
  return { state: 'signed_out', dueTodayCount: 0, overdueCount: 0, items: [] };
}
