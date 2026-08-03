'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './Nav.module.css';

export function MobileNavToggle({
  links,
  ctaHref,
  ctaLabel,
}: {
  links: { href: string; label: string }[];
  ctaHref: string;
  ctaLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.menuButton}
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.menuIcon} data-open={open}>
          <span className={styles.bar} />
          <span className={styles.bar} />
          <span className={styles.bar} />
        </span>
      </button>
      {open && (
        <div className={styles.mobilePanel}>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={styles.mobileLink}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link href={ctaHref} className={styles.mobileCta} onClick={() => setOpen(false)}>
            {ctaLabel}
          </Link>
        </div>
      )}
    </>
  );
}
