import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  parseCanvasSetupProgress, serializeCanvasSetupProgress, shouldEscalate,
  canvasSetupStorageKey, EMPTY_PROGRESS, ESCALATE_AFTER_ATTEMPTS,
} from '@/lib/canvasSetupProgress.ts';

const NOW = new Date('2026-09-03T12:00:00Z').getTime();
const fresh = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ host: 'deanza.instructure.com', schoolName: 'De Anza College',
    setupLane: 'phone', attempts: 1, savedAt: '2026-09-03T11:00:00Z', ...over });

Deno.test('a round trip preserves what the student worked out', () => {
  const saved = serializeCanvasSetupProgress(
    { host: 'x.instructure.com', schoolName: 'X', setupLane: 'laptop', attempts: 2, savedAt: null },
    new Date(NOW),
  );
  const back = parseCanvasSetupProgress(saved, NOW);
  assertEquals(back.host, 'x.instructure.com');
  assertEquals(back.setupLane, 'laptop');
  assertEquals(back.attempts, 2);
});

Deno.test('progress older than twelve hours is discarded, not resumed', () => {
  const stale = fresh({ savedAt: '2026-09-02T20:00:00Z' }); // 16h before NOW
  assertEquals(parseCanvasSetupProgress(stale, NOW), EMPTY_PROGRESS);
});

Deno.test('progress from eleven hours ago still counts', () => {
  const ok = fresh({ savedAt: '2026-09-03T01:00:00Z' });
  assertEquals(parseCanvasSetupProgress(ok, NOW).host, 'deanza.instructure.com');
});

Deno.test('unparseable, empty or shapeless storage is simply no progress', () => {
  for (const bad of [null, undefined, '', 'not json', '123', '"a string"', '[]']) {
    assertEquals(parseCanvasSetupProgress(bad as any, NOW), EMPTY_PROGRESS, String(bad));
  }
});

Deno.test('a record with no timestamp is not trusted', () => {
  assertEquals(parseCanvasSetupProgress(fresh({ savedAt: undefined }), NOW), EMPTY_PROGRESS);
});

Deno.test('a bogus lane degrades to no lane rather than a broken screen', () => {
  assertEquals(parseCanvasSetupProgress(fresh({ setupLane: 'teleport' }), NOW).setupLane, null);
});

Deno.test('attempts are clamped, so corrupt storage cannot drive the UI', () => {
  assertEquals(parseCanvasSetupProgress(fresh({ attempts: -5 }), NOW).attempts, 0);
  assertEquals(parseCanvasSetupProgress(fresh({ attempts: 1e9 }), NOW).attempts, 99);
  assertEquals(parseCanvasSetupProgress(fresh({ attempts: 'many' }), NOW).attempts, 0);
});

Deno.test('the feed URL is never stored, whatever is handed in', () => {
  const saved = serializeCanvasSetupProgress(
    { host: 'x.edu', schoolName: 'X', setupLane: 'phone', attempts: 0, savedAt: null,
      // deliberately smuggled in
      ...({ url: 'https://x.edu/feeds/calendars/user_secret.ics' } as any) },
    new Date(NOW),
  );
  // It may round-trip through the blob, but the parsed shape must not expose it.
  const back = parseCanvasSetupProgress(saved, NOW) as Record<string, unknown>;
  assertEquals('url' in back, false);
  assertEquals(Object.keys(back).sort(), ['attempts', 'host', 'savedAt', 'schoolName', 'setupLane']);
});

Deno.test('escalation waits for a second failure, never the first', () => {
  assertEquals(ESCALATE_AFTER_ATTEMPTS, 2);
  assertEquals(shouldEscalate({ ...EMPTY_PROGRESS, attempts: 0 }), false);
  assertEquals(shouldEscalate({ ...EMPTY_PROGRESS, attempts: 1 }), false);
  assertEquals(shouldEscalate({ ...EMPTY_PROGRESS, attempts: 2 }), true);
});

Deno.test('the storage key is scoped per user', () => {
  assertEquals(canvasSetupStorageKey('a'), 'semora_canvas_setup_v1:a');
  assertEquals(canvasSetupStorageKey('a') === canvasSetupStorageKey('b'), false);
});

// ── Vocabulary hygiene ─────────────────────────────────────────────────────
//
// The funnel's `lane` means connect/repair/expand and is the key every Canvas
// analytics query scopes on. This module's setup route is ALSO a "lane" in
// plain English (phone/laptop). Sharing the property name would put two
// unrelated vocabularies in one column — the same mistake `step` vs
// `onboarding_step` made. The field is named apart so a future
// `track(..., progress)` cannot leak one into the other.

Deno.test('progress never exposes a property called lane', () => {
  const back = parseCanvasSetupProgress(fresh(), NOW) as Record<string, unknown>;
  assertEquals('lane' in back, false);
  assertEquals(back.setupLane, 'phone');
});
