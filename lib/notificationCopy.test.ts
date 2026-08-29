/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --allow-read --config lib/deno.test.json lib/notificationCopy.test.ts
 *
 * Three kinds of case, in ascending order of how much they are worth.
 *
 * Mechanics — stages, hashing, clock rendering. Cheap and necessary.
 *
 * Kindness — every phrase in every pool against a list of things Semora must
 * never say. Enumerated from the module so a phrase added later cannot opt out.
 *
 * Integration — the section that matters most, and the one whose absence let a
 * real bug ship into review. These drive the SAME arithmetic production uses
 * (reminderTiming) from the SAME offsets the planner emits (offsetsForTask), so
 * a disagreement between a title and a body is reproducible here instead of
 * being invisible. The first version of this suite hand-supplied leadMinutes
 * and daysUntilDue as a mutually consistent pair, which is precisely the pair
 * production cannot guarantee — every untimed task was wrong and every test
 * passed.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ALL_PHRASE_POOLS,
  BUSY_DAY_THRESHOLD,
  buildClassCopy,
  buildReminderCopy,
  buildSnoozedCopy,
  clamp,
  classifyKind,
  classifyStage,
  composeBody,
  describeWhen,
  formatClock,
  pickPhrase,
  reminderTiming,
  stableHash,
  type CopyLocale,
  type ReminderCopyInput,
  type ReminderStage,
} from './notificationCopy';
import { offsetsForSingleTask } from './reminderPlan';

const base = (over: Partial<ReminderCopyInput> = {}): ReminderCopyInput => ({
  taskId: 'task-1',
  taskTitle: 'Problem Set 7',
  courseName: 'Calc II',
  leadMinutes: 60 * 24,
  daysUntilDue: 1,
  dueTime: '23:59',
  locale: 'en',
  ...over,
});

/** The production path, end to end, for one scheduled moment. */
function scheduled(
  dueDate: string,
  dueTime: string | null,
  offsetMinutes: number,
  over: Partial<ReminderCopyInput> = {},
) {
  const [year, month, day] = dueDate.split('-').map(Number);
  let hour = 9, minute = 0;
  if (dueTime) { const [h, m] = dueTime.split(':').map(Number); hour = h; minute = m; }
  const triggerDate = new Date(year, month - 1, day, hour, minute - offsetMinutes, 0);
  const { leadMinutes, daysUntilDue, dueMoment } = reminderTiming(dueDate, dueTime, triggerDate);
  const copy = buildReminderCopy(base({ leadMinutes, daysUntilDue, dueTime, ...over }));
  return { copy, leadMinutes, daysUntilDue, triggerDate, dueMoment };
}

// ── Integration: title and body may never disagree ───────────────────────────

/**
 * What each half claims about the calendar. A title that names a day and a body
 * that names a different one is the failure this exists to catch.
 */
function disagreement(title: string, body: string): string | null {
  const t = {
    today: /\btoday\b|\bhoy\b/i.test(title),
    tomorrow: /tomorrow|mañana/i.test(title),
    far: /days out|this week|plenty of runway|no rush|not yet urgent|quietly approaching|nice and early|esta semana|en unos días|sin prisa|sin hacer ruido|tiempo de sobra|con tiempo/i.test(title),
    now: /due now|vence ahora/i.test(title),
  };
  const b = {
    today: /due today|due by end of day|vence hoy/i.test(body),
    tomorrow: /due tomorrow|vence mañana/i.test(body),
    days: /due in \d+ days|vence en \d+ días/i.test(body),
    now: /due now|vence ahora/i.test(body),
  };
  if (t.today && !t.tomorrow && (b.tomorrow || b.days)) return 'title says today, body does not';
  if (t.tomorrow && (b.today || b.now)) return 'title says tomorrow, body says today/now';
  if (t.far && (b.today || b.tomorrow || b.now)) return 'title implies distance, body is imminent';
  if (t.now && !b.now) return 'title says due now, body does not';
  if (b.now && !t.now) return 'body says due now, title does not';
  return null;
}

