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
import {
  canvasLaneFor, canvasOfferDestination, canvasFunnelPayload, CANVAS_LANES, CANVAS_STEPS,
} from '@/lib/canvasLanes.ts';

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

// ── The wire contract ──────────────────────────────────────────────────────
//
// These exist because the property name was wrong once already. `step` was
// shipped-ready before anyone noticed onboarding_step had been carrying a
// `step` property on 3,416 events for months, with numeric values — so any
// unscoped `group by properties->>'step'` would have blended two unrelated
// funnels into one plausible-looking, meaningless chart. It was caught with
// zero events emitted, which is luck, not process. This is the process.

Deno.test('the funnel step goes out as funnel_step, never as step', () => {
  const p = canvasFunnelPayload(
    { screen: 'today_empty', offer: 'none', free: true, source: 'today_empty' },
    'shown',
  ) as Record<string, unknown>;
  assertEquals(p.funnel_step, 'shown');
  // The collision itself. onboarding_step owns `step`.
  assertEquals('step' in p, false);
});

Deno.test('every funnel event carries the four fields a query joins on', () => {
  const p = canvasFunnelPayload(
    { screen: 'scan', offer: 'needs_attention', free: false, source: 'scan_screen' },
    'tapped',
  ) as Record<string, unknown>;
  assertEquals(p.screen, 'scan');
  assertEquals(p.source, 'scan_screen');
  assertEquals(p.offer, 'needs_attention');
  assertEquals(p.free, false);
  // lane is derived, not passed — it is what scopes a query to this funnel.
  assertEquals(p.lane, 'repair');
  assertEquals(p.funnel_step, 'tapped');
});

Deno.test('extra fields are additive and cannot displace the contract', () => {
  const p = canvasFunnelPayload(
    { screen: 'upsell_sheet', offer: 'none', free: true, source: 'scan_upsell' },
    'tapped',
    { reason: 'scan', promo: true },
  ) as Record<string, unknown>;
  assertEquals(p.reason, 'scan');
  assertEquals(p.promo, true);
  assertEquals(p.lane, 'connect');
  assertEquals(p.funnel_step, 'tapped');
});
