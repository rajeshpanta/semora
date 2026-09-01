/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --allow-read --config lib/deno.test.json lib/proCanvasEducation.test.ts
 *
 * The thing under test is an interruption aimed at people who already pay, so
 * the tests are weighted toward the ways it could be WRONG rather than the one
 * way it is right: shown to a free user, shown to someone who already connected
 * Canvas, shown a third time, shown again the day after a "not now", or shown
 * during a loading window when we cannot yet know any of that.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  COOLDOWN_DAYS,
  INITIAL_STATE,
  MAX_SHOWS,
  PRO_CANVAS_EDU_FLAG_KEY,
  PRO_CANVAS_EDU_SOURCE,
  parseProCanvasEduState,
  proCanvasEduStorageKey,
  recordConnected,
  recordDismissed,
  recordShown,
  serializeProCanvasEduState,
  shouldShowProCanvasEducation,
  type ProCanvasEduState,
} from './proCanvasEducation';
import { CANVAS_PROMO_SOURCE, canvasSourceOf } from './canvasPromo';

const NOW = Date.parse('2026-09-01T12:00:00Z');
const base = {
  flagActive: true as boolean | undefined,
  isPro: true as boolean | undefined,
  connectionsLoaded: true,
  hasAnyConnection: false,
  state: INITIAL_STATE,
  now: NOW,
};
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

// ── Remote kill switch ──────────────────────────────────────────────────────

Deno.test('flag ACTIVE: normal eligibility applies', () => {
  assertEquals(shouldShowProCanvasEducation({ ...base, flagActive: true }), true);
});

Deno.test('flag INACTIVE: never shown, however eligible the account is', () => {
  assertEquals(shouldShowProCanvasEducation({ ...base, flagActive: false }), false);
});

Deno.test('flag UNRESOLVED is treated as off, not as on', () => {
  // A slow or failed promo_active() read must silence the modal. The OFF
  // position of a kill switch has to be the one you reach by accident.
  assertEquals(shouldShowProCanvasEducation({ ...base, flagActive: undefined }), false);
});

Deno.test('the flag outranks every other condition', () => {
  // Even a brand-new, perfectly eligible Pro account sees nothing while off.
  const perfect = { ...base, flagActive: false, state: INITIAL_STATE, hasAnyConnection: false };
  assertEquals(shouldShowProCanvasEducation(perfect), false);
});

Deno.test('the flag key is its own row, never canvas_free', () => {
  assertEquals(PRO_CANVAS_EDU_FLAG_KEY, 'pro_canvas_education');
  const key: string = PRO_CANVAS_EDU_FLAG_KEY;
  assert(key !== 'canvas_free',
    'sharing a row with the free promotion would make one switch move the other');
});

// ── Eligibility ─────────────────────────────────────────────────────────────

Deno.test('Pro with no Canvas is eligible', () => {
  assert(shouldShowProCanvasEducation(base));
});

Deno.test('Pro with a HEALTHY Canvas connection is never shown it', () => {
  assertEquals(shouldShowProCanvasEducation({ ...base, hasAnyConnection: true }), false);
});

Deno.test('Pro with a BROKEN connection is still never shown it', () => {
  // hasAnyConnection is deliberately any connection, not a healthy one: a
  // student whose sync is failing needs "Finish Canvas setup", not an
  // introduction to a feature they already found.
  assertEquals(shouldShowProCanvasEducation({ ...base, hasAnyConnection: true }), false);
});

Deno.test('a free account never sees it', () => {
  assertEquals(shouldShowProCanvasEducation({ ...base, isPro: false }), false);
});

Deno.test('an UNRESOLVED Pro answer is treated as not-Pro', () => {
  // Same fail-closed rule as canvasOfferFor: never make a claim during a
  // loading window.
  assertEquals(shouldShowProCanvasEducation({ ...base, isPro: undefined }), false);
});

Deno.test('nothing is shown until the connection list has loaded', () => {
  assertEquals(shouldShowProCanvasEducation({ ...base, connectionsLoaded: false }), false);
});

// ── Frequency ───────────────────────────────────────────────────────────────

Deno.test('after the first showing it goes quiet for the cooldown', () => {
  const shown = recordShown(INITIAL_STATE, daysAgo(0));
  assertEquals(shouldShowProCanvasEducation({ ...base, state: shown }), false);
  const nextDay = { ...base, state: shown, now: NOW + 24 * 60 * 60 * 1000 };
  assertEquals(shouldShowProCanvasEducation(nextDay), false, 'must not return the next day');
});

