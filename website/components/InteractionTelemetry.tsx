'use client';

import { useEffect } from 'react';
import { report, TELEMETRY_EVENTS } from '@/lib/telemetry';

/**
 * Frustration, and the things people open.
 *
 * Page views say where someone went and scroll depth says how much they read.
 * Neither says whether the page *worked*. A reader who clicks the same word
 * four times because it looks like a link, or opens the FAQ and leaves, is
 * telling us something no pageview can — and until now nothing was listening.
 *
 * Three signals, all delegated from the document so no server component has to
 * become a client component to be measured:
 *
 *   faq_open    a <details> was opened. `toggle` does NOT bubble, so this
 *               listens in the CAPTURE phase, which still reaches a
 *               non-bubbling event on its way down to the target.
 *   rage_click  the same spot clicked repeatedly in a moment. The clearest
 *               "this should have done something" signal there is.
 *   dead_click  a click on something inert that changed nothing on the page.
 *               Usually text that looks like a link, or a button whose handler
 *               is broken.
 *
 * ─── What this deliberately does NOT do ───
 * It does not stream cursor movement. A continuous pointer trail is tens of
 * events per second per reader — it would cost more to store than everything
 * else here combined, and in exchange it answers questions a rage click has
 * already answered more clearly. What it does instead is capture the few
 * sampled positions immediately BEFORE a rage click, which is the part of a
 * cursor path anyone actually reads: where the person was hunting just before
 * they gave up. Full replay is a different product (PostHog, Clarity) and
 * should be bought rather than half-built here.
 */

const RAGE_WINDOW_MS = 1_000;
const RAGE_RADIUS_PX = 40;
const RAGE_MIN_CLICKS = 3;
const DEAD_CLICK_SETTLE_MS = 600;
const TRAIL_SAMPLE_MS = 150;
const TRAIL_LENGTH = 8;

const INTERACTIVE = 'a,button,input,select,textarea,label,summary,details,[role="button"],[role="link"],[tabindex]';

/** A short, human-readable name for what was clicked. Never page text. */
function describe(el: Element | null): string {
  if (!el) return 'unknown';
  const tag = el.tagName.toLowerCase();
  const id = (el as HTMLElement).id;
  if (id) return `${tag}#${id}`;
  const cls = (el as HTMLElement).className;
  if (typeof cls === 'string' && cls.trim()) {
    // CSS-module class names carry the component name, which is exactly the
    // useful part, and no user content can appear in them.
    return `${tag}.${cls.trim().split(/\s+/)[0].slice(0, 40)}`;
  }
  return tag;
}

export function InteractionTelemetry() {
  useEffect(() => {
    let clicks: { x: number; y: number; t: number }[] = [];
    let ragedAt = 0;
    const trail: { x: number; y: number }[] = [];
    let lastSample = 0;

    const onMove = (e: PointerEvent) => {
      const now = Date.now();
      if (now - lastSample < TRAIL_SAMPLE_MS) return;
      lastSample = now;
      // Percentages, not pixels: a path in pixels is meaningless without the
      // window size, and storing the window size for every reader is worse.
      trail.push({
        x: Math.round((e.clientX / window.innerWidth) * 100),
        y: Math.round((e.clientY / window.innerHeight) * 100),
      });
      if (trail.length > TRAIL_LENGTH) trail.shift();
    };

    const onToggle = (e: Event) => {
      const el = e.target as HTMLDetailsElement | null;
      if (!el || el.tagName !== 'DETAILS') return;
      // Only the opening. A close is the reader finishing, not a signal.
      if (!el.open) return;
      const heading = el.querySelector('summary h2, summary h3');
      report(TELEMETRY_EVENTS.faqOpen, {
        // The heading is our own copy, not anything the visitor typed.
        question: (heading?.textContent ?? describe(el)).trim().slice(0, 120),
      });
    };

    const onClick = (e: MouseEvent) => {
      const now = Date.now();
      const x = e.clientX;
      const y = e.clientY;
      const target = e.target as Element | null;

      // ── rage ──
      clicks = clicks.filter((c) => now - c.t < RAGE_WINDOW_MS);
      clicks.push({ x, y, t: now });
      const near = clicks.filter((c) => Math.hypot(c.x - x, c.y - y) < RAGE_RADIUS_PX);
      if (near.length >= RAGE_MIN_CLICKS && now - ragedAt > RAGE_WINDOW_MS) {
        ragedAt = now;
        clicks = [];
        report(TELEMETRY_EVENTS.rageClick, {
          element: describe(target),
          clicks: near.length,
          x: Math.round((x / window.innerWidth) * 100),
          y: Math.round((y / window.innerHeight) * 100),
          // Where the pointer had been just before giving up — the readable
          // part of a cursor path, without streaming one.
          trail: trail.map((p) => `${p.x},${p.y}`).join(' ').slice(0, 120),
        });
        return;
      }

      // ── dead ──
      // Interactive things are allowed to do nothing visible (an outbound link
      // navigates away, a submit posts). Only inert targets are candidates.
      if (target?.closest(INTERACTIVE)) return;
      let changed = false;
      const observer = new MutationObserver(() => {
        changed = true;
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true });
      window.setTimeout(() => {
        observer.disconnect();
        // Navigated away, or something rendered — either way the click did a
        // job and is not dead.
        if (changed || document.visibilityState !== 'visible') return;
        report(TELEMETRY_EVENTS.deadClick, {
          element: describe(target),
          x: Math.round((x / window.innerWidth) * 100),
          y: Math.round((y / window.innerHeight) * 100),
        });
      }, DEAD_CLICK_SETTLE_MS);
    };

    document.addEventListener('toggle', onToggle, true); // capture: toggle does not bubble
    document.addEventListener('click', onClick, true);
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('toggle', onToggle, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return null;
}
