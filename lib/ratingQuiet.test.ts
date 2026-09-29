/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/ratingQuiet.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  isQuiet,
  moneyJustDiscussed,
  noteMoneyMoment,
  lastMoneyMoment,
  resetMoneyMomentForTests,
  RATING_QUIET_MS,
} from './ratingQuiet';

const NOW = 1_757_000_000_000;

Deno.test('money never came up: nothing to be quiet about', () => {
  assertEquals(isQuiet(null, NOW), false);
});

Deno.test('the quiet window covers the minutes right after money', () => {
  assertEquals(isQuiet(NOW, NOW), true);
  assertEquals(isQuiet(NOW, NOW + 2_000), true);
  assertEquals(isQuiet(NOW, NOW + RATING_QUIET_MS - 1), true);
});

Deno.test('and ends', () => {
  assertEquals(isQuiet(NOW, NOW + RATING_QUIET_MS), false);
  assertEquals(isQuiet(NOW, NOW + 60 * 60 * 1000), false);
});

Deno.test('a clock that jumped backwards stays quiet rather than opening forever', () => {
  assertEquals(isQuiet(NOW, NOW - 5_000), true);
});

Deno.test('the module state remembers the last money moment', () => {
  resetMoneyMomentForTests();
  assertEquals(moneyJustDiscussed(NOW), false);
  assertEquals(lastMoneyMoment(), null);

  noteMoneyMoment('purchase', NOW);
  assertEquals(moneyJustDiscussed(NOW + 1_000), true);
  assertEquals(lastMoneyMoment(), 'purchase');

  // Ten minutes later the rating ask is allowed again.
  assertEquals(moneyJustDiscussed(NOW + RATING_QUIET_MS + 1), false);

  // A second pitch restarts the window.
  noteMoneyMoment('pro_sheet', NOW + RATING_QUIET_MS + 2);
  assertEquals(moneyJustDiscussed(NOW + RATING_QUIET_MS + 3), true);
  assertEquals(lastMoneyMoment(), 'pro_sheet');
  resetMoneyMomentForTests();
});
