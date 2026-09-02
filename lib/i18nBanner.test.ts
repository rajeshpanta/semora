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
