/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --allow-read --config lib/deno.test.json lib/canvasPromo.test.ts
 *
 * Three things are being defended here, and only one of them is new.
 *
 * 1. The syllabus wall is the ONLY wall that gets the promotional card. An
 *    experiment that quietly leaks onto a second paywall cannot be read
 *    afterwards, because the control group stopped existing.
 * 2. A free feature is NEVER priced. The promo answer arrives over the network,
 *    and while it is in flight every branch used to treat it as "no" — which
 *    put a PRO badge on Canvas while canvas_free was live. Production recorded
 *    that happening eight times.
 * 3. A private Canvas feed URL never reaches analytics. It is a bearer
 *    credential, and connect errors quote the string that was pasted.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  CANVAS_PROMO_SOURCE,
  CANVAS_SOURCE_DEFAULT,
  type CanvasConnectionFacts,
  canvasFreeFor,
  canvasOfferFor,
  canvasPromoPlacementFor,
  canvasSourceOf,
  lmsFailureCode,
} from './canvasPromo';

const healthyCanvas: CanvasConnectionFacts = {
  provider: 'canvas',
  free_promo_claimed_at: '2026-08-22T00:00:00Z',
  background_sync_enabled: true,
  last_sync_status: 'success',
  pending_courses_count: 0,
};

// ── 1. Scan-only placement ──────────────────────────────────────────────────

Deno.test('the promotional card appears on the syllabus wall', () => {
  assertEquals(canvasPromoPlacementFor('scan', 'none', true), 'scan_promo');
});

Deno.test('the course wall keeps the plain escape, not the promotion', () => {
  assertEquals(canvasPromoPlacementFor('course', 'none', true), 'course_escape');
});

Deno.test('no other wall carries any Canvas treatment', () => {
  // Every reason the sheet knows about. If a new one is added and someone
  // wires it into the promotion by accident, this fails rather than shipping.
  const others = [
    'notes', 'lecture', 'canvas', 'tutor', 'flashcards', 'insights', 'dashboard',
    'planner', 'pomodoro', 'grades', 'reminders', 'streak', 'risk', 'share',
    'collaboration', 'calendar', 'quiz', 'semester',
  ];
  for (const reason of others) {
    assertEquals(canvasPromoPlacementFor(reason, 'none', true), 'none', reason);
  }
});

Deno.test('the promotion vanishes when the offer is switched off', () => {
  // `free` is app_promos.canvas_free reaching the client. Turning the row off
  // must remove the card from builds already on phones, with no release.
  assertEquals(canvasPromoPlacementFor('scan', 'none', false), 'none');
  assertEquals(canvasPromoPlacementFor('course', 'none', false), 'none');
});

Deno.test('a student whose Canvas already syncs is not offered it again', () => {
  assertEquals(canvasPromoPlacementFor('scan', 'healthy', true), 'none');
});

Deno.test('a stalled or term-rollover connection still gets the offer', () => {
  // These are the two states where Canvas is connected but not delivering, and
  // the syllabus wall is exactly where noticing that is useful.
  assertEquals(canvasPromoPlacementFor('scan', 'needs_attention', true), 'scan_promo');
  assertEquals(canvasPromoPlacementFor('scan', 'new_courses', true), 'scan_promo');
});

// ── 2. The unresolved-promo race ────────────────────────────────────────────

Deno.test('an unresolved promo NEVER renders Canvas as Pro', () => {
  // The regression. isPro is known false, the promo read has not landed, and
  // the account has no claim yet — the exact shape of the eight production taps
  // that carried offer:'locked' while canvas_free was active.
  const result = canvasOfferFor([], false, undefined);
  assertEquals(result.offer, 'healthy', 'must not be "locked" while the answer is in flight');
  assertEquals(result.free, false);
});

Deno.test('an unresolved promo offers nothing at all, rather than guessing', () => {
  // 'healthy' is how this file already says "offer nothing" — every caller
  // hides its Canvas affordance on it. Silence for a beat, not a wrong price.
  assertEquals(canvasPromoPlacementFor('scan', canvasOfferFor([], false, undefined).offer, false), 'none');
});

Deno.test('a FAILED promo read is treated as unresolved, not as a refusal', () => {
  // react-query leaves `data` undefined when the query errors, so this is the
  // same input as "still loading" — and must reach the same answer.
  assertEquals(canvasOfferFor([], false, undefined).offer, 'healthy');
});

Deno.test('once the promo resolves ACTIVE, Canvas is free and offered', () => {
  const result = canvasOfferFor([], false, true);
  assertEquals(result.offer, 'none'); // 'none' = no connection yet, so offer one
  assertEquals(result.free, true);
});

Deno.test('once the promo resolves INACTIVE, locked is still correct', () => {
  // The pre-existing behaviour is deliberate and must survive the fix: a free
  // account with no offer running genuinely does need Pro for Canvas.
  const result = canvasOfferFor([], false, false);
  assertEquals(result.offer, 'locked');
  assertEquals(result.free, false);
});

