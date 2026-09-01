/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/authTelemetry.test.ts
 *
 * The point of every case here is that a HEALTHY app is silent and a broken one
 * is specific. An instrumentation module that emits on the happy path would be
 * removed within a week for noise, and one that emits a single undifferentiated
 * "auth broke" event would leave us exactly where the 2026-08-31 logs left us.
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classifyRequest,
  isAnonAuthorization,
  isDegradedRead,
  noteProtectedRequest,
  recordAuthEvent,
  recordPhase,
  recordRefreshAttempt,
  recordStorageRead,
  recordStorageWriteFailure,
  setAuthTelemetrySink,
  EVENT_READ_DEGRADED,
  EVENT_IDENTITY_UNAVAILABLE,
  EVENT_IDENTITY_RECOVERED,
  __resetAuthTelemetryForTests,
  __setClockForTests,
  type DiagnosticProps,
} from './authTelemetry';

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon-key-shaped-string.sig';
const USER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.a-real-user-token.sig';

type Captured = { event: string; props: DiagnosticProps };

/** Fresh module state, a movable clock, and a sink that records what was said. */
function harness(startAt = 1_000_000) {
  let now = startAt;
  const events: Captured[] = [];
  __resetAuthTelemetryForTests(now);
  __setClockForTests(() => now);
  setAuthTelemetrySink((event, props) => events.push({ event, props }));
  return {
    events,
    advance(ms: number) {
      now += ms;
    },
    names: () => events.map((e) => e.event),
  };
}

/** The ordinary state: signed in, session read back cleanly. */
function signedInAndHealthy() {
  recordStorageRead('hit_chunked', 3, 3);
  recordAuthEvent('INITIAL_SESSION', true, Math.floor(Date.now() / 1000) + 3600);
}

// ─── Pure classifiers ──────────────────────────────────────────────────────

Deno.test('analytics inserts are never counted as protected traffic', () => {
  // Otherwise one anon window emits an event, whose own insert is an anon
  // protected request, which emits an event, forever.
  assertEquals(classifyRequest('https://x.supabase.co/rest/v1/analytics_events'), 'telemetry');
  assertEquals(classifyRequest('https://x.supabase.co/rest/v1/tasks?select=*'), 'protected');
});

Deno.test('the three request kinds that matter are told apart', () => {
  assertEquals(classifyRequest('https://x.supabase.co/auth/v1/token?grant_type=refresh_token'), 'auth_token');
  assertEquals(classifyRequest('https://x.supabase.co/storage/v1/object/sign/syllabi/a.pdf'), 'protected');
  assertEquals(classifyRequest('https://x.supabase.co/functions/v1/lecture-transcribe'), 'protected');
  assertEquals(classifyRequest('https://x.supabase.co/auth/v1/user'), 'other');
  assertEquals(classifyRequest(''), 'other');
  assertEquals(classifyRequest(undefined as unknown as string), 'other');
});

Deno.test('a request is anonymous only when it carries the anon key itself', () => {
  assert(isAnonAuthorization(`Bearer ${ANON_KEY}`, ANON_KEY));
  assert(!isAnonAuthorization(`Bearer ${USER_TOKEN}`, ANON_KEY));
  assert(!isAnonAuthorization(null, ANON_KEY));
  assert(!isAnonAuthorization(undefined, ANON_KEY));
  // No anon key configured must not make every request look anonymous.
  assert(!isAnonAuthorization(`Bearer ${ANON_KEY}`, ''));
});

Deno.test('only unreadable outcomes count as degraded', () => {
  assert(isDegradedRead('partial'));
  assert(isDegradedRead('bad_manifest'));
  assert(isDegradedRead('error'));
  // `miss` is the ordinary signed-out answer, not a fault.
  assert(!isDegradedRead('miss'));
  assert(!isDegradedRead('hit_single'));
  assert(!isDegradedRead('hit_chunked'));
});

// ─── Silence on the healthy path ───────────────────────────────────────────

Deno.test('a healthy signed-in launch emits nothing at all', () => {
  const h = harness();
  signedInAndHealthy();
  for (let i = 0; i < 50; i++) noteProtectedRequest(false);
  assertEquals(h.events, []);
});

Deno.test('a signed-out app making anonymous requests emits nothing', () => {
  const h = harness();
  recordStorageRead('miss');
  recordAuthEvent('INITIAL_SESSION', false, null);
  for (let i = 0; i < 50; i++) noteProtectedRequest(true);
  assertEquals(h.events, []);
});

Deno.test('recovery is not announced when no window was ever open', () => {
  const h = harness();
  signedInAndHealthy();
  noteProtectedRequest(false);
  assertEquals(h.names(), []);
});

// ─── The abnormal state ────────────────────────────────────────────────────

