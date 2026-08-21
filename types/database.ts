import type { TaskType, SourceType, CourseIcon } from '@/lib/constants';

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  timezone: string | null;
  preferred_language: 'en' | 'es';
  reminder_same_day: boolean;
  reminder_1day: boolean;
  reminder_3day: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  gpa_scale: GpaScaleEntry[];
  study_daily_minutes: number;
  study_session_minutes: StudySessionMinutes;
  study_weekday_start: string;
  study_weekend_start: string;
  study_include_weekends: boolean;
  study_auto_reschedule: boolean;
  study_avoid_calendar_conflicts: boolean;
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

export interface GpaScaleEntry {
  letter: string;
  points: number;
}

export type ExtraCreditPolicy = 'bonus' | 'category' | 'ignore';

export type CourseSource = 'manual' | 'scan' | 'lms';

export interface Course {
  id: string;
  user_id: string;
  semester_id: string;
  name: string;
  /**
   * Where this class came from (090). Only non-`lms` rows count against the
   * free per-semester course limit — Canvas classes are uncapped while the
   * canvas_free promo is live.
   */
  source: CourseSource;
  instructor: string | null;
  color: string;
  icon: string;
  grade_scale: GradeThreshold[];
  /** Credit-hour weight used by the semester GPA estimate. */
  credit_hours: number;
  extra_credit_policy: ExtraCreditPolicy;
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
  priority: TaskPriority;
  start_date: string | null;
  recurrence_frequency: RecurrenceFrequency | null;
  recurrence_end_date: string | null;
  recurrence_series_id: string | null;
  /** Original monthly day (for example 30) so February does not shift later months. */
  recurrence_anchor_day: number | null;
  /** True when a monthly series intentionally follows the last day of each month. */
  recurrence_anchor_is_month_end: boolean | null;
  /** null uses profile defaults; [] disables; values are minutes before due. */
  reminder_offsets_minutes: number[] | null;
  /** Student override; null lets the smart planner infer effort from task type and weight. */
  estimated_minutes: number | null;
  grade_category_id: string | null;
  weight: number | null;
  score: number | null;
  points_earned: number | null;
  points_possible: number | null;
  is_extra_credit: boolean;
  submitted_late: boolean;
  /** Expected percentage-point deduction; final posted score is never reduced twice. */
  late_penalty_percent: number | null;
  is_completed: boolean;
  completed_at: string | null;
  source: SourceType;
  parse_run_id: string | null;
  lms_connection_id: string | null;
  lms_external_course_id: string | null;
  lms_external_id: string | null;
  lms_external_updated_at: string | null;
  lms_url: string | null;
  lms_last_synced_at: string | null;
  lms_removed_at: string | null;
  collaboration_deadline_id: string | null;
  group_assignment_id: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskPriority = 'low' | 'normal' | 'high';
export type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';
export type StudySessionMinutes = 25 | 45 | 50;

export interface TaskSubtask {
  id: string;
  user_id: string;
  task_id: string;
  title: string;
  is_completed: boolean;
  position: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudyBlock {
  id: string;
  user_id: string;
  task_id: string;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  is_completed: boolean;
  completed_at: string | null;
  reschedule_reason: 'missed' | 'conflict' | 'rebuild' | null;
  rescheduled_from_date: string | null;
  /** Why the adaptive coach raised this session's priority, if applicable. */
  coach_reason: 'exam' | 'grade_risk' | null;
  generated_at: string;
  created_at: string;
  updated_at: string;
}

export type StudyPlanChangeKind = 'habit' | 'missed' | 'calendar' | 'exam' | 'grade_risk' | 'capacity';

export interface StudyPlanChange {
  id: string;
  user_id: string;
  semester_id: string;
  kind: StudyPlanChangeKind;
  change_key: string;
  title: string;
  detail: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface StudyPlannerSettings {
  study_daily_minutes: number;
  study_session_minutes: StudySessionMinutes;
  study_weekday_start: string;
  study_weekend_start: string;
  study_include_weekends: boolean;
  study_auto_reschedule: boolean;
  study_avoid_calendar_conflicts: boolean;
}

export interface GradeCategory {
  id: string;
  user_id: string;
  course_id: string;
  name: string;
  weight_percent: number;
  drop_lowest_count: number;
  position: number;
  created_at: string;
  updated_at: string;
}

export type LmsProvider = 'canvas' | 'blackboard' | 'moodle' | 'google_classroom';
export type LmsConnectionMethod = 'legacy_token' | 'calendar_feed' | 'oauth';
export type LmsSyncStatus =
  | 'never'
  | 'syncing'
  | 'success'
  | 'partial'
  | 'error'
  | 'credentials_required';

export interface LmsConnection {
  id: string;
  user_id: string;
  provider: LmsProvider;
  connection_method: LmsConnectionMethod;
  display_name: string;
  base_url: string | null;
  account_label: string | null;
  sync_enabled: boolean;
  last_synced_at: string | null;
  last_sync_status: LmsSyncStatus;
  last_error: string | null;
  /** Student-approved encrypted credential exists server-side for scheduled sync. */
  background_sync_enabled: boolean;
  background_sync_authorized_at: string | null;
  background_sync_paused_at: string | null;
  next_background_sync_at: string | null;
  last_sync_attempt_at: string | null;
  last_successful_sync_at: string | null;
  consecutive_sync_failures: number;
  /**
   * Set by the database (090) when a non-Pro account created this connection
   * while the `canvas_free` promo was live. Non-null means grandfathered: this
   * connection keeps syncing after the offer closes.
   */
  free_promo_claimed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LmsCourseLink {
  id: string;
  user_id: string;
  connection_id: string;
  external_course_id: string;
  external_name: string;
  local_course_id: string;
  sync_enabled: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CollaborationRole = 'owner' | 'editor' | 'viewer';

export interface CourseCollaboration {
  id: string;
  owner_user_id: string;
  course_id: string;
  course_name: string;
  course_color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CourseCollaborationMember {
  collaboration_id: string;
  user_id: string;
  role: CollaborationRole;
  display_name: string;
  local_course_id: string | null;
  joined_at: string;
}

export interface SharedDeadline {
  id: string;
  collaboration_id: string;
  source_task_id: string | null;
  created_by: string;
  title: string;
  description: string | null;
  task_type: TaskType;
  due_date: string;
  due_time: string | null;
  points_possible: number | null;
  source_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupAssignment {
  id: string;
  collaboration_id: string;
  created_by: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  due_date: string;
  due_time: string | null;
  is_completed: boolean;
  completed_by: string | null;
  completed_at: string | null;
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
  Partial<Pick<Course, 'instructor' | 'color' | 'icon' | 'credit_hours' | 'extra_credit_policy'>>;

// user_id is set by the caller from session before insert (matches NewCourse / NewTask convention).
export type NewCourseMeeting = Pick<CourseMeeting, 'course_id' | 'days_of_week'> &
  Partial<Pick<CourseMeeting, 'start_time' | 'end_time' | 'kind' | 'location' | 'notes'>>;

export type NewCourseOfficeHours = Pick<CourseOfficeHours, 'course_id'> &
  Partial<Pick<CourseOfficeHours, 'days_of_week' | 'start_time' | 'end_time' | 'location' | 'notes'>>;

export type NewTask = Pick<Task, 'course_id' | 'title' | 'due_date'> &
  Partial<Pick<Task, 'description' | 'type' | 'due_time' | 'weight' | 'source' | 'parse_run_id' | 'is_extra_credit' | 'score' | 'points_earned' | 'points_possible' | 'submitted_late' | 'late_penalty_percent' | 'priority' | 'start_date' | 'recurrence_frequency' | 'recurrence_end_date' | 'reminder_offsets_minutes' | 'estimated_minutes' | 'grade_category_id' | 'collaboration_deadline_id' | 'group_assignment_id'>>;

export type NewGradeCategory = Pick<GradeCategory, 'course_id' | 'name' | 'weight_percent'> &
  Partial<Pick<GradeCategory, 'drop_lowest_count' | 'position'>>;

export type NewTaskSubtask = Pick<TaskSubtask, 'task_id' | 'title'> &
  Partial<Pick<TaskSubtask, 'position'>>;
