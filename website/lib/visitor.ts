'use client';

/**
 * Who is reading, and which visit this is.
 *
 * The site recorded nothing identifying at all — no cookie, no id — which kept
 * it simple and answered "how many people saw the pricing page". It could never
 * answer the question that actually matters: did the person who read the
 * flashcards post go on to sign up, and if not, where did they stop.
 *
 * Two ids, matching what the app already stores in `analytics_events` so both
 * halves land in one table and join without a translation step:
 *
 *   visitor  — this browser, kept until storage is cleared. `device_id`.
 *   session  — this visit, expiring after 30 minutes idle. `session_id`,
 *              the same 30-minute convention lib/analytics.ts uses in the app.
 *
 * ─── Why a cookie and not just localStorage ───
 * localStorage is per-origin: a value written on semoraai.com is invisible to
 * app.semoraai.com. A cookie scoped to `.semoraai.com` is readable by both, so
 * the marketing site and the app agree on who this is WITHOUT passing ids
 * through URLs — which leak into referrers, get shared, and break the moment
 * someone types the address by hand. localStorage is still written as a
 * fallback for the case where cookies are refused but storage is not.
 *
 * Nothing here is personal. It is a random number with no name, email or
 * address attached, it is first-party, and it is never sent anywhere but our
 * own two domains.
 */

const VISITOR_KEY = 'semora_device_id';
const SESSION_KEY = 'semora_session_id';
const SESSION_SEEN_KEY = 'semora_session_seen';
const SESSION_IDLE_MS = 30 * 60 * 1000;

// Deliberately the SAME key name the app uses for its device id. A visitor who
// reads the blog and then opens the app is one row in the funnel, not two.
const COOKIE_DOMAIN = '.semoraai.com';

function uuid(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, maxAgeSeconds: number): void {
  if (typeof document === 'undefined') return;
  // `SameSite=Lax` because this is only ever read by our own pages on
  // navigation, never by a third-party frame. Not `Secure`-gated on localhost,
  // where there is no https to be secure about.
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  const domain = location.hostname.endsWith('semoraai.com') ? `; domain=${COOKIE_DOMAIN}` : '';
  document.cookie =
    `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax${secure}${domain}`;
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — the cookie is the fallback, and vice versa */
  }
}

/**
 * True when this looks like automation rather than a reader.
 *
 * Worth recording rather than blocking: roughly half of recent "web visitors"
 * in the app's own numbers turned out to be a headless browser, each page load
 * minting a fresh id because storage was unavailable — which is exactly the
 * signature of a real person bouncing. Every funnel built on that data was
 * measuring robots. Flagging it costs one boolean and makes the difference
 * filterable after the fact, which deleting the traffic would not.
 */
export function looksAutomated(): boolean {
  if (typeof navigator === 'undefined') return false;
  try {
    if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return true;
    if (/headless|phantom|puppeteer|playwright|selenium|bot|crawler|spider/i.test(navigator.userAgent)) {
      return true;
    }
    // A real browser has at least one language and a plausible screen. Headless
    // defaults frequently have neither.
    if (!navigator.languages || navigator.languages.length === 0) return true;
  } catch {
    /* if we cannot tell, assume human — over-flagging hides real people */
  }
  return false;
}

/** This browser. Stable until the visitor clears their data. */
export function visitorId(): string {
  const existing = readCookie(VISITOR_KEY) ?? readLocal(VISITOR_KEY);
  if (existing) {
    // Re-write so the expiry keeps sliding forward and both stores stay in sync
    // after one of them is cleared.
    writeCookie(VISITOR_KEY, existing, 60 * 60 * 24 * 365);
    writeLocal(VISITOR_KEY, existing);
    return existing;
  }
  const fresh = uuid();
  writeCookie(VISITOR_KEY, fresh, 60 * 60 * 24 * 365);
  writeLocal(VISITOR_KEY, fresh);
  return fresh;
}

/**
 * This visit. Rotates after 30 minutes of inactivity, so "one session" means
 * one sitting rather than one calendar day.
 */
export function sessionId(): string {
  const now = Date.now();
  const lastSeen = Number(readLocal(SESSION_SEEN_KEY) ?? readCookie(SESSION_SEEN_KEY) ?? 0);
  let id = readCookie(SESSION_KEY) ?? readLocal(SESSION_KEY);

  if (!id || !lastSeen || now - lastSeen > SESSION_IDLE_MS) {
    id = uuid();
  }
  // Session cookie lifetime tracks the idle window, not the visit: a tab left
  // open for an hour and returned to is a new sitting, which is the whole point
  // of the rotation.
  writeCookie(SESSION_KEY, id, Math.ceil(SESSION_IDLE_MS / 1000));
  writeLocal(SESSION_KEY, id);
  writeCookie(SESSION_SEEN_KEY, String(now), Math.ceil(SESSION_IDLE_MS / 1000));
  writeLocal(SESSION_SEEN_KEY, String(now));
  return id;
}

/** Whether storage actually persisted — the tell for private mode and headless. */
export function storageWorks(): boolean {
  try {
    const probe = '__semora_probe__';
    localStorage.setItem(probe, '1');
    const ok = localStorage.getItem(probe) === '1';
    localStorage.removeItem(probe);
    return ok;
  } catch {
    return false;
  }
}
