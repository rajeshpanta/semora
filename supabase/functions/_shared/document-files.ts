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
  { extensions: ['gif'], mimeType: 'image/gif', image: true },
  // Accepted, then decoded to JPEG server-side (see _shared/heic.ts). No
  // model in this stack reads HEIC, but it is what every iPhone shoots, so
  // refusing it means refusing the default camera output.
  { extensions: ['heic', 'heif'], mimeType: 'image/heic', aliases: ['image/heif'], image: true },
  { extensions: ['doc'], mimeType: 'application/msword' },
  { extensions: ['docx'], mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  { extensions: ['rtf'], mimeType: 'application/rtf', aliases: ['text/rtf'] },
  { extensions: ['odt'], mimeType: 'application/vnd.oasis.opendocument.text' },
  { extensions: ['pages'], mimeType: 'application/vnd.apple.pages', aliases: ['application/x-iwork-pages-sffpages'] },
  { extensions: ['ppt'], mimeType: 'application/vnd.ms-powerpoint' },
  { extensions: ['pptx'], mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  { extensions: ['key'], mimeType: 'application/vnd.apple.keynote', aliases: ['application/x-iwork-keynote-sffkey'] },
  { extensions: ['numbers'], mimeType: 'application/vnd.apple.numbers', aliases: ['application/x-iwork-numbers-sffnumbers'] },
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

export const DOCUMENT_EXTRACTION_FAILED_CODE = 'DOCUMENT_EXTRACTION_FAILED';

/**
 * User-facing error for a course material file that was accepted and stored,
 * but could not be turned into readable text when Tutor/Flashcards first used
 * it. Keep the filename in the message so the student knows exactly which
 * attachment to retry or remove instead of silently receiving an ungrounded
 * answer.
 */
export function documentExtractionFailedMessage(
  fileNames: readonly string[],
  locale: 'en' | 'es' = 'en',
  recovery: 'remove' | 'deselect' = 'remove',
): string {
  const normalized = [...new Set(fileNames.map((name) =>
    String(name || 'document').replace(/\s+/g, ' ').trim().slice(0, 120) || 'document'
  ))];
  const shown = normalized.slice(0, 3).map((name) => `“${name}”`).join(', ');
  const remaining = Math.max(0, normalized.length - 3);
  const displayNames = `${shown}${remaining > 0
    ? locale === 'es' ? ` y ${remaining} más` : ` and ${remaining} more`
    : ''}`;

  if (locale === 'es') {
    if (recovery === 'deselect') {
      return normalized.length === 1
        ? `Semora no pudo leer ${displayNames}. Desmarca este archivo e inténtalo de nuevo, o sube primero una versión en PDF.`
        : `Semora no pudo leer estos archivos: ${displayNames}. Desmárcalos e inténtalo de nuevo, o sube primero versiones en PDF.`;
    }
    return normalized.length === 1
      ? `Semora no pudo leer ${displayNames}. Inténtalo de nuevo. Si vuelve a fallar, elimina el archivo y súbelo otra vez, o expórtalo primero como PDF.`
      : `Semora no pudo leer estos archivos: ${displayNames}. Inténtalo de nuevo. Si vuelve a fallar, elimínalos y súbelos otra vez, o expórtalos primero como PDF.`;
  }

  if (recovery === 'deselect') {
    return normalized.length === 1
      ? `Semora couldn't read ${displayNames}. Deselect this file and try again, or upload a PDF version first.`
      : `Semora couldn't read these files: ${displayNames}. Deselect them and try again, or upload PDF versions first.`;
  }

  return normalized.length === 1
    ? `Semora couldn't read ${displayNames}. Try again. If it still fails, remove the file and upload it again, or export it as a PDF first.`
    : `Semora couldn't read these files: ${displayNames}. Try again. If it still fails, remove and upload them again, or export them as PDFs first.`;
}

// ── What the bytes actually are ─────────────────────────────────────────────
//
// The client's declared mimeType was believed on trust, and that is how HEIC
// reached the model. On iOS, `expo-image-picker` reports `mimeType` as
// optional ("null if could not be determined"), and both photo paths in
// scan.tsx fell back to `asset.mimeType || 'image/jpeg'`. A HEIC from the
// photo library with no reported type therefore arrived labelled image/jpeg,
// satisfied every check here, and was handed to OpenAI as
// `data:image/jpeg;base64,<HEIC bytes>` — which it rejects in under two
// seconds with an HTTP 400 the student cannot act on.
//
// So the format is decided by the file's own header, not by what the caller
// claims. This lives server-side deliberately: it fixes the shipped 1.4/1.6
// builds today, without waiting on an App Store release.

export type SniffedFormat =
  | { kind: 'image'; mimeType: string }
  | { kind: 'pdf'; mimeType: string }
  | { kind: 'heic' }
  | { kind: 'unknown' };

/** Decode just enough leading bytes to read a file signature. */
function leadingBytes(base64: string, count = 32): Uint8Array {
  // 4 base64 chars → 3 bytes; take a whole number of quartets so atob never
  // sees a partial group.
  const quartets = Math.ceil(count / 3);
  const slice = base64.slice(0, quartets * 4);
  try {
    const binary = atob(slice);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array(0);
  }
}

const ascii = (b: Uint8Array, start: number, len: number): string =>
  String.fromCharCode(...b.slice(start, start + len));

/**
 * Identify a file from its magic number. Covers every format the scan pipeline
 * can legitimately receive plus HEIC/HEIF, which is called out separately so
 * the caller can say something useful instead of forwarding it to a model that
 * will refuse it.
 */
export function sniffFormat(base64: string): SniffedFormat {
  const b = leadingBytes(base64);
  if (b.length < 12) return { kind: 'unknown' };

  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: 'image', mimeType: 'image/jpeg' };
  // PNG: 89 "PNG" CR LF 1A LF
  if (b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return { kind: 'image', mimeType: 'image/png' };
  // GIF: "GIF8"
  if (ascii(b, 0, 4) === 'GIF8') return { kind: 'image', mimeType: 'image/gif' };
  // WEBP: "RIFF" .... "WEBP"
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return { kind: 'image', mimeType: 'image/webp' };
  // PDF: "%PDF"
  if (ascii(b, 0, 4) === '%PDF') return { kind: 'pdf', mimeType: 'application/pdf' };

  // ISO-BMFF container: bytes 4..8 are "ftyp", brand follows. HEIC, HEIF and
  // the burst/sequence variants all live here. This is what an iPhone shoots.
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4).toLowerCase();
    if (['heic', 'heix', 'heim', 'heis', 'hevc', 'hevm', 'hevs', 'mif1', 'msf1'].includes(brand)) {
      return { kind: 'heic' };
    }
  }
  return { kind: 'unknown' };
}

/** Shown when a student sends a photo the model cannot decode. */
export const HEIC_SERVER_HELP =
  "That photo is in Apple's HEIC format, which the scanner can't read. Update Semora, " +
  'or on your iPhone open Settings → Camera → Formats and choose "Most Compatible", then retake it.';
