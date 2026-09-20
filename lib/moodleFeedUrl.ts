/**
 * Reading what a student actually pasted into the Moodle calendar link box.
 *
 * MOODLE_PLAN.md Phase 4.1, and the client twin of
 * supabase/functions/_shared/moodle-calendar.ts. The verdicts here drive what
 * the screen says WHILE the student is looking at the field, which matters more
 * on this road than on Canvas's: the Moodle export page has a second button,
 * "Export", that downloads a file instead of showing a link, and a student who
 * takes it comes back with nothing paste-able and no idea why.
 *
 * The messages are byte-identical to the server's so a student never sees the
 * same problem described two different ways.
 *
 * Pure and import-free so lib/moodleFeedUrl.test.ts can drive it under Deno.
 */

export type MoodleFeedProblem =
  /** Nothing link-shaped in there yet. */
  | 'not_a_url'
  /** The Moodle sign-in page: they went to the browser and stopped there. */
  | 'login_page'
  /** The Export page itself — they copied the address bar, not the link. */
  | 'export_page'
  /** icalexport.ics: they pressed Export and it downloaded a file. */
  | 'export_file'
  /** A real Moodle URL, but from some other page. */
  | 'wrong_page'
  /** A link from a different Moodle than the one they chose. */
  | 'other_host'
  /** http://, credentials in the URL, or a non-443 port. */
  | 'not_https'
  /** A raw IP, or a private address. */
  | 'bad_host'
  | 'too_long';

export type MoodleFeedVerdict =
  | { state: 'empty' }
  | { state: 'ok'; url: string; host: string; wwwroot: string }
  /**
   * `wwwroot` is present whenever the paste was a real Moodle URL from the
   * wrong page. A student who pasted their Moodle dashboard has already
   * answered the question the flow is otherwise stuck on — which Moodle is
   * theirs — so that is kept and offered back rather than discarded.
   */
  | { state: 'problem'; code: MoodleFeedProblem; host?: string; wwwroot?: string };

const MAX_LENGTH = 4096;

export const MOODLE_FEED_MESSAGES: Record<MoodleFeedProblem | 'empty', string> = {
  empty: 'Paste your Moodle calendar link.',
  too_long: 'The Moodle calendar link is too long.',
  not_a_url: 'Paste the complete calendar URL copied from Moodle.',
  not_https: 'Moodle calendar links must use secure HTTPS.',
  bad_host: 'Moodle calendar links must use your school’s Moodle web address.',
  login_page: 'That is the Moodle sign-in page, not the calendar link.',
  export_page: 'That is the Export page — tap Get calendar URL, then Copy URL.',
  export_file: 'That is a downloaded file, not the link.',
  other_host: 'That link is from a different Moodle than the one you chose.',
  wrong_page:
    'This is not a Moodle calendar export link. In Moodle open Calendar → Import or export calendars → Export calendar → Get calendar URL, then copy the URL shown.',
};

/** The short line shown under the field while they are still typing. */
export const MOODLE_FEED_HINTS: Record<MoodleFeedProblem, string> = {
  not_a_url: 'Paste the whole link.',
  login_page: 'Sign in first, then tap Get calendar URL.',
  export_page: 'Tap Get calendar URL, then Copy URL.',
  export_file: 'That downloaded a file. Tap Get calendar URL instead.',
  wrong_page: 'That is a Moodle page, not the calendar link.',
  other_host: 'That is a different Moodle.',
  not_https: 'The link must start with https.',
  bad_host: 'Use your school’s Moodle address.',
  too_long: 'That is too long to be the link.',
};

const PRIVATE_HOST = /^(localhost|0\.0\.0\.0|::1?|\[?::1\]?)$|\.localhost$|\.local$|^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./i;