Deno.test('one window, one event — not one per request', () => {
  const h = harness();
  signedInAndHealthy();
  recordStorageRead('partial', 3, 1);
  h.events.length = 0; // drop the degraded-read event; this case is about the window

  for (let i = 0; i < 30; i++) noteProtectedRequest(true);
  assertEquals(h.names(), [EVENT_IDENTITY_UNAVAILABLE]);
  assertEquals(h.events[0].props.unauth_ms, 0);
  assertEquals(h.events[0].props.emit_seq, 1);
});

Deno.test('a window that persists restates itself, then stops', () => {
  const h = harness();
  signedInAndHealthy();
  noteProtectedRequest(true); // opens, emit 1

  h.advance(30_000);
  noteProtectedRequest(true); // emit 2
  h.advance(90_000); // 120s total
  noteProtectedRequest(true); // emit 3
  h.advance(600_000);
  for (let i = 0; i < 20; i++) noteProtectedRequest(true); // capped, silent

  assertEquals(h.names(), [
    EVENT_IDENTITY_UNAVAILABLE,
    EVENT_IDENTITY_UNAVAILABLE,
    EVENT_IDENTITY_UNAVAILABLE,
  ]);
  assertEquals(h.events[2].props.unauth_ms, 120_000);
  assertEquals(h.events[2].props.emit_seq, 3);
});

Deno.test('recovery closes the window and reports how long the app was nobody', () => {
  const h = harness();
  signedInAndHealthy();
  noteProtectedRequest(true);
  h.advance(212_000);
  noteProtectedRequest(true);
  noteProtectedRequest(false); // identity is back

  const recovered = h.events.find((e) => e.event === EVENT_IDENTITY_RECOVERED);
  assert(recovered, 'expected a recovery event');
  assertEquals(recovered.props.unauth_ms, 212_000);
  assertEquals(recovered.props.anon_requests, 2);
});

Deno.test('a later window is reported independently of the one before it', () => {
  const h = harness();
  signedInAndHealthy();
  noteProtectedRequest(true);
  noteProtectedRequest(false);
  h.advance(60_000);
  noteProtectedRequest(true);

  assertEquals(h.names(), [
    EVENT_IDENTITY_UNAVAILABLE,
    EVENT_IDENTITY_RECOVERED,
    EVENT_IDENTITY_UNAVAILABLE,
  ]);
});

Deno.test('a pathological loop cannot bill the analytics table forever', () => {
  const h = harness();
  signedInAndHealthy();
  for (let i = 0; i < 100; i++) {
    noteProtectedRequest(true);
    noteProtectedRequest(false);
  }
  const opened = h.names().filter((n) => n === EVENT_IDENTITY_UNAVAILABLE);
  assertEquals(opened.length, 10); // MAX_WINDOWS_PER_SESSION
});

// ─── The discriminator ─────────────────────────────────────────────────────

Deno.test('storage unreadable: zero refresh attempts is the tell', () => {
  const h = harness();
  recordAuthEvent('INITIAL_SESSION', true, Math.floor(1_000_000 / 1000) + 3600);
  recordStorageRead('partial', 4, 2);
  h.events.length = 0;

  noteProtectedRequest(true);
  h.advance(30_000);
  noteProtectedRequest(true);

  const last = h.events[h.events.length - 1];
  assertEquals(last.event, EVENT_IDENTITY_UNAVAILABLE);
  assertEquals(last.props.storage_outcome, 'partial');
  assertEquals(last.props.storage_chunks_expected, 4);
  assertEquals(last.props.storage_chunks_found, 2);
  // __loadSession returned before reaching the network. Nothing was attempted.
  assertEquals(last.props.refresh_attempts, 0);
});

Deno.test('expired token with a failing refresh: attempts are present and non-200', () => {
  const h = harness();
  recordStorageRead('hit_chunked', 3, 3);
  recordAuthEvent('INITIAL_SESSION', true, Math.floor(1_000_000 / 1000) - 10); // already past
  noteProtectedRequest(true); // opens the window

  recordRefreshAttempt(null); // never reached the edge
  recordRefreshAttempt(400);
  h.advance(30_000);
  noteProtectedRequest(true);

  const last = h.events[h.events.length - 1];
  assertEquals(last.props.storage_outcome, 'hit_chunked');
  assertEquals(last.props.refresh_attempts, 2);
  assertEquals(last.props.refresh_last_status, 400);
  assertEquals(last.props.token_expiry_known, true);
  assertEquals(last.props.token_expired, true);
});

Deno.test('lifecycle race: the window opens just after a resume and is short', () => {
  const h = harness();
  signedInAndHealthy();
  recordPhase('resume');
  h.advance(400);
  noteProtectedRequest(true);
  h.advance(900);
  noteProtectedRequest(false);

  const opened = h.events[0];
  assertEquals(opened.props.phase, 'resume');
  assertEquals(opened.props.ms_since_phase, 400);
  const recovered = h.events[1];
  assertEquals(recovered.props.unauth_ms, 900);
});

