/**
 * When to tell a paying subscriber that Canvas Sync is already theirs.
 *
 * Two thirds of active Pro accounts have never connected Canvas — 37 of 55 at
 * the time this was written — while Pro accounts that HAVE connected are the
 * most engaged cohort in the product by a wide margin. Those 37 are not being
 * sold anything; they are paying for a feature they have not found.
 *
 * That framing decides everything here. This is not a wall, not an upsell and
 * not a trial: it is a one-off piece of education with a hard stop. It may
 * appear at most twice in the lifetime of an account, a week apart, and then
 * never again — because the third showing of anything is where "helpful"
 * becomes "nagging", and a subscriber who has already declined twice has
 * answered the question.
 *
 * No dependencies, for the same reason lib/canvasPromo.ts has none: the rules
 * that decide whether to interrupt a paying customer are exactly the rules that
 * should be provable by a unit test rather than by reading a render tree.
 */

/**
 * The attribution token this flow carries into the Canvas connect funnel.
 *
 * Deliberately NOT 'scan_upsell'. That token belongs to the Phase 1 free
 * scan-wall experiment, whose whole purpose is measuring whether free students
 * convert — mixing paying subscribers into it would quietly corrupt the one
 * number that experiment exists to produce. Distinct token, distinct cohort,
 * and canvasSourceOf() accepts it unchanged (lowercase, underscores, ≤32).
 */
export const PRO_CANVAS_EDU_SOURCE = 'pro_canvas_education';

/**
 * The app_promos key that gates this whole experience.
 *
 * Deliberately NOT canvas_free. That row governs the free-tier Canvas
 * promotion and the grandfathering that goes with it; entangling a paying
 * subscriber's education modal with it would mean one switch could not be
 * thrown without moving the other.
 */
export const PRO_CANVAS_EDU_FLAG_KEY = 'pro_canvas_education';

/** At most two appearances, ever. See the module note. */
export const MAX_SHOWS = 2;

/** A full week between the first and second. Long enough to be a new thought. */
export const COOLDOWN_DAYS = 7;

export interface ProCanvasEduState {
  /** How many times the sheet has actually been presented. */
  shows: number;
  /** ISO timestamp of the most recent presentation, or null. */
  lastShownAt: string | null;
  /** Terminal. Set by a second dismissal, or by ever observing a connection. */
  dismissedForever: boolean;
}

export const INITIAL_STATE: ProCanvasEduState = {
  shows: 0,
  lastShownAt: null,
  dismissedForever: false,
};

/**
 * Read persisted state.
 *
 * Fails toward SILENCE, not toward showing. Every other "did we already ask
 * this?" gate in the app fails toward asking again, because the cost of a
 * missed consent prompt is worse than a repeat. Here the cost runs the other
 * way: the failure mode of showing again is interrupting someone who already
 * paid and already said no, which is the exact experience this feature exists
 * to avoid. Corrupt state therefore means "leave them alone".
 */
export function parseProCanvasEduState(raw: string | null | undefined): ProCanvasEduState {
  if (!raw) return INITIAL_STATE;
  try {
    const parsed = JSON.parse(raw) as Partial<ProCanvasEduState>;
    const shows = Number(parsed?.shows);
    return {
      shows: Number.isFinite(shows) && shows >= 0 ? Math.floor(shows) : MAX_SHOWS,
      lastShownAt: typeof parsed?.lastShownAt === 'string' ? parsed.lastShownAt : null,
      dismissedForever: parsed?.dismissedForever === true,
    };
  } catch {
    return { shows: MAX_SHOWS, lastShownAt: null, dismissedForever: true };
  }
}

export function serializeProCanvasEduState(state: ProCanvasEduState): string {
  return JSON.stringify(state);
}

