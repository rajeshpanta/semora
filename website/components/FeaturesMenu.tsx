'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import styles from './Nav.module.css';
import { FEATURES } from '@/lib/semora-facts';

/**
 * The "Features" nav dropdown.
 *
 * Opens on hover for pointer users and on click/Enter for everyone, so it is
 * reachable by keyboard and on touch (where hover doesn't exist). Escape and
 * outside-click close it. The trigger is a real <button> with aria-expanded
 * rather than a link, because on touch a link would navigate before the panel
 * could ever open — the hub page stays reachable from the panel's own footer.
 */
export function FeaturesMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const panelId = useId();

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
        className={styles.menuTrigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        Features
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
          {FEATURES.map((f) => (
            <Link
              key={f.slug}
              href={`/features/${f.slug}`}
              className={styles.menuItem}
              onClick={() => setOpen(false)}
            >
              <span className={styles.menuItemTop}>
                <span className={styles.menuItemName}>{f.name}</span>
                <span
                  className={`${styles.menuTier} ${
                    f.tier === 'pro' ? styles.menuTierPro : styles.menuTierFree
                  }`}
                >
                  {f.tier === 'pro' ? 'Pro' : 'Free'}
                </span>
              </span>
              <span className={styles.menuItemDesc}>{f.shortDescription}</span>
            </Link>
          ))}
        </div>
        <Link href="/features" className={styles.menuFooter} onClick={() => setOpen(false)}>
          See all features
          <span aria-hidden="true"> →</span>
        </Link>
      </div>
    </div>
  );
}
