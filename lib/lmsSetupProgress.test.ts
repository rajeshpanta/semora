/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/lmsSetupProgress.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { canvasSetupStorageKey } from './canvasSetupProgress.ts';
import {
  EMPTY_LMS_PROGRESS,
  ESCALATE_AFTER_ATTEMPTS,
  lmsSetupStorageKey,
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
