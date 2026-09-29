/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/lmsSetupProgress.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { canvasSetupStorageKey } from './canvasSetupProgress.ts';
import {
  EMPTY_LMS_PROGRESS,
  ESCALATE_AFTER_ATTEMPTS,
  feedLaneChosenFor,
  lmsConnectionMayBeEmpty,
  lmsSetupStorageKey,
  moodleLinkStepReady,
  parseLmsSetupProgress,
  serializeLmsSetupProgress,
  shouldEscalateLmsSetup,
} from './lmsSetupProgress.ts';

const USER = 'e7b1c2d3-0000-4000-8000-000000000001';

Deno.test('Canvas keeps the exact key it already uses', () => {
  // If this ever drifts, every Canvas student mid-setup loses their place on
  // the deploy that ships Moodle.
  assertEquals(lmsSetupStorageKey('canvas', USER), canvasSetupStorageKey(USER));
});

Deno.test('Moodle gets its own key, and the two cannot collide', () => {
  const canvas = lmsSetupStorageKey('canvas', USER);
  const moodle = lmsSetupStorageKey('moodle', USER);
  assert(canvas !== moodle);
  assert(moodle.includes('moodle'));
});

Deno.test('every key survives expo-secure-store validation', () => {
  // A colon here means every write silently stores nothing, with no error.
  // That is what happened to two Canvas keys on 2026-09-13.
  for (const provider of ['canvas', 'moodle'] as const) {
    assert(/^[\w.-]+$/.test(lmsSetupStorageKey(provider, USER)), provider);
  }
});

Deno.test('a round trip keeps what was learned', () => {
  const progress = {
    ...EMPTY_LMS_PROGRESS,
    host: 'moodle.school.edu',
    wwwroot: 'https://school.edu/moodle',
    schoolName: 'Mount Orange',
    setupLane: 'phone' as const,
    attempts: 1,
    precheck: { isMoodle: true, mobile: true, typeoflogin: 1, sso: false },
  };
  const parsed = parseLmsSetupProgress(serializeLmsSetupProgress(progress));
  assertEquals(parsed.host, 'moodle.school.edu');
  assertEquals(parsed.wwwroot, 'https://school.edu/moodle');
  assertEquals(parsed.schoolName, 'Mount Orange');
  assertEquals(parsed.setupLane, 'phone');
  assertEquals(parsed.attempts, 1);
  assertEquals(parsed.precheck, { isMoodle: true, mobile: true, typeoflogin: 1, sso: false });
});

Deno.test('the link is never stored, whatever is handed in', () => {
  const secret = `https://s.edu/calendar/export_execute.php?userid=1&authtoken=${'a'.repeat(40)}`;
  const serialised = serializeLmsSetupProgress({
    ...EMPTY_LMS_PROGRESS,
    // Someone putting the link somewhere it does not belong.
    host: 'moodle.school.edu',
  } as never);
  assert(!serialised.includes(secret));
  assert(!/authtoken/.test(serialised));
});

Deno.test('stale progress is the same as none', () => {
  const now = Date.UTC(2026, 8, 19, 12);
  const fresh = serializeLmsSetupProgress(
    { ...EMPTY_LMS_PROGRESS, host: 'a.edu' },
    new Date(now - 11 * 60 * 60 * 1000),
  );
  assertEquals(parseLmsSetupProgress(fresh, now).host, 'a.edu');

  const old = serializeLmsSetupProgress(
    { ...EMPTY_LMS_PROGRESS, host: 'a.edu' },
    new Date(now - 13 * 60 * 60 * 1000),
  );
  assertEquals(parseLmsSetupProgress(old, now), EMPTY_LMS_PROGRESS);

  // A clock that jumped backwards is not trusted either.
  const future = serializeLmsSetupProgress(
    { ...EMPTY_LMS_PROGRESS, host: 'a.edu' },
    new Date(now + 60 * 60 * 1000),
  );
  assertEquals(parseLmsSetupProgress(future, now), EMPTY_LMS_PROGRESS);
});

Deno.test('rubbish parses to empty rather than throwing', () => {
  assertEquals(parseLmsSetupProgress(null), EMPTY_LMS_PROGRESS);
  assertEquals(parseLmsSetupProgress(''), EMPTY_LMS_PROGRESS);
  assertEquals(parseLmsSetupProgress('{ truncated'), EMPTY_LMS_PROGRESS);
  assertEquals(parseLmsSetupProgress('"a string"'), EMPTY_LMS_PROGRESS);
  assertEquals(parseLmsSetupProgress('{"host":"a.edu"}'), EMPTY_LMS_PROGRESS); // no savedAt
});

Deno.test('a nonsense lane or attempt count is corrected, not trusted', () => {
  const raw = JSON.stringify({
    host: 'a.edu', setupLane: 'telepathy', attempts: -5,
    precheck: 'not an object', savedAt: new Date().toISOString(),
  });
  const parsed = parseLmsSetupProgress(raw);
  assertEquals(parsed.setupLane, null);
  assertEquals(parsed.attempts, 0);
  assertEquals(parsed.precheck, null);

  const huge = JSON.stringify({ host: 'a.edu', attempts: 1e9, savedAt: new Date().toISOString() });
  assertEquals(parseLmsSetupProgress(huge).attempts, 99);
});

