/**
 * Run with:
 *   deno test --allow-read supabase/functions/_shared/moodle-calendar.test.ts
 *
 * The fixtures these read are described, event by event, in
 * fixtures/moodle/README.md. Two of them are real captures from a live Moodle
 * 5.0; the rest are synthesised in the byte shape those captures prove.
 */
import { assert, assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classifyMoodleFeedBody,
  decodeMoodleEntities,
  fetchMoodleCalendar,
  moodleCalendarOrigin,
  moodleFeedUrlFor,
  normalizeMoodleCalendarFeedUrl,
  parseMoodleCalendarFeed,
  redactMoodleFeedUrl,
  stripMoodleEventName,
} from './moodle-calendar.ts';

const DIR = new URL('./fixtures/moodle/', import.meta.url);
const read = (name: string) => Deno.readTextFile(new URL(name, DIR));
/** Fixed, so the horizon assertions do not drift with the calendar. */
const TODAY = new Date('2026-09-19T12:00:00Z');
const LIVE = 'https://school.example.edu/calendar/export_execute.php?userid=7&authtoken='
  + 'a'.repeat(40);

// ── the link ───────────────────────────────────────────────────────────────

Deno.test('canonicalises a real export link and keeps only the two credentials', () => {
  const url = normalizeMoodleCalendarFeedUrl(
    `https://school.example.edu/calendar/export_execute.php?userid=7&authtoken=${'A'.repeat(40)}&preset_what=user&preset_time=weeknow&utm=x#frag`,
  );
  assertEquals(url, `https://school.example.edu/calendar/export_execute.php?userid=7&authtoken=${'a'.repeat(40)}`);
  assertEquals(moodleCalendarOrigin(url), 'https://school.example.edu');
});

Deno.test('accepts a sub-directory install, webcal, a bare host and a link inside a sentence', () => {
  assertEquals(
    moodleCalendarOrigin(`https://school.edu/moodle/calendar/export_execute.php?userid=1&authtoken=${'b'.repeat(40)}`),
    'https://school.edu/moodle',
  );
  assert(normalizeMoodleCalendarFeedUrl(`webcal://s.edu/calendar/export_execute.php?userid=1&authtoken=${'c'.repeat(40)}`)
    .startsWith('https://'));
  assert(normalizeMoodleCalendarFeedUrl(`s.edu/calendar/export_execute.php?userid=1&authtoken=${'d'.repeat(40)}`)
    .startsWith('https://'));
  assert(normalizeMoodleCalendarFeedUrl(
    `here it is https://s.edu/calendar/export_execute.php?userid=1&authtoken=${'e'.repeat(40)} thanks`,
  ).endsWith('e'.repeat(40)));
});

Deno.test('names the wrong page the student actually copied', () => {
  const cases: [string, RegExp][] = [
    ['https://s.edu/login/index.php', /sign-in page/],
    ['https://s.edu/calendar/export.php', /Export page/],
    ['https://s.edu/calendar/icalexport.ics', /downloaded file/],
    ['https://s.edu/my/', /not a Moodle calendar export link/],
  ];
  for (const [input, expected] of cases) {
    assertThrows(() => normalizeMoodleCalendarFeedUrl(input), Error, undefined, input);
    try { normalizeMoodleCalendarFeedUrl(input); } catch (error) {
      assert(expected.test((error as Error).message), `${input} -> ${(error as Error).message}`);
    }
  }
});

Deno.test('refuses insecure, private and malformed links', () => {
  const token = 'f'.repeat(40);
  assertThrows(() => normalizeMoodleCalendarFeedUrl(`http://s.edu/calendar/export_execute.php?userid=1&authtoken=${token}`));
  assertThrows(() => normalizeMoodleCalendarFeedUrl(`https://127.0.0.1/calendar/export_execute.php?userid=1&authtoken=${token}`));
  assertThrows(() => normalizeMoodleCalendarFeedUrl(`https://10.0.0.3/calendar/export_execute.php?userid=1&authtoken=${token}`));
  assertThrows(() => normalizeMoodleCalendarFeedUrl('https://s.edu/calendar/export_execute.php?userid=1&authtoken=short'));
  assertThrows(() => normalizeMoodleCalendarFeedUrl(`https://s.edu/calendar/export_execute.php?authtoken=${token}`));
  assertThrows(() => normalizeMoodleCalendarFeedUrl(''));
  assertThrows(() => normalizeMoodleCalendarFeedUrl(`https://s.edu/calendar/export_execute.php?userid=1&authtoken=${token}${'x'.repeat(5000)}`));
});

