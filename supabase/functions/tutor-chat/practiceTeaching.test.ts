import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildTeaching, normalizeAnswer, sanitizeDistractorNotes } from './practiceTeaching.ts';

/**
 * A realistic question of the shape the generator produces, with one note per
 * incorrect choice. The four wrong choices are deliberately four DIFFERENT
 * kinds of mistake, because the whole point of this feature is that they must
 * not all receive the same reply.
 */
const CHOICES = [
  'The rate quadruples',            // correct
  'The rate doubles',               // plausible / common misconception
  'The rate halves',                // opposite concept
  'The rate increases by 2',        // arithmetic / sign-style slip
  'The rate order becomes second',  // terminology confusion
];
const EXPECTED = 'The rate quadruples';
const EXPLANATION = 'Rate = k[NO₂]², so doubling the concentration multiplies the rate by 2² = 4.';
const TOPICS = ['second-order rate laws', 'kinetics'];

const NOTES_FROM_MODEL: Record<string, string> = {
  'The rate doubles': 'This reads the exponent as if the relationship were first order — the rate follows the concentration one-for-one. The exponent is what scales the change, so squaring applies to the factor you multiply by, not just to the concentration.',
  'The rate halves': 'This treats a larger concentration as slowing the reaction. Concentration and rate move in the same direction here; only how fast they move together is in question.',
  'The rate increases by 2': 'This adds the factor rather than multiplying by it. A rate law is multiplicative, so a doubled concentration scales the rate rather than shifting it up a step.',
  'The rate order becomes second': 'This confuses the order of the reaction with the effect of changing a concentration. The order is a fixed property of the rate law; it does not change when you change how much is in the flask.',
};

function evaluate(submitted: string, notes: unknown = NOTES_FROM_MODEL) {
  const correct = normalizeAnswer(submitted) === normalizeAnswer(EXPECTED);
  return {
    correct,
    teaching: buildTeaching({
      correct,
      submittedAnswer: submitted,
      explanation: EXPLANATION,
      topics: TOPICS,
      distractorNotes: sanitizeDistractorNotes(notes, CHOICES, EXPECTED),
    }),
  };
}

// ── the seven required answer shapes ────────────────────────────────────────

Deno.test('correct answer is never treated as a misconception', () => {
  const { correct, teaching } = evaluate('The rate quadruples');
  assertEquals(correct, true);
  assertEquals(teaching, null);
});

Deno.test('correct answer is recognised despite letter prefix and casing', () => {
  const { correct, teaching } = evaluate('A) the rate  QUADRUPLES');
  assertEquals(correct, true);
  assertEquals(teaching, null);
});

Deno.test('plausible distractor is taught as a misconception, not as a verdict', () => {
  const { correct, teaching } = evaluate('The rate doubles');
  assertEquals(correct, false);
  assertEquals(teaching?.chosen, 'The rate doubles');
  assertEquals(teaching?.misconception?.includes('first order'), true);
  assertEquals(teaching?.why_correct, EXPLANATION);
  assertEquals(teaching?.focus, 'second-order rate laws');
});

Deno.test('opposite-concept choice gets its own explanation', () => {
  const t = evaluate('The rate halves').teaching;
  assertEquals(t?.misconception?.includes('same direction'), true);
});

Deno.test('arithmetic slip gets its own explanation', () => {
  const t = evaluate('The rate increases by 2').teaching;
  assertEquals(t?.misconception?.includes('adds the factor'), true);
});

Deno.test('terminology confusion gets its own explanation', () => {
  const t = evaluate('The rate order becomes second').teaching;
  assertEquals(t?.misconception?.includes('order of the reaction'), true);
});

Deno.test('THE SELECTED ANSWER DRIVES THE FEEDBACK — four wrong picks, four replies', () => {
  const wrong = ['The rate doubles', 'The rate halves', 'The rate increases by 2', 'The rate order becomes second'];
  const seen = wrong.map((w) => evaluate(w).teaching?.misconception);
  for (const m of seen) assertNotEquals(m, null);
  assertEquals(new Set(seen).size, 4, 'every distractor must get a distinct explanation');
  // ...and none of them is just the stored explanation reworded.
  for (const m of seen) assertNotEquals(m, EXPLANATION);
});

