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
  // The whole site is one dark canvas. It used to be homepage-only, which meant
  // every inner page opened with a dark hero and then switched to cream a few
  // hundred pixels down — a colour change mid-scroll that read as two pages
  // stapled together. One canvas everywhere removes the seam by removing the
  // second colour.
  const overlay = true;

  useEffect(() => {
    const header = document.querySelector('header[data-nav]') as HTMLElement | null;
    if (!header) return;

    header.toggleAttribute('data-overlay', overlay);

    // data-dark-page is NOT set here — app/layout.tsx server-renders it, so the
    // first frame is already dark. Setting it from this effect meant a flash of
    // the light palette on every cold load.

    // Publish the header's REAL height so the hero can sit exactly under it.
    // This was hardcoded at 61px; the bar is actually ~76px on desktop and
    // ~67px on mobile, and the difference showed as a pale strip above the
    // hero. Re-measured on resize because the bar wraps at narrow widths.
    const publishHeight = () => {
      document.documentElement.style.setProperty(
        '--nav-height', `${header.getBoundingClientRect().height}px`,
      );
    };
    publishHeight();
    const ro = new ResizeObserver(publishHeight);
    ro.observe(header);

    if (!overlay) {
      header.removeAttribute('data-scrolled');
      return () => ro.disconnect();
    }

    // Flip slightly before the hero ends so the bar is already solid by the
    // time light content slides under it, rather than changing mid-overlap.
    const onScroll = () => {
      header.toggleAttribute('data-scrolled', window.scrollY > 24);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      ro.disconnect();
    };
    // Re-run on navigation: the header persists across routes, but re-measuring
    // and re-evaluating scroll position after each one is cheap insurance.
  }, [overlay, pathname]);

  return null;
}
