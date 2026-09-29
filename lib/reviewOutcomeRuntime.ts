import { Linking, Platform } from 'react-native';
import { getLocales } from 'expo-localization';

import { APP_STORE_REVIEW_URL, PLAY_STORE_REVIEW_URL } from '@/lib/constants';
import { track, trackBeforeLeaving } from '@/lib/analytics';
import { getDeviceItem, setDeviceItem, deleteDeviceItem } from '@/lib/deviceStore';
import {
  REVIEW_CARD_DAYS_KEY,
  REVIEW_IMPRESSIONS_KEY,
  REVIEW_STORE_OPENED_KEY,
  countCardDay,
  decodeCardExposure,
  decodeStoreOpen,
  describeReturn,
  encodeCardExposure,
  encodeStoreOpen,
  nextImpression,
  type ReviewSurface,
} from '@/lib/reviewOutcome';

/**
 * The device-side half of lib/reviewOutcome: the same rules, wired to the
 * store, the clock and the composer. Kept apart so the rules stay testable
 * without a React Native runtime.
 */

/** The storefront the composer will open in. Coarse (a country), never a locale. */
function deviceRegion(): string | null {
  try {
    return getLocales()[0]?.regionCode ?? null;
  } catch {
    return null;
  }
}

/**
 * Counts the card's appearances on this device, so one student shown it five
 * times is not five students shown it once — which is exactly how the first
 * 294 impressions read.
 */
export function bumpCardImpression(): number {
  const n = nextImpression(getDeviceItem(REVIEW_IMPRESSIONS_KEY));
  setDeviceItem(REVIEW_IMPRESSIONS_KEY, String(n));
  return n;
}

/**
 * Days the card has appeared on this device. Read by the gate, which stops
 * asking past MAX_CARD_DAYS, so ignoring the card ends it as surely as the X.
 */
export function cardDaysShown(): number {
  return decodeCardExposure(getDeviceItem(REVIEW_CARD_DAYS_KEY)).days;
}

/** Counted once per device-local day, so an over-the-air reload is free. */
export function noteCardDay(today: string): number {
  const next = countCardDay(decodeCardExposure(getDeviceItem(REVIEW_CARD_DAYS_KEY)), today);
  setDeviceItem(REVIEW_CARD_DAYS_KEY, encodeCardExposure(next));
  return next.days;
}

export function cardImpressions(): number {
  const raw = Number.parseInt(getDeviceItem(REVIEW_IMPRESSIONS_KEY) ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * Send a student who asked to rate Semora to the store's review composer, and
 * record enough to tell afterwards whether it worked.
 *
 * The event goes out with `trackBeforeLeaving` because the next thing that
 * happens is the app losing the foreground; a plain fire-and-forget insert can
 * still be in flight when that happens.
 */
export async function openReviewComposer(
  surface: ReviewSurface,
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  const region = deviceRegion();
  const url = Platform.OS === 'android' ? PLAY_STORE_REVIEW_URL : APP_STORE_REVIEW_URL;
  const fields = { screen: surface, region, platform: Platform.OS, ...extra };

  // Stamped before the link opens: on iOS the app can be suspended by the time
  // an awaited openURL resolves, and a stamp written after that never lands.
  setDeviceItem(REVIEW_STORE_OPENED_KEY, encodeStoreOpen({ surface, at: Date.now(), region }));
  await trackBeforeLeaving('rating_store_opened', fields);
  try {
    await Linking.openURL(url);
    return true;
  } catch (error) {
    // Nothing opened, so nothing will come back: clear the stamp or the next
    // launch reports a return from a composer the student never saw.
    deleteDeviceItem(REVIEW_STORE_OPENED_KEY);
    track('rating_store_open_failed', {
      ...fields,
      message: error instanceof Error ? error.message.slice(0, 120) : undefined,
    });
    return false;
  }
}

/**
 * Called when Semora comes back to the foreground, and once on launch. Reports
 * how long the student spent in the store — the only signal available for
 * "they actually rated", since Apple and Google both report nothing.
 */
export function reportReviewReturn(): void {
  const stamp = decodeStoreOpen(getDeviceItem(REVIEW_STORE_OPENED_KEY));
  if (!stamp) return;
  deleteDeviceItem(REVIEW_STORE_OPENED_KEY);
  const result = describeReturn(stamp, Date.now());
  if (!result) return;
  track('rating_store_returned', {
    screen: result.surface,
    region: result.region,
    platform: Platform.OS,
    seconds_away: result.secondsAway,
    bucket: result.bucket,
    impressions: cardImpressions(),
  });
}
