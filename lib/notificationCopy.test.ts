/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/notificationCopy.test.ts
 *
 * Two kinds of case here, and the second matters more.
 *
 * The first kind checks the mechanics: stages follow the clock, bodies always
 * carry the task, the course and a when, Spanish comes out when Spanish goes in.
 *
 * The second kind checks that Semora is kind. Those cases walk every phrase in
 * every pool against a list of things the product must never say to a student
 * about their own work. They are deliberately written so that adding a new
 * phrase cannot opt out of the check — the pools are enumerated from the module,
 * not restated here — because the failure mode being guarded against is not a
 * bug in this file, it is a future edit made in a hurry to a copy table that
 * looked harmless.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ALL_PHRASE_POOLS,
  BUSY_DAY_THRESHOLD,
  buildClassCopy,
  buildReminderCopy,
  buildSnoozedCopy,
  classifyKind,
  classifyStage,
  describeWhen,
  formatClock,
  humanLead,
  pickPhrase,
  stableHash,
  type CopyLocale,
  type ReminderCopyInput,
} from './notificationCopy';

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

// ── 1. Tone follows the clock ────────────────────────────────────────────────

Deno.test('stages are ordered by how close the deadline actually is', () => {
  assertEquals(classifyStage(0), 'dueNow');
  assertEquals(classifyStage(15), 'dueNow');
  assertEquals(classifyStage(16), 'finalStretch');
  assertEquals(classifyStage(180), 'finalStretch');
  assertEquals(classifyStage(181), 'today');
  assertEquals(classifyStage(12 * 60), 'today');
  assertEquals(classifyStage(12 * 60 + 1), 'tomorrow');
  assertEquals(classifyStage(30 * 60), 'tomorrow');
  assertEquals(classifyStage(30 * 60 + 1), 'thisWeek');
  assertEquals(classifyStage(4 * 24 * 60), 'thisWeek');
  assertEquals(classifyStage(4 * 24 * 60 + 1), 'earlyHeadsUp');
  assertEquals(classifyStage(10080), 'earlyHeadsUp');
});

Deno.test('a reminder pushed later by quiet hours is described by where it lands', () => {
  // The rung asked for a day's warning; quiet hours delivered ten hours. The
  // copy must describe ten hours, not a day — this is the disagreement the
  // module exists to make impossible.
  const shifted = buildReminderCopy(base({ leadMinutes: 10 * 60, daysUntilDue: 0 }));
  assert(/due today/.test(shifted.body), shifted.body);
  assert(!/tomorrow/i.test(shifted.title), shifted.title);
});

Deno.test('a high-priority task is toned as an exam whatever its type says', () => {
  assertEquals(classifyKind('assignment', 'high'), 'exam');
  assertEquals(classifyKind('reading', 'high'), 'exam');
  assertEquals(classifyKind('quiz', null), 'quiz');
  assertEquals(classifyKind(null, null), 'assignment');
  assertEquals(classifyKind('PROJECT', 'normal'), 'project');
});

// ── 2. Variety is real ───────────────────────────────────────────────────────

Deno.test('every pool offers a genuine choice', () => {
  for (const [name, pool] of Object.entries(ALL_PHRASE_POOLS)) {
    assert(pool.length >= 3, `${name} has only ${pool.length} phrases`);
    const en = new Set(pool.map((p) => p.en));
    assertEquals(en.size, pool.length, `${name} repeats an English phrase`);
  }
});

Deno.test('a hundred students on the same stage do not read the same sentence', () => {
  const titles = new Set<string>();
  for (let i = 0; i < 100; i++) {
    titles.add(buildReminderCopy(base({ taskId: `task-${i}` })).title);
  }
  // The tomorrow pool has 8 entries; with a decent hash a hundred ids should
  // reach nearly all of them. Anything under half would mean the seed is not
  // actually spreading.
  assert(titles.size >= 5, `only ${titles.size} distinct titles across 100 tasks`);
});

Deno.test('one task reads differently at each rung of its own ladder', () => {
  const stages: Array<Partial<ReminderCopyInput>> = [
    { leadMinutes: 7 * 24 * 60, daysUntilDue: 7 },
    { leadMinutes: 3 * 24 * 60, daysUntilDue: 3 },
    { leadMinutes: 24 * 60, daysUntilDue: 1 },
    { leadMinutes: 2 * 60, daysUntilDue: 0 },
    { leadMinutes: 0, daysUntilDue: 0 },
  ];
  const titles = stages.map((s) => buildReminderCopy(base(s)).title);
  assertEquals(new Set(titles).size, titles.length, `repeated a title: ${titles.join(' | ')}`);
});