Deno.test('unrelated answer with no note falls back rather than inventing one', () => {
  // A choice the question never offered: nothing truthful can be said about it.
  const { correct, teaching } = evaluate('The reaction becomes exothermic');
  assertEquals(correct, false);
  assertEquals(teaching, null);
});

// ── degradation: every one of these must return null, never throw ───────────

Deno.test('a question generated before this feature degrades to previous behaviour', () => {
  // A row written before migration 130 has '{}' from the column default; an
  // older read path could hand through null or undefined. All three must land
  // on exactly the behaviour that shipped before.
  assertEquals(evaluate('The rate doubles', {}).teaching, null);
  assertEquals(evaluate('The rate doubles', null).teaching, null);
  // Called directly: `undefined` through the helper would hit its default
  // argument and silently test the populated case instead of this one.
  assertEquals(
    buildTeaching({
      correct: false, submittedAnswer: 'The rate doubles',
      explanation: EXPLANATION, topics: TOPICS, distractorNotes: undefined,
    }),
    null,
  );
});

Deno.test('malformed notes never throw and never leak', () => {
  for (const junk of [[], 'a string', 42, true, { 'The rate doubles': 99 }, { 'The rate doubles': null }, { 'The rate doubles': '   ' }]) {
    assertEquals(evaluate('The rate doubles', junk).teaching, null, `junk: ${JSON.stringify(junk)}`);
  }
});

// ── sanitisation ────────────────────────────────────────────────────────────

Deno.test('a note about the CORRECT answer is discarded', () => {
  const notes = sanitizeDistractorNotes(
    { 'The rate quadruples': 'this is the right one', 'The rate doubles': 'first-order thinking' },
    CHOICES, EXPECTED,
  );
  assertEquals(Object.keys(notes), ['the rate doubles']);
});

Deno.test('a note about a choice that was never offered is discarded', () => {
  const notes = sanitizeDistractorNotes(
    { 'The rate triples': 'not a choice on this question' }, CHOICES, EXPECTED,
  );
  assertEquals(notes, {});
});

Deno.test('notes are matched however the model cased or lettered the key', () => {
  const notes = sanitizeDistractorNotes({ 'b) THE RATE   DOUBLES': 'first-order thinking' }, CHOICES, EXPECTED);
  assertEquals(notes['the rate doubles'], 'first-order thinking');
});

Deno.test('an over-long note is clamped rather than rejected', () => {
  const notes = sanitizeDistractorNotes({ 'The rate doubles': 'x'.repeat(5000) }, CHOICES, EXPECTED);
  assertEquals(notes['the rate doubles'].length, 600);
});

Deno.test('sanitiser returns an empty object for anything unusable', () => {
  for (const junk of [null, undefined, [], 'text', 7, { a: 1 }]) {
    assertEquals(sanitizeDistractorNotes(junk, CHOICES, EXPECTED), {});
  }
});

// ── the shared normaliser: grader and note lookup must never disagree ───────

Deno.test('normaliser strips letter prefixes, case and extra whitespace', () => {
  assertEquals(normalizeAnswer('B) The Rate  Doubles'), 'the rate doubles');
  assertEquals(normalizeAnswer('  c.  the rate doubles '), 'the rate doubles');
  assertEquals(normalizeAnswer('d - The rate doubles'), 'the rate doubles');
  assertEquals(normalizeAnswer('The rate doubles'), 'the rate doubles');
});

Deno.test('a choice judged wrong always has its note found under the same key', () => {
  // The regression this guards: if the grader and the lookup normalised
  // differently, a student could be marked wrong and then get no teaching for
  // the exact choice they picked.
  for (const choice of CHOICES) {
    const isCorrect = normalizeAnswer(choice) === normalizeAnswer(EXPECTED);
    const notes = sanitizeDistractorNotes(NOTES_FROM_MODEL, CHOICES, EXPECTED);
    assertEquals(
      Object.prototype.hasOwnProperty.call(notes, normalizeAnswer(choice)),
      !isCorrect,
      `choice: ${choice}`,
    );
  }
});

Deno.test('focus is omitted when the question carried no usable topic', () => {
  const t = buildTeaching({
    correct: false, submittedAnswer: 'The rate doubles', explanation: EXPLANATION,
    topics: ['   ', ''], distractorNotes: sanitizeDistractorNotes(NOTES_FROM_MODEL, CHOICES, EXPECTED),
  });
  assertEquals(t?.focus, null);
  assertNotEquals(t?.misconception, null);
});
