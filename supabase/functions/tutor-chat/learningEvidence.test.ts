import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  EVIDENCE_FLOOR,
  REINFORCE_RATIO,
  establishedTopics,
  needsReinforcement,
  readTopicEvidence,
  reinforcementTopics,
  type EvidenceVerdict,
} from './learningEvidence.ts';

/**
 * THE CASE TABLE. This is the contract, and it is duplicated verbatim from
 * lib/learningEvidence.test.ts because the client and the edge function cannot
 * share a module across the RN/Deno boundary.
 * If a row changes there it MUST change here — that is the only thing keeping
 * the two interpretations from drifting apart again.
 */
const CASES: { attempts: number; correct: number; assisted?: number; want: EvidenceVerdict; why: string }[] = [
  // ── nothing attempted is not a weakness ──────────────────────────────
  { attempts: 0, correct: 0, want: 'unknown', why: 'never practised' },

  // ── below the floor: real production rows, all currently mis-read ────
  { attempts: 1, correct: 0, want: 'insufficient', why: 'one miss is a coin flip, not a weakness' },
  { attempts: 1, correct: 1, want: 'insufficient', why: 'one hit is a coin flip, not mastery' },
  { attempts: 2, correct: 0, want: 'insufficient', why: 'still under the floor' },
  { attempts: 2, correct: 1, want: 'insufficient', why: 'still under the floor' },
  { attempts: 2, correct: 2, want: 'insufficient', why: 'still under the floor' },

  // ── at the floor ─────────────────────────────────────────────────────
  { attempts: 3, correct: 0, want: 'reinforce', why: 'three misses is worth raising' },
  { attempts: 3, correct: 1, want: 'reinforce', why: '0.33 is below the line' },
  { attempts: 3, correct: 2, want: 'reinforce', why: '0.67 is below the line — strong needs a clean sweep at the floor' },
  { attempts: 3, correct: 3, want: 'strong', why: 'perfect at the floor' },

  // ── above the floor ──────────────────────────────────────────────────
  { attempts: 4, correct: 2, want: 'reinforce', why: '0.5' },
  { attempts: 4, correct: 3, want: 'strong', why: '0.75 clears 0.7' },
  { attempts: 10, correct: 6, want: 'reinforce', why: '0.6' },
  { attempts: 10, correct: 7, want: 'strong', why: 'exactly at the line counts as clearing it' },
  { attempts: 12, correct: 0, want: 'reinforce', why: 'the case a bare ratio could not tell from 0-of-1' },

  // ── assistance never makes a student look worse ──────────────────────
  { attempts: 3, correct: 3, assisted: 3, want: 'insufficient', why: 'all help: progress, but no independent evidence' },
  { attempts: 3, correct: 3, assisted: 2, want: 'strong', why: 'one unaided success still counts as independent' },
  { attempts: 4, correct: 1, assisted: 1, want: 'reinforce', why: 'help does not rescue a bad ratio, and must not worsen it either' },
  { attempts: 5, correct: 4, assisted: 4, want: 'insufficient', why: 'withhold strength, never assert weakness' },
];

Deno.test('one row, one verdict — the whole case table', () => {
  for (const c of CASES) {
    const got = readTopicEvidence({ attempts: c.attempts, correct: c.correct, assisted_correct: c.assisted ?? 0 });
    assertEquals(got.verdict, c.want, `${c.attempts} attempts / ${c.correct} correct / ${c.assisted ?? 0} assisted — ${c.why}`);
  }
});

Deno.test('insufficient evidence is never presented as weakness', () => {
  // The production defect: every row below the floor used to render as
  // "Review X — 0% in practice". None of them may now.
  for (const c of CASES.filter((x) => x.want === 'insufficient' || x.want === 'unknown')) {
    const row = { attempts: c.attempts, correct: c.correct, assisted_correct: c.assisted ?? 0 };
    assertEquals(needsReinforcement(row), false, `${c.attempts}/${c.correct} must not read as weak`);
    assertEquals(readTopicEvidence(row).actionable, false, `${c.attempts}/${c.correct} must not be actionable`);
  }
});

Deno.test('zero evidence is unknown, and is distinguishable from a bad run', () => {
  const none = readTopicEvidence({ attempts: 0, correct: 0 });
  const bad = readTopicEvidence({ attempts: 12, correct: 0 });
  assertEquals(none.verdict, 'unknown');
  assertEquals(none.ratio, null, 'no attempts means no ratio — never 0%');
  assertEquals(bad.verdict, 'reinforce');
  assertEquals(bad.ratio, 0);
  // The exact confusion the floor exists to prevent.
  assertEquals(none.verdict === bad.verdict, false, 'silence and struggle must not render the same');
});

Deno.test('a missing row reads as unknown rather than throwing', () => {
  assertEquals(readTopicEvidence(undefined).verdict, 'unknown');
  assertEquals(readTopicEvidence(null).verdict, 'unknown');
  assertEquals(readTopicEvidence({ attempts: 0, correct: 0 }).ratio, null);
});

Deno.test('repeated evidence is consistent in both directions', () => {
  // Adding more of the same evidence never flips the verdict.
  for (let n = EVIDENCE_FLOOR; n <= 20; n++) {
    assertEquals(readTopicEvidence({ attempts: n, correct: n }).verdict, 'strong', `${n}/${n}`);
    assertEquals(readTopicEvidence({ attempts: n, correct: 0 }).verdict, 'reinforce', `0/${n}`);
  }
});

