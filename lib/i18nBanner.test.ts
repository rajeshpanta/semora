/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/i18nBanner.test.ts
 *
 * Interpolated strings cannot match a catalogue key, so they are translated by
 * the regex chain in lib/i18n.ts instead — a mechanism nothing was testing. A
 * missed match there does not fail: it silently ships English to a Spanish
 * student, which is exactly how it would go unnoticed.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { translate } from './i18n';

Deno.test('the held-back-courses banner reaches Spanish, singular and plural', () => {
  const one = translate('1 new Canvas course found — its deadlines are not in Semora yet', 'es');
  const many = translate('4 new Canvas courses found — their deadlines are not in Semora yet', 'es');

  assert(one.startsWith('Se encontró 1 curso nuevo de Canvas'), one);
  assert(many.startsWith('Se encontraron 4 cursos nuevos de Canvas'), many);
  // The whole point of the banner survives the translation.
  assert(one.includes('entregas') && many.includes('entregas'));
});

Deno.test('the banner accessibility label is translated too', () => {
  const label = translate('4 new Canvas courses found, deadlines not imported yet', 'es');
  assert(label.startsWith('4 cursos nuevos de Canvas'), label);
});

Deno.test('English is returned untouched', () => {
  const en = '4 new Canvas courses found — their deadlines are not in Semora yet';
  assertEquals(translate(en, 'en'), en);
});

Deno.test('a count with more than one digit still matches', () => {
  const es = translate('12 new Canvas courses found — their deadlines are not in Semora yet', 'es');
  assert(es.includes('12 cursos nuevos'), es);
});

Deno.test('the post-import confirmation no longer promises hourly', () => {
  // Interpolated, so it lives in the regex chain rather than the catalogue —
  // the half of i18n that fails silently. SYNC_HOURS is 3h for calendar feeds
  // and 4h for token; "hourly" stopped being true when that changed.
  const en = '3 courses and 42 deadlines imported. Semora will keep checking Canvas every few hours.';
  const es = translate(en, 'es');
  assert(es !== en, 'fell through untranslated');
  assert(es.includes('cada pocas horas'), es);
  assert(!/cada hora/.test(es), `still promises hourly: ${es}`);
});

// ── incomplete lecture notes (2026-09-14) ──────────────────────────────────
// The sentence carrying the count is interpolated, so it can never match a
// phrase-map key. It has to go through spanishPattern or a Spanish student is
// told their notes are incomplete in English.
Deno.test('the incomplete-notes line is translated, singular and plural', () => {
  assertEquals(
    translate('These notes are incomplete. 1 part of this recording has not arrived.', 'es'),
    'Estos apuntes están incompletos. Falta 1 parte de esta grabación.',
  );
  assertEquals(
    translate('These notes are incomplete. 4 parts of this recording have not arrived.', 'es'),
    'Estos apuntes están incompletos. Faltan 4 partes de esta grabación.',
  );
});

Deno.test('the rest of the incomplete-notes wording is in the phrase map', () => {
  for (const english of [
    'Trying…',
    'Try again',
    'Try the missing parts again',
    'The missing audio may still be on the phone that recorded it.',
  ]) {
    const spanish = translate(english, 'es');
    if (spanish === english) throw new Error(`untranslated: ${english}`);
  }
});
