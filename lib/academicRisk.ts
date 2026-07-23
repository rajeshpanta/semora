import { addDays, format } from 'date-fns';
import { calculateCourseGrade } from '@/lib/grades';
import { taskLoadScore } from '@/lib/workload';
import type {
  Course, ExtraCreditPolicy, GradeCategory, GradeThreshold, Task,
} from '@/types/database';

export type AcademicRiskKind = 'falling_grade' | 'missing_work' | 'overloaded_week';
export type AcademicRiskSeverity = 'high' | 'medium';

type RiskTask = Task & {
  courses?: { name?: string | null; color?: string | null } | null;
};

export interface AcademicRisk {
  id: string;
  kind: AcademicRiskKind;
  severity: AcademicRiskSeverity;
  title: string;
  detail: string;
  courseId?: string;
  taskId?: string;
}

export interface RecoveryStep {
  id: string;
  title: string;
  detail: string;
  action: 'task' | 'planner' | 'course';
  targetId?: string;
}

export interface AcademicRiskReport {
  risks: AcademicRisk[];
  recoveryPlan: RecoveryStep[];
  highCount: number;
}

function gradeTask(task: RiskTask) {
  return {
    id: task.id,
    grade_category_id: task.grade_category_id,
    weight: task.weight,
    score: task.score,
    points_earned: task.points_earned,
    points_possible: task.points_possible,
    is_extra_credit: task.is_extra_credit,
  };
}

export function buildAcademicRiskReport(
  tasks: RiskTask[],
  courses: Pick<Course, 'id' | 'name' | 'grade_scale' | 'extra_credit_policy'>[],
  categories: GradeCategory[] = [],
  now: Date = new Date(),
): AcademicRiskReport {
  const today = format(now, 'yyyy-MM-dd');
  const weekEnd = format(addDays(now, 7), 'yyyy-MM-dd');
  const risks: AcademicRisk[] = [];
  const recoveryPlan: RecoveryStep[] = [];

  const overdue = tasks
    .filter((task) => !task.is_completed && task.due_date < today)
    .sort((a, b) =>
      (b.weight ?? 0) - (a.weight ?? 0) ||
      a.due_date.localeCompare(b.due_date),
    );
  if (overdue.length) {
    const oldest = overdue[0];
    risks.push({
      id: 'missing-work',
      kind: 'missing_work',
      severity: overdue.length >= 3 ? 'high' : 'medium',
      title: `${overdue.length} missing assignment${overdue.length === 1 ? '' : 's'}`,
      detail: `${oldest.title} is the first recovery target${oldest.courses?.name ? ` in ${oldest.courses.name}` : ''}.`,
      taskId: oldest.id,
      courseId: oldest.course_id,
    });
    recoveryPlan.push({
      id: `recover-${oldest.id}`,
      title: `Finish ${oldest.title}`,
      detail: oldest.weight != null ? `Highest-impact missing work at ${oldest.weight}% of the grade.` : 'Clear the oldest missing item first.',
      action: 'task',
      targetId: oldest.id,
    });
  }

  for (const course of courses) {
    const courseTasks = tasks.filter((task) => task.course_id === course.id);
    const graded = courseTasks
      .filter((task) => task.score != null && !task.is_extra_credit)
      .sort((a, b) => (a.completed_at || a.updated_at).localeCompare(b.completed_at || b.updated_at));
    if (graded.length < 2) continue;

    const grade = calculateCourseGrade(
      courseTasks.map(gradeTask),
      categories.filter((category) => category.course_id === course.id),
      (course.grade_scale || []) as GradeThreshold[],
      (course.extra_credit_policy || 'bonus') as ExtraCreditPolicy,
    );
    const recent = graded.slice(-3);
    const earlier = graded.slice(Math.max(0, graded.length - 6), Math.max(0, graded.length - 3));
    const recentAverage = recent.reduce((sum, task) => sum + (task.score ?? 0), 0) / recent.length;
    const earlierAverage = earlier.length
      ? earlier.reduce((sum, task) => sum + (task.score ?? 0), 0) / earlier.length
      : null;
    const drop = earlierAverage == null ? 0 : earlierAverage - recentAverage;
    const isFalling = drop >= 7 || (grade.percentage != null && grade.percentage < 70);
    if (!isFalling) continue;

    risks.push({
      id: `falling-${course.id}`,
      kind: 'falling_grade',
      severity: grade.percentage != null && grade.percentage < 65 ? 'high' : 'medium',
      title: `${course.name} needs attention`,
      detail: drop >= 7
        ? `Recent grades are down ${Math.round(drop)} points${grade.percentage != null ? `; current estimate ${grade.percentage.toFixed(1)}%` : ''}.`
        : `Current grade estimate is ${grade.percentage?.toFixed(1)}%.`,
      courseId: course.id,
    });
    recoveryPlan.push({
      id: `review-${course.id}`,
      title: `Review ${course.name}`,
      detail: 'Check category performance and use the what-if calculator to set a reachable target.',
      action: 'course',
      targetId: course.id,
    });
  }

  const nextWeek = tasks.filter((task) =>
    !task.is_completed && task.due_date >= today && task.due_date <= weekEnd,
  );
  const load = nextWeek.reduce((sum, task) => sum + taskLoadScore(task), 0);
  if (nextWeek.length >= 5 || (nextWeek.length >= 3 && load >= 55)) {
    risks.push({
      id: 'overloaded-week',
      kind: 'overloaded_week',
      severity: nextWeek.length >= 7 || load >= 90 ? 'high' : 'medium',
      title: `Heavy 7-day workload`,
      detail: `${nextWeek.length} deadlines are competing for time. Build the study plan before the week gets away from you.`,
    });
    recoveryPlan.push({
      id: 'rebuild-plan',
      title: 'Rebalance the next 7 days',
      detail: 'Smart Plan will split the heaviest work and avoid your classes and calendar events.',
      action: 'planner',
    });
  }

  const ordered = risks.sort((a, b) =>
    (a.severity === 'high' ? 0 : 1) - (b.severity === 'high' ? 0 : 1),
  );
  return {
    risks: ordered,
    recoveryPlan: recoveryPlan.slice(0, 4),
    highCount: ordered.filter((risk) => risk.severity === 'high').length,
  };
}
