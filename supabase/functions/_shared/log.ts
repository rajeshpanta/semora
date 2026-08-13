/**
 * Structured logging for Edge Functions.
 *
 * Supabase's log explorer can only aggregate what has structure. Today every
 * function writes free text — `console.warn('[parse-syllabus] Rejected
 * non-syllabus (is_syllabus=false, empty=true)')` — which is readable one line
 * at a time and useless in aggregate: there is no way to ask "how many scans
 * failed this week, and why" without regex over a log stream.
 *
 * Every line here is a single JSON object on one line, which is what the
 * `Explore via query` view can filter and count. The field names are short and
 * fixed so a query written once keeps working:
 *
 *   t    ISO timestamp          fn   function name
 *   lvl  info | warn | error    rid  request id (correlates lines in one call)
 *   evt  event name             ms   elapsed ms since the request started
 *   uid  user id, once known    ...  event-specific fields
 *
 * Example queries this makes possible:
 *   evt = 'request_done' and outcome != 'ok'      → every failing request
 *   evt = 'document_rejected' group by reason      → why scans get rejected
 *   fn = 'tutor-chat' and lvl = 'error'            → one function's errors
 *
 * NOTHING user-content-bearing goes in a log line. `redact()` below drops the
 * keys that carry secrets or document text outright, because the failure mode
 * is somebody adding a debug line during an incident and permanently writing a
 * student's syllabus into the log stream.
 */

/** Keys never written to logs, matched case-insensitively as substrings. */
const FORBIDDEN_KEY_PATTERNS = [
  'base64',
  'authorization',
  'apikey',
  'api_key',
  'token',
  'secret',
  'password',
  'cookie',
  'email',
  'text',
  'content',
  'prompt',
  'answer',
  'body',
];

/** Long strings are truncated rather than dropped — the shape is often the clue. */
const MAX_STRING = 200;

function isForbidden(key: string): boolean {
  const k = key.toLowerCase();
  return FORBIDDEN_KEY_PATTERNS.some((p) => k.includes(p));
}

/**
 * Strip secrets and clamp size. Returns a plain object safe to serialize.
 * Depth-limited because a deeply nested payload in a log line is never the
 * useful part, and unbounded recursion on a cyclic object would take the
 * function down — logging must not be able to break the request.
 */
export function redact(fields: Record<string, unknown>, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (isForbidden(key)) {
      out[key] = '[redacted]';
      continue;
    }
    if (value === null || value === undefined) {
      out[key] = value ?? null;
    } else if (typeof value === 'string') {
      out[key] = value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…(${value.length})` : value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else if (Array.isArray(value)) {
      out[key] = value.length;
    } else if (depth < 2) {
      out[key] = redact(value as Record<string, unknown>, depth + 1);
    } else {
      out[key] = '[object]';
    }
  }
  return out;
}

export type RequestOutcome = 'ok' | 'client_error' | 'server_error';

export interface EdgeLogger {
  /** Correlates every line emitted for one request. */
  readonly requestId: string;
  /** Attach the user id once auth has resolved; included on all later lines. */
  setUser(userId: string | null): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  /**
   * Terminal line for the request. Exactly one per invocation — it is what
   * makes request counts, error rates and latency percentiles queryable.
   */
  done(outcome: RequestOutcome, status: number, fields?: Record<string, unknown>): void;
  /** Milliseconds since the logger was created. */
  elapsedMs(): number;
}

/**
 * Create a request-scoped logger.
 *
 * Pass the Request so an inbound `x-request-id` is reused — that is what lets a
 * client-reported failure be found in the logs without guessing from
 * timestamps. Falls back to a generated id.
 */
export function createLogger(fn: string, req?: Request): EdgeLogger {
  const started = Date.now();
  const inbound = req?.headers.get('x-request-id') ?? req?.headers.get('x-client-request-id');
  const requestId = (inbound && inbound.length <= 64 ? inbound : crypto.randomUUID()).replace(
    /[^\w.:-]/g,
    '',
  );
  let uid: string | null = null;

  const emit = (lvl: 'info' | 'warn' | 'error', evt: string, fields?: Record<string, unknown>) => {
    // Logging must never be able to fail a request, so the whole emit path is
    // wrapped: a non-serializable field degrades to a marker line instead of
    // throwing inside a handler.
    try {
      const line = JSON.stringify({
        t: new Date().toISOString(),
        lvl,
        fn,
        rid: requestId,
        evt,
        ms: Date.now() - started,
        ...(uid ? { uid } : {}),
        ...(fields ? redact(fields) : {}),
      });
      if (lvl === 'error') console.error(line);
      else if (lvl === 'warn') console.warn(line);
      else console.log(line);
    } catch {
      console.error(`{"lvl":"error","fn":"${fn}","evt":"log_serialize_failed","rid":"${requestId}"}`);
    }
  };

  return {
    requestId,
    setUser(userId) {
      uid = userId;
    },
    info: (evt, fields) => emit('info', evt, fields),
    warn: (evt, fields) => emit('warn', evt, fields),
    error: (evt, fields) => emit('error', evt, fields),
    done: (outcome, status, fields) =>
      emit(outcome === 'ok' ? 'info' : outcome === 'client_error' ? 'warn' : 'error', 'request_done', {
        outcome,
        status,
        ...(fields ?? {}),
      }),
    elapsedMs: () => Date.now() - started,
  };
}

/**
 * Wrap a handler so every invocation emits exactly one `request_done` line.
 *
 * Logging at each `return` does not survive contact with these functions —
 * several have a dozen exit points and any branch added later silently skips
 * the terminal line, which quietly biases every error rate computed from it.
 * Wrapping makes the count structural instead of a convention.
 *
 * Also the last line of defence: a handler that throws still produces a logged
 * 500 rather than an opaque platform-level failure with nothing in the stream.
 *
 * CORS preflights are answered without logging. They are a third of the traffic
 * on a browser-facing function and carry no signal.
 */
export function withRequestLogging(
  fn: string,
  handler: (req: Request, log: EdgeLogger) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const log = createLogger(fn, req);
    let response: Response;
    try {
      response = await handler(req, log);
    } catch (err) {
      log.error('unhandled_error', errorFields(err));
      response = new Response(
        JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (req.method !== 'OPTIONS') {
      log.done(
        response.status < 400 ? 'ok' : response.status < 500 ? 'client_error' : 'server_error',
        response.status,
        { method: req.method },
      );
    }
    return response;
  };
}

/**
 * Normalize a thrown value into loggable fields.
 *
 * Errors reach catch blocks as `unknown`, and `String(err)` on a non-Error
 * yields "[object Object]" — which is precisely the log line that makes an
 * incident unreadable. The stack is capped: a full Deno stack is mostly module
 * URLs and pushes the useful frames off the top of the log view.
 */
export function errorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      err_name: err.name,
      err_message: err.message.slice(0, MAX_STRING),
      err_stack: err.stack?.split('\n').slice(0, 4).join(' | ').slice(0, 500) ?? null,
    };
  }
  return { err_name: typeof err, err_message: String(err).slice(0, MAX_STRING) };
}
