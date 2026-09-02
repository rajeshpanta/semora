/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/canvasFeedUrl.test.ts
 *
 * The refusals still have to refuse — this step guards a bearer credential, and
 * loosening the parse must not loosen what counts as a Canvas feed. So the
 * cases below come in pairs: the paste shapes that were being rejected for no
 * good reason, and the ones that must keep being rejected.
 */
import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  describeCanvasFeedInput,
  extractCanvasFeedCandidate,
  normalizeCanvasCalendarFeedUrl,
  canvasCalendarOrigin,
  CANVAS_FEED_HINTS,
} from './canvasFeedUrl';

const FEED = 'https://school.instructure.com/feeds/calendars/user_AbC123xyz.ics';
const WEBCAL = 'webcal://school.instructure.com/feeds/calendars/user_AbC123xyz.ics';

// ─── What must keep working exactly as before ──────────────────────────────

Deno.test('the two shapes Canvas actually hands out are accepted unchanged', () => {
  assertEquals(normalizeCanvasCalendarFeedUrl(FEED), FEED);
  assertEquals(normalizeCanvasCalendarFeedUrl(WEBCAL), FEED);
  assertEquals(canvasCalendarOrigin(WEBCAL), 'https://school.instructure.com');
});

Deno.test('surrounding whitespace and a trailing fragment are still handled', () => {
  assertEquals(normalizeCanvasCalendarFeedUrl(`   ${FEED}   `), FEED);
  assertEquals(normalizeCanvasCalendarFeedUrl(`${FEED}#section`), FEED);
});

// ─── The paste shapes that were being refused for no good reason ────────────

Deno.test('a link pasted with the words around it is read, not refused', () => {
  // Canvas shows the URL inside a dialog; copying it often catches the label.
  const pasted = `Calendar Feed\n${FEED}\nCopy this URL to subscribe.`;
  assertEquals(normalizeCanvasCalendarFeedUrl(pasted), FEED);
});

Deno.test('a link broken across lines by the copy is still found', () => {
  assertEquals(normalizeCanvasCalendarFeedUrl(`Here is my feed:\n\n  ${WEBCAL}  \n`), FEED);
});

Deno.test('a full stop stuck to the end of the link does not break it', () => {
  assertEquals(normalizeCanvasCalendarFeedUrl(`Subscribe to ${FEED}.`), FEED);
  assertEquals(normalizeCanvasCalendarFeedUrl(`(${FEED})`), FEED);
});

Deno.test('the feed link wins when the paste contains several links', () => {
  const pasted = `https://school.instructure.com/courses/12345 and ${FEED}`;
  assertEquals(normalizeCanvasCalendarFeedUrl(pasted), FEED);
});

Deno.test('a link copied from the address bar without https:// is accepted', () => {
  assertEquals(
    normalizeCanvasCalendarFeedUrl('school.instructure.com/feeds/calendars/user_AbC123xyz.ics'),
    FEED,
  );
});

// ─── What must still be refused, and told apart ────────────────────────────

Deno.test('a real Canvas URL from the wrong page is refused as the wrong page', () => {
  // The student is on the right site and has copied something real. That needs
  // different help from "this is not a link", which is why they are separate.
  const v = describeCanvasFeedInput('https://school.instructure.com/courses/12345/assignments');
  assertEquals(v.state, 'problem');
  assert(v.state === 'problem' && v.code === 'wrong_page');
});

Deno.test('text with no link in it is refused as not-a-link', () => {
  const v = describeCanvasFeedInput('my canvas calendar');
  assert(v.state === 'problem' && v.code === 'not_a_url');
});

Deno.test('loosening the parse did not loosen what counts as a feed', () => {
  // Every one of these contains a URL now findable by the extractor. None of
  // them is a user calendar feed, and all must still be refused.
  for (const bad of [
    'https://school.instructure.com/feeds/calendars/user_AbC123xyz.ics.evil.com/x',
    'https://evil.com/?next=https://school.instructure.com/feeds/calendars/user_A.ics',
    'https://school.instructure.com/feeds/calendars/',
    'https://school.instructure.com/feeds/calendars/course_123.ics',
  ]) {
    const v = describeCanvasFeedInput(bad);
    assertEquals(v.state, 'problem', `should have been refused: ${bad}`);
  }
});

Deno.test('insecure, credentialed, odd-port and IP hosts are still refused', () => {
  const cases: [string, string][] = [
    ['http://school.instructure.com/feeds/calendars/user_A.ics', 'not_https'],
    ['https://user:pw@school.instructure.com/feeds/calendars/user_A.ics', 'not_https'],
    ['https://school.instructure.com:8443/feeds/calendars/user_A.ics', 'not_https'],
    ['https://10.0.0.5/feeds/calendars/user_A.ics', 'bad_host'],
  ];
  for (const [input, code] of cases) {
    const v = describeCanvasFeedInput(input);
    assert(v.state === 'problem' && v.code === code, `${input} -> ${JSON.stringify(v)}`);
  }
});

Deno.test('an empty box is empty, not an error', () => {
  // An error sitting under a box the student has not filled in yet reads as a
  // failure they already made.
  assertEquals(describeCanvasFeedInput('').state, 'empty');
  assertEquals(describeCanvasFeedInput('   \n ').state, 'empty');
  assertEquals(describeCanvasFeedInput(undefined as unknown as string).state, 'empty');
  assertThrows(() => normalizeCanvasCalendarFeedUrl(''), Error, 'Paste your Canvas Calendar Feed URL.');
});

Deno.test('an absurdly long paste is refused before anything parses it', () => {
  const v = describeCanvasFeedInput('https://a.com/' + 'x'.repeat(5000));
  assert(v.state === 'problem' && v.code === 'too_long');
});

// ─── The verdict is safe to render ─────────────────────────────────────────

Deno.test('a verdict never carries the credential, only the hostname', () => {
  const v = describeCanvasFeedInput(FEED);
  assert(v.state === 'ok');
  assertEquals(v.host, 'school.instructure.com');
  // The host is what a masked field needs to confirm itself. The token is not.
  assert(!v.host.includes('AbC123xyz'));

  const bad = describeCanvasFeedInput(`junk ${FEED}`.replace('https', 'http'));
  assert(bad.state === 'problem');
  assert(!JSON.stringify(bad).includes('AbC123xyz'), 'the feed token reached the verdict');
});

Deno.test('every problem code has a hint the screen can show', () => {
  for (const code of ['not_a_url', 'wrong_page', 'not_https', 'bad_host', 'too_long'] as const) {
    const hint = CANVAS_FEED_HINTS[code];
    assert(hint && hint.length > 0, `no hint for ${code}`);
    // Apostrophes drift between straight and typographic and silently break the
    // catalogue key, so the hints are written without them.
    assert(!/['’]/.test(hint), `hint for ${code} contains an apostrophe`);
  }
});

Deno.test('the extractor returns the input untouched when there is nothing to find', () => {
  assertEquals(extractCanvasFeedCandidate('nothing here'), 'nothing here');
  assertEquals(extractCanvasFeedCandidate(''), '');
});
