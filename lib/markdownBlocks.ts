/**
 * Markdown -> block list. Split out of components/RichText.tsx so the parsing
 * rules can be tested directly; the renderer imports these and does nothing to
 * the structure itself.
 */
import { toUnicodeMath } from './unicodeMath';

export type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; text: string; depth: number }
  | { kind: 'ordered'; text: string; marker: string }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string; language: string }
  | { kind: 'math'; text: string }
  | { kind: 'rule' };

/**
 * Does this line begin a block of its own?
 *
 * Mirrors the branches in parseBlocks. It exists so the soft-wrap merge below
 * stops at exactly the same places the parser does — two lists of block
 * openers that could disagree would be a bug waiting to happen.
 */
export function isBlockStart(line: string): boolean {
  return line.startsWith('```')
    || /^\\\[[\s\S]*\\\]$/.test(line)
    || /^\$\$[\s\S]*\$\$$/.test(line)
    || /^(?:---+|\*\*\*+|___+)$/.test(line)
    || line.startsWith('#')
    || line.startsWith('> ')
    || /^\d+[.)]\s+/.test(line)
    || /^[-*•]\s+/.test(line);
}

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const raw = lines[index];
    const line = raw.trim();

    // Fenced code, taken verbatim to the closing fence (or the end, when a
    // reply was cut off mid-block).
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const body: string[] = [];
      index++;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        body.push(lines[index]);
        index++;
      }
      index++;
      blocks.push({ kind: 'code', text: body.join('\n'), language });
      continue;
    }

    // A display equation on its own line keeps its own space.
    if (/^\\\[[\s\S]*\\\]$/.test(line) || /^\$\$[\s\S]*\$\$$/.test(line)) {
      blocks.push({ kind: 'math', text: toUnicodeMath(line) });
      index++;
      continue;
    }

    if (!line) { index++; continue; }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line)) {
      blocks.push({ kind: 'rule' });
      index++;
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push({ kind: 'heading', level: 3, text: line.slice(4) });
      index++;
      continue;
    }
    if (line.startsWith('## ')) {
      blocks.push({ kind: 'heading', level: 2, text: line.slice(3) });
      index++;
      continue;
    }
    if (line.startsWith('# ')) {
      blocks.push({ kind: 'heading', level: 2, text: line.slice(2) });
      index++;
      continue;
    }
    if (line.startsWith('> ')) {
      blocks.push({ kind: 'quote', text: line.slice(2) });
      index++;
      continue;
    }
    const ordered = line.match(/^(\d{1,2})[.)]\s+(.*)$/);
    if (ordered) {
      blocks.push({ kind: 'ordered', marker: `${ordered[1]}.`, text: ordered[2] });
      index++;
      continue;
    }
    if (/^[-*•]\s+/.test(line)) {
      // Two leading spaces is one level of nesting — enough for the sub-points
      // a tutor writes, without pretending to support arbitrary depth.
      const depth = /^\s{2,}/.test(raw) ? 1 : 0;
      blocks.push({ kind: 'bullet', text: line.replace(/^[-*•]\s+/, ''), depth });
      index++;
      continue;
    }
    // SOFT WRAP. Markdown joins consecutive non-blank lines into one
    // paragraph; a blank line is what separates them. Pushing each source
    // line as its own block instead put a paragraph gap inside a sentence
    // whenever a model hard-wrapped its prose — the answer arrived shattered
    // into fragments, mid-clause, with no way for the student to tell that
    // was not how it was written.
    //
    // Only plain lines merge. Every special block above has already
    // continued out of this loop, so a heading, list item, quote, rule, code
    // fence or display equation still ends the paragraph it follows.
    const paragraph: string[] = [line];
    index++;
    while (index < lines.length) {
      const next = lines[index].trim();
      if (!next) break;
      if (isBlockStart(next)) break;
      paragraph.push(next);
      index++;
    }
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    continue;
    index++;
  }

  return blocks;
}
