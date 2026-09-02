/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/storageKey.test.ts
 *
 * Every filename below is a real one that production rejected between
 * 2026-08-23 and 2026-09-01, each leaving a syllabus_uploads row pointing at a
 * file that was never written. They are the test cases because they are the
 * bug — a sanitiser written against imagined inputs would have missed the bidi
 * marks and probably the en dash.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { safeStorageName, userScopedStorageKey } from './storageKey';

const USER = 'c604f046-adfc-46fa-a5b7-a2a42fc1dd38';

/** What Supabase Storage will accept in an object key. */
const KEY_SAFE = /^[\w.\-]+$/;

Deno.test('the Concourse export shape — four of the ten real failures', () => {
  const name = safeStorageName('New Testament Survey > Syllabus | Concourse.pdf');
  assert(KEY_SAFE.test(name), name);
  assertEquals(name, 'New_Testament_Survey_Syllabus_Concourse.pdf');
});

Deno.test('every filename production actually rejected now produces a usable key', () => {
  const rejected = [
    'New Testament Survey > Syllabus | Concourse.pdf',
    'Composition I > Syllabus | Concourse.pdf',
    'ENG-251-1-10203 AMERICAN LITERATURE I (Fall 2026) > Syllabus | Concourse.pdf',
    '[CJ483] Course Schedule_Reading Assignments F26.pdf',
    'EDTL 2630 Intro to Psych of Music Syllabus – Fall 2026 (Hamann).docx', // en dash
    '‎⁦توصيف مقرر الثقافة الإسلامية خريف 2025 شعبة L08⁩.pdf', // bidi marks
  ];
  for (const original of rejected) {
    const name = safeStorageName(original);
    assert(KEY_SAFE.test(name), `${original} -> ${name}`);
    assert(name.length > 0);
  }
});

Deno.test('the extension survives, because the viewer picks the app from it', () => {
  assert(safeStorageName('Course > Syllabus.pdf').endsWith('.pdf'));
  assert(safeStorageName('Notes | Week 1.docx').endsWith('.docx'));
  // Even when nothing else does.
  assert(safeStorageName('توصيف مقرر.pdf').endsWith('.pdf'));
});

Deno.test('an already-clean filename is left exactly as it was', () => {
  // The overwhelming majority of the 381 uploads. Sanitising must not churn
  // keys that were already fine, or old and new rows stop looking alike.
  for (const clean of ['PHY_241_Lab.pdf', 'syllabus.pdf', 'CS-101.v2.docx', 'a.b-c_d.txt']) {
    assertEquals(safeStorageName(clean), clean);
  }
});

Deno.test('a run of bad characters collapses to one underscore, not many', () => {
  assertEquals(safeStorageName('a >>> b'), 'a_b');
  assertEquals(safeStorageName('a   b'), 'a_b');
});

Deno.test('a name with nothing worth keeping still yields a usable key', () => {
  // Not hypothetical: a title written entirely in a non-Latin script.
  assertEquals(safeStorageName('توصيف'), 'file');
  assertEquals(safeStorageName(''), 'file');
  assertEquals(safeStorageName('>>>'), 'file');
  assertEquals(safeStorageName(undefined as unknown as string), 'file');
});

Deno.test('the key keeps the owner-id first segment the RLS policy checks', () => {
  const key = userScopedStorageKey(USER, 'Course > Syllabus | Concourse.pdf', 1788285994063);
  assertEquals(key, `${USER}/1788285994063_Course_Syllabus_Concourse.pdf`);
  assertEquals(key.split('/')[0], USER);
  // Exactly one separator: a filename can never escape its own folder.
  assertEquals(key.split('/').length, 2);
});

Deno.test('a filename cannot smuggle in a path separator', () => {
  const key = userScopedStorageKey(USER, '../../etc/passwd', 1);
  assertEquals(key.split('/').length, 2);
  assert(!key.includes('..' + '/'));
});
