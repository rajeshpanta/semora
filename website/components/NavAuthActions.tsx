'use client';

import { useEffect, useState } from 'react';
import { SignupButton } from './SignupButton';
import { APP_URL } from '@/lib/semora-facts';

/**
 * The right-hand end of the nav: either the signed-out CTAs, or a single way
 * back to the dashboard.
 *
 * A signed-in student who clicks Help & feedback in the app lands here and was
 * being shown "Sign in" and "Try it for free" — the words you show a stranger.
 * It reads as though they had been logged out and were being asked to sign up
 * again, which is a bad thing to imply to someone who is already paying.
 *
 * The site cannot tell: semoraai.com is a different origin from
 * app.semoraai.com, so the session is invisible to it. The app appends
 * `?from=app` on the way out and this reads it.
 *
 * ─── Why the default renders first ───
 * The signed-out CTAs are server-rendered and are what a crawler sees, which is
 * correct — a crawler is never "from the app", and these are the conversion
 * path for every other visitor. The swap happens after mount, and only for the
 * one visitor it applies to. Reading the flag in the page instead would opt
 * every marketing page out of static generation.
 */
export function NavAuthActions({
  signIn,
  tryFree,
  dashboard,
  ghostClassName,
  ctaClassName,
}: {
  signIn: string;
  tryFree: string;
  dashboard: string;
  ghostClassName?: string;
  ctaClassName?: string;
}) {
  const [fromApp, setFromApp] = useState(false);

  useEffect(() => {
    try {
      setFromApp(new URLSearchParams(window.location.search).get('from') === 'app');
    } catch {
      // A malformed query string is not a reason to break the header.
    }
  }, []);

  if (fromApp) {
    return (
      <a className={ctaClassName} href={APP_URL}>
        {dashboard} &rarr;
      </a>
    );
  }

  return (
    <>
      <SignupButton mode="signin" className={ghostClassName}>
        {signIn}
      </SignupButton>
      <SignupButton className={ctaClassName}>{tryFree}</SignupButton>
    </>
  );
}
