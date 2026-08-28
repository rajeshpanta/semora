/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/watchCompletion.test.ts
 *
 * These guards stand between another device and a database write, so the cases
 * that matter are the hostile ones: a malformed payload, a replayed request,
 * and a completion arriving after the deadline.
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  parseWatchCompletionRequest,
  deriveSubmittedLate,
  WatchRequestLedger,
  WATCH_COMPLETE_REQUEST_TYPE,
} from './watchCompletion';

const REQ = '11111111-1111-4111-8111-111111111111';
const TASK = '22222222-2222-4222-8222-222222222222';

const valid = {
  type: WATCH_COMPLETE_REQUEST_TYPE,
  requestId: REQ,
  taskId: TASK,
  requestedAt: '2026-08-28T09:00:00Z',
};

// ── parsing ────────────────────────────────────────────────────────────────

Deno.test('a well-formed request parses', () => {
  const parsed = parseWatchCompletionRequest(valid)!;
  assertEquals(parsed.requestId, REQ);
  assertEquals(parsed.taskId, TASK);
  assertEquals(parsed.requestedAt, '2026-08-28T09:00:00Z');
});

Deno.test('anything that is not a completion request is refused', () => {
  assertEquals(parseWatchCompletionRequest(null), null);
  assertEquals(parseWatchCompletionRequest('nope' as unknown), null);
  assertEquals(parseWatchCompletionRequest({}), null);
  // The read-only snapshot travels the same channel in the other direction;
  // it must never be mistaken for a request to write something.
  assertEquals(parseWatchCompletionRequest({ type: 'semora_watch_snapshot', requestId: REQ, taskId: TASK }), null);
  assertEquals(parseWatchCompletionRequest({ type: 'semora_watch_test', requestId: REQ, taskId: TASK }), null);
});

Deno.test('ids must be uuid-shaped', () => {
  assertEquals(parseWatchCompletionRequest({ ...valid, taskId: 'not-a-uuid' }), null);
  assertEquals(parseWatchCompletionRequest({ ...valid, requestId: '123' }), null);
  assertEquals(parseWatchCompletionRequest({ ...valid, taskId: 42 }), null);
  assertEquals(parseWatchCompletionRequest({ ...valid, taskId: undefined }), null);
  // A SQL fragment is just a non-uuid string; it never reaches a query.
  assertEquals(parseWatchCompletionRequest({ ...valid, taskId: "' OR 1=1 --" }), null);
});

Deno.test('a missing timestamp does not sink an otherwise valid request', () => {
  const parsed = parseWatchCompletionRequest({ ...valid, requestedAt: undefined })!;
  assert(parsed);
  assertEquals(parsed.requestedAt, '');
});

// ── lateness ───────────────────────────────────────────────────────────────

Deno.test('a timed task is late only after its time', () => {
  const before = new Date('2026-08-28T13:59:00Z');
  const after = new Date('2026-08-28T14:01:00Z');
  // Compared in local time on the device, exactly as the notification action
  // does; the assertions use offsets far enough apart to hold in any zone.
  assertEquals(deriveSubmittedLate('2026-08-28', '14:00:00', new Date(before.getTime() - 86_400_000)), false);
  assertEquals(deriveSubmittedLate('2026-08-28', '14:00:00', new Date(after.getTime() + 86_400_000)), true);
});

Deno.test('an untimed task is late only after the end of its day', () => {
  assertEquals(deriveSubmittedLate('2026-08-28', null, new Date('2026-08-28T00:00:01')), false);
  assertEquals(deriveSubmittedLate('2026-08-28', null, new Date('2026-08-28T23:58:00')), false);
  assertEquals(deriveSubmittedLate('2026-08-28', null, new Date('2026-08-29T00:30:00')), true);
});

Deno.test('completing something due in the future is never late', () => {
  assertEquals(deriveSubmittedLate('2026-12-01', null, new Date('2026-08-28T12:00:00')), false);
});

Deno.test('an unparseable due date is treated as on time', () => {
  // Being forgiving is the right default: the alternative is recording a
  // penalty against a student because a row was malformed.
  assertEquals(deriveSubmittedLate('not-a-date', null, new Date('2026-08-28T12:00:00')), false);
  assertEquals(deriveSubmittedLate('', '10:00', new Date('2026-08-28T12:00:00')), false);
});

// ── replay protection ──────────────────────────────────────────────────────

Deno.test('a request is claimed once', () => {
  const ledger = new WatchRequestLedger();
  assertEquals(ledger.claim(REQ), true);
  assertEquals(ledger.claim(REQ), false, 'a replay must not be acted on');
  assertEquals(ledger.claim(REQ), false);
});

Deno.test('different requests are independent', () => {
  const ledger = new WatchRequestLedger();
  assert(ledger.claim(REQ));
  assert(ledger.claim(TASK));
  assertEquals(ledger.size, 2);
});

Deno.test('a released request can be retried', () => {
  // Only for transport failures. A refusal is never released, or a replay
  // would do the work twice.
  const ledger = new WatchRequestLedger();
  assert(ledger.claim(REQ));
  ledger.release(REQ);
  assertEquals(ledger.has(REQ), false);
  assertEquals(ledger.claim(REQ), true);
});

Deno.test('releasing something never claimed is harmless', () => {
  const ledger = new WatchRequestLedger();
  ledger.release('whatever');
  assertEquals(ledger.size, 0);
});

Deno.test('the ledger stays bounded and forgets oldest first', () => {
  const ledger = new WatchRequestLedger(3);
  ['a', 'b', 'c'].forEach((id) => ledger.claim(id));
  assertEquals(ledger.size, 3);
  ledger.claim('d');
  assertEquals(ledger.size, 3);
  assertEquals(ledger.has('a'), false, 'oldest evicted');
  assertEquals(ledger.has('d'), true);
  // The evicted one can be replayed — which is why the database check, not
  // this, is the authoritative guard.
  assertEquals(ledger.claim('a'), true);
});

