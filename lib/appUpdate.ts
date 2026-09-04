/**
 * Applying an OTA in the session it arrives, instead of the one after.
 *
 * ─── THE PROBLEM ────────────────────────────────────────────
 * Expo.plist sets EXUpdatesCheckOnLaunch=ALWAYS and LaunchWaitMs=0, so every
 * launch downloads a waiting update in the background and then boots the OLD
 * bundle anyway. The new one runs on the NEXT launch. Nothing in the app has
 * ever called reloadAsync, so "next launch" is the only way an update has ever
 * been applied.
 *
 * Measured against that: the median device opens Semora once a week, and only
 * 39.8% open it twice in seven days. So a fix reaches roughly 40% of active
 * devices in a week and the rest whenever they happen to come back — which is
 * why students were still hitting a Canvas paste bug two days after it was
 * fixed, on builds that had already downloaded the fix.
 *
 * ─── WHY THIS IS A TIMING RULE, NOT A BUSY FLAG ─────────────
 * A reload restarts the JS. Doing that while someone is typing, recording a
 * lecture or halfway through a paste would be worse than the bug it delivers.
 * The app has no global "busy" state, and inventing one would mean every
 * future screen has to remember to set it — the same shape of mistake as the
 * per-call-site vocabulary this codebase has already fixed twice.
 *
 * So the rule is about WHEN, not about WHAT. There are exactly two moments
 * where nothing can be in flight by construction:
 *
 *   cold start   the app just launched; the student has not touched anything.
 *   resumed      they left and came back; whatever they were doing, they
 *                already walked away from it.
 *
 * Anything else waits. An update that arrives mid-session is simply held until
 * one of those two moments comes around, which for most people is their next
 * visit — still strictly better than the launch after that.
 */

export type UpdateMoment = 'cold-start' | 'resumed' | 'mid-session';

/**
 * Routes where a reload is never acceptable, whatever the moment.
 *
 * The recorder is the one that would actually destroy something: a lecture in
 * progress lives in memory until its segments upload, so restarting the JS
 * mid-recording loses audio the student cannot get back. The rest are flows
 * where a restart would strand someone in a half-finished state they would
 * have to begin again — and being bounced to the start of sign-up is exactly
 * the kind of thing that reads as the app breaking.
 */
export const NEVER_RELOAD_ROUTES = [
  '/lecture/record',
  '/lecture/new',
  '/onboarding',
  '/sign-in',
  '/settings/lms-connect',
] as const;

export function isProtectedRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return NEVER_RELOAD_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export interface UpdateDecision {
  apply: boolean;
  reason:
    | 'applying'
    | 'no-update-pending'
    | 'kill-switch-off'
    | 'protected-route'
    | 'unsafe-moment'
    | 'already-applied';
}

/**
 * Should the pending update be applied right now?
 *
 * `enabled` is the remote flag and is deliberately required to be TRUE. A
 * failed or missing read leaves it false, which falls back to exactly today's
 * two-launch behaviour — the safe direction for something whose failure mode
 * is restarting a student's app. It also means this ships inert and is turned
 * on remotely, without another release.
 */
export function decideUpdate(input: {
  isUpdatePending: boolean;
  enabled: boolean;
  moment: UpdateMoment;
  pathname?: string | null;
  alreadyAppliedThisSession: boolean;
}): UpdateDecision {
  if (input.alreadyAppliedThisSession) return { apply: false, reason: 'already-applied' };
  if (!input.enabled) return { apply: false, reason: 'kill-switch-off' };
  if (!input.isUpdatePending) return { apply: false, reason: 'no-update-pending' };
  if (input.moment === 'mid-session') return { apply: false, reason: 'unsafe-moment' };
  if (isProtectedRoute(input.pathname)) return { apply: false, reason: 'protected-route' };
  return { apply: true, reason: 'applying' };
}

/**
 * How long to wait for a first-time download before giving up and booting.
 *
 * Only spent on a cold start where nothing was pre-downloaded. Past this the
 * app carries on with the current bundle and the download finishes in the
 * background, so the worst case is today's behaviour rather than a student
 * staring at a splash screen on a train.
 */
export const FETCH_TIMEOUT_MS = 4000;

/** The app_promos key that arms this. Absent or inactive means do nothing. */
export const AUTO_UPDATE_FLAG_KEY = 'auto_update_reload';

/**
 * How long after mount a reload still counts as a "cold start".
 *
 * The remote flag is a network read. If it comes back slowly the student may
 * already be doing something, and restarting the app then is exactly the
 * interruption the moment rules exist to prevent. Past this window the attempt
 * is abandoned and the update waits for a resume, which costs at most one
 * visit and cannot surprise anyone.
 */
export const COLD_START_GRACE_MS = 6000;

/**
 * A brief pause between recording that an update was applied and applying it.
 *
 * track() does not await its insert and reloadAsync destroys the JS context,
 * so without this the ota_applied event can die in flight — and that event is
 * the only direct evidence adoption improved. Short enough to be invisible,
 * long enough for the request to leave.
 */
export const TRACK_FLUSH_MS = 400;
