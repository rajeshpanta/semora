import { Platform } from 'react-native';
import { getServerEntitlement } from '@/lib/entitlementServer';
import { track } from '@/lib/analytics';

/**
 * Finishing a Stripe purchase after the tab has been away.
 *
 * Stripe Checkout navigates the whole tab off-site and sends it back to
 * `/paywall?checkout=success`. The paywall screen has always had a handler for
 * that, and in production it has never once completed. This is what happens
 * instead:
 *
 *   1. the tab returns as a COLD BOOT — new document, no React state
 *   2. Supabase restores the session asynchronously, so for the first frames
 *      the app believes nobody is signed in
 *   3. the auth gate in app/_layout.tsx redirects a signed-out visitor away
 *   4. the paywall unmounts, its effect's cleanup sets `cancelled = true`, and
 *      the entitlement poll it had just started is abandoned in silence
 *
 * The evidence is a real customer on 2026-08-20: entitlement written 19:16:55,
 * paywall mounted 19:16:58, no purchase_success ever recorded — and then three
 * more "Continue" taps at 19:18:07, :12 and :19, each answered by
 * stripe-checkout with 409 ALREADY_PRO. They had paid, the app kept showing
 * them the paywall, and they kept trying to buy it again.
 *
 * So the completion cannot live on a screen. It lives here: a note written
 * before leaving for Stripe, read back at the root once a session exists,
 * retried until the webhook lands, and cleared only when it is done. Redirects,
 * remounts and route changes cannot interrupt something that is not attached to
 * a route.
 */

const PENDING_KEY = 'semora_pending_checkout';

/** Milliseconds after which a stashed checkout is assumed abandoned. */
const STALE_AFTER_MS = 30 * 60 * 1000;

interface PendingCheckout {
  plan: string;
  at: number;
}

function read(): PendingCheckout | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingCheckout;
    if (typeof parsed?.at !== 'number') return null;
    // A note left weeks ago is not a purchase in progress. Without this a
    // single abandoned checkout would poll on every launch forever.
    if (Date.now() - parsed.at > STALE_AFTER_MS) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Called immediately before the tab leaves for Stripe. */
export function markCheckoutStarted(plan: string): void {
  try {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
    localStorage.setItem(PENDING_KEY, JSON.stringify({ plan, at: Date.now() }));
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). The paywall's
    // own ?checkout=success handler still covers the common case; this is the
    // belt to its braces, not the only path.
  }
}

export function clearPendingCheckout(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(PENDING_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function hasPendingCheckout(): boolean {
  return read() !== null;
}

/**
 * Take ownership of the pending checkout, if it is still going.
 *
 * Read-and-remove in one step so exactly one completion path records the sale.
 * Two of them can run: the paywall's own ?checkout=success handler when it
 * survives the boot, and the root resolver when it does not. Both finishing
 * would put two purchase_success rows against one payment, which is a worse
 * revenue number than the zero we started with — an undercount invites a look,
 * an overcount gets believed.
 */
export function claimPendingCheckout(): boolean {
  const pending = read();
  if (!pending) return false;
  clearPendingCheckout();
  return true;
}

/**
 * Resolve a checkout the tab left to complete.
 *
 * Returns true once Pro is confirmed. Polls because the entitlement is written
 * by the stripe-webhook function, not by the redirect — the row usually exists
 * within a second, but "usually" is what left a paying customer staring at a
 * paywall.
 *
 * `onPro` applies the entitlement to the app's own state; this module does not
 * import the store, so it stays usable from anywhere without a cycle.
 */
export async function resolvePendingCheckout(
  onPro: (plan: 'monthly' | 'annual' | null) => void,
): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  const pending = read();
  if (!pending) return false;

  for (let attempt = 0; attempt < 14; attempt++) {
    const entitlement = await getServerEntitlement();
    if (entitlement.is_pro) {
      onPro(entitlement.plan);
      // Someone else may have finished first while this was polling.
      if (!claimPendingCheckout()) return true;
      // The event the revenue dashboard has been missing. Fired here rather
      // than on the paywall so it survives whatever screen the redirect
      // happened to land on.
      track('purchase_success', {
        screen: 'checkout_return',
        context: 'stripe_web',
        plan: entitlement.plan ?? pending.plan,
      });
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt < 4 ? 900 : 2000));
  }

  // Out of patience, not out of luck: the card may well have been charged and
  // the webhook merely slow. The note is LEFT IN PLACE so the next launch tries
  // again, and nothing here tells the student their payment failed.
  track('purchase_confirmation_slow', { context: 'stripe_web', plan: pending.plan });
  return false;
}
