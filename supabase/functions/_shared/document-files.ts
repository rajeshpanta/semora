/**
 * Server-side mirror of lib/documentFiles.ts. Keep the common academic
 * extension/MIME pairs aligned so a file accepted by a Semora picker is also
 * accepted by syllabus, flashcard, and tutor extraction.
 */

type DocumentSpec = {
  extensions: readonly string[];
  mimeType: string;
  aliases?: readonly string[];
  image?: boolean;
};

const DOCUMENT_SPECS: readonly DocumentSpec[] = [
  { extensions: ['pdf'], mimeType: 'application/pdf', aliases: ['application/x-pdf'] },
  { extensions: ['jpg', 'jpeg'], mimeType: 'image/jpeg', aliases: ['image/jpg'], image: true },
  { extensions: ['png'], mimeType: 'image/png', image: true },
  { extensions: ['webp'], mimeType: 'image/webp', image: true },
  { extensions: ['doc'], mimeType: 'application/msword' },
  { extensions: ['docx'], mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { extensions: ['rtf'], mimeType: 'application/rtf', aliases: ['text/rtf'] },
  { extensions: ['odt'], mimeType: 'application/vnd.oasis.opendocument.text' },
  { extensions: ['pages'], mimeType: 'application/vnd.apple.pages', aliases: ['application/x-iwork-pages-sffpages'] },
  { extensions: ['ppt'], mimeType: 'application/vnd.ms-powerpoint' },
  { extensions: ['pptx'], mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { extensions: ['key'], mimeType: 'application/vnd.apple.keynote', aliases: ['application/x-iwork-keynote-sffkey'] },
  { extensions: ['xls'], mimeType: 'application/vnd.ms-excel' },
  { extensions: ['xlsx'], mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  { extensions: ['csv'], mimeType: 'text/csv', aliases: ['application/csv'] },
  { extensions: ['tsv'], mimeType: 'text/tsv' },
  { extensions: ['txt', 'text'], mimeType: 'text/plain' },
  { extensions: ['md', 'markdown'], mimeType: 'text/markdown' },
  { extensions: ['html', 'htm'], mimeType: 'text/html' },
  { extensions: ['json'], mimeType: 'application/json' },
  { extensions: ['xml'], mimeType: 'text/xml', aliases: ['application/xml'] },
  { extensions: ['ics'], mimeType: 'text/calendar' },
  { extensions: ['srt'], mimeType: 'text/srt', aliases: ['application/x-subrip', 'text/x-subrip'] },
  { extensions: ['vtt'], mimeType: 'text/vtt' },
  { extensions: ['tex'], mimeType: 'text/x-tex' },
  { extensions: ['js', 'mjs'], mimeType: 'text/javascript', aliases: ['application/javascript'] },
  { extensions: ['ts'], mimeType: 'text/x-typescript', aliases: ['application/typescript'] },
  { extensions: ['jsx'], mimeType: 'text/jsx' },
  { extensions: ['tsx'], mimeType: 'text/tsx' },
  { extensions: ['py'], mimeType: 'text/x-python', aliases: ['text/x-script.python'] },
  { extensions: ['java'], mimeType: 'text/x-java' },
  { extensions: ['c', 'h'], mimeType: 'text/x-c' },
  { extensions: ['cc', 'cpp', 'cxx'], mimeType: 'text/x-c++' },
  { extensions: ['cs'], mimeType: 'text/x-csharp' },
  { extensions: ['go'], mimeType: 'text/x-go' },
  { extensions: ['rs'], mimeType: 'text/x-rust' },
  { extensions: ['swift'], mimeType: 'text/x-swift' },
  { extensions: ['kt', 'kts'], mimeType: 'text/x-kotlin' },
  { extensions: ['sql'], mimeType: 'text/x-sql', aliases: ['application/x-sql'] },
  { extensions: ['r'], mimeType: 'text/x-r' },
] as const;

const SPEC_BY_EXTENSION = new Map<string, DocumentSpec>();
const SPEC_BY_MIME = new Map<string, DocumentSpec>();
for (const spec of DOCUMENT_SPECS) {
  for (const extension of spec.extensions) SPEC_BY_EXTENSION.set(extension, spec);
  SPEC_BY_MIME.set(spec.mimeType, spec);
  for (const alias of spec.aliases ?? []) SPEC_BY_MIME.set(alias, spec);
}

export type NormalizedDocument = {
  fileName: string;
  mimeType: string;
  isImage: boolean;
  isPdf: boolean;
};

function baseName(fileName: string): string {
  return fileName.trim().split(/[\\/]/).pop()?.trim() || 'document';
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

export function normalizeSupportedDocument(
  rawFileName?: string | null,
  rawMimeType?: string | null,
): NormalizedDocument | null {
  const originalName = baseName(rawFileName || 'document');
  const extension = extensionOf(originalName);
  const mimeType = rawMimeType?.trim().toLowerCase() || '';
  const spec = SPEC_BY_EXTENSION.get(extension) ?? SPEC_BY_MIME.get(mimeType);
  if (!spec) return null;

  const fileName = extension && SPEC_BY_EXTENSION.has(extension)
    ? originalName
    : `${originalName}.${spec.extensions[0]}`;
  return {
    fileName,
    mimeType: spec.mimeType,
    isImage: !!spec.image,
    isPdf: spec.mimeType === 'application/pdf',
  };
}

export const SUPPORTED_DOCUMENT_ERROR =
  'Unsupported file type. Use PDF, Word, PowerPoint, Excel/CSV, Pages, Keynote, text, or JPG/PNG/WEBP.';
