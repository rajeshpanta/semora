/**
 * A recording's title, once its notes exist (147, market-parity-8).
 *
 * The app names a recording before anyone knows what it was about — "Biology
 * 101 · Tue, Sep 16", or just "Lecture" — and most students never rename it.
 * The notes open with a headline naming what the lecture was actually about
 * (NOTES_PROMPT, OVERVIEW_PROMPT), so a lecture still wearing its fallback
 * name takes that headline. A title the student typed or edited is never
 * touched: only the two fallback shapes qualify.
 *
 * Pure, so the rule is tested in lectureTitle.test.ts.
 */

/** "<anything> · Tue, Sep 16" — the app's date-stamped fallback, in English or Spanish. */
export const FALLBACK_TITLE_SHAPE = /^(.+) · (?:[A-Za-zÀ-ÿ]{3}, [A-Za-zÀ-ÿ]{3} \d{1,2}|[A-Za-zÀ-ÿ]{2,4}\.?, \d{1,2} [A-Za-zÀ-ÿ]{3,5}\.?)$/;

/** The server's own fallbacks (lecture-transcribe `start`): 'Lecture', or 'Clase' for a Spanish request. */
const PLAIN_FALLBACKS = new Set(['lecture', 'clase']);

/** A headline that names nothing: the notes' own generic labels. */
const GENERIC_HEADLINES = /^(lecture notes?|notes|class notes|study notes|apuntes( de (la )?clase)?|notas( de (la )?clase)?|lecture|clase)[.!]?$/i;

export const MAX_TITLE_CHARS = 80;

/** Is this title one the app or server made up, rather than one the student chose? */
export function isFallbackTitle(title: string | null | undefined): boolean {
  const t = typeof title === 'string' ? title.trim() : '';
  if (!t) return true;
  return PLAIN_FALLBACKS.has(t.toLowerCase()) || FALLBACK_TITLE_SHAPE.test(t);
}

/** The notes' first "# " heading, trimmed, or null when there is none. */
export function headlineFromNotes(notesMd: string | null | undefined): string | null {
  if (typeof notesMd !== 'string') return null;
  const m = notesMd.match(/^[ \t]*#[ \t]+(.+?)[ \t]*#*[ \t]*$/m);
  if (!m) return null;
  const text = m[1].replace(/\*\*|__/g, '').replace(/\s+/g, ' ').trim();
  return text || null;
}

/**
 * The title a recording should carry after its notes are written, or null to
 * leave it alone: null unless the current title is a fallback and the notes
 * open with a real headline (non-empty, not a generic "Lecture notes"), cut to
 * MAX_TITLE_CHARS.
 */
export function autoTitleFromNotes(currentTitle: string | null | undefined, notesMd: string | null | undefined): string | null {
  if (!isFallbackTitle(currentTitle)) return null;
  const headline = headlineFromNotes(notesMd);
  if (!headline || GENERIC_HEADLINES.test(headline)) return null;
  const cut = headline.length > MAX_TITLE_CHARS ? headline.slice(0, MAX_TITLE_CHARS).trim() : headline;
  if (!cut || cut === (typeof currentTitle === 'string' ? currentTitle.trim() : '')) return null;
  return cut;
}
