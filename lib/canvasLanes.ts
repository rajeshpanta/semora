import type { CanvasOffer } from '@/lib/canvasPromo';

/**
 * The Canvas funnel's vocabulary and routing decisions — pure, so they can be
 * tested without a device.
 *
 * ─── WHY THIS FILE EXISTS ───────────────────────────────────
 * Nine surfaces render a Canvas offer. Each one had its own idea of what to
 * report and where to send the student, and the measured result was a funnel
 * that could not be read:
 *
 *   canvas_offer_shown        0 events   — never written at all, so 53 taps had
 *                                          NO denominator: a card shown 60 times
 *                                          and one shown 10,000 times were
 *                                          indistinguishable.
 *   canvas_offer_tapped      53 events   — 30% carried a source.
 *   lms_connect_opened       27 events   — 11 of those sessions had no recorded
 *                                          tap at all, because four entry points
 *                                          fire nothing.
 *
 * Every one of those is the same underlying mistake: the vocabulary lived at
 * the call sites, so each new surface re-decided it and the answers drifted.
 * Adding a tenth surface should not be a chance to get it wrong again.
 *
 * Emission lives in lib/canvasFunnel.ts. This half holds only the decisions,
 * following canvasPromo.ts and reminderPlan.ts — the repo's existing split
 * between logic that can be reasoned about and code that touches the world.
 *
 * ─── LANES ──────────────────────────────────────────────────
 * A student tapping "Connect Canvas" and a student tapping "Finish Canvas
 * setup" are not in the same funnel, and averaging them hides both. The lane
 * says which journey this is, so each can be measured against its own goal:
 *
 *   connect — no working connection yet. Goal: a first import.
 *   repair  — connected and broken. Goal: syncing again.
 *   expand  — connected, healthy, holding classes back. Goal: import them.
 *
 * Derived from the offer rather than passed in, because the offer is already
 * the one place that decides what the student is being shown.
 */
export const CANVAS_LANES = ['connect', 'repair', 'expand'] as const;
export type CanvasLane = (typeof CANVAS_LANES)[number];

/**
 * The ordered steps of a lane. Every funnel event carries one, so a drop-off
 * is a `group by lane, step` rather than a join across six event names that
 * each mean something slightly different.
 */
export const CANVAS_STEPS = ['shown', 'tapped', 'opened', 'discovered', 'chosen', 'connected'] as const;
export type CanvasStep = (typeof CANVAS_STEPS)[number];

export function canvasLaneFor(offer: CanvasOffer): CanvasLane {
  if (offer === 'needs_attention') return 'repair';
  if (offer === 'new_courses') return 'expand';
  // 'none', 'locked' and 'healthy' all describe an account without a working
  // connection to expand or repair. 'healthy' should not be rendering an offer
  // at all, and if it somehow does, `connect` is the honest bucket.
  return 'connect';
}

// ── Where a tap actually goes ───────────────────────────────
//
// THE ROUTING LOSS. Every Canvas CTA sent the student to /settings/lms — the
// settings LIST — where they then had to find and tap the Canvas row to reach
// the connect screen. Measured over the aligned window: 49 sessions tapped a
// Canvas offer and 10 reached the connect screen. The list screen is a correct
// destination for someone managing an existing connection and a dead end for
// someone answering "Connect Canvas", which is what 80% of them were doing.
//
// Resolved here rather than at nine call sites because that is exactly how the
// nine drifted apart in the first place.
export type CanvasDestination =
  | { kind: 'route'; pathname: string; params: Record<string, string> }
  | { kind: 'upsell' };

export function canvasOfferDestination(offer: CanvasOffer, source: string): CanvasDestination {
  // Not allowed to connect yet: the upgrade sheet, not a screen they cannot use.
  if (offer === 'locked') return { kind: 'upsell' };

  // Classes waiting to be imported has its own screen and always did.
  if (offer === 'new_courses') {
    return { kind: 'route', pathname: '/settings/lms/new-courses', params: { source } };
  }

  // Something is wrong with a connection they already have. The list is the
  // right place: it holds the sync state, the reconnect button and the
  // per-connection screen, none of which the connect form has.
  if (offer === 'needs_attention') {
    return { kind: 'route', pathname: '/settings/lms', params: { source } };
  }

  // No connection yet — go straight to the form that makes one.
  return {
    kind: 'route',
    pathname: '/settings/lms-connect',
    params: { provider: 'canvas', source },
  };
}
