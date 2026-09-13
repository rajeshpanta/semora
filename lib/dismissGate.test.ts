/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/dismissGate.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { createDismissGate } from './dismissGate.ts';

function fakeClock() {
  let next = 1;
  const timers = new Map<number, () => void>();
  return {
    schedule: (fn: () => void, _ms: number) => { const id = next++; timers.set(id, fn); return id; },
    unschedule: (id: number) => { timers.delete(id); },
    fireAll: () => { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } },
    pending: () => timers.size,
  };
}

Deno.test('nothing runs until the modal is gone', () => {
  const clock = fakeClock();
  const gate = createDismissGate(clock.schedule, clock.unschedule);
  let runs = 0;
  gate.runAfterDismiss(() => runs++, 700);
  assertEquals(runs, 0);
});

Deno.test('the dismissal signal runs it once and disarms the backstop', () => {
  const clock = fakeClock();
  const gate = createDismissGate(clock.schedule, clock.unschedule);
  let runs = 0;
  gate.runAfterDismiss(() => runs++, 700);
  gate.onDismissed();
  assertEquals(runs, 1);
  assertEquals(clock.pending(), 0);
  clock.fireAll();
  gate.onDismissed();
  assertEquals(runs, 1);
});

// onDismiss is iOS-only and could fail to arrive; the student must still get
// where they tapped.
Deno.test('the backstop runs it if the signal never comes, and a late signal is ignored', () => {
  const clock = fakeClock();
  const gate = createDismissGate(clock.schedule, clock.unschedule);
  let runs = 0;
  gate.runAfterDismiss(() => runs++, 700);
  clock.fireAll();
  assertEquals(runs, 1);
  gate.onDismissed();
  assertEquals(runs, 1);
});

// The menu also closes by backdrop tap, Back, or opening the Canvas sheet.
Deno.test('a dismissal with nothing pending does nothing', () => {
  const clock = fakeClock();
  const gate = createDismissGate(clock.schedule, clock.unschedule);
  gate.onDismissed();
  assertEquals(clock.pending(), 0);
});

Deno.test('a second request replaces the first rather than running both', () => {
  const clock = fakeClock();
  const gate = createDismissGate(clock.schedule, clock.unschedule);
  const ran: string[] = [];
  gate.runAfterDismiss(() => ran.push('first'), 700);
  gate.runAfterDismiss(() => ran.push('second'), 700);
  assertEquals(clock.pending(), 1);
  gate.onDismissed();
  clock.fireAll();
  assertEquals(ran, ['second']);
});

Deno.test('cancel drops the pending action and its timer', () => {
  const clock = fakeClock();
  const gate = createDismissGate(clock.schedule, clock.unschedule);
  let runs = 0;
  gate.runAfterDismiss(() => runs++, 700);
  gate.cancel();
  clock.fireAll();
  gate.onDismissed();
  assertEquals(runs, 0);
  assertEquals(clock.pending(), 0);
});
