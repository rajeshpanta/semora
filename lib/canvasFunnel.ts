import { track, peekSessionId } from '@/lib/analytics';
import type { CanvasOfferFacts } from '@/lib/canvasLanes';
import { canvasFunnelPayload } from '@/lib/canvasLanes';


/**
 * Emission for the Canvas funnel. The decisions it reports — which lane an
 * offer belongs to, and where a tap should go — live in lib/canvasLanes.ts so
 * they can be tested without a device; this half only puts them on the wire.
 *
 * Re-exported below so a surface imports one module, not two.
 */
export {
  CANVAS_LANES, CANVAS_STEPS, canvasLaneFor, canvasOfferDestination, canvasFunnelPayload,
} from '@/lib/canvasLanes';
export type { CanvasLane, CanvasStep, CanvasDestination, CanvasOfferFacts } from '@/lib/canvasLanes';

// ── Impression de-duplication ───────────────────────────────
//
// A tab the student switches away from and back to re-renders, and Today
// re-renders on every task change. Firing on each would make the denominator
// grow with restlessness rather than with reach, which is worse than having no
// denominator at all — it would look like a number and mean nothing.
//
// So an impression is counted ONCE per session per (screen, offer): the same
// grain the tap side already reports, which is what lets the two divide.
// Keyed by session rather than by mount so it survives remounts, and reset
// when the session rotates so the next sitting counts again.
//
// peekSessionId deliberately does not rotate a stale session (rotating without
// stamping lastEventAt would make the next real event rotate a second time).
// In practice noteAppForegrounded() has already rotated by the time a student
// is looking at anything, so the set is reset before the first impression of a
// new sitting. The one uncovered case — the app foregrounded and completely
// silent for over thirty minutes, then an offer appears — suppresses one
// impression. Worth naming rather than pretending it cannot happen.
let impressionSession = '';
const seenThisSession = new Set<string>();

export function trackCanvasOfferShown(facts: CanvasOfferFacts): void {
  const session = peekSessionId();
  if (session !== impressionSession) {
    impressionSession = session;
    seenThisSession.clear();
  }
  const key = `${facts.screen}:${facts.offer}`;
  if (seenThisSession.has(key)) return;
  seenThisSession.add(key);
  track('canvas_offer_shown', canvasFunnelPayload(facts, 'shown'));
}

/** Test seam. Never call this from app code. */
export function resetCanvasImpressionsForTest(): void {
  impressionSession = '';
  seenThisSession.clear();
}

export function trackCanvasOfferTapped(facts: CanvasOfferFacts, extra?: Record<string, any>): void {
  track('canvas_offer_tapped', canvasFunnelPayload(facts, 'tapped', extra));
}

