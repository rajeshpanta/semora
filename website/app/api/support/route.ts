import { NextResponse, type NextRequest } from 'next/server';

/**
 * Server side of the support form.
 *
 * The form used to build a `mailto:` link and claim the message had been sent.
 * On a browser with no OS mail handler that did nothing at all, and nothing
 * was captured on our side — so the site's only inbound channel dropped
 * messages while telling people they had gone through. Now the form POSTs
 * here, this forwards to the `submit-support` Supabase edge function, and that
 * function stores the request before it tries to email it.
 *
 * WHY A PROXY rather than calling the edge function from the browser:
 *   1. The shared secret stays server-side. The edge function is deliberately
 *      not open to the public internet (see its header), and it cannot be
 *      gated by a secret the browser is holding.
 *   2. The real client IP is only available here — Vercel sets
 *      x-forwarded-for on the incoming request, and a fetch made from this
 *      route would otherwise present the platform's own address, collapsing
 *      every visitor into one rate-limit bucket.
 *
 * ENVIRONMENT (Vercel project `semora-website`):
 *   SUPABASE_URL           https://<project-ref>.supabase.co
 *   SUPPORT_INGEST_SECRET  must match the Supabase secret of the same name
 * Neither is NEXT_PUBLIC — nothing here is exposed to the client bundle.
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPPORT_INGEST_SECRET = process.env.SUPPORT_INGEST_SECRET ?? '';

// The edge function stores, then sends over SMTP, which can take a few seconds
// on a cold connection. Well under Vercel's function limit, but bounded so a
// hung SMTP handshake surfaces as an error the visitor can act on rather than
// as a spinner that never resolves.
const UPSTREAM_TIMEOUT_MS = 20_000;

const MAX = { name: 120, email: 254, topic: 120, message: 5000 } as const;

function field(value: unknown, cap: number): string {
  return typeof value === 'string' ? value.trim().slice(0, cap) : '';
}

export async function POST(request: NextRequest) {
  if (!SUPABASE_URL || !SUPPORT_INGEST_SECRET) {
    console.error('[support] SUPABASE_URL or SUPPORT_INGEST_SECRET missing');
    return NextResponse.json({ error: 'Support form is not configured' }, { status: 500 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const payload = {
    name: field(body.name, MAX.name),
    email: field(body.email, MAX.email),
    topic: field(body.topic, MAX.topic),
    message: field(body.message, MAX.message),
    locale: body.locale === 'es' ? 'es' : 'en',
    page: field(body.page, 200),
    // Honeypot, passed straight through — the edge function decides what to do
    // with it so the rule lives in one place.
    company: field(body.company, 200),
  };

  // Cheap local checks so an obviously incomplete form never costs a round
  // trip. The edge function validates again; this is not the security boundary.
  // Responses carry a `code`, not prose. The form renders the wording, because
  // it is the only layer that knows whether the visitor is reading English or
  // Spanish; `error` is here for logs and for anything calling this directly.
  if (!payload.name || !payload.message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return NextResponse.json(
      { error: 'Missing or invalid fields', code: 'invalid' },
      { status: 400 },
    );
  }

  const clientIp = (request.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() ?? '';

  try {
    const upstream = await fetch(`${SUPABASE_URL}/functions/v1/submit-support`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPPORT_INGEST_SECRET}`,
        'x-client-ip': clientIp,
        'x-client-user-agent': request.headers.get('user-agent') ?? '',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    if (!upstream.ok) {
      const result = (await upstream.json().catch(() => ({}))) as { code?: string };
      console.error('[support] upstream rejected:', upstream.status, result.code ?? '');
      return NextResponse.json(
        { error: 'Upstream rejected the request', code: result.code ?? 'unavailable' },
        { status: upstream.status },
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('[support] upstream call failed:', error);
    return NextResponse.json(
      { error: 'Upstream unreachable', code: 'unavailable' },
      { status: 502 },
    );
  }
}
