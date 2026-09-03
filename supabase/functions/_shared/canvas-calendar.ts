const MAX_FEED_URL_LENGTH = 4096;

export interface CanvasCalendarCourse {
  id: string;
  name: string;
  code?: string;
  /**
   * What this course's dated work looks like, summarised while the feed is
   * already being walked.
   *
   * A calendar feed carries no term field — RFC 5545 has none and Canvas adds
   * none — so these three numbers are the only evidence available for deciding
   * which Semora semester a course belongs to. Semora used to file imports
   * under whichever semester happened to be selected in the app, which put a
   * real student's Fall term inside their Summer one. The dates were in the
   * feed the whole time; nothing was looking at them.
   */
  item_count: number;
  /** 'YYYY-MM-DD' of the earliest and latest dated item in this course. */
  first_due: string | null;
  last_due: string | null;
}

export interface CanvasCalendarAssignment {
  external_id: string;
  external_course_id: string;
  title: string;
  description?: string | null;
  type: 'assignment' | 'quiz' | 'exam' | 'project' | 'reading' | 'other';
  due_date?: string | null;
  due_time?: string | null;
  due_at?: string | null;
  external_updated_at?: string | null;
  url?: string | null;
}

export interface ParsedCanvasCalendar {
  courses: CanvasCalendarCourse[];
  assignments: CanvasCalendarAssignment[];
}

type IcsProperty = { params: Record<string, string>; value: string };

function blockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '::1' ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^fc/i.test(host) ||
    /^fd/i.test(host) ||
    /^fe[89ab]/i.test(host);
}

/**
 * Accept Canvas's copyable webcal link as well as its HTTPS equivalent. The
 * user-specific feed code is a bearer credential, so this returns a canonical
 * URL suitable for encrypted storage and never exposes it in an error.
 */
export function normalizeCanvasCalendarFeedUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Paste your Canvas Calendar Feed URL.');
  }
  let candidate = raw.trim();
  if (candidate.length > MAX_FEED_URL_LENGTH) throw new Error('The Canvas Calendar Feed URL is too long.');
  if (/^webcal:\/\//i.test(candidate)) candidate = `https://${candidate.slice(candidate.indexOf('//') + 2)}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Paste the complete Calendar Feed URL copied from Canvas.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Canvas Calendar Feed URLs must use secure HTTPS.');
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.includes(':')) {
    throw new Error('Canvas Calendar Feed URLs must use your school’s Canvas hostname.');
  }
  if (blockedHost(url.hostname)) throw new Error('Private network calendar feeds are not supported.');
  if (!/\/feeds\/calendars\/user_[^/]+\.ics$/i.test(url.pathname)) {
    throw new Error('This is not a Canvas user Calendar Feed URL. In Canvas, open Calendar → Calendar Feed and copy the URL shown there.');
  }
  url.hash = '';
  return url.toString();
}

export function canvasCalendarOrigin(raw: unknown): string {
  return new URL(normalizeCanvasCalendarFeedUrl(raw)).origin;
}

