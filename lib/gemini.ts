import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import type { GradeThreshold } from '@/types/database';

export interface ExtractedItem {
  title: string;
  type: 'assignment' | 'quiz' | 'exam' | 'project' | 'reading' | 'other';
  due_date: string;
  due_time: string | null;
  weight: number | null;
  description: string | null;
  confidence: number;
}

export interface SyllabusExtraction {
  course_name: string;
  course_code: string | null;
  instructor: string | null;
  meeting_time: string | null;
  office_hours: string | null;
  semester_name: string | null;
  semester_start: string | null;
  semester_end: string | null;
  grade_scale: GradeThreshold[] | null;
  items: ExtractedItem[];
}

export async function extractFromFile(
  fileUri: string,
  mimeType: string,
): Promise<SyllabusExtraction> {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
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
    body: JSON.stringify({ base64, mimeType }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Server error: ${response.status}`);
  }

  return await response.json() as SyllabusExtraction;
}
