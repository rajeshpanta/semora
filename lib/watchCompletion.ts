/**
 * The rules a Watch-originated completion has to satisfy before it becomes a
 * database write.
 *
 * Everything here is a guard, not a behaviour. The completion itself is
 * `useToggleTaskComplete` in lib/queries.ts — the same mutation the Today tab,
 * the task detail screen, the course screen and search all use, which owns the
 * offline queue, reminder cancellation, calendar removal, the next recurrence's
 * reminders, the celebration, the review milestone and the error report. The
 * Watch does not get its own version of any of that; it gets a way to ask for
 * it.
 */

/** Message the Watch sends. Nothing else is accepted. */
export const WATCH_COMPLETE_REQUEST_TYPE = 'semora_watch_complete';
/** Reply the phone sends back so the Watch can stop guessing. */
export const WATCH_COMPLETE_ACK_TYPE = 'semora_watch_complete_ack';

export type WatchCompletionFailure =
  | 'malformed'
  | 'not_found'
  | 'already_completed'
  | 'duplicate'
  | 'signed_out'
  | 'failed';

export interface WatchCompletionRequest {
  requestId: string;
  taskId: string;
  requestedAt: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate what arrived over WatchConnectivity.
 *
 * The payload crosses a process boundary from another device, so it is treated
 * as input rather than as something we wrote. Requiring uuid shape on both ids
 * costs nothing and means a malformed request is refused here instead of
 * becoming a database round-trip.
 */
export function parseWatchCompletionRequest(raw: unknown): WatchCompletionRequest | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (value.type !== WATCH_COMPLETE_REQUEST_TYPE) return null;

  const requestId = value.requestId;
  const taskId = value.taskId;
  if (typeof requestId !== 'string' || !UUID_RE.test(requestId)) return null;
  if (typeof taskId !== 'string' || !UUID_RE.test(taskId)) return null;

  return {
    requestId,
    taskId,
    requestedAt: typeof value.requestedAt === 'string' ? value.requestedAt : '',
  };
}

/**
 * Was this handed in late?
 *
 * The same rule the notification "Mark Complete" action has always applied: a
 * task with a time is late after that time, a task without one is late after
 * the end of its due day. Both surfaces complete a task with nobody looking at
 * a phone, so neither can ask the student the question TaskCompletionFlow asks
 * — and they must not answer it differently, or the same task ticked from a
 * banner and from a wrist would land in the database with different penalties.
 */
export function deriveSubmittedLate(
  dueDate: string,
  dueTime: string | null | undefined,
  now: Date,
): boolean {
  const due = dueTime
    ? new Date(`${dueDate}T${dueTime}`)
    : new Date(`${dueDate}T23:59:59`);
  // An unparseable date is not evidence of lateness. Completing on time is the
  // forgiving default, and it matches what the notification path does.
  if (!Number.isFinite(due.getTime())) return false;
  return now > due;
}

/**
 * Tracks which requests have already been acted on.
 *
 * Two things make a request arrive twice: WatchConnectivity replaying a queued
 * transfer after the phone was woken, and a student tapping again because the
 * watch had not yet heard back. Neither may complete the task twice — a second
 * completion would fire the celebration again, increment the review milestone
 * again, and, for a recurring task, ask the database trigger to create a second
 * next occurrence.
 *
 * This is the first of two guards. The second is authoritative and lives in the
 * database read: a task that is already complete is never completed again. This
 * one exists so the common case never reaches the network at all.
 */
export class WatchRequestLedger {
  private seen = new Set<string>();
  private order: string[] = [];

  /** Bounded so a long-lived app cannot grow this without limit. */
  constructor(private readonly limit = 200) {}

  /** True if this is the first time we have seen the id. */
  claim(requestId: string): boolean {
    if (this.seen.has(requestId)) return false;
    this.seen.add(requestId);
    this.order.push(requestId);
    if (this.order.length > this.limit) {
      const evicted = this.order.shift();
      if (evicted) this.seen.delete(evicted);
    }
    return true;
  }

  has(requestId: string): boolean {
    return this.seen.has(requestId);
  }

  /**
   * Forget a request so it can be retried.
   *
   * Only for failures that are worth retrying — a transport error, not a
   * refusal. A request released after a genuine "already completed" would let a
   * replay do the work twice.
   */
  release(requestId: string): void {
    if (!this.seen.delete(requestId)) return;
    this.order = this.order.filter((id) => id !== requestId);
  }

  get size(): number {
    return this.seen.size;
  }
}

// ── Orchestration ───────────────────────────────────────────────────────────

/** What the phone found when it looked the task up. */
export interface WatchCompletionTask {
  id: string;
  title: string;
  due_date: string;
  due_time: string | null;
  is_completed: boolean;
}

export interface WatchCompletionOutcome {
  ok: boolean;
  reason: WatchCompletionFailure | null;
  /** True only when a completion was actually performed. */
  completed: boolean;
}

export interface WatchCompletionDeps {
  /** Reads the task, already scoped to the signed-in user. Null when there is
   *  no such task for this account. */
  loadTask: (taskId: string) => Promise<WatchCompletionTask | null>;
  /** The canonical completion — `useToggleTaskComplete().mutateAsync`. */
  complete: (input: { id: string; is_completed: true; submitted_late: boolean }) => Promise<unknown>;
  ledger: WatchRequestLedger;
  now?: () => Date;
}

/**
 * Decide what one Watch request should do, and do it.
 *
 * Extracted from the component so the decisions can be tested rather than
 * argued about. Every branch here answers the same question — should this
 * become a database write — and the answer is no more often than it is yes.
 *
 * Note what is NOT here: how a task gets completed. That is `complete`, which
 * is `useToggleTaskComplete`, which owns reminders, calendar, recurrence,
 * offline queueing, the celebration, the review milestone and error reporting.
 * Reimplementing any of it here is precisely the second definition this design
 * exists to avoid.
 */
export async function handleWatchCompletionRequest(
  request: WatchCompletionRequest,
  deps: WatchCompletionDeps,
): Promise<WatchCompletionOutcome> {
  const { loadTask, complete, ledger, now = () => new Date() } = deps;

  // Cheap replay guard. The authoritative one is `is_completed` below; this
  // one keeps the common case off the network entirely.
  if (!ledger.claim(request.requestId)) {
    return { ok: true, reason: 'duplicate', completed: false };
  }

  try {
    const task = await loadTask(request.taskId);

    if (!task) {
      // Deleted, or belonging to an account that is no longer signed in — a
      // watch keeps its last snapshot until something replaces it.
      return { ok: false, reason: 'not_found', completed: false };
    }

    if (task.is_completed) {
      // Reported as success on purpose. The student's intent is satisfied, and
      // telling the watch this failed would invite another tap at a task that
      // is already done.
      return { ok: true, reason: 'already_completed', completed: false };
    }

    await complete({
      id: task.id,
      is_completed: true,
      submitted_late: deriveSubmittedLate(task.due_date, task.due_time, now()),
    });

    return { ok: true, reason: null, completed: true };
  } catch {
    // Released so a retry can be acted on. Offline does NOT reach here: the
    // mutation queues offline work and resolves, so the watch is told the
    // completion succeeded — which it has, as far as this device is concerned.
    ledger.release(request.requestId);
    return { ok: false, reason: 'failed', completed: false };
  }
}
