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
  lmsOfferFor,
  lmsHiddenIntro,
  lmsOfferName,
  lmsRepairLabel,
  lmsSyncedTitle,
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

Deno.test('the two Moodle dead ends are classified from their text alone', () => {
  // The connect screen offers the syllabus scanner on exactly these two codes,
  // so they have to survive a server that forgot to send `code`.
  assertEquals(
    lmsFailureCode('Your school has turned off calendar export in Moodle, so Semora cannot read it. Ask your Moodle support team, or add classes by scanning a syllabus.'),
    'moodle_export_disabled',
  );
  assertEquals(
    lmsFailureCode("Your school's network is blocking Semora's server. Scan a syllabus, or ask your Moodle support team."),
    'moodle_feed_blocked',
  );
  // And the server's own code still wins over any text.
  assertEquals(lmsFailureCode('anything at all', 'moodle_export_disabled'), 'moodle_export_disabled');
});

Deno.test('a Moodle-only account is offered repair, not "Connect Canvas"', () => {
  // canvasOfferFor was hard-scoped to provider === 'canvas', so a student who
  // had connected Moodle kept being told to connect Canvas on six screens —
  // and needs_attention, the ONLY prompt that catches a dead feed, could never
  // fire for them.
  const moodle = {
    id: 'm1', provider: 'moodle', connection_method: 'calendar_feed',
    last_sync_status: 'success', background_sync_enabled: true,
    last_successful_sync_at: new Date().toISOString(),
    pending_courses_count: 0, free_promo_claimed_at: null,
  } as never;
  assertEquals(canvasOfferFor([moodle], false, true).offer, 'healthy');

  const stalledMoodle = { ...(moodle as object), background_sync_enabled: false } as never;
  const stalled = canvasOfferFor([stalledMoodle], false, true);
  assertEquals(stalled.offer, 'needs_attention');
  assertEquals(lmsRepairLabel(stalled.connection), 'Finish Moodle setup');

  // Canvas keeps strict priority, and keeps its own wording.
  const canvas = { ...(moodle as object), id: 'c1', provider: 'canvas' } as never;
  const both = canvasOfferFor([stalledMoodle, canvas], false, true);
  assertEquals(both.connection?.provider, 'canvas');
  assertEquals(lmsRepairLabel(both.connection), 'Finish Canvas setup');
  assertEquals(lmsRepairLabel(null), 'Finish Canvas setup');
});

// ── 4. One platform at a time (MOODLE_PLAN.md §6.7) ─────────────────────────

const moodleFeed = (overrides: Partial<CanvasConnectionFacts> = {}): CanvasConnectionFacts => ({
  provider: 'moodle',
  free_promo_claimed_at: '2026-09-20T00:00:00Z',
  background_sync_enabled: true,
  last_sync_status: 'success',
  last_successful_sync_at: new Date().toISOString(),
  pending_courses_count: 0,
  ...overrides,
});

Deno.test('canvasOfferFor is lmsOfferFor with no platform named, field for field', () => {
  // The wrapper exists so a Canvas-only account cannot notice the change. Every
  // shape of Canvas account the tests above use, through both doors.
  const cases: Array<[CanvasConnectionFacts[] | undefined, boolean | undefined, boolean | undefined]> = [
    [undefined, false, true],
    [[], false, undefined],
    [[], false, true],
    [[], false, false],
    [[], true, true],
    [[healthyCanvas], false, undefined],
    [[{ ...healthyCanvas, last_sync_status: 'error' }], false, true],
    [[{ ...healthyCanvas, pending_courses_count: 3 }], false, true],
    [[{ ...healthyCanvas, background_sync_enabled: false }], true, false],
  ];
  for (const [connections, isPro, promo] of cases) {
    const wrapped = canvasOfferFor(connections, isPro, promo);
    const { provider: _about, ...general } = lmsOfferFor(connections, isPro, promo);
    assertEquals(wrapped, general);
    // And the wrapper's shape did not grow: surfaces spread it.
    assertEquals(Object.keys(wrapped).sort(), ['connection', 'free', 'offer']);
  }
});

Deno.test('asked about Moodle, a healthy Canvas does not hide a dead Moodle feed', () => {
  // The account-level answer is Canvas's, by design. The per-platform answer is
  // what lets a Moodle surface say "Finish Moodle setup" anyway.
  const connections = [healthyCanvas, moodleFeed({ background_sync_enabled: false })];
  assertEquals(canvasOfferFor(connections, false, true).offer, 'healthy');
  const moodle = lmsOfferFor(connections, false, true, 'moodle');
  assertEquals(moodle.offer, 'needs_attention');
  assertEquals(moodle.provider, 'moodle');
  assertEquals(lmsRepairLabel(moodle.connection), 'Finish Moodle setup');
});

