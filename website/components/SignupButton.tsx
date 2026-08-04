'use client';

import { APP_SIGNIN_URL, APP_SIGNUP_URL } from '@/lib/semora-facts';
import { useAuthDialog } from './AuthDialog';

/**
 * A CTA that opens the auth dialog instead of leaving the site.
 *
 * Deliberately still an <a> with a real href: crawlers see a link to the app,
 * and a visitor with JS off (or with the provider not yet mounted) gets the old
 * navigation rather than a dead button. The dialog is the enhancement, not the
 * mechanism.
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
  /** Runs before the dialog opens — e.g. dismissing the mobile nav sheet. */
  onClick?: () => void;
}) {
  const dialog = useAuthDialog();
  const href = mode === 'signin' ? APP_SIGNIN_URL : APP_SIGNUP_URL;

  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        onClick?.();
        if (!dialog) return;
        // Let modified clicks (new tab, download, middle-click) behave normally.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        dialog.open(mode);
      }}
    >
      {children}
    </a>
  );
}
