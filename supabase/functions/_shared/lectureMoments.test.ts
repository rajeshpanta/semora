import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { excerptsInSection, markedExcerpts, markedMomentsInstruction } from './lectureMoments.ts';

const parts = [
  { seq: 1, seconds: 120, timings: [[0, 10, 'Part two starts.'], [100, 115, 'Krebs cycle makes NADH.']] as [number, number, string][] },
  { seq: 0, seconds: 120, timings: [[0, 20, 'Welcome.'], [60, 90, 'Mitosis has four phases.']] as [number, number, string][] },
];

Deno.test('a mark finds what was said just before it, across part boundaries', () => {
  // 95s: inside part 0 → the mitosis sentence (60-90) is within the 45s look-back.
  assertEquals(markedExcerpts(parts, [95]), ['Mitosis has four phases.']);
  // 230s = part 1 at 110s → the Krebs sentence.
  assertEquals(markedExcerpts(parts, [230]), ['Krebs cycle makes NADH.']);
  // 125s straddles the boundary: the end of part 0 and the start of part 1.
  assertEquals(markedExcerpts(parts, [125]), ['Mitosis has four phases. Part two starts.']);
});

Deno.test('no marks, no timings, or marks on silence give nothing', () => {
  assertEquals(markedExcerpts(parts, null), []);
  assertEquals(markedExcerpts([{ seq: 0, seconds: 120, timings: null }], [10]), []);
  assertEquals(markedExcerpts(parts, [40 + 45 + 1000]), []);
});

Deno.test('duplicate excerpts collapse and long ones keep their end', () => {
  assertEquals(markedExcerpts(parts, [95, 100]).length, 1);
  const long = [{ seq: 0, seconds: 60, timings: [[0, 50, 'a'.repeat(1000) + ' END']] as [number, number, string][] }];
  const [e] = markedExcerpts(long, [50]);
  assertEquals(e.length, 450);
  assertEquals(e.endsWith(' END'), true);
});

Deno.test('excerpts are routed to the section that contains them', () => {
  const excerpt = 'The derivative of a composition is the product of derivatives along the chain.';
  assertEquals(excerptsInSection([excerpt], `intro words ${excerpt} more words`), [excerpt]);
  assertEquals(excerptsInSection([excerpt], 'a different section'), []);
  assertEquals(markedMomentsInstruction([]), '');
  assertEquals(markedMomentsInstruction(['x']).includes('⭐'), true);
});