Deno.test('a grandfathered account is free even before the promo answer lands', () => {
  // They claimed the offer while it ran; ending it must never reach backwards.
  const result = canvasOfferFor([healthyCanvas], false, undefined);
  assertEquals(result.free, true);
  assertEquals(result.offer, 'healthy');
});

Deno.test('Pro accounts are never described as being on the free promotion', () => {
  assertEquals(canvasFreeFor([], true, true), false);
  assertEquals(canvasOfferFor([], true, true).free, false);
});

Deno.test('a loading connection list still offers nothing', () => {
  assertEquals(canvasOfferFor(undefined, false, true).offer, 'healthy');
});

Deno.test('a stalled connection is needs_attention, not healthy', () => {
  const stalled = { ...healthyCanvas, last_sync_status: 'error' };
  assertEquals(canvasOfferFor([stalled], false, true).offer, 'needs_attention');
});

Deno.test('a connection holding courses back is new_courses, not healthy', () => {
  const pending = { ...healthyCanvas, pending_courses_count: 3 };
  assertEquals(canvasOfferFor([pending], false, true).offer, 'new_courses');
});

// ── 3. Attribution and redaction ────────────────────────────────────────────

Deno.test('the scan CTA is attributed, and a bare arrival defaults to settings', () => {
  assertEquals(canvasSourceOf(CANVAS_PROMO_SOURCE), 'scan_upsell');
  assertEquals(canvasSourceOf(undefined), CANVAS_SOURCE_DEFAULT);
  assertEquals(canvasSourceOf(''), CANVAS_SOURCE_DEFAULT);
  assertEquals(canvasSourceOf('   '), CANVAS_SOURCE_DEFAULT);
});

Deno.test('a route param carrying an array still yields one source', () => {
  assertEquals(canvasSourceOf(['scan_upsell', 'settings']), 'scan_upsell');
});

Deno.test('a hostile or oversized source never becomes an analytics value', () => {
  assertEquals(canvasSourceOf('a'.repeat(200)), CANVAS_SOURCE_DEFAULT);
  assertEquals(canvasSourceOf('Robert; DROP TABLE'), CANVAS_SOURCE_DEFAULT);
  assertEquals(canvasSourceOf('scan upsell'), CANVAS_SOURCE_DEFAULT);
  assertEquals(canvasSourceOf('<script>'), CANVAS_SOURCE_DEFAULT);
});

Deno.test('connect failures are classified, and the pasted URL never survives', () => {
  // The five real refusals from normalizeCanvasCalendarFeedUrl, plus the two
  // server outcomes the connect screen already branches on.
  assertEquals(lmsFailureCode('Paste your Canvas Calendar Feed URL.'), 'feed_url_empty');
  assertEquals(lmsFailureCode('The Canvas Calendar Feed URL is too long.'), 'feed_url_too_long');
  // Split: nothing-that-is-a-link vs a real Canvas URL from the wrong page.
  assertEquals(lmsFailureCode('Paste the complete Calendar Feed URL copied from Canvas.'), 'feed_url_unparseable');
  assertEquals(
    lmsFailureCode('This is not a Canvas user Calendar Feed URL. In Canvas, open Calendar → Calendar Feed and copy the URL shown there.'),
    'feed_url_wrong_page',
  );
  assertEquals(lmsFailureCode('Canvas Calendar Feed URLs must use secure HTTPS.'), 'feed_url_bad_host');
  assertEquals(lmsFailureCode('Canvas Calendar Feed URLs must use your school’s Canvas hostname.'), 'feed_url_bad_host');
  assertEquals(lmsFailureCode('Canvas sync is a Pro feature.'), 'pro_required');
  assertEquals(lmsFailureCode('The user cancelled the request'), 'cancelled');
  assertEquals(lmsFailureCode(''), 'other');
});

Deno.test('a message quoting a live feed URL cannot leak through the code', () => {
  // The whole reason this function exists. Whatever the provider says, the
  // value that reaches analytics is a fixed token from a closed set.
  const secret = 'https://school.instructure.com/feeds/calendars/user_SECRETTOKEN123.ics';
  const codes = [
    lmsFailureCode(`Could not read ${secret}`),
    lmsFailureCode(`Paste the complete Calendar Feed URL copied from Canvas. Got ${secret}`),
    lmsFailureCode(secret),
  ];
  const allowed = new Set([
    'pro_required', 'cancelled', 'feed_url_empty', 'feed_url_too_long',
    'feed_url_wrong_page', 'feed_url_unparseable', 'feed_url_bad_host', 'network', 'other',
  ]);
  for (const code of codes) {
    assert(allowed.has(code), `unexpected code: ${code}`);
    assert(!code.includes('SECRETTOKEN123'), 'the feed token reached analytics');
    assert(!code.includes('instructure'), 'the school hostname reached analytics');
  }
});
