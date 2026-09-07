/**
 * The semester's priority list, read once and shared.
 *
 * S0 put a ranked "what deserves attention next" list on the Today tab. S7
 * lets a study session offer the NEXT item on that same list when the current
 * one is finished — which means two surfaces now read the ranking, and the one
 * thing that must never happen is for them to disagree. Semora has already
 * shipped that bug once: before S0 the planner and the suggestions card ranked
 * the same work differently for 73.7% of students, because each had its own
 * local ordering expression.
 *
 * So the ranking is not re-implemented here. This module holds only the pure
 * parts — which item to offer next, and the phrases both surfaces say — while
 * the hook that assembles the list lives beside the queries it composes, in
 * lib/queries.ts. Keeping this file free of React is what lets it be tested.
 *
 * No AI, no time estimates, no new ordering. Deterministic and dependency-free.
 */

import { type Suggestion } from '@/lib/studySuggestions';

/**
 * "exams are 30%" — the KIND, never the single task. A category is split
 * across every sibling in it, so "this quiz is 30% of your grade" would be
 * false. Lives here because both the Today card and the tutor say it.
 */
const STAKE_NOUN: Record<string, string> = {
  exam: 'exams', quiz: 'quizzes', assignment: 'assignments',
  project: 'projects', reading: 'readings', lab: 'labs',
};

/** Atomic phrases, so each is a whole string lib/i18n can look up or pattern-match. */
export function duePhrase(s: Pick<Suggestion, 'daysUntilDue'>): string {
  if (s.daysUntilDue <= 0) return 'due today';
  if (s.daysUntilDue === 1) return 'due tomorrow';
  return `due in ${s.daysUntilDue} days`;
}

export function stakePhrase(stake: { bucket: string; weightPercent: number }): string {
  return `${STAKE_NOUN[stake.bucket]} are ${stake.weightPercent}%`;
}

/**
 * The next thing worth offering after `currentTaskId`, or null.
 *
 * Pure so it can be tested without a semester, a store or a network. Returning
 * null is a real answer and the common one at the end of a light week: the
 * conductor should say nothing rather than manufacture a next thing to do.
 */
export function nextSemesterPriority(
  priorities: readonly Suggestion[],
  currentTaskId: string | null | undefined,
): Suggestion | null {
  return priorities.find((s) => s.taskId !== currentTaskId) ?? null;
}
