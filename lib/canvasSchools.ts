/**
 * Finding a student's Canvas address without asking them to know it.
 *
 * ─── THE PROBLEM THIS SOLVES ────────────────────────────────
 * Measured over 60 days: 22 sessions reached the Canvas connect screen and 13
 * of them — 59% — never attempted a paste at all. Not a bad paste. No paste.
 * They arrived at a form whose first instruction is "open your school's Canvas
 * website in a browser" and stopped there, because on a phone that is a real
 * errand: you have to know your school's Canvas address, sign in, find
 * Calendar, find Calendar Feed, and copy a URL out of a dialog.
 *
 * Semora cannot do the signing in. It can remove the part where the student is
 * expected to know that their college's Canvas lives at, say,
 * `bruinlearn.ucla.edu` — a name with no relationship to the school's name.
 *
 * ─── WHY INSTRUCTURE'S OWN DIRECTORY, NOT A LIST WE KEEP ────
 * Instructure publishes the account directory that powers the "find your
 * school" step in their own mobile apps:
 *
 *   GET https://sso.canvaslms.com/api/v1/accounts/search?search_term=…
 *
 * Unauthenticated, HTTP 200, CORS `*`, returns [{id, name, domain}]. Verified
 * against real schools while writing this: "de anza" → deanza.instructure.com,
 * "ucla" → bruinlearn.ucla.edu, "stanford" → canvas.stanford.edu. Note that
 * none of those three domains could be guessed from the school's name, which
 * is the entire argument for using a directory at all.
 *
 * A hand-maintained table was the alternative and is rejected: it would be
 * wrong the day a school migrates, and nobody would find out until a student
 * could not connect. This one is maintained by the vendor whose product the
 * hostnames belong to.
 *
 * ─── AND WHY THERE IS STILL A MANUAL FALLBACK ───────────────
 * A directory we do not own can be slow, blocked on a campus network, or
 * simply missing a school. It must never become the only way through, so
 * `manualCanvasHost` accepts a hostname typed by hand and the UI keeps that
 * door open even while the search is working.
 */

export interface CanvasSchool {
  id: number;
  name: string;
  /** The Canvas hostname, e.g. `deanza.instructure.com`. */
  domain: string;
}

const SEARCH_URL = 'https://sso.canvaslms.com/api/v1/accounts/search';

/**
 * A plausible Canvas hostname: a real domain, no scheme, no path, no port.
 *
 * The final label must be alphabetic. Without that the pattern accepts
 * `10.0.0.1` — digits are legal label characters — and a raw IP is exactly the
 * input describeCanvasFeedInput already refuses as `bad_host`, because it is
 * how you point a student at something that is not their school.
 */
const HOSTNAME = /^(?!-)[a-z0-9-]{1,63}(?:\.(?!-)[a-z0-9-]{1,63})*\.[a-z]{2,}$/i;

/**
 * Read the directory's answer without trusting its shape.
 *
 * Pure and separate from the fetch so the parsing is testable, and because a
 * third-party response is exactly the kind of input that should be treated as
 * hostile: anything without a usable `domain` is dropped rather than rendered.
 */
export function parseCanvasSchools(payload: unknown): CanvasSchool[] {
  if (!Array.isArray(payload)) return [];
  const seen = new Set<string>();
  const out: CanvasSchool[] = [];
  for (const row of payload) {
    if (!row || typeof row !== 'object') continue;
    const domain = String((row as any).domain ?? '').trim().toLowerCase();
    const name = String((row as any).name ?? '').trim();
    if (!domain || !name) continue;
    // The domain is about to become a URL we send a student to. It has to be a
    // hostname and nothing else — no scheme, no path, no credentials.
    if (!HOSTNAME.test(domain)) continue;
    if (seen.has(domain)) continue;
    seen.add(domain);
    out.push({ id: Number((row as any).id) || 0, name, domain });
  }
  return out;
}

/**
 * A hostname the student typed themselves.
 *
 * Deliberately tolerant about the shape they give it — `https://x.edu/`,
 * `x.edu`, or a whole Canvas URL all mean the same school — and strict about
 * what comes out.
 */
export function manualCanvasHost(raw: string): string | null {
  let value = (raw ?? '').trim().toLowerCase();
  if (!value) return null;
  value = value.replace(/^[a-z]+:\/\//, '');   // scheme
  value = value.replace(/^[^@/]*@/, '');       // credentials, never carried forward
  value = value.split('/')[0];                  // path
  value = value.split('?')[0].split('#')[0];
  value = value.replace(/:\d+$/, '');           // port
  if (!HOSTNAME.test(value)) return null;
  return value;
}

/** The page that holds the Calendar Feed dialog, for a given school. */
export function canvasCalendarPageUrl(host: string): string {
  return `https://${host}/calendar`;
}

/**
 * Ask Instructure which schools match what the student typed.
 *
 * Never throws: a directory outage has to degrade to "type your Canvas address
 * yourself", not to a dead end. The caller distinguishes "no matches" from
 * "could not ask" through the `ok` flag so it can say the honest thing.
 */
export async function searchCanvasSchools(
  term: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; schools: CanvasSchool[] }> {
  const query = (term ?? '').trim();
  if (query.length < 3) return { ok: true, schools: [] };
  try {
    const response = await fetch(
      `${SEARCH_URL}?search_term=${encodeURIComponent(query)}&per_page=10`,
      { signal, headers: { Accept: 'application/json' } },
    );
    if (!response.ok) return { ok: false, schools: [] };
    return { ok: true, schools: parseCanvasSchools(await response.json()) };
  } catch {
    return { ok: false, schools: [] };
  }
}
