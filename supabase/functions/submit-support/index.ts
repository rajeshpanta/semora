import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import nodemailer from 'npm:nodemailer@^9';
import { withRequestLogging, errorFields, type EdgeLogger } from '../_shared/log.ts';

// ============================================================
// submit-support — the website contact form's actual backend
// ============================================================
// semoraai.com/support used to "send" a message by opening a `mailto:` link
// and then telling the visitor it had gone through. On any browser without an
// OS mail handler that silently did nothing, and nothing was captured on our
// side — the only inbound support channel on the site dropped messages.
//
// This function is the replacement. Two steps, in this order, and the order is
// the whole design:
//
//   1. INSERT the request into public.support_requests (service role).
//   2. THEN try to email it out.
//
// Step 1 succeeding is what the visitor is told about. If step 2 fails the row
// is already safe and is marked email_status='failed' — a mail outage becomes
// a visible queue instead of lost messages. It is never the other way around.
//
// AUTH MODEL:
//   Shared secret, exactly like send-push. The only caller is the marketing
//   site's own server route (website/app/api/support/route.ts), which holds
//   SUPPORT_INGEST_SECRET in its Vercel environment. Fail closed: with no
//   secret configured the function refuses every request rather than standing
//   up an open, unauthenticated insert endpoint on a public URL.
//
//   DEPLOY FLAG — REQUIRED:
//     supabase functions deploy submit-support --no-verify-jwt
//   Auth here is the shared secret, not a Supabase-signed JWT, so the default
//   gateway verification would 401 every call before this code runs. Same
//   reasoning (and same trap) as send-push. config.toml is intentionally NOT
//   added — this project is shared with the Citizen app and a repo-level
//   config could change that app's function deploys.
//
// SECRETS (supabase secrets set …):
//   SUPPORT_INGEST_SECRET  required — shared secret the website presents
//   SUPPORT_IP_SALT        required — salt for the stored IP hash
//   SMTP_HOSTNAME          e.g. smtp.gmail.com
//   SMTP_PORT              465 (implicit TLS) or 587 (STARTTLS)
//   SMTP_USERNAME          the sending Gmail address
//   SMTP_PASSWORD          a Google APP PASSWORD, not the account password
//   SMTP_FROM              From: header, normally the same address
//   SUPPORT_NOTIFY_TO      where the notification lands (semora365@gmail.com)
// With the SMTP block unset the function still stores every request and marks
// it email_status='skipped', so a half-configured deployment degrades to
// "check the dashboard" rather than to data loss.
// ============================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPPORT_INGEST_SECRET = Deno.env.get('SUPPORT_INGEST_SECRET') ?? '';
const SUPPORT_IP_SALT = Deno.env.get('SUPPORT_IP_SALT') ?? '';

const SMTP_HOSTNAME = Deno.env.get('SMTP_HOSTNAME') ?? '';
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465');
const SMTP_USERNAME = Deno.env.get('SMTP_USERNAME') ?? '';
const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD') ?? '';
const SMTP_FROM = Deno.env.get('SMTP_FROM') ?? SMTP_USERNAME;
const SUPPORT_NOTIFY_TO = Deno.env.get('SUPPORT_NOTIFY_TO') ?? SMTP_USERNAME;

// Field caps. Kept in lockstep with the CHECK constraints in migration 064 and
// with the maxLength attributes on the form — three layers agreeing beats one
// layer guessing.
const MAX = { name: 120, email: 254, topic: 120, message: 5000 } as const;

// Per-hour ceilings. High enough that nobody legitimately hits them (a real
// person sends one message and waits), low enough that a script cannot fill
// the table overnight.
const RATE_LIMIT_PER_HOUR = 5;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function str(value: unknown, cap: number): string {
  return typeof value === 'string' ? value.trim().slice(0, cap) : '';
}

// Deliberately loose. The strict RFC pattern rejects addresses that real mail
// servers accept, and the cost of a wrong reject here is a student who cannot
// reach support at all — much worse than storing one bad address.
function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= MAX.email;
}

