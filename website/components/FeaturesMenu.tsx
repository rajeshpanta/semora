'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Nav.module.css';
import { FEATURES } from '@/lib/semora-facts';
import { FEATURES_ES } from '@/lib/es-facts';
import type { SiteLocale } from '@/lib/i18n';

/**
 * The "Features" nav dropdown.
 *
 * Opens on hover for pointer users and on click/Enter for everyone, so it is
 * reachable by keyboard and on touch (where hover doesn't exist). Escape and
 * outside-click close it. The trigger is a real <button> with aria-expanded
 * rather than a link, because on touch a link would navigate before the panel
 * could ever open — the hub page stays reachable from the panel's own footer.
 */
export function FeaturesMenu({ locale = 'en' }: { locale?: SiteLocale }) {
  const [open, setOpen] = useState(false);
  // The features hub in this locale, and everything beneath it.
  const featuresHub = locale === 'es' ? '/es/funciones' : '/features';
  const pathname = usePathname() ?? '';
  const onFeatures = pathname === featuresHub || pathname.startsWith(`${featuresHub}/`);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const panelId = useId();
  const features = locale === 'es' ? FEATURES_ES : FEATURES;
  const copy = locale === 'es'
    ? { trigger: 'Funciones', free: 'Gratis', all: 'Ver todas las funciones', base: '/es/funciones' }
    : { trigger: 'Features', free: 'Free', all: 'See all features', base: '/features' };

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // A small grace period stops the panel snapping shut while the pointer
  // crosses the gap between the trigger and the panel.
  const hoverOpen = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  return (
    <div
      ref={wrapRef}
      className={styles.menuWrap}
      onMouseEnter={hoverOpen}
      onMouseLeave={hoverClose}
    >
      <button
        type="button"
        // Marked on the hub and on every feature page under it. The trigger is
        // a button rather than a link (see the note in Nav), so it cannot pick
        // this up from NavLink and has to say it itself.
        className={onFeatures ? `${styles.menuTrigger} ${styles.menuTriggerActive}` : styles.menuTrigger}
        aria-current={onFeatures ? 'page' : undefined}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {copy.trigger}
        <svg
          className={styles.caret}
          data-open={open}
          width="10"
          height="6"
          viewBox="0 0 10 6"
          aria-hidden="true"
        >
          <path
            d="M1 1l4 4 4-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div id={panelId} className={styles.menuPanel} data-open={open}>
        <div className={styles.menuGrid}>
          {features.map((f) => {
            // The trigger already says you are somewhere under Features; this
            // says which one. Without it the panel looks identical whether you
            // opened it from the hub or from the middle of a feature page.
            const href = `${copy.base}/${f.slug}`;
            const current = pathname === href;
            return (
            <Link
              key={f.slug}
              href={href}
              className={current ? `${styles.menuItem} ${styles.menuItemActive}` : styles.menuItem}
              aria-current={current ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              <span className={styles.menuItemTop}>
                <span className={styles.menuItemName}>{f.name}</span>
                <span
                  className={`${styles.menuTier} ${
                    f.tier === 'pro' ? styles.menuTierPro : styles.menuTierFree
                  }`}
                >
                  {f.tier === 'pro' ? 'Pro' : copy.free}
                </span>
              </span>
              <span className={styles.menuItemDesc}>{f.shortDescription}</span>
            </Link>
            );
          })}
        </div>
        <Link href={copy.base} className={styles.menuFooter} onClick={() => setOpen(false)}>
          {copy.all}
          <span aria-hidden="true"> →</span>
        </Link>
      </div>
    </div>
  );
}
