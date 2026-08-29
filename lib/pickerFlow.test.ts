/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/pickerFlow.test.ts
 *
 * These exercise the logic the Scan screen actually runs (safePick delegates
 * straight to runPick), not a model of it. Each case is a production failure:
 * the picker presented mid-dismissal and stranded the native context, the
 * duplicate invocation that threw PickingInProgressException, and the failure
 * that was filed as a cancellation.
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { runPick, classifyPick, shouldTrackCancelled } from './pickerFlow';

const cell = () => ({ current: false });
const noop = () => {};
const selected = { canceled: false, assets: [{ uri: 'file://x' }] };
const cancelled = { canceled: true, assets: [] };

// ── 1. The picker waits for transitions before it is ever presented ─────────

Deno.test('the picker is never invoked before transitions have settled', async () => {
  // The whole bug: presenting while a modal was dismissing was silently
  // dropped by UIKit and stranded expo-document-picker's pickingContext.
  const order: string[] = [];
  let releaseTransitions: () => void = noop;
  const transitions = new Promise<void>((resolve) => { releaseTransitions = resolve; });

  const pick = runPick({
    inFlight: cell(),
    waitForTransitions: () => { order.push('wait:start'); return transitions; },
    work: async () => { order.push('present'); return selected; },
    onFailure: noop,
  });

  // Let microtasks drain. The picker must NOT have been presented yet.
  await Promise.resolve();
  await Promise.resolve();
  assertEquals(order, ['wait:start']);

  releaseTransitions();
  await pick;
  assertEquals(order, ['wait:start', 'present']);
});

Deno.test('an idle screen still presents — waiting costs a tick, not a timeout', async () => {
  const result = await runPick({
    inFlight: cell(),
    waitForTransitions: () => Promise.resolve(),
    work: async () => selected,
    onFailure: noop,
  });
  assertEquals(classifyPick(result), 'selected');
});

Deno.test('a stalled InteractionManager is reported, not left hanging forever', async () => {
  // If an interaction handle ever leaks, the wait never resolves. That must
  // surface as a reported timeout rather than a dead button.
  const failures: string[] = [];
  const result = await runPick({
    inFlight: cell(),
    waitForTransitions: () => new Promise<void>(() => {}), // never resolves
    work: async () => selected,
    onFailure: (_e, reason) => failures.push(reason),
    timeoutMs: 20,
  });
  assertEquals(failures, ['timeout']);
  assertEquals(classifyPick(result), 'failed');
});

// ── 2. Rapid double invocation produces exactly one picker ─────────────────

Deno.test('two calls in the same tick present exactly one picker', async () => {
  // The "+" menu deep-link fires a picker on mount; a student tapping the
  // card as well produced a second getDocumentAsync, which is where
  // PickingInProgressException came from.
  const inFlight = cell();
  let presented = 0;
  let release: () => void = noop;
  const held = new Promise<void>((resolve) => { release = resolve; });

  const a = runPick({
    inFlight,
    waitForTransitions: () => Promise.resolve(),
    work: async () => { presented += 1; await held; return selected; },
    onFailure: noop,
  });
  const b = runPick({
    inFlight,
    waitForTransitions: () => Promise.resolve(),
    work: async () => { presented += 1; return selected; },
    onFailure: noop,
  });

  assertEquals(classifyPick(await b), 'duplicate');
  release();
  assertEquals(classifyPick(await a), 'selected');
  assertEquals(presented, 1);
});

Deno.test('a duplicate is never reported as a failure', async () => {
  const inFlight = { current: true };
  let failures = 0;
  const result = await runPick({
    inFlight,
    waitForTransitions: () => Promise.resolve(),
    work: async () => selected,
    onFailure: () => { failures += 1; },
  });
  assertEquals(classifyPick(result), 'duplicate');
  assertEquals(failures, 0);
  // The guard must not be cleared by the call it rejected — the pick that
  // owns it is still running.
  assertEquals(inFlight.current, true);
});

