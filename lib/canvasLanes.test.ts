/**
 * The routing table and the lane taxonomy.
 *
 * These two are worth testing precisely because they are the parts that were
 * previously decided at nine separate call sites: "Connect Canvas" sent the
 * student to a settings list they then had to navigate, and 39 of 49 tapping
 * sessions ended there. A wrong answer here is invisible in review and shows
 * up only as a funnel that quietly leaks.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { canvasLaneFor, canvasOfferDestination, CANVAS_LANES, CANVAS_STEPS } from '@/lib/canvasLanes.ts';

Deno.test('a student with no connection goes straight to the connect form', () => {
  const d = canvasOfferDestination('none', 'today_empty');
  assertEquals(d.kind, 'route');
  if (d.kind !== 'route') throw new Error('unreachable');
  // NOT /settings/lms. That extra hop is the loss this exists to close.
  assertEquals(d.pathname, '/settings/lms-connect');
  assertEquals(d.params.provider, 'canvas');
  assertEquals(d.params.source, 'today_empty');
});

Deno.test('a broken connection goes to the list, which is where the repair tools are', () => {
  const d = canvasOfferDestination('needs_attention', 'scan_screen');
  if (d.kind !== 'route') throw new Error('expected a route');
  assertEquals(d.pathname, '/settings/lms');
  assertEquals(d.params.source, 'scan_screen');
});

Deno.test('classes waiting keep their own screen', () => {
  const d = canvasOfferDestination('new_courses', 'today_pending');
  if (d.kind !== 'route') throw new Error('expected a route');
  assertEquals(d.pathname, '/settings/lms/new-courses');
});

Deno.test('a locked offer opens the upsell, never a screen the student cannot use', () => {
  assertEquals(canvasOfferDestination('locked', 'courses').kind, 'upsell');
});

Deno.test('every destination carries the source through', () => {
  for (const offer of ['none', 'needs_attention', 'new_courses'] as const) {
    const d = canvasOfferDestination(offer, 'plus_menu');
    if (d.kind !== 'route') throw new Error('expected a route');
    assertEquals(d.params.source, 'plus_menu', `${offer} dropped its source`);
  }
});

Deno.test('lanes separate the three journeys that were being averaged together', () => {
  assertEquals(canvasLaneFor('none'), 'connect');
  assertEquals(canvasLaneFor('locked'), 'connect');
  assertEquals(canvasLaneFor('needs_attention'), 'repair');
  assertEquals(canvasLaneFor('new_courses'), 'expand');
  // 'healthy' should not render an offer at all; if it does, it is a connect.
  assertEquals(canvasLaneFor('healthy'), 'connect');
});

Deno.test('every offer maps to a declared lane, so a new one cannot land nowhere', () => {
  for (const offer of ['none', 'locked', 'needs_attention', 'new_courses', 'healthy'] as const) {
    const lane = canvasLaneFor(offer);
    assertEquals(CANVAS_LANES.includes(lane), true, `${offer} produced an undeclared lane ${lane}`);
  }
});

Deno.test('the step vocabulary is ordered and complete', () => {
  assertEquals([...CANVAS_STEPS], ['shown', 'tapped', 'opened', 'discovered', 'chosen', 'connected']);
});
