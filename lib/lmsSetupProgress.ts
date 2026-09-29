/**
 * What the student had already worked out, kept across leaving the app —
 * for any LMS, not just Canvas.
 *
 * MOODLE_PLAN.md Phase 4.2. lib/canvasSetupProgress.ts said all of this first
 * and said it well; the only thing wrong with it for a second provider is that
 * its storage key is global. Two providers sharing one key means a student who
 * poked at Canvas last week opens the Moodle screen and is shown a Canvas
 * school, a Canvas lane and a Canvas attempt count — and because the connect
 * screen hides its own heading once a lane is chosen, that presents as a blank
 * screen with no way forward.
 *
 * So the shape is unchanged and the key is scoped. `canvasSetupStorageKey`
 * still returns exactly what it always did, so no Canvas student mid-setup
 * loses their place on the deploy that ships this.
 *
 * THE KEY MUST NOT CONTAIN A COLON. expo-secure-store validates keys against
 * /^[\w.-]+$/ and lib/deviceStore.ts swallows the throw, so a colon means
 * every write silently succeeds and stores nothing. That is not hypothetical:
 * it is what happened to two Canvas keys on 2026-09-13, and nobody noticed for
 * weeks because there is no error to notice.
 *
 * WHAT IS DELIBERATELY NOT STORED: the feed link. It is a bearer credential
 * with a proper home in the server-side Vault, and the student is arriving
 * with it in their clipboard anyway.
 */

export type LmsSetupProvider = 'canvas' | 'moodle';
export type LmsLaneChoice = 'phone' | 'laptop';

/** What the no-login site check learned, kept so returning does not re-ask. */
export interface LmsSitePrecheck {
  isMoodle: boolean;
  /** Mobile web services on: the precondition for any future token road. */
  mobile?: boolean;
  /** 1 = via the app, 2 = browser, 3 = embedded browser. */
  typeoflogin?: number;
  sso?: boolean;
  /**
   * Why the check could not confirm, when it could not. Kept so a student who
   * leaves for the browser and comes back is still told "this does not look
   * like Moodle" rather than being shown a confident "Found:".
   */
  reason?: LmsProbeReason;
}

export type LmsProbeReason = 'not_moodle' | 'unreachable' | 'blocked';

export interface LmsSetupProgress {
  /** The hostname the student identified, if they got that far. */
  host: string | null;
  /**
   * The site root, which for Moodle may carry a path
   * (https://school.edu/moodle). Canvas leaves this null and uses `host`.
   */
  wwwroot: string | null;
  /** The school's display name, so the UI can say it back to them. */
  schoolName: string | null;
  setupLane: LmsLaneChoice | null;
  /** Failed paste attempts, which is what escalation is keyed on. */
  attempts: number;
  precheck: LmsSitePrecheck | null;
  savedAt: string | null;
}

export const EMPTY_LMS_PROGRESS: LmsSetupProgress = {
  host: null, wwwroot: null, schoolName: null, setupLane: null,
  attempts: 0, precheck: null, savedAt: null,
};

/**
 * Twelve hours. Long enough to cover "I will do this when I get to my laptop
 * tonight", short enough that a half-finished attempt from last term does not
 * reappear as though it were current.
 */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * One key per provider per user.
 *
 * Canvas keeps the exact key it has always used, so this ships without
 * resetting anyone who is mid-setup.
 */
export function lmsSetupStorageKey(provider: LmsSetupProvider, userId: string): string {
  return provider === 'canvas'
    ? `semora_canvas_setup_v1_${userId}`
    : `semora_${provider}_setup_v1_${userId}`;
}

