import React, { useMemo } from 'react';
// react-native's Text, NOT the localized wrapper. That wrapper runs every
// string child through translate(), which is right for UI copy written in this
// repo and wrong for a model's answer: the answer already came back in the
// student's language, and a fragment that happens to match a dictionary key
// ("Practice", "Done", "Next") would be swapped for an unrelated UI string in
// the middle of a sentence.
import { StyleSheet, Text, View } from 'react-native';

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

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ', 'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ',
  'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'o': 'ᵒ',
  'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ',
  'T': 'ᵀ',
};

const SUBSCRIPT: Record<string, string> = {
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
  'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ',
  'v': 'ᵥ', 'x': 'ₓ',
};

/** LaTeX command → the character a student should actually see. */
const SYMBOLS: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ',
  Omega: 'Ω',
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', equiv: '≡', sim: '∼',
  propto: '∝', ll: '≪', gg: '≫',
  infty: '∞', partial: '∂', nabla: '∇', int: '∫', iint: '∬', oint: '∮', sum: 'Σ', prod: 'Π',
  sqrt: '√', angle: '∠', perp: '⊥', parallel: '∥', degree: '°', circ: '∘',
  in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', cup: '∪', cap: '∩',
  emptyset: '∅', varnothing: '∅', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨',
  to: '→', rightarrow: '→', longrightarrow: '⟶', leftarrow: '←', leftrightarrow: '↔',
  Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', mapsto: '↦',
  therefore: '∴', because: '∵', ldots: '…', dots: '…', cdots: '⋯', prime: '′',
  quad: ' ', qquad: '  ', ',': ' ', ';': ' ', '!': '',
};

/**
 * Symbols that absorb the space ending their command name.
 *
 * These stand in for a value and bind to the token after them (πr, ∂f, 90°C).
 * Operators and relations are deliberately absent: they are set with space
 * around them, and "≤10" reads as a typo.
 */
const TIGHT_SYMBOLS = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi',
  'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi',
  'Psi', 'Omega', 'partial', 'nabla', 'degree', 'prime',
]);

function toScript(body: string, table: Record<string, string>, marker: string): string {
  // All-or-nothing: a half-converted exponent ("x²ᵍ⁺h") is harder to read than
  // the plain form, so if any character has no mapping the whole group keeps
  // its marker.
  let out = '';
  for (const ch of body) {
    const mapped = table[ch];
    if (mapped === undefined) return `${marker}(${body})`;
    out += mapped;
  }
  return out;
}

/**
 * Convert the LaTeX a model emits despite being asked not to into readable
 * Unicode. Order matters: groups are resolved before bare symbols, so
 * `\frac{\pi}{2}` becomes `π/2` rather than leaving a stray command inside.
 */
export function toUnicodeMath(input: string): string {
  let text = input;

  // Delimiters carry no meaning once the content is inline text.
  text = text.replace(/\\\[|\\\]|\\\(|\\\)/g, '');
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, '$1');
  text = text.replace(/\$([^$\n]+?)\$/g, '$1');

  // Wrappers whose only job is styling.
  text = text.replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|operatorname)\{([^{}]*)\}/g, '$1');
  text = text.replace(/\\left|\\right/g, '');
  text = text.replace(/\\begin\{[^}]*\}|\\end\{[^}]*\}/g, '');

  // Fractions, innermost first so nested ones resolve.
  for (let pass = 0; pass < 3; pass++) {
    text = text.replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a: string, b: string) => {
      const wrap = (part: string) => (/^[\w.]+$/.test(part.trim()) ? part.trim() : `(${part.trim()})`);
      return `${wrap(a)}/${wrap(b)}`;
    });
  }

  text = text.replace(/\\sqrt\[(\d+)\]\{([^{}]*)\}/g, (_m, n: string, body: string) =>
    `${toScript(n, SUPERSCRIPT, '^')}√(${body})`);
  text = text.replace(/\\sqrt\{([^{}]*)\}/g, (_m, body: string) =>
    /^[\w.]+$/.test(body) ? `√${body}` : `√(${body})`);

  // Super/subscripts, braced form then single character.
  text = text.replace(/\^\{([^{}]*)\}/g, (_m, body: string) => toScript(body, SUPERSCRIPT, '^'));
  text = text.replace(/_\{([^{}]*)\}/g, (_m, body: string) => toScript(body, SUBSCRIPT, '_'));
  text = text.replace(/\^(\w)/g, (_m, ch: string) => SUPERSCRIPT[ch] ?? `^${ch}`);
  text = text.replace(/_(\w)/g, (_m, ch: string) => SUBSCRIPT[ch] ?? `_${ch}`);

  // Named symbols, in two passes because of how LaTeX ends a command name.
  //
  // A control word swallows the space that terminates it, so `\pi r^2` is πr²
  // rather than "π r²". But that only reads correctly for symbols that stand in
  // for a VALUE and bind to what follows — a Greek letter, ∂, ∇. A relation or
  // an operator needs its gap: LaTeX sets `\leq 10` as "≤ 10", and eating that
  // space would run the comparison into the number.
  text = text.replace(/\\([A-Za-z]+) (?=[A-Za-z0-9])/g, (match, name: string) => {
    const symbol = SYMBOLS[name];
    // Unknown, or a symbol that keeps its spacing: leave it for the second
    // pass, which preserves whatever followed.
    return symbol !== undefined && TIGHT_SYMBOLS.has(name) ? symbol : match;
  });
  text = text.replace(/\\([A-Za-z]+)/g, (_match, name: string) => {
    const symbol = SYMBOLS[name];
    if (symbol !== undefined) return symbol;
    // An unknown command is far more likely to be a word the model escaped
    // than something meaningful, so show the word rather than the backslash.
    return name;
  });
  text = text.replace(/\\([,;!])/g, (_m, ch: string) => SYMBOLS[ch] ?? '');

  return text;
}

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