Deno.test('asked about Moodle with no Moodle connection, the answer is an invitation', () => {
  const r = lmsOfferFor([healthyCanvas], false, true, 'moodle');
  assertEquals(r.offer, 'none');
  assertEquals(r.connection, null);
  assertEquals(r.provider, 'moodle');
  // Still free: the claim is on the account, stamped on the Canvas row.
  assertEquals(r.free, true);
});

Deno.test('a Moodle term rollover is new_courses, named as Moodle', () => {
  const r = lmsOfferFor([moodleFeed({ pending_courses_count: 2 })], false, true);
  assertEquals(r.offer, 'new_courses');
  assertEquals(r.provider, 'moodle');
  assertEquals(lmsOfferName(r.connection), 'Moodle');
});

Deno.test('the account-level answer reports which platform it is about', () => {
  assertEquals(lmsOfferFor([healthyCanvas, moodleFeed()], false, true).provider, 'canvas');
  assertEquals(lmsOfferFor([moodleFeed()], false, true).provider, 'moodle');
  // Nothing connected: the invitation is about no platform in particular.
  assertEquals(lmsOfferFor([], false, true).provider, null);
  // Still loading: the same.
  assertEquals(lmsOfferFor(undefined, false, true).provider, null);
});

Deno.test('the promo rules are the same whichever platform is asked about', () => {
  // Unresolved promo: silence, never a price. Resolved off: locked.
  assertEquals(lmsOfferFor([], false, undefined, 'moodle').offer, 'healthy');
  assertEquals(lmsOfferFor([], false, false, 'moodle').offer, 'locked');
  assertEquals(lmsOfferFor([], true, true, 'moodle').free, false);
});

Deno.test('an invitation names both platforms a student can connect alone', () => {
  assertEquals(lmsOfferName(null), 'Canvas or Moodle');
  assertEquals(lmsOfferName(undefined), 'Canvas or Moodle');
  // Never Blackboard in the invitation: it needs a token from school IT.
  assertEquals(lmsOfferName(null).includes('Blackboard'), false);
});

Deno.test('a connected student hears their own platform, and Canvas is unchanged', () => {
  assertEquals(lmsOfferName({ provider: 'canvas' }), 'Canvas');
  assertEquals(lmsOfferName({ provider: 'moodle' }), 'Moodle');
  assertEquals(lmsOfferName({ provider: 'blackboard' }), 'Blackboard');
  // A platform this build does not know is an invitation, not a blank.
  assertEquals(lmsOfferName({ provider: 'sakai' }), 'Canvas or Moodle');
});

Deno.test('the sync alert names the platform that was synced', () => {
  assertEquals(lmsSyncedTitle('moodle'), 'Moodle synced');
  assertEquals(lmsSyncedTitle('canvas'), 'Canvas synced');
  assertEquals(lmsSyncedTitle('blackboard'), 'Blackboard synced');
  // Not known (or not loaded): the old title, never an invented name.
  assertEquals(lmsSyncedTitle(undefined), 'LMS synced');
  assertEquals(lmsSyncedTitle('sakai'), 'LMS synced');
});

Deno.test('hidden work is said to be where it actually is', () => {
  const CANVAS = 'Assignments you have hidden from Semora. They are still in Canvas — hiding one here never changes anything there.';
  // A Canvas-only account reads, byte for byte, the sentence it always has —
  // loaded, loading, and with or without the platform in the route.
  assertEquals(lmsHiddenIntro([{ provider: 'canvas' }]), CANVAS);
  assertEquals(lmsHiddenIntro([{ provider: 'canvas' }, { provider: 'canvas' }], 'canvas'), CANVAS);
  assertEquals(lmsHiddenIntro(undefined), CANVAS);
  assertEquals(lmsHiddenIntro(undefined, 'canvas'), CANVAS);

  // A Moodle student is no longer told it is still in Canvas.
  assertEquals(
    lmsHiddenIntro([{ provider: 'moodle' }]),
    'Assignments you have hidden from Semora. They are still in Moodle — hiding one here never changes anything there.',
  );
  assertEquals(lmsHiddenIntro(undefined, 'moodle'), lmsHiddenIntro([{ provider: 'moodle' }]));

  // The list is the whole account's: with two platforms, neither is named.
  const mixed = lmsHiddenIntro([{ provider: 'canvas' }, { provider: 'moodle' }], 'moodle');
  assert(!/Canvas|Moodle/.test(mixed), mixed);
  assert(mixed.includes('your school’s learning platform'), mixed);
  // Nothing connected any more (the tasks outlived the connection): no name.
  assert(!/Canvas|Moodle/.test(lmsHiddenIntro([])));
});
