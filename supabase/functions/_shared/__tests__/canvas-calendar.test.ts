import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseCanvasCalendarFeed } from '../canvas-calendar.ts';

function feed(description: string) {
  return [
    'BEGIN:VCALENDAR',
    'BEGIN:VEVENT',
    'UID:event-assignment-123',
    'SUMMARY:Essay One [HIST 101]',
    'DTSTART;VALUE=DATE:20261001',
    // Canvas points every feed event back at the calendar with the course in
    // include_contexts — that parameter is how the parser attributes an item.
    'URL:https://school.instructure.com/calendar?include_contexts=course_42&month=10&year=2026',
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

Deno.test('a short description is passed through untouched', () => {
  const out = parseCanvasCalendarFeed(feed('Read chapter 3 and submit a summary.'));
  assertEquals(out.assignments[0].description, 'Read chapter 3 and submit a summary.');
});

Deno.test('an empty description becomes null, not an empty string', () => {
  const out = parseCanvasCalendarFeed(feed('   '));
  assertEquals(out.assignments[0].description, null);
});

Deno.test('an over-long description is cut at a sentence and says so', () => {
  const body = 'Sentence about the assignment. '.repeat(400); // ~12,400 chars
  const out = parseCanvasCalendarFeed(feed(body));
  const d = out.assignments[0].description!;
  // Never longer than the limit plus the short note.
  assertEquals(d.length < 10_200, true, `length ${d.length}`);
  // It says it was shortened, and points somewhere real.
  assertEquals(d.includes('[Shortened — open in Canvas for the full description.]'), true);
  // The old bug: ending mid-word with no explanation.
  const beforeNote = d.slice(0, d.indexOf('\n\n[Shortened')).trimEnd();
  assertEquals(beforeNote.endsWith('.'), true, `ended with: ${JSON.stringify(beforeNote.slice(-40))}`);
});

Deno.test('a description with no break in the last fifth still gets the note', () => {
  const out = parseCanvasCalendarFeed(feed('x'.repeat(11_000)));
  const d = out.assignments[0].description!;
  assertEquals(d.includes('[Shortened'), true);
  assertEquals(d.length < 10_200, true);
});

Deno.test('the lms_url is still present, so the note has somewhere to point', () => {
  const out = parseCanvasCalendarFeed(feed('short'));
  assertEquals(typeof out.assignments[0].url, 'string');
  assertEquals(out.assignments[0].url!.includes('instructure.com'), true);
});
