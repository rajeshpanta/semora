import { useEffect } from 'react';
import { trackCanvasOfferShown } from '@/lib/canvasFunnel';
import type { CanvasOffer } from '@/lib/canvasPromo';

/**
 * Records that a Canvas offer was actually put in front of the student.
 *
 * ─── WHY A COMPONENT AND NOT AN EFFECT ──────────────────────
 * The nine surfaces appear under conditions that are neither simple nor
 * co-located. Today's empty-state card, for instance, renders only when the
 * account has no semester, inside the seventh branch of the empty card, inside
 * the no-focus-tasks arm. Writing an effect with `if (thatWholeChain)` means
 * the visibility rule now exists in two places — and the day someone edits the
 * render and not the effect, the denominator silently stops matching the thing
 * it is a denominator FOR. That failure is invisible: the number still arrives,
 * it is just wrong.
 *
 * Rendering this inside the same JSX branch as the CTA makes that impossible.
 * There is no condition to duplicate: if the offer is on screen this mounted,
 * and if it is not, it did not. It draws nothing.
 *
 * De-duplication (once per session per screen+offer) lives in
 * trackCanvasOfferShown, so a tab the student flips back to does not inflate
 * reach with restlessness.
 */
export function CanvasOfferImpression({
  screen,
  offer,
  free,
  source,
}: {
  screen: string;
  offer: CanvasOffer;
  free: boolean;
  source: string;
}) {
  useEffect(() => {
    trackCanvasOfferShown({ screen, offer, free, source });
  }, [screen, offer, free, source]);
  return null;
}