// ── 3. Variety is stable ─────────────────────────────────────────────────────

Deno.test('the same task at the same stage always reads the same', () => {
  // rescheduleAllTaskReminders cancels and rebuilds every reminder on app open,
  // timezone change and Pro activation. If this ever stops holding, a student
  // sees notification copy rewrite itself several times a day.
  const first = buildReminderCopy(base());
  for (let i = 0; i < 50; i++) {
    const again = buildReminderCopy(base());
    assertEquals(again.title, first.title);
    assertEquals(again.body, first.body);
  }
});

Deno.test('selection depends on nothing that moves', () => {
  // Same task, same stage, different absolute lead inside the stage — the
  // reconciliation can re-derive a slightly different lead after a clock or
  // timezone change, and that must not repick the phrase.
  const a = buildReminderCopy(base({ leadMinutes: 24 * 60 }));
  const b = buildReminderCopy(base({ leadMinutes: 25 * 60 }));
  assertEquals(a.title, b.title);
});

Deno.test('the hash is stable across engines and inputs', () => {
  assertEquals(stableHash(''), 0x811c9dc5);
  assertEquals(stableHash('task-1|tomorrow|solo'), stableHash('task-1|tomorrow|solo'));
  assert(stableHash('a') !== stableHash('b'));
});

Deno.test('pickPhrase stays inside the pool', () => {
  const pool = ['a', 'b', 'c'] as const;
  for (let i = 0; i < 200; i++) {
    assert(pool.includes(pickPhrase(pool, `seed-${i}`)));
  }
});

// ── 4. The facts survive the personality ─────────────────────────────────────

Deno.test('every body carries the task, the course and a when', () => {
  const leads = [0, 10, 90, 60 * 5, 60 * 20, 60 * 40, 60 * 24 * 3, 60 * 24 * 9];
  for (const locale of ['en', 'es'] as CopyLocale[]) {
    for (const leadMinutes of leads) {
      const copy = buildReminderCopy(base({ leadMinutes, locale, daysUntilDue: Math.floor(leadMinutes / 1440) }));
      assert(copy.body.includes('Problem Set 7'), copy.body);
      assert(copy.body.includes('Calc II'), copy.body);
      assert(copy.title.length > 0 && copy.body.length > 0);
      // Something time-bearing, always.
      assert(/due|vence/i.test(copy.body), copy.body);
    }
  }
});

Deno.test('clock times are rendered the way each language reads them', () => {
  assertEquals(formatClock('17:05', 'en'), '5:05 PM');
  assertEquals(formatClock('17:05', 'es'), '17:05');
  assertEquals(formatClock('00:30', 'en'), '12:30 AM');
  assertEquals(formatClock('12:00', 'en'), '12:00 PM');
  assertEquals(formatClock('09:00', 'en'), '9:00 AM');
});

Deno.test('the when clause matches the calendar, not the arithmetic', () => {
  // 30 hours out can be either tomorrow or the day after depending on the hour,
  // which is why daysUntilDue is counted rather than divided.
  assertEquals(describeWhen('tomorrow', 30 * 60, 1, '17:00', 'en'), 'due tomorrow at 5:00 PM');
  assertEquals(describeWhen('tomorrow', 30 * 60, 2, null, 'en'), 'due in 1 day');
  assertEquals(describeWhen('today', 5 * 60, 0, '23:59', 'en'), 'due today at 11:59 PM');
  assertEquals(describeWhen('today', 5 * 60, 0, null, 'en'), 'due by end of day');
  assertEquals(describeWhen('dueNow', 0, 0, '17:00', 'en'), 'due now');
  assertEquals(describeWhen('dueNow', 0, 0, '17:00', 'es'), 'vence ahora');
  assertEquals(describeWhen('today', 5 * 60, 0, null, 'es'), 'vence hoy');
});

Deno.test('lead times are rounded to something a lock screen can be read at', () => {
  assertEquals(humanLead(45, 'en'), '45 min');
  assertEquals(humanLead(60, 'en'), '1 hour');
  assertEquals(humanLead(150, 'en'), '3 hours');
  assertEquals(humanLead(60 * 24, 'en'), '1 day');
  assertEquals(humanLead(60 * 24 * 3, 'en'), '3 days');
  assertEquals(humanLead(60 * 24 * 3, 'es'), '3 días');
});

