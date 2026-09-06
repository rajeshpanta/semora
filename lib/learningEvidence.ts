/**
 * What a pile of practice attempts is allowed to claim about a student.
 *
 * Four places used to answer this question and three of them disagreed. The
 * starter prompt called a topic weak at `attempts > 0`, the re-explanation
 * gate required `attempts >= 2`, the course-intelligence panel printed a
 * percentage at `attempts > 0`, and the server picked the next question from
 * whatever sorted worst. Same row, same student, different verdicts.
 *
 * Worse, none of them separated the two questions a ratio conflates:
 *
 *   how much evidence is there?      attempts
 *   how did it go?                   correct / attempts
 *
 * One number cannot hold both, so 0-of-1 and 0-of-12 both rendered as "0% in
 * practice". A student who answered one question about a topic and missed it
 * was shown the same weakness as one who had missed twelve. That is the defect
 * this module exists to remove: below the floor Semora has an OPINION about
 * nothing, and says so, rather than converting thin evidence into confidence.
 *
 * THE FLOOR IS 3 and it is deliberately blunt. Practice questions are
 * multiple-choice with 2-4 options, so a student guessing at random gets a
 * single question right about a third of the time — one attempt is a coin
 * flip wearing a percentage. Three is the smallest count where a clean sweep
 * is unlikely enough to mean something, and it falls out of the arithmetic
 * that a topic cannot reach `strong` at the floor without being answered
 * perfectly: 2 of 3 is 0.67, which is below the reinforce line.
 *
 * It is NOT a statistical guarantee and is not presented as one. It is the
 * smallest defensible number, chosen so Semora under-claims rather than over-
 * claims, and it is one constant to revise when there is enough real evidence
 * to argue with it. On the production distribution today it leaves 13 of 15
 * real topic rows saying "not enough evidence yet", which is the honest answer.
 *
 * ASSISTANCE IS NEVER A PENALTY. Migration 133 records how much help preceded
 * an answer and states the rule plainly: assisted successes are counted
 * alongside unaided ones and never subtracted. This module keeps that. Help
 * can only ever withhold a claim of STRENGTH — a topic answered correctly but
 * only ever with help reads as "not enough evidence" of independent mastery,
 * never as a weakness. Asking for help must not be able to make a student look
 * worse than staying silent.
 *
 * Pure and dependency-free. Mirrored for the server in
 * supabase/functions/tutor-chat/learningEvidence.ts — the two files carry the
 * same case table in their tests and must be changed together.
 */

/**
 * What Semora is entitled to say about one topic.
 *
 *   unknown       nothing has ever been attempted — not weakness, absence
 *   insufficient  attempted, but too little to judge (or progress made only with help)
 *   reinforce     enough evidence, and it is going badly
 *   strong        enough evidence, and it is going well
 */
export type EvidenceVerdict = 'unknown' | 'insufficient' | 'reinforce' | 'strong';

/**
 * Attempts required before any judgement is offered. See the header — this is
 * the smallest defensible number, not a tuned one.
 */
export const EVIDENCE_FLOOR = 3;

/**
 * At or above the floor, accuracy below this reads as needing reinforcement.
 * Unchanged from what all four readers already used; only the floor is new.
 */
export const REINFORCE_RATIO = 0.7;

/** The shape every mastery row satisfies, whoever fetched it. */
export interface TopicEvidence {
  attempts: number;
  correct: number;
  /** Migration 133. Absent on rows read before it, and 0 everywhere today. */
  assisted_correct?: number | null;
}

export interface EvidenceReading {
  verdict: EvidenceVerdict;
  attempts: number;
  correct: number;
  /** Correct answers reached without help — the only kind that proves independence. */
  unaidedCorrect: number;
  /** Accuracy, or null when there is nothing to divide. Never coerced to 0. */
  ratio: number | null;
  /** True when the verdict rests on enough evidence to act on. */
  actionable: boolean;
}

function coerceCount(value: number | null | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? Math.floor(value as number) : 0;
}

/**
 * The single interpretation of a mastery row. Every reader goes through here.
 */
export function readTopicEvidence(row: TopicEvidence | null | undefined): EvidenceReading {
  const attempts = coerceCount(row?.attempts);
  // A row can never have more correct than attempts (migration 057 has no such
  // constraint, so clamp rather than trust) and never more assisted than
  // correct (133 does constrain that, but the client reads rows, not checks).
  const correct = Math.min(coerceCount(row?.correct), attempts);
  const assisted = Math.min(coerceCount(row?.assisted_correct), correct);
  const unaidedCorrect = correct - assisted;
  const ratio = attempts > 0 ? correct / attempts : null;

  const base = { attempts, correct, unaidedCorrect, ratio };

  if (attempts <= 0) {
    return { ...base, verdict: 'unknown', actionable: false };
  }
  if (attempts < EVIDENCE_FLOOR) {
    return { ...base, verdict: 'insufficient', actionable: false };
  }
  if ((ratio as number) < REINFORCE_RATIO) {
    return { ...base, verdict: 'reinforce', actionable: true };
  }
  // Cleared the bar, but every success needed help. That is real progress and
  // it is not independent mastery, so withhold the claim instead of inventing
  // one — and never fall through to `reinforce`, which would punish the ask.
  if (correct > 0 && unaidedCorrect === 0) {
    return { ...base, verdict: 'insufficient', actionable: false };
  }
  return { ...base, verdict: 'strong', actionable: true };
}

/** True only when Semora has earned the right to call a topic weak. */
export function needsReinforcement(row: TopicEvidence | null | undefined): boolean {
  return readTopicEvidence(row).verdict === 'reinforce';
}

/**
 * The topics worth raising, worst first.
 *
 * Ordered by accuracy ascending and then by attempts descending, so that
 * between two equally poor topics the better-evidenced one leads. Rows below
 * the floor are dropped entirely rather than ranked last — an unranked topic
 * cannot leak into a "top 2" slice on a quiet screen.
 */
export function reinforcementTopics<T extends TopicEvidence>(rows: readonly T[]): T[] {
  return rows
    .filter((row) => needsReinforcement(row))
    .sort((a, b) => {
      const ra = readTopicEvidence(a);
      const rb = readTopicEvidence(b);
      return (ra.ratio as number) - (rb.ratio as number) || rb.attempts - ra.attempts;
    });
}
