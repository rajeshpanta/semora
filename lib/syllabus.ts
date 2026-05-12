import { supabase } from '@/lib/supabase';
import { extractFromFile, type SyllabusExtraction, type ExtractedItem } from '@/lib/gemini';
import * as FileSystem from 'expo-file-system/legacy';
import { COURSE_COLORS, COURSE_ICONS, DEFAULT_GRADE_SCALE } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';
import { suggestCurrentSemesterName } from '@/lib/semesters';

export const FREE_COURSE_LIMIT = 2;
export const FREE_SEMESTER_LIMIT = 1;

// Detect a free-tier limit error raised by one of the DB triggers
// (enforce_free_{semester,course,scan}_limit — all raise errcode
// P0001). Used by every call site that inserts into a free-tier-gated
// table so the client surfaces an Upgrade prompt instead of a generic
// error when the client-cached isPro state is stale.
export function isFreeLimitError(err: any): boolean {
  return err?.code === 'P0001' || /free accounts support|2 free scans/i.test(err?.message ?? '');
}

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

  // 3c. Insert structured meeting + office hours rows from Gemini,
  // *only for newly created courses*. Re-uploading a syllabus for an
  // existing course should never clobber user edits — if a row is
  // wrong they fix it via the course detail editor. Errors here are
  // logged but don't fail the whole upload; the course + tasks already
  // saved are more valuable than the schedule rows.
  if (!isExisting) {
    if (extraction.meetings.length > 0) {
      const { error: meetingErr } = await supabase
        .from('course_meetings')
        .insert(
          extraction.meetings.map((m) => ({
            user_id: userId,
            course_id: courseId,
            days_of_week: m.days_of_week,
            start_time: m.start_time,
            end_time: m.end_time,
            kind: m.kind,
            location: m.location,
          })),
        );
      if (meetingErr) {
        console.warn('[processSyllabus] course_meetings insert failed:', meetingErr.message);
      }
    }
    if (extraction.office_hours_blocks.length > 0) {
      const { error: ohErr } = await supabase
        .from('course_office_hours')
        .insert(
          extraction.office_hours_blocks.map((o) => ({
            user_id: userId,
            course_id: courseId,
            days_of_week: o.days_of_week,
            start_time: o.start_time,
            end_time: o.end_time,
            location: o.location,
          })),
        );
      if (ohErr) {
        console.warn('[processSyllabus] course_office_hours insert failed:', ohErr.message);
      }
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
      gemini_model: 'gemini-2.5-flash',
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
  const name = semesterName || suggestCurrentSemesterName();

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

  // Preserve original error so callers can detect P0001 (free-tier
  // semester trigger) and surface a clean Upgrade prompt instead of
  // the "Failed to create semester: …" wrapper.
  if (error) throw error;
  return { semesterId: created.id, semesterName: created.name };
}

async function findOrCreateCourse(
  userId: string,
  semesterId: string,
  courseName: string,
  courseCode: string | null,
  instructor: string | null,
): Promise<{ courseId: string; courseName: string; isExisting: boolean }> {
  const name = courseCode
    ? `${courseCode} - ${courseName.replace(courseCode, '').replace(/^[\s\-–—]+/, '').trim() || courseName}`
    : courseName;

  // Find an existing course in this semester that represents the same
  // class. The previous version used `ilike '%term%'`, which falsely
  // matched "CS 10" against an existing "CS 101" and dropped every
  // freshly-extracted task on the floor under the "Course Already
  // Exists" dialog. Match the code as a prefix and then verify the
  // next character is a non-alphanumeric boundary so we don't conflate
  // adjacent course numbers.
  const trimmedCode = courseCode?.trim();
  const trimmedCourseName = courseName.trim();
  const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&');

  let existing: { id: string; name: string } | null = null;
  if (trimmedCode) {
    const { data } = await supabase
      .from('courses')
      .select('id, name')
      .eq('user_id', userId)
      .eq('semester_id', semesterId)
      .ilike('name', `${escapeLike(trimmedCode)}%`);
    const codeLower = trimmedCode.toLowerCase();
    existing = (data ?? []).find((c) => {
      const lower = c.name.toLowerCase();
      if (!lower.startsWith(codeLower)) return false;
      const nextChar = lower.charAt(codeLower.length);
      // Match only at a word boundary: end-of-string or a separator
      // (space, dash, colon). Rejects "CS 101" when searching "CS 10".
      return nextChar === '' || !/[a-z0-9]/i.test(nextChar);
    }) ?? null;
  } else {
    // No course code — fall back to case-insensitive exact-name match.
    const { data } = await supabase
      .from('courses')
      .select('id, name')
      .eq('user_id', userId)
      .eq('semester_id', semesterId)
      .ilike('name', escapeLike(trimmedCourseName))
      .limit(1);
    existing = data?.[0] ?? null;
  }

  if (existing) {
    return { courseId: existing.id, courseName: existing.name, isExisting: true };
  }

  // Check course limit for free users before creating
  const isPro = useAppStore.getState().isPro;
  if (!isPro) {
    const { count } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('semester_id', semesterId);
    if ((count ?? 0) >= FREE_COURSE_LIMIT) {
      throw new Error(`Free accounts support up to ${FREE_COURSE_LIMIT} courses per semester. Upgrade to Pro for unlimited courses.`);
    }
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
      color,
      icon,
    })
    .select()
    .single();

  // Preserve the original PostgrestError so callers can detect P0001
  // (free-tier trigger). Wrapping it in a new Error stripped `.code` and
  // forced every caller to regex the message.
  if (error) throw error;
  return { courseId: created.id, courseName: created.name, isExisting: false };
}

function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
