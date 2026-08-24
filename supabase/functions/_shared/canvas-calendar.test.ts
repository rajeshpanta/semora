import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  canvasCalendarOrigin,
  normalizeCanvasCalendarFeedUrl,
  parseCanvasCalendarFeed,
} from './canvas-calendar.ts';

Deno.test('normalizes the official Canvas webcal subscription URL', () => {
  const value = normalizeCanvasCalendarFeedUrl(
    'webcal://school.instructure.com/feeds/calendars/user_privateCode.ics',
  );
  assertEquals(value, 'https://school.instructure.com/feeds/calendars/user_privateCode.ics');
  assertEquals(canvasCalendarOrigin(value), 'https://school.instructure.com');
});

Deno.test('rejects non-user, insecure, and private calendar URLs', () => {
  assertThrows(() => normalizeCanvasCalendarFeedUrl('https://school.instructure.com/api/v1/courses'));
  assertThrows(() => normalizeCanvasCalendarFeedUrl('https://school.instructure.com/feeds/calendars/course_public.ics'));
  assertThrows(() => normalizeCanvasCalendarFeedUrl('http://school.instructure.com/feeds/calendars/user_code.ics'));
  assertThrows(() => normalizeCanvasCalendarFeedUrl('https://127.0.0.1/feeds/calendars/user_code.ics'));
});

Deno.test('parses Canvas assignments, course codes, URLs, and all-day events', () => {
  const parsed = parseCanvasCalendarFeed([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    'DTSTART;TZID=UTC:20260816T065900Z',
    'DTSTAMP;TZID=UTC:20260810T120000Z',
    'SUMMARY:Essay\\, final draft [ENG 101]',
    'DESCRIPTION:Read chapters 1\\nthrough 3',
    'URL:https://school.instructure.com/calendar?include_contexts=course_42&month=08&year=2026#assignment_9',
    'UID:event-assignment-9',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART;VALUE=DATE:20260820',
    'SUMMARY:Lab day [BIO 200]',
    'URL:https://school.instructure.com/calendar?include_contexts=course_77#calendar_event_4',
    'UID:event-calendar-event-4',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n'));

  assertEquals(parsed.courses, [
    { id: '77', name: 'BIO 200', code: 'BIO 200', item_count: 1, first_due: '2026-08-20', last_due: '2026-08-20' },
    { id: '42', name: 'ENG 101', code: 'ENG 101', item_count: 1, first_due: '2026-08-16', last_due: '2026-08-16' },
  ]);
  assertEquals(parsed.assignments[0], {
    external_id: 'event-assignment-9',
    external_course_id: '42',
    title: 'Essay, final draft',
    description: 'Read chapters 1\nthrough 3',
    type: 'assignment',
    due_date: '2026-08-16',
    due_time: '06:59:00',
    due_at: '2026-08-16T06:59:00.000Z',
    external_updated_at: '2026-08-10T12:00:00.000Z',
    url: 'https://school.instructure.com/calendar?include_contexts=course_42&month=08&year=2026#assignment_9',
  });
  assertEquals(parsed.assignments[1].due_date, '2026-08-20');
  assertEquals(parsed.assignments[1].due_at, null);
  assertEquals(parsed.assignments[1].type, 'other');
});

Deno.test('ignores personal events and cancelled course events', () => {
  const parsed = parseCanvasCalendarFeed([
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'DTSTART:20260816T065900Z',
    'SUMMARY:Personal reminder',
    'URL:https://school.instructure.com/calendar?include_contexts=user_1',
    'UID:event-calendar-event-1',
    'END:VEVENT',
    'BEGIN:VEVENT',
    'DTSTART:20260816T065900Z',
    'SUMMARY:Cancelled exam [MATH 1]',
    'URL:https://school.instructure.com/calendar?include_contexts=course_3',
    'UID:event-assignment-2',
    'STATUS:CANCELLED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\n'));
  assertEquals(parsed, { courses: [], assignments: [] });
});

Deno.test('summarises each course: how many dated items, and over what range', () => {
  // The evidence the connect screen shows before anything is imported, and the
  // only signal a calendar feed carries about which term a course belongs to.
  const event = (course: string, uid: string, date: string) => [
    'BEGIN:VEVENT',
    `DTSTART;VALUE=DATE:${date}`,
    `SUMMARY:Item [${course}]`,
    `URL:https://school.instructure.com/calendar?include_contexts=course_${course === 'FALL' ? '1' : '2'}#a`,
    `UID:${uid}`,
    'END:VEVENT',
  ].join('\r\n');

  const parsed = parseCanvasCalendarFeed([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    event('FALL', 'a-1', '20260902'),
    event('FALL', 'a-2', '20261211'),
    event('FALL', 'a-3', '20261015'),
    // Same UID twice: a repeated event must not inflate the count the student
    // is shown when deciding whether to import.
    event('FALL', 'a-3', '20261015'),
    event('SUM', 'b-1', '20260602'),
    'END:VCALENDAR',
  ].join('\r\n'));

  const fall = parsed.courses.find((course) => course.code === 'FALL')!;
  assertEquals(fall.item_count, 3);
  assertEquals(fall.first_due, '2026-09-02');
  assertEquals(fall.last_due, '2026-12-11');

  const summer = parsed.courses.find((course) => course.code === 'SUM')!;
  assertEquals(summer.item_count, 1);
  assertEquals(summer.first_due, '2026-06-02');
  assertEquals(summer.last_due, '2026-06-02');
});