// ── orchestration ──────────────────────────────────────────────────────────

import { handleWatchCompletionRequest, type WatchCompletionTask } from './watchCompletion';

const parsed = parseWatchCompletionRequest(valid)!;

const aTask = (over: Partial<WatchCompletionTask> = {}): WatchCompletionTask => ({
  id: TASK,
  title: 'Essay draft',
  due_date: '2026-08-28',
  due_time: null,
  is_completed: false,
  ...over,
});

function harness(opts: {
  task?: WatchCompletionTask | null;
  loadThrows?: boolean;
  completeThrows?: boolean;
  now?: Date;
  ledger?: WatchRequestLedger;
}) {
  const calls: Array<{ id: string; is_completed: boolean; submitted_late: boolean }> = [];
  const ledger = opts.ledger ?? new WatchRequestLedger();
  const deps = {
    ledger,
    now: () => opts.now ?? new Date('2026-08-28T12:00:00'),
    loadTask: async () => {
      if (opts.loadThrows) throw new Error('network');
      return opts.task === undefined ? aTask() : opts.task;
    },
    complete: async (input: any) => {
      if (opts.completeThrows) throw new Error('write failed');
      calls.push(input);
      return {};
    },
  };
  return { deps, calls, ledger };
}

Deno.test('a valid request completes the task through the canonical mutation', async () => {
  const { deps, calls } = harness({});
  const out = await handleWatchCompletionRequest(parsed, deps);
  assertEquals(out, { ok: true, reason: null, completed: true });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].id, TASK);
  assertEquals(calls[0].is_completed, true);
});

Deno.test('lateness is derived, not asked', async () => {
  // Nobody is at the phone, so TaskCompletionFlow's question cannot be asked.
  const late = harness({ task: aTask({ due_date: '2026-08-20' }) });
  await handleWatchCompletionRequest(parsed, late.deps);
  assertEquals(late.calls[0].submitted_late, true);

  const onTime = harness({ task: aTask({ due_date: '2026-12-01' }) });
  await handleWatchCompletionRequest(parsed, onTime.deps);
  assertEquals(onTime.calls[0].submitted_late, false);
});

Deno.test('a task that no longer exists is refused, not completed', async () => {
  const { deps, calls } = harness({ task: null });
  const out = await handleWatchCompletionRequest(parsed, deps);
  assertEquals(out.ok, false);
  assertEquals(out.reason, 'not_found');
  assertEquals(calls.length, 0);
});

Deno.test('an already-complete task is not completed twice', async () => {
  // The authoritative duplicate guard. A second completion would fire the
  // celebration again, increment the review milestone again, and ask the
  // recurrence trigger for a second next occurrence.
  const { deps, calls } = harness({ task: aTask({ is_completed: true }) });
  const out = await handleWatchCompletionRequest(parsed, deps);
  assertEquals(out.completed, false);
  assertEquals(calls.length, 0);
  // Still reported as success — the work is done.
  assertEquals(out.ok, true);
  assertEquals(out.reason, 'already_completed');
});

Deno.test('a replayed request never reaches the database', async () => {
  const ledger = new WatchRequestLedger();
  const first = harness({ ledger });
  await handleWatchCompletionRequest(parsed, first.deps);
  assertEquals(first.calls.length, 1);

  const second = harness({ ledger });
  const out = await handleWatchCompletionRequest(parsed, second.deps);
  assertEquals(out.reason, 'duplicate');
  assertEquals(out.completed, false);
  assertEquals(second.calls.length, 0, 'a replay must not write');
  assertEquals(out.ok, true, 'the watch should still show it as done');
});

Deno.test('a failed write is retryable', async () => {
  const ledger = new WatchRequestLedger();
  const failing = harness({ ledger, completeThrows: true });
  const out = await handleWatchCompletionRequest(parsed, failing.deps);
  assertEquals(out.ok, false);
  assertEquals(out.reason, 'failed');
  // Released, or a student whose phone hiccuped could never complete that task
  // from the wrist again.
  assertEquals(ledger.has(parsed.requestId), false);

  const retry = harness({ ledger });
  const second = await handleWatchCompletionRequest(parsed, retry.deps);
  assertEquals(second.completed, true);
});

Deno.test('a failed lookup is refused and retryable', async () => {
  const ledger = new WatchRequestLedger();
  const { deps, calls } = harness({ ledger, loadThrows: true });
  const out = await handleWatchCompletionRequest(parsed, deps);
  assertEquals(out.reason, 'failed');
  assertEquals(calls.length, 0);
  assertEquals(ledger.has(parsed.requestId), false);
});

Deno.test('a refusal is NOT released — a replay must not retry it', async () => {
  // not_found and already_completed are answers, not failures. Releasing them
  // would let a queued replay do the work a second time.
  const ledger = new WatchRequestLedger();
  await handleWatchCompletionRequest(parsed, harness({ ledger, task: null }).deps);
  assertEquals(ledger.has(parsed.requestId), true);

  const replay = harness({ ledger });
  const out = await handleWatchCompletionRequest(parsed, replay.deps);
  assertEquals(out.reason, 'duplicate');
  assertEquals(replay.calls.length, 0);
});

Deno.test('only ever completes — the Watch cannot un-complete a task', async () => {
  // Phase 4 is one-directional by design: reopening work is a decision that
  // wants the context the phone has.
  const { deps, calls } = harness({});
  await handleWatchCompletionRequest(parsed, deps);
  assertEquals(calls.every((c) => c.is_completed === true), true);
});
