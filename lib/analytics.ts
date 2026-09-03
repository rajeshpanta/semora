import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getDeviceItem, setDeviceItem } from '@/lib/deviceStore';
import { supabase } from '@/lib/supabase';

// Events are logged into the SHARED `analytics_events` table (also used by the
// Citizen app) and tagged with app_name='semora'. Always query the
// `semora_events` view rather than the table: app_name DEFAULTS to 'citizen',
// so a forgotten filter silently mixes the two apps together.
//
// Rows also carry a user_id, but this file never sends one — the column is
// stamped by the database from the JWT (`default auth.uid()`), and clients hold
// no INSERT grant on it. That is what makes attribution trustworthy rather than
// merely present. Signed-out events keep a null user and are still recorded.

// A development build must not write to production analytics.
//
// Two rows in analytics_events are a Metro TransformError carrying
// /Users/…/semora/app/(tabs)/index.tsx with source lines, and a missing native
// module from http://localhost:8081. Both are from a laptop mid-edit, both are
// filed as production client_error, and one leaks a local filesystem path into
// a shared table. Neither describes anything a user experienced.
//
// Dropped rather than tagged: a tag only helps if every future query remembers
// to filter on it, and the queries that matter are written months later by
// someone counting errors. Set EXPO_PUBLIC_ANALYTICS_IN_DEV=true to opt a dev
// build back in when you are specifically testing instrumentation.
const ANALYTICS_ENABLED =
  !__DEV__ || process.env.EXPO_PUBLIC_ANALYTICS_IN_DEV === 'true';

const DEVICE_ID_KEY = 'semora_device_id';
let cachedDeviceId: string | null = null;

// A random per-install id — not security-sensitive, just needs to be stable.
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * The marketing site's id for this same browser, if it left one.
 *
 * semoraai.com writes `semora_device_id` as a cookie scoped to `.semoraai.com`,
 * which app.semoraai.com can therefore read. Adopting it is the entire join:
 * without it a student who reads a blog post, clicks Get Started and signs up
 * is two unrelated rows, and no query can ever connect what they read to what
 * they did. localStorage cannot do this — it is per-origin — which is why the
 * site uses a cookie for the id and localStorage only as its own fallback.
 *
 * Only ever READ here. The site owns creating it; the app adopting a value it
 * did not write is what keeps one visitor to one id.
 */
function siteDeviceId(): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|; )semora_device_id=([^;]*)/);
    const value = match ? decodeURIComponent(match[1]) : '';
    // Bounded and shape-checked: this is an id from another origin we control,
    // but a malformed cookie should not become a permanent poisoned device id.
    return /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    let id = getDeviceItem(DEVICE_ID_KEY);
    if (!id) {
      // Prefer the site's id over minting a new one, so arriving from
      // semoraai.com continues one journey instead of starting a second.
      id = siteDeviceId() ?? uuid();
      setDeviceItem(DEVICE_ID_KEY, id);
    }
    cachedDeviceId = id;
  } catch {
    // Storage genuinely unavailable (private browsing) — ephemeral id.
    cachedDeviceId = uuid();
    // Recorded so this event can be told apart from a real returning visitor.
    // Roughly half of recent "web devices" were a headless browser minting a
    // fresh id on every page load, which is indistinguishable from a person
    // bouncing unless the difference is written down.
    ephemeralDeviceId = true;
  }
  return cachedDeviceId;
}

/** True when the id above could not be persisted — private mode or headless. */
let ephemeralDeviceId = false;

/**
 * Whether this device's id is throwaway.
 *
 * Reads through getDeviceId() so the answer is never stale on the first event
 * of a session, which is the only event a headless page-load produces — and
 * therefore the exact one that must carry the flag.
 */
function deviceIdWasEphemeral(): boolean {
  getDeviceId();
  return ephemeralDeviceId;
}

// ── Sessions ────────────────────────────────────────────────────────────────
//
// A session is one visit: it starts at launch and ends when the app has been
// in the background long enough that coming back is a new sitting. Thirty
// minutes is the usual convention and matters little — what matters is that
// the boundary is decided HERE, once, at the only place that knows the app
// resumed. Deriving sessions later from gaps between timestamps gives a
// different answer every time you change the gap.
const SESSION_IDLE_MS = 30 * 60 * 1000;
let sessionId: string = uuid();
let lastEventAt = Date.now();

/** Called when the app returns to the foreground (see app/_layout.tsx). */
export function noteAppForegrounded(): void {
  if (Date.now() - lastEventAt > SESSION_IDLE_MS) sessionId = uuid();
}

/**
 * The current session id WITHOUT touching it.
 *
 * currentSessionId() below both rotates a stale session and stamps
 * lastEventAt, because it is called when an event is actually being sent. A
 * caller that only wants to KEY something by session — de-duplicating an
 * impression, say — must not do either: extending the session from a
 * non-event would make a student who never acts look permanently present, and
 * that is the number sessions exist to answer.
 */
export function peekSessionId(): string {
  return sessionId;
}

function currentSessionId(): string {
  // Also rotate on a long quiet stretch, so a session cannot run for days on a
  // device that never fully backgrounds the app.
  if (Date.now() - lastEventAt > SESSION_IDLE_MS) sessionId = uuid();
  lastEventAt = Date.now();
  return sessionId;
}