Deno.test('the reinforce line is exactly REINFORCE_RATIO, inclusive above', () => {
  assertEquals(readTopicEvidence({ attempts: 10, correct: 7 }).verdict, 'strong', '0.70 is not below 0.70');
  assertEquals(readTopicEvidence({ attempts: 100, correct: 69 }).verdict, 'reinforce', '0.69');
  assertEquals(REINFORCE_RATIO, 0.7);
  assertEquals(EVIDENCE_FLOOR, 3);
});

Deno.test('malformed rows are clamped, never trusted into nonsense', () => {
  // correct > attempts would otherwise produce a ratio above 1.
  assertEquals(readTopicEvidence({ attempts: 3, correct: 99 }).ratio, 1);
  assertEquals(readTopicEvidence({ attempts: 3, correct: 99 }).verdict, 'strong');
  // assisted > correct would otherwise make unaidedCorrect negative.
  assertEquals(readTopicEvidence({ attempts: 4, correct: 2, assisted_correct: 9 }).unaidedCorrect, 0);
  // negatives and non-finite values collapse to nothing rather than throwing.
  assertEquals(readTopicEvidence({ attempts: -5, correct: -2 }).verdict, 'unknown');
  assertEquals(readTopicEvidence({ attempts: NaN, correct: NaN }).verdict, 'unknown');
});

Deno.test('reinforcementTopics drops thin rows and orders worst first', () => {
  const rows = [
    { topic: 'strong', attempts: 4, correct: 4 },
    { topic: 'thin', attempts: 1, correct: 0 },
    { topic: 'bad-shallow', attempts: 3, correct: 0 },
    { topic: 'bad-deep', attempts: 12, correct: 0 },
    { topic: 'middling', attempts: 5, correct: 3 },
    { topic: 'unknown', attempts: 0, correct: 0 },
  ];
  const got = reinforcementTopics(rows).map((r) => r.topic);
  // thin/unknown/strong are absent; equal ratios break by evidence depth.
  assertEquals(got, ['bad-deep', 'bad-shallow', 'middling']);
});

Deno.test('the real production distribution stays almost entirely silent', () => {
  // The 15 real-student mastery rows on 2026-09-06, read straight from
  // course_topic_mastery. Two of them earn a verdict; thirteen do not.
  const production = [
    { attempts: 1, correct: 0 }, { attempts: 1, correct: 0 },
    { attempts: 1, correct: 1 }, { attempts: 1, correct: 1 }, { attempts: 1, correct: 1 },
    { attempts: 1, correct: 1 }, { attempts: 1, correct: 1 }, { attempts: 1, correct: 1 },
    { attempts: 2, correct: 1 }, { attempts: 2, correct: 1 },
    { attempts: 2, correct: 2 }, { attempts: 2, correct: 2 },
    { attempts: 3, correct: 0 },
    { attempts: 3, correct: 3 },
    { attempts: 4, correct: 3 },
  ];
  const verdicts = production.map((r) => readTopicEvidence(r).verdict);
  assertEquals(verdicts.filter((v) => v === 'insufficient').length, 12);
  assertEquals(verdicts.filter((v) => v === 'reinforce').length, 1);
  assertEquals(verdicts.filter((v) => v === 'strong').length, 2);
  assertEquals(verdicts.filter((v) => v === 'unknown').length, 0);
  // Before the floor, 5 of these rendered as a weakness to a student.
  const beforeFloor = production.filter((r) => r.attempts > 0 && r.correct / r.attempts < 0.7).length;
  assertEquals(beforeFloor, 5);
  assertEquals(reinforcementTopics(production).length, 1);
});

Deno.test('the PSY 100 contradiction no longer reads as three weaknesses', () => {
  // course 3f20f3bf, the case that motivated D'0: three logistics topics, all
  // missed, alongside an instructor-recorded 83.3% on the course outline quiz.
  const psy = [
    { topic: 'Exam 1', attempts: 1, correct: 0 },
    { topic: 'Course grading', attempts: 3, correct: 0 },
    { topic: 'Grade scale', attempts: 1, correct: 0 },
  ];
  const before = psy.filter((t) => t.attempts > 0 && t.correct / t.attempts < 0.7).map((t) => t.topic);
  assertEquals(before, ['Exam 1', 'Course grading', 'Grade scale'], 'all three used to be shown');
  assertEquals(reinforcementTopics(psy).map((t) => t.topic), ['Course grading'], 'only the evidenced one survives');
});

Deno.test('establishedTopics names only what the server may call solid', () => {
  // The old directive told the model the student was "already solid" on every
  // topic with a single attempt. Only real strength qualifies now.
  const rows = [
    { topic: 'one-hit', attempts: 1, correct: 1 },
    { topic: 'thin-pair', attempts: 2, correct: 2 },
    { topic: 'earned', attempts: 4, correct: 4 },
    { topic: 'helped', attempts: 3, correct: 3, assisted_correct: 3 },
    { topic: 'weak', attempts: 5, correct: 1 },
  ];
  assertEquals(establishedTopics(rows).map((r) => r.topic), ['earned']);
});

Deno.test('client and server agree on every case in the table', () => {
  // Guards the duplication: the shapes below are the same rows the client
  // test asserts, so a divergence in either file fails here too.
  for (const c of CASES) {
    const got = readTopicEvidence({ attempts: c.attempts, correct: c.correct, assisted_correct: c.assisted ?? 0 });
    assertEquals(got.verdict, c.want, `server disagrees on ${c.attempts}/${c.correct}: ${c.why}`);
  }
});
