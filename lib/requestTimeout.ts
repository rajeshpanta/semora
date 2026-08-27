/**
 * A fetch that is guaranteed to settle.
 *
 * React Native's `fetch` has no default timeout. A request that stalls — a
 * network handover, a captive portal, a socket the server dropped without a
 * FIN — never resolves and never rejects, so an `await` on it hangs forever.
 *
 * That is not theoretical for the tutor. `prepareCourseNotes` awaits one
 * `prepare_note` call per uploaded document, inside the same try/finally that
 * owns the "thinking" spinner. A promise that never settles means the `finally`
 * never runs: `tutorWork` stays set, `tutorWorkInFlightRef` stays true, and the
 * guards on every tutor entry point then reject each new attempt as
 * already-in-flight. The screen is dead until the app is force-quit, and the
 * student is shown a spinner rather than an error they could act on.
 *
 * The streaming path never had this problem — lib/sse.ts sets
 * `xhr.timeout = 120_000`. This gives the non-streaming path the same bound, so
 * the two transports cannot disagree about how long is too long.
 */

/** Matches lib/sse.ts, deliberately. Two transports, one patience. */
export const TUTOR_REQUEST_TIMEOUT_MS = 120_000;

export const REQUEST_TIMEOUT_CODE = 'REQUEST_TIMEOUT';
export const NETWORK_FAILED_CODE = 'NETWORK_FAILED';

/** An error the caller can retry, carrying a code the UI can branch on. */
export type RetryableError = Error & {
  code?: string;
  status?: number;
  retryable?: boolean;
};

export function isTimeoutError(err: unknown): boolean {
  return (err as RetryableError)?.code === REQUEST_TIMEOUT_CODE;
}

export function isNetworkError(err: unknown): boolean {
  return (err as RetryableError)?.code === NETWORK_FAILED_CODE;
}

function timeoutError(timeoutMs: number): RetryableError {
  const e = new Error(
    'That took too long to respond. Please check your connection and try again.',
  ) as RetryableError;
  e.code = REQUEST_TIMEOUT_CODE;
  e.retryable = true;
  (e as { timeoutMs?: number }).timeoutMs = timeoutMs;
  return e;
}

function networkError(cause: unknown): RetryableError {
  const detail = (cause as { message?: unknown })?.message;
  const e = new Error(
    typeof detail === 'string' && detail.trim()
      ? detail
      : 'Network request failed. Please try again.',
  ) as RetryableError;
  e.code = NETWORK_FAILED_CODE;
  e.retryable = true;
  return e;
}

export interface FetchWithTimeoutDeps {
  /** Injected so the behaviour can be tested without a network. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * `fetch`, bounded.
 *
 * Aborts the in-flight request at the deadline rather than merely giving up on
 * it, so a stalled socket is released instead of being left to the platform.
 *
 * The `timedOut` flag matters: once aborted, the underlying fetch rejects with
 * a generic AbortError that says nothing about why. Distinguishing our own
 * abort from a genuine network failure is what lets the caller show "that took
 * too long" instead of a misleading connection error — and what lets the
 * telemetry tell a hang apart from a drop.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  deps: FetchWithTimeoutDeps = {},
): Promise<Response> {
  const { fetchImpl = fetch, timeoutMs = TUTOR_REQUEST_TIMEOUT_MS } = deps;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (err) {
    // Order matters: our own abort must be reported as a timeout, never as a
    // network fault, or the student is told to check a connection that is fine.
    if (timedOut) throw timeoutError(timeoutMs);
    throw networkError(err);
  } finally {
    // Always — a settled request must not leave a timer holding the event loop
    // open, and a second call must not inherit the first one's deadline.
    clearTimeout(timer);
  }
}
