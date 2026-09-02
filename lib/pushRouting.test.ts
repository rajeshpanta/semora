/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/pushRouting.test.ts
 *
 * The first test in this file is the one that matters. `flashcards_due` shipped
 * broken — it pushed /flashcards and was then thrown back to the tabs root by a
 * fallback that had silently detached from the wrong `if` — and it went out
 * over the air to 35 devices without anyone noticing, because the code reads
 * fine. Nothing existed that could have failed.
 *
 * So every route is asserted to reach its own destination AND to be reported as
 * known. A future edit that reattaches something to the fallback breaks a test
 * here rather than a student's notification in production.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  PUSH_FALLBACK_PATH,
  isServerPush,
  resolvePushRoute,
} from '@/lib/pushRouting.ts';

const LECTURE = '0d841775-6d73-40fc-b468-2168c5e6af27';

// ─── The regression that caused this file to exist ──────────────────────────

Deno.test('flashcards_due lands on flashcards, not the tabs root', () => {
  const route = resolvePushRoute({ type: 'flashcards_due' });
  assertEquals(route.path, '/flashcards');
  assertEquals(route.mode, 'push');
  assertEquals(route.known, true);
});

Deno.test('every known type keeps its own destination', () => {
  // Asserted as a set rather than one test each, so ADDING a type without
  // giving it a destination is visible here as well.
  assertEquals(resolvePushRoute({ type: 'flashcards_due' }).path, '/flashcards');
  assertEquals(
    resolvePushRoute({ type: 'lms_new_courses' }).path,
    '/settings/lms/new-courses',
  );
  assertEquals(
    resolvePushRoute({ type: 'lecture_notes_ready', lectureId: LECTURE }).path,
    `/lecture/${LECTURE}`,
  );
});

Deno.test('no two known types share a destination', () => {
  const paths = [
    resolvePushRoute({ type: 'flashcards_due' }).path,
    resolvePushRoute({ type: 'lms_new_courses' }).path,
    resolvePushRoute({ type: 'lecture_notes_ready', lectureId: LECTURE }).path,
  ];
  assertEquals(new Set(paths).size, paths.length);
  // ...and none of them is the fallback. This is exactly the shape the bug had:
  // a real type quietly resolving to home.
  assertEquals(paths.includes(PUSH_FALLBACK_PATH), false);
});

// ─── The fallback ───────────────────────────────────────────────────────────

Deno.test('the weekly digest goes home, and says so', () => {
  const route = resolvePushRoute({ type: 'weekly_digest' });
  assertEquals(route.path, PUSH_FALLBACK_PATH);
  assertEquals(route.mode, 'replace');
  // Home is its real destination, but it is not a route we resolved TO — the
  // analytics distinction between "we routed this" and "we did not know" is
  // what makes an unrouted type findable later.
  assertEquals(route.known, false);
  assertEquals(route.type, 'weekly_digest');
});

Deno.test('an unknown type still opens the app', () => {
  const route = resolvePushRoute({ type: 'something_shipped_later' });
  assertEquals(route.path, PUSH_FALLBACK_PATH);
  assertEquals(route.mode, 'replace');
  assertEquals(route.known, false);
  // The type is still reported, so a server sending something this build does
  // not understand shows up in analytics instead of vanishing.
  assertEquals(route.type, 'something_shipped_later');
});

// ─── Payloads that should not be trusted ────────────────────────────────────

Deno.test('a lecture push with no usable id falls back instead of building a broken path', () => {
  for (const data of [
    { type: 'lecture_notes_ready' },
    { type: 'lecture_notes_ready', lectureId: '' },
    { type: 'lecture_notes_ready', lectureId: 42 },
    { type: 'lecture_notes_ready', lectureId: '../../settings' },
    { type: 'lecture_notes_ready', lectureId: 'not-a-uuid' },
  ]) {
    const route = resolvePushRoute(data);
    assertEquals(route.path, PUSH_FALLBACK_PATH);
    assertEquals(route.known, false);
  }
});

Deno.test('a type that names an Object.prototype member is not a route', () => {
  // Found before shipping, in the first version of this table. Looking a
  // sender-controlled key up on an object literal walks the prototype chain:
  // 'toString' resolved to Object.prototype.toString and navigated to the
  // string "[object Undefined]" as a KNOWN route, and 'hasOwnProperty' threw
  // and took the notification handler down with it. A Map cannot do either.
  for (const name of [
    'constructor', 'toString', '__proto__', 'hasOwnProperty',
    'valueOf', 'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
  ]) {
    const route = resolvePushRoute({ type: name });
    assertEquals(route.path, PUSH_FALLBACK_PATH);
    assertEquals(route.mode, 'replace');
    assertEquals(route.known, false);
  }
});

Deno.test('junk payloads resolve to home rather than throwing', () => {
  for (const data of [undefined, null, 'string', 42, [], {}, { type: '' }, { type: 7 }]) {
    const route = resolvePushRoute(data);
    assertEquals(route.path, PUSH_FALLBACK_PATH);
    assertEquals(route.known, false);
  }
});

// ─── Telling a server push from a local reminder ────────────────────────────

Deno.test('local task reminders are not server pushes', () => {
  // These carry a taskId and no type, and are routed somewhere else entirely.
  // Misclassifying one would send a reminder tap to the tabs root instead of
  // the task — the same class of silent breakage, one door over.
  assertEquals(isServerPush({ taskId: 'abc', taskType: 'assignment' }), false);
  assertEquals(isServerPush({}), false);
  assertEquals(isServerPush(null), false);
  assertEquals(isServerPush({ type: 'flashcards_due' }), true);
});
