/**
 * Splitting the practice feedback string so it can be shown beside Phase 3A's
 * teaching without saying the same thing twice.
 *
 * The server builds `feedback` as "Not quite. The best answer is X. " plus the
 * question's stored explanation, and Phase 3A's `teaching.why_correct` IS that
 * same stored explanation. Rendering both puts one paragraph on screen twice,
 * word for word, directly under a paragraph that just diagnosed the student's
 * mistake — which reads as padding at the exact moment they are trying to
 * understand something.
 *
 * So the duplicated tail is removed and the useful remainder — the sentence
 * naming the correct choice, which nothing else on screen carries — is kept.
 * The client is never told the expected answer directly (the question row has
 * no client SELECT policy), so this sentence is the only place it appears.
 *
 * Pure, and conservative: anything it does not recognise falls back to showing
 * the original string untouched and suppressing the separate explanation, so a
 * student can never end up with less information than they get today.
 */

/** Server verdict openers, both locales. Stripped only when the tail matched. */
const VERDICT_OPENERS = ['Not quite. ', 'Aún no. ', 'Correct. ', 'Correcto. '];

/**
 * Remove inline emphasis markers from model-written feedback.
 *
 * The tutor is told to write a markdown subset and the practice explanation
 * obeys — but this card renders plain Text, not RichText, so a student saw
 * literal "**secondary active transport**" in the middle of a sentence.
 * RichText is the wrong tool here (it also parses headings, lists and code
 * fences, none of which belong in a three-sentence tinted card), so the
 * markers are removed rather than interpreted. Only PAIRED markers go, which
 * leaves chemistry like Na+/K+ and snake_case terms untouched.
 */
export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[\s(])\*(\S(?:.*?\S)?)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
}

/**
 * Drop the opener the card heading already states.
 *
 * Every branch does this, not just the teaching one: on a correct answer the
 * word "Correct" was reaching the student three times over — on the choice
 * they picked, as the card heading, and again as the first word of the body.
 */
function stripOpener(text: string): string {
  for (const opener of VERDICT_OPENERS) {
    const o = opener.trim();
    if (text.startsWith(o)) return text.slice(o.length).trim();
  }
  return text;
}

/** "The best answer is X.." — the choice already ended in a full stop. */
function tidyTerminal(text: string): string {
  return text.replace(/([.!?])[.]+$/, '$1');
}

export interface SplitFeedback {
  /** The part worth showing above the explanation, or null when nothing is left. */
  verdict: string | null;
  /** The explanation to render separately, or null when it must not be split out. */
  whyCorrect: string | null;
}

const clean = (t: string) => tidyTerminal(stripOpener(stripInlineMarkdown(t).trim()));

export function splitPracticeFeedback(feedback: string, whyCorrect: string | null | undefined): SplitFeedback {
  const full = (feedback ?? '').trim();
  const tail = (whyCorrect ?? '').trim();

  // Nothing to deduplicate against: this is the pre-Phase-3A path and must stay
  // byte-identical to what shipped.
  if (!tail) return { verdict: clean(full) || null, whyCorrect: null };

  if (!full.endsWith(tail)) {
    // The two strings have drifted — a translation, a server change, a stored
    // explanation edited after the fact. Showing the whole feedback and
    // dropping the separate copy is the safe direction: slightly redundant is
    // recoverable, silently missing the correct answer is not.
    return { verdict: clean(full) || null, whyCorrect: null };
  }

  const verdict = full.slice(0, full.length - tail.length);
  return { verdict: clean(verdict) || null, whyCorrect: stripInlineMarkdown(tail).trim() || null };
}
