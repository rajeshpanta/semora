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
  // Whether this mount has already recorded the visit's entry point.
  const sessionStarted = useRef(false);

  useEffect(() => {
    if (!pathname) return;
    maxDepth.current = 0;
    reportedFor.current = pathname;
    // Where they came from, attached to the page view.
    //
    // Referrer is only meaningful on the FIRST view of a visit — after that it
    // is just the previous page of our own site, which the path already says.
    // Capturing it per-session is what turns "34 people saw pricing" into
    // "Reddit sends readers who bounce and Google sends readers who sign up",
    // which is the difference between knowing the number and being able to act
    // on it. UTM parameters are read from the URL so a campaign can be told
    // apart from organic arrivals on the same referrer.
    const isFirstOfSession = !sessionStarted.current;
    sessionStarted.current = true;
    let entry: Record<string, string> = {};
    if (isFirstOfSession) {
      try {
        const params = new URLSearchParams(window.location.search);
        const ref = document.referrer || '';
        // Host only, never the full URL: a referring path can carry a search
        // query someone typed, and that is their business, not ours.
        const refHost = ref ? new URL(ref).hostname : '';
        entry = {
          referrer: refHost && refHost !== window.location.hostname ? refHost : ref ? 'internal' : 'direct',
          ...(params.get('utm_source') ? { utm_source: params.get('utm_source')!.slice(0, 60) } : {}),
          ...(params.get('utm_medium') ? { utm_medium: params.get('utm_medium')!.slice(0, 60) } : {}),
          ...(params.get('utm_campaign') ? { utm_campaign: params.get('utm_campaign')!.slice(0, 60) } : {}),
        };
      } catch {
        entry = { referrer: 'unknown' };
      }
    }
    report(TELEMETRY_EVENTS.pageView, { path: pathname, ...entry, entry: isFirstOfSession });

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
