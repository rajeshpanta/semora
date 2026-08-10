'use client';

import { APP_SIGNIN_URL, APP_SIGNUP_URL } from '@/lib/semora-facts';

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
      onClick={onClick}
    >
      {children}
    </a>
  );
}
