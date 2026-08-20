// ── Server-Sent Events over XMLHttpRequest ──────────────────────────────────
//
// WHY NOT fetch: React Native's fetch has no streaming body. `response.body` is
// undefined there, so the whole answer arrives at once and every "streaming"
// implementation written against the web API silently degrades to a spinner on
// the platform Semora actually ships on.
//
// XHR does deliver incrementally on both React Native and the browser:
// `responseText` grows as bytes arrive and `onprogress` fires as it does. This
// reads from a cursor into that growing string, which is also why it never
// re-parses text it has already handed over.
//
// The same transport handles a NON-streamed reply: if the server answered with
// ordinary JSON (an error, an older deployment, a request that did not ask to
// stream), no `data:` frame is ever parsed, `streamed` comes back false and the
// caller reads `body` exactly as it would have read a fetch response. That
// fallback is the reason streaming can be turned on without a flag day.

export type SseFrame = Record<string, any>;

export type SseResult = {
  ok: boolean;
  status: number;
  /** The complete response text, whether or not it was streamed. */
  body: string;
  /** True when at least one event was delivered incrementally. */
  streamed: boolean;
};

/**
 * Turns a growing response string into complete frames, exactly once each.
 *
 * Separated from the request so the framing can be tested directly: a chunk
 * boundary can land anywhere — mid-JSON, between the two newlines that end a
 * frame — and getting that wrong drops or duplicates part of an answer, which
 * looks like the model misbehaving rather than like a parser bug.
 *
 * Fed the WHOLE responseText each time (that is what XHR exposes) and keeps a
 * cursor, so nothing is re-emitted.
 */
export function createSseParser() {
  let cursor = 0;
  return {
    /** Complete frames that have arrived since the last call. */
    push(responseText: string): SseFrame[] {
      if (responseText.length <= cursor) return [];
      const pending = responseText.slice(cursor).replace(/\r\n/g, '\n');
      const frames: SseFrame[] = [];
      let consumed = 0;
      let rest = pending;
      let split: number;
      // A frame is terminated by a blank line. A partial one at the tail is
      // deliberately left for the next call — parsing it now would hand back
      // half a JSON object.
      while ((split = rest.indexOf('\n\n')) !== -1) {
        const frame = rest.slice(0, split);
        rest = rest.slice(split + 2);
        consumed += split + 2;
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw) continue;
          try {
            frames.push(JSON.parse(raw));
          } catch {
            // A frame we cannot parse is dropped rather than thrown: one bad
            // line must not abandon an answer that is still arriving.
          }
        }
      }
      cursor += consumed;
      return frames;
    },
  };
}

export function streamSse(options: {
  url: string;
  headers: Record<string, string>;
  body: string;
  onFrame: (frame: SseFrame) => void;
  /** Hard deadline for the whole exchange. */
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<SseResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const parser = createSseParser();
    let streamed = false;
    let settled = false;

    const abort = () => xhr.abort();
    const cleanup = () => options.signal?.removeEventListener('abort', abort);

    const drain = () => {
      const text = typeof xhr.responseText === 'string' ? xhr.responseText : '';
      for (const frame of parser.push(text)) {
        streamed = true;
        options.onFrame(frame);
      }
    };

    xhr.open('POST', options.url, true);
    xhr.timeout = options.timeoutMs ?? 120_000;
    for (const [name, value] of Object.entries(options.headers)) {
      xhr.setRequestHeader(name, value);
    }
    // Asking for the stream explicitly. A server that cannot stream ignores it.
    xhr.setRequestHeader('Accept', 'text/event-stream, application/json');

    xhr.onprogress = drain;
    // React Native does not fire onprogress on every platform/version, so
    // readyState 3 is watched as well. drain() is idempotent by cursor, so
    // being called twice for the same bytes costs nothing.
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3) drain();
    };
    xhr.onload = () => {
      if (settled) return;
      settled = true;
      drain();
      cleanup();
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        body: typeof xhr.responseText === 'string' ? xhr.responseText : '',
        streamed,
      });
    };
    xhr.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('Network error. Please check your connection and try again.'));
    };
    xhr.ontimeout = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('That took too long. Please try again.'));
    };
    xhr.onabort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const error = new Error('Cancelled');
      error.name = 'AbortError';
      reject(error);
    };

    if (options.signal?.aborted) {
      cleanup();
      const error = new Error('Cancelled');
      error.name = 'AbortError';
      reject(error);
      return;
    }
    options.signal?.addEventListener('abort', abort, { once: true });
    xhr.send(options.body);
  });
}