Deno.test('a refusal never quotes the link, and redaction removes the token', () => {
  const secret = 'deadbeef'.repeat(5);
  try {
    normalizeMoodleCalendarFeedUrl(`https://s.edu/my/?authtoken=${secret}`);
  } catch (error) {
    assert(!(error as Error).message.includes(secret));
    assert(!(error as Error).message.includes('s.edu'));
  }
  const redacted = redactMoodleFeedUrl(`https://s.edu/calendar/export_execute.php?userid=7&authtoken=${secret}`);
  assert(!redacted.includes(secret));
  assert(!redacted.includes('userid=7'));
});

Deno.test('preset rewriting produces the two fetchable URLs', () => {
  assert(moodleFeedUrlFor(LIVE, { what: 'courses', time: 'custom' })
    .includes('preset_what=courses&preset_time=custom'));
  assert(moodleFeedUrlFor(LIVE, { what: 'all', time: 'recentupcoming' })
    .includes('preset_what=all&preset_time=recentupcoming'));
});

// ── bodies ─────────────────────────────────────────────────────────────────

Deno.test('a body is classified by its text, never by its status or content type', async () => {
  // Moodle answers a bad token with 200 text/html. A status- or type-based
  // branch would misfile it and purge the student's credential.
  assertEquals(classifyMoodleFeedBody(200, 'text/html; charset=utf-8', await read('invalid-auth.txt')), 'invalid_auth');
  assertEquals(classifyMoodleFeedBody(200, 'text/html; charset=utf-8', await read('no-export.txt')), 'export_disabled');
  assertEquals(classifyMoodleFeedBody(403, 'text/html', await read('waf-challenge.html')), 'blocked');
  assertEquals(classifyMoodleFeedBody(200, 'text/calendar; charset=utf-8', await read('all-custom.ics')), 'ok');
  // A firewall that answers 200 with an HTML challenge is still blocked.
  assertEquals(classifyMoodleFeedBody(200, 'text/html', '<html><title>Just a moment…</title>'), 'blocked');
});

// ── names ──────────────────────────────────────────────────────────────────

Deno.test('event names are stripped in English and Spanish, longest pattern first', () => {
  assertEquals(stripMoodleEventName('Problem Set 3 is due'), { base: 'Problem Set 3', kind: 'due', comp: 'assign' });
  // 'is due to be graded' must beat 'is due'.
  assertEquals(stripMoodleEventName('Problem Set 3 is due to be graded').kind, 'grading');
  assertEquals(stripMoodleEventName('Midterm Quiz opens').kind, 'open');
  assertEquals(stripMoodleEventName('Midterm Quiz closes'), { base: 'Midterm Quiz', kind: 'due', comp: 'quiz' });
  assertEquals(stripMoodleEventName('Weekly reflection should be completed').kind, 'expect');
  assertEquals(stripMoodleEventName('Reading Journal is due (extension)'), { base: 'Reading Journal', kind: 'extend', comp: 'assign' });
  // Spanish puts the placeholder LAST: a suffix-only parser fails here.
  assertEquals(stripMoodleEventName('Vencimiento de Ensayo Final'), { base: 'Ensayo Final', kind: 'due', comp: 'assign' });
  // Nothing recognisable is left alone rather than mangled.
  assertEquals(stripMoodleEventName('Unit 2 Quiz'), { base: 'Unit 2 Quiz', kind: null, comp: null });
});

// ── the real captures ──────────────────────────────────────────────────────

