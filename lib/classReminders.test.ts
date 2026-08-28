/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/classReminders.test.ts
 *
 * The failure that matters here is silent and weekly: a reminder on the wrong
 * day, or one that keeps arriving after term ends. Most of these cases are
 * about the two conversions that could cause it — 0-indexed storage to
 * 1-indexed iOS weekdays, and a lead time that crosses midnight.
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  buildClassPlan,
  hasUsableMeetings,
  classReminderBody,
  semesterStillRunning,
  shiftBack,
  CLASS_REMINDER_MAX_SLOTS,
  type ClassMeetingRow,
} from './classReminders';

const meeting = (over: Partial<ClassMeetingRow> = {}): ClassMeetingRow => ({
  id: 'm1', courseId: 'c1', courseName: 'Chemistry 210',
  daysOfWeek: [1, 3, 5], startTime: '10:00:00', location: 'Rm 204', ...over,
});

// ── weekday conversion ─────────────────────────────────────────────────────

Deno.test('M/W/F becomes three triggers on the right iOS weekdays', () => {
  // Stored 1,3,5 = Mon,Wed,Fri (Sunday is 0). iOS counts Sunday as 1, so the
  // same days are 2,4,6. An off-by-one here reminds a student a day early,
  // every week, and nothing in the app would show it.
  const p = buildClassPlan([meeting({ daysOfWeek: [1, 3, 5] })], 15);
  assertEquals(p.triggers.length, 3);
  assertEquals(p.triggers.map((t) => t.weekday), [2, 4, 6]);
  assertEquals(p.triggers.map((t) => `${t.hour}:${t.minute}`), ['9:45', '9:45', '9:45']);
});

Deno.test('T/Th becomes two triggers', () => {
  const p = buildClassPlan([meeting({ daysOfWeek: [2, 4] })], 30);
  assertEquals(p.triggers.map((t) => t.weekday), [3, 5]);
  assertEquals(p.triggers[0].hour, 9);
  assertEquals(p.triggers[0].minute, 30);
});

Deno.test('Sunday and Saturday map to the ends of the week', () => {
  const p = buildClassPlan([meeting({ daysOfWeek: [0, 6] })], 0);
  assertEquals(p.triggers.map((t) => t.weekday), [1, 7]);
});

// ── lead times crossing midnight ───────────────────────────────────────────

Deno.test('a lead time that crosses midnight moves the weekday with it', () => {
  // An 00:30 class with an hour's warning belongs to the evening before.
  const p = buildClassPlan([meeting({ daysOfWeek: [1], startTime: '00:30:00' })], 60);
  assertEquals(p.triggers[0].weekday, 1, 'Monday 00:30 minus an hour is Sunday');
  assertEquals(p.triggers[0].hour, 23);
  assertEquals(p.triggers[0].minute, 30);
});

Deno.test('wrapping off Sunday lands on Saturday, not weekday zero', () => {
  const s = shiftBack(1, 0, 15, 30);
  assertEquals(s, { weekday: 7, hour: 23, minute: 45 });
});

Deno.test('no lead time means the meeting time itself', () => {
  const p = buildClassPlan([meeting({ daysOfWeek: [1], startTime: '14:05:00' })], 0);
  assertEquals(`${p.triggers[0].hour}:${p.triggers[0].minute}`, '14:5');
});

// ── multiple meetings and courses ──────────────────────────────────────────

Deno.test('several meeting rows for one course each contribute their days', () => {
  const p = buildClassPlan([
    meeting({ id: 'lecture', daysOfWeek: [1, 3], startTime: '10:00:00' }),
    meeting({ id: 'lab', daysOfWeek: [4], startTime: '14:00:00', kind: 'lab' }),
  ], 15);
  assertEquals(p.triggers.length, 3);
  assertEquals(new Set(p.triggers.map((t) => t.meetingId)).size, 2);
});

Deno.test('different courses keep their own identity and times', () => {
  const p = buildClassPlan([
    meeting({ id: 'm1', courseId: 'c1', courseName: 'Chem', daysOfWeek: [1], startTime: '09:00:00' }),
    meeting({ id: 'm2', courseId: 'c2', courseName: 'Bio', daysOfWeek: [1], startTime: '13:00:00', location: null }),
  ], 10);
  assertEquals(p.triggers.length, 2);
  assertEquals(p.triggers[0].courseName, 'Chem');
  assertEquals(p.triggers[1].courseName, 'Bio');
  assertEquals(p.triggers[1].location, null);
});

Deno.test('duplicate days in one row do not double-schedule', () => {
  const p = buildClassPlan([meeting({ daysOfWeek: [1, 1, 1] })], 15);
  assertEquals(p.triggers.length, 1);
});

