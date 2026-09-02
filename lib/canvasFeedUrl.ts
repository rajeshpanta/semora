/**
 * Reading what a student actually pasted into the Canvas Calendar Feed box.
 *
 * On 2026-09-01 this step lost four of the seven students who reached it, and
 * not one of them came back to it — no course list, no connection, ever. The
 * step matters more than its size suggests: students who finish it come back at
 * 78% against 33%, and convert to Pro at 31% against 16%. Everything upstream
 * was working; this is where the funnel emptied.
 *
 * Two things were wrong, and they are different problems:
 *
 *   The parse was literal. `new URL(pasted)` either worked or it did not, so a
 *   student who copied the Canvas dialog and caught a stray word, a newline, or
 *   the "webcal://…" label alongside the link was told to "paste the complete
 *   Calendar Feed URL" — which is exactly what they believed they had done.
 *   A link sitting inside pasted text is not a mistake worth refusing.
 *
 *   The answer arrived too late. Validation ran on Connect, and the field is a
 *   masked credential box, so the student was rejected into a field whose
 *   contents they could not read. describeCanvasFeedInput exists so the screen
 *   can say what is wrong WHILE they are looking at it, and can confirm the
 *   hostname when it is right — the host is not the secret; the user_ token is.
 *
 * Pure and import-free so lib/canvasFeedUrl.test.ts can drive it under Deno.
 * lib/lms.ts re-exports the two functions it used to own, so every existing
 * caller is unchanged.
 */

export type CanvasFeedProblem =
  /** No link in there at all — not yet a URL. */
  | 'not_a_url'
  /** A real Canvas URL, but from a page that is not the Calendar Feed. */
  | 'wrong_page'
  /** http://, credentials in the URL, or a non-443 port. */
  | 'not_https'
  /** A raw IP address rather than the school's Canvas hostname. */
  | 'bad_host'
  | 'too_long';

export type CanvasFeedVerdict =
  | { state: 'empty' }
  | { state: 'ok'; url: string; host: string }
  | { state: 'problem'; code: CanvasFeedProblem };

/**
 * The refusal wording, unchanged from when it lived in lib/lms.ts.
 *
 * Kept byte-identical on purpose: lmsFailureCode() classifies connect failures
 * by matching these strings, and the analytics that told us this step was
 * broken depend on that match continuing to work.
 */
const MESSAGES: Record<CanvasFeedProblem, string> = {
  not_a_url: 'Paste the complete Calendar Feed URL copied from Canvas.',
  wrong_page:
    'This is not a Canvas user Calendar Feed URL. In Canvas, open Calendar → Calendar Feed and copy the URL shown there.',
  not_https: 'Canvas Calendar Feed URLs must use secure HTTPS.',
  bad_host: 'Canvas Calendar Feed URLs must use your school’s Canvas hostname.',
  too_long: 'The Canvas Calendar Feed URL is too long.',
};

/** Short, plain guidance for the live hint under the field. */
export const CANVAS_FEED_HINTS: Record<CanvasFeedProblem, string> = {
  not_a_url: 'That is not a link yet. Copy the whole Calendar Feed URL from Canvas.',
  wrong_page: 'That is a Canvas page, not the feed. In Canvas open Calendar, then Calendar Feed.',
  not_https: 'Copy the Calendar Feed URL exactly as Canvas shows it.',
  bad_host: 'Use your school Canvas web address.',
  too_long: 'That is too long to be a Calendar Feed URL.',
};

const URL_TOKEN = /(?:https?|webcal):\/\/[^\s<>"'`]+/gi;
const FEED_PATH = /\/feeds\/calendars\/user_[^/]+\.ics$/i;

/**
 * Pull the feed link out of whatever the student pasted.
 *
 * Canvas shows the URL inside a dialog, so a paste can arrive wrapped in the
 * surrounding text, split across lines, or with the sentence's full stop stuck
 * to the end. If a link is in there, use it; prefer the one that looks like a
 * calendar feed when the paste contains several.
 */
export function extractCanvasFeedCandidate(text: string): string {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return '';

  const tokens = trimmed.match(URL_TOKEN);
  if (tokens && tokens.length > 0) {
    const feed = tokens.find((token) => /\/feeds\/calendars\//i.test(token)) ?? tokens[0];
    // Trailing sentence punctuation rides along with a copied link. A real feed
    // URL ends in `.ics`, so nothing here can eat part of the address.
    return feed.replace(/[.,;:)\]}>]+$/, '');
  }

  // No scheme at all, but unmistakably a feed path — a student who copied from
  // the address bar without the https://. Give them the benefit of the doubt.
  // `(?:.*\/)?` and not `.*\/`: the host match already consumes the slash
  // before the path, so requiring another one rejected the plain
  // `school.instructure.com/feeds/calendars/user_x.ics` this branch exists for.
  if (/^[\w.-]+\.[a-z]{2,}\/(?:.*\/)?feeds\/calendars\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/**
 * What is wrong with this input, if anything — safe to call on every keystroke.
 *
 * Never throws and never returns the input, so a caller cannot accidentally
 * render the student's credential while explaining it.
 */
export function describeCanvasFeedInput(raw: string): CanvasFeedVerdict {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { state: 'empty' };
  if (trimmed.length > 4096) return { state: 'problem', code: 'too_long' };

  let candidate = extractCanvasFeedCandidate(trimmed);
  if (/^webcal:\/\//i.test(candidate)) {
    candidate = `https://${candidate.slice(candidate.indexOf('//') + 2)}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { state: 'problem', code: 'not_a_url' };
  }

  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    return { state: 'problem', code: 'not_https' };
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) || url.hostname.includes(':')) {
    return { state: 'problem', code: 'bad_host' };
  }
  if (!FEED_PATH.test(url.pathname)) {
    return { state: 'problem', code: 'wrong_page' };
  }

  url.hash = '';
  return { state: 'ok', url: url.toString(), host: url.hostname };
}

/**
 * The strict form the connect call uses. Same refusals, same wording, same
 * order as before — now reached through the tolerant reader above.
 */
export function normalizeCanvasCalendarFeedUrl(raw: string): string {
  const verdict = describeCanvasFeedInput(raw);
  if (verdict.state === 'empty') throw new Error('Paste your Canvas Calendar Feed URL.');
  if (verdict.state === 'problem') throw new Error(MESSAGES[verdict.code]);
  return verdict.url;
}

export function canvasCalendarOrigin(raw: string): string {
  return new URL(normalizeCanvasCalendarFeedUrl(raw)).origin;
}
