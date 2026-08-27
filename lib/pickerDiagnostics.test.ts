/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/pickerDiagnostics.test.ts
 *
 * The redaction cases are the important ones. A picker error is the likeliest
 * place in the app for a real filename or an iCloud path to appear, and this
 * payload is written to an analytics table we keep.
 */
import { assertEquals, assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  describePickerFailure,
  pickerErrorCode,
  redactPickerMessage,
  PICKER_MESSAGE_MAX,
} from './pickerDiagnostics';

const ctx = {
  method: 'document' as const,
  reason: 'threw' as const,
  elapsedMs: 40,
  platform: 'ios',
  appVersion: '1.9.1',
  nativeBuild: '53',
  osVersion: '18.5',
  interfaceIdiom: 'phone',
  appState: 'active',
};

// ── Redaction ───────────────────────────────────────────────────────────────

Deno.test('file:// URIs never survive', () => {
  const out = redactPickerMessage(
    'Failed to copy file:///private/var/mobile/Containers/Data/Application/ABC/tmp/Midterm%20Essay.pdf',
  );
  assert(!out.includes('Midterm'), out);
  assert(!out.includes('file://'), out);
  assert(!out.includes('.pdf'), out);
});

Deno.test('bare absolute paths never survive', () => {
  const out = redactPickerMessage('ENOENT: no such file or directory, open /Users/dana/Desktop/BIO 101 syllabus.docx');
  assert(!out.includes('dana'), out);
  assert(!out.includes('BIO'), out);
  assert(!out.includes('Desktop'), out);
});

Deno.test('a quoted filename never survives', () => {
  const out = redactPickerMessage('Could not read "Chem Lab Report Final v3.docx"');
  assert(!out.includes('Chem'), out);
  assert(!out.includes('Final'), out);
});

Deno.test('an unquoted basename never survives', () => {
  const out = redactPickerMessage('Unsupported type for PSYC-Week4-notes.heic');
  assert(!out.includes('PSYC'), out);
  assert(!out.includes('Week4'), out);
});

Deno.test('an email address never survives', () => {
  const out = redactPickerMessage('iCloud account student.name@icloud.com is not signed in');
  assert(!out.includes('student.name'), out);
  assert(out.includes('<email>'), out);
});

Deno.test('content:// and ph:// URIs never survive', () => {
  assert(!redactPickerMessage('open content://media/external/file/1234').includes('content://'));
  assert(!redactPickerMessage('asset ph://A1B2-C3D4 missing').includes('ph://'));
});

Deno.test('the diagnostic shape of a native error is preserved', () => {
  // The whole point: we still learn WHAT threw.
  const out = redactPickerMessage(
    'NSCocoaErrorDomain error 257 — the file could not be opened because you do not have permission',
  );
  assert(out.includes('NSCocoaErrorDomain'), out);
  assert(out.includes('257'), out);
  assert(out.includes('permission'), out);
});

Deno.test('long messages are truncated, not dropped', () => {
  const out = redactPickerMessage('E'.repeat(1000));
  assertEquals(out.length, PICKER_MESSAGE_MAX);
  assert(out.endsWith('…'));
});

Deno.test('non-strings and blanks become empty, never "undefined"', () => {
  assertEquals(redactPickerMessage(undefined), '');
  assertEquals(redactPickerMessage(null), '');
  assertEquals(redactPickerMessage(''), '');
  assertEquals(redactPickerMessage('   '), '');
  assertEquals(redactPickerMessage({ toString: () => '/secret/path' }), '');
});

// ── Error identity ──────────────────────────────────────────────────────────

Deno.test('an explicit code wins', () => {
  assertEquals(pickerErrorCode({ code: 'E_DOCUMENT_PICKER' }), 'E_DOCUMENT_PICKER');
  assertEquals(pickerErrorCode({ code: 'already-presenting' }), 'ALREADY_PRESENTING');
});

Deno.test('numeric codes and statuses are named', () => {
  assertEquals(pickerErrorCode({ code: 257 }), 'E257');
  assertEquals(pickerErrorCode({ status: 500 }), 'HTTP_500');
});

Deno.test('a named error falls back to its name; a plain Error does not', () => {
  assertEquals(pickerErrorCode({ name: 'TypeError' }), 'TYPEERROR');
  assertEquals(pickerErrorCode({ name: 'Error' }), 'UNKNOWN');
  assertEquals(pickerErrorCode(null), 'UNKNOWN');
});

// ── The event payload ───────────────────────────────────────────────────────

Deno.test('a sub-150ms failure is flagged instant — the tell from the incident', () => {
  // 0.00s and 0.04s were the two that proved these were throws, not choices.
  assertEquals(describePickerFailure(new Error('x'), { ...ctx, elapsedMs: 0 }).instant, true);
  assertEquals(describePickerFailure(new Error('x'), { ...ctx, elapsedMs: 40 }).instant, true);
  assertEquals(describePickerFailure(new Error('x'), { ...ctx, elapsedMs: 1700 }).instant, false);
});

Deno.test('a timeout is its own code and never merges with a throw', () => {
  const out = describePickerFailure(null, { ...ctx, reason: 'timeout', elapsedMs: 120_000 });
  assertEquals(out.error_code, 'PICKER_TIMEOUT');
  assertEquals(out.error_name, 'Timeout');
  assertEquals(out.error_message, '');
});

Deno.test('context is carried through for the build that failed', () => {
  const out = describePickerFailure(new Error('boom'), ctx);
  assertEquals(out.method, 'document');
  assertEquals(out.platform, 'ios');
  assertEquals(out.app_version, '1.9.1');
  assertEquals(out.native_build, '53');
  assertEquals(out.os_version, '18.5');
  assertEquals(out.interface_idiom, 'phone');
  assertEquals(out.app_state, 'active');
  assertEquals(out.screen, 'scan');
});

Deno.test('missing context degrades to null, never to undefined keys', () => {
  const out = describePickerFailure(new Error('boom'), {
    method: 'photos', reason: 'threw', elapsedMs: 5, platform: 'web',
  });
  assertEquals(out.app_version, null);
  assertEquals(out.native_build, null);
  assertEquals(out.os_version, null);
  assertEquals(out.interface_idiom, null);
  assertEquals(out.app_state, null);
});

Deno.test('elapsed_ms is never negative and always an integer', () => {
  assertEquals(describePickerFailure(null, { ...ctx, elapsedMs: -5 }).elapsed_ms, 0);
  assertEquals(describePickerFailure(null, { ...ctx, elapsedMs: 12.7 }).elapsed_ms, 13);
});

Deno.test('no payload key can carry a path, a filename or an address', () => {
  const err = Object.assign(
    new Error('could not open file:///var/mobile/Anna Essay.pdf for anna@icloud.com'),
    { code: 'E_PICK' },
  );
  const out = describePickerFailure(err, ctx);
  const serialized = JSON.stringify(out);
  for (const leak of ['Anna', 'Essay', '.pdf', 'anna@icloud.com', '/var/mobile', 'file://']) {
    assert(!serialized.includes(leak), `leaked ${leak} in ${serialized}`);
  }
});