// ── unusable data ──────────────────────────────────────────────────────────

Deno.test('a meeting without a start time is skipped, not guessed at', () => {
  const p = buildClassPlan([meeting({ startTime: null })], 15);
  assertEquals(p.triggers.length, 0);
  assertEquals(p.skippedNoTime, 1);
});

Deno.test('a meeting with no days is skipped', () => {
  assertEquals(buildClassPlan([meeting({ daysOfWeek: [] })], 15).skippedNoDays, 1);
  assertEquals(buildClassPlan([meeting({ daysOfWeek: null })], 15).skippedNoDays, 1);
});

Deno.test('nonsense day values are ignored rather than scheduled', () => {
  const p = buildClassPlan([meeting({ daysOfWeek: [1, 9, -2] })], 15);
  assertEquals(p.triggers.length, 1);
  assertEquals(p.triggers[0].weekday, 2);
});

Deno.test('a malformed time is skipped', () => {
  assertEquals(buildClassPlan([meeting({ startTime: 'lunchtime' })], 15).skippedNoTime, 1);
  assertEquals(buildClassPlan([meeting({ startTime: '99:99' })], 15).skippedNoTime, 1);
});

Deno.test('the control is hidden when nothing is usable', () => {
  assertEquals(hasUsableMeetings([]), false);
  assertEquals(hasUsableMeetings([meeting({ startTime: null })]), false);
  assertEquals(hasUsableMeetings([meeting({ daysOfWeek: [] })]), false);
  assertEquals(hasUsableMeetings([meeting()]), true);
});

// ── the cap ────────────────────────────────────────────────────────────────

Deno.test('an implausible timetable is capped rather than eating the budget', () => {
  const many = Array.from({ length: 20 }, (_, i) =>
    meeting({ id: `m${i}`, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }));
  const p = buildClassPlan(many, 15);
  assertEquals(p.triggers.length, CLASS_REMINDER_MAX_SLOTS);
  assertEquals(p.overflow, 20 * 7 - CLASS_REMINDER_MAX_SLOTS);
  // Earliest in the week survives, so the trim is predictable.
  assertEquals(p.triggers[0].weekday, 1);
});

Deno.test('a real timetable is nowhere near the cap', () => {
  // The heaviest production timetable is 28 weekly occurrences.
  const p = buildClassPlan([
    meeting({ id: 'a', daysOfWeek: [1, 3, 5], startTime: '09:00:00' }),
    meeting({ id: 'b', daysOfWeek: [2, 4], startTime: '11:00:00' }),
    meeting({ id: 'c', daysOfWeek: [1, 3], startTime: '14:00:00' }),
    meeting({ id: 'd', daysOfWeek: [5], startTime: '16:00:00' }),
  ], 15);
  assertEquals(p.overflow, 0);
  assertEquals(p.triggers.length, 8);
});

// ── copy ───────────────────────────────────────────────────────────────────

Deno.test('the body names the location when there is one', () => {
  assertEquals(classReminderBody(15, 'Rm 204', 'en'), 'starts in 15 min · Rm 204');
  assertEquals(classReminderBody(15, null, 'en'), 'starts in 15 min');
  assertEquals(classReminderBody(60, 'Lab B', 'en'), 'starts in 1 hour · Lab B');
  assertEquals(classReminderBody(120, null, 'en'), 'starts in 2 hours');
  assertEquals(classReminderBody(0, null, 'en'), 'starts now');
});

Deno.test('spanish copy is translated, not just reordered', () => {
  assertEquals(classReminderBody(15, 'Rm 204', 'es'), 'empieza en 15 min · Rm 204');
  assertEquals(classReminderBody(60, null, 'es'), 'empieza en 1 hora');
});

// ── term end ───────────────────────────────────────────────────────────────

Deno.test('a term with no end date is not still running', () => {
  // The whole reason enabling asks for one: a repeating trigger has no end of
  // its own, so an unknown end date means reminders forever.
  assertEquals(semesterStillRunning(null, new Date(2026, 8, 1)), false);
  assertEquals(semesterStillRunning(undefined, new Date(2026, 8, 1)), false);
  assertEquals(semesterStillRunning('not-a-date', new Date(2026, 8, 1)), false);
});

Deno.test('the last day of term still counts as running', () => {
  const today = new Date(2026, 11, 15, 9, 0, 0);
  assertEquals(semesterStillRunning('2026-12-15', today), true);
  assertEquals(semesterStillRunning('2026-12-14', today), false);
  assertEquals(semesterStillRunning('2026-12-16', today), true);
});
