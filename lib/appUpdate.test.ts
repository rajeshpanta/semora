import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  decideUpdate, isProtectedRoute, NEVER_RELOAD_ROUTES, AUTO_UPDATE_FLAG_KEY, FETCH_TIMEOUT_MS,
  COLD_START_GRACE_MS, TRACK_FLUSH_MS,
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
