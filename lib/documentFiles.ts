/**
 * File formats Semora can reliably turn into model-readable course material.
 *
 * Keep the matching server list in
 * supabase/functions/_shared/document-files.ts in sync. The picker is left
 * broad (all selectable files) because iCloud/Drive providers frequently report Office and
 * iWork files as application/octet-stream or application/zip; the extension
 * and MIME validation below is the actual gate.
 */

import { HEIC_HELP, isHeic } from '@/lib/heic';

export type SupportedDocumentCategory =
  | 'pdf'
  | 'image'
  | 'document'
  | 'presentation'
  | 'spreadsheet'
  | 'text';

type DocumentSpec = {
  extensions: readonly string[];
  mimeType: string;
  mimeAliases?: readonly string[];
  category: SupportedDocumentCategory;
};

const DOCUMENT_SPECS: readonly DocumentSpec[] = [
  { extensions: ['pdf'], mimeType: 'application/pdf', mimeAliases: ['application/x-pdf'], category: 'pdf' },
  { extensions: ['jpg', 'jpeg'], mimeType: 'image/jpeg', mimeAliases: ['image/jpg'], category: 'image' },
  { extensions: ['png'], mimeType: 'image/png', category: 'image' },
  { extensions: ['webp'], mimeType: 'image/webp', category: 'image' },
  { extensions: ['gif'], mimeType: 'image/gif', category: 'image' },
  // iPhone's default format. Uploaded as-is; the server decodes it.
  { extensions: ['heic', 'heif'], mimeType: 'image/heic', mimeAliases: ['image/heif'], category: 'image' },

  { extensions: ['doc'], mimeType: 'application/msword', category: 'document' },
  { extensions: ['docx'], mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', category: 'document' },
  { extensions: ['rtf'], mimeType: 'application/rtf', mimeAliases: ['text/rtf'], category: 'document' },
  { extensions: ['odt'], mimeType: 'application/vnd.oasis.opendocument.text', category: 'document' },
  {
    extensions: ['pages'],
    mimeType: 'application/vnd.apple.pages',
    mimeAliases: ['application/x-iwork-pages-sffpages'],
    category: 'document',
  },

  { extensions: ['ppt'], mimeType: 'application/vnd.ms-powerpoint', category: 'presentation' },
  { extensions: ['pptx'], mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', category: 'presentation' },
  {
    extensions: ['key'],
    mimeType: 'application/vnd.apple.keynote',
    mimeAliases: ['application/x-iwork-keynote-sffkey'],
    category: 'presentation',
  },

  { extensions: ['xls'], mimeType: 'application/vnd.ms-excel', category: 'spreadsheet' },
  { extensions: ['xlsx'], mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', category: 'spreadsheet' },
  { extensions: ['csv'], mimeType: 'text/csv', mimeAliases: ['application/csv'], category: 'spreadsheet' },
  { extensions: ['tsv'], mimeType: 'text/tsv', category: 'spreadsheet' },

  { extensions: ['txt', 'text'], mimeType: 'text/plain', category: 'text' },
  { extensions: ['md', 'markdown'], mimeType: 'text/markdown', category: 'text' },
  { extensions: ['html', 'htm'], mimeType: 'text/html', category: 'text' },
  { extensions: ['json'], mimeType: 'application/json', category: 'text' },
  { extensions: ['xml'], mimeType: 'text/xml', mimeAliases: ['application/xml'], category: 'text' },
  { extensions: ['ics'], mimeType: 'text/calendar', category: 'text' },
  { extensions: ['srt'], mimeType: 'text/srt', mimeAliases: ['application/x-subrip', 'text/x-subrip'], category: 'text' },
  { extensions: ['vtt'], mimeType: 'text/vtt', category: 'text' },
  { extensions: ['tex'], mimeType: 'text/x-tex', category: 'text' },
  { extensions: ['js', 'mjs'], mimeType: 'text/javascript', mimeAliases: ['application/javascript'], category: 'text' },
  { extensions: ['ts'], mimeType: 'text/x-typescript', mimeAliases: ['application/typescript'], category: 'text' },
  { extensions: ['jsx'], mimeType: 'text/jsx', category: 'text' },
  { extensions: ['tsx'], mimeType: 'text/tsx', category: 'text' },
  { extensions: ['py'], mimeType: 'text/x-python', mimeAliases: ['text/x-script.python'], category: 'text' },
  { extensions: ['java'], mimeType: 'text/x-java', category: 'text' },
  { extensions: ['c', 'h'], mimeType: 'text/x-c', category: 'text' },
  { extensions: ['cc', 'cpp', 'cxx'], mimeType: 'text/x-c++', category: 'text' },
  { extensions: ['cs'], mimeType: 'text/x-csharp', category: 'text' },
  { extensions: ['go'], mimeType: 'text/x-go', category: 'text' },
  { extensions: ['rs'], mimeType: 'text/x-rust', category: 'text' },
  { extensions: ['swift'], mimeType: 'text/x-swift', category: 'text' },
  { extensions: ['kt', 'kts'], mimeType: 'text/x-kotlin', category: 'text' },
  { extensions: ['sql'], mimeType: 'text/x-sql', mimeAliases: ['application/x-sql'], category: 'text' },
  { extensions: ['r'], mimeType: 'text/x-r', category: 'text' },
] as const;

const SPEC_BY_EXTENSION = new Map<string, DocumentSpec>();
const SPEC_BY_MIME = new Map<string, DocumentSpec>();
for (const spec of DOCUMENT_SPECS) {
  for (const extension of spec.extensions) SPEC_BY_EXTENSION.set(extension, spec);
  SPEC_BY_MIME.set(spec.mimeType, spec);
  for (const alias of spec.mimeAliases ?? []) SPEC_BY_MIME.set(alias, spec);
}

export const SUPPORTED_DOCUMENT_PICKER_TYPE = '*/*';
export const MAX_COURSE_NOTE_BYTES = 6 * 1024 * 1024;
export const SUPPORTED_DOCUMENT_COPY =
  'PDF, Word, PowerPoint, Excel, Pages, Keynote, text, or JPG/PNG/WEBP';

export type SupportedDocument = {
  fileName: string;
  mimeType: string;
  category: SupportedDocumentCategory;
};

function baseName(fileName: string): string {
  return fileName.trim().split(/[\\/]/).pop()?.trim() || 'document';
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

/**
 * Canonicalize a picked file using its extension first, then its MIME type.
 * Extension-first is intentional: cloud providers commonly label DOCX/PPTX,
 * Pages, and Keynote packages as generic octet-stream/zip files.
 */
export function normalizeSupportedDocument(
  rawFileName?: string | null,
  rawMimeType?: string | null,
): SupportedDocument | null {
  const originalName = baseName(rawFileName || 'document');
  const extension = extensionOf(originalName);
  const normalizedMime = rawMimeType?.trim().toLowerCase() || '';
  const spec = SPEC_BY_EXTENSION.get(extension) ?? SPEC_BY_MIME.get(normalizedMime);
  if (!spec) return null;

  const fileName = extension && SPEC_BY_EXTENSION.has(extension)
    ? originalName
    : `${originalName}.${spec.extensions[0]}`;
  return { fileName, mimeType: spec.mimeType, category: spec.category };
}

export function unsupportedDocumentMessage(fileName?: string | null): string {
  // Name the ACTUAL problem when we can. HEIC is the default iPhone format, so
  // "choose JPG/PNG/WEBP" is advice a student cannot follow without first being
  // told what is wrong — and it was the most likely rejection on the web app,
  // where the natural flow is to photograph a syllabus on a phone and open
  // Semora on a laptop. See lib/heic.ts.
  if (isHeic(fileName)) return HEIC_HELP;
  return `Choose ${SUPPORTED_DOCUMENT_COPY}. Convert files with important charts or diagrams to PDF for best results.`;
}

export function courseNoteTooLargeMessage(): string {
  return 'This file is larger than 6 MB. Please choose a smaller file or export/compress it as a PDF first.';
}
