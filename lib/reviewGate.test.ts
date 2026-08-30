/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/reviewGate.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  decideReviewAsk,
  REVIEW_TASK_MILESTONE,
  type ReviewGateState,
} from './reviewGate';

const base: ReviewGateState = {
  platformIsWeb: false,
  hasImportedSyllabus: false,
  importedSyllabusDay: null,
  reviewRequested: false,
  reviewPromptedDay: null,
  ratingCardDismissed: false,
  tasksCompletedCount: 0,
  today: '2026-09-10',
  paywallShownThisSession: false,
};
const S = (o: Partial<ReviewGateState>): ReviewGateState => ({ ...base, ...o });

// ── The bug this module exists to fix ───────────────────────────────────────

Deno.test('REGRESSION: a student who imported today is NOT asked today', () => {
  // Production: 39% of prompts fired within ten minutes of first launch,
  // because Today mounts for the first time AFTER onboarding + first scan.
  const d = decideReviewAsk(S({
    hasImportedSyllabus: true,
    importedSyllabusDay: '2026-09-10',
    today: '2026-09-10',
  }));
  assertEquals(d.ask, 'none');
});

Deno.test('REGRESSION: the same student IS asked the next day', () => {
  const d = decideReviewAsk(S({
    hasImportedSyllabus: true,
    importedSyllabusDay: '2026-09-10',
    today: '2026-09-11',
  }));
  assertEquals(d, { ask: 'native', trigger: 'aha' });
});

Deno.test('a month later still qualifies — the gate is a floor, not a window', () => {
  const d = decideReviewAsk(S({
    hasImportedSyllabus: true,
    importedSyllabusDay: '2026-09-10',
    today: '2026-10-14',
  }));
  assertEquals(d.ask, 'native');
});

// ── Never stacking ──────────────────────────────────────────────────────────

Deno.test('never asks in the same session as the paywall', () => {
  const d = decideReviewAsk(S({
    hasImportedSyllabus: true,
    importedSyllabusDay: '2026-09-01',
    paywallShownThisSession: true,
  }));
  assertEquals(d.ask, 'none');
});

Deno.test('the card never appears on the day the native prompt was spent', () => {
  const d = decideReviewAsk(S({
    hasImportedSyllabus: true,
    importedSyllabusDay: '2026-09-01',
    reviewRequested: true,
    reviewPromptedDay: '2026-09-10',
    today: '2026-09-10',
  }));
  assertEquals(d.ask, 'none');
});

Deno.test('the card appears the day after the native prompt', () => {
  const d = decideReviewAsk(S({
    hasImportedSyllabus: true,
    importedSyllabusDay: '2026-09-01',
    reviewRequested: true,
    reviewPromptedDay: '2026-09-10',
    today: '2026-09-11',
  }));
  assertEquals(d.ask, 'card');
});

Deno.test('a dismissed card never comes back', () => {
  const d = decideReviewAsk(S({
    hasImportedSyllabus: true,
    importedSyllabusDay: '2026-09-01',
    reviewRequested: true,
    reviewPromptedDay: '2026-09-10',
    ratingCardDismissed: true,
    today: '2026-12-25',
  }));
  assertEquals(d.ask, 'none');
});

Deno.test('the native ask is never repeated once spent', () => {
  // Only the card path is reachable after reviewRequested.
  for (const today of ['2026-09-11', '2026-10-01', '2027-01-01']) {
    const d = decideReviewAsk(S({
      hasImportedSyllabus: true,
      importedSyllabusDay: '2026-09-01',
      reviewRequested: true,
      reviewPromptedDay: '2026-09-10',
      ratingCardDismissed: true,
      today,
    }));
    assertEquals(d.ask, 'none', `native re-fired on ${today}`);
  }
});

// ── The milestone path ──────────────────────────────────────────────────────

Deno.test('the milestone is reachable — 3, not the old unreachable 10', () => {
  assertEquals(REVIEW_TASK_MILESTONE, 3);
});

Deno.test('a student who never imported still qualifies via completions', () => {
  const d = decideReviewAsk(S({ tasksCompletedCount: REVIEW_TASK_MILESTONE }));
  assertEquals(d, { ask: 'native', trigger: 'task_milestone' });
});

Deno.test('below the milestone, with no import, asks nothing', () => {
  const d = decideReviewAsk(S({ tasksCompletedCount: REVIEW_TASK_MILESTONE - 1 }));
  assertEquals(d.ask, 'none');
});

Deno.test('completions on the import day do not bypass the day gate', () => {
  // Otherwise a syllabus scan that creates tasks, plus three quick taps,
  // reopens the very door this module closed.
  const d = decideReviewAsk(S({
    hasImportedSyllabus: true,
    importedSyllabusDay: '2026-09-10',
    tasksCompletedCount: 50,
    today: '2026-09-10',
  }));
  assertEquals(d.ask, 'none');
});

// ── Platform + legacy devices ───────────────────────────────────────────────

Deno.test('web is never asked — neither ask has a web implementation', () => {
  const d = decideReviewAsk(S({
    platformIsWeb: true,
    hasImportedSyllabus: true,
    importedSyllabusDay: '2026-09-01',
  }));
  assertEquals(d.ask, 'none');
});

Deno.test('a device with no recorded import day is not blocked forever', () => {
  const d = decideReviewAsk(S({ hasImportedSyllabus: true, importedSyllabusDay: null }));
  assertEquals(d.ask, 'native');
});

Deno.test('the card requires an earned moment, not merely a spent prompt', () => {
  // Someone whose prompt was spent by an older build but who never imported
  // and never completed anything should not be handed a card.
  const d = decideReviewAsk(S({
    reviewRequested: true,
    reviewPromptedDay: '2026-09-01',
    today: '2026-09-11',
  }));
  assertEquals(d.ask, 'none');
});

Deno.test('no reviewPromptedDay recorded means no card (legacy prompt)', () => {
  const d = decideReviewAsk(S({
    hasImportedSyllabus: true,
    importedSyllabusDay: '2026-09-01',
    reviewRequested: true,
    reviewPromptedDay: null,
    today: '2026-09-11',
  }));
  assertEquals(d.ask, 'none');
});

// ── The whole lifecycle, in order ───────────────────────────────────────────

Deno.test('a full student lifecycle asks exactly twice, on different days', () => {
  let st = S({ today: '2026-09-10' });
  const asks: string[] = [];

  // Day 1: onboards and imports. This is where the old code asked.
  st = { ...st, hasImportedSyllabus: true, importedSyllabusDay: '2026-09-10' };
  asks.push(decideReviewAsk(st).ask);

  // Day 1, later that evening — still the same day.
  asks.push(decideReviewAsk(st).ask);

  // Day 2: comes back. Native ask fires.
  st = { ...st, today: '2026-09-11' };
  const d2 = decideReviewAsk(st);
  asks.push(d2.ask);
  st = { ...st, reviewRequested: true, reviewPromptedDay: '2026-09-11' };

  // Day 2, later — already spent, card not yet due.
  asks.push(decideReviewAsk(st).ask);

  // Day 3: card appears.
  st = { ...st, today: '2026-09-12' };
  asks.push(decideReviewAsk(st).ask);

  // Day 3, after dismissing.
  st = { ...st, ratingCardDismissed: true };
  asks.push(decideReviewAsk(st).ask);

  // Day 40.
  st = { ...st, today: '2026-10-20' };
  asks.push(decideReviewAsk(st).ask);

  assertEquals(asks, ['none', 'none', 'native', 'none', 'card', 'none', 'none']);
});
