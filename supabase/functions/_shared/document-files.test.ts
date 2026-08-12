import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { normalizeSupportedDocument } from './document-files.ts';

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
