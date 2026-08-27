/**
 * Deciding which already-scheduled reminders no longer deserve to fire.
 *
 * A task reminder is a LOCAL notification: it lives on the phone that created
 * it, and only that phone can cancel it. Every completion surface in the app
 * does exactly that. The gap this module closes is completion that happens
 * somewhere the phone isn't —
 *
 *   - Canvas marking an assignment submitted (server-side, on a pg_cron job,
 *     via `is_completed = tasks.is_completed or excluded.is_completed`),
 *   - the web app,
 *   - a second device,
 *
 * — after which the iPhone still holds a scheduled notification for work the
 * student has already finished, and nothing ever removes it.
 *
 * rescheduleAllTaskReminders cannot fix this, and the reason is worth stating
 * because it looks like it should: it selects `is_completed = false` and
 * cancels per task as it iterates. A task that became complete elsewhere is
 * not in that list, so its stale reminder is never reached.
 *
 * The logic is kept pure and separate from expo-notifications so it can be
 * tested against the exact cases that produced it.
 */

/** The shape we need from expo-notifications' scheduled-notification record. */
export interface ScheduledLike {
  identifier: string;
  content?: { data?: Record<string, unknown> | null } | null;
}

export interface ReconciliationPlan {
  /** Notification identifiers to cancel. */
  cancel: string[];
  /** Task ids those identifiers belonged to — for logging and tests. */
  staleTaskIds: string[];
  /** Task ids found scheduled, whether or not they survive. */
  scheduledTaskIds: string[];
}

/**
 * Group scheduled notifications by the task they remind about.
 *
 * `data.taskId` is the discriminator, and it is a reliable one: it is written
 * by scheduleTaskReminders and by snoozeNotification, and by nothing else.
 * The Pomodoro timer's notification carries `{ tag, fireAt }` with no task id,
 * and flashcard/re-engagement/ops notifications are REMOTE pushes that never
 * appear in the scheduled list at all. So anything without a taskId is not
 * ours to cancel, and is skipped rather than considered.
 */
export function groupRemindersByTask(scheduled: ScheduledLike[]): Map<string, string[]> {
  const byTask = new Map<string, string[]>();
  for (const notif of scheduled) {
    const taskId = notif?.content?.data?.taskId;
    if (typeof taskId !== 'string' || !taskId) continue;
    const existing = byTask.get(taskId);
    if (existing) existing.push(notif.identifier);
    else byTask.set(taskId, [notif.identifier]);
  }
  return byTask;
}

/**
 * Which scheduled reminders to cancel, given the tasks that are still open.
 *
 * `liveTaskIds` must be the ids that came back from a query for this user's
 * INCOMPLETE tasks, restricted to the ids we actually have scheduled. A task
 * id that was scheduled but is absent from that answer is stale for one of
 * three reasons, and all three should stop the reminder:
 *
 *   - it is now completed (anywhere: locally, on web, by Canvas),
 *   - it was deleted,
 *   - it belongs to a different account than the one signed in now.
 *
 * The caller is responsible for never passing an empty/failed query result as
 * `liveTaskIds` — see reconcileTaskReminders, which returns early rather than
 * treating an unreachable database as "nothing is open".
 */
export function planReminderReconciliation(
  scheduled: ScheduledLike[],
  liveTaskIds: Iterable<string>,
): ReconciliationPlan {
  const byTask = groupRemindersByTask(scheduled);
  const live = new Set(liveTaskIds);
  const cancel: string[] = [];
  const staleTaskIds: string[] = [];
  for (const [taskId, identifiers] of byTask) {
    if (live.has(taskId)) continue;
    staleTaskIds.push(taskId);
    cancel.push(...identifiers);
  }
  return { cancel, staleTaskIds, scheduledTaskIds: [...byTask.keys()] };
}