/** Pull the first link-shaped token out of whatever was pasted. */
export function extractMoodleFeedCandidate(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const text = raw.trim();
  if (!text) return '';
  const exact = text.match(/(?:webcal:\/\/|https?:\/\/)?[^\s"'<>]*calendar\/export_execute\.php[^\s"'<>]*/i);
  if (exact) return exact[0];
  const any = text.match(/(?:webcal:\/\/|https?:\/\/)[^\s"'<>]+/i);
  return any ? any[0] : text;
}

function toUrl(candidate: string): URL | null {
  let value = candidate;
  if (/^webcal:\/\//i.test(value)) value = `https://${value.slice(value.indexOf('//') + 2)}`;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Recover the Moodle site root from any page inside it.
 *
 * A student who pastes their dashboard, a course page or even the sign-in page
 * has told us their school's Moodle address, which is the one thing the flow
 * most needs. Cuts at the first path segment Moodle owns, so a sub-directory
 * install keeps its prefix.
 */
export function moodleWwwrootFromPage(value: unknown): string | null {
  const url = toUrl(extractMoodleFeedCandidate(value));
  if (!url || url.protocol !== 'https:' || PRIVATE_HOST.test(url.hostname)) return null;
  // A real Moodle is on a public name, and a public name has a dot in it.
  //
  // Without this, toUrl's https:// prefix turns ANY typed word into a site:
  // a student who fat-fingers their school becomes anchored to
  // https://stateuniversty, and the CORRECT calendar link they paste two
  // screens later is then refused against it as 'a different Moodle' — the
  // one wrong turn in the flow where doing everything right afterwards still
  // fails, and it blames the student's good link for the earlier typo.
  if (!url.hostname.includes('.')) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  const stop = ['my', 'course', 'calendar', 'mod', 'user', 'login', 'grade', 'message', 'admin', 'lib', 'blocks', 'report'];
  const kept: string[] = [];
  for (const part of parts) {
    if (stop.includes(part.toLowerCase())) break;
    if (/\.(php|ics|html?)$/i.test(part)) break;
    kept.push(part);
  }
  return kept.length ? `${url.origin}/${kept.join('/')}` : url.origin;
}

/**
 * What is wrong with this paste, in time for the student to fix it.
 *
 * `expectedWwwroot` is the site they chose at the start; when it is given, a
 * link from somewhere else is called out rather than silently accepted, which
 * is how a student ends up connected to a school they do not attend.
 */
export function describeMoodleFeedInput(raw: unknown, expectedWwwroot?: string | null): MoodleFeedVerdict {
  if (typeof raw !== 'string' || !raw.trim()) return { state: 'empty' };
  const candidate = extractMoodleFeedCandidate(raw);
  if (candidate.length > MAX_LENGTH) return { state: 'problem', code: 'too_long' };

  const url = toUrl(candidate);
  if (!url) return { state: 'problem', code: 'not_a_url' };

  const wwwroot = moodleWwwrootFromPage(candidate) ?? undefined;
  const host = url.hostname;

  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    return { state: 'problem', code: 'not_https', host };
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':') || PRIVATE_HOST.test(host)) {
    return { state: 'problem', code: 'bad_host' };
  }
  if (/\/login\//i.test(url.pathname)) return { state: 'problem', code: 'login_page', host, wwwroot };
  if (/\/calendar\/export\.php$/i.test(url.pathname)) return { state: 'problem', code: 'export_page', host, wwwroot };
  if (/icalexport\.ics$/i.test(url.pathname)) return { state: 'problem', code: 'export_file', host, wwwroot };
  if (!/\/calendar\/export_execute\.php$/i.test(url.pathname)) {
    return { state: 'problem', code: 'wrong_page', host, wwwroot };
  }

  const authtoken = url.searchParams.get('authtoken') ?? '';
  const userid = url.searchParams.get('userid') ?? '';
  const username = url.searchParams.get('username') ?? '';
  if (!/^[0-9a-f]{40}$/i.test(authtoken) || (!/^\d{1,12}$/.test(userid) && !username)) {
    return { state: 'problem', code: 'wrong_page', host, wwwroot };
  }

  const root = `${url.origin}${url.pathname.replace(/\/calendar\/export_execute\.php$/i, '')}`;
  if (expectedWwwroot && root.toLowerCase() !== String(expectedWwwroot).replace(/\/+$/, '').toLowerCase()) {
    return { state: 'problem', code: 'other_host', host, wwwroot: root };
  }

  const kept = new URLSearchParams();
  if (/^\d{1,12}$/.test(userid)) kept.set('userid', userid);
  else kept.set('username', username.slice(0, 120));
  kept.set('authtoken', authtoken.toLowerCase());
  url.search = kept.toString();
  url.hash = '';
  return { state: 'ok', url: url.toString(), host, wwwroot: root };
}

/** Throwing form, for the moment of submission. Mirrors the server exactly. */
export function normalizeMoodleCalendarFeedUrl(raw: unknown): string {
  const verdict = describeMoodleFeedInput(raw);
  if (verdict.state === 'ok') return verdict.url;
  throw new Error(MOODLE_FEED_MESSAGES[verdict.state === 'empty' ? 'empty' : verdict.code]);
}

/** The site root of a valid link. */
export function moodleCalendarOrigin(raw: unknown): string {
  const verdict = describeMoodleFeedInput(raw);
  if (verdict.state !== 'ok') {
    throw new Error(MOODLE_FEED_MESSAGES[verdict.state === 'empty' ? 'empty' : verdict.code]);
  }
  return verdict.wwwroot;
}