function unfoldIcs(value: string): string[] {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

function decodeIcsText(value: string): string {
  return value
    .replace(/\\[nN]/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function propertyFromLine(line: string): { name: string; property: IcsProperty } | null {
  const colon = line.indexOf(':');
  if (colon <= 0) return null;
  const left = line.slice(0, colon).split(';');
  const name = left.shift()?.toUpperCase();
  if (!name) return null;
  const params: Record<string, string> = {};
  for (const item of left) {
    const equals = item.indexOf('=');
    if (equals > 0) params[item.slice(0, equals).toUpperCase()] = item.slice(equals + 1).replace(/^"|"$/g, '');
  }
  return { name, property: { params, value: line.slice(colon + 1) } };
}

function first(properties: Map<string, IcsProperty[]>, name: string): IcsProperty | null {
  return properties.get(name)?.[0] ?? null;
}

function dateParts(property: IcsProperty): {
  due_date: string | null;
  due_time: string | null;
  due_at: string | null;
} | null {
  const value = property.value.trim();
  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly || property.params.VALUE?.toUpperCase() === 'DATE') {
    const match = dateOnly ?? value.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!match) return null;
    return { due_date: `${match[1]}-${match[2]}-${match[3]}`, due_time: null, due_at: null };
  }

  const utc = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utc) {
    const date = new Date(Date.UTC(
      Number(utc[1]), Number(utc[2]) - 1, Number(utc[3]),
      Number(utc[4]), Number(utc[5]), Number(utc[6]),
    ));
    if (!Number.isFinite(date.getTime())) return null;
    return {
      due_date: date.toISOString().slice(0, 10),
      due_time: date.toISOString().slice(11, 19),
      due_at: date.toISOString(),
    };
  }

  // Canvas currently emits UTC or all-day values. Handle a floating fallback
  // defensively without pretending it belongs to the Edge worker's timezone.
  const floating = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (!floating) return null;
  if ((property.params.TZID ?? '').toUpperCase() === 'UTC') {
    const date = new Date(Date.UTC(
      Number(floating[1]), Number(floating[2]) - 1, Number(floating[3]),
      Number(floating[4]), Number(floating[5]), Number(floating[6]),
    ));
    if (!Number.isFinite(date.getTime())) return null;
    return {
      due_date: date.toISOString().slice(0, 10),
      due_time: date.toISOString().slice(11, 19),
      due_at: date.toISOString(),
    };
  }
  return {
    due_date: `${floating[1]}-${floating[2]}-${floating[3]}`,
    due_time: `${floating[4]}:${floating[5]}:${floating[6]}`,
    due_at: null,
  };
}

function classify(title: string, uid: string): CanvasCalendarAssignment['type'] {
  const lower = title.toLowerCase();
  if (/\b(midterm|exam|test)\b/.test(lower) || /\bfinal\b(?!\s+(draft|paper|essay|project|report))/.test(lower)) return 'exam';
  if (/\bquiz\b/.test(lower)) return 'quiz';
  if (/\bproject\b/.test(lower)) return 'project';
  if (/\b(read|reading|chapter)\b/.test(lower)) return 'reading';
  if (/calendar-event/i.test(uid)) return 'other';
  return 'assignment';
}

function contextFromUrl(raw: string): { courseId: string; url: string } | null {
  const decoded = decodeIcsText(raw);
  try {
    const url = new URL(decoded);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const contexts = url.searchParams.get('include_contexts') ?? '';
    const match = contexts.split(',').map((item) => item.trim()).find((item) => /^course_\d+$/.test(item));
    return match ? { courseId: match.slice('course_'.length), url: url.toString() } : null;
  } catch {
    return null;
  }
}

/** Parse only the bounded Canvas fields Semora needs from an RFC 5545 feed. */
const DESCRIPTION_LIMIT = 10_000;

/**
 * Canvas assignment text, cut where a reader would not notice.
 *
 * `.slice(0, 10_000)` stopped mid-word. Three tasks in production sit at
 * exactly 10,000 characters, which means three students have an assignment
 * brief that ends in the middle of a sentence with nothing to say it was cut —
 * and the most common thing at the end of a long Canvas description is the
 * submission instructions.
 *
 * So the cut moves back to the last paragraph or sentence break in the final
 * stretch, and says what happened. The task already carries `lms_url`, which
 * is the whole point of the note: there IS somewhere to read the rest.
 *
 * The limit itself is unchanged. It is not the problem — 10,000 characters is
 * a generous brief, and raising it would mean carrying course-pack-sized text
 * into every sync payload for the handful of assignments that hit it.
 */
function truncateDescription(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.length <= DESCRIPTION_LIMIT) return text;

  const head = text.slice(0, DESCRIPTION_LIMIT);
  // Look for a clean break in the last 20% only. Further back than that and
  // the "truncation" would be throwing away text the reader could have had.
  const floor = Math.floor(DESCRIPTION_LIMIT * 0.8);

  // Each candidate carries how much of itself to KEEP. A sentence break keeps
  // its full stop — cutting at the index alone ends the text on "assignment"
  // where the author wrote "assignment.", which is a smaller version of the
  // same mid-word problem this function exists to fix.
  const candidates: { at: number; keep: number }[] = [
    { at: head.lastIndexOf('\n\n'), keep: 0 },
    { at: head.lastIndexOf('. '), keep: 1 },
    { at: head.lastIndexOf('\n'), keep: 0 },
  ];
  const best = candidates
    .filter((candidate) => candidate.at > floor)
    .sort((a, b) => b.at - a.at)[0];

  const cut = best ? head.slice(0, best.at + best.keep) : head;
  return `${cut.trimEnd()}\n\n[Shortened — open in Canvas for the full description.]`;
}

