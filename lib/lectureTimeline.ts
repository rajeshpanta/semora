/**
 * A lecture's transcript as timestamped paragraphs (Record Lecture plan 4.2).
 *
 * Built on the phone from each part's timings (migration 145): parts are laid
 * end to end by seq using each part's own length, sentences are grouped into
 * paragraphs of about a minute, and "Mark important" taps are shown where they
 * happened. A part that never arrived is shown as a gap rather than silently
 * joined over. Lectures transcribed before timings existed have none, and the
 * screen shows the plain transcript instead (hasTimings false).
 *
 * Pure — tested in lectureTimeline.test.ts.
 */

export interface TimelinePart {
  seq: number;
  seconds: number | null;
  status: string;
  timings: [number, number, string][] | null;
}

export type TimelineBlock =
  | { kind: 'paragraph'; start: number; text: string; marked: boolean }
  | { kind: 'gap'; start: number; parts: number };

/** Start a new paragraph once the current one spans this long and a sentence ends. */
const PARAGRAPH_SECONDS = 60;
/** …or unconditionally at this length. */
const PARAGRAPH_MAX_SECONDS = 120;

export function buildTimeline(parts: TimelinePart[], marks: number[] | null | undefined): {
  hasTimings: boolean;
  blocks: TimelineBlock[];
} {
  const ordered = [...parts].sort((a, b) => a.seq - b.seq);
  // Every transcribed part must carry timings, not just one: a lecture from
  // before timings existed whose late part arrived after they did would
  // otherwise show a "transcript" made of that one part alone.
  const hasTimings =
    ordered.some((p) => (p.timings?.length ?? 0) > 0) &&
    ordered.every((p) => p.status !== 'done' || (p.timings?.length ?? 0) > 0);
  if (!hasTimings) return { hasTimings: false, blocks: [] };

  const markList = [...(marks ?? [])].sort((a, b) => a - b);
  const blocks: TimelineBlock[] = [];
  let current: { start: number; end: number; texts: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const { start, end, texts } = current;
    // A mark belongs to the paragraph being spoken when it was tapped, or just before.
    const marked = markList.some((m) => m >= start && m <= end + 10);
    blocks.push({ kind: 'paragraph', start, text: texts.join(' '), marked });
    current = null;
  };

  let offset = 0;
  let expectedSeq = ordered[0]?.seq ?? 0;
  let missingRun = 0;
  for (const part of ordered) {
    // Parts with no row at all (never arrived), then this one if it failed.
    missingRun += Math.max(0, part.seq - expectedSeq);
    if (part.status === 'failed') missingRun += 1;
    if (missingRun > 0 && part.status !== 'failed') {
      flush();
      blocks.push({ kind: 'gap', start: offset, parts: missingRun });
      missingRun = 0;
    }
    expectedSeq = part.seq + 1;
    if (part.status === 'failed') {
      offset += Math.max(0, Number(part.seconds) || 0);
      continue;
    }
    for (const t of part.timings ?? []) {
      if (!Array.isArray(t) || typeof t[2] !== 'string' || !t[2].trim()) continue;
      const start = offset + (Number(t[0]) || 0);
      const end = offset + (Number(t[1]) || 0);
      if (current) {
        const sentenceEnded = /[.?!…]["')\]]?$/.test(current.texts[current.texts.length - 1]);
        if (end - current.start > PARAGRAPH_MAX_SECONDS || (current.end - current.start >= PARAGRAPH_SECONDS && sentenceEnded)) flush();
      }
      if (!current) current = { start, end, texts: [] };
      current.texts.push(t[2].trim());
      current.end = end;
    }
    offset += Math.max(0, Number(part.seconds) || 0);
  }
  flush();
  if (missingRun > 0) blocks.push({ kind: 'gap', start: offset, parts: missingRun });
  return { hasTimings: true, blocks };
}

/** 75 → "1:15"; 3725 → "1:02:05". */
export function formatTimestamp(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
