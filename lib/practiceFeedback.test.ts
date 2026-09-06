import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { splitPracticeFeedback, stripInlineMarkdown } from '@/lib/practiceFeedback';

// The real strings, taken from a production Phase 3A evaluation response.
const EXPLANATION = 'A p-value measures how unusual the observed result—or something more extreme—would be if the null hypothesis were true. It does not give the probability that either hypothesis is true or that chance alone caused the result.';
const CORRECT = 'The probability of observing data at least as extreme as the observed data, assuming the null hypothesis is true';
const FEEDBACK = `Not quite. The best answer is ${CORRECT}. ${EXPLANATION}`;

Deno.test('the duplicated explanation is removed and the correct answer is kept', () => {
  const s = splitPracticeFeedback(FEEDBACK, EXPLANATION);
  assertEquals(s.verdict, `The best answer is ${CORRECT}.`);
  assertEquals(s.whyCorrect, EXPLANATION);
  // The explanation must appear exactly once across the two fields.
  assertEquals(`${s.verdict} ${s.whyCorrect}`.split(EXPLANATION).length - 1, 1);
});

Deno.test('the Spanish opener is stripped too', () => {
  const es = `Aún no. La mejor respuesta es ${CORRECT}. ${EXPLANATION}`;
  const s = splitPracticeFeedback(es, EXPLANATION);
  assertEquals(s.verdict, `La mejor respuesta es ${CORRECT}.`);
  assertEquals(s.whyCorrect, EXPLANATION);
});

Deno.test('no teaching keeps the whole message minus the opener the heading states', () => {
  for (const empty of [null, undefined, '', '   ']) {
    const s = splitPracticeFeedback(FEEDBACK, empty);
    assertEquals(s.verdict, `The best answer is ${CORRECT}. ${EXPLANATION}`);
    assertEquals(s.whyCorrect, null);
    // The invariant that matters: nothing a student needs is dropped.
    assertEquals(s.verdict!.includes(CORRECT), true);
    assertEquals(s.verdict!.includes(EXPLANATION), true);
  }
});

Deno.test('a correct answer keeps its explanation and loses only the repeated verdict', () => {
  const s = splitPracticeFeedback(`Correct. ${EXPLANATION}`, null);
  assertEquals(s.verdict, EXPLANATION);
  assertEquals(s.whyCorrect, null);
});

Deno.test('drifted strings fall back to the full feedback, never to a gap', () => {
  // The stored explanation was edited, or the server reworded the sentence.
  const s = splitPracticeFeedback(FEEDBACK, 'A completely different explanation.');
  assertEquals(s.verdict, `The best answer is ${CORRECT}. ${EXPLANATION}`);
  assertEquals(s.whyCorrect, null);
  // Whatever happens, the correct answer AND its explanation stay on screen.
  assertEquals(s.verdict!.includes(CORRECT), true);
  assertEquals(s.verdict!.includes(EXPLANATION), true);
});

Deno.test('a feedback string that is ONLY the explanation leaves no empty verdict', () => {
  const s = splitPracticeFeedback(EXPLANATION, EXPLANATION);
  assertEquals(s.verdict, null);
  assertEquals(s.whyCorrect, EXPLANATION);
});

Deno.test('trailing and leading whitespace never leaks into the rendered text', () => {
  const s = splitPracticeFeedback(`  ${FEEDBACK}  `, `  ${EXPLANATION}  `);
  assertEquals(s.verdict, `The best answer is ${CORRECT}.`);
  assertEquals(s.whyCorrect, EXPLANATION);
});

Deno.test('an empty feedback string does not render an empty bubble', () => {
  assertEquals(splitPracticeFeedback('', null), { verdict: null, whyCorrect: null });
});

Deno.test('a choice that already ends in a full stop does not produce ".."', () => {
  const choice = 'Glucose transport uses the sodium gradient established by a primary active pump.';
  const expl = 'The sodium-glucose cotransporter performs secondary active transport.';
  const s = splitPracticeFeedback(`Not quite. The best answer is ${choice}. ${expl}`, expl);
  assertEquals(s.verdict, `The best answer is ${choice}`);
  assertEquals(s.verdict!.endsWith('..'), false);
});

Deno.test('inline markdown never reaches a plain Text node', () => {
  assertEquals(stripInlineMarkdown('performs **secondary active transport**: sodium moves'),
    'performs secondary active transport: sodium moves');
  assertEquals(stripInlineMarkdown('__both__ and *one* and `code`'), 'both and one and code');
});

Deno.test('stripping leaves real notation alone', () => {
  for (const keep of ['Na+/K+ ATPase', 'rate = k[NO2]^2', 'snake_case_term', '2 * 3 = 6', 'a_b and c_d']) {
    assertEquals(stripInlineMarkdown(keep), keep);
  }
});

Deno.test('the explanation is stripped too, not only the verdict', () => {
  const expl = 'It performs **secondary active transport**.';
  const s = splitPracticeFeedback(`Not quite. The best answer is X. ${expl}`, expl);
  assertEquals(s.whyCorrect, 'It performs secondary active transport.');
});

Deno.test('the heading already says it, so the body does not repeat the verdict', () => {
  const expl = 'The Na+/K+ ATPase hydrolyzes ATP directly.';
  assertEquals(splitPracticeFeedback(`Correct. ${expl}`, null).verdict, expl);
  assertEquals(splitPracticeFeedback(`Correcto. ${expl}`, null).verdict, expl);
  // ...and the wrong-answer legacy path keeps everything except the opener.
  assertEquals(splitPracticeFeedback(`Not quite. The best answer is B. ${expl}`, null).verdict,
    `The best answer is B. ${expl}`);
});
