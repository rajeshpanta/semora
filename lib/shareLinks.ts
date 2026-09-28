/**
 * Semora share links: the one parser for every way a share reaches the app.
 *
 * Each share kind is an https page on the marketing site with the value in the
 * PATH, and an app screen that reads it from a QUERY param:
 *
 *   https://semoraai.com/invite/<code>        -> /invite?code=<code>         lib/referral.ts
 *   https://semoraai.com/join/<token>         -> /join?token=<token>         share-course function
 *   https://semoraai.com/collaborate/<token>  -> /collaborate?token=<token>  lib/collaboration.ts
 *
 * Two callers:
 *   - app/+native-intent.tsx, for Universal Links (the OS hands the app the
 *     full https URL, and expo-router alone would route /invite/<code> to
 *     +not-found because no screen takes a path segment).
 *   - app/redeem.tsx, for a student who installed from the App Store and so
 *     arrived with no link at all: they type the code or paste the link.
 *
 * Pure, with no imports, because +native-intent is evaluated before the app
 * has booted anything, and so the Deno tests can load it directly.
 */

export type ShareKind = 'invite' | 'join' | 'collaborate';

export interface ShareTarget {
  kind: ShareKind;
  value: string;
}

const PARAM: Record<ShareKind, 'code' | 'token'> = {
  invite: 'code',
  join: 'token',
  collaborate: 'token',
};

// www only ever 308s to the apex (website/proxy.ts), so no link the app mints
// uses it and it is NOT in the association file. Accepted here because a
// student can still paste one.
const HOSTS = new Set(['semoraai.com', 'www.semoraai.com']);

// Same bound as website/components/ShareLanding isPlausibleShareValue.
const MAX_VALUE_LEN = 256;

// lib/referral.ts generateCode(): 11 characters of CODE_ALPHABET
// '23456789ABCDEFGHJKMNPQRSTUVWXYZ' — no 0/1/I/L/O, so a code read aloud or
// typed from a screenshot cannot be mistaken for another.
const REFERRAL_CODE = /^[2-9A-HJKMNP-Z]{11}$/;
// share-course generateToken(): two UUIDs as hex, dashes removed.
const COURSE_SHARE_TOKEN = /^[0-9a-f]{64}$/;
// create_course_collaboration_invite: encode(gen_random_bytes(24), 'hex').
const COLLAB_TOKEN = /^[0-9a-f]{48}$/;

// A link copied out of a sentence drags its punctuation along
// ("…/invite/K7QM4XR9TZ2." or "(…/join/abc)"). None of these can end a real
// value, so they are dropped before anything is compared.
const TRAILING_PUNCTUATION = /[.,;:!?)\]}>'"»”’]+$/;

function isKind(value: string): value is ShareKind {
  return value === 'invite' || value === 'join' || value === 'collaborate';
}

/**
 * Canonical form of a value for its kind. Referral codes are matched
 * case-SENSITIVELY by try_redeem_referral (migration 028) and are always upper
 * case; tokens are always lower-case hex. A hand-typed or auto-capitalised
 * value is folded into that form when — and only when — it is recognisably of
 * that shape, so a garbled value still reaches the screen and gets the screen's
 * own "that link isn't valid" message instead of silently becoming another one.
 */
function canonical(kind: ShareKind, value: string): string {
  if (kind === 'invite') {
    const upper = value.toUpperCase();
    return REFERRAL_CODE.test(upper) ? upper : value;
  }
  const lower = value.toLowerCase();
  if (kind === 'join' && COURSE_SHARE_TOKEN.test(lower)) return lower;
  if (kind === 'collaborate' && COLLAB_TOKEN.test(lower)) return lower;
  return value;
}

function cleanValue(raw: string): string | null {
  let value: string;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return null;
  }
  value = value.trim().replace(TRAILING_PUNCTUATION, '').trim();
  if (!value || value.length > MAX_VALUE_LEN) return null;
  return value;
}