Deno.test('parses the real Moodle 5.0 capture that has no URL property', async () => {
  const parsed = parseMoodleCalendarFeed(
    await read('courses-custom.ics'),
    await read('all-custom.ics'),
    { wwwroot: 'https://school.moodledemo.net', today: TODAY },
  );
  assertEquals(parsed.courses.map((c) => c.id), ['Celebrating Cultures', 'Cross-cultural Communication']);
  assertEquals(parsed.assignments.length, 2);
  const first = parsed.assignments.find((a) => a.external_id === '449@school.moodledemo.net')!;
  assertEquals(first.title, '(Mobile assignment) View from your window');
  assertEquals(first.external_course_id, 'Celebrating Cultures');
  assertEquals(first.due_date, '2026-12-22');
  // No per-item link exists, so the day view stands in.
  assert(first.url!.startsWith('https://school.moodledemo.net/calendar/view.php?view=day&time='));
});

Deno.test('an empty feed is not an error', async () => {
  const parsed = parseMoodleCalendarFeed(
    await read('courses-recentupcoming.ics'),
    await read('all-recentupcoming.ics'),
    { wwwroot: 'https://school.moodledemo.net', today: TODAY },
  );
  assertEquals(parsed.courses, []);
  assertEquals(parsed.assignments, []);
  assertEquals(parsed.horizon_days, 0);
});

// ── HTML entities, from a live Moodle ──────────────────────────────────────

Deno.test('Moodle HTML-encodes names, and the feed is decoded back', () => {
  // Exactly what a live Moodle 5.0 returned for an event named
  // "Tom & Jerry essay": format_string() escaped the ampersand, then the iCal
  // serialiser escaped the resulting semicolon.
  assertEquals(decodeMoodleEntities('Tom &amp; Jerry essay'), 'Tom & Jerry essay');
  assertEquals(decodeMoodleEntities('Class &lt;b&gt;bold&lt;/b&gt;'), 'Class <b>bold</b>');
  assertEquals(decodeMoodleEntities('He said &quot;hi&quot;'), 'He said "hi"');
  assertEquals(decodeMoodleEntities('Ben&#039;s essay'), "Ben's essay");
  assertEquals(decodeMoodleEntities('caf&#xe9;'), 'café');
  // &amp; decodes LAST, so a literally-escaped entity survives as text.
  assertEquals(decodeMoodleEntities('&amp;lt;'), '&lt;');
  // Nothing to decode is left alone.
  assertEquals(decodeMoodleEntities('Plain title'), 'Plain title');
});

