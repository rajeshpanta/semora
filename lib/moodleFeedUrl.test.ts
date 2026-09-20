/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/moodleFeedUrl.test.ts
 */
import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  MOODLE_FEED_MESSAGES,
  describeMoodleFeedInput,
  extractMoodleFeedCandidate,
  moodleCalendarOrigin,
  moodleWwwrootFromPage,
  normalizeMoodleCalendarFeedUrl,
} from './moodleFeedUrl.ts';

const TOKEN = 'a'.repeat(40);
const GOOD = `https://moodle.school.edu/calendar/export_execute.php?userid=7&authtoken=${TOKEN}&preset_what=all&preset_time=custom`;

Deno.test('a good link is accepted and reduced to its two credentials', () => {
  const verdict = describeMoodleFeedInput(GOOD);
  assert(verdict.state === 'ok');
  assertEquals(verdict.url, `https://moodle.school.edu/calendar/export_execute.php?userid=7&authtoken=${TOKEN}`);
  assertEquals(verdict.host, 'moodle.school.edu');
  assertEquals(verdict.wwwroot, 'https://moodle.school.edu');
});

Deno.test('a sub-directory install keeps its path as the site root', () => {
  const verdict = describeMoodleFeedInput(
    `https://school.edu/moodle/calendar/export_execute.php?userid=1&authtoken=${TOKEN}`,
  );
  assert(verdict.state === 'ok');
  assertEquals(verdict.wwwroot, 'https://school.edu/moodle');
  assertEquals(moodleCalendarOrigin(GOOD), 'https://moodle.school.edu');
});

Deno.test('a link inside pasted text, a webcal link and a bare host all work', () => {
  assert(describeMoodleFeedInput(`Here you go: ${GOOD} — hope that helps`).state === 'ok');
  assert(describeMoodleFeedInput(GOOD.replace('https://', 'webcal://')).state === 'ok');
  assert(describeMoodleFeedInput(GOOD.replace('https://', '')).state === 'ok');
  assertEquals(extractMoodleFeedCandidate(`  ${GOOD}  `), GOOD);
});

Deno.test('each wrong page is named, and keeps the school it revealed', () => {
  const cases: Array<[string, string]> = [
    ['https://moodle.school.edu/login/index.php', 'login_page'],
    ['https://moodle.school.edu/calendar/export.php', 'export_page'],
    ['https://moodle.school.edu/calendar/icalexport.ics', 'export_file'],
    ['https://moodle.school.edu/my/', 'wrong_page'],
    ['https://moodle.school.edu/course/view.php?id=2', 'wrong_page'],
  ];
  for (const [input, code] of cases) {
    const verdict = describeMoodleFeedInput(input);
    assert(verdict.state === 'problem', input);
    assertEquals(verdict.code, code, input);
    // The school is the one thing worth keeping from a wrong paste.
    assertEquals(verdict.wwwroot, 'https://moodle.school.edu', input);
  }
});

Deno.test('a link from a different Moodle than the one chosen is caught', () => {
  const verdict = describeMoodleFeedInput(GOOD, 'https://moodle.other.edu');
  assert(verdict.state === 'problem');
  assertEquals(verdict.code, 'other_host');
  // Without an expectation, the same link is fine.
  assert(describeMoodleFeedInput(GOOD).state === 'ok');
  // A trailing slash on the expectation is not a mismatch.
  assert(describeMoodleFeedInput(GOOD, 'https://moodle.school.edu/').state === 'ok');
});

Deno.test('insecure, private and malformed links are refused', () => {
  const bad = [
    `http://moodle.school.edu/calendar/export_execute.php?userid=1&authtoken=${TOKEN}`,
    `https://127.0.0.1/calendar/export_execute.php?userid=1&authtoken=${TOKEN}`,
    `https://192.168.1.4/calendar/export_execute.php?userid=1&authtoken=${TOKEN}`,
    'https://moodle.school.edu/calendar/export_execute.php?userid=1&authtoken=nope',
    `https://moodle.school.edu/calendar/export_execute.php?authtoken=${TOKEN}`,
  ];
  for (const input of bad) assert(describeMoodleFeedInput(input).state === 'problem', input);
  assertEquals(describeMoodleFeedInput('').state, 'empty');
  assertEquals(describeMoodleFeedInput('   ').state, 'empty');
  assertEquals(describeMoodleFeedInput(null).state, 'empty');
});

Deno.test('the school address is recovered from any page inside Moodle', () => {
  assertEquals(moodleWwwrootFromPage('https://moodle.school.edu/my/'), 'https://moodle.school.edu');
  assertEquals(moodleWwwrootFromPage('https://school.edu/moodle/course/view.php?id=9'), 'https://school.edu/moodle');
  assertEquals(moodleWwwrootFromPage('https://school.edu/vle/lms/login/index.php'), 'https://school.edu/vle/lms');
  assertEquals(moodleWwwrootFromPage('http://school.edu/moodle/my/'), null);
  assertEquals(moodleWwwrootFromPage('not a url at all'), null);
});

Deno.test('the throwing form matches the described one, message for message', () => {
  assertEquals(normalizeMoodleCalendarFeedUrl(GOOD).endsWith(TOKEN), true);
  for (const input of ['', 'https://moodle.school.edu/my/', 'https://moodle.school.edu/login/index.php']) {
    const verdict = describeMoodleFeedInput(input);
    const expected = MOODLE_FEED_MESSAGES[verdict.state === 'empty' ? 'empty' : (verdict as { code: string }).code as never];
    assertThrows(() => normalizeMoodleCalendarFeedUrl(input), Error, expected);
  }
});

Deno.test('no message ever quotes the link or its token', () => {
  for (const message of Object.values(MOODLE_FEED_MESSAGES)) {
    assert(!/authtoken|userid=/i.test(message), message);
  }
  try {
    normalizeMoodleCalendarFeedUrl(`https://secret.school.edu/my/?authtoken=${TOKEN}`);
  } catch (error) {
    assert(!(error as Error).message.includes(TOKEN));
    assert(!(error as Error).message.includes('secret.school.edu'));
  }
});