Deno.test('REGRESSION: an untimed task on its due day is not called tomorrow', () => {
  // The exact shipped failure. The reminder anchor is 09:00 while the deadline
  // is end-of-day, so the lead carried ~15 phantom hours and the stage read
  // 'tomorrow' under a body that correctly said "due by end of day". Every
  // phrase in that pool asserts tomorrow, so this was not probabilistic.
  const { copy, leadMinutes, daysUntilDue } = scheduled('2026-09-15', null, 0, { taskType: 'reading' });
  assertEquals(daysUntilDue, 0);
  assert(leadMinutes > 12 * 60, `expected the phantom lead to still be there, got ${leadMinutes}`);
  assertEquals(classifyStage(leadMinutes, daysUntilDue), 'today');
  assert(!/tomorrow/i.test(copy.title), `title still claims tomorrow: ${copy.title}`);
  assertEquals(disagreement(copy.title, copy.body), null, `${copy.title} / ${copy.body}`);
});

Deno.test('REGRESSION: an untimed task one day before is not called next week', () => {
  const { copy, daysUntilDue } = scheduled('2026-09-15', null, 1440);
  assertEquals(daysUntilDue, 1);
  assertEquals(disagreement(copy.title, copy.body), null, `${copy.title} / ${copy.body}`);
  assert(/due tomorrow/i.test(copy.body), copy.body);
});

Deno.test('no default-ladder reminder can contradict itself', () => {
  const PRO = { reminder_same_day: true, reminder_1day: true, reminder_3day: true };
  const FREE = { reminder_same_day: true, reminder_1day: false, reminder_3day: false };
  const failures: string[] = [];
  let checked = 0;
  for (const prefs of [PRO, FREE])
  for (const type of ['assignment', 'exam', 'quiz', 'project', 'reading', 'other'])
  for (const dueTime of [null, '00:30', '08:00', '17:00', '23:59'])
  for (const dueDate of ['2026-09-15', '2026-11-02', '2026-03-10'])
  for (const locale of ['en', 'es'] as CopyLocale[])
  for (const offset of offsetsForSingleTask(type, prefs, null, dueTime ?? undefined)) {
    const { copy, triggerDate, dueMoment } = scheduled(dueDate, dueTime, offset, { taskType: type, locale });
    if (triggerDate > dueMoment) continue;   // the real guard in notifications.ts
    checked++;
    const bad = disagreement(copy.title, copy.body);
    if (bad) failures.push(`${type}/${dueTime ?? 'untimed'}/off=${offset}/${locale}: ${bad}\n    ${copy.title}\n    ${copy.body}`);
  }
  assert(checked > 200, `only ${checked} combinations exercised`);
  assertEquals(failures.length, 0, `\n  ${failures.slice(0, 6).join('\n  ')}`);
});

Deno.test('no custom Pro offset can contradict itself either', () => {
  const failures: string[] = [];
  for (const offset of [15, 30, 45, 60, 90, 120, 180, 240, 300, 420, 540, 660, 720, 900, 1080, 1260, 1440, 1800, 2160, 2880, 4320, 10080])
  for (const dueTime of [null, '00:30', '06:00', '12:00', '17:00', '23:00', '23:59'])
  for (const type of ['assignment', 'exam', 'project'])
  for (const locale of ['en', 'es'] as CopyLocale[]) {
    const { copy, triggerDate, dueMoment } = scheduled('2026-09-15', dueTime, offset, { taskType: type, locale });
    if (triggerDate > dueMoment) continue;
    const bad = disagreement(copy.title, copy.body);
    if (bad) failures.push(`off=${offset} due=${dueTime ?? 'untimed'} ${type} ${locale}: ${bad}\n    ${copy.title}\n    ${copy.body}`);
  }
  assertEquals(failures.length, 0, `\n  ${failures.slice(0, 6).join('\n  ')}`);
});

Deno.test('a quiet-hours shifted trigger is described by where it landed', () => {
  // The rung asked for a day; the student's quiet window delivered it at 08:00
  // on the due morning. Stage and body must both follow the new moment.
  const trigger = new Date(2026, 8, 15, 8, 0, 0);
  const { leadMinutes, daysUntilDue } = reminderTiming('2026-09-15', '17:00', trigger);
  const copy = buildReminderCopy(base({ leadMinutes, daysUntilDue, dueTime: '17:00' }));
  assertEquals(daysUntilDue, 0);
  assertEquals(disagreement(copy.title, copy.body), null, `${copy.title} / ${copy.body}`);
  assert(/due today at 5:00 PM/.test(copy.body), copy.body);
});

