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
/**
 * Write a failed request to `edge_request_log` (migration 086).
 *
 * A bare fetch against PostgREST rather than the Supabase client: this file is
 * imported by every function, and pulling the client in here would put its
 * cold-start cost on all of them for a table written only when something has
 * already gone wrong.
 *
 * Every failure path is swallowed. A logger that can throw is worse than no
 * logger, and this runs after the response has already been decided.
 */
function persistFailure(row: Record<string, unknown>): void {
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) return;
    void fetch(`${url}/rest/v1/edge_request_log`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    }).catch(() => {});
  } catch {
    // Never let telemetry surface as an error.
  }
}

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
    done: (outcome, status, fields) => {
      emit(outcome === 'ok' ? 'info' : outcome === 'client_error' ? 'warn' : 'error', 'request_done', {
        outcome,
        status,
        ...(fields ?? {}),
      });
      // Failures also go somewhere that outlives the ~24h log retention.
      // Fire-and-forget and never awaited: persisting a log line must not add
      // latency to the response, and must never be able to fail a request that
      // already succeeded at its actual job.
      if (outcome !== 'ok') {
        persistFailure({
          fn,
          request_id: requestId,
          outcome,
          status,
          method: typeof fields?.method === 'string' ? fields.method : null,
          duration_ms: Date.now() - started,
          user_id: uid ?? null,
        });
      }
    },
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

  // PostgREST errors are PLAIN OBJECTS, not Errors.
  //
  // supabase-js resolves rather than throws: `{ data, error }`, where error is
  // `{ message, details, hint, code }` with no prototype chain to Error. Every
  // such error therefore fell to String(err) below and logged the literal text
  // "[object Object]" — the code and the message, the only two things that
  // identify a database failure, discarded at the point of writing them down.
  //
  // This is not hypothetical. tutor-chat's persist_messages_failed logged
  // "[object Object]" for a PGRST102 that had gone unnoticed for months, and
  // the shape of the bug was only recoverable by reproducing it by hand.
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const str = (v: unknown) =>
      typeof v === 'string' ? v.slice(0, MAX_STRING) : v == null ? null : String(v).slice(0, MAX_STRING);

    // `code` is what makes a Postgres or PostgREST failure searchable —
    // PGRST102, 23505, 42501 — so it is promoted to its own field.
    const code = str(e.code);
    const message = str(e.message ?? e.msg ?? e.error_description ?? e.error);
    if (code || message) {
      const fields: Record<string, unknown> = {
        err_name: str(e.name) ?? (code ? `postgrest_${code}` : 'object'),
        err_message: message ?? '(no message)',
      };
      if (code) fields.err_code = code;
      if (e.details != null) fields.err_details = str(e.details);
      if (e.hint != null) fields.err_hint = str(e.hint);
      if (typeof e.status === 'number') fields.err_status = e.status;
      return fields;
    }

    // Anything else object-shaped: serialise it rather than stamping
    // "[object Object]" on it. A truncated JSON blob is still evidence.
    try {
      return { err_name: 'object', err_message: JSON.stringify(err).slice(0, MAX_STRING) };
    } catch {
      // Circular or otherwise unserialisable — fall through to the default.
    }
  }

  return { err_name: typeof err, err_message: String(err).slice(0, MAX_STRING) };
}
