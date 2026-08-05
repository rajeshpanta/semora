// RFC 5545 (iCalendar) export. Generates a single .ics file holding the
// selected semester's incomplete task deadlines plus weekly-recurring class
// meetings, writes it to the app cache, and hands it to the iOS share sheet.
// This is the escape hatch for users on Google Calendar / Outlook, where the
// EventKit-based device sync (lib/calendarSync.ts) can't reach.
//
// Deliberately dependency-free: the text generation is pure string work, the
// file goes through expo-file-system (already a dependency, legacy API to
// match lib/syllabus.ts / lib/ai-extraction.ts), and the share sheet is React
// Native's built-in Share — no expo-sharing, no ical libraries.
//
// Times are written as FLOATING local times (no TZID / no trailing Z) on
// purpose. Semora's schedule policy is device-local wall clock (see the
// timezone note in lib/schedule.ts): a floating "14:00" imports as 2 PM in
// whatever timezone the target calendar uses, which matches how the app
// itself interprets times. Emitting TZID would require shipping VTIMEZONE
// definitions — a lot of spec surface for zero user benefit here.

import { Platform, Share } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { meetingEventTitle, semesterEndOrDefault } from '@/lib/calendarSync';

// ── RFC 5545 text machinery ────────────────────────────────

const CRLF = '\r\n';

/** TEXT value escaping per RFC 5545 §3.3.11. Backslash must be escaped
 *  first; raw line breaks become the literal "\n" sequence. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** UTF-8 byte count of one code point — folding is specified in OCTETS, not
 *  characters, so "75 chars" would overflow on non-ASCII (em dashes in our
 *  titles, accented course names). */
function utf8Bytes(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

/** Fold a content line at 75 octets per RFC 5545 §3.1: continuation lines
 *  start with CRLF + one space (the space counts toward the next line's 75).
 *  Iterates by code point so a multi-byte character is never split. */
function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const b = utf8Bytes(ch.codePointAt(0)!);
    if (bytes + b > 75) {
      parts.push(current);
      current = ' ';
      bytes = 1;
    }
    current += ch;
    bytes += b;
  }
  parts.push(current);
  return parts.join(CRLF);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-01-15" → "20260115" (DATE value). */
function fmtDate(dateStr: string): string {
  return dateStr.replace(/-/g, '');
}

