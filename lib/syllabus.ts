import { supabase } from '@/lib/supabase';
import {
  extractFromPages,
  extractFromText,
  type DocumentExtractionProgress,
  type SyllabusExtraction,
  type SyllabusPage,
} from '@/lib/ai-extraction';
import { getFileSize, readFileAsBase64 } from '@/lib/readFileBase64';
import { isMeetingSyncEnabled, syncMeetingToCalendar } from '@/lib/calendarSync';
import type { CourseMeeting } from '@/types/database';
import { COURSE_COLORS, COURSE_ICONS, DEFAULT_GRADE_SCALE } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';
import { suggestCurrentSemesterName } from '@/lib/semesters';
import { freeActionUsedQueryOptions } from '@/lib/queries';

export const FREE_COURSE_LIMIT = 4;
export const FREE_SEMESTER_LIMIT = 1;

// Detect a free-tier limit error raised by one of the DB triggers
// (enforce_free_{semester,course,scan}_limit — all raise errcode
// P0001). Used by every call site that inserts into a free-tier-gated
// table so the client surfaces an Upgrade prompt instead of a generic
// error when the client-cached isPro state is stale.
export function isFreeLimitError(err: any): boolean {
  // `free scan` (singular) matches the one-free-action wording; the older
  // `\d+ free scans` pattern stays because the DB trigger, the edge function
  // and shipped builds can each still be a deploy behind one another, and a
  // missed match here means the paywall never opens — the user just sees a
  // raw error and no way to upgrade.
  return err?.code === 'P0001'
    || /free accounts support|\d+ free scans|free scan\b|free action/i.test(err?.message ?? '');
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

export type SyllabusProcessProgress = DocumentExtractionProgress | {
  stage: 'organizing' | 'ready';
};

export async function processSyllabus(
  fileUri: string,
  fileName: string,
  mimeType: string,
  userId: string,
  signal?: AbortSignal,
  // Multi-page photo scans: every captured page, in order. When omitted (or
  // a single entry), the legacy single-file path is used — fileUri/mimeType
  // must always describe the FIRST page so storage upload and the upload row
  // keep working unchanged. One submission = one scan regardless of pages.
  pages?: SyllabusPage[],
  // Web-only: pasted syllabus text instead of a file/photo. When set, this
  // replaces the extraction source (Luna gets the raw text, no OCR step)
  // AND the storage step (the pasted text itself is stored as a .txt file
  // in place of the uploaded file, so every syllabus_uploads row still
  // points at something real). fileUri/fileName/mimeType are still required
  // by the type but their file-reading uses are skipped in this branch —
  // callers pass a fileName describing the pasted text (e.g. an
  // auto-generated 'Pasted syllabus text.txt').
  pastedText?: string,
  onProgress?: (progress: SyllabusProcessProgress) => void,
): Promise<ProcessResult> {
  const startTime = Date.now();

  // 0. Check the free allowance BEFORE any writes. The DB trigger on
  //    syllabus_uploads fires at step 4 — by then the semester, course,
  //    meetings, and grade scale have already been created, leaving
  //    orphan rows when the limit trips (and burning AI compute).
  //    Message wording must stay matchable by isFreeLimitError above, or the
  //    refusal surfaces as a raw error with no Upgrade prompt.
  if (!useAppStore.getState().isPro) {
    // One free AI action per account, shared with lecture recording. Asked of
    // the database (migration 071), not counted here — a client-side count of
    // syllabus_uploads was both wrong (the user can delete rows) and a fourth
    // copy of a rule that already disagreed with itself across layers.
    const { data: used, error } = await supabase.rpc('my_free_action_used');
    // A failed check does NOT block the scan: the DB trigger and the edge
    // function both gate this independently, so the cost of being wrong here
    // is a slightly later paywall, while the cost of failing closed is a
    // paying-eligible student locked out by an RPC blip.
    if (!error && used === true) {
      throw new Error("You've used your free scan. Upgrade to Pro for unlimited syllabus scanning and lecture recordings.");
    }
  }

  // 1. Extract with Luna (abortable — the caller's timeout aborts the fetch)
  const pageList: SyllabusPage[] = pages && pages.length > 0 ? pages : [{ uri: fileUri, mimeType }];
  // Read metadata before AI work or database writes. On web, picker files use
  // blob: URLs that expo-file-system cannot inspect; getFileSize uses fetch
  // there and retains native FileSystem behavior on iOS/Android.
  const fileSize = pastedText != null
    ? new TextEncoder().encode(pastedText).length
    : await getFileSize(fileUri);
  const extraction = pastedText != null
    ? await extractFromText(pastedText, signal, onProgress)
    : await extractFromPages(pageList, signal, fileName, onProgress);

  // Bail BEFORE any DB writes if the caller aborted (e.g. the 120s timeout):
  // otherwise we create an orphan semester/course/upload the user never sees
  // and burn a free scan. The fetch abort above covers a hung request; this
  // guards the gap between extraction returning and the first write.
  if (signal?.aborted) throw new Error('Scan cancelled — please try again.');
  onProgress?.({ stage: 'organizing' });

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

  // 3c. Insert structured meeting + office hours rows from Luna,
  // *only for newly created courses*. Re-uploading a syllabus for an
  // existing course should never clobber user edits — if a row is
  // wrong they fix it via the course detail editor. Errors here are
  // logged but don't fail the whole upload; the course + tasks already
  // saved are more valuable than the schedule rows.
  if (!isExisting) {
    if (extraction.meetings.length > 0) {
      const { data: insertedMeetings, error: meetingErr } = await supabase
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
        )
        .select();
      if (meetingErr) {
        console.warn('[processSyllabus] course_meetings insert failed:', meetingErr.message);
      } else if (isMeetingSyncEnabled()) {
        // Mirror the create-meeting mutation's side effect (lib/queries.ts):
        // when class-schedule sync is on, a scan that creates the schedule
        // must reach the device calendar too — otherwise the user has to
        // re-toggle sync before these meetings show up. Fire-and-forget;
        // calendar failures must never fail the scan.
        for (const m of insertedMeetings ?? []) {
          syncMeetingToCalendar(m as CourseMeeting).catch(() => {});
        }
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

    // The grade weighting table — "Problem sets 20%, Final 25%".
    //
    // Until this existed the scan read the syllabus's grading breakdown and
    // threw it away: 4 category rows existed across 46 courses in production,
    // so grade tracking — a headline feature — started empty for essentially
    // everyone. The student had to retype a table the app had just proved it
    // could read.
    //
    // Optional chaining, not a bare access: `grade_categories` is absent from
    // responses served by an Edge Function deployed before this change, and a
    // client that assumed it would break every scan against an older backend.
    const categories = extraction.grade_categories ?? [];
    if (categories.length > 0) {
      const { error: catErr } = await supabase
        .from('grade_categories')
        .insert(
          categories.map((c, index) => ({
            user_id: userId,
            course_id: courseId,
            name: c.name,
            weight_percent: c.weight_percent,
            drop_lowest_count: c.drop_lowest_count ?? 0,
            // Preserve the order the syllabus lists them in — that is the
            // order the student will be looking at on paper.
            position: index,
          })),
        );
      if (catErr) {
        console.warn('[processSyllabus] grade_categories insert failed:', catErr.message);
      }
    }
  }

  // 4. Create upload record. A pasted-text scan has no real file — its
  // "file" is the pasted text itself, stored as a .txt blob below, so every
  // syllabus_uploads row still points at something real.
  const storagePath = pastedText != null
    ? `${userId}/${Date.now()}_pasted-syllabus.txt`
    : `${userId}/${Date.now()}_${fileName}`;
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

  // 5. Upload file(s) to storage (non-critical). Pasted text is stored as a
  //    single .txt blob; otherwise this mirrors the original per-page logic.
  //    Page 1 keeps the exact storage_path recorded on the syllabus_uploads
  //    row (backward compatible with old rows and single-file uploads);
  //    pages 2..N of a multi-page photo scan land alongside it with a
  //    deterministic `_pN` suffix before the extension (e.g. `..._scan.jpg`
  //    → `..._scan_p2.jpg`) so the course screen can probe for them without
  //    a schema change. Each page fails independently — a dropped page never
  //    fails the scan.
  if (pastedText != null) {
    try {
      await supabase.storage.from('syllabi').upload(storagePath, new TextEncoder().encode(pastedText), {
        contentType: 'text/plain',
        upsert: true,
      });
    } catch (e) {
      console.warn('[processSyllabus] Storage upload failed for pasted text (non-critical):', e);
    }
  }
  const dot = storagePath.lastIndexOf('.');
  const hasExt = dot > storagePath.lastIndexOf('/');
  const pathStem = hasExt ? storagePath.slice(0, dot) : storagePath;
  const pathExt = hasExt ? storagePath.slice(dot) : '';
  for (let p = 0; pastedText == null && p < pageList.length; p++) {
    // pageList[0].uri === fileUri by the pages[] contract above, so the
    // single-page path uploads exactly what it always did.
    const pagePath = p === 0 ? storagePath : `${pathStem}_p${p + 1}${pathExt}`;
    try {
      const base64 = await readFileAsBase64(pageList[p].uri);
      await supabase.storage.from('syllabi').upload(pagePath, decode(base64), {
        contentType: pageList[p].mimeType,
        upsert: true,
      });
    } catch (e) {
      console.warn(`Storage upload failed for page ${p + 1} (non-critical):`, e);
    }
  }

  // 6. Create parse run
  const duration_ms = Date.now() - startTime;
  const { data: parseRun, error: parseError } = await supabase
    .from('parse_runs')
    .insert({
      user_id: userId,
      upload_id: upload.id,
      course_id: courseId,
      // Legacy database value retained for compatibility with the production
      // parse_runs schema; the extraction provider is now OpenAI Luna.
      method: 'rule_plus_gemini',
      // The server reports which model actually answered. Older Edge Function
      // deployments omit the field, so use the current Luna default rather
      // than writing null.
      gemini_model: extraction.gemini_model || 'gpt-5.6-luna',
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

  onProgress?.({ stage: 'ready' });
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
  // Priority: what the syllabus itself says > the term the user picked
  // during onboarding > a generic date-based suggestion. The onboarding
  // term only applies to the user's VERY FIRST semester — it persists on
  // the device forever, so without this guard a scan a year later (or by
  // a second account on the same device) would file tasks under a stale
  // "Summer 2026" instead of the current term.
  let onboardingTerm: string | null = null;
  if (!semesterName) {
    const { count } = await supabase
      .from('semesters')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if ((count ?? 0) === 0) {
      onboardingTerm = useAppStore.getState().defaultTerm;
    }
  }
  const name = semesterName || onboardingTerm || suggestCurrentSemesterName();

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

  // Free-tier gate BEFORE the insert. The DB trigger (enforce_free_semester_
  // limit) still exists as the source of truth, but relying on it alone means
  // a free user scanning into what turns out to be a genuinely new semester
  // only finds out AFTER Luna has already run — the extraction cost is
  // unavoidable (we need the extracted name to know this isn't an existing
  // semester), but everything downstream of this function (course, grade
  // scale, meetings, the syllabus_uploads row itself) is not. Stopping here
  // matches the free-scan-limit guard above: fail before any writes, not
  // after several rows are already committed.
  if (!useAppStore.getState().isPro) {
    const { count } = await supabase
      .from('semesters')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);
    if ((count ?? 0) >= FREE_SEMESTER_LIMIT) {
      throw new Error(
        `Free accounts support up to ${FREE_SEMESTER_LIMIT} semester. Upgrade to Pro for unlimited semesters, or re-scan into your existing one.`,
      );
    }
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
  // the "Failed to create semester: …" wrapper. The client-side check above
  // covers the common case; this stays as defense-in-depth (e.g. a race
  // between two scans on different devices).
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
      throw new Error(`Free accounts support up to ${FREE_COURSE_LIMIT} courses per semester (this is separate from your scans). Upgrade to Pro for unlimited courses, or re-scan a course you already have.`);
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
