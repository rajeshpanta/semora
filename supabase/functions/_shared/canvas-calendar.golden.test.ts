/**
 * Canvas, frozen.
 *
 * Run with:
 *   deno test --allow-read supabase/functions/_shared/canvas-calendar.golden.test.ts
 *
 * MOODLE_PLAN.md Phase 1.1. Moodle work reaches into this module — the RFC 5545
 * primitives become exported, `truncateDescription` gains a provider label, and
 * the `!source` skip that drops every event without a URL has to stop being
 * unconditional. Fifty-eight live Canvas connections depend on none of that
 * changing what Canvas produces.
 *
 * So the expected output is generated from the code BEFORE any of it moves and
 * committed as JSON. This test then asserts deep equality, field for field. A
 * refactor that alters a single Canvas value fails here, which is the only
 * thing standing between the Moodle work and 58 students' deadlines.
 *
 * To regenerate deliberately (only when Canvas output is MEANT to change):
 *   deno run --allow-read --allow-write supabase/functions/_shared/canvas-calendar.golden.test.ts --update
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseCanvasCalendarFeed } from './canvas-calendar.ts';

const DIR = new URL('./fixtures/canvas/', import.meta.url);
const FIXTURES = ['inline-feed.ics'];

if (Deno.args.includes('--update')) {
  for (const name of FIXTURES) {
    const ics = await Deno.readTextFile(new URL(name, DIR));
    const parsed = parseCanvasCalendarFeed(ics);
    await Deno.writeTextFile(
      new URL(name.replace(/\.ics$/, '.expected.json'), DIR),
      `${JSON.stringify(parsed, null, 2)}\n`,
    );
    console.log(`updated ${name}`);
  }
} else {
  for (const name of FIXTURES) {
    Deno.test(`Canvas output is unchanged: ${name}`, async () => {
      const ics = await Deno.readTextFile(new URL(name, DIR));
      const expected = JSON.parse(
        await Deno.readTextFile(new URL(name.replace(/\.ics$/, '.expected.json'), DIR)),
      );
      assertEquals(JSON.parse(JSON.stringify(parseCanvasCalendarFeed(ics))), expected);
    });
  }
}