async function hashIp(ip: string): Promise<string | null> {
  if (!ip || !SUPPORT_IP_SALT) return null;
  const bytes = new TextEncoder().encode(`${SUPPORT_IP_SALT}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface StoredRequest {
  id: string;
  name: string;
  email: string;
  topic: string;
  message: string;
  locale: string;
  pagePath: string;
}

function buildEmail(row: StoredRequest) {
  const es = row.locale === 'es';
  const subject = row.topic
    ? `[Semora support] ${row.topic} — ${row.name}`
    : `[Semora support] ${row.name}`;

  const lines = [
    `From:    ${row.name} <${row.email}>`,
    `Topic:   ${row.topic || '(none selected)'}`,
    `Locale:  ${es ? 'Spanish (/es/ayuda)' : 'English (/support)'}`,
    row.pagePath ? `Page:    ${row.pagePath}` : '',
    `Ref:     ${row.id}`,
    '',
    '─────────────────────────────────────────',
    '',
    row.message,
    '',
    '─────────────────────────────────────────',
    '',
    'Reply directly to this email — it goes straight back to the student.',
    es ? 'They wrote in Spanish; answer in Spanish.' : '',
  ].filter(Boolean);

  return { subject, text: lines.join('\n') };
}

// Returns null on success, or the error string to record on the row.
async function sendNotification(row: StoredRequest): Promise<string | null> {
  const transport = nodemailer.createTransport({
    host: SMTP_HOSTNAME,
    port: SMTP_PORT,
    // 465 is implicit TLS; 587 upgrades via STARTTLS, which nodemailer does
    // automatically when `secure` is false.
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USERNAME, pass: SMTP_PASSWORD },
  });

  const { subject, text } = buildEmail(row);

  try {
    await transport.sendMail({
      from: SMTP_FROM,
      to: SUPPORT_NOTIFY_TO,
      // The point of the whole feature: hitting Reply in Gmail answers the
      // student, not ourselves. Without this the notification is a dead end
      // and you would still be copy-pasting addresses by hand.
      replyTo: `${row.name} <${row.email}>`,
      subject,
      text,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    // Best-effort: a failure to tear down the connection must not turn a
    // delivered email into a reported failure.
    try {
      transport.close();
    } catch {
      // ignore
    }
  }
}

serve(withRequestLogging('submit-support', async (req, log) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    // 1. Shared-secret gate (fail closed — see the header note).
    if (!SUPPORT_INGEST_SECRET) {
      log.error('support_ingest_secret_not_configured_refusing_all_re');
      return jsonResponse({ error: 'Server not configured' }, 500);
    }
    const authHeader = req.headers.get('Authorization') ?? '';
    const provided = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : authHeader;
    if (provided !== SUPPORT_INGEST_SECRET) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // 2. Parse + validate.
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    // Honeypot: a field the real form hides from humans. Anything that fills
    // it in is automation, and the useful answer is a plain 200 — a bot that
    // is told it failed simply retries with the field cleared.
    if (str(body.company, 200)) {
      log.info('honeypot_triggered');
      return jsonResponse({ ok: true, discarded: true }, 200);
    }

    const name = str(body.name, MAX.name);
    const email = str(body.email, MAX.email);
    const topic = str(body.topic, MAX.topic);
    const message = str(body.message, MAX.message);
    const locale = body.locale === 'es' ? 'es' : 'en';
    const pagePath = str(body.page, 200);

    if (!name) return jsonResponse({ error: 'A name is required', field: 'name' }, 400);
    if (!looksLikeEmail(email)) {
      return jsonResponse({ error: 'A valid email address is required', field: 'email' }, 400);
    }
    if (!message) return jsonResponse({ error: 'A message is required', field: 'message' }, 400);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 3. Rate limit. Checked on both the source IP and the claimed address,
    //    because either one alone is trivially rotated.
    const forwardedFor = req.headers.get('x-client-ip')
      ?? req.headers.get('x-forwarded-for')
      ?? '';
    const clientIp = forwardedFor.split(',')[0]?.trim() ?? '';
    const ipHash = await hashIp(clientIp);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    for (const filter of [
      ipHash ? { column: 'ip_hash', value: ipHash } : null,
      { column: 'email', value: email.toLowerCase() },
    ]) {
      if (!filter) continue;
      const { count, error } = await admin
        .from('support_requests')
        .select('id', { count: 'exact', head: true })
        .eq(filter.column, filter.value)
        .gte('created_at', since);

      // A failed count must not block a real support request — log it and let
      // the message through. Losing the message is the worse outcome.
      if (error) {
        log.error('rate_limit_check_failed', errorFields(error.message));
        break;
      }
      if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
        // `code` rather than prose: the visitor-facing wording lives in the
        // form, which is the only layer that knows whether they are reading
        // English or Spanish.
        return jsonResponse({ error: 'Rate limited', code: 'rate_limited' }, 429);
      }
    }

    // 4. Store first. This is the step the visitor's confirmation is about.
    const { data: inserted, error: insertError } = await admin
      .from('support_requests')
      .insert({
        name,
        email: email.toLowerCase(),
        topic: topic || null,
        message,
        locale,
        source: 'website',
        page_path: pagePath || null,
        user_agent: (req.headers.get('x-client-user-agent') ?? '').slice(0, 500) || null,
        ip_hash: ipHash,
        email_status: 'pending',
      })
      .select('id')
      .single();

    if (insertError || !inserted) {
      log.error('insert_failed', { message: insertError?.message ?? null });
      return jsonResponse({ error: 'Could not save your message' }, 500);
    }

    const row: StoredRequest = {
      id: inserted.id,
      name,
      email,
      topic,
      message,
      locale,
      pagePath,
    };

    // 5. Then notify. Everything below this line is best-effort: the request
    //    is already safe, so no failure here changes what the visitor is told.
    let emailStatus: 'sent' | 'failed' | 'skipped' = 'skipped';
    let emailError: string | null = null;

    if (SMTP_HOSTNAME && SMTP_USERNAME && SMTP_PASSWORD && SUPPORT_NOTIFY_TO) {
      emailError = await sendNotification(row);
      emailStatus = emailError ? 'failed' : 'sent';
      if (emailError) log.error('email_failed', errorFields(emailError));
    } else {
      log.warn('smtp_not_configured_request_stored_no_email_sent');
    }

    const { error: updateError } = await admin
      .from('support_requests')
      .update({
        email_status: emailStatus,
        email_error: emailError ? emailError.slice(0, 500) : null,
        emailed_at: emailStatus === 'sent' ? new Date().toISOString() : null,
      })
      .eq('id', row.id);

    if (updateError) {
      log.error('status_update_failed', errorFields(updateError.message));
    }

    return jsonResponse({ ok: true, id: row.id, emailStatus }, 200);
  } catch (error) {
    log.error('handler_error', errorFields(error));
    return jsonResponse({ error: 'Something went wrong' }, 500);
  }
}));
