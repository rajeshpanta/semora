import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  documentExtractionFailedMessage,
  normalizeSupportedDocument,
} from './document-files.ts';

Deno.test('normalizes common academic files even when cloud storage reports a generic MIME', () => {
  const cases = [
    ['syllabus.docx', 'application/octet-stream', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['lecture.pptx', 'application/zip', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['reading.pages', 'application/zip', 'application/vnd.apple.pages'],
    ['grades.xlsx', '', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['transcript.vtt', 'text/plain', 'text/vtt'],
  ] as const;

  for (const [fileName, reportedMime, expectedMime] of cases) {
    assertEquals(normalizeSupportedDocument(fileName, reportedMime)?.mimeType, expectedMime);
  }
});

Deno.test('uses a recognized MIME when a provider omits the extension', () => {
  assertEquals(normalizeSupportedDocument('download', 'application/pdf'), {
    fileName: 'download.pdf',
    mimeType: 'application/pdf',
    isImage: false,
    isPdf: true,
  });
});

Deno.test('identifies supported image inputs', () => {
  assertEquals(normalizeSupportedDocument('whiteboard.webp', 'application/octet-stream'), {
    fileName: 'whiteboard.webp',
    mimeType: 'image/webp',
    isImage: true,
    isPdf: false,
  });
});

Deno.test('rejects archives and executables instead of uploading unreadable data', () => {
  assertEquals(normalizeSupportedDocument('class-material.zip', 'application/zip'), null);
  assertEquals(normalizeSupportedDocument('installer.exe', 'application/octet-stream'), null);
});

Deno.test('identifies unreadable attachments by filename in both supported locales', () => {
  assertEquals(
    documentExtractionFailedMessage(['Week 4 notes.docx'], 'en'),
    'Semora couldn\'t read “Week 4 notes.docx”. Try again. If it still fails, remove the file and upload it again, or export it as a PDF first.',
  );
  assertEquals(
    documentExtractionFailedMessage(['Tema 1.pages'], 'es'),
    'Semora no pudo leer “Tema 1.pages”. Inténtalo de nuevo. Si vuelve a fallar, elimina el archivo y súbelo otra vez, o expórtalo primero como PDF.',
  );
});

Deno.test('deduplicates and bounds the unreadable-file list', () => {
  assertEquals(
    documentExtractionFailedMessage(['a.docx', 'a.docx', 'b.pptx', 'c.pdf', 'd.pages'], 'en'),
    'Semora couldn\'t read these files: “a.docx”, “b.pptx”, “c.pdf” and 1 more. Try again. If it still fails, remove and upload them again, or export them as PDFs first.',
  );
});

Deno.test('gives flashcards an actionable deselect recovery', () => {
  assertEquals(
    documentExtractionFailedMessage(['broken.key'], 'en', 'deselect'),
    'Semora couldn\'t read “broken.key”. Deselect this file and try again, or upload a PDF version first.',
  );
  assertEquals(
    documentExtractionFailedMessage(['roto.key'], 'es', 'deselect'),
    'Semora no pudo leer “roto.key”. Desmarca este archivo e inténtalo de nuevo, o sube primero una versión en PDF.',
  );
});
