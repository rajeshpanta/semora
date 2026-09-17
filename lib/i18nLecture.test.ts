/**
 * Every English string the Record Lecture screens show reaches Spanish.
 *
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --allow-read --config lib/deno.test.json lib/i18nLecture.test.ts
 *
 * The lecture screens were mostly English in Spanish mode (report item X6):
 * status pills, the stalled and failed cards, busy messages, alerts, the quiz
 * and flashcard buttons. Nothing failed when a string was missing — it simply
 * shipped English. This reads the screens themselves, pulls out every piece of
 * user-facing copy, and fails on any that has no Spanish.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { spokenDuration, translate } from './i18n';

const FILES = [
  'app/lecture/record.tsx',
  'app/lecture/[id].tsx',
  'app/lecture/index.tsx',
  // The upload chooser and the quiz: their subtitles, stage labels and the
  // quiz's last button shipped in English because nothing scanned them.
  'app/lecture/new.tsx',
  'app/lecture/quiz.tsx',
  'components/LectureRecordingBar.tsx',
  'components/LectureInterruptedNotice.tsx',
  // The consent gate: its three legal bullets shipped in English to Spanish
  // students because nothing scanned this file.
  'components/LectureConsentSheet.tsx',
  'lib/lectureAutoSaveCopy.ts',
];

const root = new URL('..', import.meta.url);

/** Copy looks like a sentence or a label: letters, and a capital or a space. */
function isCopy(s: string): boolean {
  const v = s.trim();
  if (v.length < 2) return false;
  if (!/[A-Za-z]/.test(v)) return false;
  if (/^[a-z0-9_./:@-]+$/.test(v)) return false; // identifiers, routes, event names
  if (/^(#|rgba?\(|file:|https?:)/.test(v)) return false;
  if (/^[a-z][A-Za-z]+$/.test(v)) return false; // camelCase keys
  if (/^(lecture_|paywall_|push_)/.test(v)) return false;
  if (/&&|\?\s*\(|^\)|\($/.test(v)) return false; // JSX code fragments
  return /[A-Z]/.test(v[0]) || v.includes(' ');
}

const IGNORE = new Set([
  'PRO', // brand tag
  'Semora',
]);

function extract(source: string): { literal: string[]; template: string[] } {
  // Strip comments so explanatory prose is not mistaken for copy.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
  const literal = new Set<string>();
  const template = new Set<string>();

  // JSX text: > text <
  for (const m of code.matchAll(/>\s*([^<>{}]*[A-Za-z][^<>{}]*?)\s*</g)) {
    const text = m[1].replace(/\s+/g, ' ').trim();
    if (isCopy(text) && !/[;=]|=>|\)\s*$/.test(text)) literal.add(text);
  }
  // Quoted strings in places that render or alert.
  const contexts = /(?:Alert\.alert\(|text:\s*|accessibilityLabel=|placeholder=|\?\s*|:\s*|\(\s*)(['"])((?:\\.|(?!\1).)*)\1/g;
  for (const m of code.matchAll(contexts)) {
    const text = m[2].replace(/\\'/g, "'").replace(/\\n/g, '\n');
    if (isCopy(text)) literal.add(text);
  }
  // Template strings with interpolation.
  for (const m of code.matchAll(/`([^`]*\$\{[^`]*)`/g)) {
    const text = m[1];
    if (/^\/|^\$\{[^}]+\}\/|^semora_/.test(text)) continue; // routes and storage keys
    // Pure formatting (clock digits, "·", "%") has no words of its own.
    const words = text.replace(/\$\{[^}]*\}/g, '').replace(/[^A-Za-z]/g, '');
    if (words.length >= 2 && isCopy(text.replace(/\$\{[^}]*\}/g, 'X'))) template.add(text);
  }
  return { literal: [...literal], template: [...template] };
}

/** Fill interpolations with plausible values: numbers for counts and times, a name otherwise. */
function sample(template: string): string {
  return template.replace(/\$\{([^}]*)\}/g, (_all, expr: string) => {
    if (/Label|name|title|Name/.test(expr) && !/Minutes|remaining|elapsed|Duration/.test(expr)) {
      if (/stoppedAt|when/.test(expr)) return '10:42 AM';
      return 'AirPods Pro';
    }
    if (/Duration|formatLecture|remaining|elapsed/.test(expr)) return '12:30';
    return '3';
  });
}

Deno.test('every Record Lecture string has Spanish', async () => {
  const missing: string[] = [];
  for (const file of FILES) {
    const source = await Deno.readTextFile(new URL(file, root));
    const { literal, template } = extract(source);
    for (const s of literal) {
      if (IGNORE.has(s)) continue;
      if (translate(s, 'es') === s) missing.push(`${file}: "${s}"`);
    }
    for (const t of template) {
      const filled = sample(t);
      if (translate(filled, 'es') === filled) missing.push(`${file}: \`${t}\` (as "${filled}")`);
    }
  }
  assert(missing.length === 0, `No Spanish for:\n${missing.join('\n')}`);
});

Deno.test('the recorder clock is read aloud as a duration, in both languages', () => {
  assertEquals(spokenDuration(0, 'en'), '0 seconds');
  assertEquals(spokenDuration(1, 'en'), '1 second');
  assertEquals(spokenDuration(750, 'en'), '12 minutes 30 seconds');
  assertEquals(spokenDuration(61, 'en'), '1 minute 1 second');
  assertEquals(spokenDuration(3600, 'en'), '1 hour 0 minutes 0 seconds');
  assertEquals(spokenDuration(7325.9, 'en'), '2 hours 2 minutes 5 seconds');
  assertEquals(spokenDuration(-5, 'en'), '0 seconds');
  assertEquals(spokenDuration(Number.NaN, 'en'), '0 seconds');
  assertEquals(spokenDuration(750, 'es'), '12 minutos 30 segundos');
  assertEquals(spokenDuration(61, 'es'), '1 minuto 1 segundo');
  assertEquals(spokenDuration(3661, 'es'), '1 hora 1 minuto 1 segundo');
  assertEquals(spokenDuration(7325, 'es'), '2 horas 2 minutos 5 segundos');
});

Deno.test('a kill that saved nothing says so, with and without the start time', () => {
  assertEquals(
    translate("Your recording from 10:42 AM couldn't be saved because Semora was closed while the phone was locked.", 'es'),
    'No se pudo guardar tu grabación de las 10:42 AM porque Semora se cerró mientras el teléfono estaba bloqueado.',
  );
  assertEquals(
    translate("Your recording couldn't be saved because Semora was closed while the phone was locked.", 'es'),
    'No se pudo guardar tu grabación porque Semora se cerró mientras el teléfono estaba bloqueado.',
  );
});

Deno.test('a finished lecture missing parts is not called pending in Spanish', () => {
  assertEquals(translate('Missing parts', 'es'), 'Faltan partes');
  assert(translate('Missing parts', 'es') !== translate('Incomplete', 'es'));
});

Deno.test('labels built from translated pieces survive the component translating them again', () => {
  // record.tsx and LectureRecordingBar.tsx join t() pieces with a spoken
  // duration; LocalizedReactNative then runs translate over the whole label.
  // A Spanish label must come back unchanged, not half-rewritten.
  const left = `${translate('Time left', 'es')}: ${spokenDuration(750, 'es')}`;
  assertEquals(left, 'Tiempo restante: 12 minutos 30 segundos');
  assertEquals(translate(left, 'es'), left);
  const bar = `${translate('Recording paused', 'es')}, ${spokenDuration(61, 'es')}. ${translate('Return to the recording', 'es')}`;
  assertEquals(translate(bar, 'es'), bar);
  assert(!bar.includes('Return'), bar);
  assertEquals(translate('Time left: 12 minutes 30 seconds', 'en'), 'Time left: 12 minutes 30 seconds');
});
