/**
 * What an error report is allowed to carry off a student's device.
 *
 * Error text and stack frames are the likeliest places in the app for a real
 * filename, an iCloud address or a home directory to appear, and anything that
 * reaches analytics stays there. On 2026-09-13 an `error_shown` row was found
 * holding `/Users/<a student's Mac account name>/Library/Containers/…`: the
 * iPhone app running on a Mac puts the account's home folder in every stack
 * path. Nothing about that row was needed to debug the error. The file and line
 * number were.
 *
 * Every error report goes through here before `track`. Kept free of
 * react-native so it can be unit tested.
 */

/** A known document or image extension, which is what a student's own file looks like. */
const FILE_WITH_EXTENSION =
  /\S+\.(pdf|docx?|pptx?|xlsx?|pages|key|numbers|txt|rtf|csv|heic|heif|jpe?g|png|webp|gif|tiff?|zip)\b/gi;
const URI = /\b[a-z][a-z0-9+.-]*:\/\/\S*/gi;
const ABSOLUTE_PATH = /(^|[\s"'(\[])\/[^\s"')\]]*/g;
const EMAIL = /\b[\w.+-]+@[\w.-]+\.\w+\b/gi;

export interface RedactTextOptions {
  /** Longest string returned; longer text is cut with an ellipsis. */
  maxLength: number;
  /**
   * Also blank anything in quotes. Right for a picker error, where a quoted
   * string is almost always a filename; too blunt for general error text,
   * where it would erase the one detail that explains the error.
   */
  redactQuoted?: boolean;
}

/**
 * Strip anything that could name a file, a person, or a place on disk.
 *
 * Order matters. URIs go first because a file:// URI contains path separators
 * that the later path rule would otherwise chew into pieces, leaving the
 * basename — the exact thing we are trying not to keep — stranded as a
 * separate token.
 *
 * This is deliberately aggressive. A redaction that removes one word too many
 * costs a little diagnostic colour; one that keeps a filename puts a student's
 * coursework in an analytics table forever.
 */
export function redactSensitiveText(raw: unknown, options: RedactTextOptions): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  let text = raw;

  // file:///…, content://…, assets-library://…, ph://…, http(s)://…
  text = text.replace(URI, '<uri>');
  // Absolute POSIX paths, including the /private/var/mobile/… the picker copies into.
  text = text.replace(ABSOLUTE_PATH, '$1<path>');
  // A bare basename with a known document/image extension, quoted or not.
  text = text.replace(FILE_WITH_EXTENSION, '<file>');
  if (options.redactQuoted) {
    // Anything still in quotes is far more likely a filename than a constant.
    text = text.replace(/"[^"]{0,200}"/g, '"<redacted>"');
    text = text.replace(/'[^']{0,200}'/g, "'<redacted>'");
  }
  // Emails, in case a provider echoes an iCloud account back in the error.
  text = text.replace(EMAIL, '<email>');

  text = text.replace(/\s+/g, ' ').trim();
  return text.length > options.maxLength
    ? `${text.slice(0, options.maxLength - 1)}…`
    : text;
}

/** The last segment of a path or URL, keeping any `:line:column` suffix. */
function lastSegment(location: string): string {
  const parts = location.split('/').filter(Boolean);
  const last = parts.length ? parts[parts.length - 1] : '<path>';
  // A query or fragment sits between the file name and `:line:column`.
  return last.replace(/[?#][^:]*/, '');
}

/**
 * One stack frame, reduced to what locates the code: the function name and the
 * script's file name, line and column. Every directory and host is dropped.
 *
 *   at anonymous (address at /Users/<name>/Library/…/main.jsbundle:1:2345)
 *     → at anonymous (address at main.jsbundle:1:2345)
 *   at e (https://app.semoraai.com/_expo/static/js/web/entry-1502.js:1442:698)
 *     → at e (entry-1502.js:1442:698)
 *
 * The directory is removed BEFORE truncating. Truncating first is how the
 * leaked row happened: the first 120 characters of a Mac path are the home
 * folder, and the file name that would have been useful was the part cut off.
 */
export function redactStackFrame(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  let frame = raw.trim();
  frame = frame.replace(URI, (uri) => lastSegment(uri));
  frame = frame.replace(ABSOLUTE_PATH, (match: string, lead: string) => lead + lastSegment(match.slice(lead.length)));
  frame = frame.replace(FILE_WITH_EXTENSION, '<file>');
  frame = frame.replace(EMAIL, '<email>');
  frame = frame.replace(/\s+/g, ' ');
  return frame.length > maxLength ? `${frame.slice(0, maxLength - 1)}…` : frame;
}