Deno.test('midnight and DST boundaries count calendar days, not divided hours', () => {
  // 2026-03-08 is a US spring-forward: that day is 23 hours long.
  assertEquals(reminderTiming('2026-03-09', null, new Date(2026, 2, 8, 9, 0)).daysUntilDue, 1);
  assertEquals(reminderTiming('2026-11-02', null, new Date(2026, 9, 1, 9, 0)).daysUntilDue, 32);
  // 23:00 the night before something due at 00:30 is tomorrow by the calendar
  // and two hours away by the clock. Urgency wins, and says nothing about days.
  const { copy, daysUntilDue } = scheduled('2026-09-15', '00:30', 120);
  assertEquals(daysUntilDue, 1);
  assertEquals(classifyStage(120, 1), 'finalStretch');
  assertEquals(disagreement(copy.title, copy.body), null, `${copy.title} / ${copy.body}`);
});

Deno.test('a busy day never outranks a deadline that has arrived', () => {
  const { copy } = scheduled('2026-09-15', '17:00', 0, { dayLoad: 9 });
  assert(/due now/i.test(copy.title), copy.title);
  assertEquals(disagreement(copy.title, copy.body), null);
});

Deno.test('busy-day wording is used only from the threshold up', () => {
  const busy = scheduled('2026-09-15', '17:00', 300, { dayLoad: BUSY_DAY_THRESHOLD }).copy;
  const quiet = scheduled('2026-09-15', '17:00', 300, { dayLoad: BUSY_DAY_THRESHOLD - 1 }).copy;
  assert(ALL_PHRASE_POOLS.BUSY_DAY.some((p) => p.en === busy.title), busy.title);
  assert(!ALL_PHRASE_POOLS.BUSY_DAY.some((p) => p.en === quiet.title), quiet.title);
  assert(busy.body.includes('Problem Set 7'), busy.body);
});

// ── Stage mechanics ──────────────────────────────────────────────────────────

Deno.test('urgency outranks the calendar; the calendar decides the rest', () => {
  assertEquals(classifyStage(0, 0), 'dueNow');
  assertEquals(classifyStage(15, 5), 'dueNow');        // 15 min away, whatever the date says
  assertEquals(classifyStage(16, 0), 'finalStretch');
  assertEquals(classifyStage(180, 1), 'finalStretch'); // tomorrow by date, 3h by clock
  assertEquals(classifyStage(181, 0), 'today');
  assertEquals(classifyStage(900, 0), 'today');        // the untimed case that used to break
  assertEquals(classifyStage(181, 1), 'tomorrow');
  assertEquals(classifyStage(2340, 1), 'tomorrow');    // the other untimed case
  assertEquals(classifyStage(3000, 2), 'thisWeek');
  assertEquals(classifyStage(9000, 4), 'thisWeek');
  assertEquals(classifyStage(9000, 5), 'earlyHeadsUp');
});

Deno.test('a high-priority task is toned as an exam whatever its type says', () => {
  assertEquals(classifyKind('assignment', 'high'), 'exam');
  assertEquals(classifyKind('reading', 'high'), 'exam');
  assertEquals(classifyKind('quiz', null), 'quiz');
  assertEquals(classifyKind(null, null), 'assignment');
  assertEquals(classifyKind('PROJECT', 'normal'), 'project');
});

// ── Variety: real, and stable ────────────────────────────────────────────────

Deno.test('every pool offers a genuine choice', () => {
  for (const [name, pool] of Object.entries(ALL_PHRASE_POOLS)) {
    assert(pool.length >= 3, `${name} has only ${pool.length} phrases`);
    assertEquals(new Set(pool.map((p) => p.en)).size, pool.length, `${name} repeats English`);
    assertEquals(new Set(pool.map((p) => p.es)).size, pool.length, `${name} repeats Spanish`);
  }
});

Deno.test('a hundred tasks at one stage spread across the pool', () => {
  const titles = new Set<string>();
  for (let i = 0; i < 100; i++) titles.add(buildReminderCopy(base({ taskId: `task-${i}` })).title);
  assertEquals(titles.size, ALL_PHRASE_POOLS.TOMORROW.length, `only ${titles.size} of 8 reached`);
});

