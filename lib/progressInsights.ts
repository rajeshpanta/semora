import {
  eachWeekOfInterval,
  endOfWeek,
  format,
  isAfter,
  parseISO,
  startOfWeek,
  subWeeks,
} from 'date-fns';
import { Platform, Share } from 'react-native';
import { getAppLocale, localeTag, translate } from '@/lib/i18n';
import * as FileSystem from 'expo-file-system/legacy';
import { calculateCourseGrade } from '@/lib/grades';
import { isCompletedOnTime } from '@/lib/taskStatus';
import type { Course, GradeCategory, Task } from '@/types/database';

export interface CourseProgressInsight {
  courseId: string;
  name: string;
  color: string;
  grade: number | null;
  letter: string | null;
  gradeTrend: number | null;
  completionRate: number;
  onTimeRate: number | null;
  missingCount: number;
  gradedCount: number;
}

export interface WeeklyCompletionInsight {
  weekStart: string;
  label: string;
  completed: number;
  onTime: number;
}

export interface ProgressInsights {
  totalTasks: number;
  completedTasks: number;
  /** Tasks whose due date has passed — the denominator for completionRate. */
  dueSoFarTasks: number;
  completedDueSoFarTasks: number;
  /** Share of work DUE SO FAR that is done. 100 when nothing is due yet. */
  completionRate: number;
  onTimeRate: number | null;
  missingCount: number;
  gradedTasks: number;
  bestCompletionDay: string | null;
  bestCompletionHour: string | null;
  currentWeeklyStreak: number;
  courseInsights: CourseProgressInsight[];
  weekly: WeeklyCompletionInsight[];
}

function dueAt(task: Pick<Task, 'due_date' | 'due_time'>) {
  return new Date(`${task.due_date}T${task.due_time || '23:59:59'}`);
}

// Lateness has one definition, in lib/taskStatus.ts, and this used to be a
// second one: it re-derived late from `completed_at > due` and overrode the
// stored answer, so Insights called a task late while Task detail called the
// same row on time.
const isOnTime = (task: Task) => isCompletedOnTime(task);

