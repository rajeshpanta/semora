import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabase } from '@/lib/supabase';
import type { GradeThreshold, CourseMeetingKind } from '@/types/database';

export interface ExtractedItem {
  title: string;
  type: 'assignment' | 'quiz' | 'exam' | 'project' | 'reading' | 'other';
  due_date: string;
  due_time: string | null;
  weight: number | null;
  description: string | null;
  confidence: number;
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
}

export async function extractFromFile(
  fileUri: string,
  mimeType: string,
  signal?: AbortSignal,
): Promise<SyllabusExtraction> {
  // Compress + normalize image inputs before upload. Camera/library photos
  // come through ImagePicker already (JPEG @0.8), but a high-res original from
  // the Files/iCloud picker — including HEIC/HEIF — can exceed the edge fn's
  // size cap or be a format Gemini rejects. Resizing to ~2000px @ JPEG 0.7
  // keeps it well under the cap, normalizes HEIC/HEIF/PNG/WebP -> JPEG (always
  // accepted by Gemini), and keeps the text legible. PDFs can't be transcoded
  // client-side, so they're read and sent as-is.
  let uploadUri = fileUri;
  let uploadMime = mimeType;
  if (mimeType.startsWith('image/')) {
    try {
      const out = await manipulateAsync(
        fileUri,
        [{ resize: { width: 2000 } }],
        { compress: 0.7, format: SaveFormat.JPEG },
      );
      uploadUri = out.uri;
      uploadMime = 'image/jpeg';
    } catch {
      // Manipulation failed — fall back to the original file/mime so the scan
      // still attempts rather than hard-failing before it even uploads.
    }
  }

  const base64 = await FileSystem.readAsStringAsync(uploadUri, {
    encoding: 'base64',
  });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/parse-syllabus`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ base64, mimeType: uploadMime }),
    signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Server error: ${response.status}`);
  }

  // Defensive normalization: an older Edge Function deployment won't
  // include the structured arrays. Default them to [] so consumers can
  // rely on non-optional types without nil-safety boilerplate.
  const raw = (await response.json()) as Partial<SyllabusExtraction>;
  return {
    ...raw,
    meetings: raw.meetings ?? [],
    office_hours_blocks: raw.office_hours_blocks ?? [],
  } as SyllabusExtraction;
}
