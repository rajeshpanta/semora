import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseBlocks, isBlockStart } from '@/lib/markdownBlocks';

/**
 * The bug these cover: every source line used to become its own paragraph, so
 * a model answer that arrived hard-wrapped rendered with a paragraph gap in
 * the middle of a sentence. It only showed up once the Tutor was rendered on a
 * device — the text was all present and the markdown was valid, it just read
 * as though the answer kept losing its train of thought.
 */

function paragraphs(md: string): string[] {
  return parseBlocks(md).filter((b) => b.kind === 'paragraph').map((b) => (b as { text: string }).text);
}

Deno.test('soft-wrapped lines join into one paragraph', () => {
  const md = [
    'That non-linearity is the signature of a second-order',
    'dependence and is what the graph in your problem set is',
    'asking you to notice.',
  ].join('\n');
  assertEquals(paragraphs(md), [
    'That non-linearity is the signature of a second-order dependence and is what the graph in your problem set is asking you to notice.',
  ]);
});

Deno.test('a blank line still separates two paragraphs', () => {
  assertEquals(paragraphs('First thought\nkeeps going.\n\nSecond thought.'), [
    'First thought keeps going.',
    'Second thought.',
  ]);
});

Deno.test('a following block interrupts the merge rather than being swallowed', () => {
  const blocks = parseBlocks('Lead-in line\n## Heading\nAfter the heading');
  assertEquals(blocks.map((b) => b.kind), ['paragraph', 'heading', 'paragraph']);
  assertEquals(paragraphs('Setup line\n- first bullet\n- second bullet'), ['Setup line']);
  assertEquals(paragraphs('Setup line\n1. first step'), ['Setup line']);
  assertEquals(paragraphs('Setup line\n> a quotation'), ['Setup line']);
});

Deno.test('a fence ends the paragraph and its contents are never merged', () => {
  const blocks = parseBlocks('Try this:\n```\nrate2 / rate1\n= ratio^2\n```');
  assertEquals(blocks.map((b) => b.kind), ['paragraph', 'code']);
  assertEquals((blocks[1] as { text: string }).text, 'rate2 / rate1\n= ratio^2');
});

Deno.test('isBlockStart agrees with the parser about what opens a block', () => {
  for (const line of ['# h', '## h', '- b', '* b', '• b', '1. o', '2) o', '> q', '```', '---', '***', '___']) {
    assertEquals(isBlockStart(line), true, `expected a block start: ${line}`);
  }
  for (const line of ['plain prose', 'rate = k[NO2]^2', 'a - b is not a bullet', '1985 was a year']) {
    assertEquals(isBlockStart(line), false, `expected prose: ${line}`);
  }
});

Deno.test('CRLF input is handled the same as LF', () => {
  assertEquals(paragraphs('One line\r\nand its continuation.'), ['One line and its continuation.']);
});