function taskScore(task: Task): number | null {
  if (task.score != null && Number.isFinite(task.score)) return task.score;
  if (task.points_earned != null && task.points_possible != null && task.points_possible > 0) {
    return task.points_earned / task.points_possible * 100;
  }
  return null;
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function gradeTrend(tasks: Task[]): number | null {
  const graded = tasks
    .filter((task) => taskScore(task) != null)
    .sort((a, b) =>
      (a.completed_at || a.updated_at).localeCompare(b.completed_at || b.updated_at),
    );
  if (graded.length < 4) return null;
  const split = Math.max(2, Math.floor(graded.length / 2));
  const previous = average(graded.slice(0, split).map((task) => taskScore(task)!));
  const recent = average(graded.slice(split).map((task) => taskScore(task)!));
  return previous == null || recent == null ? null : round(recent - previous);
}

export function buildProgressInsights(
  courses: Course[],
  tasks: Task[],
  categories: GradeCategory[] = [],
  now = new Date(),
): ProgressInsights {
  const completed = tasks.filter((task) => task.is_completed);
  const onTimeValues = completed.map(isOnTime).filter((value): value is boolean => value != null);
  const missing = tasks.filter(
    (task) => !task.is_completed && isAfter(now, dueAt(task)),
  );
  const graded = tasks.filter((task) => taskScore(task) != null);

  const completionDays = new Map<string, number>();
  const completionHours = new Map<number, number>();
  completed.forEach((task) => {
    if (!task.completed_at) return;
    const date = parseISO(task.completed_at);
    if (!Number.isFinite(date.getTime())) return;
    const day = format(date, 'EEEE');
    completionDays.set(day, (completionDays.get(day) ?? 0) + 1);
    completionHours.set(date.getHours(), (completionHours.get(date.getHours()) ?? 0) + 1);
  });
  const bestCompletionDay =
    [...completionDays.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const bestHour = [...completionHours.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const bestCompletionHour = bestHour == null
    ? null
    : format(new Date(2020, 0, 1, bestHour), 'h a');

  const firstWeek = startOfWeek(subWeeks(now, 7), { weekStartsOn: 1 });
  const lastWeek = startOfWeek(now, { weekStartsOn: 1 });
  const weekStarts = eachWeekOfInterval(
    { start: firstWeek, end: lastWeek },
    { weekStartsOn: 1 },
  );
  const weekly = weekStarts.map((weekStart) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const rows = completed.filter((task) => {
      if (!task.completed_at) return false;
      const date = parseISO(task.completed_at);
      return date >= weekStart && date <= weekEnd;
    });
    return {
      weekStart: format(weekStart, 'yyyy-MM-dd'),
      label: format(weekStart, 'MMM d'),
      completed: rows.length,
      onTime: rows.filter((task) => isOnTime(task) === true).length,
    };
  });

  let currentWeeklyStreak = 0;
  for (let index = weekly.length - 1; index >= 0; index--) {
    if (weekly[index].completed === 0) break;
    currentWeeklyStreak++;
  }

  const courseInsights = courses.map((course) => {
    const rows = tasks.filter((task) => task.course_id === course.id);
    const courseCompleted = rows.filter((task) => task.is_completed);
    const courseOnTime = courseCompleted
      .map(isOnTime)
      .filter((value): value is boolean => value != null);
    const result = calculateCourseGrade(
      rows,
      categories.filter((category) => category.course_id === course.id),
      course.grade_scale,
      course.extra_credit_policy,
    );
    return {
      courseId: course.id,
      name: course.name,
      color: course.color,
      grade: result.percentage,
      letter: result.letter,
      gradeTrend: gradeTrend(rows),
      // Measured against work that is actually DUE, not the whole semester —
      // see the note on the top-level completionRate below.
      completionRate: (() => {
        const dueSoFar = rows.filter((task) => !isAfter(dueAt(task), now));
        const done = dueSoFar.filter((task) => task.is_completed);
        return dueSoFar.length ? round(done.length / dueSoFar.length * 100) : 100;
      })(),
      onTimeRate: courseOnTime.length
        ? round(courseOnTime.filter(Boolean).length / courseOnTime.length * 100)
        : null,
      missingCount: rows.filter((task) => !task.is_completed && isAfter(now, dueAt(task))).length,
      gradedCount: rows.filter((task) => taskScore(task) != null).length,
    };
  });

  // "Completed" is the headline metric of a screen whose job is to tell a
  // student whether they are keeping up. Dividing by every task in the
  // semester answered a different question — how far through the term are you —
  // so a student who had done everything asked of them in September still read
  // 12%, which is exactly the opposite of the encouragement the screen exists
  // to give. Measure against what is actually due by now; work not yet due
  // cannot be behind.
  const dueSoFar = tasks.filter((task) => !isAfter(dueAt(task), now));
  const completedOfDueSoFar = dueSoFar.filter((task) => task.is_completed);

  return {
    totalTasks: tasks.length,
    completedTasks: completed.length,
    dueSoFarTasks: dueSoFar.length,
    completedDueSoFarTasks: completedOfDueSoFar.length,
    completionRate: dueSoFar.length
      ? round(completedOfDueSoFar.length / dueSoFar.length * 100)
      : 100,
    onTimeRate: onTimeValues.length
      ? round(onTimeValues.filter(Boolean).length / onTimeValues.length * 100)
      : null,
    missingCount: missing.length,
    gradedTasks: graded.length,
    bestCompletionDay,
    bestCompletionHour,
    currentWeeklyStreak,
    courseInsights,
    weekly,
  };
}

// ── Semester report export ─────────────────────────────────
// A real, shareable FILE (not an OS text blurb): the same escape hatch as the
// .ics export (lib/ics.ts) — pure string generation, written to the cache via
// expo-file-system's legacy API, handed to React Native's built-in share sheet.
// No new dependency.

/** RFC 4180 field quoting: wrap in double quotes and double any embedded
 *  quotes when a value contains a comma, quote, or newline. */
function csvCell(value: string | number | null): string {
  const str = value == null ? '' : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function csvRow(cells: (string | number | null)[]): string {
  return cells.map(csvCell).join(',');
}

/**
 * Pure CSV builder (exported separately from the share wrapper so it stays
 * unit-testable). One header row, one row per course, then a semester totals
 * row so the file is self-contained.
 */
export function generateSemesterReportCsv(
  semesterName: string,
  insights: ProgressInsights,
): string {
  const locale = getAppLocale();
  const labels = locale === 'es'
    ? ['Curso', 'Calificación actual', 'Letra', 'Avance %', 'A tiempo %', 'Faltantes', 'Calificadas']
    : ['Course', 'Current grade', 'Letter', 'Completion %', 'On-time %', 'Missing', 'Graded'];
  const rows: string[] = [
    csvRow([locale === 'es' ? `Informe del semestre de Semora — ${semesterName}` : `Semora semester report — ${semesterName}`]),
    '',
    csvRow(labels),
  ];
  for (const course of insights.courseInsights) {
    rows.push(
      csvRow([
        course.name,
        course.grade == null ? '' : course.grade,
        course.letter ?? '',
        course.completionRate,
        course.onTimeRate == null ? '' : course.onTimeRate,
        course.missingCount,
        course.gradedCount,
      ]),
    );
  }
  rows.push(
    csvRow([
      locale === 'es' ? 'Todos los cursos' : 'All courses',
      '',
      '',
      insights.completionRate,
      insights.onTimeRate == null ? '' : insights.onTimeRate,
      insights.missingCount,
      insights.gradedTasks,
    ]),
  );
  // Excel/Numbers split rows on CRLF; a trailing newline keeps the last row clean.
  return rows.join('\r\n') + '\r\n';
}

/**
 * Build the semester report CSV, write it to the cache directory, and open the
 * iOS share sheet. Returns the exported course count for analytics. Throws
 * user-presentable Errors on failure (same convention as exportSemesterIcs).
 */
export async function exportSemesterReport(
  semesterName: string,
  insights: ProgressInsights,
): Promise<{ courses: number }> {
  if (insights.courseInsights.length === 0) {
    throw new Error(translate('Nothing to export yet — add classes and assignments first.'));
  }

  const csv = generateSemesterReportCsv(semesterName, insights);

  // Same Blob + anchor-download pattern as exportSemesterIcs (lib/ics.ts) —
  // no native share sheet exists in a browser, but a plain file download
  // works everywhere and needs no extra dependency.
  if (Platform.OS === 'web') {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'semora-semester-report.csv';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { courses: insights.courseInsights.length };
  }

  const uri = `${FileSystem.cacheDirectory}semora-semester-report.csv`;
  await FileSystem.writeAsStringAsync(uri, csv);

  // RN's built-in share sheet accepts a file:// URL directly on iOS — no
  // expo-sharing dependency. Resolves when the sheet is dismissed.
  await Share.share({ url: uri });

  return { courses: insights.courseInsights.length };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Plain, self-contained HTML for the printable semester report — genuinely
 * new on web (no mobile equivalent: printing isn't a phone interaction),
 * useful for bringing a clean grade/schedule summary to an advising or
 * office-hours meeting. Kept as its own exported function (like
 * generateSemesterReportCsv) so the markup is unit-testable independent of
 * the print/iframe mechanics below.
 */
export function generateSemesterReportHtml(semesterName: string, insights: ProgressInsights): string {
  const locale = getAppLocale();
  const labels = locale === 'es'
    ? { report: 'Informe del semestre de Semora', generated: 'generado', course: 'Curso', grade: 'Calificación', letter: 'Letra', completion: 'Avance', onTime: 'A tiempo', missing: 'Faltantes', all: 'Todos los cursos' }
    : { report: 'Semora semester report', generated: 'generated', course: 'Course', grade: 'Grade', letter: 'Letter', completion: 'Completion', onTime: 'On-time', missing: 'Missing', all: 'All courses' };
  const courseRows = insights.courseInsights.map((course) => `
    <tr>
      <td>${escapeHtml(course.name)}</td>
      <td>${course.grade == null ? '—' : `${course.grade}%`}</td>
      <td>${course.letter ?? '—'}</td>
      <td>${course.completionRate}%</td>
      <td>${course.onTimeRate == null ? '—' : `${course.onTimeRate}%`}</td>
      <td>${course.missingCount}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(semesterName)} — Semora</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #1C1B1F; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 2px; }
  .sub { color: #55555C; font-size: 13px; margin-bottom: 22px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e5e5e5; }
  th { color: #55555C; font-weight: 600; text-transform: uppercase; font-size: 10.5px; letter-spacing: 0.4px; }
  tfoot td { font-weight: 700; border-top: 2px solid #1C1B1F; border-bottom: none; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(semesterName)}</h1>
  <div class="sub">${labels.report} · ${labels.generated} ${new Date().toLocaleDateString(localeTag(locale))}</div>
  <table>
    <thead><tr><th>${labels.course}</th><th>${labels.grade}</th><th>${labels.letter}</th><th>${labels.completion}</th><th>${labels.onTime}</th><th>${labels.missing}</th></tr></thead>
    <tbody>${courseRows}</tbody>
    <tfoot><tr>
      <td>${labels.all}</td><td></td><td></td>
      <td>${insights.completionRate}%</td>
      <td>${insights.onTimeRate == null ? '—' : `${insights.onTimeRate}%`}</td>
      <td>${insights.missingCount}</td>
    </tr></tfoot>
  </table>
</body>
</html>`;
}

/**
 * Opens the browser print dialog on a clean, purpose-built report layout —
 * rendered into a detached iframe rather than the live app UI, so it never
 * has to fight React Native Web's markup/CSS (sidebar, nav, etc.) with a
 * print stylesheet. Web-only; there's no print concept on iOS/Android.
 */
export function printSemesterReport(semesterName: string, insights: ProgressInsights): void {
  if (Platform.OS !== 'web') return;
  if (insights.courseInsights.length === 0) {
    throw new Error(translate('Nothing to print yet — add classes and assignments first.'));
  }
  const html = generateSemesterReportHtml(semesterName, insights);
  const iframe = document.createElement('iframe');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => iframe.remove();
  iframe.contentWindow?.addEventListener('afterprint', cleanup);
  window.setTimeout(cleanup, 60_000); // afterprint doesn't fire in every browser

  // Let the iframe finish laying out before invoking print — calling it
  // synchronously right after document.write can race layout in some browsers.
  window.setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }, 50);
}
