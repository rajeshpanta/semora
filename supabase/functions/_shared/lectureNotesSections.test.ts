import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  assembleSectionedNotes,
  parseSectionResult,
  splitTranscriptSections,
} from './lectureNotesSections.ts';

const sentence = (i: number) => `Sentence number ${i} explains a concept in some detail. `;

Deno.test('paragraph transcripts split at paragraph boundaries near the target', () => {
  const paragraphs = Array.from({ length: 30 }, (_, i) => sentence(i).repeat(40).trim()); // ~2.2k chars each
  const sections = splitTranscriptSections(paragraphs.join('\n\n'), 10_000);
  assert(sections.length >= 5 && sections.length <= 8, `sections: ${sections.length}`);
  for (const s of sections) assert(s.length <= 14_000, `section too long: ${s.length}`);
  // nothing lost, nothing duplicated
  assertEquals(sections.join('\n\n'), paragraphs.join('\n\n'));
});

Deno.test('one giant space-joined paragraph splits at sentence ends, never mid-word', () => {
  const text = Array.from({ length: 2000 }, (_, i) => sentence(i)).join('').trim(); // ~110k
  const sections = splitTranscriptSections(text, 24_000);
  assert(sections.length >= 4, `sections: ${sections.length}`);
  for (const s of sections) {
    assert(s.endsWith('.'), `section ends mid-sentence: ...${s.slice(-30)}`);
  }
  assertEquals(sections.join(' ').replace(/\s+/g, ' '), text.replace(/\s+/g, ' '));
});

Deno.test('a gap marker stays with the text before it rather than opening a section', () => {
  const big = sentence(1).repeat(200).trim();
  const text = `${big}\n\n[Part of this recording could not be transcribed.]\n\n${big}`;
  const sections = splitTranscriptSections(text, 10_000);
  assert(!sections.some((s) => s.startsWith('[Part of this recording')), 'section starts with a marker');
});

Deno.test('a sliver of a last section is folded into the one before', () => {
  const sections = splitTranscriptSections(`${'a '.repeat(6000)}\n\nshort tail.`, 10_000);
  assert(sections[sections.length - 1].endsWith('short tail.'));
  assert(sections.every((s) => s.length > 1000));
});

Deno.test('empty transcript → no sections', () => {
  assertEquals(splitTranscriptSections('   '), []);
});

Deno.test('section output is validated and headings demoted under ## Notes', () => {
  const r = parseSectionResult(JSON.stringify({
    notes_md: '# Big\n## Medium\n### Topic\n- point',
    key_terms: ['Entropy — disorder', 3, ''],
    action_items: ['Read chapter 4'],
  }));
  assertEquals(r, { notes_md: '### Big\n### Medium\n### Topic\n- point', key_terms: ['Entropy — disorder'], action_items: ['Read chapter 4'] });
  assertEquals(parseSectionResult('not json'), null);
  assertEquals(parseSectionResult(JSON.stringify({ notes_md: '' })), null);
  assertEquals(parseSectionResult(null), null);
});

Deno.test('assembled notes keep the single-pass shape and dedupe terms and actions', () => {
  const md = assembleSectionedNotes('# Thermodynamics\n\nSummary.\n\n## Key points\n- One', [
    { notes_md: '### First law\n- energy', key_terms: ['Entropy — disorder'], action_items: ['Read ch 4'] },
    { notes_md: '### Second law\n- entropy', key_terms: ['entropy — a measure of disorder', 'Enthalpy — heat'], action_items: [] },
  ]);
  assertEquals(md, [
    '# Thermodynamics\n\nSummary.\n\n## Key points\n- One',
    '## Notes',
    '### First law\n- energy\n\n### Second law\n- entropy',
    '## Key terms\n- Entropy — disorder\n- Enthalpy — heat',
    '## Action items\n- Read ch 4',
  ].join('\n\n'));
});
