/**
 * Run with:
 *   deno test --allow-read supabase/functions/_shared/moodle-site.test.ts
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { moodleProbeCandidates, probeMoodleSite, readPublicConfig } from './moodle-site.ts';

const DIR = new URL('./fixtures/moodle/', import.meta.url);
const read = (name: string) => Deno.readTextFile(new URL(name, DIR));

Deno.test('reads the real public-config envelope captured from a live Moodle', async () => {
  const probe = readPublicConfig(JSON.parse(await read('public-config.json')))!;
  assertEquals(probe.isMoodle, true);
  assertEquals(probe.via, 'public_config');
  assertEquals(probe.wwwroot, 'https://school.moodledemo.net');
  assertEquals(probe.siteName, 'Mount Orange');
  assertEquals(probe.ws, true);
  assertEquals(probe.mobile, true);
  // 1 = "via the app", Moodle's default, which makes launch.php throw before
  // the login form. This is the evidence that keeps §12 parked.
  assertEquals(probe.typeoflogin, 1);
  assertEquals(probe.maintenance, false);
});

Deno.test('an exception envelope still proves it is a Moodle', () => {
  const probe = readPublicConfig([{ error: true, exception: { errorcode: 'enablewsdescription' } }])!;
  assertEquals(probe, { isMoodle: true, via: 'exception' });
});

Deno.test('rubbish is not mistaken for a config', () => {
  assertEquals(readPublicConfig(null), null);
  assertEquals(readPublicConfig([]), null);
  assertEquals(readPublicConfig([{ data: {} }]), null);
  assertEquals(readPublicConfig(['nope']), null);
});

Deno.test('candidates cover what a student actually types', () => {
  // A bare school domain: try it, then the two shapes universities use.
  const plain = moodleProbeCandidates('school.edu');
  assert(plain.includes('https://school.edu'));
  assert(plain.includes('https://moodle.school.edu'));
  assert(plain.includes('https://school.edu/moodle'));

  // Already a Moodle host: do not prepend another label.
  const already = moodleProbeCandidates('https://moodle.school.edu');
  assert(!already.some((c) => c.includes('moodle.moodle.')));

  // A pasted page from inside Moodle keeps the sub-directory.
  assert(moodleProbeCandidates('https://school.edu/moodle/course/view.php?id=2')
    .includes('https://school.edu/moodle'));

  // Bounded, and never a scanner.
  assert(moodleProbeCandidates('school.edu').length <= 5);
});

Deno.test('private, insecure and unparseable addresses are refused outright', () => {
  assertEquals(moodleProbeCandidates('http://school.edu'), []);
  assertEquals(moodleProbeCandidates('https://127.0.0.1'), []);
  assertEquals(moodleProbeCandidates('https://10.1.2.3'), []);
  assertEquals(moodleProbeCandidates(''), []);
  assertEquals(moodleProbeCandidates('   '), []);
});

function stub(routes: Array<{ match: string; status?: number; body: string; headers?: Record<string, string> }>) {
  return ((input: string | URL | Request) => {
    const url = String(input);
    const route = routes.find((r) => url.includes(r.match));
    if (!route) return Promise.resolve(new Response('nope', { status: 404 }));
    return Promise.resolve(new Response(route.body, { status: route.status ?? 200, headers: route.headers }));
  }) as unknown as typeof fetch;
}

Deno.test('a live config answer is returned as the verdict', async () => {
  const probe = await probeMoodleSite('school.edu', {
    fetchImpl: stub([{ match: 'service-nologin.php', body: await read('public-config.json') }]),
  });
  assertEquals(probe.isMoodle, true);
  assertEquals(probe.siteName, 'Mount Orange');
});

Deno.test('web services off still identifies a Moodle by its export page', async () => {
  const probe = await probeMoodleSite('school.edu', {
    fetchImpl: stub([
      { match: 'service-nologin.php', status: 500, body: 'nope' },
      { match: 'calendar/export.php', body: '<html><head><meta name="keywords" content="moodle, elearning"></head></html>' },
    ]),
  });
  assertEquals(probe.isMoodle, true);
  assertEquals(probe.via, 'markup');
});

Deno.test('a firewall is reported as blocked, not as "not a Moodle"', async () => {
  const probe = await probeMoodleSite('school.edu', {
    fetchImpl: stub([{ match: '', status: 403, body: await read('waf-challenge.html') }]),
  });
  assertEquals(probe.isMoodle, false);
  // The difference matters: 'blocked' means "continue anyway", 'not_moodle'
  // means "check the address".
  assertEquals(probe.reason, 'blocked');
});

Deno.test('a site that answers nothing at all is unreachable', async () => {
  const probe = await probeMoodleSite('school.edu', {
    fetchImpl: (() => Promise.reject(new Error('dns'))) as unknown as typeof fetch,
  });
  assertEquals(probe, { isMoodle: false, reason: 'unreachable' });
});

Deno.test('the probe never hands back the page it fetched', async () => {
  const secret = 'INTERNAL-ERROR-TRACE-abc123';
  const probe = await probeMoodleSite('school.edu', {
    fetchImpl: stub([{ match: '', status: 500, body: `<html>${secret}</html>` }]),
  });
  assert(!JSON.stringify(probe).includes(secret));
});
