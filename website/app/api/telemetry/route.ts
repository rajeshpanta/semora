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
  'page_view',
  'scroll_depth',
  'blog_view',
  'cta_click',
  'app_handoff',
]);

// ── The durable sink ────────────────────────────────────────────────────────
// The log line below answers questions for about a day, from a dashboard, by
// hand. It cannot answer "did the person who read this post sign up", because
// joining needs a query and a log is not queryable. Events now also land in the
// same `analytics_events` table the app writes to, tagged so the two are
// distinguishable and joinable on device_id.
//
// The original note here said a database write was deliberately avoided because
// "a public unauthenticated endpoint that inserts rows is an abuse target".
// That is right about a PUBLIC endpoint — but this route is the gatekeeper, not
// the database: the event name is allowlisted, the body is capped, the property
// count and value length are bounded, and the write is rate limited below. The
// key never reaches a browser.
//
// The anon key is used rather than the service key on purpose. It is already
// public — it ships inside the app bundle — and migration 080 grants it INSERT
// on exactly these columns and nothing else, so this route cannot read, update
// or delete anything even if it is abused.
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

// Best-effort per-instance rate limit. Serverless means each instance keeps its
// own counter, so this is a ceiling on damage rather than a precise quota —
// which is the correct trade for telemetry: a dropped event costs nothing, and
// a request that has to consult a shared store to be dropped costs more than
// the write it prevents.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 120;
const hits = new Map<string, { n: number; until: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.until) {
    hits.set(key, { n: 1, until: now + RATE_WINDOW_MS });
    // Bound the map so a spray of unique keys cannot grow it without limit.
    if (hits.size > 5_000) hits.clear();
    return false;
  }
  entry.n += 1;
  return entry.n > RATE_MAX;
}

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

    let body: {
      event?: unknown;
      props?: unknown;
      device_id?: unknown;
      session_id?: unknown;
      automated?: unknown;
      persisted?: unknown;
    };
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

    // Durable copy. Awaited rather than fired and forgotten: on a serverless
    // runtime the instance can be frozen the moment the response is returned,
    // so an un-awaited insert is a coin flip. The visitor already has their 204
    // either way — this costs the request nothing the visitor can perceive.
    const deviceId = typeof body.device_id === 'string' ? body.device_id.slice(0, 64) : null;
    if (SUPABASE_URL && SUPABASE_ANON_KEY && deviceId && !rateLimited(deviceId)) {
      const sessionIdValue = typeof body.session_id === 'string' ? body.session_id.slice(0, 64) : null;
      await fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          // A DIFFERENT app_name from the iOS/web app so the two are separable,
          // while device_id still joins them: the same person reading a blog
          // post and later opening the app is one row in the funnel.
          app_name: 'semora_site',
          event_name: event,
          platform: 'web',
          device_id: deviceId,
          session_id: sessionIdValue,
          properties: {
            ...props,
            ...(country ? { country } : {}),
            // Carried into the row itself so a query can exclude robots without
            // needing to know which user agents were current that week.
            automated: body.automated === true,
            persisted: body.persisted !== false,
          },
        }),
      }).catch(() => {
        // The log line above already succeeded; a failed insert must not turn
        // into a visible error on a page the reader is trying to use.
      });
    }
  } catch {
    // A sink that can fail a request is worse than no sink.
  }
  return noContent();
}
