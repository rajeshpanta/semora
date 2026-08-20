'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { report, TELEMETRY_EVENTS } from '@/lib/telemetry';

/**
 * The view and the read, for every page.
 *
 * Mounted once per layout rather than added page by page. Before this, four
 * places on the whole site reported anything, and none of them was a page view
 * — which meant no denominator: twelve signup clicks could not become a rate,
 * and a page nobody reached looked exactly like a page everybody abandoned.
 *
 * Two things are recorded:
 *
 *   page_view    once per pathname, including client-side navigations, which
 *                Vercel's pageview script counts but does not let us join to
 *                anything else.
 *   scroll_depth the furthest quarter reached, reported once when the page is
 *                left. A landing page everyone opens and nobody scrolls is
 *                failing in a completely different way from one that gets read
 *                to the end and still loses the reader — and the fix is
 *                different too, so the difference is worth the event.
 *
 * Depth is sent on `visibilitychange` rather than `beforeunload`: mobile
 * Safari frequently never fires unload, and a depth event that only works on
 * desktop would quietly bias every page toward looking desktop-shaped.
 */
export function PageTelemetry() {
  const pathname = usePathname();
  const maxDepth = useRef(0);
  const reportedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    maxDepth.current = 0;
    reportedFor.current = pathname;
    report(TELEMETRY_EVENTS.pageView, { path: pathname });

    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      // A page shorter than the viewport is fully read the moment it opens;
      // reporting 0% for it would make short pages look like failures.
      const pct = scrollable <= 0 ? 100 : ((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100;
      const quarter = Math.min(100, Math.floor(pct / 25) * 25);
      if (quarter > maxDepth.current) maxDepth.current = quarter;
    };

    const flush = () => {
      if (document.visibilityState !== 'hidden') return;
      if (reportedFor.current !== pathname) return;
      reportedFor.current = null; // once per visit to this path
      report(TELEMETRY_EVENTS.scrollDepth, { path: pathname, depth: maxDepth.current });
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [pathname]);

  return null;
}
