/**
 * Moments when Semora must not ask for a rating.
 *
 * The rule was always there and never once fired. `decideReviewAsk` took a
 * `paywallShownThisSession` flag built like this in the Today tab:
 *
 *   const ahaPaywallShownAtMount = useRef(ahaPaywallShown);          // lifetime flag
 *   paywallShownThisSession: s.ahaPaywallShown && !ahaPaywallShownAtMount.current
 *
 * `ahaPaywallShown` is a device-lifetime flag read from the keychain at start,
 * so on any device that had ever seen the post-scan paywall the snapshot was
 * already true and the expression was `true && !true` — false, permanently. On
 * a device that had NOT seen it, the flag is written in the same block that
 * stamps the import day, so the day gate refused the ask that session anyway.
 * The guard could not change an outcome in either direction.
 *
 * What it was supposed to prevent is in the data: four native prompts fired
 * between 0.2 and 2.4 seconds AFTER `purchase_success`, and nine landed in the
 * same tick as the Pro Canvas sheet — a full-screen modal, which is also the
 * state in which iOS quietly declines to draw the review sheet and the app
 * spends its one lifetime request on nothing. Semora has a 1-star and a 2-star
 * rating; asking for stars in the second after taking someone's money is how
 * those are earned.
 *
 * So the signal is now a real one: anything that discusses money stamps a
 * timestamp, and the gate stays quiet for ten minutes afterwards. A timestamp
 * rather than a session flag, because "this sitting" is what matters and a JS
 * session can be rotated by an over-the-air reload mid-sitting.
 */

/** How long a rating ask waits after money is discussed. */
export const RATING_QUIET_MS = 10 * 60 * 1000;

/** What was on screen. Recorded for the event, not used by the rule. */
export type MoneyMoment = 'paywall' | 'pro_sheet' | 'purchase';

/** Pure half: `lastAt` null means money has not come up this run. */
export function isQuiet(lastAt: number | null, nowMs: number, windowMs = RATING_QUIET_MS): boolean {
  if (lastAt === null) return false;
  // A clock that jumped backwards would otherwise open the quiet window
  // forever; treat any non-positive gap as "just happened".
  const elapsed = nowMs - lastAt;
  if (elapsed < 0) return true;
  return elapsed < windowMs;
}

let lastMoneyAt: number | null = null;
let lastMoneyKind: MoneyMoment | null = null;

/**
 * Called wherever Semora asks for or takes money: the paywall screen, the Pro
 * education sheet, a completed purchase. Deliberately cheap and synchronous —
 * it is on the path of a screen that is already rendering.
 */
export function noteMoneyMoment(kind: MoneyMoment, nowMs: number = Date.now()): void {
  lastMoneyAt = nowMs;
  lastMoneyKind = kind;
}

export function moneyJustDiscussed(nowMs: number = Date.now()): boolean {
  return isQuiet(lastMoneyAt, nowMs);
}

/** For the rating events, so "we stayed quiet" is visible in the data. */
export function lastMoneyMoment(): MoneyMoment | null {
  return lastMoneyKind;
}

/** Tests only: there is no product reason to forget a money moment. */
export function resetMoneyMomentForTests(): void {
  lastMoneyAt = null;
  lastMoneyKind = null;
}
