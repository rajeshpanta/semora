/**
 * What a pile of practice attempts is allowed to claim about a student.
 *
 * SERVER MIRROR of lib/learningEvidence.ts. The client is React Native and
 * this is Deno, so the module cannot be shared — but the interpretation must
 * be identical, or the screen and the question generator go back to disagreeing
 * about the same row. The two test files carry the same case table verbatim;
 * change one and you must change both.
 *
 * The rules, in full (the client copy carries the long-form reasoning):
 *
 *   attempts 0            unknown       nothing attempted — absence, not weakness
 *   attempts < 3          insufficient  too thin to judge; a 4-choice guess lands
 *                                       often enough that one attempt means nothing
 *   ratio < 0.7           reinforce     enough evidence, going badly
 *   all successes helped  insufficient  progress, but no evidence of independence
 *   otherwise             strong        enough evidence, going well
 *
 * Assistance can only ever withhold a claim of STRENGTH. It must never turn a
 * student who asked for help into a student who looks weak — migration 133
 * counts assisted successes alongside unaided ones and never subtracts them.
 */

export type EvidenceVerdict = 'unknown' | 'insufficient' | 'reinforce' | 'strong';

export const EVIDENCE_FLOOR = 3;
export const REINFORCE_RATIO = 0.7;

export interface TopicEvidence {
  attempts: number;
  correct: number;
  assisted_correct?: number | null;
}

export interface EvidenceReading {
  verdict: EvidenceVerdict;
  attempts: number;
  correct: number;
  unaidedCorrect: number;
  ratio: number | null;
  actionable: boolean;
}

function coerceCount(value: number | null | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? Math.floor(value as number) : 0;
}

export function readTopicEvidence(row: TopicEvidence | null | undefined): EvidenceReading {
  const attempts = coerceCount(row?.attempts);
  const correct = Math.min(coerceCount(row?.correct), attempts);
  const assisted = Math.min(coerceCount(row?.assisted_correct), correct);
  const unaidedCorrect = correct - assisted;
  const ratio = attempts > 0 ? correct / attempts : null;

  const base = { attempts, correct, unaidedCorrect, ratio };

  if (attempts <= 0) return { ...base, verdict: 'unknown', actionable: false };
  if (attempts < EVIDENCE_FLOOR) return { ...base, verdict: 'insufficient', actionable: false };
  if ((ratio as number) < REINFORCE_RATIO) return { ...base, verdict: 'reinforce', actionable: true };
  if (correct > 0 && unaidedCorrect === 0) return { ...base, verdict: 'insufficient', actionable: false };
  return { ...base, verdict: 'strong', actionable: true };
}

export function needsReinforcement(row: TopicEvidence | null | undefined): boolean {
  return readTopicEvidence(row).verdict === 'reinforce';
}

/**
 * The topics worth raising, worst first. Rows below the floor are dropped
 * rather than ranked last, so a thin row can never lead the list.
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

/** Topics Semora has actually earned the right to call solid. */
export function establishedTopics<T extends TopicEvidence>(rows: readonly T[]): T[] {
  return rows.filter((row) => readTopicEvidence(row).verdict === 'strong');
}
