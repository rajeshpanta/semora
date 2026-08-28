/**
 * Turns a student's class schedule into repeating weekly reminders.
 *
 * The task planner deliberately works on a rolling horizon: deadlines move, get
 * completed, and are refilled every time the app is opened. A class timetable is
 * not like that. It is a standing fact for the length of a term, and a student
 * who turns these on is promised something they can stop thinking about — which
 * a horizon cannot deliver, because the median gap between app opens is a day
 * but the longest observed is a month.
 *
 * So these are scheduled once, as repeating triggers, and iOS re-arms them
 * itself. One trigger per meeting per weekday: Monday/Wednesday/Friday is three,
 * Tuesday/Thursday is two. Each occupies a single pending slot forever rather
 * than one per week, which is what makes a whole timetable affordable inside the
 * same 60-slot ceiling the deadlines live in.
 *
 * Pure: this decides WHICH triggers should exist. lib/notifications.ts creates
 * and cancels them.
 */

/**
 * The most slots a timetable may hold.
 *
 * Above this the schedule is either unusual or wrong, and it is not worth
 * spending a whole budget on. Measured against production the ninetieth
 * percentile student needs 8 and the heaviest needs 28, so this clears every
 * real timetable with room over.
 */
export const CLASS_REMINDER_MAX_SLOTS = 32;

/** Lead times offered. Deliberately few — this is a glance, not a config screen. */
export const CLASS_LEAD_OPTIONS = [10, 15, 30, 60] as const;

export interface ClassMeetingRow {
  id: string;
  courseId: string;
  courseName: string;
  /** 0 = Sunday … 6 = Saturday, as stored in course_meetings.days_of_week. */
  daysOfWeek: number[] | null | undefined;
  /** 'HH:mm[:ss]'. A meeting with no start time cannot be reminded about. */
  startTime: string | null | undefined;
  location?: string | null;
  kind?: string | null;
}

export interface ClassReminderTrigger {
  /** Stable identity, so an edit can cancel exactly what it replaces. */
  meetingId: string;
  courseId: string;
  courseName: string;
  location: string | null;
  /** 1 = Sunday … 7 = Saturday. iOS/`DateComponents.weekday` numbering. */
  weekday: number;
  /** Local wall-clock time the notification fires. */
  hour: number;
  minute: number;
  /** Minutes before the meeting starts. Carried for analytics and copy. */
  leadMinutes: number;
}

export interface ClassPlan {
  triggers: ClassReminderTrigger[];
  /** Meetings that could not be used, and why — counts only. */
  skippedNoTime: number;
  skippedNoDays: number;
  /** Triggers dropped because the timetable exceeded the cap. */
  overflow: number;
}

function parseTime(value: string | null | undefined): { hour: number; minute: number } | null {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { hour: h, minute: m };
}

/**
 * Shift a wall-clock time back by the lead, wrapping to the previous day.
 *
 * A 9:00 class with an hour's warning fires at 8:00 the same morning; a 00:30
 * class — rare but present in real timetables — wraps to the evening before,
 * and the weekday has to move with it or the reminder lands a week early.
 */
export function shiftBack(
  weekday: number,
  hour: number,
  minute: number,
  leadMinutes: number,
): { weekday: number; hour: number; minute: number } {
  let total = hour * 60 + minute - leadMinutes;
  let day = weekday;
  while (total < 0) {
    total += 24 * 60;
    day = day === 1 ? 7 : day - 1;
  }
  while (total >= 24 * 60) {
    total -= 24 * 60;
    day = day === 7 ? 1 : day + 1;
  }
  return { weekday: day, hour: Math.floor(total / 60), minute: total % 60 };
}

/**
 * Build the trigger set for a timetable.
 *
 * `daysOfWeek` is stored 0–6 with Sunday at 0; iOS counts 1–7 with Sunday at 1.
 * Converting here rather than at the call site keeps the off-by-one in one
 * place, which is the kind of mistake that would silently remind a student
 * about Tuesday's class on Monday.
 */
export function buildClassPlan(
  meetings: ClassMeetingRow[],
  leadMinutes: number,
  maxSlots: number = CLASS_REMINDER_MAX_SLOTS,
): ClassPlan {
  const triggers: ClassReminderTrigger[] = [];
  let skippedNoTime = 0;
  let skippedNoDays = 0;

  for (const meeting of meetings) {
    const time = parseTime(meeting.startTime);
    if (!time) {
      skippedNoTime += 1;
      continue;
    }
    const days = (meeting.daysOfWeek ?? []).filter(
      (d) => Number.isInteger(d) && d >= 0 && d <= 6,
    );
    if (days.length === 0) {
      skippedNoDays += 1;
      continue;
    }

    for (const day of [...new Set(days)].sort((a, b) => a - b)) {
      const shifted = shiftBack(day + 1, time.hour, time.minute, leadMinutes);
      triggers.push({
        meetingId: meeting.id,
        courseId: meeting.courseId,
        courseName: meeting.courseName,
        location: meeting.location?.trim() ? meeting.location.trim() : null,
        weekday: shifted.weekday,
        hour: shifted.hour,
        minute: shifted.minute,
        leadMinutes,
      });
    }
  }

  // Earliest in the week first, so a cap trims the tail rather than an
  // arbitrary slice of the middle.
  triggers.sort((a, b) =>
    a.weekday - b.weekday || a.hour - b.hour || a.minute - b.minute);

  const overflow = Math.max(0, triggers.length - maxSlots);
  return {
    triggers: overflow > 0 ? triggers.slice(0, maxSlots) : triggers,
    skippedNoTime,
    skippedNoDays,
    overflow,
  };
}

/** Whether a student has anything that could be reminded about at all. */
export function hasUsableMeetings(meetings: ClassMeetingRow[]): boolean {
  return meetings.some(
    (m) => parseTime(m.startTime) !== null
      && (m.daysOfWeek ?? []).some((d) => Number.isInteger(d) && d >= 0 && d <= 6),
  );
}

/**
 * The notification body.
 *
 * Location is included when it exists — 242 of 315 meetings in production have
 * one, and "Rm 204" is the difference between a reminder and a reminder you can
 * act on. Nothing else: no assignment titles, no schedule dump.
 */
export function classReminderBody(
  leadMinutes: number,
  location: string | null,
  locale: string,
): string {
  const spanish = locale === 'es';
  const when = leadMinutes === 0
    ? (spanish ? 'empieza ahora' : 'starts now')
    : leadMinutes % 60 === 0 && leadMinutes >= 60
      ? (spanish
          ? `empieza en ${leadMinutes / 60} ${leadMinutes === 60 ? 'hora' : 'horas'}`
          : `starts in ${leadMinutes / 60} ${leadMinutes === 60 ? 'hour' : 'hours'}`)
      : (spanish ? `empieza en ${leadMinutes} min` : `starts in ${leadMinutes} min`);
  return location ? `${when} · ${location}` : when;
}

/**
 * Is the term still running?
 *
 * A repeating trigger has no end date of its own — iOS will re-arm it forever —
 * so the only thing that stops a finished class from being announced every week
 * is this check, run whenever the app is opened. That is also why enabling class
 * reminders asks for a term end date when the semester does not have one: it is
 * the single piece of information the feature cannot work safely without.
 */
export function semesterStillRunning(
  endDate: string | null | undefined,
  today: Date,
): boolean {
  if (!endDate) return false;
  const [y, m, d] = endDate.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  const end = new Date(y, m - 1, d, 23, 59, 59);
  return end.getTime() >= today.getTime();
}
