/**
 * Ranked, forgiving search over anything in Semora.
 *
 * What this replaces: `field.toLowerCase().includes(query)`. That answers a
 * different question from the one students ask. It says yes or no to a literal
 * substring, in whatever order the database happened to return rows — so
 * "calc midterm" found nothing when the task was called "Midterm Exam" in
 * MATH 241: Calculus II, and typing "biolgy" found nothing at all. A student
 * searching for something they half-remember gets told it does not exist.
 *
 * The model here is the one every search box has trained people to expect:
 *
 *   1. A query is a set of words, not a string. They may appear in any order
 *      and across DIFFERENT fields — "calc midterm" is one word from the
 *      course and one from the title, and that is a very good match.
 *   2. Every word should still count. An item matching all of them beats one
 *      matching some, no matter how well it matches those.
 *   3. Where a word matches matters. A title hit outranks a description hit.
 *   4. How it matches matters. Whole word > start of a word > somewhere inside
 *      > a typo away > letters in the right order.
 *   5. If nothing matches everything, say so and show the closest anyway,
 *      clearly marked. An empty result for a real thing is the worst outcome;
 *      quietly pretending a partial match was what they asked for is second.
 *
 * Pure and dependency-free on purpose — the ranking is the part that is easy
 * to get subtly wrong and impossible to eyeball inside a rendered list, so it
 * has to be runnable on its own against fixed input.
 */

export interface SearchField {
  text: string | null | undefined;
  /** Title-ish fields ~1, supporting context lower. Multiplies the match. */
  weight: number;
}

export interface Candidate<T> {
  item: T;
  fields: SearchField[];
  /**
   * Small nudge for things that are equally good matches but not equally
   * useful — an open task over a finished one, a navigation command over a
   * row. Applied last so it can only break ties, never reorder real matches.
   */
  boost?: number;
}

export interface SearchHit<T> {
  item: T;
  score: number;
  /** False when only some query words matched — the "closest" tail. */
  complete: boolean;
  matchedWords: number;
  totalWords: number;
}

/**
 * Lowercase, strip accents, collapse punctuation to spaces.
 *
 * Accent folding is not decoration here: Semora ships in Spanish, and a
 * student who types "biologia" must find "Biología". Punctuation becomes
 * space rather than nothing so "MATH-241" tokenises the same way a person
 * would read it.
 */
export function normalize(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function tokenize(query: string): string[] {
  const normalized = normalize(query);
  return normalized ? normalized.split(' ').filter(Boolean) : [];
}

/**
 * Levenshtein distance, abandoned as soon as it exceeds `max`.
 *
 * Bounded because the answer is never wanted — only "is this within one or two
 * edits". Computing the true distance between two long unrelated strings is
 * pure waste on a keystroke-by-keystroke path.
 */
function boundedEditDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let previous = new Array(b.length + 1);
  let current = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) previous[j] = j;
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    let rowBest = current[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      if (current[j] < rowBest) rowBest = current[j];
    }
    // Every remaining edit can only add to the best value on this row, so once
    // the whole row is past the budget the final answer is too.
    if (rowBest > max) return max + 1;
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[b.length];
}

/**
 * How many edits to tolerate at a given word length.
 *
 * Nothing for short words: at three letters, one edit turns "lab" into "law"
 * and every three-letter word is suddenly a match for every other. Typo
 * tolerance has to buy more than it costs, and on short words it does not.
 */
function editBudget(length: number): number {
  if (length >= 8) return 2;
  if (length >= 5) return 1;
  return 0;
}

/** Are `token`'s characters present in `text`, in order? Scored by compactness. */
function subsequenceScore(token: string, text: string): number {
  if (token.length < 3) return 0;
  let index = 0;
  let first = -1;
  let last = -1;
  for (let i = 0; i < text.length && index < token.length; i++) {
    if (text[i] === token[index]) {
      if (first < 0) first = i;
      last = i;
      index++;
    }
  }
  if (index < token.length) return 0;
  // "mte" matching "MidTerm Exam" spread over 11 characters is a much weaker
  // signal than the same letters found inside one word, and the span is what
  // tells them apart.
  const span = last - first + 1;
  return 0.34 * (token.length / span);
}