Deno.test('the single-flight guard is released after every outcome', async () => {
  for (const work of [
    async () => selected,
    async () => cancelled,
    async () => { throw new Error('boom'); },
  ]) {
    const inFlight = cell();
    await runPick({ inFlight, waitForTransitions: () => Promise.resolve(), work, onFailure: noop });
    assertEquals(inFlight.current, false);
  }
});

// ── 3. A failure is not a cancellation ─────────────────────────────────────

Deno.test('a throwing picker is reported as a failure, never as a cancel', async () => {
  const reasons: string[] = [];
  const result = await runPick({
    inFlight: cell(),
    waitForTransitions: () => Promise.resolve(),
    work: async () => { throw Object.assign(new Error('x'), { code: 'ERR_PICKING_IN_PROGRESS' }); },
    onFailure: (_e, reason) => reasons.push(reason),
    });
  assertEquals(reasons, ['threw']);
  assertEquals(classifyPick(result), 'failed');
  assertEquals(shouldTrackCancelled(result), false);
});

Deno.test('the failing error reaches the reporter intact', async () => {
  let seen: any = null;
  await runPick({
    inFlight: cell(),
    waitForTransitions: () => Promise.resolve(),
    work: async () => { throw Object.assign(new Error('nope'), { code: 'ERR_PICKING_IN_PROGRESS' }); },
    onFailure: (err) => { seen = err; },
  });
  assertEquals(seen?.code, 'ERR_PICKING_IN_PROGRESS');
});

// ── 4. A real cancellation stays a cancellation ────────────────────────────

Deno.test('a student dismissing the picker is still a cancellation', async () => {
  let failures = 0;
  const result = await runPick({
    inFlight: cell(),
    waitForTransitions: () => Promise.resolve(),
    work: async () => cancelled,
    onFailure: () => { failures += 1; },
  });
  assertEquals(classifyPick(result), 'cancelled');
  assertEquals(shouldTrackCancelled(result), true);
  assertEquals(failures, 0);
});

Deno.test('an empty selection is a cancellation, not a failure', async () => {
  assertEquals(classifyPick({ canceled: false, assets: [] }), 'cancelled');
  assertEquals(shouldTrackCancelled({ canceled: false, assets: [] }), true);
});

// ── classifyPick ordering ──────────────────────────────────────────────────

Deno.test('failed and duplicate outrank the canceled flag they also carry', () => {
  // Both carry canceled:true so old callers stay sane — which is exactly why
  // the checks have to come first.
  assertEquals(classifyPick({ canceled: true, assets: [], failed: true }), 'failed');
  assertEquals(classifyPick({ canceled: true, assets: [], duplicate: true }), 'duplicate');
  assertEquals(shouldTrackCancelled({ canceled: true, assets: [], failed: true }), false);
  assertEquals(shouldTrackCancelled({ canceled: true, assets: [], duplicate: true }), false);
});

Deno.test('a missing result is a failure, not a silent success', () => {
  assertEquals(classifyPick(null), 'failed');
  assertEquals(classifyPick(undefined), 'failed');
});

Deno.test('a real selection is selected', () => {
  assert(classifyPick(selected) === 'selected');
});

// ── the timeout path: the strand these tests did not previously cover ───────
//
// A timeout does not cancel the native call, and expo-document-picker clears
// its `pickingContext` only from the picker's own delegate callbacks. So while
// the picker is still outstanding the module is still busy, and the guard has
// to say so. Releasing it on the timeout was what let the next tap reach the
// module and strand it permanently.

Deno.test('a timeout does NOT release the guard while the picker is still outstanding', async () => {
  const inFlight = cell();
  let settle: (v: unknown) => void = () => {};
  const work = () => new Promise((resolve) => { settle = resolve; });

  const result = await runPick({
    inFlight,
    waitForTransitions: () => Promise.resolve(),
    work,
    onFailure: noop,
    timeoutMs: 1,
  });

  assertEquals(classifyPick(result as any), 'failed');
  assertEquals(inFlight.current, true, 'native is still holding the picker');

  settle({ canceled: true, assets: [] });
});