Deno.test('a real captured feed with an ampersand produces a clean title', async () => {
  const ics = await read('entities-and-personal.ics');
  const parsed = parseMoodleCalendarFeed(ics, ics, { wwwroot: 'https://school.moodledemo.net', today: TODAY });
  // The personal event carries no CATEGORIES, so it is not a task at all —
  // which is the rule this fixture also proves with live data.
  assertEquals(parsed.assignments.some((a) => a.title.includes('Jerry')), false);
  // And nothing anywhere carries a raw entity.
  for (const item of parsed.assignments) {
    assert(!/&(amp|lt|gt|quot|#\d+);/.test(item.title), item.title);
  }
  for (const course of parsed.courses) {
    assert(!/&(amp|lt|gt|quot|#\d+);/.test(course.id), course.id);
  }
});

// ── REAL overrides and extensions, captured from a live Moodle ─────────────

Deno.test('a real extension and a real override both land on the base task', async () => {
  // Captured 2026-09-19 from school.moodledemo.net after granting the demo
  // student an extension on one assignment and a per-user override on another.
  // This is the pair that corrected the source reading: BOTH carry CATEGORIES,
  // although mod/assign sets courseid = 0 on them.
  const parsed = parseMoodleCalendarFeed(
    await read('real-override-extension-courses.ics'),
    await read('real-override-extension-all.ics'),
    { wwwroot: 'https://school.moodledemo.net', today: TODAY },
  );

  const byId = new Map(parsed.assignments.map((a) => [a.external_id, a]));

  // EXTENSION: the base event survives in `all`, and the extension rides
  // alongside it. The student's real date is 2027-01-15, not the original
  // 2026-12-22 — getting this wrong shows a trusted, wrong deadline.
  const extended = byId.get('449@school.moodledemo.net')!;
  assertEquals(extended.title, '(Mobile assignment) View from your window');
  assertEquals(extended.due_date, '2027-01-15');

  // OVERRIDE: the base is SUPPRESSED in `all` and only the override is there.
  // Identity still comes from the base, so the task is stable if the override
  // is ever lifted.
  const overridden = byId.get('587@school.moodledemo.net')!;
  assertEquals(overridden.title, 'What do you already know?');
  assertEquals(overridden.due_date, '2027-08-10');

  // Neither decorated event becomes a task of its own.
  assertEquals(parsed.assignments.length, 2);
  assert(!parsed.assignments.some((a) => /extension|Override/i.test(a.title)));
  assertEquals(parsed.overrides_applied, 2);
});

// ── the scenario pair ──────────────────────────────────────────────────────

Deno.test('the rich pair parses exactly as fixtures/moodle/README.md predicts', async () => {
  const parsed = parseMoodleCalendarFeed(
    await read('rich-courses.ics'),
    await read('rich-all.ics'),
    { wwwroot: 'https://rich.example.edu', today: TODAY },
  );

  // Five courses: four with base events, plus the group-only one, which is
  // kept and flagged. "Site events" is not a course.
  assertEquals(parsed.courses.map((c) => c.id).sort(),
    ['BIO150', 'ESP200', 'GRP300', 'HIST210', 'PHYS101']);
  assertEquals(parsed.unmatched_categories, ['GRP300']);
  assert(!parsed.courses.some((c) => /site events/i.test(c.id)));

  const by = new Map(parsed.assignments.map((a) => [a.title, a]));
  assertEquals([...by.keys()].sort(), [
    'Ensayo Final', 'Essay 1', 'Lab Report', 'Midterm Quiz',
    'Problem Set 3', 'Reading Journal', 'Tutorial group meeting', 'Weekly reflection',
  ]);

  // Plain due dates.
  assertEquals(by.get('Problem Set 3')!.due_date, '2026-09-25');
  assertEquals(by.get('Midterm Quiz')!.due_date, '2026-10-01');   // the CLOSE, not the open
  // 'exam', not 'quiz': the shared classify() ranks midterm/exam/test above
  // quiz, which is Canvas's frozen behaviour and is right for a student.
  assertEquals(by.get('Midterm Quiz')!.type, 'exam');
  assertEquals(by.get('Weekly reflection')!.type, 'other');       // "should be completed"
  assertEquals(by.get('Ensayo Final')!.due_date, '2026-12-01');   // Spanish prefix stripped

  // A USER override replaces the base date and keeps the base identity.
  assertEquals(by.get('Essay 1')!.due_date, '2026-10-17');
  assertEquals(by.get('Essay 1')!.external_id, '2001@rich.example.edu');
  assertEquals(by.get('Essay 1')!.external_course_id, 'HIST210');

  // A GROUP override does the same, and carries its course.
  assertEquals(by.get('Lab Report')!.due_date, '2026-11-05');
  assertEquals(by.get('Lab Report')!.external_id, '3001@rich.example.edu');

  // An EXTENSION does too — this is the case the first plan got wrong.
  assertEquals(by.get('Reading Journal')!.due_date, '2026-10-12');
  assertEquals(by.get('Reading Journal')!.external_id, '2003@rich.example.edu');

  assertEquals(parsed.overrides_applied, 3);

  // Dropped: opens, grading deadlines, the cancelled event, the site event and
  // the personal reminder. Fourteen events in, eight tasks out.
  assertEquals(parsed.assignments.length, 8);
  assert(!by.has('Cancelled Seminar'));
  assert(!by.has('Dentist'));
  assert(!by.has('Winter break begins'));

  // The horizon is measured over the raw union, before any of those drops.
  assertEquals(parsed.horizon_days, 90); // 2026-12-18, the site event
});

Deno.test('a second parse of the same feeds adds nothing', async () => {
  const args = ['rich-courses.ics', 'rich-all.ics'] as const;
  const a = parseMoodleCalendarFeed(await read(args[0]), await read(args[1]), { wwwroot: 'https://rich.example.edu', today: TODAY });
  const b = parseMoodleCalendarFeed(await read(args[0]), await read(args[1]), { wwwroot: 'https://rich.example.edu', today: TODAY });
  assertEquals(a.assignments.length, b.assignments.length);
  assertEquals(a.assignments.map((x) => x.external_id).sort(), b.assignments.map((x) => x.external_id).sort());
});

Deno.test('a sub-directory install keeps its path in the UID and the link', async () => {
  const ics = await read('subdir-install.ics');
  const parsed = parseMoodleCalendarFeed(ics, ics, { wwwroot: 'https://school.edu/moodle', today: TODAY });
  assertEquals(parsed.assignments[0].external_id, '4242@school.edu/moodle');
  assert(parsed.assignments[0].url!.startsWith('https://school.edu/moodle/calendar/view.php'));
});

Deno.test('a pre-3.3 quiz is due when it closes, not when it opens', async () => {
  const ics = await read('pre33-quiz.ics');
  const parsed = parseMoodleCalendarFeed(ics, ics, { wwwroot: 'https://old.example.edu', today: TODAY });
  assertEquals(parsed.assignments.length, 1);
  assertEquals(parsed.assignments[0].due_date, '2026-11-03');
  assertEquals(parsed.assignments[0].due_time, '23:00:00');
});

Deno.test('rubbish is refused rather than parsed', () => {
  assertThrows(() => parseMoodleCalendarFeed('not a calendar', 'not a calendar', { wwwroot: 'https://s.edu' }));
});

// ── fetching ───────────────────────────────────────────────────────────────

function stubFetch(routes: Record<string, { status?: number; body: string; headers?: Record<string, string> }>) {
  const calls: string[] = [];
  const impl = ((input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const key = Object.keys(routes).find((k) => url.includes(k));
    const route = key ? routes[key] : { status: 404, body: 'missing' };
    return Promise.resolve(new Response(route.body, {
      status: route.status ?? 200,
      headers: route.headers ?? { 'content-type': 'text/calendar' },
    }));
  }) as unknown as typeof fetch;
  return { impl, calls };
}

Deno.test('a healthy fetch asks for two URLs, not four', async () => {
  const courses = await read('rich-courses.ics');
  const all = await read('rich-all.ics');
  const { impl, calls } = stubFetch({
    'preset_what=courses&preset_time=custom': { body: courses },
    'preset_what=all&preset_time=custom': { body: all },
  });
  const result = await fetchMoodleCalendar(LIVE, { fetchImpl: impl, today: TODAY });
  assertEquals(calls.length, 2);
  assertEquals(result.complete, true);
  assertEquals(result.recentupcomingOk, false);
  assertEquals(result.assignments.length, 8);
});

Deno.test('a narrowed school gets the 60-day floor merged in', async () => {
  // `custom` comes back with only a near-term item, so the horizon is short and
  // the 60-day preset is asked for and unioned.
  const near = (await read('rich-courses.ics'))
    .replace(/BEGIN:VEVENT[\s\S]*END:VEVENT/, [
      'BEGIN:VEVENT', 'UID:1@narrow.edu', 'SUMMARY:Near Task is due', 'DESCRIPTION:x',
      'CLASS:PUBLIC', 'DTSTAMP:20260919T120000Z', 'DTSTART:20260921T235900Z',
      'DTEND:20260921T235900Z', 'CATEGORIES:NAR100', 'END:VEVENT',
    ].join('\n'));
  const { impl, calls } = stubFetch({
    'preset_time=custom': { body: near },
    'preset_time=recentupcoming': { body: await read('rich-courses.ics') },
  });
  const result = await fetchMoodleCalendar(LIVE, { fetchImpl: impl, today: TODAY });
  assertEquals(calls.length, 4);
  assertEquals(result.recentupcomingOk, true);
  assert(result.assignments.length > 1);
});

Deno.test('an expired link and a blocked school are told apart', async () => {
  const expired = stubFetch({ 'export_execute': { body: await read('invalid-auth.txt'), headers: { 'content-type': 'text/html' } } });
  await fetchMoodleCalendar(LIVE, { fetchImpl: expired.impl, today: TODAY })
    .then(() => { throw new Error('should have thrown'); })
    .catch((error) => {
      assertEquals(error.code, 'moodle_feed_expired');
      assertEquals(error.status, 401);   // drives credentials_required
    });

  const blocked = stubFetch({ 'export_execute': { status: 403, body: await read('waf-challenge.html'), headers: { 'content-type': 'text/html' } } });
  await fetchMoodleCalendar(LIVE, { fetchImpl: blocked.impl, today: TODAY })
    .then(() => { throw new Error('should have thrown'); })
    .catch((error) => {
      assertEquals(error.code, 'moodle_feed_blocked');
      // No 401: the credential must NOT be purged for a firewall.
      assertEquals(error.status, undefined);
    });
});

Deno.test('a cross-origin redirect is refused', async () => {
  const { impl } = stubFetch({ 'export_execute': { status: 302, body: '', headers: { location: 'https://elsewhere.example' } } });
  await fetchMoodleCalendar(LIVE, { fetchImpl: impl, today: TODAY })
    .then(() => { throw new Error('should have thrown'); })
    .catch((error) => assertEquals(error.code, 'moodle_feed_redirected'));
});

Deno.test('no exported message leaks a token or a user id', async () => {
  const source = await Deno.readTextFile(new URL('./moodle-calendar.ts', import.meta.url));
  const messages = [...source.matchAll(/new Error\(\s*'([^']*)'/g)].map((m) => m[1]);
  for (const message of messages) {
    assert(!/authtoken|userid=/i.test(message), message);
  }
});

Deno.test('a type survives translation, because the module is not a word', () => {
  // The defect this closes: 'Cuestionario 3' was recognised as a quiz EVENT by
  // the 12-language pattern table and then filed as a generic assignment by an
  // English-only keyword regex sitting directly downstream of it.
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2026042000//EN',
    ...[
      ['701', 'Se cierra Cuestionario 3', 'FISICA101'],   // es quiz: 'Se cierra {$a}'
      ['702', 'Vencimiento de Examen parcial', 'FISICA101'],
      ['703', 'Unit 2 Quiz closes', 'PHYS101'],
      ['704', 'Midterm Quiz closes', 'PHYS101'],
      ['705', 'Problem Set 3 is due', 'PHYS101'],
    ].flatMap(([id, summary, cat]) => [
      'BEGIN:VEVENT',
      `UID:${id}@moodle.school.edu`,
      `SUMMARY:${summary}`,
      `CATEGORIES:${cat}`,
      'DTSTART:20261110T235900Z',
      'DTEND:20261110T235900Z',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join('\r\n');

  const parsed = parseMoodleCalendarFeed(ics, ics, {
    wwwroot: 'https://moodle.school.edu',
    today: new Date('2026-11-01T00:00:00Z'),
  });
  const typeOf = (title: string) =>
    parsed.assignments.find((a) => a.title === title)?.type;

  // Spanish quiz module -> quiz, from `comp`, with no Spanish keyword involved.
  assertEquals(typeOf('Cuestionario 3'), 'quiz');
  // Spanish exam in an ASSIGNMENT module -> exam, from the Spanish keywords.
  assertEquals(typeOf('Examen parcial'), 'exam');
  // English keeps behaving exactly as it did.
  assertEquals(typeOf('Unit 2 Quiz'), 'quiz');
  // A named midterm beats the module it lives in.
  assertEquals(typeOf('Midterm Quiz'), 'exam');
  assertEquals(typeOf('Problem Set 3'), 'assignment');
});
