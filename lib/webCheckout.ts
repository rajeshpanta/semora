import { Linking, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

/**
 * The escape hatch for a student the App Store will not take money from.
 *
 * Some purchases fail for reasons the app can neither see nor fix: no payment
 * method on the Apple ID, a restricted or school-managed device, a storefront
 * the product is not sold in, parental controls. StoreKit reports all of them
 * as the single generic code `purchase-error`. Before this existed the student
 * simply could not buy Pro, and we could not tell them why or offer them
 * anything else — one tried eleven times in thirty-four minutes and gave up.
 *
 * Stripe is a completely independent rail. It writes the SAME entitlements row
 * that iOS reads (see supabase/functions/stripe-webhook), so a subscription
 * bought here unlocks Pro on the iPhone as soon as the webhook lands — there is
 * nothing to restore and no second account.
 *
 * NOTE ON APP REVIEW: linking out to an external purchase is permitted on the
 * US storefront following the 2025 anti-steering injunction, and remains
 * restricted elsewhere. This is deliberately not a payment button on the
 * paywall — it appears only after repeated StoreKit failures, as a way to
 * recover a sale that has already demonstrably failed. Set
 * WEB_CHECKOUT_FALLBACK_ENABLED to false to remove it entirely.
 */
export const WEB_CHECKOUT_FALLBACK_ENABLED = true;

/** How many consecutive StoreKit failures before we offer the other rail. */
export const WEB_FALLBACK_AFTER_FAILURES = 2;

export type WebCheckoutResult =
  | { ok: true }
  | { ok: false; message: string; code?: string };

/**
 * Open Stripe Checkout for `plan` in a browser the student returns from.
 *
 * Reuses the same `stripe-checkout` edge function the website uses, so there is
 * one checkout implementation and one place prices can be wrong.
 */
export async function openWebCheckout(
  plan: 'annual' | 'monthly',
  context: string,
): Promise<WebCheckoutResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { ok: false, message: 'Please sign in before subscribing.', code: 'NOT_SIGNED_IN' };
  }

  const { data, error } = await supabase.functions.invoke('stripe-checkout', { body: { plan } });

  if (error) {
    // supabase-js hides the body on non-2xx; dig out the real reason so
    // "you already have Pro" cannot surface as a generic edge-function error.
    const ctx = (error as { context?: Response }).context;
    let payload: { error?: string; code?: string } | null = null;
    try { payload = ctx ? await ctx.json() : null; } catch { /* body already consumed */ }
    return {
      ok: false,
      message: payload?.error ?? 'Could not open web checkout. Please try again.',
      code: payload?.code ?? 'CHECKOUT_FAILED',
    };
  }

  const url = (data as { url?: string })?.url;
  if (!url) return { ok: false, message: 'Could not open web checkout. Please try again.', code: 'NO_CHECKOUT_URL' };

  track('web_checkout_opened', { plan, context, from: Platform.OS });

  // Prefer the in-app browser: the student stays inside Semora and returns to
  // the paywall on dismiss, where the existing ?checkout= / claimPendingCheckout
  // path picks the result up.
  //
  // Loaded lazily and guarded, because this file has to survive being shipped
  // over-the-air. expo-web-browser is autolinked into the binary rather than
  // declared in package.json, and an OTA update cannot add native code — so a
  // hard import would turn "your card was declined" into a crash on any build
  // that happens not to include the module. Linking is core React Native and
  // always present; handing off to Safari is a worse experience than the sheet
  // and an infinitely better one than a dead button.
  try {
    const WebBrowser = require('expo-web-browser');
    if (WebBrowser?.openBrowserAsync) {
      await WebBrowser.openBrowserAsync(url, { dismissButtonStyle: 'done' });
      return { ok: true };
    }
  } catch {
    // fall through to the system browser
  }
  await Linking.openURL(url);
  return { ok: true };
}
