import React, { useMemo } from 'react';
// react-native's Text, NOT the localized wrapper. That wrapper runs every
// string child through translate(), which is right for UI copy written in this
// repo and wrong for a model's answer: the answer already came back in the
// student's language, and a fragment that happens to match a dictionary key
// ("Practice", "Done", "Next") would be swapped for an unrelated UI string in
// the middle of a sentence.
import { StyleSheet, Text, View } from 'react-native';
import { toUnicodeMath } from '@/lib/unicodeMath';

// ── Rendering a tutor's answer ──────────────────────────────────────────────
//
// The tutor used to be told "plain text only — no markdown headers", and the
// screen rendered every reply as one flat string. For a college tutor that is
// not a styling shortcoming, it is a capability limit: chemistry, calculus,
// statistics, physics and economics cannot be explained in a medium with no
// superscripts, no fractions and no structure. `x^2 + 2x` is not an
// explanation of anything, and a five-step derivation as one paragraph is
// unreadable exactly when the student is most stuck.
//
// So this renders a deliberately small markdown subset — the one the tutor
// prompt asks for — plus maths.
//
// MATHS WITHOUT A MATH ENGINE. KaTeX and MathJax need a WebView on React
// Native, and a WebView per message would wreck scrolling in a chat, add a
// native dependency, and still fail offline. Instead the model is asked to
// write Unicode directly (x², √2, ∫, ≤) which needs no engine at all, and
// anything that slips through as LaTeX is converted here. That covers the
// inline maths a tutor actually writes; what it cannot do is lay out a stacked
// fraction or a matrix, which is the honest trade for zero new dependencies.

type InlineSpan = { text: string; bold?: boolean; code?: boolean };

/** Split one line into bold / inline-code / plain spans. */
function parseInline(line: string): InlineSpan[] {
  const spans: InlineSpan[] = [];
  // Both delimiters in one pass so `**a `b` c**` cannot interleave wrongly.
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) spans.push({ text: line.slice(last, match.index) });
    const token = match[0];
    if (token.startsWith('`')) {
      // Code is verbatim: converting maths inside it would rewrite the code.
      spans.push({ text: token.slice(1, -1), code: true });
    } else {
      spans.push({ text: token.slice(2, -2), bold: true });
    }
    last = match.index + token.length;
  }
  if (last < line.length) spans.push({ text: line.slice(last) });
  // A single '*' is left exactly as written — in a formula it is far more
  // likely to be multiplication than an italic marker, and eating it would
  // corrupt the maths. Same rule the lecture-notes renderer follows.
  return spans.map((span) => (span.code ? span : { ...span, text: toUnicodeMath(span.text) }));
}

type Block =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; text: string; depth: number }
  | { kind: 'ordered'; text: string; marker: string }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string; language: string }
  | { kind: 'math'; text: string }
  | { kind: 'rule' };

function parseBlocks(markdown: string): Block[] {
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
    blocks.push({ kind: 'paragraph', text: line });
    index++;
  }

  return blocks;
}

function Spans({ line, style, boldColor, codeStyle }: {
  line: string;
  style: any;
  boldColor: string;
  codeStyle: any;
}) {
  return (
    <>
      {parseInline(line).map((span, i) => {
        if (span.code) return <Text key={i} style={[style, codeStyle]}>{span.text}</Text>;
        if (span.bold) return <Text key={i} style={[style, { fontWeight: '700', color: boldColor }]}>{span.text}</Text>;
        return <Text key={i} style={style}>{span.text}</Text>;
      })}
    </>
  );
}

export interface RichTextProps {
  text: string;
  /** Body colour. Headings and bold use `strongColor`. */
  color: string;
  strongColor: string;
  mutedColor: string;
  accentColor: string;
  /** Background for code and equation blocks. */
  surfaceColor: string;
  lineColor: string;
  fontSize?: number;
}

export function RichText({
  text, color, strongColor, mutedColor, accentColor, surfaceColor, lineColor, fontSize = 15,
}: RichTextProps) {
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const body = { fontSize, lineHeight: Math.round(fontSize * 1.45), color };
  const code = { fontFamily: 'Menlo', fontSize: fontSize - 1.5 };

  return (
    <View style={styles.root}>
      {blocks.map((block, i) => {
        switch (block.kind) {
          case 'heading':
            return (
              <Text
                key={i}
                selectable
                style={[
                  styles.heading,
                  { color: strongColor, fontSize: block.level === 2 ? fontSize + 2 : fontSize + 0.5 },
                  i > 0 && styles.headingSpaced,
                ]}
              >
                <Spans line={block.text} style={{ color: strongColor }} boldColor={strongColor} codeStyle={code} />
              </Text>
            );
          case 'bullet':
            return (
              <View key={i} style={[styles.row, block.depth > 0 && styles.nested]}>
                <Text style={[styles.marker, { color: accentColor, fontSize }]}>•</Text>
                <Text selectable style={[styles.rowText, body]}>
                  <Spans line={block.text} style={body} boldColor={strongColor} codeStyle={code} />
                </Text>
              </View>
            );
          case 'ordered':
            return (
              <View key={i} style={styles.row}>
                <Text style={[styles.orderedMarker, { color: accentColor, fontSize: fontSize - 1 }]}>{block.marker}</Text>
                <Text selectable style={[styles.rowText, body]}>
                  <Spans line={block.text} style={body} boldColor={strongColor} codeStyle={code} />
                </Text>
              </View>
            );
          case 'quote':
            return (
              <View key={i} style={[styles.quote, { borderLeftColor: accentColor, backgroundColor: surfaceColor }]}>
                <Text selectable style={[body, { color: mutedColor }]}>
                  <Spans line={block.text} style={[body, { color: mutedColor }]} boldColor={strongColor} codeStyle={code} />
                </Text>
              </View>
            );
          case 'code':
            return (
              <View key={i} style={[styles.code, { backgroundColor: surfaceColor, borderColor: lineColor }]}>
                {!!block.language && (
                  <Text style={[styles.codeLang, { color: mutedColor }]}>{block.language}</Text>
                )}
                <Text selectable style={[code, { color: strongColor, lineHeight: Math.round(fontSize * 1.5) }]}>
                  {block.text}
                </Text>
              </View>
            );
          case 'math':
            return (
              <View key={i} style={[styles.math, { backgroundColor: surfaceColor }]}>
                <Text selectable style={[body, { color: strongColor, textAlign: 'center' }]}>{block.text}</Text>
              </View>
            );
          case 'rule':
            return <View key={i} style={[styles.rule, { backgroundColor: lineColor }]} />;
          default:
            return (
              <Text key={i} selectable style={body}>
                <Spans line={block.text} style={body} boldColor={strongColor} codeStyle={code} />
              </Text>
            );
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 7 },
  heading: { fontWeight: '700' },
  headingSpaced: { marginTop: 6 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  nested: { paddingLeft: 16 },
  marker: { lineHeight: 22 },
  orderedMarker: { fontWeight: '700', lineHeight: 22, minWidth: 18, fontVariant: ['tabular-nums'] },
  rowText: { flex: 1 },
  quote: { borderLeftWidth: 3, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  code: { borderRadius: 10, borderWidth: 1, padding: 12, gap: 6 },
  codeLang: { fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: '600' },
  math: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