/**
 * Fire-and-forget analytics event. Inserts into the shared `analytics_events`
 * table tagged app_name='semora'. Include a `screen` in `properties` so every
 * event records which page it came from. Never throws and never blocks the UI —
 * analytics failing must never affect the app.
 */
export function track(eventName: string, properties: Record<string, any> = {}): void {
  if (!ANALYTICS_ENABLED) return;
  try {
    supabase
      .from('analytics_events')
      .insert({
        app_name: 'semora',
        event_name: eventName,
        // getDeviceId() runs first so `ephemeralDeviceId` reflects THIS call
        // rather than a previous one — the flag is set inside it.
        properties: { ...properties, ...(deviceIdWasEphemeral() ? { ephemeral: true } : {}) },
        device_id: getDeviceId(),
        session_id: currentSessionId(),
        platform: Platform.OS,
        app_version: Constants.expoConfig?.version ?? null,
      })
      // Two-arg .then swallows both fulfilment and rejection so a failed
      // insert can never surface as an unhandled rejection.
      .then(() => {}, () => {});
  } catch {
    // never let analytics break a render path
  }
}

/**
 * An event that survives the page navigating away.
 *
 * track() is a fire-and-forget PostgREST insert through supabase-js, which is
 * an ordinary fetch — and the browser cancels in-flight fetches when the tab
 * navigates. Every web checkout does exactly that: purchaseProduct() sends the
 * tab to Stripe, so `purchase_checkout_started` was queued and then killed
 * microseconds later. It has never once been recorded, on any platform, since
 * the day it was added.
 *
 * `keepalive` is the fix and the reason this cannot just call track(): it tells
 * the browser to finish the request even as the document goes away.
 * navigator.sendBeacon would be the other candidate and cannot be used here —
 * it allows no custom headers, and PostgREST needs apikey and Authorization,
 * the latter being what stamps user_id from the JWT.
 *
 * Native has no unload problem, so it just calls track().
 */
export async function trackBeforeLeaving(
  eventName: string,
  properties: Record<string, any> = {},
): Promise<void> {
  // Gated here as well as in track(): the web branch below bypasses track()
  // entirely, so guarding only there would let dev events through on web.
  if (!ANALYTICS_ENABLED) return;
  if (Platform.OS !== 'web') {
    track(eventName, properties);
    return;
  }
  try {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
    const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
    if (!url || !key) return;
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(`${url}/rest/v1/analytics_events`, {
      method: 'POST',
      // Outlives the document. Without this the request dies with the page.
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: key,
        // The JWT is what makes user_id land on the row — analytics_events
        // defaults that column from auth.uid(), and the anon key alone would
        // record the sale as belonging to nobody.
        Authorization: `Bearer ${session?.access_token ?? key}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        app_name: 'semora',
        event_name: eventName,
        properties: { ...properties, ...(deviceIdWasEphemeral() ? { ephemeral: true } : {}) },
        device_id: getDeviceId(),
        session_id: currentSessionId(),
        platform: Platform.OS,
        app_version: Constants.expoConfig?.version ?? null,
      }),
    });
  } catch {
    // Analytics must never be the reason a purchase does not start.
  }
}

// ── Client error capture ────────────────────────────────────────────────────
//
// Until now a JS crash was invisible: expo-router's ErrorBoundary renders a
// screen and the app carries on, but nothing is recorded, so the only signal
// that students were hitting a crash was a review complaining about it.
//
// Two handlers, because native and web fail differently:
//   * ErrorUtils.setGlobalHandler — React Native's last stop for an uncaught
//     JS error, including fatal ones.
//   * window.onerror / unhandledrejection — the browser equivalents. Promise
//     rejections matter most on web, where a failed fetch in an event handler
//     produces no visible error at all.
//
// The previous handler is always chained. Replacing RN's default would swallow
// the redbox in development and Expo's own fatal reporting in production —
// this is meant to observe crashes, not to take ownership of them.
let errorHandlersInstalled = false;

export function installErrorTracking(): void {
  if (errorHandlersInstalled) return;
  errorHandlersInstalled = true;

  const report = (error: unknown, fatal: boolean, kind: string) => {
    try {
      const e = error as { message?: string; name?: string; stack?: string };
      track('client_error', {
        kind,
        fatal,
        name: e?.name ?? typeof error,
        // Truncated: a message is for grouping, not for reading a novel. The
        // stack's first frame is usually enough to find the call site.
        message: String(e?.message ?? error).slice(0, 300),
        frame: (e?.stack ?? '').split('\n')[1]?.trim().slice(0, 160) ?? null,
      });
    } catch {
      // A failure to report an error must never become a second error.
    }
  };

  try {
    const RNErrorUtils = (globalThis as any).ErrorUtils;
    if (RNErrorUtils?.setGlobalHandler) {
      const previous = RNErrorUtils.getGlobalHandler?.();
      RNErrorUtils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
        report(error, Boolean(isFatal), 'js');
        previous?.(error, isFatal);
      });
    }
  } catch { /* handler unavailable — nothing to install */ }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('error', (ev) => report(ev.error ?? ev.message, true, 'window'));
    window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) =>
      report(ev.reason, false, 'unhandled_rejection'));
  }
}
