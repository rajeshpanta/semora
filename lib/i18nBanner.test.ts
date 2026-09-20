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
    'Saving on this phone…',
    'Keep Semora open for a moment while the last part is written.',
    'Saved on this phone. Uploading resumes whenever Semora can, and your lecture will be waiting under Lectures.',
  ]) {
    const spanish = translate(english, 'es');
    if (spanish === english) throw new Error(`untranslated: ${english}`);
  }
});

// Upload progress: four interpolated sentences, and the one that used to say
// "safe to close the app" for a lecture that had lost half its audio.
Deno.test('lecture upload progress is translated in every shape', () => {
  const cases: [string, string][] = [
    ['1 part is still on this phone waiting to upload.', 'Queda 1 parte en este teléfono esperando a subirse.'],
    ['4 parts are still on this phone waiting to upload.', 'Quedan 4 partes en este teléfono esperando a subirse.'],
    ['1 part uploaded so far.', 'Se ha subido 1 parte hasta ahora.'],
    ['6 parts uploaded so far.', 'Se han subido 6 partes hasta ahora.'],
    ['4 of 8 parts uploaded — stay connected until this finishes', '4 de 8 partes subidas: mantén la conexión hasta que termine'],
    ['All 8 parts uploaded — safe to close the app', 'Las 8 partes están subidas: ya puedes cerrar la app'],
  ];
  for (const [english, spanish] of cases) assertEquals(translate(english, 'es'), spanish);
});

// ── Moodle setup (MOODLE_PLAN.md Phase 4.10) ───────────────────────────────
// Every one of these carries a host, a name or a count, so none of them can
// match a phrase-map key. Untested, they ship to Spanish students in English.
Deno.test('Moodle setup lines with a value in them are translated', () => {
  const cases: [string, string][] = [
    ['MOODLE SETUP · STEP 1 OF 2', 'CONFIGURACIÓN DE MOODLE · PASO 1 DE 2'],
    ['MOODLE SETUP · STEP 2 OF 2', 'CONFIGURACIÓN DE MOODLE · PASO 2 DE 2'],
    ['Found: Mount Orange', 'Encontrado: Mount Orange'],
    ['Looks right — moodle.school.edu', 'Parece correcto: moodle.school.edu'],
    ['Your Moodle shares 30 days ahead.', 'Tu Moodle comparte 30 días hacia adelante.'],
    ['Your enrolment in Physics 101 has ended in Moodle.', 'Tu matrícula en Physics 101 terminó en Moodle.'],
    ['Your enrolment in 3 courses has ended in Moodle.', 'Tu matrícula en 3 asignaturas terminó en Moodle.'],
    // The import toast: Canvas's Spanish must be exactly what it always was,
    // and Moodle must get the same words rather than a second dialect.
    ['3 courses and 42 deadlines imported. Semora will keep checking Canvas every few hours.',
     'Se importaron 3 cursos y 42 entregas. Semora seguirá revisando Canvas cada pocas horas.'],
    ['1 course and 5 deadlines imported. Semora will keep checking Moodle every few hours.',
     'Se importaron 1 curso y 5 entregas. Semora seguirá revisando Moodle cada pocas horas.'],
    // One card, two numbers, two sentences. The plural form used to answer for both.
    ['Canvas is listing a course Semora has not imported. Review and choose a semester.',
     'Canvas está mostrando una materia que Semora no ha importado. Revísala y elige un semestre.'],
    ['Moodle is listing courses Semora has not imported. Review and choose a semester.',
     'Moodle está mostrando materias que Semora no ha importado. Revísalas y elige un semestre.'],
    ['Moodle checks every few hours', 'Moodle revisa cada pocas horas'],
    ['Canvas checks every few hours', 'Canvas revisa cada pocas horas'],
    ['Open moodle.school.edu', 'Abrir moodle.school.edu'],
    [
      'That link is from other.edu — open its calendar export instead',
      'Ese enlace es de other.edu: abre su exportación del calendario',
    ],
    [
      '5 courses and 62 deadlines imported. Semora will keep checking Moodle every few hours.',
      'Se importaron 5 cursos y 62 entregas. Semora seguirá revisando Moodle cada pocas horas.',
    ],
    [
      '1 course and 3 deadlines imported. Semora will keep checking Canvas every few hours.',
      'Se importaron 1 curso y 3 entregas. Semora seguirá revisando Canvas cada pocas horas.',
    ],
  ];
  for (const [english, spanish] of cases) assertEquals(translate(english, 'es'), spanish);
});

Deno.test('the Moodle refusals and setup labels are in the phrase map', () => {
  for (const english of [
    'Paste your Moodle calendar link.',
    'That is the Moodle sign-in page, not the calendar link.',
    'That is the Export page — tap Get calendar URL, then Copy URL.',
    'That is a downloaded file, not the link.',
    'That link is from a different Moodle than the one you chose.',
    'Where is your Moodle?',
    'Find my Moodle',
    'Open your Moodle calendar',
    'Sign in if Moodle asks.',
    'Tap Get calendar URL.',
    'Tap Copy URL.',
    'Come back to Semora.',
    'Nothing dated yet',
    'Save and keep checking',
    'Moodle connected',
    'My school gave me a web-service token',
    'Deadlines, quizzes and exams from your Moodle calendar — no admin needed',
    'Tap a name to change it',
    // Canvas-shared strings the Moodle component reuses, which had no Spanish
    // entry at all before this work.
    'Which school?',
    'Paste from clipboard',
    'Do it here on my phone',
    'I have a laptop nearby',
    'See my deadlines',
  ]) {
    const spanish = translate(english, 'es');
    if (spanish === english) throw new Error(`untranslated: ${english}`);
  }
});
