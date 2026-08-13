'use client';

import { APP_SIGNIN_URL, APP_SIGNUP_URL } from '@/lib/semora-facts';
import { report, TELEMETRY_EVENTS } from '@/lib/telemetry';

/**
 * A direct link to the app's single authentication screen. Sign-in and signup
 * remain separate intents, but the marketing site no longer inserts another
 * provider chooser before the real app auth UI.
 */
export function SignupButton({
  children,
  className,
  mode = 'signup',
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  mode?: 'signup' | 'signin';
  /** Runs before navigation — e.g. dismissing the mobile nav sheet. */
  onClick?: () => void;
}) {
  const href = mode === 'signin' ? APP_SIGNIN_URL : APP_SIGNUP_URL;

  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        // Every CTA on the site funnels through here, so this one call answers
        // which page actually drives signups. Reported before the caller's own
        // handler so a handler that throws cannot swallow the event.
        report(TELEMETRY_EVENTS.signupClick, { mode });
        onClick?.();
      }}
    >
      {children}
    </a>
  );
}
