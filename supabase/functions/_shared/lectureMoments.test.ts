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

Deno.test('a part with no row keeps its place: marks after it find the right passage', () => {
  // seq 1 never arrived (no row). Part 2 starts at 240, not 120.
  const gappy = [
    { seq: 0, seconds: 120, timings: [[0, 20, 'Welcome.']] as [number, number, string][] },
    { seq: 2, seconds: 60, timings: [[0, 10, 'After the gap.']] as [number, number, string][] },
  ];
  assertEquals(markedExcerpts(gappy, [245]), ['After the gap.']);
  // At 180 the student was in the missing part: nothing, not part 2's words.
  assertEquals(markedExcerpts(gappy, [180]), []);
  // Parts missing before the first row count too.
  const lateStart = [{ seq: 2, seconds: 120, timings: [[0, 10, 'Third part.']] as [number, number, string][] }];
  assertEquals(markedExcerpts(lateStart, [5]), []);
  assertEquals(markedExcerpts(lateStart, [245]), ['Third part.']);
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
