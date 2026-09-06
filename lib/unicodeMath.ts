/**
 * LaTeX → Unicode maths, for rendering a tutor answer as plain React Native text.
 *
 * Moved out of components/RichText.tsx unchanged (2026-09-05) so it can be
 * tested directly: the component pulls in react-native, which the Deno test
 * runner stubs only far enough for Platform. The logic, the tables and the
 * ordering are exactly as they were; every behaviour here is covered by
 * lib/unicodeMath.test.ts.
 *
 * WHY NO KaTeX. A WebView per message would wreck chat scrolling, and the
 * tutor prompt is written to emit Unicode-friendly maths precisely because
 * this is the renderer on the other end. The two are designed as one thing —
 * see the LaTeX/table ban in supabase/functions/tutor-chat/index.ts.
 */

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
  // TeX sets inline math tight against its delimiters, so requiring that is
  // what separates `$x^2$` from "it costs $5 and $10 shipping" — where the
  // pair spans the sentence and silently deletes both currency symbols.
  text = text.replace(/\$([^$\n]+?)\$/g, (m, body: string) => (/^\s|\s$/.test(body) ? m : body));

  // Wrappers whose only job is styling.
  text = text.replace(/\\(?:text|mathrm|mathbf|mathit|mathsf|operatorname)\{([^{}]*)\}/g, '$1');
  // Anchored: unanchored, this consumed the prefix of \rightarrow, \leftarrow
  // and \leftrightarrow, turning every chemistry arrow into the word "arrow".
  text = text.replace(/\\(?:left|right)(?![A-Za-z])/g, '');
  // align/equation flatten acceptably, so they keep their existing treatment.
  // A matrix does not: stripping the wrapper leaves "1 & 2 \\ 3 & 4" looking
  // like prose. Left intact it is visibly unrendered LaTeX, which is honest.
  text = text.replace(/\\(?:begin|end)\{([^}]*)\}/g, (m, env: string) =>
    (/^(?:[pbvV]?matrix|smallmatrix|array|cases)\*?$/.test(env) ? m : ''));

  // Radicals BEFORE fractions, deliberately. \frac's pattern cannot cross a
  // brace, so a numerator containing \sqrt{...} never matched and the whole
  // command fell through to the catch-all — which is why the quadratic formula
  // rendered as "frac{-b ± √(b²-4ac)}{2a}". Resolving the radical first leaves
  // the numerator brace-free and the fraction matches normally.
  text = text.replace(/\\sqrt\[(\d+)\]\{([^{}]*)\}/g, (_m, n: string, body: string) =>
    `${toScript(n, SUPERSCRIPT, '^')}√(${body})`);
  text = text.replace(/\\sqrt\{([^{}]*)\}/g, (_m, body: string) =>
    /^[\w.]+$/.test(body) ? `√${body}` : `√(${body})`);

  // Fractions, innermost first so nested ones resolve.
  for (let pass = 0; pass < 3; pass++) {
    text = text.replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a: string, b: string) => {
      const wrap = (part: string) => (/^[\w.]+$/.test(part.trim()) ? part.trim() : `(${part.trim()})`);
      return `${wrap(a)}/${wrap(b)}`;
    });
  }

  // Super/subscripts, braced form then single character.
  text = text.replace(/\^\{([^{}]*)\}/g, (_m, body: string) => toScript(body, SUPERSCRIPT, '^'));
  text = text.replace(/_\{([^{}]*)\}/g, (_m, body: string) => toScript(body, SUBSCRIPT, '_'));
  // Ion charges and negative exponents: +, -, ( and ) are all in SUPERSCRIPT
  // but were excluded by \w, so Na^+ and x^-1 kept their carets.
  text = text.replace(/\^([\w+\-()])/g, (_m, ch: string) => SUPERSCRIPT[ch] ?? `^${ch}`);
  // A single trailing character only. Without the guard this subscripted every
  // underscore in ordinary prose — half_life became halfₗife, file_name became
  // fileₙame, and a URL with an underscore was corrupted invisibly. x_i still
  // converts because the i ends the token; half_life does not because "ife"
  // follows.
  text = text.replace(/_(\w)(?!\w)/g, (_m, ch: string) => SUBSCRIPT[ch] ?? `_${ch}`);

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
  text = text.replace(/\\([A-Za-z]+)/g, (match, name: string, offset: number, whole: string) => {
    const symbol = SYMBOLS[name];
    if (symbol !== undefined) return symbol;
    // A command taking an argument is maths this renderer does not know —
    // \bar{x}, \hat{y}, \overline{AB}. Dropping the backslash disguised the
    // failure as content: the student read "bar{x}" with no way to tell it was
    // meant to be x̄. Kept whole, it is obviously unrendered.
    if (whole[offset + match.length] === '{') return match;
    // Otherwise it is far more likely a word the model escaped than something
    // meaningful, so show the word rather than the backslash.
    return name;
  });
  // LaTeX-escaped literals. Without this a percentage in a statistics answer
  // reached the student as "5 \% of the class".
  text = text.replace(/\\([%&_{}#$])/g, '$1');
  text = text.replace(/\\([,;!])/g, (_m, ch: string) => SYMBOLS[ch] ?? '');

  return text;
}

