/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --allow-read --config lib/deno.test.json lib/surfaceStrings.test.ts
 *
 * The interesting cases here are not "does the table have entries". They are
 * the two ways this mechanism can fail silently on a device:
 *
 * A key the phone sends that no native surface reads is dead weight; a key a
 * native surface reads that the phone never sends means that label is stuck in
 * English forever and nobody finds out, because the fallback makes it look
 * deliberate. So the Swift is parsed and the two sets are compared.
 *
 * The other is drift between a Swift fallback and the English in this table.
 * That is invisible until the day an old payload arrives — which is exactly the
 * day nobody is watching — so the fallbacks are compared literally.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  SURFACE_STRING_KEYS,
  buildSurfaceStrings,
  englishFallback,
} from './surfaceStrings';

const NATIVE_FILES = [
  '../targets/watch/index.swift',
  '../targets/watch/WatchModel.swift',
  '../targets/watch-widget/index.swift',
  '../targets/watch-widget/ComplicationModel.swift',
  '../targets/widget/index.swift',
];

/** Every `("some.key", "Some English")` lookup the Swift actually performs. */
async function nativeLookups(): Promise<Map<string, Set<string>>> {
  const found = new Map<string, Set<string>>();
  for (const file of NATIVE_FILES) {
    const source = await Deno.readTextFile(new URL(file, import.meta.url));
    // strings("key", "fallback")  /  t("key", "fallback")  — with or without n:
    const re = /(?:strings|t)\(\s*"([a-zA-Z.]+)"\s*,\s*"((?:[^"\\]|\\.)*)"/g;
    for (const m of source.matchAll(re)) {
      const key = m[1];
      const fallback = m[2].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      if (!found.has(key)) found.set(key, new Set());
      found.get(key)!.add(fallback);
    }
  }
  return found;
}

Deno.test('every key the phone sends is read by some native surface', async () => {
  const used = await nativeLookups();
  const unused = SURFACE_STRING_KEYS.filter((k) => !used.has(k));
  assertEquals(unused, [], `sent but never read: ${unused.join(', ')}`);
});

Deno.test('every key a native surface reads is one the phone sends', async () => {
  const used = await nativeLookups();
  const missing = [...used.keys()].filter((k) => !SURFACE_STRING_KEYS.includes(k));
  assertEquals(missing, [], `read natively but never sent — permanently English: ${missing.join(', ')}`);
});

Deno.test('every Swift fallback matches the English in this table', async () => {
  // A drifted fallback is invisible until an old payload arrives, which is the
  // one moment nobody is looking at it.
  const used = await nativeLookups();
  const drifted: string[] = [];
  for (const [key, fallbacks] of used) {
    const expected = englishFallback(key);
    if (expected == null) continue;
    for (const actual of fallbacks) {
      if (actual !== expected) drifted.push(`${key}: swift "${actual}" vs table "${expected}"`);
    }
  }
  assertEquals(drifted, [], `\n  ${drifted.join('\n  ')}`);
});

Deno.test('both languages are complete, and differ', async () => {
  const en = buildSurfaceStrings('en');
  const es = buildSurfaceStrings('es');
  assertEquals(Object.keys(en).length, SURFACE_STRING_KEYS.length);
  for (const key of SURFACE_STRING_KEYS) {
    assert(en[key]?.trim(), `${key} has no English`);
    assert(es[key]?.trim(), `${key} has no Spanish`);
    // A Spanish string identical to the English one is almost always a
    // forgotten translation. "Semora" would be a legitimate exception; there
    // are none in the table today.
    assert(es[key] !== en[key], `${key} left untranslated: "${en[key]}"`);
  }
});

Deno.test('placeholders survive translation', async () => {
  const en = buildSurfaceStrings('en');
  const es = buildSurfaceStrings('es');
  for (const key of SURFACE_STRING_KEYS) {
    assertEquals(
      en[key].includes('{n}'),
      es[key].includes('{n}'),
      `${key}: one language has {n} and the other does not — the count would vanish`,
    );
  }
});

Deno.test('the payload is flat strings, which is all a property list accepts', () => {
  // It has to survive updateApplicationContext and a UserDefaults round trip.
  const payload = buildSurfaceStrings('es');
  for (const [key, value] of Object.entries(payload)) {
    assertEquals(typeof key, 'string');
    assertEquals(typeof value, 'string');
  }
  // And it must survive JSON, which is how the widget receives it.
  assertEquals(JSON.parse(JSON.stringify(payload)), payload);
});

Deno.test('the vocabulary is small enough to send with every snapshot', () => {
  // WatchConnectivity application context has a hard size limit and the whole
  // snapshot shares it. Well under any plausible ceiling, but worth pinning:
  // this table only ever grows.
  const bytes = new TextEncoder().encode(JSON.stringify(buildSurfaceStrings('es'))).length;
  assert(bytes < 8_000, `vocabulary is ${bytes} bytes`);
});

Deno.test('no native surface still hardcodes a phrase the table owns', async () => {
  // The point of the exercise: a label left as a Swift literal is a label that
  // cannot be translated or changed over the air. Checks the display strings
  // most likely to be missed, not every literal — SF Symbol names, dictionary
  // keys and bundle identifiers are legitimately native.
  const suspects = [
    'Sign in on your iPhone to see your work here.',
    'Nothing due today or coming up.',
    "You're all caught up",
    'Open Semora on your iPhone to sync.',
    'Not synced yet',
    'All caught up',
    'Nothing due or overdue',
    'Open Semora to scan a syllabus',
    'Nothing due in the next 7 days',
  ];
  for (const file of NATIVE_FILES) {
    const source = await Deno.readTextFile(new URL(file, import.meta.url));
    for (const phrase of suspects) {
      const occurrences = source.split(`"${phrase}"`).length - 1;
      if (occurrences === 0) continue;
      // Every remaining occurrence must be a fallback argument, i.e. preceded
      // by a key on the same call.
      const asFallback = source.split(`, "${phrase}"`).length - 1;
      assertEquals(
        occurrences, asFallback,
        `${file}: "${phrase}" appears ${occurrences}x but only ${asFallback} as a fallback`,
      );
    }
  }
});
