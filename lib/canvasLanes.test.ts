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
  claimFirstOpen, LMS_SWITCH_OPTIONS,
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

// ── Other platforms (MOODLE_PLAN.md §6.7) ─────────────────────────────────

Deno.test('a none offer still opens the Canvas setup by default', () => {
  // Every existing surface calls this with two arguments. Their destination
  // must not move.
  const d = canvasOfferDestination('none', 'today_empty');
  if (d.kind !== 'route') throw new Error('expected a route');
  assertEquals(d.params, { provider: 'canvas', source: 'today_empty' });
});

Deno.test('a none offer for a named platform opens that platform', () => {
  const d = canvasOfferDestination('none', 'plus_menu', 'moodle');
  if (d.kind !== 'route') throw new Error('expected a route');
  assertEquals(d.pathname, '/settings/lms-connect');
  assertEquals(d.params, { provider: 'moodle', source: 'plus_menu' });
});

Deno.test('the platform never changes where a repair or an expansion goes', () => {
  for (const offer of ['needs_attention', 'new_courses'] as const) {
    assertEquals(
      canvasOfferDestination(offer, 'today', 'moodle'),
      canvasOfferDestination(offer, 'today'),
      `${offer} moved when a platform was named`,
    );
  }
  assertEquals(canvasOfferDestination('locked', 'courses', 'moodle').kind, 'upsell');
});

Deno.test('the platform switch lists Canvas, Moodle, then Blackboard with its catch', () => {
  // The Settings chooser renders this same list, so the two cannot disagree.
  assertEquals(LMS_SWITCH_OPTIONS.map((o) => o.id), ['canvas', 'moodle', 'blackboard']);
  // The two a student can connect alone carry no caveat; Blackboard does,
  // on the control itself, before the tap.
  assertEquals(LMS_SWITCH_OPTIONS.map((o) => o.hint), [null, null, 'needs school IT']);
});

Deno.test('a switch counts as opening the other platform, once per platform per visit', () => {
  const opened = new Set<string>();
  assertEquals(claimFirstOpen(opened, 'canvas'), true);    // the arrival
  assertEquals(claimFirstOpen(opened, 'moodle'), true);    // switched across
  assertEquals(claimFirstOpen(opened, 'canvas'), false);   // and back: not again
  assertEquals(claimFirstOpen(opened, 'moodle'), false);
  assertEquals(claimFirstOpen(opened, 'blackboard'), true);
  // A new visit is a new set.
  assertEquals(claimFirstOpen(new Set<string>(), 'canvas'), true);
});

Deno.test('the funnel names the platform when told it, and only then', () => {
  const told = canvasFunnelPayload(
    { screen: 'today', offer: 'needs_attention', free: true, source: 'today_empty', provider: 'moodle' },
    'tapped',
  ) as Record<string, unknown>;
  assertEquals(told.provider, 'moodle');

  // No connection yet: the invitation is about no platform in particular.
  const invite = canvasFunnelPayload(
    { screen: 'today', offer: 'none', free: true, source: 'today_empty', provider: null },
    'tapped',
  ) as Record<string, unknown>;
  assertEquals(invite.provider, null);

  // An emitter that does not know says nothing, rather than null — null would
  // read as "this student has no connection", which may be false.
  const untold = canvasFunnelPayload(
    { screen: 'today', offer: 'none', free: true, source: 'today_empty' },
    'shown',
  ) as Record<string, unknown>;
  assertEquals('provider' in untold, false);
});