/** Local floating DATE-TIME: "20260115T143000". */
function fmtLocal(d: Date): string {
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** UTC DATE-TIME with Z suffix — DTSTAMP is required to be UTC. */
function fmtUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Day after "YYYY-MM-DD" as "YYYYMMDD" — all-day DTEND is exclusive. */
function nextDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  return `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
}

/** "YYYY-MM-DD" + "HH:MM[:SS]" → local Date. */
function localDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h = 0, mi = 0] = timeStr.split(':').map((s) => parseInt(s, 10) || 0);
  return new Date(y, m - 1, d, h, mi, 0, 0);
}

// RFC 5545 weekday codes indexed by JS getDay() (0=Sun..6=Sat).
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

/** Earliest date on/after `from` whose weekday is in `days`, at `startTime`.
 *  DTSTART must itself fall on a BYDAY weekday, so pick the soonest one. */
function firstMeetingStart(days: number[], startTime: string, from: Date): Date {
  const [h = 0, m = 0] = startTime.split(':').map((s) => parseInt(s, 10) || 0);
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate(), h, m, 0, 0);
  const delta = Math.min(...days.map((d) => (d - base.getDay() + 7) % 7));
  base.setDate(base.getDate() + delta);
  return base;
}

// ── Generation ─────────────────────────────────────────────

export interface IcsTask {
  id: string;
  title: string;
  description: string | null;
  /** "YYYY-MM-DD" */
  due_date: string;
  /** "HH:MM:SS" or null → all-day event */
  due_time: string | null;
  courseName: string;
}

export interface IcsMeeting {
  id: string;
  courseName: string;
  kind: string;
  /** JS getDay() values, non-empty */
  days_of_week: number[];
  /** "HH:MM:SS" — meetings without a start time aren't exportable */
  start_time: string;
  end_time: string | null;
  location: string | null;
}

/**
 * Pure ICS string builder (exported separately from the fetch/share wrapper
 * so it stays unit-testable). `now` is injectable for the same reason.
 */
export function generateIcs(
  tasks: IcsTask[],
  meetings: IcsMeeting[],
  semesterEnd: Date,
  now: Date = new Date(),
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Semora//Semora Calendar Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    // Non-standard but honored by Google/Apple/Outlook: names the calendar
    // on import instead of "Untitled".
    'X-WR-CALNAME:Semora',
  ];
  const stamp = fmtUtc(now);

  for (const task of tasks) {
    lines.push('BEGIN:VEVENT');
    // Stable UID derived from the task id: re-importing a newer export
    // updates events in place (calendars dedupe on UID) instead of
    // duplicating them.
    lines.push(`UID:semora-task-${task.id}@semora.app`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`SUMMARY:${escapeText(`${task.title} — ${task.courseName}`)}`);
    if (task.due_time) {
      const start = localDateTime(task.due_date, task.due_time);
      // One-hour block, matching the device-calendar sync. Date math (not
      // string math) so 23:30 due times roll into the next day correctly.
      const end = new Date(start.getTime() + 60 * 60 * 1000);
      lines.push(`DTSTART:${fmtLocal(start)}`);
      lines.push(`DTEND:${fmtLocal(end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${fmtDate(task.due_date)}`);
      lines.push(`DTEND;VALUE=DATE:${nextDay(task.due_date)}`);
    }
    if (task.description) {
      lines.push(`DESCRIPTION:${escapeText(task.description)}`);
    }
    lines.push('END:VEVENT');
  }

  // UNTIL must use the same value type as DTSTART (RFC 5545 §3.3.10) — both
  // are floating local date-times here.
  const until = fmtLocal(semesterEnd);
  for (const meeting of meetings) {
    // Dedupe + range-check defensively; the DB constraint already enforces
    // non-empty 0..6 arrays.
    const days = [...new Set(meeting.days_of_week)].filter((d) => d >= 0 && d <= 6);
    if (days.length === 0) continue;
    const start = firstMeetingStart(days, meeting.start_time, now);
    if (start > semesterEnd) continue; // semester already over
    const end = meeting.end_time
      ? localDateTime(
          `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
          meeting.end_time,
        )
      : new Date(start.getTime() + 60 * 60 * 1000);

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:semora-meeting-${meeting.id}@semora.app`);
    lines.push(`DTSTAMP:${stamp}`);
    lines.push(`SUMMARY:${escapeText(meetingEventTitle(meeting.courseName, meeting.kind))}`);
    lines.push(`DTSTART:${fmtLocal(start)}`);
    lines.push(`DTEND:${fmtLocal(end)}`);
    lines.push(`RRULE:FREQ=WEEKLY;UNTIL=${until};BYDAY=${days.map((d) => BYDAY[d]).join(',')}`);
    if (meeting.location) {
      lines.push(`LOCATION:${escapeText(meeting.location)}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // Fold AFTER assembling each logical line; the file ends with a CRLF.
  return lines.map(foldLine).join(CRLF) + CRLF;
}

// ── Fetch + share ──────────────────────────────────────────

/**
 * Build the .ics for a semester, write it to the cache directory, and open
 * the iOS share sheet. Returns the exported counts so the caller can log
 * analytics. Throws user-presentable Errors on failure (same convention as
 * syncAllTasks).
 */
export async function exportSemesterIcs(
  semesterId: string,
): Promise<{ tasks: number; meetings: number }> {
  const [semRes, taskRes, meetRes] = await Promise.all([
    supabase.from('semesters').select('end_date').eq('id', semesterId).single(),
    // Incomplete tasks only — mirrors the device sync's scope; completed
    // work is clutter on an imported calendar.
    supabase
      .from('tasks')
      .select('id, title, description, due_date, due_time, courses!inner(name, semester_id)')
      .eq('courses.semester_id', semesterId)
      .eq('is_completed', false)
      .order('due_date'),
    supabase
      .from('course_meetings')
      .select('id, days_of_week, start_time, end_time, kind, location, courses!inner(name, semester_id)')
      .eq('courses.semester_id', semesterId),
  ]);
  if (semRes.error || taskRes.error || meetRes.error) {
    throw new Error('Could not load your semester — check your connection and try again.');
  }

  const tasks: IcsTask[] = (taskRes.data ?? []).map((t: any) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    due_date: t.due_date,
    due_time: t.due_time,
    courseName: t.courses.name,
  }));
  // Meetings without a start time have no clock position to export (same
  // rule as the device sync).
  const meetings: IcsMeeting[] = (meetRes.data ?? [])
    .filter((m: any) => m.start_time && (m.days_of_week ?? []).length > 0)
    .map((m: any) => ({
      id: m.id,
      courseName: m.courses.name,
      kind: m.kind,
      days_of_week: m.days_of_week,
      start_time: m.start_time,
      end_time: m.end_time,
      location: m.location,
    }));

  if (tasks.length === 0 && meetings.length === 0) {
    throw new Error('Nothing to export yet — add some tasks or a class schedule first.');
  }

  const ics = generateIcs(tasks, meetings, semesterEndOrDefault(semRes.data?.end_date));

  if (Platform.OS === 'web') {
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'semora-semester.ics';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { tasks: tasks.length, meetings: meetings.length };
  }

  const uri = `${FileSystem.cacheDirectory}semora-semester.ics`;
  await FileSystem.writeAsStringAsync(uri, ics);

  // React Native's built-in share sheet accepts a file:// URL directly on
  // iOS (the only platform we ship) — no expo-sharing dependency needed.
  // Resolves when the sheet is dismissed, whether or not the user picked a
  // destination.
  await Share.share({ url: uri });

  return { tasks: tasks.length, meetings: meetings.length };
}
