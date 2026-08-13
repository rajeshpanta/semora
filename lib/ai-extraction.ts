import { readFileAsBase64 } from '@/lib/readFileBase64';
import { parseUploadJson, requestWithUploadProgress } from '@/lib/httpUpload';
import { supabase } from '@/lib/supabase';
import type { GradeThreshold, CourseMeetingKind } from '@/types/database';
import { getAppLocale } from '@/lib/i18n';

export interface ExtractedItem {
  title: string;
  type: 'assignment' | 'quiz' | 'exam' | 'project' | 'reading' | 'other';
  // null = the syllabus lists the item without a parseable date ("Final Exam
  // — date TBA"). The server used to drop these silently; now they come
  // through so the review screen can ask the user for a date. tasks.due_date
  // is NOT NULL in the DB, so a null here must be resolved (or the item
  // deselected) before saving.
  due_date: string | null;
  due_time: string | null;
  weight: number | null;
  description: string | null;
  confidence: number;
  // Server-side plausibility flag: the date parses but falls outside the
  // expected window for this term (usually a professor re-using last year's
  // PDF). Optional — older Edge Function deployments omit it.
  date_suspect?: boolean;
}

// Structured schedule extraction. Times come back already padded to
// "HH:MM:00" by the Edge Function so they slot straight into Postgres
// `time` columns.
export interface ExtractedMeeting {
  days_of_week: number[];
  start_time: string | null;
  end_time: string | null;
  kind: CourseMeetingKind;
  location: string | null;
}

export interface ExtractedOfficeHours {
  days_of_week: number[] | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
}

export interface SyllabusExtraction {
  course_name: string;
  course_code: string | null;
  instructor: string | null;
  meetings: ExtractedMeeting[];
  office_hours_blocks: ExtractedOfficeHours[];
  semester_name: string | null;
  semester_start: string | null;
  semester_end: string | null;
  grade_scale: GradeThreshold[] | null;
  items: ExtractedItem[];
  // Which AI model served the request. The property name is retained for
  // compatibility with the existing parse_runs.gemini_model column.
  gemini_model?: string | null;
}

// One page of a multi-page photo scan (a local file URI, not yet base64).
export interface SyllabusPage {
  uri: string;
  mimeType: string;
}

export type DocumentExtractionProgress = {
  stage: 'preparing' | 'uploading' | 'reading';
  percent?: number;
};

// Client-side cap on photo pages per scan. Mirrors MAX_PAGES in the
// parse-syllabus Edge Function — keep the two in sync.
export const MAX_SCAN_PAGES = 5;

// Mirrors the totalBase64Chars ceiling in the parse-syllabus Edge Function
// (it 413s above this) — keep the two in sync.
const SERVER_BASE64_CHAR_CAP = 15_000_000;

// Raw-byte budget for a multi-page photo scan, enforced at ADD time in
// scan.tsx so users find out one page too early instead of after capturing
// everything. Derivation: the server rejects payloads whose combined base64
// exceeds 15M chars, and base64 inflates raw bytes by 4/3 (raw * 4/3 must
// stay < 15M chars), so the hard ceiling is 15M * 3/4 ≈ 11.25MB raw.
// 10MB raw ≈ 14M base64 chars, leaving ~1M chars of headroom for base64
// padding and JSON framing under the server's separate 16MB body cap.
export const MAX_SCAN_RAW_BYTES = 10 * 1024 * 1024;

// Copy for the payload-size gate, shared between the add-time budget check
// in scan.tsx and the pre-flight in extractFromPages so the user sees one
// consistent message wherever the limit bites. `fittedPages` = how many
// pages DO fit (the ones the scan proceeds with).
export function scanTooLargeMessage(fittedPages: number): string {
  return `These photos are too large to send together — ${fittedPages} page${fittedPages === 1 ? '' : 's'} max at this resolution. Tip: PDFs handle long syllabi best.`;
}

export async function extractFromFile(
  fileUri: string,
  mimeType: string,
  signal?: AbortSignal,
  fileName?: string,
  onProgress?: (progress: DocumentExtractionProgress) => void,
): Promise<SyllabusExtraction> {
  return extractFromPages([{ uri: fileUri, mimeType }], signal, fileName, onProgress);
}

