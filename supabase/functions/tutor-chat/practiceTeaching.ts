/**
 * What to say to a student who picked the wrong choice.
 *
 * The old evaluation could only say "the best answer is X" — its explanation
 * was written with the question, before anyone had answered, so it addressed
 * nobody in particular. A wrong choice is not noise though: it is a thing the
 * student believed, and which wrong choice they believed is the most specific
 * information the practice loop ever gets about them.
 *
 * Practice is closed-set multiple choice, so every wrong answer a student CAN
 * give is already known at the moment the question is written. That is why the
 * teaching is generated then, alongside the question, rather than by a second
 * model call at evaluation time: the student is waiting during evaluation, and
 * a call there would add seconds, cost, a timeout path and a quota charge to
 * the one moment that must never stall. Here it costs a few dozen extra output
 * tokens on a call that was happening anyway, and it is deterministic — the
 * same mistake is taught the same way every time.
 *
 * Pure and dependency-free so it can be tested directly; index.ts owns all I/O.
 */

/**
 * Compare two answers the way a student means them.
 *
 * Shared with the correctness check in index.ts ON PURPOSE. If the note lookup
 * normalised even slightly differently from the grader, a student could be told
 * they were wrong and then have no note found for the very choice they picked,
 * which is the one case this whole file exists to handle.
 *
 * The leading strip exists so "a) Mitochondria" and "Mitochondria" compare
 * equal — models label their options inconsistently. But the pattern also
 * matches a letter grade, and a letter grade is ANSWER CONTENT, not a label:
 * "A-" is `a` followed by a separator with nothing after it, so it used to
 * normalise to the empty string. Live consequence, on a real PSY 100 question
 * whose choices were ["A-","B+","B","A"] — and far worse on the grade-scale
 * questions that course generates, where ["A-","B-","C-","D-"] collapsed to a
 * single empty key and made EVERY answer compare equal to the expected one.
 *
 * So the strip now only applies when something survives it. A token that is
 * entirely prefix was never a prefix. Semora's own grade vocabulary is
 * [A-F][+-]? (lib/grades.ts), and every form in it now round-trips intact.
 */
export function normalizeAnswer(value: string): string {
  const base = value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const stripped = base.replace(/^[a-d][).:\s-]+/, '');
  return stripped.length > 0 ? stripped : base;
}

/** One or two sentences per wrong choice; anything longer is a lecture. */
const MAX_NOTE_LENGTH = 600;

/**
 * Validate the model's distractor notes into a map keyed by normalised choice.
 *
 * Best-effort BY DESIGN. A malformed or missing note must never cost the
 * student their question — the caller keeps its existing hard validation for
 * the fields a question cannot exist without, and simply gets `{}` here when
 * the model returns nothing usable. Notes for the correct answer, or for text
 * that is not one of the offered choices, are dropped rather than stored: they
 * would be teaching about a choice the student was never able to make.
 */
export function sanitizeDistractorNotes(
  raw: unknown,
  choices: string[],
  expectedAnswer: string,
): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const correct = normalizeAnswer(expectedAnswer);
  const offered = new Map<string, string>();
  for (const choice of choices) {
    const key = normalizeAnswer(choice);
    if (key && key !== correct) offered.set(key, choice);
  }

  const notes: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof rawValue !== 'string') continue;
    const key = normalizeAnswer(rawKey);
    if (!offered.has(key)) continue;
    const text = rawValue.trim().slice(0, MAX_NOTE_LENGTH);
    if (text) notes[key] = text;
  }
  return notes;
}

/**
 * The teaching payload for one answered question, or null when there is
 * nothing to teach.
 *
 * Null for a correct answer, deliberately: a student who got it right has not
 * shown a misconception, and dressing a correct answer up as one would be both
 * wrong and discouraging. Null also when the question predates this feature and
 * carries no notes, so old rows degrade to exactly the previous behaviour.
 */
export interface PracticeTeaching {
  /** Echoed so the client renders what they picked without re-deriving it. */
  chosen: string;
  /** What that choice confuses, and why it was tempting. Null when unknown. */
  misconception: string | null;
  /** What the correct answer actually turns on. */
  why_correct: string;
  /** The concept worth looking at next. Null when the question named none. */
  focus: string | null;
}

export function buildTeaching(input: {
  correct: boolean;
  submittedAnswer: string;
  explanation: string;
  topics: string[];
  distractorNotes: unknown;
}): PracticeTeaching | null {
  if (input.correct) return null;

  const notes = input.distractorNotes && typeof input.distractorNotes === 'object' && !Array.isArray(input.distractorNotes)
    ? input.distractorNotes as Record<string, unknown>
    : {};
  const raw = notes[normalizeAnswer(input.submittedAnswer)];
  const misconception = typeof raw === 'string' && raw.trim() ? raw.trim().slice(0, MAX_NOTE_LENGTH) : null;

  // A row with no note for this choice has nothing this feature can add, so it
  // reports nothing rather than padding out the stored explanation. The caller
  // still returns the ordinary feedback string, which is what shipped before.
  if (!misconception) return null;

  const focus = input.topics.find((topic) => typeof topic === 'string' && topic.trim())?.trim() ?? null;
  return {
    chosen: input.submittedAnswer.trim().slice(0, 500),
    misconception,
    why_correct: input.explanation.trim().slice(0, 4000),
    focus,
  };
}