Deno.test('the same task at the same stage always reads the same', () => {
  const first = buildReminderCopy(base());
  for (let i = 0; i < 50; i++) {
    const again = buildReminderCopy(base());
    assertEquals(again.title, first.title);
    assertEquals(again.body, first.body);
  }
});

Deno.test('selection ignores anything that moves within a stage', () => {
  assertEquals(
    buildReminderCopy(base({ leadMinutes: 24 * 60 })).title,
    buildReminderCopy(base({ leadMinutes: 25 * 60 })).title,
  );
});

Deno.test('SHARED POOLS: two stages drawing the same pool can never collide', () => {
  // The previous suite checked a generic assignment, whose five stages use five
  // different pools, so it passed without exercising this at all. Exams draw
  // EXAM_EARLY at both 'thisWeek' and 'earlyHeadsUp' and EXAM_SOON at both
  // 'tomorrow' and 'finalStretch'; busy days draw BUSY_DAY at both 'today' and
  // 'finalStretch'. Measured collision before the fix was 20%.
  const cases: Array<[string, ReminderStage[], Partial<ReminderCopyInput>]> = [
    ['exam early', ['thisWeek', 'earlyHeadsUp'], { taskType: 'exam' }],
    ['exam soon', ['tomorrow', 'finalStretch'], { taskType: 'exam' }],
    ['quiz soon', ['tomorrow', 'finalStretch'], { taskType: 'quiz' }],
    ['project early', ['thisWeek', 'earlyHeadsUp'], { taskType: 'project' }],
    ['busy', ['today', 'finalStretch'], { dayLoad: 5 }],
  ];
  const leadFor: Record<ReminderStage, [number, number]> = {
    dueNow: [0, 0], finalStretch: [120, 0], today: [400, 0],
    tomorrow: [1000, 1], thisWeek: [3000, 3], earlyHeadsUp: [9000, 6],
  };
  for (const [label, stages, over] of cases) {
    for (let i = 0; i < 3000; i++) {
      const taskId = `task-${i}-${label}`;
      const titles = stages.map((st) => {
        const [leadMinutes, daysUntilDue] = leadFor[st];
        return buildReminderCopy(base({ taskId, leadMinutes, daysUntilDue, ...over })).title;
      });
      assertEquals(new Set(titles).size, titles.length, `${label} repeated for ${taskId}: ${titles.join(' | ')}`);
    }
  }
});

Deno.test('one task reads differently at every rung of a full ladder', () => {
  const rungs: Array<[number, number]> = [[9000, 6], [3000, 3], [1000, 1], [120, 0], [0, 0]];
  for (const type of ['assignment', 'exam', 'project', 'quiz', 'reading']) {
    const titles = rungs.map(([leadMinutes, daysUntilDue]) =>
      buildReminderCopy(base({ taskId: 'ladder-1', taskType: type, leadMinutes, daysUntilDue })).title);
    assertEquals(new Set(titles).size, titles.length, `${type}: ${titles.join(' | ')}`);
  }
});

Deno.test('the hash is stable, unsigned and well spread', () => {
  assertEquals(stableHash(''), 0x811c9dc5);
  assert(stableHash('a') !== stableHash('b'));
  for (const s of ['', 'x'.repeat(500), '任务-🎯-1', 'tâche-é']) {
    const h = stableHash(s);
    assert(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, `${s} -> ${h}`);
  }
  const pool = ['a', 'b', 'c'] as const;
  for (let i = 0; i < 200; i++) assert(pool.includes(pickPhrase(pool, `seed-${i}`)));
  // The step must not push the index out of range.
  for (let step = 0; step < 20; step++) assert(pool.includes(pickPhrase(pool, 'x', step)));
});

// ── Bodies ───────────────────────────────────────────────────────────────────

