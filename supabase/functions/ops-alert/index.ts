import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import nodemailer from 'npm:nodemailer@^9';
import { withRequestLogging, errorFields } from '../_shared/log.ts';

// Operational alerts, by email.
//
// The push channel (send-push) already exists and is instant, but it depends
// on one registered device staying signed in. If that token goes away the
// alert goes nowhere — silently, which is the exact failure this whole alert
// was built to end. Email is the durable second channel: it does not depend
// on an app being installed, and it is the same inbox support already
// reaches, so there is no new place to remember to check.
//
// Deliberately NOT routed through submit-support. That function is the public
// web form: it rate-limits by IP hash, and it stamps every row source:
// 'website', which would file operational alerts as if a student had written
// in. Same SMTP credentials, different job.

const ALERT_SECRET = Deno.env.get('PUSH_SEND_SECRET') ?? '';
const SMTP_HOSTNAME = Deno.env.get('SMTP_HOSTNAME') ?? '';
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465');
const SMTP_USERNAME = Deno.env.get('SMTP_USERNAME') ?? '';
const SMTP_PASSWORD = Deno.env.get('SMTP_PASSWORD') ?? '';
const SMTP_FROM = Deno.env.get('SMTP_FROM') ?? SMTP_USERNAME;
const NOTIFY_TO = Deno.env.get('SUPPORT_NOTIFY_TO') ?? SMTP_USERNAME;

const MAX_SUBJECT = 200;
const MAX_BODY = 5000;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

serve(withRequestLogging('ops-alert', async (req, log) => {
  // Server-to-server only. No CORS: a browser has no business here.
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  // Fail closed. An unauthenticated caller must never be able to make this
  // account send mail.
  if (!ALERT_SECRET) {
    log.error('alert_secret_not_configured_refusing_all', {});
    return jsonResponse({ error: 'Server not configured' }, 500);
  }
  const authHeader = req.headers.get('Authorization') ?? '';
  const provided = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : authHeader;
  if (provided !== ALERT_SECRET) return jsonResponse({ error: 'Unauthorized' }, 401);

  // SMTP missing is a degraded deployment, not a caller error. Say so plainly
  // so the ledger records 'skipped' rather than pretending mail was sent.
  if (!SMTP_HOSTNAME || !SMTP_USERNAME || !SMTP_PASSWORD) {
    log.warn('smtp_not_configured_alert_not_emailed', {});
    return jsonResponse({ sent: false, reason: 'smtp_not_configured' }, 200);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Invalid request body' }, 400);
  }

  const subject = typeof body.subject === 'string'
    ? body.subject.trim().slice(0, MAX_SUBJECT) : '';
  const text = typeof body.body === 'string'
    ? body.body.trim().slice(0, MAX_BODY) : '';
  if (!subject || !text) {
    return jsonResponse({ error: 'subject and body are required' }, 400);
  }

  const transport = nodemailer.createTransport({
    host: SMTP_HOSTNAME,
    port: SMTP_PORT,
    // 465 is implicit TLS; 587 upgrades via STARTTLS, which nodemailer does
    // automatically when `secure` is false.
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USERNAME, pass: SMTP_PASSWORD },
  });

  try {
    await transport.sendMail({
      from: SMTP_FROM,
      to: NOTIFY_TO,
      subject: `[Semora ops] ${subject}`,
      text,
    });
    log.info('ops_alert_emailed', { subject });
    return jsonResponse({ sent: true }, 200);
  } catch (err) {
    log.error('ops_alert_email_failed', errorFields(err));
    // 200, not 5xx: the CALLER is a cron job that has already recorded the
    // alert. Reporting a mail fault as a request failure would put a
    // misleading row in edge_request_log — and this endpoint's own failures
    // must never look like the webhook failures it exists to report.
    return jsonResponse({ sent: false, reason: 'send_failed' }, 200);
  } finally {
    try { transport.close(); } catch { /* teardown must not fail a sent mail */ }
  }
}));