export interface ProCanvasEduInput {
  /**
   * The remote kill switch — app_promos.pro_canvas_education, read through the
   * same promo_active() RPC that already gates the free Canvas offer.
   *
   * `undefined` means the read has not landed (or failed). Treated exactly like
   * "off": the whole point of a kill switch is that the OFF position is the one
   * that cannot be reached by accident, so a slow network, a failed RPC and a
   * deliberate shutdown all produce silence rather than a modal.
   *
   * Independent of canvas_free by construction — a different key, a different
   * query, and neither can switch the other.
   */
  flagActive: boolean | undefined;
  /** The client's Pro answer. `undefined` means "not resolved yet". */
  isPro: boolean | undefined;
  /** Has the LMS connection list actually come back? */
  connectionsLoaded: boolean;
  /** Does this account hold ANY LMS connection, healthy or not? */
  hasAnyConnection: boolean;
  state: ProCanvasEduState;
  /** Milliseconds since epoch. Passed in so the rule is testable. */
  now: number;
}

/**
 * Should the education sheet be presented right now?
 *
 * Every branch below returns false for a reason worth stating:
 *
 *   isPro !== true        Free accounts have their own Canvas paths, including
 *                         the Phase 1 promotion. Showing "included with Pro" to
 *                         someone without Pro is an advert, which this is not.
 *                         `undefined` (unresolved) is treated as not-Pro — the
 *                         same fail-closed rule that stopped canvasOfferFor
 *                         from pricing a free feature during a loading window.
 *   !connectionsLoaded    Until the list is back we cannot know whether they
 *                         already have Canvas, and telling an existing user to
 *                         "connect Canvas" is the single most embarrassing way
 *                         this could fail.
 *   hasAnyConnection      ANY connection, not just a healthy one. A student
 *                         whose sync is broken has already found the feature;
 *                         what they need is the "Finish Canvas setup" affordance
 *                         that already exists, not an introduction to something
 *                         they are using.
 *   dismissedForever      Terminal, and also how a disconnect is prevented from
 *                         restarting the cycle.
 *   shows >= MAX_SHOWS    Belt and braces alongside dismissedForever.
 *   cooldown              A week between the two, measured from the last
 *                         presentation.
 */
export function shouldShowProCanvasEducation(input: ProCanvasEduInput): boolean {
  const { flagActive, isPro, connectionsLoaded, hasAnyConnection, state, now } = input;

  // Checked FIRST, before anything else can matter. Turning the row off in
  // app_promos silences this everywhere, on builds already on phones, without
  // an OTA — and without touching a single byte of dismissal state, so flipping
  // it back on later resumes exactly where each student left off.
  if (flagActive !== true) return false;
  if (isPro !== true) return false;
  if (!connectionsLoaded) return false;
  if (hasAnyConnection) return false;
  if (state.dismissedForever) return false;
  if (state.shows >= MAX_SHOWS) return false;
  if (state.shows === 0) return true;

  // Second showing: only once a full week has passed. A missing or unparseable
  // timestamp means we cannot prove the cooldown elapsed, so it has not.
  if (!state.lastShownAt) return false;
  const last = Date.parse(state.lastShownAt);
  if (!Number.isFinite(last)) return false;
  return now - last >= COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
}

/** Record that the sheet was presented. */
export function recordShown(state: ProCanvasEduState, nowIso: string): ProCanvasEduState {
  return { ...state, shows: state.shows + 1, lastShownAt: nowIso };
}

/**
 * Record a "Not now".
 *
 * The second dismissal is terminal. Note this reads `shows`, which has already
 * been incremented by recordShown — so after the second presentation is
 * declined, shows is 2 and the flow ends here permanently.
 */
export function recordDismissed(state: ProCanvasEduState): ProCanvasEduState {
  return state.shows >= MAX_SHOWS ? { ...state, dismissedForever: true } : state;
}

/**
 * Record that this account has Canvas connected.
 *
 * Terminal, and deliberately not reversible. If a student later disconnects,
 * the prompt must not come back: they know the feature exists, and an app that
 * re-introduces something the moment you stop using it is the definition of
 * nagging. Re-discovery is left to the Canvas affordances that already live on
 * the scan screen, the courses tab and the empty Today state.
 */
export function recordConnected(state: ProCanvasEduState): ProCanvasEduState {
  return state.dismissedForever ? state : { ...state, dismissedForever: true };
}

/** Account-scoped, mirroring the lecture-consent gate: a second student signing
 *  into the same phone gets their own answer, and the key is namespaced so a
 *  future revision can invalidate it without touching anything else. */
export function proCanvasEduStorageKey(userId: string): string {
  return `semora_pro_canvas_edu_v1:${userId}`;
}
