'use client';

import { report, TELEMETRY_EVENTS } from '@/lib/telemetry';

import { useEffect, useState } from 'react';
import { SignupButton } from './SignupButton';
import Link from 'next/link';
import styles from './Nav.module.css';
import { FEATURES, APP_STORE_URL, APP_URL } from '@/lib/semora-facts';
import { FEATURES_ES } from '@/lib/es-facts';
import type { SiteLocale } from '@/lib/i18n';

/**
 * Phone/tablet navigation. The features list is a native <details> so it
 * expands without another piece of open/closed state, and the whole panel
 * locks body scroll while it is open.
 */
export function MobileNav({ links, locale = 'en' }: { links: { href: string; label: string }[]; locale?: SiteLocale }) {
  const [open, setOpen] = useState(false);
  // Same reasoning as the desktop nav: someone who arrived from the app is
  // signed in, and "Sign in" / "Try it for free" tells them otherwise. The
  // site cannot see the session — different origin — so the app flags it on
  // the way out. Read after mount so the default markup stays static.
  const [fromApp, setFromApp] = useState(false);
  useEffect(() => {
    try {
      setFromApp(new URLSearchParams(window.location.search).get('from') === 'app');
    } catch {
      // A malformed query string is not a reason to break the menu.
    }
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => setOpen(false);
  const features = locale === 'es' ? FEATURES_ES : FEATURES;
  const copy = locale === 'es'
    ? {
        close: 'Cerrar menú', open: 'Abrir menú', features: 'Funciones', all: 'Ver todas las funciones →',
        signIn: 'Iniciar sesión', getApp: 'Descargar la app', tryFree: 'Empezar gratis', dashboard: 'Panel', base: '/es/funciones',
      }
    : {
        close: 'Close menu', open: 'Open menu', features: 'Features', all: 'See all features →',
        signIn: 'Sign in', getApp: 'Get the app', tryFree: 'Try it for free', dashboard: 'Dashboard', base: '/features',
      };

  return (
    <>
      <button
        type="button"
        className={styles.burger}
        aria-label={open ? copy.close : copy.open}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.burgerIcon} data-open={open}>
          <span className={styles.bar} />
          <span className={styles.bar} />
          <span className={styles.bar} />
        </span>
      </button>

      {/* Rendered unconditionally and hidden with CSS, not mounted on open.
          Googlebot renders at roughly a 412px viewport, where the desktop pill
          and actions are both `display: none` — so while this sheet was
          conditionally mounted, the entire header contained no crawlable links
          on the render Google actually performs, leaving the footer as the only
          navigation it could see. */}
      <div className={styles.sheet} data-open={open} hidden={!open}>
          <details className={styles.sheetGroup}>
            <summary className={styles.sheetSummary}>{copy.features}</summary>
            <div className={styles.sheetSub}>
              {features.map((f) => (
                <Link
                  key={f.slug}
                  href={`${copy.base}/${f.slug}`}
                  className={styles.sheetSubLink}
                  onClick={close}
                >
                  {f.name}
                </Link>
              ))}
              <Link href={copy.base} className={styles.sheetSubLink} onClick={close}>
                {copy.all}
              </Link>
            </div>
          </details>

          {links.map((l) => (
            <Link key={l.href} href={l.href} className={styles.sheetLink} onClick={close}>
              {l.label}
            </Link>
          ))}

          {fromApp ? null : (
            <SignupButton mode="signin" className={styles.sheetLink} onClick={close}>
              {copy.signIn}
            </SignupButton>
          )}

          <a href={APP_STORE_URL} className={styles.sheetGhost} onClick={() => { report(TELEMETRY_EVENTS.appStoreClick, {}); close(); }}>
            {copy.getApp}
          </a>
          {fromApp ? (
            <a href={APP_URL} className={styles.sheetCta} onClick={close}>
              {copy.dashboard} &rarr;
            </a>
          ) : (
            <SignupButton className={styles.sheetCta} onClick={close}>
              {copy.tryFree}
            </SignupButton>
          )}
      </div>
    </>
  );
}
