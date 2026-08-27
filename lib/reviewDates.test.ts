/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/reviewDates.test.ts
 *
 * These lock down the rule that replaced the bulk "set all" action: Semora
 * never writes a due date, and an item becomes saveable only when the student
 * dates that item. The production extractions that killed the bulk idea had
 * 38, 29 and 25 items with every title distinct — a shared date would have
 * been wrong for nearly all of them.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  countStillMissingDates,
  invalidAcceptedItems,
  isRealDate,
  saveableItems,
} from './reviewDates';

/** An item the parser could not date: starts deselected and unsaveable. */
const dateless = (over: Record<string, unknown> = {}) =>
  ({ due_date: null, accepted: false, needsDate: true, ...over }) as any;
/** An item the parser dated correctly. */
const dated = (d: string, over: Record<string, unknown> = {}) =>
  ({ due_date: d, accepted: true, needsDate: false, ...over }) as any;
/** What the screen does when the student types a date into one row. */
const dateIt = (item: any, d: string) => ({ ...item, due_date: d, accepted: true });

// ── 1. Nothing is ever dated automatically ─────────────────────────────────

Deno.test('an all-dateless review assigns no dates by itself', () => {
  // The 29-item case. Reading the list must not change it.
  const items = Array.from({ length: 29 }, () => dateless());
  assertEquals(countStillMissingDates(items), 29);
  assertEquals(saveableItems(items).length, 0);
  assertEquals(items.every((i) => i.due_date === null), true);
  assertEquals(items.every((i) => i.accepted === false), true);
});

Deno.test('no exported helper can write a date', () => {
  // Guards the removal itself: if a bulk-apply is ever reintroduced, this
  // module's surface is where it would appear.
  const surface = { countStillMissingDates, invalidAcceptedItems, isRealDate, saveableItems };
  const items = [dateless(), dateless(), dated('2026-09-01')];
  const before = JSON.stringify(items);
  for (const fn of Object.values(surface)) (fn as (x: unknown) => unknown)(items);
  assertEquals(JSON.stringify(items), before);
});

// ── 2/3. Dating items by hand makes exactly those saveable ─────────────────

Deno.test('dating ONE item makes only that item saveable', () => {
  const items = [dateless(), dateless(), dateless()];
  const after = [dateIt(items[0], '2026-09-10'), items[1], items[2]];
  assertEquals(saveableItems(after).length, 1);
  assertEquals(saveableItems(after)[0].due_date, '2026-09-10');
  assertEquals(countStillMissingDates(after), 2);
});

Deno.test('dating THREE of twenty-nine makes only those three saveable', () => {
  const items = Array.from({ length: 29 }, () => dateless());
  const after = items.map((it, i) =>
    i < 3 ? dateIt(it, ['2026-09-10', '2026-10-01', '2026-11-20'][i]) : it);
  assertEquals(saveableItems(after).length, 3);
  assertEquals(countStillMissingDates(after), 26);
  // And the three carry DIFFERENT dates — the whole point of the removal.
  assertEquals(new Set(saveableItems(after).map((i) => i.due_date)).size, 3);
});

// ── 4. Untouched dateless items stay unsaveable ────────────────────────────

Deno.test('untouched dateless items remain unsaveable and unselected', () => {
  const items = [dateIt(dateless(), '2026-09-10'), dateless(), dateless()];
  const untouched = items.slice(1);
  assertEquals(untouched.every((i) => i.accepted === false), true);
  assertEquals(saveableItems(untouched).length, 0);
  assertEquals(invalidAcceptedItems(untouched).length, 0); // not accepted, so not an error
});

Deno.test('a dateless item that somehow got accepted is caught before saving', () => {
  const rogue = dateless({ accepted: true });
  assertEquals(invalidAcceptedItems([rogue]).length, 1);
});

// ── 5. Correctly extracted dated items are untouched ───────────────────────

Deno.test('items the parser dated are unchanged and stay saveable', () => {
  const items = [dated('2026-09-01'), dated('2026-10-02'), dateless()];
  assertEquals(saveableItems(items).map((i) => i.due_date), ['2026-09-01', '2026-10-02']);
  assertEquals(countStillMissingDates(items), 1);
});

Deno.test('select-all can only ever reach dated items', () => {
  const items = [dated('2026-09-01'), dateless(), dated('2026-10-02'), dateless()];
  assertEquals(saveableItems(items).length, 2);
  assertEquals(saveableItems(items).every((i) => !i.needsDate), true);
});

// ── 6. No path produces identical deadlines across unrelated items ─────────

Deno.test('nothing collapses distinct items onto one shared date', () => {
  // Mirrors run 8a9b07ae: 38 distinct titles, zero dates. Whatever the screen
  // does, it must not end with 38 tasks sharing a deadline.
  const items = Array.from({ length: 38 }, () => dateless());
  const dates = saveableItems(items).map((i) => i.due_date);
  assertEquals(dates.length, 0);
  // After the student dates two of them, only those two exist, distinctly.
  const after = items.map((it, i) => (i < 2 ? dateIt(it, i === 0 ? '2026-09-01' : '2026-12-05') : it));
  assertEquals(new Set(saveableItems(after).map((i) => i.due_date)).size, 2);
});

// ── 7. Save-time validation still holds ────────────────────────────────────

Deno.test('save validation rejects accepted items without a real date', () => {
  const accepted = [dated('2026-09-01'), dateless({ accepted: true })];
  assertEquals(invalidAcceptedItems(accepted).length, 1);
});

Deno.test('save validation passes when every accepted item is dated', () => {
  assertEquals(invalidAcceptedItems([dated('2026-09-01'), dated('2026-10-02')]).length, 0);
});

Deno.test('impossible calendar dates never reach the insert', () => {
  // 2026-02-30 parses in JS and rolls to March 2 — filing work in the wrong month.
  assertEquals(isRealDate('2026-02-30'), false);
  assertEquals(isRealDate('2026-02-29'), false); // 2026 is not a leap year
  assertEquals(isRealDate('2028-02-29'), true);  // 2028 is
  assertEquals(invalidAcceptedItems([dateless({ due_date: '2026-02-30', accepted: true })]).length, 1);
});

Deno.test('malformed and empty dates are rejected', () => {
  for (const bad of ['', '2026-9-1', '09/01/2026', 'TBA', '2026-09', null, undefined]) {
    assertEquals(isRealDate(bad as any), false, `expected ${bad} to be rejected`);
  }
});
