'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import styles from './AuthDialog.module.css';
import { APP_URL } from '@/lib/semora-facts';
import type { SiteLocale } from '@/lib/i18n';

/**
 * Sign-in as a dialog over the page instead of a jump to another domain.
 *
 * Every CTA used to hard-navigate to app.semoraai.com/sign-in. That works, but
 * it throws a visitor who has not decided anything yet into a differently
 * styled place on a different domain, and the only way back is the browser
 * button. Keeping the marketing page behind a blurred backdrop means the
 * decision happens where the context is.
 *
 * The provider buttons open the app's dedicated OAuth launcher. It starts the
 * provider flow immediately and keeps the PKCE verifier on app.semoraai.com,
 * so the visitor never has to choose the same provider a second time.
 *
 * Rendered as a native <dialog>: focus trapping, Esc-to-close and inertness of
 * the page behind it are the platform's job, not ours.
 */

type Mode = 'signup' | 'signin';

const AuthDialogContext = createContext<{ open: (mode: Mode) => void } | null>(null);

export function useAuthDialog() {
  return useContext(AuthDialogContext);
}

const COPY: Record<Mode, { title: string; sub: string }> = {
  signup: {
    title: 'Get started',
    sub: 'Create your account and scan your first syllabus. Free, no credit card.',
  },
  signin: {
    title: 'Welcome back',
    sub: 'Sign in to pick up where you left off.',
  },
};

export function AuthDialogProvider({ children, locale = 'en' }: { children: React.ReactNode; locale?: SiteLocale }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [mode, setMode] = useState<Mode>('signup');

  const open = useCallback((next: Mode) => {
    setMode(next);
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  // The backdrop is the dialog's own box, so a click lands on <dialog> itself
  // only when it missed the panel inside it.
  const onClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === ref.current) ref.current?.close();
  };

  // showModal() blocks scroll on the dialog but not on the page behind it.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      document.body.style.overflow = el.open ? 'hidden' : '';
    };
    el.addEventListener('close', sync);
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ['open'] });
    return () => {
      el.removeEventListener('close', sync);
      mo.disconnect();
      document.body.style.overflow = '';
    };
  }, []);

  const copy = locale === 'es'
    ? mode === 'signup'
      ? { title: 'Empieza gratis', sub: 'Crea tu cuenta y organiza tu primera materia. No necesitas tarjeta de crédito.' }
      : { title: 'Qué bueno verte de nuevo', sub: 'Inicia sesión y continúa donde lo dejaste.' }
    : COPY[mode];
  const labels = locale === 'es'
    ? {
        close: 'Cerrar', apple: 'Continuar con Apple', google: 'Continuar con Google',
        prefix: 'Al continuar, aceptas los', terms: 'Términos de servicio', and: 'y la', privacy: 'Política de privacidad',
        termsHref: '/es/terminos', privacyHref: '/es/privacidad',
      }
    : {
        close: 'Close', apple: 'Continue with Apple', google: 'Continue with Google',
        prefix: 'By continuing you agree to our', terms: 'Terms', and: 'and', privacy: 'Privacy Policy',
        termsHref: '/terms', privacyHref: '/privacy',
      };

  return (
    <AuthDialogContext.Provider value={{ open }}>
      {children}
      <dialog ref={ref} className={styles.dialog} onClick={onClick} aria-labelledby="auth-dialog-title">
        <div className={styles.panel}>
          <button
            type="button"
            className={styles.close}
            onClick={() => ref.current?.close()}
            aria-label={labels.close}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>

          <h2 className={styles.title} id="auth-dialog-title">
            {copy.title}
          </h2>
          <p className={styles.sub}>{copy.sub}</p>

          <a className={styles.apple} href={`${APP_URL}/oauth?provider=apple`}>
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="currentColor">
              <path d="M16.36 12.78c.02 2.5 2.2 3.33 2.22 3.34-.02.06-.35 1.2-1.15 2.37-.69 1.02-1.4 2.03-2.53 2.05-1.11.02-1.47-.65-2.73-.65-1.27 0-1.67.63-2.72.67-1.09.04-1.92-1.1-2.62-2.11-1.42-2.07-2.51-5.85-1.05-8.4.73-1.27 2.02-2.07 3.43-2.09 1.07-.02 2.08.72 2.73.72.66 0 1.88-.89 3.17-.76.54.02 2.06.22 3.03 1.64-.08.05-1.81 1.06-1.79 3.16M14.3 5.1c.58-.7.97-1.67.86-2.64-.83.03-1.84.55-2.44 1.25-.53.62-1 1.61-.87 2.56.93.07 1.87-.47 2.45-1.17" />
            </svg>
            {labels.apple}
          </a>

          <a className={styles.google} href={`${APP_URL}/oauth?provider=google`}>
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              <path fill="#4285F4" d="M23 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.16a5.27 5.27 0 0 1-2.29 3.46v2.87h3.71C21.74 18.66 23 15.76 23 12.27" />
              <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1.03 7.6-2.79l-3.72-2.87c-1.03.69-2.35 1.1-3.88 1.1-2.99 0-5.52-2.02-6.42-4.73H1.73v2.97A11.49 11.49 0 0 0 12 23.5" />
              <path fill="#FBBC05" d="M5.58 14.21a6.9 6.9 0 0 1 0-4.41V6.83H1.73a11.5 11.5 0 0 0 0 10.34l3.85-2.96" />
              <path fill="#EA4335" d="M12 5.07c1.69 0 3.2.58 4.4 1.72l3.29-3.29C17.7 1.63 15.1.5 12 .5A11.49 11.49 0 0 0 1.73 6.83l3.85 2.97C6.48 7.09 9.01 5.07 12 5.07" />
            </svg>
            {labels.google}
          </a>

          <p className={styles.legal}>
            {labels.prefix} <a href={labels.termsHref}>{labels.terms}</a> {labels.and}{' '}
            <a href={labels.privacyHref}>{labels.privacy}</a>.
          </p>
        </div>
      </dialog>
    </AuthDialogContext.Provider>
  );
}
