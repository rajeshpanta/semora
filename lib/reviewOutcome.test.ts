/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/reviewOutcome.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  MAX_CARD_DAYS,
  countCardDay,
  decodeCardExposure,
  encodeCardExposure,
  decodeStoreOpen,
  describeReturn,
  encodeStoreOpen,
  nextImpression,
  type StoreOpenStamp,
} from './reviewOutcome';

const stamp = (o: Partial<StoreOpenStamp> = {}): StoreOpenStamp => ({
  surface: 'today',
  at: 1_757_000_000_000,
  region: 'CA',
  ...o,
});

// ── Impressions: one student shown it five times is not five students ────────

Deno.test('the first impression on a device is 1', () => {
  assertEquals(nextImpression(null), 1);
});

Deno.test('impressions count up', () => {
  assertEquals(nextImpression('1'), 2);
  assertEquals(nextImpression('17'), 18);
});

Deno.test('junk in the store does not restart at 2 or crash', () => {
  // A half-written or hand-edited value must read as "no impressions yet".
  assertEquals(nextImpression(''), 1);
  assertEquals(nextImpression('abc'), 1);
  assertEquals(nextImpression('-4'), 1);
  assertEquals(nextImpression('0'), 1);
  assertEquals(nextImpression('3.9'), 4); // parseInt takes the 3
});

// ── The stamp survives the app being killed in the App Store ────────────────

Deno.test('a stamp round-trips through the device store', () => {
  const s = stamp();
  assertEquals(decodeStoreOpen(encodeStoreOpen(s)), s);
});

Deno.test('nothing pending reads as nothing to report', () => {
  assertEquals(decodeStoreOpen(null), null);
  assertEquals(decodeStoreOpen(''), null);
  assertEquals(describeReturn(null, 1), null);
});

Deno.test('a corrupt stamp is ignored rather than thrown', () => {
  assertEquals(decodeStoreOpen('{'), null);
  assertEquals(decodeStoreOpen('{"surface":"today"}'), null); // no timestamp
  assertEquals(decodeStoreOpen('{"at":0}'), null);
  assertEquals(decodeStoreOpen('{"at":"soon"}'), null);
});

Deno.test('an unknown surface falls back to the card, and a blank region to null', () => {
  const d = decodeStoreOpen('{"at":123,"surface":"nowhere","region":""}');
  assertEquals(d, { surface: 'today', at: 123, region: null });
});

// ── How long they were away: the only signal that a rating happened ─────────

const away = (ms: number) => describeReturn(stamp(), stamp().at + ms);

Deno.test('a four-second round trip is a bounce, not a rating', () => {
  // What a composer that never opened looks like: the wrong-storefront error
  // sheet, or Play bouncing straight back.
  assertEquals(away(4_000)?.bucket, 'bounced');
  assertEquals(away(4_000)?.secondsAway, 4);
});

Deno.test('five to twenty seconds is a look', () => {
  assertEquals(away(5_000)?.bucket, 'looked');
  assertEquals(away(19_999)?.bucket, 'looked');
});

Deno.test('twenty seconds or more is long enough to have rated', () => {
  assertEquals(away(20_000)?.bucket, 'long_enough_to_rate');
  assertEquals(away(4 * 60_000)?.bucket, 'long_enough_to_rate');
});

Deno.test('the surface and storefront ride along with the measurement', () => {
  const r = describeReturn(stamp({ surface: 'me', region: 'IN' }), stamp().at + 30_000);
  assertEquals(r?.surface, 'me');
  assertEquals(r?.region, 'IN');
});

Deno.test('a stamp from days ago reports unknown instead of a fake duration', () => {
  // The phone came back a day later: the trip is real but unmeasurable, and
  // "18 hours in the App Store" would poison every average.
  const r = away(18 * 60 * 60 * 1000);
  assertEquals(r?.bucket, 'unknown');
  assertEquals(r?.secondsAway, null);
});

Deno.test('a clock that moved backwards reports unknown, never a negative trip', () => {
  const r = describeReturn(stamp(), stamp().at - 5_000);
  assertEquals(r?.bucket, 'unknown');
  assertEquals(r?.secondsAway, null);
});

// ── The card gives up on its own after three days ───────────────────────────

Deno.test('a day is counted once, however many times the card mounts', () => {
  let e = { days: 0, lastDay: null as string | null };
  e = countCardDay(e, '2026-09-17');
  assertEquals(e, { days: 1, lastDay: '2026-09-17' });
  // An over-the-air reload remounts the card seconds later: not a second day.
  e = countCardDay(e, '2026-09-17');
  assertEquals(e, { days: 1, lastDay: '2026-09-17' });
  e = countCardDay(e, '2026-09-18');
  assertEquals(e, { days: 2, lastDay: '2026-09-18' });
});

Deno.test('the cap is three days', () => {
  assertEquals(MAX_CARD_DAYS, 3);
});

Deno.test('exposure survives the store round trip and shrugs off junk', () => {
  const e = { days: 2, lastDay: '2026-09-17' };
  assertEquals(decodeCardExposure(encodeCardExposure(e)), e);
  assertEquals(decodeCardExposure(null), { days: 0, lastDay: null });
  assertEquals(decodeCardExposure('not json'), { days: 0, lastDay: null });
  assertEquals(decodeCardExposure('{"days":-2,"lastDay":5}'), { days: 0, lastDay: null });
  assertEquals(decodeCardExposure('{"days":2.7,"lastDay":"2026-09-17"}'), { days: 2, lastDay: '2026-09-17' });
});
