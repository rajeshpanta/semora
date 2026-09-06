/**
 * How much of an answer the student can actually read without scrolling.
 *
 * Phase 2 established that layout follows content need rather than device
 * names, and this is the same rule applied to the answer itself. The question
 * is not "is this an iPhone" — it is "how many characters of prose fit on one
 * screenful of the answer column here, right now".
 *
 * That single quantity folds in every axis that matters, and folds them in the
 * way they actually interact:
 *
 *   columnWidth  ÷ character width  = characters per line
 *   usableHeight ÷ line height      = lines per screen
 *
 * Character width and line height are both proportional to the text size, so
 * font scale divides into BOTH terms — a student at 3x Dynamic Type sees
 * roughly a ninth of the characters, not a third. That is why a 1194pt iPad at
 * an accessibility size classifies as compact without a single special case
 * for it: it genuinely holds less readable text than a default-text phone.
 *
 * Pure and dependency-free; the screen supplies the geometry it already has.
 */

export type ReadingSpace = 'compact' | 'regular' | 'roomy';

/** RichText renders body prose at this size before Dynamic Type scales it. */
const BODY_FONT_SIZE = 15;
/** RichText: lineHeight = round(fontSize * 1.45). */
const LINE_HEIGHT_RATIO = 1.45;
/**
 * Average advance width as a fraction of the em, for the app's sans at running
 * text. Approximate on purpose — this feeds a three-way bucket, not a layout.
 */
const AVG_CHAR_EM = 0.5;

/**
 * Thresholds in characters-per-screenful, chosen against the real Phase 2
 * matrix rather than picked round: a 375pt phone lands at roughly 1,000 and a
 * full-height iPad portrait column at roughly 3,200, so the boundaries sit in
 * the empty space between the clusters rather than through the middle of one.
 */
const COMPACT_BELOW = 1300;
const ROOMY_ABOVE = 2600;

export interface ReadingSpaceInput {
  /** The measured prose column, after any rail has taken its share. */
  columnWidth: number;
  /** Window height minus the navigation bar, context line and composer. */
  usableHeight: number;
  /** The OS text scale, unclamped. */
  fontScale: number;
}

/** Roughly how many characters of prose fit on one screen of the answer. */
export function charactersPerScreen(input: ReadingSpaceInput): number {
  const scale = input.fontScale > 0 ? input.fontScale : 1;
  const fontSize = BODY_FONT_SIZE * scale;
  const perLine = Math.max(1, input.columnWidth) / (fontSize * AVG_CHAR_EM);
  const lines = Math.max(1, input.usableHeight) / (fontSize * LINE_HEIGHT_RATIO);
  return Math.round(perLine * lines);
}

export function readingSpaceFor(input: ReadingSpaceInput): ReadingSpace {
  const chars = charactersPerScreen(input);
  if (chars < COMPACT_BELOW) return 'compact';
  if (chars > ROOMY_ABOVE) return 'roomy';
  return 'regular';
}
