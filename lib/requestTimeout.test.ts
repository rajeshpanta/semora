/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/requestTimeout.test.ts
 *
 * The tutor's document-preparation step used to await a fetch that could never
 * settle, so the spinner it owned could never be cleared. These cases pin the
 * property that fixes it: the request ALWAYS settles, and always with an error
 * the caller can act on.
 *
 * The "loading state" cases reproduce the caller's structure exactly —
 * try { await … } catch { show } finally { clear } — which is what
 * handleExplainAssignment and handleSend already do. They prove the promise
 * reaches that finally; they do not render the screen (there is no component
 * test framework in this project, and this fix does not add one).
 */
import { assertEquals, assert, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  fetchWithTimeout,
  isTimeoutError,
  isNetworkError,
  REQUEST_TIMEOUT_CODE,
  NETWORK_FAILED_CODE,
  TUTOR_REQUEST_TIMEOUT_MS,
} from './requestTimeout';

const ok = () => new Response(JSON.stringify({ ready: true }), { status: 200 });

/** A fetch that never settles on its own — only the abort can end it. */
const stalledFetch: typeof fetch = (_url, init) =>
  new Promise((_resolve, reject) => {
    const signal = (init as RequestInit | undefined)?.signal;
    signal?.addEventListener('abort', () => {
      const e = new Error('The operation was aborted.');
      e.name = 'AbortError';
      reject(e);
    });
  });

// ── 1. Success still works ─────────────────────────────────────────────────

Deno.test('a normal request still resolves untouched', async () => {
  const res = await fetchWithTimeout('https://x/functions/v1/tutor-chat', { method: 'POST' }, {
    fetchImpl: async () => ok(),
  });
  assertEquals(res.status, 200);
  assertEquals((await res.json()).ready, true);
});

Deno.test('a non-2xx is returned, not thrown — the caller still parses the body', async () => {
  // callTutor reads err.error/err.code off the body, so this path must not be
  // converted into a network error.
  const res = await fetchWithTimeout('https://x', {}, {
    fetchImpl: async () => new Response(JSON.stringify({ error: 'Pro required', code: 'PRO_REQUIRED' }), { status: 402 }),
  });
  assertEquals(res.status, 402);
  assertEquals((await res.json()).code, 'PRO_REQUIRED');
});

Deno.test('the request carries an abort signal', async () => {
  let sawSignal = false;
  await fetchWithTimeout('https://x', { method: 'POST' }, {
    fetchImpl: async (_u, init) => {
      sawSignal = !!(init as RequestInit).signal;
      return ok();
    },
  });
  assert(sawSignal, 'fetch must receive the AbortController signal');
});

// ── 2. A stalled request aborts at the timeout ─────────────────────────────

Deno.test('a stalled request is aborted and rejects as a timeout', async () => {
  let aborted = false;
  const err = await assertRejects(() =>
    fetchWithTimeout('https://x', {}, {
      timeoutMs: 20,
      fetchImpl: (_u, init) => new Promise((_res, rej) => {
        (init as RequestInit).signal?.addEventListener('abort', () => {
          aborted = true;
          const e = new Error('aborted'); e.name = 'AbortError'; rej(e);
        });
      }),
    }));
  assert(aborted, 'the in-flight request must actually be aborted, not just abandoned');
  assertEquals((err as { code?: string }).code, REQUEST_TIMEOUT_CODE);
  assert(isTimeoutError(err));
  assertEquals((err as { retryable?: boolean }).retryable, true);
});

Deno.test('the timeout message tells the student what to do', async () => {
  const err = await assertRejects(() =>
    fetchWithTimeout('https://x', {}, { timeoutMs: 10, fetchImpl: stalledFetch }));
  assert(/too long/i.test((err as Error).message), (err as Error).message);
  assert(/try again/i.test((err as Error).message));
});

Deno.test('our own abort is never mislabelled as a network fault', async () => {
  // Reporting a timeout as a connection error tells the student to check a
  // connection that is fine.
  const err = await assertRejects(() =>
    fetchWithTimeout('https://x', {}, { timeoutMs: 10, fetchImpl: stalledFetch }));
  assertEquals(isNetworkError(err), false);
  assertEquals(isTimeoutError(err), true);
});

Deno.test('the default bound matches the streaming transport', () => {
  assertEquals(TUTOR_REQUEST_TIMEOUT_MS, 120_000);
});

