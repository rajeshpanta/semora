/**
 * Moodle's per-user calendar export, read the way Canvas's is.
 *
 * MOODLE_PLAN.md Phase 1.3-1.6. This sits beside canvas-calendar.ts and reuses
 * its RFC 5545 primitives unchanged; what differs is everything Moodle does
 * differently, and all of it was confirmed against a live Moodle 5.0 and
 * Moodle's own source on 2026-09-19. See fixtures/moodle/README.md for the
 * evidence behind every rule here.
 *
 * WHAT MOODLE DOES DIFFERENTLY
 *
 * 1. There is NO `URL` property on any event. canvas-calendar.ts requires one
 *    and skips the event otherwise, which is why the shared parser would
 *    return zero assignments for a Moodle feed. Tasks link to the calendar day
 *    view instead, which is a real page.
 *
 * 2. The only course identity is `CATEGORIES`, which holds the course
 *    SHORTNAME as text. There is no numeric id anywhere in the feed, so a
 *    rename reads as a new course (mitigated server-side by re-keying on the
 *    event ids the courses share).
 *
 * 3. Two fetches, not one. `preset_what=courses` gives the base events with
 *    base dates. `preset_what=all` adds the student's own events, which is
 *    where a per-user or per-group OVERRIDE and an assignment EXTENSION live,
 *    and also where the synthetic "Site events" pseudo-course appears. Taking
 *    identity from `courses` and dates from `all` is the only way to get the
 *    student's real date while keeping a stable key.
 *
 * 4. Event names are written in the TEACHER's language when the activity is
 *    saved, and the placeholder is not always first: English is '{a} is due',
 *    Spanish is 'Vencimiento de {a}'. Hence the generated prefix/suffix table
 *    in moodle-event-names.ts rather than a list of English suffixes.
 *
 * 5. Every failure is HTTP 200 with a plain body. A bad token returns 200 and
 *    'Invalid authentication'; export switched off returns 200 and 'no export'.
 *    So a 4xx is NEVER Moodle rejecting the link — it is a firewall, an SSO
 *    gateway or maintenance, and treating it as expiry would purge a
 *    student's credential over a transient block. A 429 or a 5xx is not even
 *    a block: it is a school asking Semora to come back later, or a server
 *    having a bad minute, and it is filed as temporary so the student is not
 *    sent off to scan a syllabus.
 */
import {
  type CanvasCalendarAssignment,
  type CanvasCalendarCourse,
  type IcsProperty,
  type ParsedCanvasCalendar,
  blockedHost,
  classify,
  dateParts,
  decodeIcsText,
  first,
  propertyFromLine,
  truncateDescription,
  unfoldIcs,
} from './canvas-calendar.ts';
import {
  MOODLE_EVENT_PATTERNS,
  MOODLE_SITE_EVENT_NAMES,
  type MoodleEventKind,
} from './moodle-event-names.ts';

const MAX_FEED_URL_LENGTH = 4096;
const MAX_ITEMS = 5000;
/** Moodle imposes no event cap of its own ($limitnum = 0), so this is the ceiling. */
export const MAX_FEED_BYTES = 5 * 1024 * 1024;

export type MoodleFeedWhat = 'courses' | 'all';
export type MoodleFeedTime = 'custom' | 'recentupcoming';

export interface ParsedMoodleCalendar extends ParsedCanvasCalendar {
  /** Days from today to the furthest event, over the RAW union before any drop. */
  horizon_days: number;
  /** How many tasks took a date from an override or an extension. */
  overrides_applied: number;
  /**
   * Course keys seen only under `all`, never under `courses`.
   *
   * These are kept as courses on purpose — a course whose only calendar
   * entries are group events is real — but they are reported so a school whose
   * language is missing from the site-events table can be spotted before a
   * pseudo-course leaks in as a class.
   */
  unmatched_categories: string[];
}

// ── the link ───────────────────────────────────────────────────────────────

/**
 * Canonicalise a pasted Moodle export link.
 *
 * Keeps ONLY `userid`/`username` and `authtoken`. Everything else in the query
 * is dropped, so nothing a student pasted can be forwarded to their school, and
 * the presets are set by us at fetch time (the token signs the user's password
 * hash and a site salt, never the query, so rewriting them is safe and is what
 * rescues a student who left "This week" selected).
 *
 * Refusal messages never contain the input: the link is a bearer credential.
 */
export function normalizeMoodleCalendarFeedUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('Paste your Moodle calendar link.');
  }
  let candidate = raw.trim();
  // A link pasted inside a sentence, or with quotes around it.
  const token = candidate.match(/(?:webcal:\/\/|https?:\/\/)?[^\s"'<>]*calendar\/export_execute\.php[^\s"'<>]*/i);
  if (token) candidate = token[0];
  if (candidate.length > MAX_FEED_URL_LENGTH) throw new Error('The Moodle calendar link is too long.');
  if (/^webcal:\/\//i.test(candidate)) candidate = `https://${candidate.slice(candidate.indexOf('//') + 2)}`;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('Paste the complete calendar URL copied from Moodle.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Moodle calendar links must use secure HTTPS.');
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.includes(':')) {
    throw new Error('Moodle calendar links must use your school’s Moodle web address.');
  }
  if (blockedHost(url.hostname)) throw new Error('Private network calendar feeds are not supported.');

  // Named wrong pages, so the student is told what they actually copied.
  if (/\/login\//i.test(url.pathname)) {
    throw new Error('That is the Moodle sign-in page, not the calendar link.');
  }
  if (/\/calendar\/export\.php$/i.test(url.pathname)) {
    throw new Error('That is the Export page — tap Get calendar URL, then Copy URL.');
  }
  if (/icalexport\.ics$/i.test(url.pathname)) {
    throw new Error('That is a downloaded file, not the link.');
  }
  if (!/\/calendar\/export_execute\.php$/i.test(url.pathname)) {
    throw new Error(
      'This is not a Moodle calendar export link. In Moodle open Calendar → Import or export calendars → Export calendar → Get calendar URL, then copy the URL shown.',
    );
  }

  const authtoken = url.searchParams.get('authtoken') ?? '';
  const userid = url.searchParams.get('userid') ?? '';
  const username = url.searchParams.get('username') ?? '';
  if (!/^[0-9a-f]{40}$/i.test(authtoken) || (!/^\d{1,12}$/.test(userid) && !username)) {
    throw new Error(
      'This is not a Moodle calendar export link. In Moodle open Calendar → Import or export calendars → Export calendar → Get calendar URL, then copy the URL shown.',
    );
  }

  const kept = new URLSearchParams();
  if (/^\d{1,12}$/.test(userid)) kept.set('userid', userid);
  else kept.set('username', username.slice(0, 120));
  kept.set('authtoken', authtoken.toLowerCase());
  url.search = kept.toString();
  url.hash = '';
  return url.toString();
}

/** The site root: everything before `/calendar/export_execute.php`, path included. */
export function moodleCalendarOrigin(raw: unknown): string {
  const url = new URL(normalizeMoodleCalendarFeedUrl(raw));
  return `${url.origin}${url.pathname.replace(/\/calendar\/export_execute\.php$/i, '')}`;
}

/** One fetchable URL for a given preset pair. */
export function moodleFeedUrlFor(
  canonical: string,
  options: { what: MoodleFeedWhat; time: MoodleFeedTime },
): string {
  const url = new URL(canonical);
  url.searchParams.set('preset_what', options.what);
  url.searchParams.set('preset_time', options.time);
  return url.toString();
}

/** Never let a link reach a log, an error string or analytics with its token intact. */
export function redactMoodleFeedUrl(value: string): string {
  return value
    .replace(/authtoken=[0-9a-f]+/gi, 'authtoken=…')
    .replace(/userid=\d+/gi, 'userid=…')
    .replace(/username=[^&\s]+/gi, 'username=…');
}

// ── what came back ─────────────────────────────────────────────────────────

export type MoodleBodyVerdict = 'ok' | 'invalid_auth' | 'export_disabled' | 'busy' | 'blocked' | 'unreadable';

const CHALLENGE_PAGE = /just a moment|cf-mitigated|access denied/i;

/**
 * Decide what a response body is, by its TEXT.
 *
 * Deliberately ignores the content type, and the status decides nothing that
 * could cost a credential. Moodle answers a bad token with HTTP 200 and
 * `text/html` carrying the words 'Invalid authentication', so a content-type
 * branch would misfile every expired link as transient, and a status branch
 * would misfile every firewall challenge as an expired link and purge the
 * student's credential.
 *
 * The status is read for one question only: temporary or not. A 429 is a rate
 * limit by definition, whatever page the gateway dressed it in (Cloudflare's
 * rate-limit page is titled "Access denied"). A 5xx is the server failing —
 * maintenance (503), an overloaded or timed-out gateway (502, 504), a crash
 * (500) — unless its body is a challenge, because a firewall in under-attack
 * mode also answers 503 and that one does not clear by waiting. Filing any of
 * them as 'blocked' told the student their school refuses Semora and offered
 * them a syllabus scan instead, over something that clears in minutes.
 */
export function classifyMoodleFeedBody(
  status: number,
  _contentType: string | null,
  body: string,
): MoodleBodyVerdict {
  const head = body.slice(0, 400);
  if (/BEGIN:VCALENDAR/i.test(body)) return 'ok';
  if (/^\s*Invalid authentication/i.test(head)) return 'invalid_auth';
  if (/^\s*no export/i.test(head)) return 'export_disabled';
  if (status === 429) return 'busy';
  if (status >= 500 && !CHALLENGE_PAGE.test(head)) return 'busy';
  // A challenge page, an SSO gateway, or a plain 4xx.
  if (status >= 400 || /<html/i.test(head) || CHALLENGE_PAGE.test(head)) return 'blocked';
  return 'unreadable';
}

// ── names ──────────────────────────────────────────────────────────────────

/**
 * Undo Moodle's HTML encoding of text it puts in the feed.
 *
 * MEASURED, not guessed. A real event created on a live Moodle 5.0 named
 * "Tom & Jerry essay" comes back as:
 *
 *   SUMMARY:Tom &amp\; Jerry essay
 *
 * Moodle runs every name through format_string(), which HTML-escapes it, and
 * the iCal serialiser then escapes the resulting semicolon. decodeIcsText
 * handles the second layer; without this, the first survives and the student
 * reads "Tom &amp; Jerry essay" as their task title. The same applies to
 * CATEGORIES, so a course really called "Class & Conflict" becomes a Semora
 * course named "Class &amp; Conflict" — and, because the shortname IS the
 * course key, it would stay that way for ever.
 *
 * Only the five entities htmlspecialchars() produces, plus numeric ones.
 * Deliberately not a general HTML parser: this is undoing one known encoder,
 * and anything broader risks mangling text a student actually typed.
 */
export function decodeMoodleEntities(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => {
      const point = Number(code);
      return Number.isFinite(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const point = Number.parseInt(hex, 16);
      return Number.isFinite(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : _;
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    // Last, so "&amp;lt;" decodes to "&lt;" and not to "<".
    .replace(/&amp;/g, '&');
}

interface StrippedName {
  base: string;
  kind: MoodleEventKind | null;
  /**
   * The Moodle activity module the matched pattern belongs to — `quiz`,
   * `assign`, `lesson`, `forum` and so on. This is the one piece of type
   * information in a Moodle feed that is not in a human language, and it is
   * therefore the only one that is as true in Catalan as in English.
   */
  comp: string | null;
}

/**
 * Take Moodle's decoration off an event name.
 *
 * Longest pattern first, so '{a} is due to be graded' wins over '{a} is due'.
 * Both ends are stripped because the placeholder is not always at the start:
 * Spanish writes 'Vencimiento de {a}'.
 */
export function stripMoodleEventName(summary: string): StrippedName {
  for (const pattern of MOODLE_EVENT_PATTERNS) {
    const { prefix, suffix } = pattern;
    if (prefix && !summary.startsWith(prefix)) continue;
    if (suffix && !summary.endsWith(suffix)) continue;
    const base = summary.slice(prefix.length, suffix ? summary.length - suffix.length : undefined).trim();
    if (!base) continue;
    return { base, kind: pattern.kind, comp: pattern.comp };
  }
  return { base: summary.trim(), kind: null, comp: null };
}

/**
 * What kind of work this is, in a way that survives translation.
 *
 * The shared `classify()` reads English keywords out of the title, which is
 * the right first pass — a teacher who writes "Midterm" means it, and no
 * module type overrules that. But it sits directly downstream of a 296-pattern
 * table built from twelve language packs, so a Spanish school's quiz was
 * recognised as a quiz EVENT and then filed as a generic assignment, which is
 * the boast and the defect in the same feature.
 *
 * Two things are added here and neither touches Canvas:
 *
 *   the module    `comp` comes off the matched pattern and is a Moodle
 *                 identifier, not a word. A `quiz` activity is a quiz in every
 *                 language, and `lesson`/`scorm`/`choice`/`forum` are not
 *                 assignments in any of them.
 *   Spanish       the one other language Semora ships its own interface in,
 *                 so a Spanish-speaking student is the one who would otherwise
 *                 notice every exam mislabelled.
 */
const SPANISH_EXAM = /\b(examen|examenes|ex[aá]menes)\b/i;
// "Parcial" and "final" name an exam on their own ("Primer parcial", "Final de
// Química") but are also plain adjectives: "Entrega parcial" is a partial
// hand-in, and English "Final Project" / "Final Paper" / "Final Report" are
// work. So they count only when the title names no piece of work — which is
// also the guard Canvas's classify() keeps for "final draft/paper/project".
const EXPLICIT_EXAM = /\b(exams?|examinations?|midterms?|mid-terms?)\b/i;
const SPANISH_MIDTERM_OR_FINAL = /\b(parcial(?:es)?|final(?:es)?)\b/i;
const WORK_NOUNS = /\b(projects?|papers?|reports?|essays?|drafts?|presentations?|portfolios?|assignments?|homework|proyectos?|trabajos?|informes?|ensayos?|entregas?|tareas?|presentaci[oó]n(?:es)?|portafolios?)\b/i;
const SPANISH_QUIZ = /\b(cuestionario|prueba|test)\b/i;

function moodleType(
  title: string,
  comp: string | null,
  uid: string,
): CanvasCalendarAssignment['type'] {
  const byTitle = classify(title, uid);
  // A named exam beats everything, including the module it lives in: a quiz
  // activity called "Midterm" is a midterm. classify() also reads a bare
  // "final" as an exam, guarding only the English work words, so a title
  // that names a piece of work ("Proyecto final", "Trabajo final") is an exam
  // only when it says exam outright.
  const namesWork = WORK_NOUNS.test(title);
  if (EXPLICIT_EXAM.test(title) || SPANISH_EXAM.test(title)) return 'exam';
  if (!namesWork && (byTitle === 'exam' || SPANISH_MIDTERM_OR_FINAL.test(title))) return 'exam';
  if (comp === 'quiz') return 'quiz';
  if (byTitle === 'exam') return SPANISH_PROJECT.test(title) ? 'project' : 'assignment';
  if (byTitle !== 'assignment') return byTitle;
  if (SPANISH_QUIZ.test(title)) return 'quiz';
  // Activities that are not work handed in. Left as 'other' so they sort and
  // colour apart from a real deadline.
  if (comp === 'choice' || comp === 'forum' || comp === 'feedback') return 'other';
  return byTitle;
}

/**
 * The type of an event no name pattern recognised.
 *
 * Every activity Moodle generates an event for has a pattern, so an event with
 * none was written by a person: a lecture, an attendance session, an office
 * hour, a meeting — or a piece of work the teacher typed in by hand ("Essay 2
 * draft", "Reading: chapter 4", "Group project"). Those used to fall through
 * to 'assignment' (a lecture listed as homework, due when it ended), and then
 * all of them to 'other' (a hand-typed essay filed beside the lectures).
 * Canvas reads the same kind of hand-made calendar event by its TITLE
 * (canvas-calendar.ts classify): an exam, quiz, project or reading keeps that
 * type, and only what names none of them is 'other'. This does the same, with
 * two additions Canvas does not need:
 *
 *   sessions   a class, meeting or lecture is 'other' even when its title
 *              names work ("Lecture 5: Chapter 3", "Office hours: homework
 *              help"). It is something to attend, not something due. Checked
 *              after exam and quiz, which keep their type as they always have.
 *   homework   Canvas knows its hand-made events are not assignments (their
 *              UID says calendar-event). A Moodle one whose title says
 *              "homework", "essay" or "due" IS one, so it is filed as an
 *              assignment rather than falling through to 'other'.
 *
 * And the Spanish for each, the one other language Semora ships in.
 *
 * A title that names a quiz or an exam keeps that type, because the one
 * patternless event that IS work is a pre-3.3 quiz: a single event named only
 * with the quiz's own name. Anything that names none of these is still
 * 'other'.
 */
const SESSION_WORDS = /\b(lectures?|meetings?|office hours?|seminars?|tutorials?|webinars?|attendance|sessions?|class(?:es)? (?:session|meeting)s?|no class|reuni[oó]n(?:es)?|tutor[ií]as?|asistencia|seminarios?|sesi[oó]n(?:es)?|conferencias?)\b/i;
const SPANISH_PROJECT = /\bproyectos?\b/i;
const SPANISH_READING = /\b(lecturas?|cap[ií]tulos?|leer)\b/i;
const HOMEWORK_WORDS = /\b(homework|hw\d*|assignments?|essays?|papers?|problem sets?|psets?|worksheets?|reports?|submissions?|submit|deliverables?|due|deadlines?|tareas?|ensayos?|entregas?|entregables?|informes?|trabajos?)\b/i;

// Words that say something is handed in by a date. They outrank the session
// words: "Tutorial 3 worksheet due" and "Seminar paper due" are homework in the
// UK and Australia, where a tutorial is often the work itself.
const DUE_WORDS = /\b(due|submit|submissions?|deadlines?|hand in|entrega(?:r)?|vence|vencimiento|fecha l[ií]mite)\b/i;

function unmatchedType(title: string, uid: string): CanvasCalendarAssignment['type'] {
  const type = moodleType(title, null, uid);
  if (type === 'quiz' || type === 'exam') return type;
  if (DUE_WORDS.test(title)) {
    if (type === 'project' || SPANISH_PROJECT.test(title)) return 'project';
    if (type === 'reading' || SPANISH_READING.test(title)) return 'reading';
    return 'assignment';
  }
  if (SESSION_WORDS.test(title)) return 'other';
  if (type === 'project' || SPANISH_PROJECT.test(title)) return 'project';
  if (type === 'reading' || SPANISH_READING.test(title)) return 'reading';
  if (HOMEWORK_WORDS.test(title)) return 'assignment';
  return 'other';
}

/** A patternless event at least this long is a window, not a sitting. */
const WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * An event time as epoch milliseconds, or null for a date with no time — an
 * all-day event, whose DTEND is the day after, so its end is never a due date.
 */
function instantOf(property: IcsProperty): number | null {
  const parts = dateParts(property);
  if (!parts?.due_date || !parts.due_time) return null;
  // A floating time has no zone, but both ends of one event share it, so
  // reading both as UTC still measures the length correctly.
  const at = Date.parse(parts.due_at ?? `${parts.due_date}T${parts.due_time}Z`);
  return Number.isFinite(at) ? at : null;
}

/**
 * Whether an event no name pattern recognised is due when it ENDS.
 *
 * Decided by how long it lasts, not by what it is called:
 *
 *   window    due at its close. A pre-3.3 quiz (one event from open to
 *             close), a take-home, a submission window a teacher typed in.
 *   sitting   due at its start. A lecture, a meeting, a timed exam. Dating a
 *             09:00–12:00 'Final Exam' at noon fired its two-hour last call an
 *             hour after the exam began.
 *
 * Twelve hours tells them apart: no class, meeting or exam sitting runs that
 * long. A quiz is a window whatever its length, because the only quiz with no
 * pattern is a pre-3.3 one. Moodle writes every event as a UTC date-time
 * (export_execute.php never emits an all-day event), so there is always a
 * length to measure.
 */
function closesAtEnd(event: RawEvent, type: CanvasCalendarAssignment['type']): boolean {
  if (!event.end) return false;
  const start = instantOf(event.start);
  const end = instantOf(event.end);
  if (start === null || end === null || end <= start) return false;
  return type === 'quiz' || end - start >= WINDOW_MS;
}

function isSiteEventCategory(category: string): boolean {
  return MOODLE_SITE_EVENT_NAMES.some((name) => name.toLowerCase() === category.toLowerCase());
}

// ── parsing ────────────────────────────────────────────────────────────────

interface RawEvent {
  uid: string;
  summary: string;
  description: string;
  category: string | null;
  start: IcsProperty;
  end: IcsProperty | null;
  lastModified: string | null;
  cancelled: boolean;
}

function readEvents(ics: string): RawEvent[] {
  if (typeof ics !== 'string' || !/BEGIN:VCALENDAR/i.test(ics) || !/END:VCALENDAR/i.test(ics)) {
    throw new Error('Moodle returned an invalid calendar feed.');
  }
  const out: RawEvent[] = [];
  let lines: string[] | null = null;
  for (const line of unfoldIcs(ics)) {
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') { lines = []; continue; }
    if (upper !== 'END:VEVENT') { if (lines) lines.push(line); continue; }
    if (!lines) continue;

    const properties = new Map<string, IcsProperty[]>();
    for (const eventLine of lines) {
      const parsed = propertyFromLine(eventLine);
      if (!parsed) continue;
      properties.set(parsed.name, [...(properties.get(parsed.name) ?? []), parsed.property]);
    }
    lines = null;

    const summary = decodeMoodleEntities(decodeIcsText(first(properties, 'SUMMARY')?.value ?? '')).slice(0, 300);
    const uid = decodeIcsText(first(properties, 'UID')?.value ?? '').slice(0, 500);
    const start = first(properties, 'DTSTART');
    if (!summary || !uid || !start) continue;

    const rawCategory = first(properties, 'CATEGORIES')?.value;
    const stamp = first(properties, 'LAST-MODIFIED') ?? first(properties, 'DTSTAMP');
    out.push({
      uid,
      summary,
      description: decodeMoodleEntities(decodeIcsText(first(properties, 'DESCRIPTION')?.value ?? '')),
      category: rawCategory === undefined
        ? null
        : decodeMoodleEntities(decodeIcsText(rawCategory)).slice(0, 120),
      start,
      end: first(properties, 'DTEND'),
      lastModified: stamp ? dateParts(stamp)?.due_at ?? null : null,
      cancelled: decodeIcsText(first(properties, 'STATUS')?.value ?? '').toUpperCase() === 'CANCELLED',
    });
  }
  return out;
}

/** When a dated event falls, for picking the latest of several. Undated sorts first. */
function sortableDate(event: RawEvent): string {
  const due = dateParts(event.start);
  if (!due?.due_date) return '';
  return due.due_at ?? `${due.due_date}T${due.due_time ?? '00:00:00'}`;
}

/**
 * The override event that holds the student's real date for `base`, or null.
 *
 * A quiz override is TWO events, because Moodle wraps the override's name in
 * the same '{$a} opens' / '{$a} closes' strings as the quiz itself:
 *
 *   Quiz 3 closes               the base, suppressed under `all`
 *   Quiz 3 - Section A opens    the override's opening
 *   Quiz 3 - Section A closes   the override's close — the real deadline
 *
 * The first version took whichever event starting with 'Quiz 3 - ' came first
 * in the feed, which filed a group's quiz as due when it OPENED. So:
 *
 *   kind       the candidate's own pattern must be the base's, or none at all
 *              (an assignment override reads '<name> - Override (Due date)',
 *              which no pattern names). One whose pattern says something
 *              else — an opening — is never the date for a close.
 *   activity   a candidate that is itself a real activity's event (its UID is
 *              in `courses`), or whose name belongs to a longer activity name
 *              ('Quiz 3 - Practice' is a sibling of 'Quiz 3', not an override
 *              of it), is not this base's override.
 *   course     a candidate that carries the course (CATEGORIES) beats one
 *              that carries none. A student's OWN calendar entry has no
 *              course, and one named 'Essay 1 - study group' reads exactly
 *              like an override of 'Essay 1' that no pattern names — so the
 *              latest-date rule below filed the study group as the essay's
 *              deadline whenever it fell later. An uncategorised candidate is
 *              used only when there is nothing else, because a USER override
 *              can genuinely arrive without a course.
 *   latest     of what is left, the latest date. Of an opening and a close
 *              whose kinds could not be read, the close is the later. (Two
 *              group overrides of the same close should never both arrive —
 *              Moodle's priority keeps one — and if they do, the later is the
 *              one a quiz honours for a student in both groups.)
 *
 * Matched on '<activity> - ' because both the word Moodle uses and the '(Due
 * date)' parenthetical are localised; the activity name is not. Tested against
 * the stripped name as well as the raw summary, because a language that puts
 * its word first ('Se cierra Cuestionario 3 - Grupo A') hides the activity
 * name behind it. And a USER override in such a language is decorated twice —
 * 'Se cierra Cuestionario 3 - Excepción' strips first as an override, leaving
 * 'Se cierra Cuestionario 3' — so that layer is peeled once more to reach both
 * the name and whether it is the opening or the close.
 */
function findOverride(
  base: RawEvent,
  baseName: string,
  baseKind: MoodleEventKind | null,
  allEvents: RawEvent[],
  known: {
    baseUids: Set<string>;
    namesByCourse: Map<string, string[]>;
    allNames: string[];
    strip: (summary: string) => StrippedName;
  },
): RawEvent | null {
  const sameKind: RawEvent[] = [];
  const unknownKind: RawEvent[] = [];
  for (const event of allEvents) {
    if (event.cancelled || known.baseUids.has(event.uid)) continue;
    if (event.category !== null && event.category !== base.category) continue;
    // Every reading below is a piece of the summary, so this cheap test loses
    // nothing and spares the pattern table for events that cannot match.
    if (!event.summary.includes(baseName)) continue;

    const outer = known.strip(event.summary);
    const inner = outer.kind === 'override' ? known.strip(outer.base) : null;
    const readings = [event.summary, outer.base, ...(inner ? [inner.base] : [])];
    const belongsTo = (name: string) =>
      readings.some((reading) => reading.startsWith(`${name} - `)) ||
      (inner !== null && (outer.base === name || inner.base === name));
    if (!belongsTo(baseName)) continue;
    // A category-less override could belong to any course, so every course's
    // names are candidates for the longer owner.
    const names = event.category === null ? known.allNames : known.namesByCourse.get(event.category) ?? [];
    if (names.some((name) => name.length > baseName.length && belongsTo(name))) continue;

    const kind = inner ? inner.kind : outer.kind;
    if (kind === baseKind) sameKind.push(event);
    else if (kind === null || kind === 'override') unknownKind.push(event);
  }

  const kindPool = sameKind.length ? sameKind : unknownKind;
  // Only this course's events survive the filter above with a category, so
  // "has a category" here means "is from this course".
  const inCourse = kindPool.filter((event) => event.category !== null);
  const pool = inCourse.length ? inCourse : kindPool;
  let latest: RawEvent | null = null;
  for (const event of pool) {
    if (!latest || sortableDate(event) > sortableDate(latest)) latest = event;
  }
  return latest;
}

/** Days between today and a 'YYYY-MM-DD', negative in the past. */
function daysFromToday(date: string, today: Date): number {
  const [y, m, d] = date.split('-').map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((then - now) / 86_400_000);
}

/**
 * Turn the two feeds into the same shape Canvas produces.
 *
 * `coursesIcs` supplies identity — the course key and the event UID — and
 * `allIcs` supplies the student's real dates. See the file header for why.
 */
export function parseMoodleCalendarFeed(
  coursesIcs: string,
  allIcs: string,
  options: { wwwroot: string; today?: Date },
): ParsedMoodleCalendar {
  const today = options.today ?? new Date();
  const courseEvents = readEvents(coursesIcs);
  const allEvents = readEvents(allIcs);

  // Horizon over the RAW union, before anything is dropped: a student whose
  // only far-out item is a skipped 'opens' event still has that reach, and
  // shortening the window here would shorten what may later be reconciled.
  let horizon = 0;
  for (const event of [...courseEvents, ...allEvents]) {
    const due = dateParts(event.start)?.due_date;
    if (due) horizon = Math.max(horizon, daysFromToday(due, today));
  }

  const courseKeys = new Set<string>();
  for (const event of courseEvents) if (event.category) courseKeys.add(event.category);

  const allByUid = new Map<string, RawEvent>();
  for (const event of allEvents) allByUid.set(event.uid, event);

  // Events in `all` that carry no course: a user override, an extension, or a
  // personal reminder. Kept aside rather than dropped, because two of those
  // three hold the student's real date.
  const personal = allEvents.filter((event) => event.category === null && !event.cancelled);

  // The event whose date a base takes instead of its own: an override or an
  // extension. The whole event, not only its start, so a pre-3.3 quiz's
  // override is read by the same open-to-close rule as the quiz itself.
  const dateFor = new Map<string, RawEvent>();
  let overridesApplied = 0;

  // The searches below ask about the same summaries once per base, and each
  // question walks a ~300-pattern table. Stripped once per summary instead,
  // which is what keeps a year of a large school's calendar well inside an
  // edge function's CPU budget.
  const stripCache = new Map<string, StrippedName>();
  const strip = (summary: string): StrippedName => {
    let stripped = stripCache.get(summary);
    if (!stripped) {
      stripped = stripMoodleEventName(summary);
      stripCache.set(summary, stripped);
    }
    return stripped;
  };

  // Every real activity, by UID and by name, so an override search can tell a
  // sibling activity from an override of this one.
  const namesByCourse = new Map<string, string[]>();
  for (const event of courseEvents) {
    if (!event.category) continue;
    const names = namesByCourse.get(event.category) ?? [];
    names.push(strip(event.summary).base);
    namesByCourse.set(event.category, names);
  }
  const known = {
    baseUids: new Set(courseEvents.map((event) => event.uid)),
    namesByCourse,
    allNames: [...new Set([...namesByCourse.values()].flat())],
    strip,
  };

  for (const base of courseEvents) {
    if (base.cancelled || !base.category) continue;
    const { base: baseName, kind: baseKind } = strip(base.summary);
    // Never a task (see below), so there is no date to fix and nothing to count.
    if (baseKind === 'open' || baseKind === 'grading' || baseKind === 'override' || baseKind === 'extend') continue;

    // An OVERRIDE suppresses the base under `all` (its priority beats NULL), so
    // a base missing from `all` means the student holds one.
    if (!allByUid.has(base.uid)) {
      const override = findOverride(base, baseName, baseKind, allEvents, known);
      if (override) {
        dateFor.set(base.uid, override);
        overridesApplied += 1;
      }
      continue;
    }

    // An EXTENSION does NOT suppress the base (both priorities are NULL), so
    // base and extension arrive together and the extension holds the student's
    // real date.
    //
    // MEASURED, and it contradicts the source. mod/assign/locallib.php sets
    // `courseid = 0` on the extension event, which by export_execute.php's own
    // rule should mean no CATEGORIES. A real extension granted on a live
    // Moodle 5.0 came back WITH one:
    //
    //   UID:597@…  SUMMARY:… is due (extension)  CATEGORIES:Celebrating Cultures
    //
    // So it is searched for across every event, not only the category-less
    // ones. Matching on the stripped activity name is what makes that safe:
    // the name is the same whichever way the course arrives. Had this stayed
    // keyed on "no category", a student granted an extension would have gone
    // on seeing their ORIGINAL deadline — the worst failure this road has,
    // because a wrong date is trusted in a way a missing one is not.
    const extension = allEvents.find((event) => {
      if (event.cancelled || event.uid === base.uid) return false;
      if (event.category !== null && event.category !== base.category) return false;
      if (!event.summary.includes(baseName)) return false;
      const stripped = strip(event.summary);
      return stripped.kind === 'extend' && stripped.base === baseName;
    });
    if (extension) {
      dateFor.set(base.uid, extension);
      overridesApplied += 1;
    }
  }

  const courses = new Map<string, CanvasCalendarCourse>();
  const assignments = new Map<string, CanvasCalendarAssignment>();
  const unmatched = new Set<string>();

  // `courses` first so identity is fixed, then anything in `all` that belongs
  // to a course we have not seen (a course whose only entries are group
  // events, which is real, or a site pseudo-course, which is not).
  const considered: RawEvent[] = [...courseEvents];
  for (const event of allEvents) {
    if (!event.category || courseKeys.has(event.category)) continue;
    if (isSiteEventCategory(event.category)) continue;
    unmatched.add(event.category);
    considered.push(event);
  }

  for (const event of considered) {
    if (event.cancelled || !event.category) continue;
    if (isSiteEventCategory(event.category)) continue;
    if (assignments.size >= MAX_ITEMS) break;

    const stripped = strip(event.summary);
    // An opening is not work due, and a grading deadline is the teacher's.
    if (stripped.kind === 'open' || stripped.kind === 'grading') continue;
    // An override or extension event is never a task of its own: its UID churns
    // when the override is lifted. Its date has already been folded into the base.
    if (stripped.kind === 'override' || stripped.kind === 'extend') continue;

    const title = (stripped.base || event.summary).slice(0, 240);
    const type: CanvasCalendarAssignment['type'] =
      stripped.kind === 'expect' ? 'other'
      : stripped.kind === null ? unmatchedType(title, event.uid)
      : moodleType(title, stripped.comp, event.uid);

    // A pre-3.3 quiz is one event spanning open to close, with no name pattern
    // at all. Its due is the END, not the start — and so is any other
    // patternless window, while a lecture or an exam sitting happens when it
    // starts (see closesAtEnd).
    const dated = dateFor.get(event.uid) ?? event;
    const atEnd = stripped.kind === null && closesAtEnd(dated, type);
    const due = dateParts(atEnd && dated.end ? dated.end : dated.start);
    if (!due) continue;

    const key = `${event.category}:${event.uid}`;
    if (!courses.has(event.category)) {
      courses.set(event.category, {
        id: event.category,
        name: event.category,
        code: event.category,
        item_count: 0,
        first_due: null,
        last_due: null,
      });
    }
    const course = courses.get(event.category)!;
    if (!assignments.has(key) && due.due_date) {
      course.item_count += 1;
      if (!course.first_due || due.due_date < course.first_due) course.first_due = due.due_date;
      if (!course.last_due || due.due_date > course.last_due) course.last_due = due.due_date;
    }

    // No per-item link exists in the feed, so the day view is the honest
    // destination: a real page showing that day's work.
    const epoch = due.due_at ? Math.floor(new Date(due.due_at).getTime() / 1000) : null;
    assignments.set(key, {
      external_id: event.uid,
      external_course_id: event.category,
      title,
      description: truncateDescription(event.description, 'Moodle'),
      type,
      ...due,
      external_updated_at: event.lastModified,
      url: epoch === null
        ? `${options.wwwroot}/calendar/view.php?view=day`
        : `${options.wwwroot}/calendar/view.php?view=day&time=${epoch}`,
    });
  }

  return {
    courses: [...courses.values()].sort((left, right) => left.name.localeCompare(right.name)),
    assignments: [...assignments.values()],
    horizon_days: Math.max(0, horizon),
    overrides_applied: overridesApplied,
    unmatched_categories: [...unmatched].sort(),
  };
}

// ── fetching ───────────────────────────────────────────────────────────────

export interface MoodleFeedError extends Error {
  code: string;
  status?: number;
}

function feedError(code: string, message: string, status?: number): MoodleFeedError {
  const error = new Error(message) as MoodleFeedError;
  error.code = code;
  if (status !== undefined) error.status = status;
  return error;
}

export interface MoodleFetchResult extends ParsedMoodleCalendar {
  /** Both `custom` fetches succeeded: the feed can be trusted for reconciliation. */
  complete: boolean;
  /** The 60-day floor was fetched and merged. */
  recentupcomingOk: boolean;
  /** The preset the canonical URL should be pinned to, when `custom` was too big. */
  pinnedTime: MoodleFeedTime | null;
}

/**
 * The school never answered: DNS, a refused or reset connection, a timeout.
 *
 * The runtime's own error is thrown away, never wrapped. Deno words a failed
 * request as "error sending request for url (https://…?userid=7&authtoken=…)",
 * which put the student's bearer credential into lms_connections.last_error —
 * and the word 'token' inside 'authtoken=' then matched the sync's
 * dead-credential test, which switched background sync off and purged a
 * working link from the Vault over a dropped connection. Canvas's fetch has
 * been wrapped this way from the start (lms-sync fetchCanvasCalendar).
 *
 * 503, so the sync records a plain failure and retries with backoff.
 */
function unreachable(): MoodleFeedError {
  return feedError('moodle_feed_unreachable', 'Moodle did not respond. Try again in a few minutes.', 503);
}

async function readFeed(
  url: string,
  fetchImpl: typeof fetch,
  userAgent: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      redirect: 'manual',
      headers: { Accept: 'text/calendar, text/plain;q=0.9', 'User-Agent': userAgent },
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw unreachable();
  }
  if (response.status >= 300 && response.status < 400) {
    throw feedError(
      'moodle_feed_redirected',
      'Moodle sent Semora to a different web address. Sign in to Moodle, open the calendar export page there, and copy the link it shows.',
    );
  }
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_FEED_BYTES) throw feedError('moodle_feed_too_large', 'This Moodle calendar is too large to import safely.');
  let body: string;
  try {
    // The timeout covers the body too, and a connection can drop mid-read.
    body = await response.text();
  } catch {
    throw unreachable();
  }
  if (body.length > MAX_FEED_BYTES) throw feedError('moodle_feed_too_large', 'This Moodle calendar is too large to import safely.');

  switch (classifyMoodleFeedBody(response.status, response.headers.get('content-type'), body)) {
    case 'ok':
      return body;
    case 'invalid_auth':
      throw feedError(
        'moodle_feed_expired',
        'This Moodle calendar link no longer works. Moodle usually stops it after a password change. Copy a fresh link from Moodle and reconnect.',
        401,
      );
    case 'export_disabled':
      throw feedError(
        'moodle_export_disabled',
        'Your school has turned off calendar export in Moodle, so Semora cannot read it. Ask your Moodle support team, or add classes by scanning a syllabus.',
        401,
      );
    case 'busy':
      // 503, like a Canvas throttle: retried with backoff, credential kept.
      throw feedError('moodle_feed_busy', "Your school's Moodle is busy right now. Try again in a few minutes.", 503);
    case 'blocked':
      throw feedError(
        'moodle_feed_blocked',
        "Your school's network is blocking Semora's server. Scan a syllabus, or ask your Moodle support team.",
      );
    default:
      throw feedError('moodle_feed_unreadable', 'Moodle did not return a calendar. Try again in a few minutes.');
  }
}

/** Merge two feeds of the same `preset_what`, keeping every distinct UID. */
function unionIcs(primary: string, extra: string | null): string {
  if (!extra) return primary;
  const seen = new Set(readEvents(primary).map((event) => event.uid));
  const blocks = extra.split(/BEGIN:VEVENT/i).slice(1)
    .map((chunk) => `BEGIN:VEVENT${chunk.split(/END:VEVENT/i)[0]}END:VEVENT`);
  const additions = blocks.filter((block) => {
    const uid = /\nUID:([^\r\n]*)/i.exec(block.replace(/\r/g, ''))?.[1]?.trim();
    return uid ? !seen.has(uid) : false;
  });
  if (!additions.length) return primary;
  return primary.replace(/END:VCALENDAR/i, `${additions.join('\n')}\nEND:VCALENDAR`);
}

/**
 * Fetch and parse a student's Moodle calendar.
 *
 * `custom` first, because on a default site it reaches a year ahead. The
 * 60-day `recentupcoming` pair is only asked for when that horizon came back
 * short, which is the one case the union changes anything — four requests per
 * student per hourly sync is four times what Canvas costs a school, and
 * exactly the shape a university rate-limit rule catches.
 */
export async function fetchMoodleCalendar(
  rawUrl: string,
  options: { fetchImpl?: typeof fetch; userAgent?: string; today?: Date } = {},
): Promise<MoodleFetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const userAgent = options.userAgent ?? MOODLE_USER_AGENT;
  const canonical = normalizeMoodleCalendarFeedUrl(rawUrl);
  const wwwroot = moodleCalendarOrigin(canonical);

  let pinnedTime: MoodleFeedTime | null = null;
  let coursesIcs: string;
  let allIcs: string;
  try {
    [coursesIcs, allIcs] = await Promise.all([
      readFeed(moodleFeedUrlFor(canonical, { what: 'courses', time: 'custom' }), fetchImpl, userAgent),
      readFeed(moodleFeedUrlFor(canonical, { what: 'all', time: 'custom' }), fetchImpl, userAgent),
    ]);
  } catch (error) {
    if ((error as MoodleFeedError)?.code !== 'moodle_feed_too_large') throw error;
    // A year of work across many courses can outgrow the cap. Fall back to the
    // 60-day window and remember never to ask for `custom` again.
    pinnedTime = 'recentupcoming';
    [coursesIcs, allIcs] = await Promise.all([
      readFeed(moodleFeedUrlFor(canonical, { what: 'courses', time: 'recentupcoming' }), fetchImpl, userAgent),
      readFeed(moodleFeedUrlFor(canonical, { what: 'all', time: 'recentupcoming' }), fetchImpl, userAgent),
    ]);
  }

  let parsed = parseMoodleCalendarFeed(coursesIcs, allIcs, { wwwroot, today: options.today });
  let recentupcomingOk = pinnedTime === 'recentupcoming';

  if (!recentupcomingOk && parsed.horizon_days < 60) {
    // The school narrowed its export window. The 60-day preset is hard-coded
    // in Moodle, so it can only add.
    try {
      const [extraCourses, extraAll] = await Promise.all([
        readFeed(moodleFeedUrlFor(canonical, { what: 'courses', time: 'recentupcoming' }), fetchImpl, userAgent),
        readFeed(moodleFeedUrlFor(canonical, { what: 'all', time: 'recentupcoming' }), fetchImpl, userAgent),
      ]);
      parsed = parseMoodleCalendarFeed(
        unionIcs(coursesIcs, extraCourses),
        unionIcs(allIcs, extraAll),
        { wwwroot, today: options.today },
      );
      recentupcomingOk = true;
    } catch {
      // Transient. The custom pair already succeeded, so the import is whole
      // for the window it covers and the next cycle restores the floor.
    }
  }

  return { ...parsed, complete: true, recentupcomingOk, pinnedTime };
}

/**
 * How Semora identifies itself to a school's Moodle.
 *
 * This is the long-established "well-behaved bot" convention: a Mozilla/5.0
 * prefix so ordinary firewall rules recognise it as a normal client, then the
 * product name and a URL a system administrator can look up. It impersonates
 * nobody — a school that wants to know who is calling gets a straight answer.
 *
 * Measured against live sites on 2026-09-19:
 *
 *   'Semora-Moodle-Calendar/1.0'                        MoodleCloud 403, demo 200
 *   'Mozilla/5.0 (compatible; Semora/1.0; +https://…)'  MoodleCloud 200, demo 200
 *   a verbatim Safari string                            MoodleCloud 200, demo 200
 *
 * So the bare product string silently locks out every MoodleCloud school,
 * which is a large share of smaller institutions, and the honest compatible
 * form costs nothing. There is no trade-off here to decide.
 */
export const MOODLE_USER_AGENT = 'Mozilla/5.0 (compatible; Semora/1.0; +https://semoraai.com)';

/**
 * THE IDENTITY INVARIANT — read this before changing any key above.
 *
 *   external_id        = the feed UID verbatim, '<event id>@<host>'
 *   external_course_id = the course shortname from CATEGORIES, verbatim
 *
 * `tasks_lms_external_unique` is (connection, external_course_id, external_id),
 * so both of these ARE the task's identity. Any future lane that reads Moodle
 * through the web-service API must emit the same two keys — the same calendar
 * event id, and the same shortname — or a connection upgraded from this lane
 * would import every task a second time instead of updating it.
 *
 * The host inside the UID carries a path on a sub-directory install
 * ('123@school.edu/moodle'), so nothing may assume it is a bare hostname.
 */
