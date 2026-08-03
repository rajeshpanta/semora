'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './Nav.module.css';
import { FEATURES, APP_SIGNIN_URL, APP_STORE_URL } from '@/lib/semora-facts';

/**
 * Phone/tablet navigation. The features list is a native <details> so it
 * expands without another piece of open/closed state, and the whole panel
 * locks body scroll while it is open.
 */
export function MobileNav({ links }: { links: { href: string; label: string }[] }) {
  const [open, setOpen] = useState(false);

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

  return (
    <>
      <button
        type="button"
        className={styles.burger}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.burgerIcon} data-open={open}>
          <span className={styles.bar} />
          <span className={styles.bar} />
          <span className={styles.bar} />
        </span>
      </button>

      {open && (
        <div className={styles.sheet}>
          <details className={styles.sheetGroup}>
            <summary className={styles.sheetSummary}>Features</summary>
            <div className={styles.sheetSub}>
              {FEATURES.map((f) => (
                <Link
                  key={f.slug}
                  href={`/features/${f.slug}`}
                  className={styles.sheetSubLink}
                  onClick={close}
                >
                  {f.name}
                </Link>
              ))}
              <Link href="/features" className={styles.sheetSubLink} onClick={close}>
                See all features →
              </Link>
            </div>
          </details>

          {links.map((l) => (
            <Link key={l.href} href={l.href} className={styles.sheetLink} onClick={close}>
              {l.label}
            </Link>
          ))}

          <a href={APP_STORE_URL} className={styles.sheetGhost} onClick={close}>
            Get the app
          </a>
          <Link href={APP_SIGNIN_URL} className={styles.sheetCta} onClick={close}>
            Try it for free
          </Link>
        </div>
      )}
    </>
  );
}
