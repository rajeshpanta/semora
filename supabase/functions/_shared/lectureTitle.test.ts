import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { autoTitleFromNotes, headlineFromNotes, isFallbackTitle, MAX_TITLE_CHARS } from './lectureTitle.ts';

const notes = `# The Krebs cycle and where ATP actually comes from

One or two sentences.

## Key points
- a
`;

Deno.test('fallback titles are the app-made ones only', () => {
  assertEquals(isFallbackTitle('Lecture'), true);
  assertEquals(isFallbackTitle('Clase'), true);
  assertEquals(isFallbackTitle(''), true);
  assertEquals(isFallbackTitle('Biology 101 · Tue, Sep 16'), true);
  assertEquals(isFallbackTitle('Biología · mié, oct 3'), true);
  assertEquals(isFallbackTitle('Lecture · Mon, Sep 1'), true);
  assertEquals(isFallbackTitle('Krebs cycle'), false);
  assertEquals(isFallbackTitle('Biology 101 · Tue, Sep 16 (exam review)'), false);
  assertEquals(isFallbackTitle('Lecture notes'), false);
});

Deno.test('the headline is the first H1, cleaned', () => {
  assertEquals(headlineFromNotes(notes), 'The Krebs cycle and where ATP actually comes from');
  assertEquals(headlineFromNotes('## Key points\n- a'), null);
  assertEquals(headlineFromNotes('Intro line\n\n#   **Photosynthesis**, light reactions  #\n'), 'Photosynthesis, light reactions');
  assertEquals(headlineFromNotes('#\n## Key points'), null);
  assertEquals(headlineFromNotes(null), null);
});

Deno.test('a fallback title takes the headline; a chosen title never does', () => {
  assertEquals(autoTitleFromNotes('Lecture', notes), 'The Krebs cycle and where ATP actually comes from');
  assertEquals(autoTitleFromNotes('Biology 101 · Tue, Sep 16', notes), 'The Krebs cycle and where ATP actually comes from');
  assertEquals(autoTitleFromNotes('My own title', notes), null);
  assertEquals(autoTitleFromNotes('Lecture', '# Lecture notes\n\n## Key points'), null);
  assertEquals(autoTitleFromNotes('Lecture', '# Apuntes de la clase\n'), null);
  assertEquals(autoTitleFromNotes('Lecture', '# Lecture\n'), null);
  assertEquals(autoTitleFromNotes('Lecture', 'no heading at all'), null);
  assertEquals(autoTitleFromNotes('Lecture', '#    \n## Key points'), null);
});

Deno.test('a long headline is cut to the title limit', () => {
  const long = 'A '.repeat(80).trim();
  const t = autoTitleFromNotes('Lecture', `# ${long}\n`);
  assertEquals(t?.length, MAX_TITLE_CHARS - 1); // trailing space trimmed
  assertEquals(t?.endsWith('A'), true);
});
