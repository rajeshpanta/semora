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
 * Apple opens the app's dedicated OAuth launcher. Google is rendered by the
 * official GIS button inside an app.semoraai.com iframe, so the authorized
 * origin owns the ID-token exchange without making the visitor cross an extra
 * account page first.
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
  const googleFrameRef = useRef<HTMLIFrameElement>(null);
  const googleCompletionHandled = useRef(false);
  const [mode, setMode] = useState<Mode>('signup');
  const [isOpen, setIsOpen] = useState(false);
  const [googleError, setGoogleError] = useState('');
  const [completing, setCompleting] = useState(false);

  const open = useCallback((next: Mode) => {
    googleCompletionHandled.current = false;
    setGoogleError('');
    setCompleting(false);
    setMode(next);
    setIsOpen(true);
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
      setIsOpen(el.open);
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

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== APP_URL) return;
      if (event.source !== googleFrameRef.current?.contentWindow) return;
      if (!event.data || typeof event.data !== 'object') return;

      if (event.data.type === 'semora-google-auth-error') {
        if (googleCompletionHandled.current) return;
        setGoogleError(locale === 'es'
          ? 'No se pudo completar el acceso con Google. Inténtalo de nuevo.'
          : 'Google sign-in could not finish. Please try again.');
        return;
      }

      if (event.data.type !== 'semora-google-auth-success' || googleCompletionHandled.current) return;
      googleCompletionHandled.current = true;
      setCompleting(true);
      // Replace the completed marketing-modal history entry. If it remains in
      // history, Back restores its signed-in iframe, which immediately sends
      // another success message and bounces the user into the app again.
      window.location.replace(APP_URL);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [locale]);

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
            disabled={completing}
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

          {completing ? (
            <div className={styles.finishing} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <span>{locale === 'es' ? 'Abriendo Semora…' : 'Opening Semora…'}</span>
            </div>
          ) : (
            <>
              <a className={styles.apple} href={`${APP_URL}/oauth?provider=apple`}>
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="currentColor">
                  <path d="M16.36 12.78c.02 2.5 2.2 3.33 2.22 3.34-.02.06-.35 1.2-1.15 2.37-.69 1.02-1.4 2.03-2.53 2.05-1.11.02-1.47-.65-2.73-.65-1.27 0-1.67.63-2.72.67-1.09.04-1.92-1.1-2.62-2.11-1.42-2.07-2.51-5.85-1.05-8.4.73-1.27 2.02-2.07 3.43-2.09 1.07-.02 2.08.72 2.73.72.66 0 1.88-.89 3.17-.76.54.02 2.06.22 3.03 1.64-.08.05-1.81 1.06-1.79 3.16M14.3 5.1c.58-.7.97-1.67.86-2.64-.83.03-1.84.55-2.44 1.25-.53.62-1 1.61-.87 2.56.93.07 1.87-.47 2.45-1.17" />
                </svg>
                {labels.apple}
              </a>

              {isOpen ? (
                <iframe
                  ref={googleFrameRef}
                  className={styles.googleFrame}
                  src={`${APP_URL}/oauth?provider=google&embed=1&mode=${mode}`}
                  title={labels.google}
                  allow="identity-credentials-get"
                />
              ) : null}

              {googleError ? (
                <p className={styles.googleError} role="alert">{googleError}</p>
              ) : null}
            </>
          )}

          <p className={styles.legal}>
            {labels.prefix} <a href={labels.termsHref}>{labels.terms}</a> {labels.and}{' '}
            <a href={labels.privacyHref}>{labels.privacy}</a>.
          </p>
        </div>
      </dialog>
    </AuthDialogContext.Provider>
  );
}