// ── 5. Urgent stays unmistakable ─────────────────────────────────────────────

Deno.test('a due-now notification says so in its title, in both languages', () => {
  for (let i = 0; i < 40; i++) {
    const en = buildReminderCopy(base({ taskId: `t${i}`, leadMinutes: 0, daysUntilDue: 0 }));
    assert(/due now/i.test(en.title), `en title lost the urgency: ${en.title}`);
    const es = buildReminderCopy(base({ taskId: `t${i}`, leadMinutes: 0, daysUntilDue: 0, locale: 'es' }));
    assert(/vence ahora/i.test(es.title), `es title lost the urgency: ${es.title}`);
  }
});

Deno.test('a busy day never outranks a deadline that has arrived', () => {
  const copy = buildReminderCopy(base({ leadMinutes: 0, daysUntilDue: 0, dayLoad: 9 }));
  assert(/due now/i.test(copy.title), copy.title);
});

// ── 6. Semora is on the student's side ───────────────────────────────────────

/**
 * Things Semora must never say to a student about their own work.
 *
 * Two rules behind the list. Nothing may characterise the student — their
 * effort, memory, character, intelligence or record. And nothing may threaten:
 * a deadline is a fact, not a consequence being held over someone.
 */
const FORBIDDEN = [
  // characterising the student
  'lazy', 'procrastinat', 'forgot', 'forget', 'careless', 'sloppy', 'irresponsible',
  'stupid', 'dumb', 'failure', 'slacking', 'excuse',
  'again?', 'still not', "haven't you", 'why have', 'you should have', 'you were supposed',
  // shame and guilt
  'shame', 'guilt', 'disappoint', 'embarrass', 'pathetic', 'blew it', 'messed up', 'oops',
  // threat and alarm
  'doomed', 'hopeless', 'panic', 'disaster', 'too late', 'you will fail', 'good luck surviving',
  'survive',
  // spanish equivalents
  'vago', 'perezos', 'procrastin', 'olvidaste', 'olvidado', 'descuidad', 'irresponsable',
  'estúpid', 'tonto', 'vergüenza', 'culpa', 'decepcion', 'fracas', 'desastre', 'sin remedio',
  'otra vez?', 'deberías haber', 'demasiado tarde',
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

Deno.test('past-deadline copy is supportive and points forward', () => {
  const copy = buildSnoozedCopy(base({ leadMinutes: -120, daysUntilDue: 0 }));
  assert(copy.body.includes('Problem Set 7'), copy.body);
  assert(copy.body.includes('Calc II'), copy.body);
  // It must say the deadline passed — softening that into nothing would be its
  // own failure — and it must say the work is still worth doing.
  assert(/deadline|past|late/i.test(copy.body), copy.body);
  assert(/still|can|counts/i.test(copy.body), copy.body);
});

Deno.test('past-deadline copy never implies the student caused it', () => {
  // Every line describes the deadline as the actor, not the student.
  for (const phrase of ALL_PHRASE_POOLS.PAST_DEADLINE_BODY) {
    assert(!/you (forgot|missed|failed|ignored)/i.test(phrase.en), phrase.en);
    assert(!/(olvidaste|fallaste|ignoraste)/i.test(phrase.es), phrase.es);
  }
});

Deno.test('busy-day copy acknowledges the load and asks for one thing', () => {
  const copy = buildReminderCopy(base({ leadMinutes: 5 * 60, daysUntilDue: 0, dayLoad: BUSY_DAY_THRESHOLD }));
  // Asserted against the pool rather than a hand-written regex, which drifts
  // out of date the moment someone adds a phrase.
  assert(
    ALL_PHRASE_POOLS.BUSY_DAY.some((p) => p.en === copy.title),
    `busy title came from the wrong pool: ${copy.title}`,
  );
  // And it still tells them which task.
  assert(copy.body.includes('Problem Set 7'), copy.body);
});

Deno.test('a quiet day is not described as busy', () => {
  const copy = buildReminderCopy(base({ leadMinutes: 5 * 60, daysUntilDue: 0, dayLoad: BUSY_DAY_THRESHOLD - 1 }));
  assert(!/busy|stacked|full day/i.test(copy.title), copy.title);
});

// ── 7. Localization ──────────────────────────────────────────────────────────

Deno.test('every phrase exists in both languages', () => {
  for (const [name, pool] of Object.entries(ALL_PHRASE_POOLS)) {
    for (const phrase of pool) {
      assert(phrase.en.trim().length > 0, `${name} has an empty en`);
      assert(phrase.es.trim().length > 0, `${name} has an empty es: "${phrase.en}"`);
      // A Spanish string identical to the English one is almost always a
      // forgotten translation rather than a deliberate loanword.
      assert(phrase.es !== phrase.en, `${name} left "${phrase.en}" untranslated`);
    }
  }
});

Deno.test('asking in Spanish returns Spanish', () => {
  const es = buildReminderCopy(base({ locale: 'es' }));
  const en = buildReminderCopy(base({ locale: 'en' }));
  assert(es.title !== en.title, 'Spanish title fell back to English');
  assert(/vence/.test(es.body), es.body);
});

Deno.test('the same task picks the same phrase in either language', () => {
  // Selection is on the seed, not the rendered string, so a student switching
  // language sees a translation of what they had rather than a different line.
  const poolIndexEn = ALL_PHRASE_POOLS.TOMORROW.findIndex(
    (p) => p.en === buildReminderCopy(base({ locale: 'en' })).title,
  );
  const poolIndexEs = ALL_PHRASE_POOLS.TOMORROW.findIndex(
    (p) => p.es === buildReminderCopy(base({ locale: 'es' })).title,
  );
  assertEquals(poolIndexEn, poolIndexEs);
});

// ── 8. Class reminders ───────────────────────────────────────────────────────

Deno.test('a class reminder keeps the course in the title and the room in the body', () => {
  const copy = buildClassCopy({
    meetingId: 'm-1', courseName: 'Biology 101',
    factualBody: 'starts in 1 hour · Room 214', leadMinutes: 60, locale: 'en',
  });
  assert(copy.title.includes('Biology 101'), copy.title);
  assert(copy.body.includes('Room 214'), copy.body);
  assert(copy.body.includes('starts in 1 hour'), copy.body);
});

Deno.test('inside half an hour a class reminder is nothing but the facts', () => {
  const copy = buildClassCopy({
    meetingId: 'm-1', courseName: 'Biology 101',
    factualBody: 'starts in 15 min · Room 214', leadMinutes: 15, locale: 'en',
  });
  assertEquals(copy.body, 'starts in 15 min · Room 214');
});

Deno.test('a class reads the same way every week', () => {
  // The trigger repeats and iOS re-arms it with the content it was given, so
  // the seed is the meeting. Two different classes should still differ.
  const one = buildClassCopy({
    meetingId: 'm-1', courseName: 'A', factualBody: 'x', leadMinutes: 60, locale: 'en',
  });
  const oneAgain = buildClassCopy({
    meetingId: 'm-1', courseName: 'A', factualBody: 'x', leadMinutes: 60, locale: 'en',
  });
  assertEquals(one.body, oneAgain.body);
  const many = new Set(
    Array.from({ length: 30 }, (_, i) =>
      buildClassCopy({
        meetingId: `m-${i}`, courseName: 'A', factualBody: 'x', leadMinutes: 60, locale: 'en',
      }).body),
  );
  assert(many.size >= 3, `only ${many.size} distinct class lead-ins`);
});

// ── 9. Snooze ────────────────────────────────────────────────────────────────

Deno.test('a snooze that lands before the deadline is an ordinary reminder', () => {
  const copy = buildSnoozedCopy(base({ leadMinutes: 3 * 60, daysUntilDue: 0 }));
  assertEquals(copy, buildReminderCopy(base({ leadMinutes: 3 * 60, daysUntilDue: 0 })));
});

Deno.test('a snooze that lands after the deadline changes what it says', () => {
  const before = buildSnoozedCopy(base({ leadMinutes: 60, daysUntilDue: 0 }));
  const after = buildSnoozedCopy(base({ leadMinutes: -60, daysUntilDue: 0 }));
  assert(before.title !== after.title, 'stale copy replayed past the deadline');
});

// ── 10. Nothing native, nothing platform-specific ────────────────────────────

Deno.test('the module imports nothing at all', async () => {
  // Which is what makes it identical on iPhone and iPad, safe inside the 1.11
  // runtime, and testable here without a React Native stub.
  const source = await Deno.readTextFile(new URL('./notificationCopy.ts', import.meta.url));
  const imports = source.match(/^\s*import\s/gm) ?? [];
  assertEquals(imports.length, 0, 'notificationCopy.ts grew an import');
  assert(!/Platform\.OS/.test(source), 'notificationCopy.ts branched on platform');
});