// ── 3. Loading state clears after a timeout ────────────────────────────────

Deno.test('the caller reaches finally after a timeout — spinner cleared', async () => {
  // Mirrors handleExplainAssignment / handleSend.
  let working = true;
  let inFlight = true;
  let shown: string | null = null;
  try {
    await fetchWithTimeout('https://x', {}, { timeoutMs: 10, fetchImpl: stalledFetch });
  } catch (e) {
    shown = (e as Error).message;
  } finally {
    working = false;
    inFlight = false;
  }
  assertEquals(working, false, 'tutorWork must be cleared');
  assertEquals(inFlight, false, 'tutorWorkInFlightRef must be cleared');
  assert(shown, 'the student must be shown an error, not left on a spinner');
});

// ── 4. Loading state clears after a network failure ────────────────────────

Deno.test('a network failure rejects, and the caller reaches finally', async () => {
  let working = true;
  let shown: string | null = null;
  try {
    await fetchWithTimeout('https://x', {}, {
      fetchImpl: async () => { throw new TypeError('Network request failed'); },
    });
  } catch (e) {
    shown = (e as Error).message;
    assertEquals((e as { code?: string }).code, NETWORK_FAILED_CODE);
    assertEquals((e as { retryable?: boolean }).retryable, true);
  } finally {
    working = false;
  }
  assertEquals(working, false);
  assertEquals(shown, 'Network request failed');
});

Deno.test('a network failure with no message still says something useful', async () => {
  const err = await assertRejects(() =>
    fetchWithTimeout('https://x', {}, { fetchImpl: async () => { throw new Error(''); } }));
  assert((err as Error).message.trim().length > 0);
  assert(isNetworkError(err));
});

// ── 5. The student can retry after a failure ───────────────────────────────

Deno.test('a retry after a timeout succeeds — no state leaks between calls', async () => {
  let attempt = 0;
  const flaky: typeof fetch = (_u, init) => {
    attempt += 1;
    if (attempt === 1) {
      return new Promise((_r, rej) => {
        (init as RequestInit).signal?.addEventListener('abort', () => {
          const e = new Error('aborted'); e.name = 'AbortError'; rej(e);
        });
      });
    }
    return Promise.resolve(ok());
  };
  await assertRejects(() => fetchWithTimeout('https://x', {}, { timeoutMs: 10, fetchImpl: flaky }));
  // The second call must not inherit the first one's deadline or controller.
  const res = await fetchWithTimeout('https://x', {}, { timeoutMs: 10_000, fetchImpl: flaky });
  assertEquals(res.status, 200);
  assertEquals(attempt, 2);
});

Deno.test('a retry after a network failure succeeds', async () => {
  let attempt = 0;
  const flaky: typeof fetch = async () => {
    attempt += 1;
    if (attempt === 1) throw new TypeError('Network request failed');
    return ok();
  };
  await assertRejects(() => fetchWithTimeout('https://x', {}, { fetchImpl: flaky }));
  assertEquals((await fetchWithTimeout('https://x', {}, { fetchImpl: flaky })).status, 200);
});

// ── 6. Plain chat is unchanged ─────────────────────────────────────────────

Deno.test('a fast request is never aborted by the timeout', async () => {
  // A tutor turn with no documents never calls this at all; one that does must
  // not be cut short just because a bound now exists.
  let aborted = false;
  const res = await fetchWithTimeout('https://x', {}, {
    timeoutMs: 5_000,
    fetchImpl: async (_u, init) => {
      (init as RequestInit).signal?.addEventListener('abort', () => { aborted = true; });
      await new Promise((r) => setTimeout(r, 20));
      return ok();
    },
  });
  assertEquals(res.status, 200);
  assertEquals(aborted, false, 'a request that answered in time must not be aborted');
});

Deno.test('the timer is cleared on success, so nothing fires afterwards', async () => {
  let abortedLater = false;
  await fetchWithTimeout('https://x', {}, {
    timeoutMs: 15,
    fetchImpl: async (_u, init) => {
      (init as RequestInit).signal?.addEventListener('abort', () => { abortedLater = true; });
      return ok();
    },
  });
  await new Promise((r) => setTimeout(r, 40));
  assertEquals(abortedLater, false, 'a settled request must not be aborted after the fact');
});
