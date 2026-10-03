'use client';

import { useSyncExternalStore } from 'react';
import { APP_SIGNIN_URL, APP_SIGNUP_URL } from '@/lib/semora-facts';
import { appStoreCampaign, appStoreUrl, isAppleMobileDevice } from '@/lib/appStore';
import { report, TELEMETRY_EVENTS } from '@/lib/telemetry';

/**
 * A direct link to the app's single authentication screen. Sign-in and signup
 * remain separate intents, but the marketing site no longer inserts another
 * provider chooser before the real app auth UI.
 *
 * On an iPhone or iPad, a signup button opens the App Store instead. A phone
 * visitor sent to the web app got the weaker version of Semora and never heard
 * the iPhone app exists: in the week measured on 2026-10-01, all 9 web signups
 * came from desktop computers and none from a phone browser. Sign-in stays on
 * the web for everyone (it is account access, not a first try), and so does a
 * button that carries a chosen plan (`plan`), because that visitor is on their
 * way to checkout.
 */
/** The device never changes while the page is open, so there is nothing to subscribe to. */
function subscribeNever(): () => void {
  return () => {};
}

export function SignupButton({
  children,
  className,
  mode = 'signup',
  onClick,
  placement,
  plan,
}: {
  children: React.ReactNode;
  className?: string;
  mode?: 'signup' | 'signin';
  /** Runs before navigation — e.g. dismissing the mobile nav sheet. */
  onClick?: () => void;
  /**
   * Where on the page this button sits: 'hero', 'footer', 'nav', 'pricing'.
   * Without it every CTA reports identically, so a hero that nobody presses
   * and a footer link that carries the whole funnel are the same number.
   */
  placement?: string;
  /**
   * A plan chosen on the pricing page. The app parks it through sign-in and
   * opens checkout with it selected the moment the account exists (the app's
   * lib/pendingPlan.ts), instead of dropping the student on Today.
   */
  plan?: 'annual' | 'monthly';
}) {
  const webHref = mode === 'signin'
    ? APP_SIGNIN_URL
    : plan ? `${APP_SIGNUP_URL}?plan=${plan}` : APP_SIGNUP_URL;
  const opensAppStore = mode === 'signup' && !plan;

  // The server cannot see the device, so it renders the web link and the
  // browser swaps in the App Store link once hydrated (the server snapshot is
  // what hydration matches against; the client snapshot follows right after).
  const appleMobile = useSyncExternalStore(subscribeNever, isAppleMobileDevice, () => false);
  const toAppStore = opensAppStore && appleMobile;

  const storeHref = appStoreUrl(placement ?? 'signup');
  const href = toAppStore ? storeHref : webHref;

  return (
    <a
      href={href}
      className={className}
      data-cta-placement={placement}
      data-self-reported=""
      onClick={(event) => {
        // A tap that lands before the effect above has run still goes to the
        // App Store on an Apple device.
        const appStore = toAppStore || (opensAppStore && isAppleMobileDevice());
        // Every CTA on the site funnels through here, so this one call answers
        // which page actually drives signups. Reported before the caller's own
        // handler so a handler that throws cannot swallow the event.
        // One event, not two: an App Store tap is reported as app_store_click
        // and a web signup as signup_click, never both for the same click.
        if (appStore) {
          report(TELEMETRY_EVENTS.appStoreClick, { via: 'signup_button', placement: placement ?? 'signup', ct: appStoreCampaign(placement ?? 'signup') });
        } else {
          report(TELEMETRY_EVENTS.signupClick, {
            mode,
            ...(placement ? { placement } : {}),
            ...(plan ? { plan } : {}),
          });
        }
        onClick?.();
        if (appStore && !toAppStore) {
          event.preventDefault();
          window.location.assign(storeHref);
        }
      }}
    >
      {children}
    </a>
  );
}
