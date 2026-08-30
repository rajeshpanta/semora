/**
 * When Semora is allowed to ask for a rating.
 *
 * Kept free of react-native so the rule can be tested rather than described.
 * The screen supplies the store state and today's date; everything below is
 * the ordering rule those are wired into.
 *
 * The rule exists because the previous one was measurably asking at the wrong
 * moment. Production, 82 prompts:
 *
 *   fired within 10 minutes of first launch    39.0%
 *   fired within the first hour                75.6%
 *   of those asked, never opened Semora again  48.8%
 *
 * The old trigger read `hasImportedSyllabus` in a mount effect and deferred to
 * "a later app launch" by depending on `[]`. That reasoning assumed the Today
 * tab was already mounted when the import happened. It is not: a new student
 * onboards, scans a syllabus, and only THEN lands on Today, which mounts for
 * the first time with the flag already true and prompts 1.8s later — in the
 * same session, about ten minutes after install.
 *
 * So the gate is now a calendar day rather than a mount. A student who
 * imported today is asked tomorrow at the earliest, which is the difference
 * between asking someone who has seen a demo and asking someone who has
 * actually planned a week of work.
 *
 * Two asks, deliberately sequenced so they can never stack:
 *
 *   'native'  SKStoreReviewController, once ever. Apple caps this at roughly
 *             three prompts per user per year and silently does nothing past
 *             that, so it is spent carefully.
 *   'card'    A dismissible card that opens the App Store review composer.
 *             Not rate-limited, because the student taps it. This is the
 *             safety net for the native prompt iOS declined to show — an
 *             outcome the app cannot detect, since requestReview() reports
 *             nothing either way.
 *
 * The card waits for a day after the native ask for the same reason the native
 * ask waits for a day after the import: two requests in one sitting is asking
 * twice, however politely the second one is worded.
 */

/** Lifetime completions that stand in for "this app is working for me".
 *
 *  Was 10, which fired exactly once in the app's history: only 4% of devices
 *  complete a single task, so a tenth completion was unreachable. 3 is still
 *  a deliberate act repeated three times, and it is a threshold real users
 *  actually cross. */
export const REVIEW_TASK_MILESTONE = 3;

export type ReviewAsk = 'none' | 'native' | 'card';
export type ReviewTrigger = 'aha' | 'task_milestone';

export interface ReviewGateState {
  /** Neither ask has a web implementation; the store composer is a mobile URL. */
  platformIsWeb: boolean;
  /** Set on the first fully successful syllabus import, Pro or free. */
  hasImportedSyllabus: boolean;
  /** Device-local yyyy-MM-dd of that import. Null for devices that imported
   *  before this field existed — see `laterThanImport` below. */
  importedSyllabusDay: string | null;
  /** The native prompt has been spent. Says nothing about whether iOS showed it. */
  reviewRequested: boolean;
  /** Device-local yyyy-MM-dd the native prompt was spent. */
  reviewPromptedDay: string | null;
  /** The student dismissed the card. Once ever; this is not a nag. */
  ratingCardDismissed: boolean;
  tasksCompletedCount: number;
  /** Device-local yyyy-MM-dd, from the same clock the other two days came from. */
  today: string;
  /** The post-scan paywall appeared in THIS session. Asking for a rating in
   *  the same sitting as asking for money reads as a transaction. */
  paywallShownThisSession: boolean;
}

export interface ReviewDecision {
  ask: ReviewAsk;
  trigger?: ReviewTrigger;
}

const NONE: ReviewDecision = { ask: 'none' };

export function decideReviewAsk(s: ReviewGateState): ReviewDecision {
  if (s.platformIsWeb) return NONE;
  if (s.paywallShownThisSession) return NONE;

  // A null import day means the device imported before this field shipped.
  // Those devices are backfilled to the day the new code first runs (see
  // appStore), so null here only occurs for someone who never imported at
  // all — a student who typed their own tasks. Their milestone still counts;
  // there is simply no import day to be later than.
  const laterThanImport =
    s.importedSyllabusDay === null || s.today > s.importedSyllabusDay;

  if (!s.reviewRequested) {
    if (!laterThanImport) return NONE;
    if (s.hasImportedSyllabus) return { ask: 'native', trigger: 'aha' };
    if (s.tasksCompletedCount >= REVIEW_TASK_MILESTONE) {
      return { ask: 'native', trigger: 'task_milestone' };
    }
    return NONE;
  }

  // The native ask is spent. The card is the follow-up, a day later at the
  // earliest, once, and only for someone who reached the earned moment at all.
  if (s.ratingCardDismissed) return NONE;
  if (!s.hasImportedSyllabus && s.tasksCompletedCount < REVIEW_TASK_MILESTONE) return NONE;
  if (s.reviewPromptedDay === null) return NONE;
  if (s.today <= s.reviewPromptedDay) return NONE;
  return { ask: 'card' };
}