Deno.test('escalation happens on the second failure, not the first', () => {
  assertEquals(ESCALATE_AFTER_ATTEMPTS, 2);
  assertEquals(shouldEscalateLmsSetup({ ...EMPTY_LMS_PROGRESS, attempts: 1 }), false);
  assertEquals(shouldEscalateLmsSetup({ ...EMPTY_LMS_PROGRESS, attempts: 2 }), true);
});

Deno.test('why the site check could not confirm survives leaving the app', () => {
  // Without this a student who left for the browser came back to a confident
  // "Found:" for an address the check had said was not a Moodle at all.
  for (const reason of ['not_moodle', 'unreachable', 'blocked'] as const) {
    const parsed = parseLmsSetupProgress(serializeLmsSetupProgress({
      ...EMPTY_LMS_PROGRESS,
      wwwroot: 'https://school.edu',
      precheck: { isMoodle: false, reason },
    }));
    assertEquals(parsed.precheck, { isMoodle: false, reason }, reason);
  }
  const junk = JSON.stringify({
    wwwroot: 'https://school.edu',
    precheck: { isMoodle: false, reason: 'because' },
    savedAt: new Date().toISOString(),
  });
  assertEquals(parseLmsSetupProgress(junk).precheck, { isMoodle: false });
});

Deno.test('the paste step opens on a lane on a phone, and on the school alone on the web', () => {
  const noSchool = { ...EMPTY_LMS_PROGRESS, setupLane: 'phone' as const };
  assertEquals(moodleLinkStepReady(noSchool, false), false);
  assertEquals(moodleLinkStepReady(noSchool, true), false);

  const school = { ...EMPTY_LMS_PROGRESS, wwwroot: 'https://moodle.school.edu' };
  // A phone still asks "here or on a laptop?" first.
  assertEquals(moodleLinkStepReady(school, false), false);
  // The web does not: asking it was the loop back to app.semoraai.com.
  assertEquals(moodleLinkStepReady(school, true), true);

  for (const setupLane of ['phone', 'laptop'] as const) {
    assertEquals(moodleLinkStepReady({ ...school, setupLane }, false), true, setupLane);
    assertEquals(moodleLinkStepReady({ ...school, setupLane }, true), true, setupLane);
  }
});

Deno.test('only the road on screen decides whether its heading has given way to the steps', () => {
  // A student who once picked a Canvas lane, then switched platform.
  const canvasLane = { setupLane: 'phone' as const };
  const noCanvasLane = { setupLane: null };
  const moodleSchool = { ...EMPTY_LMS_PROGRESS, wwwroot: 'https://moodle.school.edu', setupLane: 'laptop' as const };
  const road = (over: Partial<Parameters<typeof feedLaneChosenFor>[0]>) => feedLaneChosenFor({
    canvas: false, moodleFeed: false, canvasProgress: canvasLane, moodleProgress: EMPTY_LMS_PROGRESS, isWeb: false, ...over,
  });

  // Blackboard, and Moodle's token road, have no lane step at all: a Canvas
  // lane left over from earlier must not blank their heading.
  assertEquals(road({}), false);
  assertEquals(road({ moodleProgress: moodleSchool }), false);

  // Canvas reads its own lane, exactly as it always has.
  assertEquals(road({ canvas: true }), true);
  assertEquals(road({ canvas: true, canvasProgress: noCanvasLane }), false);

  // Moodle's link road reads Moodle's progress, never Canvas's.
  assertEquals(road({ moodleFeed: true }), false);
  assertEquals(road({ moodleFeed: true, canvasProgress: noCanvasLane, moodleProgress: moodleSchool }), true);
  const schoolOnly = { ...EMPTY_LMS_PROGRESS, wwwroot: 'https://moodle.school.edu' };
  assertEquals(road({ moodleFeed: true, moodleProgress: schoolOnly }), false);
  assertEquals(road({ moodleFeed: true, moodleProgress: schoolOnly, isWeb: true }), true);
});

Deno.test('only a Moodle calendar feed may be saved and synced with no courses', () => {
  // "Save and keep checking": the connection exists before any course does,
  // and every sync until the first dated course runs with zero links.
  assertEquals(lmsConnectionMayBeEmpty('moodle', 'calendar_feed'), true);
  // Everything else still needs a course, exactly as the server says.
  assertEquals(lmsConnectionMayBeEmpty('moodle', 'legacy_token'), false);
  assertEquals(lmsConnectionMayBeEmpty('canvas', 'calendar_feed'), false);
  assertEquals(lmsConnectionMayBeEmpty('blackboard', 'legacy_token'), false);
  assertEquals(lmsConnectionMayBeEmpty('google_classroom', 'oauth'), false);
  assertEquals(lmsConnectionMayBeEmpty(null, 'calendar_feed'), false);
  assertEquals(lmsConnectionMayBeEmpty('moodle', undefined), false);
});
