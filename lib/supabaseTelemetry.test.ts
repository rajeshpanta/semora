/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --allow-env --config lib/deno.test.json lib/supabaseTelemetry.test.ts
 *
 * lib/authTelemetry.test.ts proves the state machine. This file proves the two
 * WIRES into it, by driving the real adapter and the real fetch wrapper that
 * lib/supabase.ts hands to createClient — captured from the stubbed client
 * rather than reimplemented, so these cases cannot keep passing after the
 * production code has drifted away from them.
 *
 * The one thing worth being loud about: these tests must also prove the
 * adapter's BEHAVIOUR is unchanged. Instrumentation that quietly altered when a
 * session reads back as null would have caused the very outage it was added to
 * explain.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import * as SecureStore from './__testing__/expo-secure-store.stub.ts';
import {
  setAuthTelemetrySink,
  recordAuthEvent,
  EVENT_READ_DEGRADED,
  EVENT_IDENTITY_UNAVAILABLE,
  EVENT_IDENTITY_RECOVERED,
  __resetAuthTelemetryForTests,
  __setClockForTests,
  type DiagnosticProps,
} from './authTelemetry.ts';

// lib/supabase.ts reads __DEV__ and the two EXPO_PUBLIC_ vars at module scope.
// Both have to exist before the import is evaluated, hence the dynamic import.
(globalThis as any).__DEV__ = false;
Deno.env.set('EXPO_PUBLIC_SUPABASE_URL', 'https://stub.supabase.co');
Deno.env.set('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'anon-key-for-tests');

await import('./supabase.ts');
const { captured } = await import('./__testing__/supabase-js.stub.ts');
assert(captured, 'lib/supabase.ts did not call createClient');

const storage = captured.options.auth.storage;
const instrumentedFetch = captured.options.global.fetch;
const ANON_KEY = captured.key;

const SESSION_KEY = 'sb-stub-auth-token';
const CHUNK_MARKER = '__sbchunk__';

type Captured = { event: string; props: DiagnosticProps };

function harness(startAt = 1_000_000) {
  let now = startAt;
  const events: Captured[] = [];
  SecureStore.__reset();
  __resetAuthTelemetryForTests(now);
  __setClockForTests(() => now);
  setAuthTelemetrySink((event, props) => events.push({ event, props }));
  return { events, names: () => events.map((e) => e.event), advance: (ms: number) => (now += ms) };
}

function headers(authorization: string): Headers {
  return new Headers({ apikey: ANON_KEY, Authorization: authorization });
}

/** Swap in a fetch that answers without a network, and restore it after. */
async function withFetch<T>(
  impl: (input: any, init?: any) => Promise<Response>,
  body: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  (globalThis as any).fetch = impl;
  try {
    return await body();
  } finally {
    (globalThis as any).fetch = original;
  }
}

// ─── The storage adapter: behaviour first, then what it now reports ─────────

Deno.test('adapter: a round-tripped large session still reads back identically', async () => {
  harness();
  const session = JSON.stringify({ access_token: 'x'.repeat(4000), refresh_token: 'y'.repeat(200) });
  await storage.setItem(SESSION_KEY, session);
  assertEquals(await storage.getItem(SESSION_KEY), session);
});

Deno.test('adapter: a small session still uses one key and reads back identically', async () => {
  harness();
  await storage.setItem(SESSION_KEY, 'small');
  assertEquals(SecureStore.items.get(SESSION_KEY), 'small');
  assertEquals(await storage.getItem(SESSION_KEY), 'small');
});

Deno.test('adapter: nothing stored still returns null, and says so quietly', async () => {
  const h = harness();
  assertEquals(await storage.getItem(SESSION_KEY), null);
  assertEquals(h.events, []); // `miss` is the ordinary signed-out answer
});

Deno.test('adapter: a torn write still returns null — and now explains itself', async () => {
  const h = harness();
  const session = JSON.stringify({ access_token: 'x'.repeat(4000) });
  await storage.setItem(SESSION_KEY, session);

  const manifest = SecureStore.items.get(SESSION_KEY) ?? '';
  assert(manifest.startsWith(CHUNK_MARKER), 'expected a chunked layout');
  const count = Number(manifest.slice(CHUNK_MARKER.length));
  // Exactly the state a write interrupted after clearSecureChunks leaves behind:
  // manifest intact, a chunk gone.
  SecureStore.items.delete(`${SESSION_KEY}.chunk.${count - 1}`);

  assertEquals(await storage.getItem(SESSION_KEY), null); // behaviour unchanged
  assertEquals(h.names(), [EVENT_READ_DEGRADED]);
  assertEquals(h.events[0].props.outcome, 'partial');
  assertEquals(h.events[0].props.chunks_expected, count);
  assertEquals(h.events[0].props.chunks_found, count - 1);
});

Deno.test('adapter: a locked keychain still returns null — and is named as such', async () => {
  const h = harness();
  SecureStore.throwOnGet.add(SESSION_KEY);
  assertEquals(await storage.getItem(SESSION_KEY), null); // behaviour unchanged
  assertEquals(h.names(), [EVENT_READ_DEGRADED]);
  assertEquals(h.events[0].props.outcome, 'error');
});

Deno.test('adapter: an unparseable manifest still returns null and is distinguished', async () => {
  const h = harness();
  SecureStore.items.set(SESSION_KEY, `${CHUNK_MARKER}not-a-number`);
  assertEquals(await storage.getItem(SESSION_KEY), null); // behaviour unchanged
  assertEquals(h.events[0].props.outcome, 'bad_manifest');
});

// ─── The fetch wrapper ─────────────────────────────────────────────────────

const ok = () => Promise.resolve(new Response('[]', { status: 200 }));

Deno.test('fetch: a healthy authenticated request is silent and passes through', async () => {
  const h = harness();
  recordAuthEvent('INITIAL_SESSION', true, 1_000_000);
  await withFetch(ok, async () => {
    const res = await instrumentedFetch('https://stub.supabase.co/rest/v1/tasks?select=*', {
      headers: headers('Bearer a-real-user-token'),
    });
    assertEquals(res.status, 200);
    assertEquals(await res.text(), '[]');
  });
  assertEquals(h.events, []);
});

Deno.test('fetch: an anon-key request while signed in opens a window', async () => {
  const h = harness();
  recordAuthEvent('INITIAL_SESSION', true, 1_000_000);
  await withFetch(ok, async () => {
    await instrumentedFetch('https://stub.supabase.co/rest/v1/tasks?select=*', {
      headers: headers(`Bearer ${ANON_KEY}`),
    });
  });
  assertEquals(h.names(), [EVENT_IDENTITY_UNAVAILABLE]);
});

Deno.test('fetch: our own analytics insert can never re-trigger the diagnosis', async () => {
  const h = harness();
  recordAuthEvent('INITIAL_SESSION', true, 1_000_000);
  await withFetch(ok, async () => {
    for (let i = 0; i < 10; i++) {
      await instrumentedFetch('https://stub.supabase.co/rest/v1/analytics_events', {
        headers: headers(`Bearer ${ANON_KEY}`),
      });
    }
  });
  assertEquals(h.events, []);
});

Deno.test('fetch: refresh attempts are counted, including ones that never land', async () => {
  const h = harness();
  recordAuthEvent('INITIAL_SESSION', true, 500); // already expired against the 1000s clock

  await withFetch(ok, async () => {
    await instrumentedFetch('https://stub.supabase.co/rest/v1/tasks', {
      headers: headers(`Bearer ${ANON_KEY}`),
    });
  });

  // One refresh rejected by the server, one that never reached the edge at all.
  await withFetch(
    () => Promise.resolve(new Response('{}', { status: 400 })),
    () =>
      instrumentedFetch('https://stub.supabase.co/auth/v1/token?grant_type=refresh_token', {
        headers: headers(`Bearer ${ANON_KEY}`),
      }),
  );
  let threw = false;
  try {
    await withFetch(
      () => Promise.reject(new TypeError('Network request failed')),
      () =>
        instrumentedFetch('https://stub.supabase.co/auth/v1/token?grant_type=refresh_token', {
          headers: headers(`Bearer ${ANON_KEY}`),
        }),
    );
  } catch {
    threw = true; // rethrown, exactly as the caller expects
  }
  assert(threw, 'a rejected fetch must still reject');

  h.advance(30_000);
  await withFetch(ok, async () => {
    await instrumentedFetch('https://stub.supabase.co/rest/v1/tasks', {
      headers: headers(`Bearer ${ANON_KEY}`),
    });
  });

  const last = h.events[h.events.length - 1];
  assertEquals(last.event, EVENT_IDENTITY_UNAVAILABLE);
  assertEquals(last.props.refresh_attempts, 2);
  assertEquals(last.props.refresh_last_status, null); // the invisible one, last
  assertEquals(last.props.token_expired, true);
});

Deno.test('fetch: identity returning closes the window with a duration', async () => {
  const h = harness();
  recordAuthEvent('INITIAL_SESSION', true, 1_000_000);
  await withFetch(ok, async () => {
    await instrumentedFetch('https://stub.supabase.co/rest/v1/courses', {
      headers: headers(`Bearer ${ANON_KEY}`),
    });
    h.advance(212_000);
    await instrumentedFetch('https://stub.supabase.co/rest/v1/courses', {
      headers: headers('Bearer a-real-user-token'),
    });
  });
  const recovered = h.events.find((e) => e.event === EVENT_IDENTITY_RECOVERED);
  assert(recovered);
  assertEquals(recovered.props.unauth_ms, 212_000);
});

Deno.test('fetch: instrumentation never becomes the reason a request fails', async () => {
  harness();
  recordAuthEvent('INITIAL_SESSION', true, 1_000_000);
  setAuthTelemetrySink(() => {
    throw new Error('analytics is down');
  });
  await withFetch(ok, async () => {
    // A malformed input must not stop the request, and a throwing sink must not
    // surface to the caller.
    const res = await instrumentedFetch(undefined as any, {
      headers: headers(`Bearer ${ANON_KEY}`),
    });
    assertEquals(res.status, 200);
  });
});

Deno.test('fetch: the anon key itself is never handed to the sink', async () => {
  const h = harness();
  recordAuthEvent('INITIAL_SESSION', true, 1_000_000);
  await withFetch(ok, async () => {
    await instrumentedFetch('https://stub.supabase.co/rest/v1/tasks', {
      headers: headers(`Bearer ${ANON_KEY}`),
    });
  });
  assert(h.events.length > 0);
  assert(!JSON.stringify(h.events).includes(ANON_KEY));
  assert(!JSON.stringify(h.events).includes('a-real-user-token'));
});