export function parseLmsSetupProgress(
  raw: string | null | undefined,
  now: number = Date.now(),
): LmsSetupProgress {
  if (!raw) return EMPTY_LMS_PROGRESS;
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_LMS_PROGRESS;
  }
  if (!parsed || typeof parsed !== 'object') return EMPTY_LMS_PROGRESS;

  // Expired progress is the same as none. Returning it would put a student
  // back into a flow they abandoned, with a school they may have since left.
  const savedAt = typeof parsed.savedAt === 'string' ? parsed.savedAt : null;
  if (!savedAt) return EMPTY_LMS_PROGRESS;
  const age = now - new Date(savedAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return EMPTY_LMS_PROGRESS;

  const setupLane = parsed.setupLane === 'phone' || parsed.setupLane === 'laptop' ? parsed.setupLane : null;
  const attempts = Number.isFinite(parsed.attempts) ? Math.max(0, Math.min(99, Math.trunc(parsed.attempts))) : 0;

  let precheck: LmsSitePrecheck | null = null;
  if (parsed.precheck && typeof parsed.precheck === 'object') {
    precheck = {
      isMoodle: parsed.precheck.isMoodle === true,
      ...(typeof parsed.precheck.mobile === 'boolean' ? { mobile: parsed.precheck.mobile } : {}),
      ...(Number.isFinite(parsed.precheck.typeoflogin) ? { typeoflogin: Number(parsed.precheck.typeoflogin) } : {}),
      ...(typeof parsed.precheck.sso === 'boolean' ? { sso: parsed.precheck.sso } : {}),
      ...(['not_moodle', 'unreachable', 'blocked'].includes(parsed.precheck.reason)
        ? { reason: parsed.precheck.reason as LmsProbeReason }
        : {}),
    };
  }

  return {
    host: typeof parsed.host === 'string' && parsed.host ? parsed.host : null,
    wwwroot: typeof parsed.wwwroot === 'string' && parsed.wwwroot ? parsed.wwwroot : null,
    schoolName: typeof parsed.schoolName === 'string' && parsed.schoolName ? parsed.schoolName : null,
    setupLane,
    attempts,
    precheck,
    savedAt,
  };
}

export function serializeLmsSetupProgress(
  progress: LmsSetupProgress,
  now: Date = new Date(),
): string {
  return JSON.stringify({ ...progress, savedAt: now.toISOString() });
}

/**
 * How many failures before the student is offered a different route.
 *
 * Two, not one: a single mistyped or half-copied paste is ordinary and
 * interrupting it would be nagging. Two in a row means the instructions are
 * not working for this person, and repeating them a third time is the least
 * useful thing the screen could do.
 */
export const ESCALATE_AFTER_ATTEMPTS = 2;

export function shouldEscalateLmsSetup(progress: LmsSetupProgress): boolean {
  return progress.attempts >= ESCALATE_AFTER_ATTEMPTS;
}

/**
 * Has a Moodle student reached the step where they paste the link?
 *
 * On a phone that is a lane choice: "here on my phone" or "on a laptop". On
 * the web there is no such choice to make — the student IS on the laptop, and
 * asking them was the loop that sent web users off to open app.semoraai.com
 * while they were already on it. So on the web, knowing the school is enough.
 *
 * The connect screen and the guided card both read this, so they cannot
 * disagree about whether the paste step is showing.
 */
export function moodleLinkStepReady(progress: LmsSetupProgress, isWeb: boolean): boolean {
  if (!progress.wwwroot) return false;
  return isWeb || !!progress.setupLane;
}

/**
 * Has the student on the connect screen moved past choosing how to do it?
 *
 * The heading, subtitle and free-offer card hide once they have, because by
 * then the page should be instructing rather than pitching. Only the two
 * calendar-link roads HAVE such a step; read for any other road it is always
 * false.
 *
 * It used to read Canvas's lane for everything that was not Moodle's link
 * road, so a student who had once picked a Canvas lane and then switched to
 * Blackboard, or took Moodle's token road, lost the heading and subtitle
 * there too — a form with nothing above it saying what it was for.
 */
export function feedLaneChosenFor(road: {
  /** Canvas's calendar-link road is on screen. */
  canvas: boolean;
  /** Moodle's calendar-link road is on screen. */
  moodleFeed: boolean;
  canvasProgress: { setupLane: LmsLaneChoice | null };
  moodleProgress: LmsSetupProgress;
  isWeb: boolean;
}): boolean {
  if (road.moodleFeed) return moodleLinkStepReady(road.moodleProgress, road.isWeb);
  if (road.canvas) return !!road.canvasProgress.setupLane;
  return false;
}

/**
 * May a connection exist, and sync, with no courses linked to it yet?
 *
 * Only a Moodle calendar feed. Early in a term, before any instructor has set
 * a date, a Moodle calendar is genuinely empty — so the student saves the link
 * and the background sync discovers each course the first time a date is
 * posted. Every sync of that connection runs with zero links by design.
 *
 * The server has always allowed this (lms-sync fetchAssignmentsForConnection);
 * the client did not, so "Save and keep checking" created the connection, ran
 * the first sync, was refused with "This LMS connection has no enabled
 * courses.", and rolled the whole thing back. Mirrors the server exactly: every
 * other provider still needs at least one course.
 */
export function lmsConnectionMayBeEmpty(
  provider: string | null | undefined,
  connectionMethod: string | null | undefined,
): boolean {
  return provider === 'moodle' && connectionMethod === 'calendar_feed';
}