Deno.test('the guard is released once the abandoned picker finally settles', async () => {
  const inFlight = cell();
  let settle: (v: unknown) => void = () => {};
  const work = () => new Promise((resolve) => { settle = resolve; });

  await runPick({
    inFlight,
    waitForTransitions: () => Promise.resolve(),
    work,
    onFailure: noop,
    timeoutMs: 1,
  });
  assertEquals(inFlight.current, true);

  settle({ canceled: true, assets: [] });
  await new Promise((r) => setTimeout(r, 0));

  assertEquals(inFlight.current, false, 'the picker settled, so the module is free again');
});

Deno.test('the guard is released when the abandoned picker settles by THROWING', async () => {
  const inFlight = cell();
  let fail: (e: unknown) => void = () => {};
  const work = () => new Promise((_resolve, reject) => { fail = reject; });

  await runPick({
    inFlight,
    waitForTransitions: () => Promise.resolve(),
    work,
    onFailure: noop,
    timeoutMs: 1,
  });
  assertEquals(inFlight.current, true);

  fail(new Error('late native failure'));
  await new Promise((r) => setTimeout(r, 0));

  assertEquals(inFlight.current, false);
});

Deno.test('a tap after a timeout never reaches the native module', async () => {
  const inFlight = cell();
  let settle: (v: unknown) => void = () => {};
  let nativeCalls = 0;
  const work = () => {
    nativeCalls += 1;
    return new Promise((resolve) => { settle = resolve; });
  };

  await runPick({
    inFlight, waitForTransitions: () => Promise.resolve(), work, onFailure: noop, timeoutMs: 1,
  });
  assertEquals(nativeCalls, 1);

  // This is the tap that used to strand the picker forever.
  const second = await runPick({
    inFlight, waitForTransitions: () => Promise.resolve(), work, onFailure: noop, timeoutMs: 1,
  });

  assertEquals(classifyPick(second as any), 'duplicate');
  assertEquals(nativeCalls, 1, 'the native module was never called a second time');
  assertEquals(shouldTrackCancelled(second as any), false);

  settle({ canceled: true, assets: [] });
});

Deno.test('a timeout is reported as a failure exactly once, never as a cancel', async () => {
  const inFlight = cell();
  let settle: (v: unknown) => void = () => {};
  const reasons: string[] = [];

  const result = await runPick({
    inFlight,
    waitForTransitions: () => Promise.resolve(),
    work: () => new Promise((resolve) => { settle = resolve; }),
    onFailure: (_err, reason) => { reasons.push(reason); },
    timeoutMs: 1,
  });

  assertEquals(reasons, ['timeout']);
  assertEquals(shouldTrackCancelled(result as any), false);

  // The late settle must not produce a second report.
  settle({ canceled: true, assets: [] });
  await new Promise((r) => setTimeout(r, 0));
  assertEquals(reasons, ['timeout']);
});

Deno.test('a stalled waitForTransitions times out without stranding the module', async () => {
  const inFlight = cell();
  let nativeCalls = 0;

  const result = await runPick({
    inFlight,
    waitForTransitions: () => new Promise<void>(() => {}), // never resolves
    work: () => { nativeCalls += 1; return Promise.resolve(selected); },
    onFailure: noop,
    timeoutMs: 1,
  });

  assertEquals(classifyPick(result as any), 'failed');
  assertEquals(nativeCalls, 0, 'the picker was never presented, so nothing to strand');
  // And the guard must NOT be held. A stalled InteractionManager would
  // otherwise disable the button for the life of the process — the same dead
  // end as the native strand, reached from the JS side.
  assertEquals(inFlight.current, false, 'nothing native was reached, so nothing to guard');
});

Deno.test('a button stalled by transitions still works on the next tap', async () => {
  const inFlight = cell();
  let stall = true;
  let nativeCalls = 0;
  const deps = () => ({
    inFlight,
    waitForTransitions: () => (stall ? new Promise<void>(() => {}) : Promise.resolve()),
    work: () => { nativeCalls += 1; return Promise.resolve(selected); },
    onFailure: noop,
    timeoutMs: 1,
  });

  await runPick(deps());          // stalls, times out
  assertEquals(nativeCalls, 0);

  stall = false;
  const second = await runPick(deps());
  assertEquals(classifyPick(second as any), 'selected', 'the button recovered');
  assertEquals(nativeCalls, 1);
});