Deno.test('the deadline is never the part that gets truncated', () => {
  const long = composeBody(
    'Week 6 Discussion Board Post — Initial Response and Two Peer Replies',
    'Introduction to Comparative Politics',
    'due today at 5:00 PM',
  );
  // The guarantee that matters is not total length — iOS will truncate a long
  // body regardless — but that the deadline clause sits ENTIRELY inside the
  // ~100 characters a two-line lock-screen body shows. Before this change it
  // began at character 110 of 117.
  const when = 'due today at 5:00 PM';
  const deadlineEnd = long.indexOf(when) + when.length;
  assert(long.indexOf(when) >= 0, `deadline missing: ${long}`);
  assert(deadlineEnd <= 100, `deadline ends at ${deadlineEnd}: ${long}`);
  // And the course, being last, is the only thing that may fall off the end.
  assert(long.lastIndexOf('Introduction') > long.indexOf(when), long);
});

Deno.test('the deadline stays visible for every realistic name length', () => {
  const titles = [
    'Quiz 3',
    'Week 6 Discussion Board Post — Initial Response and Two Peer Replies',
    'Final Research Paper Draft (with annotated bibliography and peer feedback)',
    'A'.repeat(200),
  ];
  const courses = ['', 'Calc II', 'Introduction to Comparative Politics', 'B'.repeat(120)];
  const whens = ['due now', 'due today at 5:00 PM', 'due tomorrow at 11:59 PM', 'due in 3 days', 'vence mañana a las 23:59'];
  for (const t of titles) for (const c of courses) for (const w of whens) {
    const body = composeBody(t, c, w);
    const end = body.indexOf(w) + w.length;
    assert(body.includes(w), `deadline missing: ${body}`);
    assert(end <= 100, `deadline ends at ${end} for ${t.length}/${c.length}: ${body}`);
    assert(!body.includes(' ·  · '), `doubled separator: ${body}`);
  }
});

Deno.test('a missing course is dropped, never rendered as an empty segment', () => {
  assertEquals(composeBody('Problem Set 7', '', 'due now'), 'Problem Set 7 · due now');
  assertEquals(composeBody('Problem Set 7', '   ', 'due now'), 'Problem Set 7 · due now');
  assert(!composeBody('Problem Set 7', '', 'due now').includes(' ·  · '));
});

Deno.test('a missing task title still names something', () => {
  assert(composeBody('', 'Calc II', 'due now').startsWith('Task · due now'));
});

Deno.test('clamping trims on a word boundary and marks the cut', () => {
  assertEquals(clamp('Problem Set 7', 60), 'Problem Set 7');
  const cut = clamp('Week 6 Discussion Board Post — Initial Response and Two Peer Replies', 60);
  assert(cut.endsWith('…') && cut.length <= 60, cut);
  assert(!cut.endsWith(' …'), cut);
});

Deno.test('every body carries the task and a when, in both languages', () => {
  for (const locale of ['en', 'es'] as CopyLocale[])
  for (const [dueTime, offset] of [[null, 0], [null, 1440], ['17:00', 0], ['17:00', 120], ['17:00', 4320]] as [string | null, number][]) {
    const { copy } = scheduled('2026-09-15', dueTime, offset, { locale });
    assert(copy.body.includes('Problem Set 7'), copy.body);
    assert(/due|vence/i.test(copy.body), copy.body);
    assert(copy.title.length > 0);
    assert(copy.title.length <= 44, `title too long for a lock screen: ${copy.title}`);
  }
});

Deno.test('clock times are rendered the way each language reads them', () => {
  assertEquals(formatClock('17:05', 'en'), '5:05 PM');
  assertEquals(formatClock('17:05', 'es'), '17:05');
  assertEquals(formatClock('00:30', 'en'), '12:30 AM');
  assertEquals(formatClock('12:00', 'en'), '12:00 PM');
});

Deno.test('the when clause follows the calendar', () => {
  assertEquals(describeWhen('tomorrow', 1, '17:00', 'en'), 'due tomorrow at 5:00 PM');
  assertEquals(describeWhen('thisWeek', 3, null, 'en'), 'due in 3 days');
  assertEquals(describeWhen('thisWeek', 3, null, 'es'), 'vence en 3 días');
  assertEquals(describeWhen('today', 0, null, 'en'), 'due by end of day');
  assertEquals(describeWhen('today', 0, null, 'es'), 'vence hoy');
  assertEquals(describeWhen('dueNow', 0, '17:00', 'es'), 'vence ahora');
});

// ── Urgency ──────────────────────────────────────────────────────────────────

