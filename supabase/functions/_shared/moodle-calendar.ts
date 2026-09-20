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
 *    student's credential over a transient block.
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

export type MoodleBodyVerdict = 'ok' | 'invalid_auth' | 'export_disabled' | 'blocked' | 'unreadable';

/**
 * Decide what a response body is, by its TEXT.
 *
 * Deliberately ignores the status code and the content type. Moodle answers a
 * bad token with HTTP 200 and `text/html` carrying the words 'Invalid
 * authentication', so a content-type branch would misfile every expired link
 * as transient, and a status branch would misfile every firewall challenge as
 * an expired link and purge the student's credential.
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
  // A challenge page, an SSO gateway, a maintenance notice, or a plain 4xx.
  if (status >= 400 || /<html|just a moment|cf-mitigated|access denied/i.test(head)) return 'blocked';
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
    return { base, kind: pattern.kind };
  }
  return { base: summary.trim(), kind: null };
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

  const dateFor = new Map<string, IcsProperty>();
  let overridesApplied = 0;

  for (const base of courseEvents) {
    if (base.cancelled || !base.category) continue;
    const baseName = stripMoodleEventName(base.summary).base;

    // An OVERRIDE suppresses the base under `all` (its priority beats NULL), so
    // a base missing from `all` means the student holds one. Matched on
    // `<activity> - ` because both the word Moodle uses and the '(Due date)'
    // parenthetical are localised; the activity name is not.
    if (!allByUid.has(base.uid)) {
      const override = allEvents.find((event) =>
        !event.cancelled &&
        event.uid !== base.uid &&
        event.summary.startsWith(`${baseName} - `) &&
        (event.category === null || event.category === base.category));
      if (override) {
        dateFor.set(base.uid, override.start);
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
      const stripped = stripMoodleEventName(event.summary);
      return stripped.kind === 'extend' && stripped.base === baseName;
    });
    if (extension) {
      dateFor.set(base.uid, extension.start);
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

    const stripped = stripMoodleEventName(event.summary);
    // An opening is not work due, and a grading deadline is the teacher's.
    if (stripped.kind === 'open' || stripped.kind === 'grading') continue;
    // An override or extension event is never a task of its own: its UID churns
    // when the override is lifted. Its date has already been folded into the base.
    if (stripped.kind === 'override' || stripped.kind === 'extend') continue;

    // A pre-3.3 quiz is one event spanning open to close, with no name pattern
    // at all. Its due is the END, not the start.
    const spans = event.end ? event.end.value !== event.start.value : false;
    const source = stripped.kind === null && spans && event.end ? event.end : (dateFor.get(event.uid) ?? event.start);
    const due = dateParts(source);
    if (!due) continue;

    const title = (stripped.base || event.summary).slice(0, 240);
    const type: CanvasCalendarAssignment['type'] =
      stripped.kind === 'expect' ? 'other' : classify(title, event.uid);

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

async function readFeed(
  url: string,
  fetchImpl: typeof fetch,
  userAgent: string,
): Promise<string> {
  const response = await fetchImpl(url, {
    redirect: 'manual',
    headers: { Accept: 'text/calendar, text/plain;q=0.9', 'User-Agent': userAgent },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status >= 300 && response.status < 400) {
    throw feedError(
      'moodle_feed_redirected',
      'Moodle sent Semora to a different web address. Sign in to Moodle, open the calendar export page there, and copy the link it shows.',
    );
  }
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_FEED_BYTES) throw feedError('moodle_feed_too_large', 'This Moodle calendar is too large to import safely.');
  const body = await response.text();
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
