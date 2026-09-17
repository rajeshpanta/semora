/**
 * Splitting a long lecture transcript into sections the notes model can finish.
 *
 * Pure (no Deno.env, no network): tested in lectureNotesSections.test.ts.
 *
 * WHY. One model call has one output budget and one 150-second edge function
 * to live in. Notes for a 90-minute lecture already came close to both, and a
 * 3-hour lab cannot fit. Long transcripts are written a section at a time, each
 * section's notes are kept in lecture_note_sections between invocations, and a
 * final pass writes the headline, summary and key points over all of them.
 *
 * Sections break at paragraph boundaries (the assembler puts one between
 * parts), then at sentence boundaries when a single paragraph is too long
 * (older transcripts were joined with plain spaces). Never mid-word.
 */

/**
 * Transcripts at or below this length are written in a single call.
 *
 * 30,000 (about 45 minutes of speech), not the 60,000 first chosen: a single
 * call now has to finish inside the invocation's time budget so its notes can
 * be saved, and a 60,000-character transcript with a long output can run past
 * it. Longer lectures are written a section at a time, each well inside the
 * budget, with progress saved between invocations.
 */
export const SINGLE_PASS_CHARS = 30_000;
/** Target section length: roughly 25-35 minutes of speech. */
export const SECTION_TARGET_CHARS = 24_000;

const GAP_MARKER = /^\[(Part of this recording could not be transcribed|Falta una parte de la grabación|Recording resumed after an interruption|La grabación se reanudó tras una interrupción)\.\]$/;

/** Split one over-long paragraph at sentence ends, never mid-word. */
function splitLongParagraph(p: string, target: number): string[] {
  const out: string[] = [];
  let rest = p;
  while (rest.length > target * 1.5) {
    const window = rest.slice(0, target);
    let cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
    if (cut < target * 0.5) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = target;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export function splitTranscriptSections(transcript: string, target = SECTION_TARGET_CHARS): string[] {
  const text = transcript.trim();
  if (!text) return [];
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => (p.length > target * 1.5 ? splitLongParagraph(p, target) : [p]));

  const sections: string[] = [];
  let current: string[] = [];
  let length = 0;
  for (const p of paragraphs) {
    if (length > 0 && length + p.length > target && !GAP_MARKER.test(p)) {
      sections.push(current.join('\n\n'));
      current = [];
      length = 0;
    }
    current.push(p);
    length += p.length + 2;
  }
  if (current.length) sections.push(current.join('\n\n'));

  // A last section that is only a sliver reads badly on its own; fold it back.
  if (sections.length > 1 && sections[sections.length - 1].length < target * 0.2) {
    const tail = sections.pop()!;
    sections[sections.length - 1] = `${sections[sections.length - 1]}\n\n${tail}`;
  }
  return sections;
}

export interface SectionResult {
  notes_md: string;
  key_terms: string[];
  action_items: string[];
}

/** Validate and tidy one section's model output. Returns null when unusable. */
export function parseSectionResult(raw: string | null): SectionResult | null {
  if (!raw) return null;
  let parsed: any;
  try {
    parsed = JSON.parse(raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
  } catch {
    return null;
  }
  const notes = typeof parsed?.notes_md === 'string' ? parsed.notes_md.trim() : '';
  if (!notes) return null;
  const list = (v: unknown) => Array.isArray(v)
    ? v.filter((x) => typeof x === 'string').map((x: string) => x.trim()).filter(Boolean).slice(0, 60)
    : [];
  // Section notes live under the final document's "## Notes" heading, so any
  // top-level heading the model adds is demoted to a topic heading.
  const demoted = notes
    .split('\n')
    .map((line: string) => line.replace(/^\s*#{1,2}\s+/, '### '))
    .join('\n');
  return { notes_md: demoted, key_terms: list(parsed.key_terms), action_items: list(parsed.action_items) };
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase().replace(/\s+/g, ' ').split(/\s+[—-]\s+/)[0].trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.replace(/^[-•]\s*/, ''));
  }
  return out;
}

/**
 * The final notes document: the overview written over every section, then each
 * section's notes in lecture order, then the terms and action items gathered
 * from all of them. Same shape as single-pass notes.
 */
export function assembleSectionedNotes(overview: string, sections: SectionResult[]): string {
  const head = overview.trim();
  const body = sections.map((s) => s.notes_md.trim()).filter(Boolean).join('\n\n');
  const terms = dedupe(sections.flatMap((s) => s.key_terms));
  const actions = dedupe(sections.flatMap((s) => s.action_items));
  return [
    head,
    '## Notes',
    body,
    terms.length ? `## Key terms\n${terms.map((t) => `- ${t}`).join('\n')}` : '',
    actions.length ? `## Action items\n${actions.map((a) => `- ${a}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n');
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
