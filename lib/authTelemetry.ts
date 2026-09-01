/**
 * Why a protected Supabase request went out with no user identity.
 *
 * THE STATE THIS EXISTS TO EXPLAIN: supabase-js resolves the bearer token per
 * request, and when it cannot produce a session it falls back to the anon key
 * rather than failing — `data.session?.access_token ?? this.supabaseKey`
 * (SupabaseClient._getAccessToken). RLS then answers honestly for "nobody":
 * every list returns `200 []` and every `.single()` returns 406. Nothing throws,
 * no SIGNED_OUT fires, and React keeps rendering the signed-in app over an
 * empty database view. On 2026-08-31 one device did that for three and a half
 * minutes; the logs proved WHAT happened and could not say WHY.
 *
 * The three candidate causes are indistinguishable from the server side, and
 * exactly one field separates them — whether a `/auth/v1/token` request was
 * even attempted while the identity was missing:
 *
 *   storage unreadable   __loadSession returns at its `if (!currentSession)`
 *                        branch and makes NO network call. Zero refresh
 *                        attempts during the window.
 *   token expired,       __loadSession reaches _callRefreshToken. Refresh
 *   refresh failing      attempts are present and non-200 (or never arrive at
 *                        the edge, which the attempt counter still records).
 *   lifecycle race       Identity is missing only in the first moments after
 *                        launch or foreground, and recovers on its own.
 *
 * WHAT THIS MODULE IS NOT: it does not change auth behaviour. Nothing here
 * retries, refreshes, gates, signs out, or repairs anything — every function
 * records what already happened and returns. The one deliberate exception to
 * "observe only" is that a degraded SecureStore read, which the storage adapter
 * swallows into a bare `null`, is counted here before it is swallowed.
 *
 * VOLUME: the storage adapter is read on EVERY request, so recording is
 * memory-only and O(1) — no I/O on that path. Events are emitted only on
 * abnormal transitions, are capped per window and per app session, and a
 * healthy launch emits nothing at all.
 *
 * SECRETS: no token, refresh token, key, header value, email, or row content
 * is stored or emitted. The anon-key comparison in `isAnonAuthorization` reads
 * a header and returns a boolean; the string is never retained. Expiry is taken
 * from `session.expires_at`, an integer Supabase hands us, so no JWT is ever
 * decoded here.
 *
 * No imports on purpose: this module is exercised by lib/authTelemetry.test.ts
 * under Deno, which has no React Native runtime. Platform facts arrive through
 * the sink installed in app/_layout.tsx.
 */

export type StorageReadOutcome =
  /** Small session under one key — the pre-chunking layout, still supported. */
  | 'hit_single'
  /** Manifest plus every chunk present and reassembled. */
  | 'hit_chunked'
  /** Nothing stored. The ordinary signed-out answer, not a fault. */
  | 'miss'
  /** Manifest promised N chunks and at least one was gone. THE smoking gun. */
  | 'partial'
  /** Base key held a manifest whose count would not parse. */
  | 'bad_manifest'
  /** SecureStore threw — device locked, keychain contention, anything. */
  | 'error';

/** Which side of a launch/foreground boundary a request sits on. */
export type AuthPhase = 'launch' | 'resume';

export type RequestKind = 'protected' | 'telemetry' | 'auth_token' | 'other';

export type DiagnosticProps = Record<string, string | number | boolean | null>;
export type AuthTelemetrySink = (event: string, props: DiagnosticProps) => void;

export const EVENT_READ_DEGRADED = 'auth_session_read_degraded';
export const EVENT_IDENTITY_UNAVAILABLE = 'auth_identity_unavailable';
export const EVENT_IDENTITY_RECOVERED = 'auth_identity_recovered';

/** A window this long has stopped being a race and become a fault. */
const REEMIT_AT_MS = [30_000, 120_000];
/** First emit, plus the two re-emits above. Nothing beyond that adds evidence. */
const MAX_EMITS_PER_WINDOW = 1 + REEMIT_AT_MS.length;
/** A pathological loop must not be able to bill the analytics table. */
const MAX_WINDOWS_PER_SESSION = 10;
/** Degraded reads repeat per request; one per outcome per this interval is plenty. */
const DEGRADED_COOLDOWN_MS = 5 * 60_000;
const MAX_DEGRADED_PER_SESSION = 10;

type StorageRead = {
  outcome: StorageReadOutcome;
  at: number;
  expected: number | null;
  found: number | null;
};

type UnauthWindow = {
  startedAt: number;
  anonRequests: number;
  emits: number;
  refreshAttempts: number;
  lastRefreshStatus: number | null;
  /** Storage outcome as it stood when the window opened, before later reads move it. */
  openingStorage: StorageRead | null;
};

