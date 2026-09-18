/**
 * What happened after we asked for a rating.
 *
 * The ask itself was measurable and the outcome was not. Production, all time:
 * 294 rating-card impressions, 3 taps, 143 native prompts, and 8 ratings in the
 * App Store — with no way to connect any of those to each other. Apple's
 * `requestReview()` reports nothing, the write-review composer is a web link
 * that leaves the app, and a student who ignores the card produced no event at
 * all, so "dismissed", "tapped and bounced" and "tapped and wrote a review"
 * were one undifferentiated silence.
 *
 * Three things close that gap, none of which needs Apple to tell us anything:
 *
 *   1. Every outcome is an event. Shown, dismissed, tapped, and failed-to-open
 *      are all recorded, with the impression number, so "asked five times and
 *      ignored" is visible instead of looking like "never asked".
 *   2. How long the student was away. Opening the composer backgrounds Semora;
 *      coming back marks the end. Writing a rating takes a while, and a
 *      composer that did not open at all comes back in about a second. The
 *      buckets below are that difference, and they survive the app being killed
 *      in the App Store, because the open is stamped on the device.
 *   3. The storefront. The composer link used to be hardcoded to /us/, which
 *      lands a non-US account on "not available in the U.S. store", so the
 *      region belongs on the event that measures whether a tap worked.
 *
 * None of it proves a rating was left — only Apple's public rating count does,
 * which is why `scripts/store-ratings.mjs` records that separately. This is the
 * behavioural half: who we asked, what they did, and whether the store even
 * opened for them.
 */

/** Device-store keys. Dots, never colons: a ':' key silently fails in SecureStore. */
export const REVIEW_IMPRESSIONS_KEY = 'semora.review.card.impressions';
export const REVIEW_STORE_OPENED_KEY = 'semora.review.store.opened';
export const REVIEW_CARD_DAYS_KEY = 'semora.review.card.days';

/**
 * How many separate days the card may appear before it gives up on its own.
 *
 * Its own doc comment claimed "shown once ever"; the gate only ever suppressed
 * it after a dismissal, so a student who scrolled past it got it again every
 * launch — measured: one student 32 times over 14 days, 17 students five times
 * or more, up to 7 appearances in a single day. Three days is two reminders
 * more than the docstring promised and far short of the point where a rating
 * card becomes the reason someone leaves one star.
 */
export const MAX_CARD_DAYS = 3;

/** Days the card has been shown, and the last one, so repeats within a day are free. */
export interface CardExposure {
  days: number;
  lastDay: string | null;
}

export function decodeCardExposure(raw: string | null): CardExposure {
  if (!raw) return { days: 0, lastDay: null };
  try {
    const parsed = JSON.parse(raw) as Partial<CardExposure>;
    const days = typeof parsed?.days === 'number' && Number.isFinite(parsed.days) && parsed.days > 0
      ? Math.floor(parsed.days)
      : 0;
    const lastDay = typeof parsed?.lastDay === 'string' && parsed.lastDay ? parsed.lastDay : null;
    return { days, lastDay };
  } catch {
    return { days: 0, lastDay: null };
  }
}

export function encodeCardExposure(exposure: CardExposure): string {
  return JSON.stringify(exposure);
}

/**
 * A day is counted once. An over-the-air reload remounts the card — 43 of the
 * repeat impressions were exactly that, a new JS bundle one second after the
 * last — and a bundle swap is not a second day of being asked.
 */
export function countCardDay(previous: CardExposure, today: string): CardExposure {
  if (previous.lastDay === today) return previous;
  return { days: previous.days + 1, lastDay: today };
}

/** Where a rating ask lives. The Today card, or the row in the Me tab. */
export type ReviewSurface = 'today' | 'me';

/**
 * A stamp of "we just sent this student to the store composer", written before
 * the app loses the foreground so the return can be measured on any later
 * launch, not only on a resume.
 */
export interface StoreOpenStamp {
  surface: ReviewSurface;
  at: number;
  /** The storefront we sent them to, for the region-specific failure modes. */
  region: string | null;
}

/** An unreasonable gap means the stamp outlived its session: report, don't guess. */
const MAX_MEASURABLE_AWAY_MS = 6 * 60 * 60 * 1000;
/** Below this, the composer cannot plausibly have been read, let alone used. */
const BOUNCE_MS = 5000;
/** Long enough to pick stars and post; shorter than this is a look, not a rating. */
const WROTE_SOMETHING_MS = 20000;

export type AwayBucket = 'bounced' | 'looked' | 'long_enough_to_rate' | 'unknown';

export function nextImpression(stored: string | null): number {
  const n = Number.parseInt(stored ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n + 1 : 1;
}

export function encodeStoreOpen(stamp: StoreOpenStamp): string {
  return JSON.stringify(stamp);
}

/** Tolerant by design: a malformed or half-written stamp must never throw on launch. */
export function decodeStoreOpen(raw: string | null): StoreOpenStamp | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoreOpenStamp>;
    const at = typeof parsed?.at === 'number' && Number.isFinite(parsed.at) ? parsed.at : null;
    if (at === null || at <= 0) return null;
    const surface: ReviewSurface = parsed.surface === 'me' ? 'me' : 'today';
    const region = typeof parsed.region === 'string' && parsed.region ? parsed.region : null;
    return { surface, at, region };
  } catch {
    return null;
  }
}

/**
 * The return itself. `null` means there is nothing to report — no pending open,
 * or a clock that moved backwards (a timezone change, a manual clock edit),
 * where a negative duration would be worse than no measurement.
 */
export function describeReturn(
  stamp: StoreOpenStamp | null,
  nowMs: number,
): { surface: ReviewSurface; region: string | null; secondsAway: number | null; bucket: AwayBucket } | null {
  if (!stamp) return null;
  const elapsed = nowMs - stamp.at;
  if (elapsed < 0) return { surface: stamp.surface, region: stamp.region, secondsAway: null, bucket: 'unknown' };
  if (elapsed > MAX_MEASURABLE_AWAY_MS) {
    return { surface: stamp.surface, region: stamp.region, secondsAway: null, bucket: 'unknown' };
  }
  const bucket: AwayBucket =
    elapsed < BOUNCE_MS ? 'bounced' : elapsed < WROTE_SOMETHING_MS ? 'looked' : 'long_enough_to_rate';
  return { surface: stamp.surface, region: stamp.region, secondsAway: Math.round(elapsed / 1000), bucket };
}
