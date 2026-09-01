/**
 * The Canvas promotion's decision logic, with no dependencies.
 *
 * Extracted from lib/lms.ts for exactly the reason lib/pickerDiagnostics.ts
 * was: lms.ts reaches supabase, expo-localization and the notification
 * scheduler on import, so nothing in it can be unit-tested, and the rules that
 * decide whether a student is shown a price are the rules that most need to
 * be. lms.ts re-exports every symbol here, so no call site changes and there
 * is still one definition of each.
 *
 * Connections are typed STRUCTURALLY — only the fields these rules read. That
 * keeps this file free of the database types (which pull in lib/constants) and
 * lets callers keep their own richer row type through the generic.
 */

export type CanvasOffer = 'none' | 'needs_attention' | 'new_courses' | 'healthy' | 'locked';

/** The only fields the offer rules read off a connection row. */
export interface CanvasConnectionFacts {
  provider: string;
  free_promo_claimed_at?: string | null;
  background_sync_enabled?: boolean | null;
  last_sync_status?: string | null;
  pending_courses_count?: number | null;
}

/**
 * Where a Canvas connection attempt came from.
 *
 * Carried as a route param from the CTA that started it, through the LMS
 * settings list, into the connect screen, and stamped onto every funnel event
 * that screen fires. A shared constant rather than a literal in four files
 * because attribution that silently stops matching is worse than no
 * attribution: the events keep arriving, the join keeps returning rows, and the
 * experiment reads as a total failure rather than as a typo.
 *
 * `settings` is the default for anyone who simply opened Settings themselves,
 * so "no source" never has to be interpreted as either a bug or a channel.
 */
export const CANVAS_PROMO_SOURCE = 'scan_upsell';
export const CANVAS_SOURCE_DEFAULT = 'settings';

/** Route params carry `string | string[] | undefined`; funnel events need one short string. */
export function canvasSourceOf(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = (value ?? '').trim();
  if (!trimmed) return CANVAS_SOURCE_DEFAULT;
  // Bounded and shape-checked: this reaches analytics from a route param, which
  // a deep link can set to anything. An unknown-but-sane token is still useful
  // signal; a novel or oversized one is not, and must never become a permanent
  // analytics value.
  return /^[a-z0-9_]{1,32}$/.test(trimmed) ? trimmed : CANVAS_SOURCE_DEFAULT;
}

/**
 * A connect failure, as a bounded code.
 *
 * NEVER the provider's message. A Canvas connect error can quote the string the
 * student pasted, and that string is their private calendar-feed URL — a bearer
 * credential that grants read access to their coursework. Putting it in
 * analytics_events would store a live secret in a table several people read.
 *
 * These codes answer the only question the experiment asks — where the flow
 * loses people — and carry nothing that could authenticate as anyone.
 */
export function lmsFailureCode(message: string): string {
  const text = (message ?? '').toLowerCase();
  if (/pro feature/.test(text)) return 'pro_required';
  if (/cancel/.test(text)) return 'cancelled';
  // The five normalizeCanvasCalendarFeedUrl refusals, kept apart because they
  // call for different help: an empty box is a different problem from a link
  // copied out of the wrong Canvas page.
  if (/paste your canvas calendar feed url/.test(text)) return 'feed_url_empty';
  if (/too long/.test(text)) return 'feed_url_too_long';
  if (/complete calendar feed url|not a canvas user calendar feed/.test(text)) return 'feed_url_wrong_page';
  if (/secure https|canvas hostname/.test(text)) return 'feed_url_bad_host';
  if (/network|fetch|timed? ?out|connection/.test(text)) return 'network';
  return 'other';
}

/**
 * Which Canvas treatment, if any, a Pro upsell wall should carry.
 *
 * A function rather than a condition inside the sheet because this is the rule
 * the experiment is actually testing, and "does the promotional card appear on
 * exactly one wall" must be answerable by a test rather than by reading JSX.
 *
 *   'scan_promo'    the limited-time promotional card, BELOW the Pro offer.
 *                   Syllabus wall only.
 *   'course_escape' the plain escape line above the prices, exactly as the
 *                   course wall has shipped since 2026-08-21. Untouched.
 *   'none'          every other wall, every non-free account, and the whole
 *                   loading window.
 *
 * `free` is the promotion's own answer (app_promos.canvas_free or a
 * grandfathered claim), so switching the offer off in the database removes
 * both treatments from builds that shipped months ago, with no release.
 * `offer !== 'healthy'` additionally covers the unresolved window and the
 * student whose Canvas is already syncing — for them this wall is about
 * something else entirely.
 */