type State = {
  /** What the rendered app believes — mirrors the session AuthGate is drawing. */
  believesSignedIn: boolean;
  lastAuthEvent: string | null;
  lastAuthEventAt: number | null;
  /** session.expires_at, in SECONDS since epoch, exactly as Supabase reports it. */
  lastKnownExpiresAt: number | null;
  lastStorageRead: StorageRead | null;
  storageWriteFailures: number;
  phase: AuthPhase;
  phaseAt: number;
  window: UnauthWindow | null;
  windowsThisSession: number;
  degradedEmits: number;
  lastDegradedAt: Partial<Record<StorageReadOutcome, number>>;
};

function freshState(): State {
  return {
    believesSignedIn: false,
    lastAuthEvent: null,
    lastAuthEventAt: null,
    lastKnownExpiresAt: null,
    lastStorageRead: null,
    storageWriteFailures: 0,
    phase: 'launch',
    phaseAt: 0,
    window: null,
    windowsThisSession: 0,
    degradedEmits: 0,
    lastDegradedAt: {},
  };
}

let state: State = freshState();
let sink: AuthTelemetrySink | null = null;
let clock: () => number = () => Date.now();

/**
 * Install the emitter. Deliberately injected rather than imported: lib/analytics
 * imports lib/supabase, lib/supabase imports this module, and importing analytics
 * back from here would close that cycle. app/_layout.tsx owns the wiring.
 */
export function setAuthTelemetrySink(next: AuthTelemetrySink | null): void {
  sink = next;
}

function emit(event: string, props: DiagnosticProps): void {
  if (!sink) return;
  try {
    sink(event, props);
  } catch {
    // A diagnostic that can break the path it reports on is worse than none.
  }
}

/** Round to whole seconds and clamp, so a nonsense clock cannot widen a column. */
function seconds(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  return Math.max(-86_400, Math.min(86_400, Math.round(ms / 1000)));
}

// ─── Pure classifiers (the parts worth testing on their own) ────────────────

/**
 * Which bucket a Supabase URL falls into.
 *
 * `telemetry` is separated FIRST and on purpose: analytics_events inserts are
 * themselves protected requests made through the same client, so counting them
 * would let one anon window emit an event that triggers the next emit forever.
 */
export function classifyRequest(url: string): RequestKind {
  if (typeof url !== 'string' || !url) return 'other';
  if (url.includes('/rest/v1/analytics_events')) return 'telemetry';
  if (url.includes('/auth/v1/token')) return 'auth_token';
  if (
    url.includes('/rest/v1/') ||
    url.includes('/storage/v1/') ||
    url.includes('/functions/v1/')
  ) {
    return 'protected';
  }
  return 'other';
}

/**
 * Is this request going out as nobody?
 *
 * Compares the header against the anon key and returns a boolean. The header
 * value is not retained, logged, or emitted — the comparison is the only thing
 * that ever happens to it.
 */
export function isAnonAuthorization(header: string | null | undefined, anonKey: string): boolean {
  if (!header || !anonKey) return false;
  return header === `Bearer ${anonKey}` || header === anonKey;
}

/** Whether an outcome means "a session was stored but could not be read back". */
export function isDegradedRead(outcome: StorageReadOutcome): boolean {
  return outcome === 'partial' || outcome === 'bad_manifest' || outcome === 'error';
}

// ─── Recorders (memory only, safe on the per-request path) ──────────────────

export function recordStorageRead(
  outcome: StorageReadOutcome,
  expected: number | null = null,
  found: number | null = null,
): void {
  const at = clock();
  state.lastStorageRead = { outcome, at, expected, found };
  if (!isDegradedRead(outcome)) return;

  // A degraded read is worth saying out loud even when the app has already
  // concluded it is signed out: it is the difference between "the student
  // signed out" and "this device silently lost a session it still had".
  const last = state.lastDegradedAt[outcome] ?? 0;
  if (at - last < DEGRADED_COOLDOWN_MS) return;
  if (state.degradedEmits >= MAX_DEGRADED_PER_SESSION) return;
  state.lastDegradedAt[outcome] = at;
  state.degradedEmits += 1;

  emit(EVENT_READ_DEGRADED, {
    screen: 'auth',
    outcome,
    chunks_expected: expected,
    chunks_found: found,
    phase: state.phase,
    ms_since_phase: at - state.phaseAt,
    believes_signed_in: state.believesSignedIn,
    write_failures: state.storageWriteFailures,
    last_auth_event: state.lastAuthEvent,
  });
}

/**
 * The storage adapter's write path swallows every error. Count them: a write
 * that failed between clearing the old chunks and committing the new manifest
 * is precisely how a session becomes present-but-unreadable.
 */
export function recordStorageWriteFailure(): void {
  state.storageWriteFailures += 1;
}

