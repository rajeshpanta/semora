import { NextResponse, type NextRequest } from 'next/server';

/**
 * Telemetry sink.
 *
 * Writes one structured JSON line per event to the server log, which is what
 * makes Vercel's log view queryable in aggregate — the same shape the Supabase
 * edge functions emit (`supabase/functions/_shared/log.ts`), so both halves of
 * the stack are read with the same queries:
 *
 *   evt = 'web_error'                    → what is breaking, and where
 *   evt = 'not_found' group by path      → dead inbound links and stale shares
 *   evt = 'signup_click' group by path   → which page actually drives installs
 *
 * Deliberately NOT a database write. A public unauthenticated endpoint that
 * inserts rows is an abuse target that needs rate limiting, a service key and a
 * cleanup job; a log line needs none of that and answers the same questions.
 *
 * Nothing identifying is accepted or recorded. No cookie is read, no IP is
 * logged, and the payload is an allowlisted event name plus bounded primitives.
 */

// Mirrors TELEMETRY_EVENTS in lib/telemetry.ts. Duplicated rather than imported
// because that module is 'use client'; an unknown name is dropped so a stray or
// forged event can never open an unbounded log-write.
const ALLOWED_EVENTS = new Set([
  'web_error',
  'not_found',
  'signup_click',
  'app_store_click',
  'pricing_view',
  'tool_used',
  'language_switch',
  'support_submit',
  'faq_open',
]);

const MAX_BODY_BYTES = 4_000;
const MAX_PROPS = 12;
const MAX_VALUE_CHARS = 200;

/** Always 204: a visitor must never see a telemetry failure, and a caller that
 *  learns nothing from the response is a caller that cannot be used to probe. */
const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(request: NextRequest) {
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return noContent();

    let body: { event?: unknown; props?: unknown };
    try {
      body = JSON.parse(raw);
    } catch {
      return noContent();
    }

    const event = typeof body.event === 'string' ? body.event : '';
    if (!ALLOWED_EVENTS.has(event)) return noContent();

    const props: Record<string, string | number | boolean | null> = {};
    if (body.props && typeof body.props === 'object') {
      for (const [k, v] of Object.entries(body.props as Record<string, unknown>).slice(0, MAX_PROPS)) {
        if (v === null || typeof v === 'number' || typeof v === 'boolean') props[k] = v;
        else if (typeof v === 'string') props[k] = v.slice(0, MAX_VALUE_CHARS);
      }
    }

    // Country comes from Vercel's edge headers rather than from anything the
    // client sends, and it is coarse enough not to identify anyone. Useful for
    // telling a real regional outage from one noisy visitor.
    const country = request.headers.get('x-vercel-ip-country');

    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        lvl: event === 'web_error' ? 'error' : 'info',
        fn: 'website',
        evt: event,
        ...(country ? { country } : {}),
        ...props,
      }),
    );
  } catch {
    // A sink that can fail a request is worse than no sink.
  }
  return noContent();
}
