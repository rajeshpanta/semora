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

// ── overrides that are two events (gap #3) ─────────────────────────────────

/** A feed in the byte shape of the real captures, from one line per event. */
function feed(events: Array<{ id: string; summary: string; start: string; end?: string; cat?: string | null }>): string {
  return [
    'BEGIN:VCALENDAR', 'METHOD:PUBLISH',
    'PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2026042000//EN', 'VERSION:2.0',
    ...events.flatMap((event) => [
      'BEGIN:VEVENT',
      `UID:${event.id}@moodle.school.edu`,
      `SUMMARY:${event.summary}`,
      'DESCRIPTION:Synthesised test event.',
      'CLASS:PUBLIC',
      'LAST-MODIFIED:20260901T090000Z',
      `DTSTART:${event.start}`,
      `DTEND:${event.end ?? event.start}`,
      ...(event.cat === null ? [] : [`CATEGORIES:${event.cat ?? 'CHEM110'}`]),
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join('\n');
}
const parse = (courses: string, all: string) =>
  parseMoodleCalendarFeed(courses, all, { wwwroot: 'https://moodle.school.edu', today: TODAY });

Deno.test('a quiz group override takes its CLOSE, not its opening (the judge\'s case)', async () => {
  // Base 'Quiz 3 closes' 10-09 23:59Z. The student's section has an override,
  // which Moodle writes as TWO events and lists the opening first. The first
  // version took whichever 'Quiz 3 - …' event came first: 10-06 14:00Z.
  const parsed = parseMoodleCalendarFeed(
    await read('quiz-group-override-courses.ics'),
    await read('quiz-group-override-all.ics'),
    { wwwroot: 'https://rich.example.edu', today: TODAY },
  );
  assertEquals(parsed.assignments.length, 1);
  const quiz = parsed.assignments[0];
  assertEquals(quiz.title, 'Quiz 3');
  assertEquals(quiz.type, 'quiz');
  assertEquals(quiz.due_at, '2026-10-10T23:59:00.000Z');
  // Identity from the base, so lifting the override updates the same task.
  assertEquals(quiz.external_id, '1102@rich.example.edu');
  assertEquals(parsed.overrides_applied, 1);
});

Deno.test('the same close is found whichever order the two events arrive in', async () => {
  const all = await read('quiz-group-override-all.ics');
  const blocks = all.split(/(?=BEGIN:VEVENT)/);
  const reversed = [blocks[0], blocks[2].replace('END:VCALENDAR\n', ''), blocks[1], 'END:VCALENDAR\n'].join('');
  assert(reversed.indexOf('Section A closes') < reversed.indexOf('Section A opens'));
  const parsed = parseMoodleCalendarFeed(await read('quiz-group-override-courses.ics'), reversed, {
    wwwroot: 'https://rich.example.edu', today: TODAY,
  });
  assertEquals(parsed.assignments[0].due_at, '2026-10-10T23:59:00.000Z');
});

Deno.test('a user override on a quiz is two events too, and has no course', () => {
  const courses = feed([
    { id: '1', summary: 'Quiz 3 opens', start: '20261002T140000Z' },
    { id: '2', summary: 'Quiz 3 closes', start: '20261009T235900Z' },
  ]);
  const all = feed([
    { id: '3', summary: 'Quiz 3 - Override opens', start: '20261007T090000Z', cat: null },
    { id: '4', summary: 'Quiz 3 - Override closes', start: '20261012T180000Z', cat: null },
  ]);
  const parsed = parse(courses, all);
  assertEquals(parsed.assignments.map((a) => [a.external_id, a.due_at]), [
    ['2@moodle.school.edu', '2026-10-12T18:00:00.000Z'],
  ]);
});

Deno.test('Spanish puts the word first, and a Spanish user override is decorated twice', () => {
  // Real strings from the es pack: quizeventopens 'Se abre {$a}', quizeventcloses
  // 'Se cierra {$a}', overrideusereventname '{$a->quiz} - Excepción'. The user
  // override therefore reads 'Se cierra Cuestionario 3 - Excepción', which
  // strips FIRST as an override and hides both the name and the close.
  const courses = feed([
    { id: '1', summary: 'Se abre Cuestionario 3', start: '20261002T140000Z', cat: 'FIS101' },
    { id: '2', summary: 'Se cierra Cuestionario 3', start: '20261009T235900Z', cat: 'FIS101' },
    { id: '5', summary: 'Se abre Cuestionario 4', start: '20261102T140000Z', cat: 'FIS101' },
    { id: '6', summary: 'Se cierra Cuestionario 4', start: '20261109T235900Z', cat: 'FIS101' },
  ]);
  const all = feed([
    // Group override on quiz 3, opening listed first.
    { id: '3', summary: 'Se abre Cuestionario 3 - Grupo A', start: '20261006T140000Z', cat: 'FIS101' },
    { id: '4', summary: 'Se cierra Cuestionario 3 - Grupo A', start: '20261010T235900Z', cat: 'FIS101' },
    // User override on quiz 4, opening listed first.
    { id: '7', summary: 'Se abre Cuestionario 4 - Excepción', start: '20261104T140000Z', cat: null },
    { id: '8', summary: 'Se cierra Cuestionario 4 - Excepción', start: '20261112T235900Z', cat: null },
  ]);
  const parsed = parse(courses, all);
  const by = new Map(parsed.assignments.map((a) => [a.title, a]));
  assertEquals(by.get('Cuestionario 3')!.due_at, '2026-10-10T23:59:00.000Z');
  assertEquals(by.get('Cuestionario 4')!.due_at, '2026-11-12T23:59:00.000Z');
  assertEquals(parsed.overrides_applied, 2);
});

Deno.test('a sibling activity is never mistaken for an override', () => {
  // 'Quiz 3 - Practice' is its own quiz. Its events start with 'Quiz 3 - ',
  // exactly like an override of 'Quiz 3' would.
  const courses = feed([
    { id: '1', summary: 'Quiz 3 opens', start: '20261002T140000Z' },
    { id: '2', summary: 'Quiz 3 closes', start: '20261009T235900Z' },
    { id: '10', summary: 'Quiz 3 - Practice opens', start: '20261001T140000Z' },
    { id: '11', summary: 'Quiz 3 - Practice closes', start: '20261020T235900Z' },
  ]);
  // Quiz 3's base is suppressed (the student holds an override whose events
  // did not make it into this window), and the practice quiz has an override
  // of its own. Neither of the practice quiz's events is Quiz 3's date.
  const all = feed([
    { id: '10', summary: 'Quiz 3 - Practice opens', start: '20261001T140000Z' },
    { id: '12', summary: 'Quiz 3 - Practice - Section A opens', start: '20261003T140000Z' },
    { id: '13', summary: 'Quiz 3 - Practice - Section A closes', start: '20261025T235900Z' },
  ]);
  const parsed = parse(courses, all);
  const by = new Map(parsed.assignments.map((a) => [a.title, a]));
  // No real override was found for Quiz 3, so it keeps its own date rather
  // than borrowing a sibling's.
  assertEquals(by.get('Quiz 3')!.due_at, '2026-10-09T23:59:00.000Z');
  // The practice quiz's override lands on the practice quiz.
  assertEquals(by.get('Quiz 3 - Practice')!.due_at, '2026-10-25T23:59:00.000Z');
  assertEquals(parsed.overrides_applied, 1);
});

Deno.test('a sibling\'s own event is never an override, even when it is all there is', () => {
  // Quiz 3 suppressed; the only 'Quiz 3 - …' close under `all` is the practice
  // quiz's own base event. It is a real activity (its UID is in `courses`).
  const courses = feed([
    { id: '2', summary: 'Quiz 3 closes', start: '20261009T235900Z' },
    { id: '11', summary: 'Quiz 3 - Practice closes', start: '20261020T235900Z' },
  ]);
  const all = feed([{ id: '11', summary: 'Quiz 3 - Practice closes', start: '20261020T235900Z' }]);
  const parsed = parse(courses, all);
  const by = new Map(parsed.assignments.map((a) => [a.title, a]));
  assertEquals(by.get('Quiz 3')!.due_at, '2026-10-09T23:59:00.000Z');
  assertEquals(parsed.overrides_applied, 0);
});

Deno.test('when an override\'s wording cannot be read, the latest date is the close', () => {
  // The base was saved in English; the override later, by a teacher working
  // in a language the table does not carry. Neither override event has a
  // recognisable kind, and of an opening and a close the close is later.
  const opens = 'Quiz 3 - Section A 開始';
  const closes = 'Quiz 3 - Section A 終了';
  assertEquals(stripMoodleEventName(opens).kind, null);
  assertEquals(stripMoodleEventName(closes).kind, null);
  const parsed = parse(
    feed([{ id: '2', summary: 'Quiz 3 closes', start: '20261009T235900Z' }]),
    feed([
      { id: '3', summary: opens, start: '20261006T140000Z' },
      { id: '4', summary: closes, start: '20261010T235900Z' },
    ]),
  );
  assertEquals(parsed.assignments[0].due_at, '2026-10-10T23:59:00.000Z');
});

Deno.test('a recognised close beats an unreadable later event', () => {
  // The latest-date fallback is a fallback: a same-kind match always wins.
  const parsed = parse(
    feed([{ id: '2', summary: 'Quiz 3 closes', start: '20261009T235900Z' }]),
    feed([
      { id: '4', summary: 'Quiz 3 - Section A closes', start: '20261010T235900Z' },
      { id: '5', summary: 'Quiz 3 - Section A 何か', start: '20261130T235900Z' },
    ]),
  );
  assertEquals(parsed.assignments[0].due_at, '2026-10-10T23:59:00.000Z');
});

Deno.test('a student\'s own calendar entry named after the activity is never its override', async () => {
  // Base 'Essay 1 is due' 10-10, suppressed under `all` because the student
  // holds a user override (10-17). Their own reminder 'Essay 1 - study group'
  // (10-20, no course) reads just like an override no pattern names, and the
  // latest-date rule used to pick it: the essay was filed as due at the study
  // group.
  const parsed = parseMoodleCalendarFeed(
    await read('assign-override-personal-courses.ics'),
    await read('assign-override-personal-all.ics'),
    { wwwroot: 'https://rich.example.edu', today: TODAY },
  );
  assertEquals(parsed.assignments.length, 1);
  const essay = parsed.assignments[0];
  assertEquals(essay.title, 'Essay 1');
  assertEquals(essay.external_id, '2101@rich.example.edu');
  assertEquals(essay.due_at, '2026-10-17T23:59:00.000Z');
  assertEquals(parsed.overrides_applied, 1);
  // The personal entry carries no course, so it is not a task of its own.
  assert(!parsed.assignments.some((a) => /study group/i.test(a.title)));
});

Deno.test('an override with no course is still used when it is the only kind there is', () => {
  // A user override can arrive without CATEGORIES (the rich pair's Essay 1 is
  // one). Preferring the course only ranks candidates; it never discards the
  // last ones standing.
  const alone = parse(
    feed([{ id: '1', summary: 'Essay 1 is due', start: '20261010T235900Z' }]),
    feed([{ id: '2', summary: 'Essay 1 - Override (Due date)', start: '20261017T235900Z', cat: null }]),
  );
  assertEquals(alone.assignments[0].due_at, '2026-10-17T23:59:00.000Z');

  // Both uncategorised: nothing tells them apart, so the latest-date rule
  // stands, exactly as it did.
  const both = parse(
    feed([{ id: '1', summary: 'Essay 1 is due', start: '20261010T235900Z' }]),
    feed([
      { id: '2', summary: 'Essay 1 - Override (Due date)', start: '20261017T235900Z', cat: null },
      { id: '3', summary: 'Essay 1 - study group', start: '20261020T180000Z', cat: null },
    ]),
  );
  assertEquals(both.assignments[0].due_at, '2026-10-20T18:00:00.000Z');

  // And a recognised same-kind close with no course still beats an unreadable
  // one that has a course: the kind is decided first.
  const quiz = parse(
    feed([{ id: '1', summary: 'Quiz 3 closes', start: '20261009T235900Z' }]),
    feed([
      { id: '2', summary: 'Quiz 3 - Override closes', start: '20261012T180000Z', cat: null },
      { id: '3', summary: 'Quiz 3 - Section A 何か', start: '20261130T235900Z' },
    ]),
  );
  assertEquals(quiz.assignments[0].due_at, '2026-10-12T18:00:00.000Z');
});

Deno.test('an override that is only an opening leaves the base date alone', () => {
  const parsed = parse(
    feed([{ id: '2', summary: 'Quiz 3 closes', start: '20261009T235900Z' }]),
    feed([{ id: '3', summary: 'Quiz 3 - Section A opens', start: '20261006T140000Z' }]),
  );
  assertEquals(parsed.assignments[0].due_at, '2026-10-09T23:59:00.000Z');
  assertEquals(parsed.overrides_applied, 0);
});

// ── events no pattern names (gap #13) ─────────────────────────────────────

Deno.test('a lecture, an attendance session or a meeting is "other", at its START', () => {
  const ics = feed([
    { id: '1', summary: 'Lecture 5: Thermodynamics', start: '20261014T140000Z', end: '20261014T153000Z' },
    { id: '2', summary: 'Attendance', start: '20261015T090000Z', end: '20261015T100000Z' },
    { id: '3', summary: 'Office hours', start: '20261016T160000Z' },
    { id: '4', summary: 'Problem Set 3 is due', start: '20261017T235900Z' },
  ]);
  const parsed = parse(ics, ics);
  const by = new Map(parsed.assignments.map((a) => [a.title, a]));
  assertEquals(by.get('Lecture 5: Thermodynamics')!.type, 'other');
  // When the lecture starts, not when it ends.
  assertEquals(by.get('Lecture 5: Thermodynamics')!.due_at, '2026-10-14T14:00:00.000Z');
  assertEquals(by.get('Attendance')!.type, 'other');
  assertEquals(by.get('Attendance')!.due_at, '2026-10-15T09:00:00.000Z');
  assertEquals(by.get('Office hours')!.type, 'other');
  // A generated activity event is untouched.
  assertEquals(by.get('Problem Set 3')!.type, 'assignment');
});

Deno.test('a patternless quiz or exam keeps its type, and a pre-3.3 quiz is still due at its close', async () => {
  const pre33 = await read('pre33-quiz.ics');
  const old = parseMoodleCalendarFeed(pre33, pre33, { wwwroot: 'https://old.example.edu', today: TODAY });
  assertEquals(old.assignments[0].type, 'quiz');
  assertEquals(old.assignments[0].due_time, '23:00:00');

  const ics = feed([
    { id: '1', summary: 'Chapter 4 Quiz', start: '20261103T080000Z', end: '20261103T230000Z' },
    { id: '2', summary: 'Examen parcial', start: '20261104T100000Z' },
  ]);
  const parsed = parse(ics, ics);
  const by = new Map(parsed.assignments.map((a) => [a.title, a]));
  assertEquals(by.get('Chapter 4 Quiz')!.type, 'quiz');
  assertEquals(by.get('Chapter 4 Quiz')!.due_time, '23:00:00');
  assertEquals(by.get('Examen parcial')!.type, 'exam');
});

Deno.test('a patternless event is due at its close only when it is a window, never because of its type', async () => {
  const ics = feed([
    // A sitting. Dated at its end, the two-hour last call fired at 10:00, an
    // hour after the exam began.
    { id: '1', summary: 'Final Exam', start: '20261210T090000Z', end: '20261210T120000Z' },
    // A three-day window with no quiz or exam in its name — a pre-3.3
    // submission window. It used to be due at its close, and must still be.
    { id: '2', summary: 'Checkpoint 2', start: '20261103T080000Z', end: '20261105T230000Z' },
    // A 90-minute lecture.
    { id: '3', summary: 'Lecture 7', start: '20261014T140000Z', end: '20261014T153000Z' },
    // An exam that is a window is due when the window closes.
    { id: '4', summary: 'Take-home midterm', start: '20261020T090000Z', end: '20261022T090000Z' },
    // A quiz is a window however short.
    { id: '5', summary: 'Chapter 4 Quiz', start: '20261103T080000Z', end: '20261103T230000Z' },
    { id: '6', summary: 'Pop Quiz', start: '20261104T100000Z', end: '20261104T101500Z' },
    // An all-day event's end is the next day, so it is never the due date.
    { id: '7', summary: 'Field trip', start: '20261110', end: '20261111' },
  ]);
  const parsed = parse(ics, ics);
  const by = new Map(parsed.assignments.map((a) => [a.title, a]));
  assertEquals(by.get('Final Exam')!.type, 'exam');
  assertEquals(by.get('Final Exam')!.due_at, '2026-12-10T09:00:00.000Z');
  assertEquals(by.get('Checkpoint 2')!.due_at, '2026-11-05T23:00:00.000Z');
  assertEquals(by.get('Lecture 7')!.due_at, '2026-10-14T14:00:00.000Z');
  assertEquals(by.get('Take-home midterm')!.type, 'exam');
  assertEquals(by.get('Take-home midterm')!.due_at, '2026-10-22T09:00:00.000Z');
  assertEquals(by.get('Chapter 4 Quiz')!.due_at, '2026-11-03T23:00:00.000Z');
  assertEquals(by.get('Pop Quiz')!.due_at, '2026-11-04T10:15:00.000Z');
  assertEquals(by.get('Field trip')!.due_date, '2026-11-10');

  // The real pre-3.3 capture is unchanged.
  const pre33 = await read('pre33-quiz.ics');
  const old = parseMoodleCalendarFeed(pre33, pre33, { wwwroot: 'https://old.example.edu', today: TODAY });
  assertEquals(old.assignments[0].due_at, '2026-11-03T23:00:00.000Z');
});

Deno.test('a hand-typed piece of work keeps its kind, as Canvas reads a titled event', () => {
  // No pattern names any of these: a teacher typed them into the course
  // calendar. Canvas's classify reads such an event by its title, and only
  // what names nothing is 'other'.
  const ics = feed([
    { id: '1', summary: 'Group project', start: '20261103T235900Z' },
    { id: '2', summary: 'Reading: Chapter 4', start: '20261104T235900Z' },
    { id: '3', summary: 'Homework 3', start: '20261105T235900Z' },
    { id: '4', summary: 'Essay 2 draft', start: '20261106T235900Z' },
    { id: '5', summary: 'Tarea 2', start: '20261107T235900Z' },
    { id: '6', summary: 'Proyecto de grupo', start: '20261108T235900Z' },
    { id: '7', summary: 'Lectura del capítulo 3', start: '20261109T235900Z' },
    // A class, however it is titled, is something to attend.
    { id: '8', summary: 'Lecture 5: Chapter 3', start: '20261110T140000Z', end: '20261110T153000Z' },
    { id: '9', summary: 'Office hours: homework help', start: '20261111T160000Z' },
    { id: '10', summary: 'Reunión de tutoría', start: '20261112T160000Z' },
    { id: '11', summary: 'Field trip', start: '20261113T090000Z' },
  ]);
  const by = new Map(parse(ics, ics).assignments.map((a) => [a.title, a.type]));
  assertEquals(by.get('Group project'), 'project');
  assertEquals(by.get('Reading: Chapter 4'), 'reading');
  assertEquals(by.get('Homework 3'), 'assignment');
  assertEquals(by.get('Essay 2 draft'), 'assignment');
  assertEquals(by.get('Tarea 2'), 'assignment');
  assertEquals(by.get('Proyecto de grupo'), 'project');
  assertEquals(by.get('Lectura del capítulo 3'), 'reading');
  assertEquals(by.get('Lecture 5: Chapter 3'), 'other');
  assertEquals(by.get('Office hours: homework help'), 'other');
  assertEquals(by.get('Reunión de tutoría'), 'other');
  // Nothing named: still 'other', as before.
  assertEquals(by.get('Field trip'), 'other');
});

Deno.test('"final" and "parcial" are an exam only when no piece of work is named', () => {
  // Generated activity events (the "X is due" pattern) and hand-typed ones.
  const ics = feed([
    { id: '1', summary: 'Final Project is due', start: '20261201T235900Z' },
    { id: '2', summary: 'Final Paper is due', start: '20261202T235900Z' },
    { id: '3', summary: 'Final Report is due', start: '20261203T235900Z' },
    { id: '4', summary: 'Vencimiento de Proyecto final', start: '20261204T235900Z' },
    { id: '5', summary: 'Vencimiento de Trabajo final', start: '20261205T235900Z' },
    { id: '6', summary: 'Vencimiento de Entrega parcial 1', start: '20261206T235900Z' },
    { id: '7', summary: 'Final paper', start: '20261207T235900Z' },
    { id: '8', summary: 'Primer parcial', start: '20261208T140000Z' },
    { id: '9', summary: 'Examen final', start: '20261209T140000Z' },
    { id: '10', summary: 'Final exam', start: '20261210T140000Z' },
    { id: '11', summary: 'Final de Química', start: '20261211T140000Z' },
  ]);
  const by = new Map(parse(ics, ics).assignments.map((a) => [a.title, a.type]));
  assertEquals(by.get('Final Project'), 'project');
  assertEquals(by.get('Final Paper'), 'assignment');
  assertEquals(by.get('Final Report'), 'assignment');
  assertEquals(by.get('Proyecto final'), 'project');
  assertEquals(by.get('Trabajo final'), 'assignment');
  assertEquals(by.get('Entrega parcial 1'), 'assignment');
  assertEquals(by.get('Final paper'), 'assignment');
  assertEquals(by.get('Primer parcial'), 'exam');
  assertEquals(by.get('Examen final'), 'exam');
  assertEquals(by.get('Final exam'), 'exam');
  assertEquals(by.get('Final de Química'), 'exam');
});

Deno.test('a hand-typed item that says it is due is work, even with a session word', () => {
  const ics = feed([
    { id: '1', summary: 'Tutorial 3 worksheet due', start: '20261103T235900Z' },
    { id: '2', summary: 'Seminar paper due', start: '20261104T235900Z' },
    { id: '3', summary: 'Lecture notes reading due', start: '20261105T235900Z' },
    { id: '4', summary: 'Tutorial 3', start: '20261106T100000Z', end: '20261106T110000Z' },
  ]);
  const by = new Map(parse(ics, ics).assignments.map((a) => [a.title, a.type]));
  assertEquals(by.get('Tutorial 3 worksheet due'), 'assignment');
  assertEquals(by.get('Seminar paper due'), 'assignment');
  assertEquals(by.get('Lecture notes reading due'), 'reading');
  // Without a due word a tutorial is still a class to attend.
  assertEquals(by.get('Tutorial 3'), 'other');
});

Deno.test('a hand-typed submission window is due when it closes, like any window', () => {
  const ics = feed([
    { id: '1', summary: 'Essay 2 draft', start: '20261103T080000Z', end: '20261105T230000Z' },
  ]);
  const essay = parse(ics, ics).assignments[0];
  assertEquals(essay.type, 'assignment');
  assertEquals(essay.due_at, '2026-11-05T23:00:00.000Z');
});

Deno.test('the rich pair\'s group meeting is "other"', async () => {
  const parsed = parseMoodleCalendarFeed(await read('rich-courses.ics'), await read('rich-all.ics'), {
    wwwroot: 'https://rich.example.edu', today: TODAY,
  });
  assertEquals(parsed.assignments.find((a) => a.title === 'Tutorial group meeting')!.type, 'other');
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

// ── a dropped connection is not a dead link (gap #7) ───────────────────────

/** What Deno actually throws when a request never completes: it quotes the URL. */
function denoSendError(url: string): Error {
  return new TypeError(`error sending request for url (${url}): client error (Connect): tcp connect error: Connection refused (os error 61)`);
}

Deno.test('a thrown fetch becomes a retryable error that quotes nothing of the link', async () => {
  const secret = 'deadbeef'.repeat(5);
  const link = `https://school.example.edu/calendar/export_execute.php?userid=7&authtoken=${secret}`;
  const impl = ((input: string | URL | Request) => Promise.reject(denoSendError(String(input)))) as unknown as typeof fetch;
  const error = await fetchMoodleCalendar(link, { fetchImpl: impl, today: TODAY }).then(
    () => { throw new Error('should have thrown'); },
    (caught) => caught,
  );
  assertEquals(error.code, 'moodle_feed_unreachable');
  // 503: retried with backoff. Never 401, which is what purges the Vault row.
  assertEquals(error.status, 503);
  assert(!error.message.includes(secret), error.message);
  assert(!/authtoken|userid|export_execute|school\.example\.edu/i.test(error.message), error.message);
  // And nothing in it reads as a credential problem to a word match.
  assert(!/reconnect|permission|unauthor|token/i.test(error.message), error.message);
});

Deno.test('a timeout and a connection dropped mid-body are the same retryable error', async () => {
  const timedOut = (() => Promise.reject(new DOMException('Signal timed out.', 'TimeoutError'))) as unknown as typeof fetch;
  await fetchMoodleCalendar(LIVE, { fetchImpl: timedOut, today: TODAY })
    .then(() => { throw new Error('should have thrown'); })
    .catch((error) => assertEquals([error.code, error.status], ['moodle_feed_unreachable', 503]));

  const dropped = (() => Promise.resolve(new Response(new ReadableStream({
    start(controller) { controller.error(denoSendError(`${LIVE}&preset_what=all`)); },
  }), { status: 200, headers: { 'content-type': 'text/calendar' } }))) as unknown as typeof fetch;
  await fetchMoodleCalendar(LIVE, { fetchImpl: dropped, today: TODAY })
    .then(() => { throw new Error('should have thrown'); })
    .catch((error) => {
      assertEquals([error.code, error.status], ['moodle_feed_unreachable', 503]);
      assert(!/authtoken/i.test(error.message));
    });
});

Deno.test('the real dead-token answer (200, text/html, "Invalid authentication") IS the dead link', async () => {
  const body = await read('invalid-auth.txt');
  assertEquals(body.trim(), 'Invalid authentication');
  const { impl } = stubFetch({ 'export_execute': { status: 200, body, headers: { 'content-type': 'text/html; charset=utf-8' } } });
  const error = await fetchMoodleCalendar(LIVE, { fetchImpl: impl, today: TODAY }).then(
    () => { throw new Error('should have thrown'); },
    (caught) => caught,
  );
  assertEquals(error.code, 'moodle_feed_expired');
  assertEquals(error.status, 401);
});

// ── a school asking Semora to wait is not a school refusing it (gap #14) ───

Deno.test('429 and every server failure are "busy", not "blocked"', async () => {
  // A 429 is a rate limit whatever the page says — Cloudflare titles its
  // rate-limit page "Access denied".
  assertEquals(classifyMoodleFeedBody(429, 'text/html', '<html><title>Access denied</title>Error 1015 You are being rate limited</html>'), 'busy');
  assertEquals(classifyMoodleFeedBody(429, 'text/plain', ''), 'busy');
  // Moodle's own maintenance page is a 503.
  assertEquals(classifyMoodleFeedBody(503, 'text/html', '<!DOCTYPE html><html><body>This site is undergoing maintenance and is currently not available</body></html>'), 'busy');
  // So is every other server failure: a crash, a gateway that lost the
  // server, a gateway that gave up waiting for it.
  assertEquals(classifyMoodleFeedBody(500, 'text/html', '<html>Internal error</html>'), 'busy');
  assertEquals(classifyMoodleFeedBody(502, 'text/plain', 'Bad gateway'), 'busy');
  assertEquals(classifyMoodleFeedBody(504, 'text/html', ''), 'busy');
  // But a firewall in under-attack mode also answers 503, and waiting does not clear it.
  assertEquals(classifyMoodleFeedBody(503, 'text/html', '<html><title>Just a moment...</title></html>'), 'blocked');
  // Unchanged: a WAF 403 is still blocked, a bad token still invalid_auth.
  assertEquals(classifyMoodleFeedBody(403, 'text/html', await read('waf-challenge.html')), 'blocked');
  assertEquals(classifyMoodleFeedBody(200, 'text/html; charset=utf-8', await read('invalid-auth.txt')), 'invalid_auth');

  const busyRoutes: Array<{ status: number; body: string; headers: Record<string, string> }> = [
    { status: 429, body: 'Too Many Requests', headers: { 'content-type': 'text/plain', 'retry-after': '120' } },
    { status: 502, body: 'Bad gateway', headers: { 'content-type': 'text/plain' } },
    { status: 504, body: '', headers: { 'content-type': 'text/html' } },
  ];
  for (const route of busyRoutes) {
    const { impl } = stubFetch({ 'export_execute': route });
    const error = await fetchMoodleCalendar(LIVE, { fetchImpl: impl, today: TODAY }).then(
      () => { throw new Error('should have thrown'); },
      (caught) => caught,
    );
    assertEquals(error.code, 'moodle_feed_busy', String(route.status));
    assertEquals(error.status, 503);
    // The connect screen offers a syllabus scan only for the two dead ends; this is not one.
    assert(!/network is blocking|turned off calendar export/i.test(error.message));
  }
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

Deno.test('Europe: the languages Moodle is actually used in, stripped by their real strings', () => {
  // Moodle's install base is heaviest in Europe, and the first version of this
  // table covered Germany, France, Italy, Spain and the Netherlands while
  // missing Portugal, every Nordic country, Greece, and all of Central and
  // Eastern Europe — which is where Moodle's share is highest of all.
  //
  // Every string below is the REAL mod/assign `calendardue` value from that
  // language's own pack, not an invention: an invented string proves nothing
  // except that the test author guessed.
  const real: Array<[string, string]> = [
    ['sv', 'Projekt 7 förfaller'],
    ['da', 'Projekt 7 skal afleveres'],
    ['fi', 'Projekt 7 on palautettava viimeistään'],
    ['pt', "Termina o prazo de 'Projekt 7'"],
    ['cs', 'Projekt 7 má být hotov do tohoto data'],
    ['el', 'Projekt 7 οφείλεται'],
    ['pl', 'Projekt 7 (termin oddania)'],
    ['uk', 'Строк Projekt 7 спливає'],
  ];
  for (const [lang, decorated] of real) {
    const stripped = stripMoodleEventName(decorated);
    assertEquals(stripped.base, 'Projekt 7', `${lang}: ${decorated} -> ${stripped.base}`);
    assertEquals(stripped.kind, 'due', `${lang} kind`);
  }
});

Deno.test('a language with no pack at all still delivers every deadline', () => {
  // The guarantee that makes the table an improvement rather than a dependency:
  // an unknown language costs a student the decoration on a title, never a
  // deadline, a date or a course. Latin, Greek and Cyrillic alike.
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2026042000//EN',
    ...[
      ['801', 'Þetta verkefni er á gjalddaga', 'ÍSL101'],
      ['802', 'Заавар 5 дуусах хугацаа', 'МОН200'],
    ].flatMap(([id, summary, cat]) => [
      'BEGIN:VEVENT', `UID:${id}@moodle.uni.eu`, `SUMMARY:${summary}`,
      `CATEGORIES:${cat}`, 'DTSTART:20261201T235900Z', 'DTEND:20261201T235900Z', 'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join('\r\n');
  const parsed = parseMoodleCalendarFeed(ics, ics, {
    wwwroot: 'https://moodle.uni.eu', today: new Date('2026-11-01T00:00:00Z'),
  });
  assertEquals(parsed.assignments.length, 2);
  assertEquals(parsed.courses.length, 2);
  for (const a of parsed.assignments) assertEquals(a.due_date, '2026-12-01');
  // The course key survives non-Latin script intact, which matters because it
  // is the key every later sync matches on.
  assertEquals(parsed.courses.map((c) => c.id).sort(), ['МОН200', 'ÍSL101'].sort());
});