Deno.test('a due-now notification says so in its title, in both languages', () => {
  for (let i = 0; i < 40; i++) {
    for (const locale of ['en', 'es'] as CopyLocale[]) {
      const copy = buildReminderCopy(base({ taskId: `t${i}`, leadMinutes: 0, daysUntilDue: 0, locale }));
      assert(/due now|vence ahora/i.test(copy.title), `${locale}: ${copy.title}`);
    }
  }
});

// ── Kindness ─────────────────────────────────────────────────────────────────

const FORBIDDEN = [
  'lazy', 'procrastinat', 'forgot', 'forget', 'careless', 'sloppy', 'irresponsible',
  'stupid', 'dumb', 'failure', 'slacking', 'excuse',
  'again?', 'still not', "haven't you", 'why have', 'you should have', 'you were supposed',
  'shame', 'guilt', 'disappoint', 'embarrass', 'pathetic', 'blew it', 'messed up', 'oops',
  'doomed', 'hopeless', 'panic', 'disaster', 'too late', 'you will fail', 'good luck surviving',
  'survive',
  'vago', 'perezos', 'procrastin', 'olvidaste', 'olvidado', 'descuidad', 'irresponsable',
  'estúpid', 'tonto', 'vergüenza', 'culpa', 'decepcion', 'fracas', 'desastre', 'sin remedio',
  'otra vez?', 'deberías haber', 'demasiado tarde',
  // Vulgar in most of Latin America, and localeTag() is es-US.
  'coge', 'cojan', 'cogiendo',
];

Deno.test('no phrase anywhere characterises, shames or threatens the student', () => {
  for (const [name, pool] of Object.entries(ALL_PHRASE_POOLS)) {
    for (const phrase of pool) {
      for (const locale of ['en', 'es'] as const) {
        const text = phrase[locale].toLowerCase();
        for (const banned of FORBIDDEN) {
          assert(!text.includes(banned), `${name} [${locale}] contains "${banned}": ${phrase[locale]}`);
        }
      }
    }
  }
});

Deno.test('past-deadline copy is supportive, accurate and points forward', () => {
  const copy = buildSnoozedCopy(base({ leadMinutes: -120, daysUntilDue: 0 }));
  assert(copy.body.includes('Problem Set 7'), copy.body);
  assert(/deadline|past|late|fecha|pasó/i.test(copy.body), copy.body);
  assert(/still|can|counts/i.test(copy.body), copy.body);
  for (const phrase of ALL_PHRASE_POOLS.PAST_DEADLINE_BODY) {
    assert(!/you (forgot|missed|failed|ignored)/i.test(phrase.en), phrase.en);
    assert(!/(olvidaste|fallaste|ignoraste)/i.test(phrase.es), phrase.es);
  }
});

// ── Localization ─────────────────────────────────────────────────────────────

Deno.test('every phrase exists in both languages and differs between them', () => {
  let count = 0;
  for (const [name, pool] of Object.entries(ALL_PHRASE_POOLS)) {
    for (const phrase of pool) {
      count++;
      assert(phrase.en.trim().length > 0, `${name} has an empty en`);
      assert(phrase.es.trim().length > 0, `${name} has an empty es: "${phrase.en}"`);
      assert(phrase.es !== phrase.en, `${name} left "${phrase.en}" untranslated`);
    }
  }
  assert(count >= 80, `only ${count} phrases`);
});

Deno.test('the same task picks the same slot in either language', () => {
  const en = buildReminderCopy(base({ locale: 'en' })).title;
  const es = buildReminderCopy(base({ locale: 'es' })).title;
  assertEquals(
    ALL_PHRASE_POOLS.TOMORROW.findIndex((p) => p.en === en),
    ALL_PHRASE_POOLS.TOMORROW.findIndex((p) => p.es === es),
  );
});

// ── Class reminders ──────────────────────────────────────────────────────────

Deno.test('a class reminder keeps the course in the title and the room in the body', () => {
  const copy = buildClassCopy({
    meetingId: 'm-1', courseName: 'Biology 101',
    factualBody: 'starts in 1 hour · Room 214', leadMinutes: 60, locale: 'en',
  });
  assert(copy.title.includes('Biology 101'), copy.title);
  assert(copy.body.includes('Room 214') && copy.body.includes('starts in 1 hour'), copy.body);
});

