import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  decideUpdate, isProtectedRoute, NEVER_RELOAD_ROUTES, AUTO_UPDATE_FLAG_KEY, FETCH_TIMEOUT_MS,
  COLD_START_GRACE_MS, TRACK_FLUSH_MS, parseReloadGuard, serializeReloadGuard,
  reloadBlocked, nextReloadGuard, MAX_RELOAD_ATTEMPTS,
} from '@/lib/appUpdate.ts';

const base = {
  isUpdatePending: true, enabled: true,
  moment: 'cold-start' as const, pathname: '/(tabs)', alreadyAppliedThisSession: false,
};

Deno.test('a pending update applies at cold start', () => {
  assertEquals(decideUpdate(base).apply, true);
  assertEquals(decideUpdate(base).reason, 'applying');
});

Deno.test('and on resume, because they already walked away from whatever they were doing', () => {
  assertEquals(decideUpdate({ ...base, moment: 'resumed' }).apply, true);
});

Deno.test('never mid-session — a reload would yank the app out from under them', () => {
  const d = decideUpdate({ ...base, moment: 'mid-session' });
  assertEquals(d.apply, false);
  assertEquals(d.reason, 'unsafe-moment');
});

Deno.test('the flag must be explicitly on; a failed read leaves today behaviour', () => {
  const d = decideUpdate({ ...base, enabled: false });
  assertEquals(d.apply, false);
  assertEquals(d.reason, 'kill-switch-off');
});

Deno.test('nothing to apply is not an error', () => {
  assertEquals(decideUpdate({ ...base, isUpdatePending: false }).reason, 'no-update-pending');
});

Deno.test('at most once per session, so a reload can never loop', () => {
  const d = decideUpdate({ ...base, alreadyAppliedThisSession: true });
  assertEquals(d.apply, false);
  assertEquals(d.reason, 'already-applied');
});

Deno.test('never while a lecture is being recorded — that audio is unrecoverable', () => {
  for (const route of ['/lecture/record', '/lecture/new', '/lecture/record/step-2']) {
    const d = decideUpdate({ ...base, pathname: route });
    assertEquals(d.apply, false, route);
    assertEquals(d.reason, 'protected-route');
  }
});

Deno.test('never mid sign-up, sign-in, or Canvas connect', () => {
  for (const route of ['/onboarding', '/sign-in', '/settings/lms-connect']) {
    assertEquals(decideUpdate({ ...base, pathname: route }).apply, false, route);
  }
});

Deno.test('ordinary screens are fine', () => {
  for (const route of ['/(tabs)', '/(tabs)/courses', '/task/abc', '/settings', null, undefined]) {
    assertEquals(decideUpdate({ ...base, pathname: route as any }).apply, true, String(route));
  }
});

Deno.test('route matching is prefix-safe, not substring-sloppy', () => {
  assertEquals(isProtectedRoute('/lecture/record'), true);
  assertEquals(isProtectedRoute('/lecture/record/anything'), true);
  // must NOT match a different route that merely contains the word
  assertEquals(isProtectedRoute('/lectures'), false);
  assertEquals(isProtectedRoute('/settings/lms'), false);
  assertEquals(isProtectedRoute('/my/onboarding-notes'), false);
});

Deno.test('the guard list and constants are what the runtime expects', () => {
  assertEquals(NEVER_RELOAD_ROUTES.includes('/lecture/record'), true);
  assertEquals(AUTO_UPDATE_FLAG_KEY, 'auto_update_reload');
  assertEquals(FETCH_TIMEOUT_MS <= 5000, true);
});

// ── Regression guards for two bugs found in review, before shipping ────────

Deno.test('the flag being unread is indistinguishable from off, and both mean no reload', () => {
  // The first implementation fired the cold-start attempt before the flag query
  // resolved. Because the native layer usually has the update ALREADY
  // downloaded, there was no await before the decision, so it read the flag's
  // initial false and bailed — the cold-start path would have been dead the day
  // the flag was switched on. The runtime now waits for isFetched; this pins
  // the decision half of that contract.
  assertEquals(decideUpdate({ ...base, enabled: false }).apply, false);
  assertEquals(decideUpdate({ ...base, enabled: true }).apply, true);
});

Deno.test('the timings are bounded, so neither can stall a launch', () => {
  // A slow flag read must not turn a cold start into a mid-session reload.
  assertEquals(COLD_START_GRACE_MS > 0 && COLD_START_GRACE_MS <= 10000, true);
  // The telemetry flush is invisible, not a delay anyone feels.
  assertEquals(TRACK_FLUSH_MS > 0 && TRACK_FLUSH_MS <= 1000, true);
  // Worst-case added launch time if everything is slow.
  assertEquals(FETCH_TIMEOUT_MS * 2 + TRACK_FLUSH_MS <= 9000, true);
});

// ── The circuit breaker ────────────────────────────────────────────────────
//
// The one catastrophic failure: a bundle that downloads, fails to apply, stays
// pending, and reloads the app on every launch forever. applied.current cannot
// stop that — reloadAsync destroys the memory holding it.

Deno.test('a first reload from a given bundle is allowed', () => {
  assertEquals(reloadBlocked(null, 'update-A'), false);
  assertEquals(reloadBlocked({ from: 'update-A', tries: 1 }, 'update-A'), false);
});

Deno.test('a third attempt from the SAME bundle is refused', () => {
  assertEquals(reloadBlocked({ from: 'update-A', tries: MAX_RELOAD_ATTEMPTS }, 'update-A'), true);
  assertEquals(reloadBlocked({ from: 'update-A', tries: 9 }, 'update-A'), true);
});

Deno.test('a successful reload resets the count by no longer matching', () => {
  // We were on A, reloaded, and are now running B. The record for A is moot.
  assertEquals(reloadBlocked({ from: 'update-A', tries: 9 }, 'update-B'), false);
});

Deno.test('the counter increments per bundle and restarts on a new one', () => {
  const first = nextReloadGuard(null, 'A');
  assertEquals(first, { from: 'A', tries: 1 });
  const second = nextReloadGuard(first, 'A');
  assertEquals(second, { from: 'A', tries: 2 });
  // now running B: a fresh slate, not a carried-over count
  assertEquals(nextReloadGuard(second, 'B'), { from: 'B', tries: 1 });
});

Deno.test('an unknown running id never blocks — we cannot key on nothing', () => {
  assertEquals(reloadBlocked({ from: 'A', tries: 9 }, null), false);
  assertEquals(reloadBlocked({ from: 'A', tries: 9 }, undefined), false);
});

Deno.test('corrupt or absent storage degrades to no guard, not to a crash', () => {
  for (const bad of [null, undefined, '', 'not json', '{}', '[]', '{"tries":3}']) {
    assertEquals(parseReloadGuard(bad as any), null, String(bad));
  }
  assertEquals(parseReloadGuard(serializeReloadGuard({ from: 'A', tries: 2 })), { from: 'A', tries: 2 });
});

Deno.test('a negative or absurd stored count cannot re-enable looping', () => {
  assertEquals(parseReloadGuard('{"from":"A","tries":-5}')!.tries, 0);
  assertEquals(reloadBlocked(parseReloadGuard('{"from":"A","tries":1e9}'), 'A'), true);
});
