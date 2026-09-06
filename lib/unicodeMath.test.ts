/**
 * Run with:
 *   deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/unicodeMath.test.ts
 *
 * Two halves, and the second matters as much as the first. The CORRUPTION
 * cases are the defects the 2026-09-05 Tutor audit verified against real
 * output — each one silently turned legitimate academic content into
 * something else. The PRESERVED cases are the conversions that were already
 * correct; they are here so a future fix to one corruption cannot quietly
 * undo them.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { toUnicodeMath } from './unicodeMath.ts';

// ─── Corruptions the audit found (each was WRONG before 2026-09-05) ────────

Deno.test('a chemistry arrow is not the word "arrow"', () => {
  // \left and \right were stripped unanchored, eating the front of every
  // \rightarrow, \leftarrow and \leftrightarrow.
  assertEquals(toUnicodeMath('\\rightarrow'), '→');
  assertEquals(toUnicodeMath('\\leftarrow'), '←');
  assertEquals(toUnicodeMath('A \\leftrightarrow B'), 'A ↔ B');
  assertEquals(toUnicodeMath('2H2 + O2 \\rightarrow 2H2O'), '2H2 + O2 → 2H2O');
});

Deno.test('the quadratic formula survives its own radical', () => {
  // \frac cannot match across a brace, so a \sqrt in the numerator sent the
  // whole command to the catch-all and printed "frac{...}{...}".
  assertEquals(
    toUnicodeMath('x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}'),
    'x = (-b ± √(b²-4ac))/2a',
  );
});

Deno.test('an underscore in prose is not a subscript', () => {
  assertEquals(toUnicodeMath('The half_life of C-14'), 'The half_life of C-14');
  assertEquals(toUnicodeMath('Use the variable file_name'), 'Use the variable file_name');
  assertEquals(
    toUnicodeMath('https://en.wikipedia.org/wiki/Taylor_series'),
    'https://en.wikipedia.org/wiki/Taylor_series',
  );
});

Deno.test('currency symbols are not eaten by inline-math pairing', () => {
  // Two dollar signs in one sentence were read as a math delimiter pair.
  assertEquals(toUnicodeMath('It costs $5 and $10 shipping.'), 'It costs $5 and $10 shipping.');
  assertEquals(toUnicodeMath('Revenue rose from $2M to $5M.'), 'Revenue rose from $2M to $5M.');
});

Deno.test('ion charges and negative exponents convert', () => {
  // +, -, ( and ) are all in the SUPERSCRIPT table but \w excluded them.
  assertEquals(toUnicodeMath('Na^+ + Cl^-'), 'Na⁺ + Cl⁻');
  // Single-character by design, so `x^-1` superscripts only the sign — the
  // braced form is what LaTeX requires for a two-character exponent anyway.
  assertEquals(toUnicodeMath('x^-1'), 'x⁻1');
  assertEquals(toUnicodeMath('x^{-1}'), 'x⁻¹');
});

Deno.test('a LaTeX-escaped percent loses its backslash', () => {
  assertEquals(toUnicodeMath('5 \\% of the class'), '5 % of the class');
  assertEquals(toUnicodeMath('A \\& B'), 'A & B');
});

Deno.test('an unrenderable command stays visibly unrendered', () => {
  // Dropping the backslash disguised a rendering failure as content: the
  // student read "bar{x}" with no way to know it meant x̄.
  assertEquals(toUnicodeMath('\\bar{x} and \\hat{y}'), '\\bar{x} and \\hat{y}');
  assertEquals(toUnicodeMath('\\overline{AB}'), '\\overline{AB}');
});

Deno.test('a matrix is left as LaTeX rather than flattened into fake prose', () => {
  assertEquals(
    toUnicodeMath('\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}'),
    '\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}',
  );
});

// ─── Conversions that were already correct and must stay correct ───────────

Deno.test('PRESERVED: value symbols bind tight, relations keep their space', () => {
  assertEquals(toUnicodeMath('\\pi r^2'), 'πr²');
  assertEquals(toUnicodeMath('\\leq 10'), '≤ 10');
});

Deno.test('PRESERVED: integrals, sums and simple fractions', () => {
  assertEquals(toUnicodeMath('\\int_0^1 x^2 dx'), '∫₀¹ x² dx');
  assertEquals(toUnicodeMath('\\sum_{i=1}^{n} x_i'), 'Σᵢ₌₁ⁿ xᵢ');
  assertEquals(toUnicodeMath('\\frac{dy}{dx}'), 'dy/dx');
});

Deno.test('PRESERVED: real inline math still unwraps', () => {
  assertEquals(toUnicodeMath('$x^2$'), 'x²');
  assertEquals(toUnicodeMath('$$E = mc^2$$'), 'E = mc²');
});

Deno.test('PRESERVED: align still flattens, \\left( still strips', () => {
  assertEquals(toUnicodeMath('\\begin{align} x = 1 \\end{align}'), ' x = 1 ');
  assertEquals(toUnicodeMath('\\left( x \\right)'), '( x )');
});

Deno.test('PRESERVED: an escaped English word still loses its backslash', () => {
  assertEquals(toUnicodeMath('a \\reasonable answer'), 'a reasonable answer');
  assertEquals(toUnicodeMath('the \\reasonable option'), 'the reasonable option');
});