export function recordAuthEvent(
  event: string,
  hasSession: boolean,
  expiresAt: number | null = null,
): void {
  state.lastAuthEvent = event;
  state.lastAuthEventAt = clock();
  state.believesSignedIn = hasSession;
  if (hasSession && typeof expiresAt === 'number' && Number.isFinite(expiresAt)) {
    state.lastKnownExpiresAt = expiresAt;
  }
  if (!hasSession) state.lastKnownExpiresAt = null;
}

/** Launch vs foreground. Resets the clock the `ms_since_phase` field reads. */
export function recordPhase(phase: AuthPhase): void {
  state.phase = phase;
  state.phaseAt = clock();
}

/**
 * A `/auth/v1/token` request was issued. Counted per window because its
 * PRESENCE is what separates "expired token, refresh failing" from "storage
 * returned nothing" — the latter never reaches the network at all.
 */
export function recordRefreshAttempt(status: number | null): void {
  if (!state.window) return;
  state.window.refreshAttempts += 1;
  state.window.lastRefreshStatus = status;
}

// ─── The window state machine ──────────────────────────────────────────────

function tokenFields(now: number): DiagnosticProps {
  const expiresAt = state.lastKnownExpiresAt;
  if (expiresAt === null) {
    return { token_expiry_known: false, token_expired: null, token_expires_in_s: null };
  }
  const expiresInS = seconds(expiresAt * 1000 - now);
  return {
    token_expiry_known: true,
    // supabase-js treats a session as expired 90s early (EXPIRY_MARGIN_MS).
    token_expired: expiresInS <= 90,
    token_expires_in_s: expiresInS,
  };
}

function windowProps(now: number): DiagnosticProps {
  const w = state.window;
  const read = w?.openingStorage ?? state.lastStorageRead;
  return {
    screen: 'auth',
    phase: state.phase,
    ms_since_phase: now - state.phaseAt,
    believes_signed_in: state.believesSignedIn,
    storage_outcome: read?.outcome ?? null,
    storage_chunks_expected: read?.expected ?? null,
    storage_chunks_found: read?.found ?? null,
    ms_since_storage_read: read ? now - read.at : null,
    storage_write_failures: state.storageWriteFailures,
    refresh_attempts: w?.refreshAttempts ?? 0,
    refresh_last_status: w?.lastRefreshStatus ?? null,
    last_auth_event: state.lastAuthEvent,
    ms_since_auth_event: state.lastAuthEventAt === null ? null : now - state.lastAuthEventAt,
    ...tokenFields(now),
  };
}

/**
 * Called for every protected request, with whether it went out as the anon key.
 *
 * Opens a window on the first anonymous request made while the app believes it
 * is signed in, re-states it if it persists, and closes it — with a duration —
 * on the first request that carries a real identity again.
 */
export function noteProtectedRequest(usedAnonKey: boolean): void {
  const now = clock();

  if (usedAnonKey) {
    // A signed-out app making anonymous requests is not a fault, it is Tuesday.
    if (!state.believesSignedIn) return;

    if (!state.window) {
      if (state.windowsThisSession >= MAX_WINDOWS_PER_SESSION) return;
      state.windowsThisSession += 1;
      state.window = {
        startedAt: now,
        anonRequests: 1,
        emits: 1,
        refreshAttempts: 0,
        lastRefreshStatus: null,
        // Frozen now: later reads during the window would overwrite the read
        // that actually explains why the window opened.
        openingStorage: state.lastStorageRead,
      };
      emit(EVENT_IDENTITY_UNAVAILABLE, {
        ...windowProps(now),
        unauth_ms: 0,
        anon_requests: 1,
        emit_seq: 1,
      });
      return;
    }

    const w = state.window;
    w.anonRequests += 1;
    const elapsed = now - w.startedAt;
    const due = REEMIT_AT_MS[w.emits - 1];
    if (w.emits < MAX_EMITS_PER_WINDOW && due !== undefined && elapsed >= due) {
      w.emits += 1;
      emit(EVENT_IDENTITY_UNAVAILABLE, {
        ...windowProps(now),
        unauth_ms: elapsed,
        anon_requests: w.anonRequests,
        emit_seq: w.emits,
      });
    }
    return;
  }

  // Identity is back. Close the window and report how long it lasted.
  const w = state.window;
  if (!w) return;
  state.window = null;
  emit(EVENT_IDENTITY_RECOVERED, {
    ...windowProps(now),
    unauth_ms: now - w.startedAt,
    anon_requests: w.anonRequests,
    emit_seq: w.emits,
  });
}

// ─── Test seams ────────────────────────────────────────────────────────────

export function __resetAuthTelemetryForTests(now = 0): void {
  state = freshState();
  state.phaseAt = now;
  sink = null;
  clock = () => now;
}

export function __setClockForTests(fn: () => number): void {
  clock = fn;
}

export function __authTelemetryStateForTests(): Readonly<State> {
  return state;
}
