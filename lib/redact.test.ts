/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/redact.test.ts
 *
 * The frames below have the exact shapes that reached analytics. Names in them
 * are invented.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { redactSensitiveText, redactStackFrame } from './redact.ts';

// The row that was found: the iPhone app on a Mac, and a home folder in the frame.
Deno.test('a Mac home folder never survives, and the file and line do', () => {
  const frame = 'at anonymous (address at /Users/jordanlee2007/Library/Containers/com.rajeshpanta.syllabussnap/Data/Library/Application Support/.expo-internal/5f2c.hbc:1:88231)';
  const out = redactStackFrame(frame, 120)!;
  assert(!out.includes('jordanlee2007'), out);
  assert(!out.includes('/Users/'), out);
  assert(out.includes('5f2c.hbc:1:88231'), out);
  assert(out.startsWith('at anonymous (address at '), out);
});

// The old code sliced to 120 first, keeping the home folder and losing the file.
Deno.test('the directory is dropped before truncating, so a long path still names the file', () => {
  const frame = `at anonymous (address at /Users/sam/${'deep/'.repeat(40)}main.jsbundle:1:4242)`;
  const out = redactStackFrame(frame, 120)!;
  assert(out.includes('main.jsbundle:1:4242'), out);
  assert(out.length <= 120);
});

Deno.test('a developer build path is reduced the same way', () => {
  const out = redactStackFrame(
    'at ?anon_0_ (/Users/devname/Library/Developer/Xcode/DerivedData/Semora-aohpy/Build/Intermediates.noindex/main.jsbundle:1:9)',
    120,
  )!;
  assertEquals(out, 'at ?anon_0_ (main.jsbundle:1:9)');
});

Deno.test('a phone container path keeps only the script', () => {
  const out = redactStackFrame(
    'at anonymous (address at /private/var/containers/Bundle/Application/1B2C3D4E-0000-4000-8000-000000000000/Semora.app/main.jsbundle:1:77)',
    160,
  )!;
  assertEquals(out, 'at anonymous (address at main.jsbundle:1:77)');
});

Deno.test('a web frame keeps the bundle name and position, not the host', () => {
  const out = redactStackFrame(
    'at e (https://app.semoraai.com/_expo/static/js/web/entry-1502b680050c7a12a756db719cde05d3.js:1442:698)',
    160,
  )!;
  assertEquals(out, 'at e (entry-1502b680050c7a12a756db719cde05d3.js:1442:698)');
});

Deno.test('a frame with a query string still ends in file:line:column', () => {
  const out = redactStackFrame('at f (https://example.test/assets/app.js?v=12:3:4)', 160)!;
  assertEquals(out, 'at f (app.js:3:4)');
});

Deno.test('frames that name no location are left as they are', () => {
  assertEquals(redactStackFrame('at native', 160), 'at native');
  assertEquals(redactStackFrame('    at Array.map (native)', 160), 'at Array.map (native)');
});

Deno.test('a missing frame is null, never "undefined"', () => {
  assertEquals(redactStackFrame(undefined, 160), null);
  assertEquals(redactStackFrame('', 160), null);
  assertEquals(redactStackFrame('   ', 160), null);
});

Deno.test('error text loses paths, links, filenames and addresses, and keeps its meaning', () => {
  const out = redactSensitiveText(
    'Upload of file:///var/mobile/Containers/Data/Application/X/tmp/BIO 101 Syllabus.pdf failed for pat.doe@school.edu at /Users/pat/Desktop',
    { maxLength: 300 },
  );
  assert(!out.includes('pat.doe@school.edu'), out);
  assert(!out.includes('/Users/pat'), out);
  assert(!out.includes('Syllabus.pdf'), out);
  assert(out.startsWith('Upload of <uri>'), out);
  assert(out.includes('failed for <email>'), out);
});

// General error text keeps quoted detail; only picker messages blank it.
Deno.test('quoted text survives in error text unless asked to redact it', () => {
  const msg = 'Column "due_date" does not exist';
  assertEquals(redactSensitiveText(msg, { maxLength: 300 }), msg);
  assertEquals(redactSensitiveText(msg, { maxLength: 300, redactQuoted: true }), 'Column "<redacted>" does not exist');
});

Deno.test('the messages students actually see pass through unchanged', () => {
  for (const msg of [
    'Network error while uploading. Please check your connection and try again.',
    'File too large. Maximum size is approximately 11 MB.',
    'Could not load subscription details from Google Play. Please try again in a moment.',
  ]) {
    assertEquals(redactSensitiveText(msg, { maxLength: 300 }), msg);
  }
});