Deno.test('the second showing arrives only after a full week', () => {
  const almost = { shows: 1, lastShownAt: daysAgo(COOLDOWN_DAYS - 1), dismissedForever: false };
  assertEquals(shouldShowProCanvasEducation({ ...base, state: almost }), false);
  const due = { shows: 1, lastShownAt: daysAgo(COOLDOWN_DAYS), dismissedForever: false };
  assertEquals(shouldShowProCanvasEducation({ ...base, state: due }), true);
});

Deno.test('there is never a third showing', () => {
  const twice = { shows: MAX_SHOWS, lastShownAt: daysAgo(365), dismissedForever: false };
  assertEquals(shouldShowProCanvasEducation({ ...base, state: twice }), false);
});

Deno.test('a second dismissal ends it permanently', () => {
  let s: ProCanvasEduState = INITIAL_STATE;
  s = recordShown(s, daysAgo(COOLDOWN_DAYS));
  s = recordDismissed(s);
  assertEquals(s.dismissedForever, false, 'one "not now" is not forever');
  s = recordShown(s, daysAgo(0));
  s = recordDismissed(s);
  assertEquals(s.dismissedForever, true);
  assertEquals(shouldShowProCanvasEducation({ ...base, state: s, now: NOW + 1e10 }), false);
});

Deno.test('a missing or unparseable timestamp does not unlock the second showing', () => {
  for (const bad of [null, 'not a date']) {
    const s = { shows: 1, lastShownAt: bad as any, dismissedForever: false };
    assertEquals(shouldShowProCanvasEducation({ ...base, state: s }), false);
  }
});

// ── Connection is terminal ──────────────────────────────────────────────────

Deno.test('connecting Canvas suppresses it permanently', () => {
  const s = recordConnected(recordShown(INITIAL_STATE, daysAgo(30)));
  assertEquals(s.dismissedForever, true);
  assertEquals(shouldShowProCanvasEducation({ ...base, state: s }), false);
});

Deno.test('DISCONNECTING later does not restart the nagging', () => {
  // The scenario that would feel worst: connect, change your mind, and be
  // introduced to the feature all over again.
  const afterConnect = recordConnected(INITIAL_STATE);
  const nowDisconnected = { ...base, state: afterConnect, hasAnyConnection: false, now: NOW + 1e10 };
  assertEquals(shouldShowProCanvasEducation(nowDisconnected), false);
});

// ── Persistence ─────────────────────────────────────────────────────────────

Deno.test('state survives a serialize/parse round trip', () => {
  const s = { shows: 1, lastShownAt: daysAgo(3), dismissedForever: false };
  assertEquals(parseProCanvasEduState(serializeProCanvasEduState(s)), s);
});

Deno.test('absent state means never shown', () => {
  assertEquals(parseProCanvasEduState(null), INITIAL_STATE);
  assertEquals(parseProCanvasEduState(undefined), INITIAL_STATE);
});

Deno.test('CORRUPT state fails toward silence, not toward showing', () => {
  // The opposite of the lecture-consent gate, on purpose: there, a lost record
  // means ask again; here it would mean interrupt a paying customer who may
  // already have declined twice.
  const corrupt = parseProCanvasEduState('{not json');
  assertEquals(corrupt.dismissedForever, true);
  assertEquals(shouldShowProCanvasEducation({ ...base, state: corrupt }), false);
  const nonsense = parseProCanvasEduState('{"shows":"banana"}');
  assertEquals(shouldShowProCanvasEducation({ ...base, state: nonsense }), false);
});

Deno.test('storage is scoped per account', () => {
  const a = proCanvasEduStorageKey('user-a');
  const b = proCanvasEduStorageKey('user-b');
  assert(a !== b, 'two students on one phone must not share an answer');
  assert(a.includes('user-a') && a.startsWith('semora_pro_canvas_edu_v1:'));
});

// ── Analytics isolation ─────────────────────────────────────────────────────

Deno.test('this flow is a DIFFERENT cohort from the Phase 1 free experiment', () => {
  // Widened to string on purpose: as literal types TypeScript proves these can
  // never be equal and rejects the comparison outright — which is a stronger
  // guarantee than this assertion, but not one that compiles. The runtime check
  // stays as the thing a future edit to either constant would trip over.
  const pro: string = PRO_CANVAS_EDU_SOURCE;
  const free: string = CANVAS_PROMO_SOURCE;
  assert(pro !== free,
    'sharing a source token would merge paying subscribers into the free scan-wall cohort');
  assertEquals(PRO_CANVAS_EDU_SOURCE, 'pro_canvas_education');
  assertEquals(CANVAS_PROMO_SOURCE, 'scan_upsell');
});

Deno.test('the source token survives the connect flow intact', () => {
  // canvasSourceOf sanitises anything arriving as a route param; if it rejected
  // this token the events would silently be attributed to 'settings'.
  assertEquals(canvasSourceOf(PRO_CANVAS_EDU_SOURCE), 'pro_canvas_education');
});
