import { supabase } from '@/lib/supabase';
import { extractFromFile, type SyllabusExtraction, type ExtractedItem } from '@/lib/gemini';
import * as FileSystem from 'expo-file-system/legacy';
import { COURSE_COLORS, COURSE_ICONS, DEFAULT_GRADE_SCALE } from '@/lib/constants';

export interface ProcessResult {
  uploadId: string;
  parseRunId: string;
  extraction: SyllabusExtraction;
  semesterId: string;
  semesterName: string;
  courseId: string;
  courseName: string;
  isExistingCourse: boolean;
  duration_ms: number;
}

export async function processSyllabus(
  fileUri: string,
  fileName: string,
  mimeType: string,
  userId: string,
): Promise<ProcessResult> {
  const startTime = Date.now();

  // 1. Extract with Gemini
  const extraction = await extractFromFile(fileUri, mimeType);

  // 2. Find or create semester
  const { semesterId, semesterName } = await findOrCreateSemester(
    userId,
    extraction.semester_name,
    extraction.semester_start,
    extraction.semester_end,
  );

  // 3. Find or check existing course
  const { courseId, courseName, isExisting } = await findOrCreateCourse(
    userId,
    semesterId,
    extraction.course_name,
    extraction.course_code,
    extraction.instructor,
    extraction.meeting_time,
    extraction.office_hours,
  );

  // 3b. Apply extracted grade scale if found (only for new courses or if existing has default)
  if (extraction.grade_scale && extraction.grade_scale.length > 0) {
    let shouldApply = !isExisting;

    if (isExisting) {
      const { data: existingCourse } = await supabase
        .from('courses')
        .select('grade_scale')
        .eq('id', courseId)
        .single();
      const scale = existingCourse?.grade_scale as { letter: string; min: number }[] | null;
      shouldApply = !scale || (
        scale.length === DEFAULT_GRADE_SCALE.length &&
        DEFAULT_GRADE_SCALE.every((d, i) => scale[i]?.letter === d.letter && scale[i]?.min === d.min)
      );
    }

    if (shouldApply) {
      await supabase
        .from('courses')
        .update({ grade_scale: extraction.grade_scale })
        .eq('id', courseId);
    }
  }

  // 4. Create upload record
  const storagePath = `${userId}/${Date.now()}_${fileName}`;
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  const fileSize = (fileInfo as any).size || 0;

  const { data: upload, error: uploadError } = await supabase
    .from('syllabus_uploads')
    .insert({
      user_id: userId,
      course_id: courseId,
      storage_path: storagePath,
      file_name: fileName,
      file_size_bytes: fileSize,
      status: 'completed',
    })
    .select()
    .single();

  if (uploadError) throw new Error(`Failed to create upload: ${uploadError.message}`);

  // 5. Upload file to storage (non-critical)
  try {
    const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
    await supabase.storage.from('syllabi').upload(storagePath, decode(base64), {
      contentType: mimeType,
      upsert: true,
    });
  } catch (e) {
    console.warn('Storage upload failed (non-critical):', e);
  }

  // 6. Create parse run
  const duration_ms = Date.now() - startTime;
  const { data: parseRun, error: parseError } = await supabase
    .from('parse_runs')
    .insert({
      user_id: userId,
      upload_id: upload.id,
      course_id: courseId,
      method: 'rule_plus_gemini',
      gemini_model: 'gemini-3-flash-preview',
      parse_confidence: extraction.items.length > 0
        ? extraction.items.reduce((sum, i) => sum + i.confidence, 0) / extraction.items.length
        : null,
      final_results: extraction.items,
      items_accepted: 0,
      items_rejected: 0,
      duration_ms,
    })
    .select()
    .single();

  if (parseError) throw new Error(`Failed to save parse run: ${parseError.message}`);

  return {
    uploadId: upload.id,
    parseRunId: parseRun.id,
    extraction,
    semesterId,
    semesterName,
    courseId,
    courseName,
    isExistingCourse: isExisting,
    duration_ms,
  };
}

async function findOrCreateSemester(
  userId: string,
  semesterName: string | null,
  startDate: string | null,
  endDate: string | null,
): Promise<{ semesterId: string; semesterName: string }> {
  const name = semesterName || guessCurrentSemester();

  // Check if semester with this name already exists
  const escapedName = name.replace(/[%_]/g, '\\$&');
  const { data: existing } = await supabase
    .from('semesters')
    .select('id, name')
    .eq('user_id', userId)
    .ilike('name', escapedName)
    .limit(1);

  if (existing && existing.length > 0) {
    return { semesterId: existing[0].id, semesterName: existing[0].name };
  }

  // Create new semester
  const { data: created, error } = await supabase
    .from('semesters')
    .insert({
      user_id: userId,
      name,
      start_date: startDate,
      end_date: endDate,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create semester: ${error.message}`);
  return { semesterId: created.id, semesterName: created.name };
}

async function findOrCreateCourse(
  userId: string,
  semesterId: string,
  courseName: string,
  courseCode: string | null,
  instructor: string | null,
  meetingTime: string | null,
  officeHours: string | null,
): Promise<{ courseId: string; courseName: string; isExisting: boolean }> {
  const name = courseCode
    ? `${courseCode} - ${courseName.replace(courseCode, '').replace(/^[\s\-–—]+/, '').trim() || courseName}`
    : courseName;

  // Check if a course with similar name exists in this semester
  const searchTerm = (courseCode || courseName).replace(/[%_]/g, '\\$&');
  const { data: existing } = await supabase
    .from('courses')
    .select('id, name')
    .eq('user_id', userId)
    .eq('semester_id', semesterId)
    .ilike('name', `%${searchTerm}%`)
    .limit(1);

  if (existing && existing.length > 0) {
    return { courseId: existing[0].id, courseName: existing[0].name, isExisting: true };
  }

  // Pick a random color and icon that aren't already used
  const { data: usedCourses } = await supabase
    .from('courses')
    .select('color, icon')
    .eq('semester_id', semesterId);

  const usedColors = new Set((usedCourses || []).map((c) => c.color));
  const usedIcons = new Set((usedCourses || []).map((c) => c.icon));
  const color = COURSE_COLORS.find((c) => !usedColors.has(c)) || COURSE_COLORS[0];
  const icon = COURSE_ICONS.find((i) => !usedIcons.has(i)) || COURSE_ICONS[0];

  const { data: created, error } = await supabase
    .from('courses')
    .insert({
      user_id: userId,
      semester_id: semesterId,
      name: name.length > 50 ? name.slice(0, 50) : name,
      instructor,
      meeting_time: meetingTime,
      office_hours: officeHours,
      color,
      icon,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create course: ${error.message}`);
  return { courseId: created.id, courseName: created.name, isExisting: false };
}

function guessCurrentSemester(): string {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  if (month >= 7) return `Fall ${year}`;
  if (month >= 4) return `Summer ${year}`;
  return `Spring ${year}`;
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