export function canvasPromoPlacementFor(
  reason: string,
  offer: CanvasOffer,
  free: boolean,
): 'scan_promo' | 'course_escape' | 'none' {
  if (!free || offer === 'healthy') return 'none';
  if (reason === 'scan') return 'scan_promo';
  if (reason === 'course') return 'course_escape';
  return 'none';
}

/**
 * Is Canvas free for THIS account right now?
 *
 * Two ways to qualify, and the second is the one that makes "limited time"
 * honest: the offer is live, or this account already connected while it was.
 * A claim is stamped by the database on the connection row (090), so ending
 * the offer never reaches backwards and switches off somebody who took it.
 *
 * Separate from canvasOfferFor because the settings screens need this answer
 * before the connection list has loaded — canvasOfferFor deliberately reports
 * 'healthy' while loading so no prompt flashes, and a screen that gated on
 * that would show a paywall for a beat to a student who does not owe anything.
 */
export function canvasFreeFor(
  connections: CanvasConnectionFacts[] | undefined,
  isPro?: boolean,
  freePromoActive?: boolean,
): boolean {
  if (isPro !== false) return false;
  if (freePromoActive === true) return true;
  return (connections ?? []).some((c) => c.free_promo_claimed_at != null);
}

export function canvasOfferFor<T extends CanvasConnectionFacts>(
  connections: T[] | undefined,
  isPro?: boolean,
  freePromoActive?: boolean,
): { offer: CanvasOffer; connection: T | null; free: boolean } {
  // While the query is loading, offer nothing. Flashing "Connect Canvas" at a
  // student who connected it last term, then swapping it out a beat later, is
  // worse than showing it a moment late.
  if (!connections) return { offer: 'healthy', connection: null, free: false };

  const canvas = connections.find((c) => c.provider === 'canvas') ?? null;

  // Pro, the offer is live, or this account claimed it while it was. See
  // canvasFreeFor — lms_access_allowed answers the same question server-side.
  const free = canvasFreeFor(connections, isPro, freePromoActive);

  // The promo answer has not arrived yet.
  //
  // `freePromoActive` is a network read, so `undefined` means "not back yet",
  // NOT "no" — but every branch below treats falsy as a refusal, so the loading
  // window rendered `locked`: a PRO badge on a feature that is free right now.
  // That is not theoretical. Production recorded eight canvas_offer_tapped
  // events carrying offer:'locked' between 2026-08-25 and 2026-08-28, while
  // app_promos.canvas_free was active the entire time — eight students told
  // Canvas costs money by the screen built to tell them it does not.
  //
  // Answered the same way the loading-connections branch above answers it:
  // offer nothing until the answer lands. A beat of silence is recoverable and
  // invisible; a wrong price is neither. This deliberately also covers a FAILED
  // promo read (react-query leaves `data` undefined), which is the existing
  // "fail closed on the copy, not on the feature" rule — the server's
  // lms_access_allowed still decides who may actually sync.
  if (isPro === false && !free && freePromoActive === undefined) {
    return { offer: 'healthy', connection: canvas, free: false };
  }

  // Not Pro, and the offer is not open to them.
  //
  // lms-sync refuses this caller server-side, so a free student who taps
  // "Connect Canvas" reaches Settings, then the paywall — a dead end dressed
  // as a feature, and the second-worst way to learn something costs money. The
  // worst is finding out after connecting.
  //
  // 'locked' still SHOWS the offer, deliberately: hiding it from exactly the
  // people who have not upgraded would be the wrong lesson from "do not
  // dead-end them". It carries a PRO badge and goes straight to the paywall.
  //
  // Checked before the healthy case on purpose. When Pro lapses the server
  // disables background sync and deletes the credential, so a lapsed
  // subscriber's connection is not healthy no matter what the row says — and
  // reconnecting is what they will have to do.
  if (isPro === false && !free) return { offer: 'locked', connection: canvas, free: false };

  if (!canvas) return { offer: 'none', connection: null, free };

  const stalled =
    !canvas.background_sync_enabled ||
    ['error', 'credentials_required'].includes(canvas.last_sync_status ?? '');
  if (stalled) return { offer: 'needs_attention', connection: canvas, free };

  // Syncing perfectly AND holding courses back is not healthy.
  //
  // This is the state a connection lands in when the term turns over: the feed
  // fills with next semester's classes, none of them are linked, and every
  // deadline in them is discarded. The sync reports success the whole time,
  // because nothing it was asked to do failed. Ranked below needs_attention —
  // a broken connection is the bigger problem — but above healthy, because a
  // connection quietly ignoring a semester of work must never render as fine.
  if ((canvas.pending_courses_count ?? 0) > 0) {
    return { offer: 'new_courses', connection: canvas, free };
  }

  return { offer: 'healthy', connection: canvas, free };
}
