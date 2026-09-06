import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { charactersPerScreen, readingSpaceFor, type ReadingSpace } from '@/lib/readingSpace';

// Phase 2's own geometry, reproduced so these tests classify the columns the
// app actually renders rather than raw window widths.
const RAIL_MIN = 240, RAIL_MAX = 320, GUTTER = 32, PROSE_BASE = 540;
function columnFor(width: number, fontScale: number): number {
  const ms = Math.min(fontScale, 2);
  const prose = Math.min(width, Math.round(PROSE_BASE * ms));
  const railMin = Math.round(RAIL_MIN * ms), railMax = Math.round(RAIL_MAX * ms);
  const rail = Math.round(Math.min(railMax, Math.max(railMin, width * 0.22)));
  const showRail = width >= railMin + prose + GUTTER * 2;
  return Math.min(prose, width - (showRail ? rail : 0));
}
const NAV = 96, CHROME = 120;
const classify = (w: number, h: number, fontScale: number): ReadingSpace =>
  readingSpaceFor({ columnWidth: columnFor(w, fontScale), usableHeight: h - NAV - CHROME, fontScale });

Deno.test('the shipped device matrix lands where a reader would expect', () => {
  assertEquals(classify(375, 667, 1), 'compact', 'narrow phone');
  assertEquals(classify(393, 852, 1), 'regular', 'current phone');
  assertEquals(classify(430, 932, 1), 'regular', 'large phone');
  assertEquals(classify(834, 1194, 1), 'roomy', 'iPad portrait');
  assertEquals(classify(1366, 1032, 1), 'roomy', 'iPad 13 landscape');
});

Deno.test('ACCESSIBILITY: a big screen at big text is not a big reading space', () => {
  // The case the whole derivation exists for. No device exception anywhere.
  assertEquals(classify(1194, 834, 1), 'regular', 'iPad landscape, normal text');
  assertEquals(classify(1194, 834, 2), 'compact', 'same iPad at 2x');
  assertEquals(classify(1194, 834, 3.12), 'compact', 'same iPad at 3.12x');
  // ...and it is genuinely tighter than an ordinary phone, not merely equal.
  const bigIpad = charactersPerScreen({ columnWidth: columnFor(1194, 3.12), usableHeight: 834 - NAV - CHROME, fontScale: 3.12 });
  const smallPhone = charactersPerScreen({ columnWidth: columnFor(375, 1), usableHeight: 667 - NAV - CHROME, fontScale: 1 });
  assertEquals(bigIpad < smallPhone, true, `${bigIpad} should be under ${smallPhone}`);
});

Deno.test('every device degrades monotonically as text grows', () => {
  const order: Record<ReadingSpace, number> = { compact: 0, regular: 1, roomy: 2 };
  for (const [w, h] of [[375, 667], [393, 852], [834, 1194], [1194, 834], [1366, 1032]] as const) {
    let previous = 3;
    for (const scale of [1, 1.35, 2, 3.12]) {
      const rank = order[classify(w, h, scale)];
      assertEquals(rank <= previous, true, `${w}x${h} at ${scale} went up`);
      previous = rank;
    }
  }
});

Deno.test('font scale divides into BOTH axes, so it bites quadratically', () => {
  const base = charactersPerScreen({ columnWidth: 540, usableHeight: 900, fontScale: 1 });
  const doubled = charactersPerScreen({ columnWidth: 540, usableHeight: 900, fontScale: 2 });
  // A quarter, not a half — the reason a large screen at large text is compact.
  assertEquals(Math.abs(doubled - base / 4) < base * 0.02, true, `${doubled} vs ${base}/4`);
});

Deno.test('a tall narrow pane is judged on what it shows, not on how wide it is', () => {
  // Split View: only 507pt across but full height, so it genuinely displays a
  // lot of prose. Width alone would have called this compact.
  assertEquals(classify(507, 1194, 1), 'roomy');
  // Stage Manager, short and wide: the opposite case.
  assertEquals(classify(700, 600, 1), 'compact');
});

Deno.test('degenerate geometry never throws or divides by zero', () => {
  for (const input of [
    { columnWidth: 0, usableHeight: 0, fontScale: 0 },
    { columnWidth: -50, usableHeight: -50, fontScale: 1 },
    { columnWidth: 320, usableHeight: 100, fontScale: 10 },
  ]) {
    const space = readingSpaceFor(input);
    assertEquals(['compact', 'regular', 'roomy'].includes(space), true);
  }
});
