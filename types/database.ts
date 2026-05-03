import type { TaskType, SourceType, CourseIcon } from '@/lib/constants';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  timezone: string | null;
  reminder_same_day: boolean;
  reminder_1day: boolean;
  reminder_3day: boolean;
  onboarded: boolean;
  created_at: string;
  updated_at: string;
}

export interface Semester {
  id: string;
  user_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GradeThreshold {
  letter: string;
  min: number;
}

export interface Course {
  id: string;
  user_id: string;
  semester_id: string;
  name: string;
  instructor: string | null;
  color: string;
  icon: string;
  grade_scale: GradeThreshold[];
  created_at: string;
  updated_at: string;
  /** Populated when the row is fetched with `course_meetings(*)` joined. */
  course_meetings?: CourseMeeting[];
  /** Populated when the row is fetched with `course_office_hours(*)` joined. */
  course_office_hours?: CourseOfficeHours[];
}

export type CourseMeetingKind = 'lecture' | 'lab' | 'discussion' | 'other';

export interface CourseMeeting {
  id: string;
  user_id: string;
  course_id: string;
  /** JS getDay() values, 0=Sun..6=Sat. Always non-empty per DB constraint. */
  days_of_week: number[];
  start_time: string | null;
  end_time: string | null;
  kind: CourseMeetingKind;
  location: string | null;
  notes: string | null;
  created_at: string;
}

export interface CourseOfficeHours {
  id: string;
  user_id: string;
  course_id: string;
  /** Nullable: "by appointment" rows have no fixed days. */
  days_of_week: number[] | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  notes: string | null;
  created_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  course_id: string;
  title: string;
  description: string | null;
  type: TaskType;
  due_date: string;
  due_time: string | null;
  weight: number | null;
  score: number | null;
  points_earned: number | null;
  points_possible: number | null;
  is_extra_credit: boolean;
  submitted_late: boolean;
  is_completed: boolean;
  completed_at: string | null;
  source: SourceType;
  parse_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyllabusUpload {
  id: string;
  user_id: string;
  course_id: string;
  storage_path: string;
  file_name: string;
  file_size_bytes: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
}

export interface ParseRun {
  id: string;
  user_id: string;
  upload_id: string;
  course_id: string;
  parse_version: string;
  method: 'rule_only' | 'rule_plus_gemini';
  gemini_model: string | null;
  parse_confidence: number | null;
  normalized_text: string | null;
  source_excerpts: Record<string, unknown> | null;
  final_results: unknown[] | null;
  items_accepted: number | null;
  items_rejected: number | null;
  raw_text: string | null;
  error_message: string | null;
  duration_ms: number | null;
  created_at: string;
}

// Insert types (omit server-generated fields)
export type NewSemester = Pick<Semester, 'name'> &
  Partial<Pick<Semester, 'start_date' | 'end_date' | 'is_active'>>;

export type NewCourse = Pick<Course, 'semester_id' | 'name'> &
  Partial<Pick<Course, 'instructor' | 'color' | 'icon'>>;

// user_id is set by the caller from session before insert (matches NewCourse / NewTask convention).
export type NewCourseMeeting = Pick<CourseMeeting, 'course_id' | 'days_of_week'> &
  Partial<Pick<CourseMeeting, 'start_time' | 'end_time' | 'kind' | 'location' | 'notes'>>;

export type NewCourseOfficeHours = Pick<CourseOfficeHours, 'course_id'> &
  Partial<Pick<CourseOfficeHours, 'days_of_week' | 'start_time' | 'end_time' | 'location' | 'notes'>>;

export type NewTask = Pick<Task, 'course_id' | 'title' | 'due_date'> &
  Partial<Pick<Task, 'description' | 'type' | 'due_time' | 'weight' | 'source' | 'parse_run_id' | 'is_extra_credit' | 'score' | 'points_earned' | 'points_possible' | 'submitted_late'>>;