/** True for any https URL on the marketing site, share link or not. */
export function isSemoraSiteUrl(url: string): boolean {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return false;
  try {
    return HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * An https share URL to its target. Null for anything else, which is how
 * +native-intent knows to pass every other URL through untouched. An optional
 * /es prefix is accepted so Spanish share pages, if they are ever added, need
 * only an association-file change and no new binary.
 */
export function parseShareUrl(url: string): ShareTarget | null {
  if (!isSemoraSiteUrl(url)) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments[0]?.toLowerCase() === 'es') segments.shift();
  if (segments.length < 2) return null;
  const kind = segments[0].toLowerCase();
  if (!isKind(kind)) return null;
  const value = cleanValue(segments[1]);
  return value ? { kind, value: canonical(kind, value) } : null;
}

// A semoraai.com link anywhere in a pasted message. The left edge must be the
// start of the text or a separator, so "mysemoraai.com/invite/X" is not taken
// for Semora. (No lookbehind: kept to syntax every JS engine the app runs on
// supports.)
const LINK_IN_TEXT = /(?:^|[\s(<\[{"'“‘])((?:https?:\/\/)?(?:www\.)?semoraai\.com\/[^\s"'<>]+)/i;

/**
 * Whatever a student typed or pasted: a bare referral code, a whole share
 * link, or the whole share MESSAGE (the share sheet sends a sentence with the
 * link at the end, and that is what gets copied).
 */
export function parseShareInput(input: string): ShareTarget | null {
  const text = (input ?? '').trim();
  if (!text) return null;

  const link = text.match(LINK_IN_TEXT)?.[1];
  if (link) {
    const bare = link.replace(/^https?:\/\//i, '').replace(TRAILING_PUNCTUATION, '');
    const fromLink = parseShareUrl(`https://${bare}`);
    if (fromLink) return fromLink;
    // A semoraai.com link that is not a share link (a pricing page, say) must
    // not hide a code typed next to it — fall through to the bare-value search.
  }

  // The whole input is one value, possibly typed with spaces or dashes.
  const compact = text.replace(/[\s-]/g, '');
  const upper = compact.toUpperCase();
  if (REFERRAL_CODE.test(upper)) return { kind: 'invite', value: upper };
  const lower = compact.toLowerCase();
  if (COURSE_SHARE_TOKEN.test(lower)) return { kind: 'join', value: lower };
  if (COLLAB_TOKEN.test(lower)) return { kind: 'collaborate', value: lower };

  // A value inside a sentence ("use my code K7QM4XR9TZ2 on Semora"). Tokens
  // are long hex and unambiguous. A referral code is only accepted here if it
  // contains a digit: an 11-letter English word can be spelt from the code
  // alphabet ("STRENGTHENS"), a real code has no digit only ~4% of the time,
  // and the whole-input path above still takes those.
  for (const word of text.split(/[^0-9A-Za-z]+/)) {
    const w = word.toLowerCase();
    if (COURSE_SHARE_TOKEN.test(w)) return { kind: 'join', value: w };
    if (COLLAB_TOKEN.test(w)) return { kind: 'collaborate', value: w };
  }
  for (const word of text.split(/[^0-9A-Za-z]+/)) {
    const w = word.toUpperCase();
    if (REFERRAL_CODE.test(w) && /[2-9]/.test(w)) return { kind: 'invite', value: w };
  }
  return null;
}

/** The in-app route the three existing screens already understand. */
export function shareTargetHref(target: ShareTarget): string {
  return `/${target.kind}?${PARAM[target.kind]}=${encodeURIComponent(target.value)}`;
}

// ── Replay after an in-app reload ────────────────────────────────────────────
//
// The URL that launched the app survives Updates.reloadAsync: on iOS
// expo-router takes its initial URL from Linking.getLinkingURL(), which reads
// expo-linking's native ExpoLinkingRegistry singleton — set at a cold launch
// (and by the first link of a process that had none) and NOT cleared by a JS
// reload. RCTLinkingManager.getInitialURL, which app/_layout.tsx reads, replays
// the cold-launch URL the same way from the retained launch options. So when an
// update is applied hours after a student opened an invite, the app would start
// on that invite AGAIN.
//
// What marks the replay is the reload itself. Only AppUpdateGate reloads, and
// it stamps the moment just before (lib/reloadMarker.ts); an `initial` URL
// seen within RELOAD_REPLAY_MS of that stamp is the replay and goes home.
// Anything else is a student tapping a link, which always opens it.
//
// Two earlier versions guessed instead, and both sent a real tap to Today:
// "this share was opened in the last week" caught the same link tapped again
// after iOS closed the app (seen on a device), and "opened under a different
// update" caught it again whenever an update had simply been installed at a
// normal launch in between.

/** A reload restarts JavaScript within seconds; a minute is generous. */
export const RELOAD_REPLAY_MS = 60 * 1000;

/**
 * Decide where a system URL goes. Pure so it can be tested: the caller
 * supplies the reload stamp and the clock.
 *
 * - Not on semoraai.com: returned unchanged (semora://, auth callbacks, the
 *   Google sign-in scheme — nothing that works today can change).
 * - On semoraai.com but not a share link we understand: '/'. The OS only hands
 *   the app paths the association file claims, so this is a malformed or
 *   future link; Today beats "This screen doesn't exist."
 * - A share link: its screen — unless this is the `initial` URL of a JS start
 *   that followed AppUpdateGate's reload, which is the replay above.
 */
export function routeSystemUrl(
  path: string,
  initial: boolean,
  reloadingAt: number | null,
  now: number,
): string {
  const target = parseShareUrl(path);
  if (!target) return isSemoraSiteUrl(path) ? '/' : path;
  const sinceReload = reloadingAt === null ? null : now - reloadingAt;
  const replay = initial && sinceReload !== null && sinceReload >= 0 && sinceReload < RELOAD_REPLAY_MS;
  return replay ? '/' : shareTargetHref(target);
}
