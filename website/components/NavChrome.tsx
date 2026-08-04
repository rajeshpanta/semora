'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Sets two attributes on the sticky header so CSS can style it per context.
 *
 *   data-overlay  the page below opens with a dark hero, so the bar should sit
 *                 ON it — transparent, light text — instead of stacking a cream
 *                 band above it and cutting the hero in half.
 *   data-scrolled the reader has moved past that hero, so the bar becomes
 *                 opaque again and stays legible over light content.
 *
 * Attributes rather than className so the server-rendered header markup is
 * untouched and there is nothing to hydrate-mismatch.
 */
export function NavChrome() {
  const pathname = usePathname();
  // Only the homepage opens on the dark hero today. Add routes here if others
  // grow one; everything else keeps the solid bar from the first pixel.
  const overlay = pathname === '/';

  useEffect(() => {
    const header = document.querySelector('header[data-nav]') as HTMLElement | null;
    if (!header) return;

    header.toggleAttribute('data-overlay', overlay);
    if (!overlay) {
      header.removeAttribute('data-scrolled');
      return;
    }

    // Flip slightly before the hero ends so the bar is already solid by the
    // time light content slides under it, rather than changing mid-overlap.
    const onScroll = () => {
      header.toggleAttribute('data-scrolled', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [overlay]);

  return null;
}
