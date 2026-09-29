/**
 * Run with:
 *   deno test --allow-read supabase/functions/lms-sync/errorCode.test.ts
 *
 * 'credentials_required' switches background sync off and purges the stored
 * link from the Vault. Every case below is either a failure that must cost
 * that, or one that must not.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { errorCode } from './errorCode.ts';
import { fetchMoodleCalendar } from '../_shared/moodle-calendar.ts';

const FIXTURES = new URL('../_shared/fixtures/moodle/', import.meta.url);
const read = (name: string) => Deno.readTextFile(new URL(name, FIXTURES));
const TODAY = new Date('2026-09-19T12:00:00Z');
const LINK = `https://school.example.edu/calendar/export_execute.php?userid=7&authtoken=${'deadbeef'.repeat(5)}`;

/** What Deno throws when a request never completes: it quotes the URL. */
const sendError = (url: string) =>
  new TypeError(`error sending request for url (${url}): client error (Connect): dns error: failed to lookup address information`);

function answering(status: number, body: string, contentType = 'text/html; charset=utf-8'): typeof fetch {
  return (() => Promise.resolve(new Response(body, { status, headers: { 'content-type': contentType } }))) as unknown as typeof fetch;
}

async function failureOf(fetchImpl: typeof fetch): Promise<unknown> {
  return await fetchMoodleCalendar(LINK, { fetchImpl, today: TODAY }).then(
    () => { throw new Error('should have thrown'); },
    (error) => error,
  );
}

// ── gap #7 ─────────────────────────────────────────────────────────────────

Deno.test('a Moodle fetch that never completes is NOT a dead link, though its message said authtoken=', async () => {
  const thrown = ((input: string | URL | Request) => Promise.reject(sendError(String(input)))) as unknown as typeof fetch;
  const error = await failureOf(thrown);
  assertEquals(errorCode(error), 'provider_error');
});

Deno.test('even unwrapped, a transport error quoting a URL is read by its prose, not its query string', () => {
  // The same Deno error, had anything let it through raw: 'token' inside
  // 'authtoken=' used to be the whole reason it was filed as a dead credential.
  assertEquals(errorCode(sendError(`${LINK}&preset_what=all&preset_time=custom`)), 'provider_error');
  // Google Classroom's paging parameter is the same trap.
  assertEquals(
    errorCode(sendError('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=100&pageToken=abc')),
    'provider_error',
  );
});

Deno.test('the real dead-token answer — HTTP 200, text/html, "Invalid authentication" — IS the dead link', async () => {
  const error = await failureOf(answering(200, await read('invalid-auth.txt')));
  assertEquals((error as { code?: string }).code, 'moodle_feed_expired');
  assertEquals(errorCode(error), 'credentials_required');
});

Deno.test('export switched off still stops the sync, exactly as before', async () => {
  const error = await failureOf(answering(200, await read('no-export.txt')));
  assertEquals(errorCode(error), 'credentials_required');
});

// ── gap #14 and the other Moodle failures that must keep the link ─────────

Deno.test('a rate limit, a server failure, a firewall and a redirect all keep the link', async () => {
  const cases: Array<[string, typeof fetch]> = [
    ['429', answering(429, 'Too Many Requests', 'text/plain')],
    ['503 maintenance', answering(503, '<html><body>This site is undergoing maintenance</body></html>')],
    ['502 gateway', answering(502, 'Bad gateway', 'text/plain')],
    ['403 firewall', answering(403, await read('waf-challenge.html'))],
    ['302 redirect', (() => Promise.resolve(new Response('', { status: 302, headers: { location: 'https://sso.example.edu' } }))) as unknown as typeof fetch],
    ['200 not a calendar', answering(200, 'Something went wrong', 'text/plain')],
  ];
  for (const [label, impl] of cases) {
    assertEquals(errorCode(await failureOf(impl)), 'provider_error', label);
  }
});

// ── unchanged: Canvas and the token lanes ─────────────────────────────────

Deno.test('Canvas decisions are unchanged', () => {
  const expired = Object.assign(
    new Error('This Canvas Calendar Feed is no longer available. Copy a fresh Calendar Feed URL from Canvas and reconnect.'),
    { status: 401 },
  );
  assertEquals(errorCode(expired), 'credentials_required');
  const throttled = Object.assign(
    new Error('Canvas is rate limiting Semora right now. The next sync will pick this up automatically.'),
    { status: 503, code: 'provider_throttled' },
  );
  assertEquals(errorCode(throttled), 'provider_error');
  assertEquals(errorCode(new Error('Canvas did not respond. Check your school connection and try again.')), 'provider_error');
  assertEquals(errorCode(new Error('Canvas Calendar Feed request failed (500).')), 'provider_error');
  // A provider's own prose still counts.
  assertEquals(errorCode(new Error('Invalid access token.')), 'credentials_required');
  assertEquals(errorCode(Object.assign(new Error('LMS request failed (403).'), { status: 403 })), 'credentials_required');
});

Deno.test('Moodle web-service error codes are unchanged', () => {
  const ws = (message: string, moodleErrorCode: string) => Object.assign(new Error(message), { moodleErrorCode });
  assertEquals(errorCode(ws('Invalid token - token not found', 'invalidtoken')), 'credentials_required');
  // Its text says "token", and it is an admin's setting, not the student's credential.
  assertEquals(errorCode(ws('Web services must be enabled in Advanced features. token', 'enablewsdescription')), 'provider_error');
});