Deno.test('the opening storage read is frozen, not overwritten by later reads', () => {
  const h = harness();
  signedInAndHealthy();
  recordStorageRead('error');
  h.events.length = 0;
  noteProtectedRequest(true); // window opens on `error`

  // The adapter keeps being called; a later healthy read must not rewrite the
  // explanation of why the window opened.
  recordStorageRead('hit_chunked', 3, 3);
  h.advance(30_000);
  noteProtectedRequest(true);

  assertEquals(h.events[h.events.length - 1].props.storage_outcome, 'error');
});

// ─── Degraded reads and their own budget ───────────────────────────────────

Deno.test('an unreadable session is reported even when the app thinks it is signed out', () => {
  // This is the difference between "the student signed out" and "this device
  // silently lost a session it still had".
  const h = harness();
  recordAuthEvent('INITIAL_SESSION', false, null);
  recordStorageRead('partial', 3, 1);

  assertEquals(h.names(), [EVENT_READ_DEGRADED]);
  assertEquals(h.events[0].props.outcome, 'partial');
  assertEquals(h.events[0].props.chunks_expected, 3);
  assertEquals(h.events[0].props.chunks_found, 1);
  assertEquals(h.events[0].props.believes_signed_in, false);
});

Deno.test('degraded reads are rate limited — the adapter runs on every request', () => {
  const h = harness();
  for (let i = 0; i < 200; i++) recordStorageRead('partial', 3, 1);
  assertEquals(h.names().length, 1);

  h.advance(5 * 60_000);
  recordStorageRead('partial', 3, 1);
  assertEquals(h.names().length, 2);
});

Deno.test('a swallowed write failure is counted and travels with the diagnosis', () => {
  const h = harness();
  signedInAndHealthy();
  recordStorageWriteFailure();
  recordStorageWriteFailure();
  noteProtectedRequest(true);
  assertEquals(h.events[0].props.storage_write_failures, 2);
});

Deno.test('a clean miss is silent — signing out is not a fault', () => {
  const h = harness();
  for (let i = 0; i < 20; i++) recordStorageRead('miss');
  assertEquals(h.events, []);
});

// ─── Secrets ───────────────────────────────────────────────────────────────

Deno.test('no token, key or header value can reach an emitted event', () => {
  const h = harness();
  // Everything sensitive the module is ever exposed to, pushed through it.
  isAnonAuthorization(`Bearer ${USER_TOKEN}`, ANON_KEY);
  isAnonAuthorization(`Bearer ${ANON_KEY}`, ANON_KEY);
  recordAuthEvent('TOKEN_REFRESHED', true, 1_000_000);
  recordStorageRead('partial', 3, 1);
  recordStorageWriteFailure();
  noteProtectedRequest(true);
  recordRefreshAttempt(400);
  h.advance(30_000);
  noteProtectedRequest(true);
  noteProtectedRequest(false);

  assert(h.events.length > 0, 'expected events to inspect');
  const serialized = JSON.stringify(h.events);
  for (const secret of [USER_TOKEN, ANON_KEY, 'a-real-user-token', 'anon-key-shaped-string', 'eyJhbGciOi']) {
    assert(!serialized.includes(secret), `emitted payload leaked: ${secret}`);
  }

  // Values are scalars only — no nested object can smuggle a session through.
  for (const { props } of h.events) {
    for (const [key, value] of Object.entries(props)) {
      const kind = value === null ? 'null' : typeof value;
      assert(
        ['string', 'number', 'boolean', 'null'].includes(kind),
        `property ${key} is ${kind}, which is not a scalar`,
      );
    }
  }
});

Deno.test('expiry is reported as a derived number, never as a token', () => {
  const h = harness();
  recordStorageRead('hit_chunked', 3, 3);
  // 1_000_000 ms clock => 1000s epoch. Expire 300s from now.
  recordAuthEvent('SIGNED_IN', true, 1300);
  noteProtectedRequest(true);

  const props = h.events[0].props;
  assertEquals(props.token_expiry_known, true);
  assertEquals(props.token_expires_in_s, 300);
  assertEquals(props.token_expired, false); // outside the 90s margin
});

Deno.test('unknown expiry is stated as unknown rather than guessed', () => {
  const h = harness();
  recordStorageRead('hit_chunked', 3, 3);
  recordAuthEvent('INITIAL_SESSION', true, null);
  noteProtectedRequest(true);

  assertEquals(h.events[0].props.token_expiry_known, false);
  assertEquals(h.events[0].props.token_expired, null);
  assertEquals(h.events[0].props.token_expires_in_s, null);
});

Deno.test('a sink that throws cannot break the path it reports on', () => {
  __resetAuthTelemetryForTests(0);
  __setClockForTests(() => 0);
  setAuthTelemetrySink(() => {
    throw new Error('analytics is down');
  });
  recordStorageRead('hit_chunked', 3, 3);
  recordAuthEvent('INITIAL_SESSION', true, 3600);
  noteProtectedRequest(true); // must not throw
  noteProtectedRequest(false);
  recordStorageRead('partial', 3, 1);
});
