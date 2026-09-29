import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  decideUpdate, isProtectedRoute, NEVER_RELOAD_ROUTES, AUTO_UPDATE_FLAG_KEY, FETCH_TIMEOUT_MS,
  COLD_START_GRACE_MS, TRACK_FLUSH_MS, parseReloadGuard, serializeReloadGuard,
  reloadBlocked, nextReloadGuard, MAX_RELOAD_ATTEMPTS, isRealResume, MIN_AWAY_MS,
  noteBackground, COLD_START_ROUTES, noteExternalNavigation, sentFromOutside,
  EXTERNAL_NAVIGATION_WINDOW_MS,
} from '@/lib/appUpdate.ts';

// '/' is what usePathname() reports for the Today tab — expo-router drops the
// (tabs) group, as the live ota_applied screen values confirm.
const base = {
  isUpdatePending: true, enabled: true,
  moment: 'cold-start' as const, pathname: '/', alreadyAppliedThisSession: false,
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

Deno.test('ordinary screens are fine on a real resume', () => {
  for (const route of ['/', '/courses', '/task/abc', '/settings', null, undefined]) {
    assertEquals(decideUpdate({ ...base, moment: 'resumed', pathname: route as any }).apply, true, String(route));
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
  // v2: the original key is read by bundles that treat a system sheet as a
  // resume, including the one inside the 1.15.1 binary. See migration 155.
  assertEquals(AUTO_UPDATE_FLAG_KEY, 'auto_update_reload_v2');
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

Deno.test('a lecture recording in flight blocks the reload on any route and at any moment', () => {
  const decision = decideUpdate({
    isUpdatePending: true,
    enabled: true,
    moment: 'resumed',
    pathname: '/lecture/abc',
    alreadyAppliedThisSession: false,
    lectureWorkInFlight: true,
  });
  assertEquals(decision, { apply: false, reason: 'recording-in-flight' });
  assertEquals(decideUpdate({
    isUpdatePending: true, enabled: true, moment: 'cold-start', pathname: '/',
    alreadyAppliedThisSession: false, lectureWorkInFlight: false,
  }).apply, true);
});

// ── What counts as "resumed" (2026-09-24) ─────────────────────────────────
//
// Every return to 'active' used to count. On iOS a system sheet takes the app
// through 'inactive' and back without it ever leaving, so the payment sheet,
// the notification prompt and the photo picker each restarted new students in
// the middle of what they were doing: 18 of them in one week.

Deno.test('a system sheet is not a departure: no background visit, no resume', () => {
  assertEquals(isRealResume(null, 1_000_000), false);
});

Deno.test('a quick trip out and back is someone mid-task, not a new visit', () => {
  const now = 10_000_000;
  for (const away of [0, 2_000, 30_000, 75_000, MIN_AWAY_MS - 1]) {
    assertEquals(isRealResume({ since: now - away, countable: true }, now), false, String(away));
  }
});

Deno.test('long enough away is a new visit, and the update applies', () => {
  const now = 10_000_000;
  assertEquals(isRealResume({ since: now - MIN_AWAY_MS, countable: true }, now), true);
  assertEquals(isRealResume({ since: now - 3 * 60 * 60 * 1000, countable: true }, now), true);
});

Deno.test('the away rule outlasts any system sheet or Android dialog, and is not absurd', () => {
  assertEquals(MIN_AWAY_MS >= 60_000, true);
  assertEquals(MIN_AWAY_MS <= 30 * 60 * 1000, true);
});

Deno.test('a garbage timestamp never triggers a reload', () => {
  assertEquals(isRealResume({ since: Number.NaN, countable: true }, 10_000_000), false);
  assertEquals(isRealResume({ since: Number.POSITIVE_INFINITY, countable: true }, 10_000_000), false);
});

Deno.test('the first background report starts the trip; later ones never restart it', () => {
  // iOS reports 'background' again on its way BACK to the foreground. Restarting
  // the clock there would make a three-hour absence look like zero seconds.
  const left = noteBackground(null, 1_000, false);
  assertEquals(left, { since: 1_000, countable: true });
  assertEquals(noteBackground(left, 9_999_999, false), left);
  assertEquals(isRealResume(noteBackground(left, 3 * 60 * 60 * 1000, false), 3 * 60 * 60 * 1000), true);
});

Deno.test('a trip that began mid-lecture never counts, however long it lasts', () => {
  // 09-21: a 57-minute recording on a locked phone, stopped from the lock
  // screen; the student opened the app to see the lecture and was restarted.
  const recording = noteBackground(null, 0, true);
  assertEquals(recording.countable, false);
  // The lecture finished while the phone was still locked: the return-trip
  // 'background' report must not turn it into a countable trip.
  const back = noteBackground(recording, 57 * 60_000, false);
  assertEquals(isRealResume(back, 57 * 60_000 + 1), false);
});

Deno.test('a cold start reloads only where the app opens by itself', () => {
  assertEquals([...COLD_START_ROUTES], ['/']);
  assertEquals(decideUpdate({ ...base, pathname: '/' }).apply, true);
  // A reminder tap opens its task; a reload would drop the student on Today.
  for (const route of ['/task/426ceefc-466f-4bf2-9454-ea8ea136aaa4', '/task', '/course/abc', '/calendar', null, undefined]) {
    const d = decideUpdate({ ...base, pathname: route as any });
    assertEquals(d.apply, false, String(route));
    assertEquals(d.reason, 'launch-destination', String(route));
  }
  // A share link's screen is refused earlier still, as a protected route, so
  // no moment can reload under it (lib/shareLinks.ts).
  for (const route of ['/join', '/invite', '/collaborate', '/redeem']) {
    assertEquals(decideUpdate({ ...base, pathname: route }).reason, 'protected-route', route);
    assertEquals(decideUpdate({ ...base, moment: 'resumed', pathname: route }).reason, 'protected-route', route);
  }
  // The landing rule is for launches only: a real resume on a task is fine.
  assertEquals(decideUpdate({ ...base, moment: 'resumed', pathname: '/task/abc' }).apply, true);
});

// ── The gate itself (source checks) ───────────────────────────────────────
//
// The helpers above were right before; the bug was in how the component
// called them. These pin the wiring.

const gate = Deno.readTextFileSync(new URL('../components/AppUpdateGate.tsx', import.meta.url));

Deno.test('the gate resumes only through isRealResume, never on a bare return to active', () => {
  assert(gate.includes('isRealResume('), 'isRealResume is not used');
  assert(!/state === 'active'\)\s*void attempt\('resumed'\)/.test(gate), 'a bare active -> resumed path is back');
  assert(gate.includes("state === 'background'"), 'background visits are not recorded');
  assert(gate.includes('noteBackground('), 'trips are not started through noteBackground');
});

Deno.test('the gate reads only the v2 switch, never the retired one, and never from disk', () => {
  const keys = [...gate.matchAll(/promo_active',\s*\{\s*p_key:\s*([^}\s]+)/g)].map((m) => m[1]);
  assertEquals(keys, ['AUTO_UPDATE_FLAG_KEY']);
  assert(!gate.includes("'auto_update_reload'"), 'the retired key is named in the gate');
  assert(gate.includes("queryKey: ['appUpdateFlag'"), 'the flag query key changed; it must stay unpersisted');
  const persistence = Deno.readTextFileSync(new URL('./queryPersistence.ts', import.meta.url));
  assert(persistence.includes("'appupdateflag'"), 'the flag is persisted to disk again');
});

Deno.test('the gate judges the live route again right before reloading', () => {
  const beforeReload = gate.slice(0, gate.indexOf('await Updates.reloadAsync()'));
  const lastDecision = beforeReload.lastIndexOf('decideUpdate(');
  const flush = beforeReload.lastIndexOf('TRACK_FLUSH_MS');
  assert(lastDecision > flush, 'no decision after the telemetry wait');
  assert(beforeReload.lastIndexOf('nextReloadGuard(') > lastDecision, 'the attempt is counted before the final check');
});

Deno.test('never on the paywall, a scan, the syllabus review or a password reset', () => {
  for (const route of ['/paywall', '/scan', '/syllabus/review', '/syllabus/upload', '/syllabus/paste',
    '/syllabus/added', '/forgot-password', '/reset-password']) {
    const d = decideUpdate({ ...base, moment: 'resumed', pathname: route });
    assertEquals(d.apply, false, route);
    assertEquals(d.reason, 'protected-route', route);
  }
  // prefix-safe: a different screen that merely starts with the same letters
  assertEquals(isProtectedRoute('/scanner-help'), false);
  assertEquals(isProtectedRoute('/syllabusx'), false);
});

Deno.test('never on a form that holds unsaved input', () => {
  for (const route of ['/task/new', '/course/new', '/semester/new', '/semester/abc', '/grading/abc']) {
    const d = decideUpdate({ ...base, moment: 'resumed', pathname: route });
    assertEquals(d.reason, 'protected-route', route);
  }
  // Viewing a task is not protected. Its in-place edit mode is a known gap of
  // a route-only rule: protecting it would block every task view.
  assertEquals(decideUpdate({ ...base, moment: 'resumed', pathname: '/task/abc' }).apply, true);
});

Deno.test('a tap or link counts as a destination for a few seconds, then expires', () => {
  noteExternalNavigation(1_000_000);
  assertEquals(sentFromOutside(1_000_000), true);
  assertEquals(sentFromOutside(1_000_000 + EXTERNAL_NAVIGATION_WINDOW_MS - 1), true);
  assertEquals(sentFromOutside(1_000_000 + EXTERNAL_NAVIGATION_WINDOW_MS), false);
  assert(EXTERNAL_NAVIGATION_WINDOW_MS >= 1000 && EXTERNAL_NAVIGATION_WINDOW_MS <= 15_000);
  // Both checks in the gate consult it, and the handlers mark it.
  assertEquals((gate.match(/sentFromOutside\(Date\.now\(\)\)/g) ?? []).length, 2);
  const layout = Deno.readTextFileSync(new URL('../app/_layout.tsx', import.meta.url));
  assertEquals((layout.match(/noteExternalNavigation\(\)/g) ?? []).length, 2, 'the notification and deep-link handlers');
});

Deno.test('a resume that lands somewhere other than where the student left is not reloaded', () => {
  // A reminder tapped while the app was alive in the background opens its
  // task; a reload would drop the student on Today with the tap forgotten.
  assert(/void attempt\('resumed', leftFrom\.current\)/.test(gate), 'the resume does not pass where the student left');
  assert(/moment === 'resumed' && here !== leftFrom/.test(gate), 'the final check does not compare the routes');
});

Deno.test('an aborted reload spends nothing and ends cold-start attempts', () => {
  const abort = gate.slice(gate.indexOf("track('ota_reload_aborted'"), gate.indexOf('await Updates.reloadAsync()'));
  assert(abort.includes('applied.current = false') && abort.includes('reloadStarted = false'), 'an abort must not block a later real resume');
  assert(abort.includes('mountedAt.current = Number.NEGATIVE_INFINITY'), 'an abort must end cold-start attempts');
});

Deno.test('the cold-start grace window is kept at the moment of deciding', () => {
  const firstDecision = gate.indexOf('const decision = decideUpdate(');
  const grace = gate.lastIndexOf('COLD_START_GRACE_MS', firstDecision);
  const lastAwait = gate.lastIndexOf('await ', firstDecision);
  assert(grace > lastAwait, 'the grace check must come after the check/download awaits');
});

Deno.test('a tap or link blocks a launch reload too, and a background launch is never reloaded', () => {
  // "Mark Complete" launches the JS in the background on '/': the completion is
  // in flight and there is no screen, so nothing may restart it.
  assert(gate.includes("if (AppState.currentState === 'background') return;"), 'a headless launch can be reloaded');
  const firstDecision = gate.indexOf('const decision = decideUpdate(');
  const earlyAbort = gate.indexOf("if (sentFromOutside(Date.now()) || (moment === 'resumed'");
  assert(earlyAbort > firstDecision, 'the early abort must follow the decision, so nothing-pending resumes log nothing');
  assert(/const sentElsewhere = sentFromOutside\(Date\.now\(\)\) \|\|/.test(gate), 'the final check must honour a tap on a launch too');
});