/** Best score this one query word can achieve anywhere in this one field. */
function scoreTokenInField(token: string, fieldText: string, words: string[]): number {
  if (!fieldText) return 0;

  let best = 0;
  for (const word of words) {
    if (word === token) return 1;
    if (word.startsWith(token)) {
      // A prefix that is most of the word ("calcul" of "calculus") is nearly a
      // whole-word match; two letters of a long word is much less.
      best = Math.max(best, 0.72 + 0.16 * (token.length / word.length));
      continue;
    }
    if (word.includes(token)) best = Math.max(best, 0.6);
  }
  if (best >= 0.72) return best;

  // Spans word boundaries: "midtermexam", or a phrase fragment.
  if (fieldText.includes(token)) best = Math.max(best, 0.55);

  const budget = editBudget(token.length);
  if (budget > 0) {
    for (const word of words) {
      if (Math.abs(word.length - token.length) > budget) continue;
      const distance = boundedEditDistance(token, word, budget);
      if (distance <= budget) {
        // One edit on a long word is a typo; two is a guess.
        best = Math.max(best, distance === 1 ? 0.5 : 0.4);
      }
    }
  }

  return Math.max(best, subsequenceScore(token, fieldText));
}

interface PreparedField {
  text: string;
  words: string[];
  weight: number;
}

function prepare(fields: SearchField[]): PreparedField[] {
  const prepared: PreparedField[] = [];
  for (const field of fields) {
    const text = normalize(field.text);
    if (!text) continue;
    prepared.push({ text, words: text.split(' '), weight: field.weight });
  }
  return prepared;
}

export interface SearchOptions {
  /** Items scoring below this are never shown, even as "closest". */
  minScore?: number;
  limit?: number;
}

/**
 * Rank candidates against a query.
 *
 * Returns one list, best first, with `complete: false` on the tail that only
 * matched some of what was typed. Callers render the boundary — the ranking
 * knows which items are honest answers and which are consolation, and hiding
 * that distinction in a flat list is how a search box starts lying quietly.
 */
export function rankCandidates<T>(
  query: string,
  candidates: Candidate<T>[],
  options: SearchOptions = {},
): SearchHit<T>[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const phrase = tokens.join(' ');
  const minScore = options.minScore ?? 0.18;

  const hits: SearchHit<T>[] = [];

  for (const candidate of candidates) {
    const fields = prepare(candidate.fields);
    if (fields.length === 0) continue;

    let total = 0;
    let matched = 0;

    for (const token of tokens) {
      let bestForToken = 0;
      for (const field of fields) {
        const raw = scoreTokenInField(token, field.text, field.words);
        if (raw > 0) bestForToken = Math.max(bestForToken, raw * field.weight);
      }
      if (bestForToken >= minScore) matched++;
      total += bestForToken;
    }

    if (matched === 0) continue;

    // Average rather than sum, so a three-word query cannot outscore a
    // one-word query purely by having more words to add up.
    let score = total / tokens.length;

    // The words in the order they were typed, in one field. This is what makes
    // "midterm exam" beat an item that happens to contain both words far
    // apart, and it is the single strongest signal there is.
    if (tokens.length > 1) {
      for (const field of fields) {
        if (field.text.includes(phrase)) {
          score += (field.text.startsWith(phrase) ? 0.45 : 0.3) * field.weight;
          break;
        }
      }
    }

    // Coverage dominates quality: everything asked for, matched moderately,
    // beats half of it matched perfectly.
    const coverage = matched / tokens.length;
    score *= 0.45 + 0.55 * coverage;

    score += candidate.boost ?? 0;

    if (score < minScore) continue;

    hits.push({
      item: candidate.item,
      score,
      complete: matched === tokens.length,
      matchedWords: matched,
      totalWords: tokens.length,
    });
  }

  hits.sort((a, b) => {
    // Complete matches always come first, however good a partial one looks.
    if (a.complete !== b.complete) return a.complete ? -1 : 1;
    return b.score - a.score;
  });

  return options.limit ? hits.slice(0, options.limit) : hits;
}
