/**
 * What was being said when the student tapped "Mark important" (plan 4.4).
 *
 * Pure — tested in lectureMoments.test.ts. A mark is a number of seconds of
 * captured audio. Parts are laid end to end by seq using each part's own
 * length, and a part's timings (145) say when each sentence inside it began.
 * The excerpt for a mark is what was said from a little before the tap (the
 * student taps AFTER hearing the point) to just after it.
 */

export interface TimedPart {
  seq: number;
  seconds: number | null;
  timings: [number, number, string][] | null;
}

export const LOOK_BACK_SECONDS = 45;
export const LOOK_AHEAD_SECONDS = 10;
const EXCERPT_MAX_CHARS = 450;
export const MAX_EXCERPTS = 30;

export function markedExcerpts(parts: TimedPart[], marks: number[] | null | undefined): string[] {
  if (!marks?.length || !parts.length) return [];
  const ordered = [...parts].sort((a, b) => a.seq - b.seq);
  const pieces: { start: number; end: number; text: string }[] = [];
  let offset = 0;
  for (const part of ordered) {
    for (const t of part.timings ?? []) {
      if (!Array.isArray(t) || typeof t[2] !== 'string') continue;
      pieces.push({ start: offset + Number(t[0] || 0), end: offset + Number(t[1] || 0), text: t[2] });
    }
    offset += Math.max(0, Number(part.seconds) || 0);
  }
  if (!pieces.length) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const mark of [...marks].sort((a, b) => a - b)) {
    const from = mark - LOOK_BACK_SECONDS;
    const to = mark + LOOK_AHEAD_SECONDS;
    const text = pieces
      .filter((p) => p.end >= from && p.start <= to)
      .map((p) => p.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const clipped = text.length > EXCERPT_MAX_CHARS ? text.slice(text.length - EXCERPT_MAX_CHARS) : text;
    if (seen.has(clipped)) continue;
    seen.add(clipped);
    out.push(clipped);
    if (out.length >= MAX_EXCERPTS) break;
  }
  return out;
}

/** The excerpts that belong to one section of a sectioned transcript. */
export function excerptsInSection(excerpts: string[], section: string): string[] {
  const flat = section.replace(/\s+/g, ' ');
  return excerpts.filter((e) => {
    const probe = e.slice(Math.max(0, Math.floor(e.length / 2) - 20), Math.floor(e.length / 2) + 20).trim();
    return probe.length > 0 && flat.includes(probe);
  });
}

/** The prompt block, or '' when there is nothing marked. */
export function markedMomentsInstruction(excerpts: string[]): string {
  if (!excerpts.length) return '';
  return [
    'MARKED IMPORTANT: while recording, the student tapped "Mark important" at the moments below (each is what was being said at that moment, from the transcript).',
    'Make sure every one of these points is covered fully in the notes, and start the bullet that covers it with ⭐. Do not add ⭐ anywhere else.',
  ].join('\n');
}
