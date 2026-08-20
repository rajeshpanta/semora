'use client';

import { track as vercelTrack } from '@vercel/analytics';
import { looksAutomated, sessionId, storageWorks, visitorId } from './visitor';

/**
 * Website telemetry: what people do, and what breaks while they do it.
 *
 * The site shipped with pageviews and Core Web Vitals only, which answers "how
 * many" and "how fast" and nothing about "what went wrong". A client-side crash
 * rendered Next's default error screen and reported nothing at all.
 *
 * Events go to two places on purpose:
 *
 *   1. Vercel Analytics custom events — good for funnels, but custom events are
 *      gated by plan tier and no-op silently when unavailable. Fine as the
 *      nice-to-have, not something to depend on.
 *   2. `/api/telemetry`, which writes one structured JSON line to the server
 *      log. That works on every plan and lands in the same queryable shape the
 *      Supabase edge functions now use, so both halves of the stack are read
 *      the same way.
 *
 * Nothing here identifies a person. No cookie, no id, no form contents — the
 * fields are a route, an event name, and bounded diagnostic values.
 */

/**
 * Allowlist. A closed set rather than free-form strings so the log stays
 * aggregatable, and so a typo shows up as a dropped event during review rather
 * than as a second series that quietly splits a funnel in half.
 */
export const TELEMETRY_EVENTS = {
  // Something broke.
  webError: 'web_error',
  notFound: 'not_found',
  // Intent — the things that precede an install.
  signupClick: 'signup_click',
  appStoreClick: 'app_store_click',
  pricingView: 'pricing_view',
  // The free tools are the only pages that do a job for the reader, so their
  // usage is the clearest signal of whether they are worth keeping.
  toolUsed: 'tool_used',
  // Reader behaviour worth knowing about.
  languageSwitch: 'language_switch',
  supportSubmit: 'support_submit',
  faqOpen: 'faq_open',

  // ── Added so the funnel has a start and a middle, not only an end ──
  // Without a view event there is no denominator: "12 signup clicks" cannot
  // become a rate, and a page nobody reaches looks identical to one everybody
  // abandons.
  pageView: 'page_view',
  // How far down a page someone actually got. A landing page everyone opens
  // and nobody scrolls fails in a completely different way from one they read
  // to the end and still leave.
  scrollDepth: 'scroll_depth',
  // The blog is the top of the funnel; without this it is a black box.
  blogView: 'blog_view',
  // Which specific call to action, on which page — 'signup_click' alone could
  // not tell the hero button from the one in the footer.
  ctaClick: 'cta_click',
  // Left for the app domain. The last thing this site sees before the app's
  // own analytics picks the same visitor up by the shared device_id.
  appHandoff: 'app_handoff',
  // Frustration. A page view says someone arrived; these say whether the page
  // actually worked once they were there.
  rageClick: 'rage_click',
  deadClick: 'dead_click',
} as const;

export type TelemetryEvent = (typeof TELEMETRY_EVENTS)[keyof typeof TELEMETRY_EVENTS];

/** Vercel's custom-event properties accept only these primitives. */
type Props = Record<string, string | number | boolean | null>;

const MAX_VALUE_CHARS = 200;

function clean(props: Props): Props {
  const out: Props = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === null || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, MAX_VALUE_CHARS);
  }
  return out;
}

/**
 * Fire-and-forget. Never throws and never awaits anything the caller needs —
 * telemetry failing must not be able to affect a render or a navigation.
 */
export function report(event: TelemetryEvent, props: Props = {}): void {
  if (typeof window === 'undefined') return;
  const payload = clean({ ...props, path: window.location.pathname });

  // Identity is attached HERE rather than at each call site so no event can
  // be recorded without it — an event missing a visitor is invisible to every
  // funnel query and would silently shrink whichever step it belongs to.
  const identity = {
    device_id: visitorId(),
    session_id: sessionId(),
    // Kept as properties rather than dropped: automated traffic is worth
    // counting, just not worth counting as people.
    automated: looksAutomated(),
    persisted: storageWorks(),
  };

  try {
    vercelTrack(event, payload);
  } catch {
    // Custom events unavailable on this plan, or the script was blocked.
  }

  try {
    const body = JSON.stringify({ event, props: payload });
    // sendBeacon survives the page unload that follows an outbound CTA click,
    // which a normal fetch does not — an app-store click reported with fetch is
    // frequently cancelled before it leaves.
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/telemetry', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/telemetry', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // Beacon unavailable or blocked. Nothing to do and nothing to surface.
  }
}

/**
 * Report a caught render error.
 *
 * `digest` is the identifier Next puts on a server-side error; it is the only
 * link between the sanitized message the browser receives and the real stack in
 * the server log, so it matters more than the message text here.
 */
export function reportError(
  error: Error & { digest?: string },
  boundary: 'route' | 'global',
): void {
  report(TELEMETRY_EVENTS.webError, {
    boundary,
    name: error.name || 'Error',
    message: error.message || 'unknown',
    digest: error.digest ?? null,
  });
}
