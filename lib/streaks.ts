import { formatLocalDate } from '@/lib/dates';
import type { TaskWithCourse } from '@/lib/queries';

/**
 * Pure streak math for the Today-tab habit chip.
 *
 * The guardrail that makes this feel fair (not punishing): a day only
 * counts against you if it actually HAD work due. Light weeks — where a
 * course has nothing due — are neutral, neither breaking nor extending
 * the streak. So the streak measures "did you keep up on the days that
 * mattered," not "did you use the app literally every day."
 *
 * Rules:
 *   - A day QUALIFIES only if ≥1 task was DUE that day (by due_date).
 *   - A qualifying day is SATISFIED if ≥1 of that day's due tasks was
 *     completed (completed_at present — the actual completion timestamp,
 *     not just is_completed, so a task marked done on a later day doesn't
 *     retroactively "save" an earlier due date it was late for).
 *   - Days with NO due tasks are NEUTRAL (skipped).
 *   - `current` = consecutive qualifying-and-satisfied days walking
 *     backwards from today. Today is only the anchor if it has due tasks;
 *     if today has nothing due yet, we anchor at yesterday so an empty
 *     morning doesn't read as a broken streak.
 *   - `best` = longest such run anywhere in the history.
 *
 * Pure + timezone-safe: all bucketing uses formatLocalDate (local
 * calendar day), matching how due_date is stored/picked. `now` is
 * injectable for tests.
 */

export interface StreakResult {
  /** Consecutive qualifying-and-satisfied days ending at today/yesterday. */
  current: number;
  /** Longest qualifying-and-satisfied run in the task history. */
  best: number;
  /** True when today itself was a qualifying day AND is satisfied. */
  activeToday: boolean;
}

/** A completion timestamp only counts toward the day it lands on if it
 *  matches (or precedes) the due date — i.e. the task was actually done
 *  on time for that due date. We key satisfaction on the due_date bucket
 *  and simply require SOME completed task in that bucket. */
interface DayBucket {
  due: number; // count of tasks due this day
  satisfied: boolean; // ≥1 of them has completed_at set
}

/** Add `delta` days to a YYYY-MM-DD key and return the new key, using
 *  local-calendar arithmetic via Date (formatLocalDate re-reads local
 *  components, so DST shifts don't drift the key). */
function shiftDateKey(key: string, delta: number): string {
  const d = new Date(key + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return formatLocalDate(d);
}

export function computeStreak(
  tasks: Pick<TaskWithCourse, 'due_date' | 'completed_at'>[] | null | undefined,
  now: Date = new Date(),
): StreakResult {
  const empty: StreakResult = { current: 0, best: 0, activeToday: false };
  if (!tasks || tasks.length === 0) return empty;

  // Bucket every task by its due date (the calendar day it was DUE, not
  // when it was completed). A day is satisfied if any task due that day
  // has a completion timestamp.
  const buckets = new Map<string, DayBucket>();
  for (const t of tasks) {
    if (!t.due_date) continue;
    // due_date is stored as YYYY-MM-DD already; normalize defensively in
    // case a full ISO string sneaks in.
    const key = t.due_date.length > 10 ? t.due_date.slice(0, 10) : t.due_date;
    const b = buckets.get(key) ?? { due: 0, satisfied: false };
    b.due += 1;
    // On time only: the completion must land on or before the due day.
    // completed_at is stamped when is_completed flips (queries.ts), so a task
    // due Monday but checked off Friday has completedKey > key and must NOT
    // satisfy Monday — otherwise a late completion retroactively "saves" an
    // earlier due date, contradicting this file's documented rule. YYYY-MM-DD
    // keys compare lexically = chronologically.
    if (t.completed_at) {
      const completedKey = formatLocalDate(new Date(t.completed_at));
      if (completedKey <= key) b.satisfied = true;
    }
    buckets.set(key, b);
  }
  if (buckets.size === 0) return empty;

  const todayKey = formatLocalDate(now);

  // ── current ──────────────────────────────────────────────
  // Anchor: today if it's a qualifying day; otherwise yesterday (an empty
  // today shouldn't read as a break — the user may just not have anything
  // due yet). If today qualifies but isn't satisfied, the streak is 0 and
  // activeToday is false — today is a live day still in play.
  const todayBucket = buckets.get(todayKey);
  const activeToday = !!todayBucket && todayBucket.satisfied;

  let current = 0;
  // Walk backwards from the anchor. Neutral (no-due) days are skipped so
  // they neither break nor extend. A qualifying-but-unsatisfied day stops
  // the walk.
  let cursor = todayBucket ? todayKey : shiftDateKey(todayKey, -1);
  // Cap the walk so a corrupt payload can't spin forever; a semester is
  // ~150 days, 400 is a generous ceiling.
  for (let guard = 0; guard < 400; guard++) {
    const b = buckets.get(cursor);
    if (!b) {
      // Neutral day — skip it, keep walking, but only within the span of
      // recorded history. Once we walk past the earliest bucket there's
      // nothing left to find, so stop.
      if (cursor < earliestKey(buckets)) break;
      cursor = shiftDateKey(cursor, -1);
      continue;
    }
    if (!b.satisfied) break; // qualifying day the user missed — streak ends
    current += 1;
    cursor = shiftDateKey(cursor, -1);
  }

  // ── best ─────────────────────────────────────────────────
  // Sort qualifying days chronologically, then find the longest run of
  // consecutive-by-calendar satisfied days, allowing neutral gaps between
  // them (a gap of only no-due days keeps the run alive; an unsatisfied
  // qualifying day breaks it).
  const sortedKeys = Array.from(buckets.keys()).sort();
  let best = 0;
  let run = 0;
  let prevKey: string | null = null;
  for (const key of sortedKeys) {
    const b = buckets.get(key)!;
    if (!b.satisfied) {
      // A missed qualifying day breaks any run.
      run = 0;
      prevKey = key;
      continue;
    }
    if (prevKey === null) {
      run = 1;
    } else {
      // Between prevKey and key, were there any MISSED qualifying days?
      // Neutral gaps are fine; an unsatisfied qualifying day would already
      // have reset run above when we visited it (sortedKeys includes it).
      run += 1;
    }
    if (run > best) best = run;
    prevKey = key;
  }
  // `current` can exceed the run-scan best only via neutral-day bridging
  // that the scan already honors, so best is a true max; clamp anyway.
  if (current > best) best = current;

  return { current, best, activeToday };
}

/** Earliest recorded due-date key — memo-free tiny helper (buckets are
 *  small; a full scan is cheaper than maintaining sorted state). */
function earliestKey(buckets: Map<string, DayBucket>): string {
  let min: string | null = null;
  for (const k of buckets.keys()) {
    if (min === null || k < min) min = k;
  }
  return min ?? '';
}
