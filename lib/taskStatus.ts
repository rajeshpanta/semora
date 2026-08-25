/**
 * One place to answer "what state is this task in".
 *
 * These two questions were each being answered in more than one place, and the
 * answers disagreed:
 *
 *   was it late?      Task detail read `submitted_late`; progressInsights
 *                     re-derived it from `completed_at > due` and reached the
 *                     opposite conclusion for the same row.
 *   what is still due? The Today list keeps completed rows on purpose (they
 *                     are the progress bar), and a caller that wanted a COUNT
 *                     of outstanding work reused that list as-is.
 *
 * Neither is complicated. Both were wrong because they were written twice.
 */

interface CompletionFields {
  is_completed: boolean;
  submitted_late?: boolean | null;
}

/**
 * Was this completed on time? `null` when it is not completed at all.
 *
 * `submitted_late` is the ONLY authority, and it is authoritative for every
 * origin:
 *
 *   manual, before the deadline  TaskCompletionFlow answers false without
 *                                asking (components/TaskCompletionFlow.tsx).
 *   manual, after the deadline   the student is asked and their answer is
 *                                stored — "I submitted at 2:50, I just ticked
 *                                it at 6" is a true statement the app must
 *                                keep.
 *   Canvas                       `submission.late` from the LMS, which knows
 *                                the real submission time.
 *   reopened                     the normalize_task_submission trigger
 *                                (migration 034) forces it back to false.
 *
 * `completed_at` deliberately plays no part. It records when the checkbox was
 * TICKED, not when the work was handed in, so comparing it to the deadline
 * answers a different question than the one being asked — and it can be null
 * on a Canvas row that arrived complete without a submission timestamp.
 */
export function isCompletedOnTime(task: CompletionFields): boolean | null {
  if (!task.is_completed) return null;
  return !task.submitted_late;
}

/** True when the task was completed and marked late. */
export function wasCompletedLate(task: CompletionFields): boolean {
  return isCompletedOnTime(task) === false;
}

/**
 * The subset of a task list that still needs doing.
 *
 * Use this for every COUNT or headline figure. Lists that show completed rows
 * on purpose — Today's checklist, the week roadmap — should keep using the
 * full array; this is for the numbers that answer "what is left".
 */
export function stillNeedsAttention<T extends { is_completed: boolean }>(tasks: T[]): T[] {
  return tasks.filter((task) => !task.is_completed);
}