export function parseCanvasCalendarFeed(ics: string): ParsedCanvasCalendar {
  if (typeof ics !== 'string' || !/BEGIN:VCALENDAR/i.test(ics) || !/END:VCALENDAR/i.test(ics)) {
    throw new Error('Canvas returned an invalid calendar feed.');
  }
  const lines = unfoldIcs(ics);
  const courses = new Map<string, CanvasCalendarCourse>();
  const assignments = new Map<string, CanvasCalendarAssignment>();
  let eventLines: string[] | null = null;

  for (const line of lines) {
    if (line.toUpperCase() === 'BEGIN:VEVENT') {
      eventLines = [];
      continue;
    }
    if (line.toUpperCase() !== 'END:VEVENT') {
      if (eventLines) eventLines.push(line);
      continue;
    }
    if (!eventLines) continue;

    const properties = new Map<string, IcsProperty[]>();
    for (const eventLine of eventLines) {
      const parsed = propertyFromLine(eventLine);
      if (!parsed) continue;
      properties.set(parsed.name, [...(properties.get(parsed.name) ?? []), parsed.property]);
    }
    eventLines = null;
    if (decodeIcsText(first(properties, 'STATUS')?.value ?? '').toUpperCase() === 'CANCELLED') continue;

    const summary = decodeIcsText(first(properties, 'SUMMARY')?.value ?? '').slice(0, 300);
    const uid = decodeIcsText(first(properties, 'UID')?.value ?? '').slice(0, 500);
    const start = first(properties, 'DTSTART');
    const source = first(properties, 'URL');
    if (!summary || !uid || !start || !source) continue;
    const context = contextFromUrl(source.value);
    const due = dateParts(start);
    if (!context || !due) continue;

    const codeMatch = summary.match(/\s+\[([^\]]+)\]\s*$/);
    const courseCode = decodeIcsText(codeMatch?.[1] ?? '').slice(0, 120);
    const title = (codeMatch ? summary.slice(0, codeMatch.index).trim() : summary).slice(0, 240);
    if (!title) continue;
    if (!courses.has(context.courseId)) {
      courses.set(context.courseId, {
        id: context.courseId,
        name: courseCode || `Canvas course ${context.courseId}`,
        code: courseCode || undefined,
        item_count: 0,
        first_due: null,
        last_due: null,
      });
    }

    const stamp = first(properties, 'LAST-MODIFIED') ?? first(properties, 'DTSTAMP');
    const updated = stamp ? dateParts(stamp)?.due_at ?? null : null;
    const key = `${context.courseId}:${uid}`;
    const known = courses.get(context.courseId)!;
    // Guarded on the key, not just on due_date: a feed can repeat a UID, and
    // counting it twice would inflate the number shown to the student before
    // they decide whether to import.
    const dueOn = due.due_date;
    if (!assignments.has(key) && dueOn) {
      known.item_count += 1;
      if (!known.first_due || dueOn < known.first_due) known.first_due = dueOn;
      if (!known.last_due || dueOn > known.last_due) known.last_due = dueOn;
    }
    assignments.set(key, {
      external_id: uid,
      external_course_id: context.courseId,
      title,
      description: truncateDescription(decodeIcsText(first(properties, 'DESCRIPTION')?.value ?? '')),
      type: classify(title, uid),
      ...due,
      external_updated_at: updated,
      url: context.url,
    });
    if (assignments.size >= 1000) break;
  }

  return {
    courses: [...courses.values()].sort((left, right) => left.name.localeCompare(right.name)),
    assignments: [...assignments.values()],
  };
}
