import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { actionItemsFromNotes, dateFromText, taskTitleFromItem, typeFromText } from '@/lib/lectureActionItems';

// Wednesday 16 September 2026, local time.
const recorded = new Date(2026, 8, 16, 10, 0);

Deno.test('dates: month names, slashes, weekdays, tomorrow — relative to the lecture', () => {
  assertEquals(dateFromText('Midterm on Oct 3 in class', recorded), '2026-10-03');
  assertEquals(dateFromText('Essay due October 3rd', recorded), '2026-10-03');
  assertEquals(dateFromText('Examen parcial el 3 de octubre', recorded), '2026-10-03');
  assertEquals(dateFromText('Final exam Jan 12', recorded), '2027-01-12');
  assertEquals(dateFromText('Lab report due 9/25', recorded), '2026-09-25');
  assertEquals(dateFromText('Problem set due Friday', recorded), '2026-09-18');
  assertEquals(dateFromText('Quiz next Friday', recorded), '2026-09-25');
  assertEquals(dateFromText('Read before class on Wednesday', recorded), '2026-09-23');
  assertEquals(dateFromText('Entregar la tarea el viernes', recorded), '2026-09-18');
  assertEquals(dateFromText('Bring a calculator tomorrow', recorded), '2026-09-17');
  assertEquals(dateFromText('Office hours moved', recorded), null);
  assertEquals(dateFromText('Scores out of 10/10', recorded), null);
  assertEquals(dateFromText('Feb 30 is not a day', recorded), null);
});

Deno.test('types from the words used', () => {
  assertEquals(typeFromText('Midterm on Oct 3'), 'exam');
  assertEquals(typeFromText('Pop quiz next week'), 'quiz');
  assertEquals(typeFromText('Read chapter 5'), 'reading');
  assertEquals(typeFromText('Group project proposal'), 'project');
  assertEquals(typeFromText('Homework 3 due Friday'), 'assignment');
  assertEquals(typeFromText('Bring a calculator'), 'other');
});

Deno.test('the Action items section only, top-level bullets, stars and bold removed', () => {
  const md = [
    '# Cell division',
    '## Mitosis',
    '- due Friday is not an action item here',
    '## Key terms',
    '- Mitosis — division',
    '## Action items',
    '- **Homework 3** due Friday',
    '  - problems 1-10',
    '- ⭐ Midterm on Oct 3',
    '',
    '## Something after',
    '- not this',
  ].join('\n');
  assertEquals(actionItemsFromNotes(md, recorded), [
    { text: 'Homework 3 due Friday', type: 'assignment', dueDate: '2026-09-18' },
    { text: 'Midterm on Oct 3', type: 'exam', dueDate: '2026-10-03' },
  ]);
  assertEquals(actionItemsFromNotes('## Acciones\n- Leer el capítulo 4', recorded).length, 1);
  assertEquals(actionItemsFromNotes('## Mitosis\n- a', recorded), []);
  assertEquals(actionItemsFromNotes(null, recorded), []);
});

Deno.test('task titles are short', () => {
  assertEquals(taskTitleFromItem('Homework 3 due Friday. Covers chapters 4 and 5.'), 'Homework 3 due Friday');
  assertEquals(taskTitleFromItem('x'.repeat(100)).length, 78);
});

Deno.test('"no action items" is not a task', () => {
  const md = '## Action items\n- No action items were recoverable from the transcript.\n- None mentioned.\n- Nothing was announced.\n- Deadlines were not mentioned in this lecture.\n- Ninguna tarea fue mencionada.\n- Read chapter 5 by Friday';
  assertEquals(actionItemsFromNotes(md, recorded).map((i) => i.text), ['Read chapter 5 by Friday']);
});
