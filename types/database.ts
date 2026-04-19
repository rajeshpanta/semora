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
  meeting_time: string | null;
  office_hours: string | null;
  color: string;
  icon: string;
  grade_scale: GradeThreshold[];
  created_at: string;
  updated_at: string;
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
  Partial<Pick<Course, 'instructor' | 'meeting_time' | 'office_hours' | 'color' | 'icon'>>;

export type NewTask = Pick<Task, 'course_id' | 'title' | 'due_date'> &
  Partial<Pick<Task, 'description' | 'type' | 'due_time' | 'weight' | 'source' | 'parse_run_id' | 'is_extra_credit' | 'score' | 'points_earned' | 'points_possible' | 'submitted_late'>>;