Deno.test('inside half an hour a class reminder is nothing but the facts', () => {
  assertEquals(
    buildClassCopy({ meetingId: 'm-1', courseName: 'B', factualBody: 'starts in 15 min · Room 214', leadMinutes: 15, locale: 'en' }).body,
    'starts in 15 min · Room 214',
  );
});

Deno.test('a class reads the same way every week, and classes differ from each other', () => {
  const one = () => buildClassCopy({ meetingId: 'm-1', courseName: 'A', factualBody: 'x', leadMinutes: 60, locale: 'en' }).body;
  assertEquals(one(), one());
  const many = new Set(Array.from({ length: 30 }, (_, i) =>
    buildClassCopy({ meetingId: `m-${i}`, courseName: 'A', factualBody: 'x', leadMinutes: 60, locale: 'en' }).body));
  assert(many.size >= 4, `only ${many.size} distinct class lead-ins`);
});

// ── Snooze ───────────────────────────────────────────────────────────────────

Deno.test('a snooze landing before the deadline is an ordinary reminder', () => {
  assertEquals(
    buildSnoozedCopy(base({ leadMinutes: 3 * 60, daysUntilDue: 0 })),
    buildReminderCopy(base({ leadMinutes: 3 * 60, daysUntilDue: 0 })),
  );
});

Deno.test('a snooze landing exactly on the deadline is due, not late', () => {
  const copy = buildSnoozedCopy(base({ leadMinutes: 0, daysUntilDue: 0 }));
  assert(/due now/i.test(copy.title), copy.title);
});

Deno.test('two same-day rungs of one task do not read identically', () => {
  // An untimed task on the free tier fires at 09:00 (offset 0) and again at
  // 19:00 (offset -600). Both are stage 'today' for the same task, so without a
  // discriminator the student read the same sentence twice in one day.
  for (let i = 0; i < 2000; i++) {
    const shared = { taskId: `dup-${i}`, taskTitle: 'Reading Response', courseName: 'History 210', dueTime: null };
    const morning = buildReminderCopy(base({ ...shared, leadMinutes: 900, daysUntilDue: 0, rungOffsetMinutes: 0 }));
    const evening = buildReminderCopy(base({ ...shared, leadMinutes: 300, daysUntilDue: 0, rungOffsetMinutes: -600 }));
    assert(morning.title !== evening.title, `same title twice on ${shared.taskId}: ${morning.title}`);
  }
});

Deno.test('the evening rung is still stable across reschedules', () => {
  const one = () => buildReminderCopy(base({ leadMinutes: 300, daysUntilDue: 0, dueTime: null, rungOffsetMinutes: -600 })).title;
  assertEquals(one(), one());
});

Deno.test('past-deadline copy reads as a sentence, not a dangling fragment', () => {
  const copy = buildSnoozedCopy(base({ leadMinutes: -60, daysUntilDue: 0 }));
  assert(/Problem Set 7 · Calc II — /.test(copy.body), copy.body);
  assert(!/ · Calc II$/.test(copy.body), `course dangles after the sentence: ${copy.body}`);
  assertEquals(buildSnoozedCopy(base({ leadMinutes: -60, daysUntilDue: 0, courseName: '' })).body.includes(' · '), false);
});

Deno.test('a snooze landing after the deadline changes what it says, and stays stable', () => {
  const after = buildSnoozedCopy(base({ leadMinutes: -60, daysUntilDue: 0 }));
  assert(!/due now/i.test(after.title), after.title);
  // Snoozing repeatedly must not rewrite it each time.
  assertEquals(after.title, buildSnoozedCopy(base({ leadMinutes: -600, daysUntilDue: 0 })).title);
  assertEquals(after.title, buildSnoozedCopy(base({ leadMinutes: -1440, daysUntilDue: -1 })).title);
});

// ── Runtime surface ──────────────────────────────────────────────────────────

Deno.test('the module imports nothing at all', async () => {
  const source = await Deno.readTextFile(new URL('./notificationCopy.ts', import.meta.url));
  assertEquals((source.match(/^\s*import\s/gm) ?? []).length, 0, 'notificationCopy.ts grew an import');
  assert(!/Platform\.OS/.test(source), 'notificationCopy.ts branched on platform');
});