export async function extractFromPages(
  pages: SyllabusPage[],
  signal?: AbortSignal,
  fileName?: string,
  onProgress?: (progress: DocumentExtractionProgress) => void,
): Promise<SyllabusExtraction> {
  if (pages.length === 0) {
    throw new Error('No pages to scan');
  }
  onProgress?.({ stage: 'preparing' });
  const encoded = await Promise.all(
    pages.map(async (p) => ({
      base64: await readFileAsBase64(p.uri),
      mimeType: p.mimeType,
    })),
  );

  // Defensive pre-flight mirroring the server's totalBase64Chars cap: fail
  // fast with the friendly message instead of uploading ~15MB just to get a
  // 413 back. The add-time budget in scan.tsx should make this unreachable
  // for camera/library flows, but Files-app picks and any future callers
  // still funnel through here.
  const totalBase64Chars = encoded.reduce((sum, p) => sum + p.base64.length, 0);
  if (totalBase64Chars > SERVER_BASE64_CHAR_CAP) {
    if (encoded.length > 1) {
      // Count how many leading pages would fit so the message carries a
      // concrete number (at least 1 — a lone page is always attemptable).
      let running = 0;
      let fits = 0;
      for (const p of encoded) {
        if (running + p.base64.length > SERVER_BASE64_CHAR_CAP) break;
        running += p.base64.length;
        fits += 1;
      }
      throw new Error(scanTooLargeMessage(Math.max(fits, 1)));
    }
    // Single file (typically a PDF) — match the server's own wording.
    throw new Error('File too large. Maximum size is approximately 11 MB.');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured');
  }

  // Transport: single page keeps the legacy { base64, mimeType } shape (so
  // this build also works against a not-yet-redeployed Edge Function);
  // multi-page sends { pages: [...] }, which requires the updated function.
  //
  // apiVersion: 2 marks this client as understanding due_date: null items
  // (see ExtractedItem.due_date). The server withholds undated items from
  // legacy clients that would break on them — legacy builds send no
  // apiVersion at all — so BOTH shapes must carry the marker. Older Edge
  // Function deployments simply ignore the extra field.
  // locale: scan errors are the most likely wall a user hits, and they were
  // English-only while the rest of the app ships Spanish. Older Edge Function
  // deployments ignore the extra field.
  const locale = getAppLocale();
  const body = encoded.length === 1
    ? JSON.stringify({
      base64: encoded[0].base64,
      mimeType: encoded[0].mimeType,
      fileName,
      apiVersion: 2,
      locale,
    })
    : JSON.stringify({ pages: encoded, apiVersion: 2, locale });

  const response = await requestWithUploadProgress({
    url: `${supabaseUrl}/functions/v1/parse-syllabus`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body,
    signal,
    onProgress: (percent) => onProgress?.({ stage: 'uploading', percent }),
    onUploadComplete: () => onProgress?.({ stage: 'reading' }),
  });

  if (!response.ok) {
    const error = parseUploadJson<{ error?: string }>(response);
    throw new Error(error?.error || `Server error: ${response.status}`);
  }

  // Defensive normalization: an older Edge Function deployment won't
  // include the structured arrays. Default them to [] so consumers can
  // rely on non-optional types without nil-safety boilerplate.
  const raw = parseUploadJson<Partial<SyllabusExtraction>>(response);
  if (!raw) throw new Error('The scan returned an unreadable response. Please try again.');
  return {
    ...raw,
    meetings: raw.meetings ?? [],
    office_hours_blocks: raw.office_hours_blocks ?? [],
  } as SyllabusExtraction;
}

// Web-only path: a desktop user pasting syllabus text copied from a PDF or
// LMS page, skipping the image/OCR step entirely. Mirrors extractFromPages'
// auth/transport/error handling exactly; see the {text} branch in the
// parse-syllabus Edge Function.
export async function extractFromText(
  text: string,
  signal?: AbortSignal,
  onProgress?: (progress: DocumentExtractionProgress) => void,
): Promise<SyllabusExtraction> {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Paste your syllabus text first.');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured');
  }

  onProgress?.({ stage: 'preparing' });
  const response = await requestWithUploadProgress({
    url: `${supabaseUrl}/functions/v1/parse-syllabus`,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ text: trimmed, apiVersion: 2, locale: getAppLocale() }),
    signal,
    onProgress: (percent) => onProgress?.({ stage: 'uploading', percent }),
    onUploadComplete: () => onProgress?.({ stage: 'reading' }),
  });

  if (!response.ok) {
    const error = parseUploadJson<{ error?: string }>(response);
    throw new Error(error?.error || `Server error: ${response.status}`);
  }

  const raw = parseUploadJson<Partial<SyllabusExtraction>>(response);
  if (!raw) throw new Error('The scan returned an unreadable response. Please try again.');
  return {
    ...raw,
    meetings: raw.meetings ?? [],
    office_hours_blocks: raw.office_hours_blocks ?? [],
  } as SyllabusExtraction;
}
