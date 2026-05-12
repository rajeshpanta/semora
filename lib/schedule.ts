// Shared schedule helpers + types. Single source of truth for:
//   - components/ScheduleEditor (the day+time picker)
//   - app/course/[id].tsx (display + edit)
//   - app/course/new.tsx (create flow)
//   - app/(tabs)/index.tsx (Today's classes filter + display)
//
// Schedule lives in the `course_meetings` child table — one row per
// recurring block, so a course can have a lecture (MWF 10–11) + a lab
// (Tu 2–4) as separate meetings. See migration 018.
//
// Days follow JS Date.getDay() values: 0=Sun, 1=Mon, ..., 6=Sat. Times
// are local wall-clock "HH:MM:SS" strings (Postgres `time` format) —
// never timezone-shifted, so DST weeks don't shift the schedule.
//
// Timezone policy: schedule is always interpreted in the *device's*
// local timezone at read time. A student traveling will see their
// classes shift to whatever wall-clock matches their device. This is
// deliberate — student-facing apps that anchored to a "course timezone"
// would surface 8am classes at 2am for someone visiting another
// country, which is worse than the simpler device-local rule. The
// Today tab filters use `new Date().getDay()` which respects this.
//
// The editor-facing block shape lives in components/ScheduleEditor as
// `ScheduleBlock` (since it includes UI-only fields like a stable id).
// This module owns the value formatters + day labels.

// Day chips ordered Mon-first (academic-week convention).
// `value` is the JS getDay() integer; `label` is the chip text.
// Two-letter labels disambiguate Tue/Thu and Sat/Sun (single letters
// looked identical and led users to pick the wrong day).
export const DAY_BUTTONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: 'Mo' },
  { value: 2, label: 'Tu' },
  { value: 3, label: 'We' },
  { value: 4, label: 'Th' },
  { value: 5, label: 'Fr' },
  { value: 6, label: 'Sa' },
  { value: 0, label: 'Su' },
];

// Indexed by JS getDay() value (0..6) for "Sun".."Sat" formatting.
export const DAY_FULL_LABELS: ReadonlyArray<string> = [
  'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat',
];

/** "10:00:00" → "10:00 AM". Lenient on shorter inputs ("10:00" → "10:00 AM"). */
export function formatTimeOfDay(t: string): string {
  const [hStr = '0', mStr = '0'] = t.split(':');
  const h = parseInt(hStr, 10) || 0;
  const m = parseInt(mStr, 10) || 0;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

/** Single block → "Mon, Wed, Fri · 10:00 AM – 10:50 AM". Mon-first
 *  ordering. Returns null when no days are set; multi-block callers
 *  use this internally and skip null entries. */
function formatScheduleString(
  days: number[] | null | undefined,
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (!days || days.length === 0) return null;
  const sorted = [...days].sort((a, b) => {
    // Mon-first: Mon=1..Sat=6, Sun=0 sorted last.
    const aOrd = a === 0 ? 7 : a;
    const bOrd = b === 0 ? 7 : b;
    return aOrd - bOrd;
  });
  const dayStr = sorted.map((d) => DAY_FULL_LABELS[d] ?? '?').join(', ');
  if (!start) return dayStr;
  return `${dayStr} · ${formatTimeOfDay(start)}${end ? ` – ${formatTimeOfDay(end)}` : ''}`;
}

/** Multi-block summary for the course detail header. Joins each meeting's
 *  formatted line with " · ". Sorts blocks by their earliest start time
 *  (time-less blocks last) so the most reliable info appears first.
 *  Returns null when there are no meetings. */
export function formatMeetings(
  meetings:
    | ReadonlyArray<{
        days_of_week: number[];
        start_time: string | null;
        end_time: string | null;
      }>
    | null
    | undefined,
): string | null {
  if (!meetings || meetings.length === 0) return null;
  const sorted = [...meetings].sort((a, b) =>
    (a.start_time ?? '99').localeCompare(b.start_time ?? '99'),
  );
  return sorted
    .map((m) => formatScheduleString(m.days_of_week, m.start_time, m.end_time))
    .filter((s): s is string => !!s)
    .join(' · ');
}

/** Office hours variant: same as formatMeetings, plus a "By appointment"
 *  line for rows whose days_of_week is null (the Gemini parser emits
 *  these when a syllabus says office hours are by appointment only, and
 *  the UI must surface them rather than filtering them out as empty).
 *  Multiple by-appointment rows collapse to a single label. */
export function formatOfficeHours(
  rows:
    | ReadonlyArray<{
        days_of_week: number[] | null;
        start_time: string | null;
        end_time: string | null;
      }>
    | null
    | undefined,
): string | null {
  if (!rows || rows.length === 0) return null;
  const parts: string[] = [];
  if (rows.some((r) => r.days_of_week === null)) {
    parts.push('By appointment');
  }
  const scheduled = rows
    .filter(
      (r): r is { days_of_week: number[]; start_time: string | null; end_time: string | null } =>
        Array.isArray(r.days_of_week) && r.days_of_week.length > 0,
    )
    .map((r) => ({
      days_of_week: r.days_of_week,
      start_time: r.start_time,
      end_time: r.end_time,
    }));
  const scheduledText = formatMeetings(scheduled);
  if (scheduledText) parts.push(scheduledText);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Parse "HH:MM[:SS]" into a Date with today's date and the given time.
 *  The date portion is meaningless — only used to feed time-mode pickers. */
export function timeStringToDate(t: string | null | undefined): Date | null {
  if (!t) return null;
  const [h, m] = t.split(':').map((s) => parseInt(s, 10) || 0);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/** Date → "HH:MM:00" for Postgres `time` columns. */
export function dateToTimeString(d: Date | null): string | null {
  if (!d) return null;
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}:00`;
}

/** Status of a class today relative to now.
 *  - "past":    end_time has passed (or, if no end_time, start_time has).
 *  - "now":     start_time has passed and end_time hasn't (only when end_time set).
 *  - "future":  start_time is still ahead.
 *  String compare on "HH:MM:SS" works because Postgres returns padded times. */
export function classTimeStatus(
  start: string | null,
  end: string | null,
  nowHHMM: string,
): 'past' | 'now' | 'future' {
  if (!start) return 'future';
  if (end) {
    if (nowHHMM > end) return 'past';
    if (nowHHMM >= start) return 'now';
    return 'future';
  }
  // No end_time: we don't know how long the class is, so collapse to past/future.
  return nowHHMM >= start ? 'past' : 'future';
}
