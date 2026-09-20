/**
 * "Is this address a Moodle, and what is it called?"
 *
 * MOODLE_PLAN.md Phase 1.7. This exists so a student can type their school's
 * web address and be told **Found: University of X Moodle** before they are
 * sent off to a browser. It uses `tool_mobile_get_public_config`, which Moodle
 * declares `loginrequired => false` (`admin/tool/mobile/db/services.php:38-46`)
 * and answers with no token at all.
 *
 * ADVISORY BY CONTRACT. The client may not block on any answer this returns.
 * Universities sit behind firewalls that challenge anything without a browser's
 * fingerprint — measured 2026-09-19, `clase.moodlecloud.com` answers this
 * endpoint 403 to Semora's user agent and 200 to Safari's, while the calendar
 * export itself answers both. So "couldn't confirm" must never mean "you cannot
 * continue"; the export fetch is the real test.
 *
 * It also records what the site would allow, which is the only way to learn
 * whether the parked browser sign-in road (MOODLE_PLAN.md §12) is ever worth
 * building: `typeoflogin` 1 means Moodle's own launch page throws before the
 * login form, and `forcedurlscheme` — the setting that would send a token to
 * the official app instead of Semora — is deliberately NOT in this response, so
 * it cannot be detected in advance.
 */
import { blockedHost } from './canvas-calendar.ts';
import { MOODLE_USER_AGENT } from './moodle-calendar.ts';

const PROBE_TIMEOUT_MS = 10_000;
const MAX_PROBE_BYTES = 256 * 1024;
const PUBLIC_CONFIG_ARGS = JSON.stringify([
  { index: 0, methodname: 'tool_mobile_get_public_config', args: {} },
]);

export type MoodleProbeVia = 'public_config' | 'exception' | 'markup';
export type MoodleProbeReason = 'not_moodle' | 'unreachable' | 'blocked';

export interface MoodleSiteProbe {
  isMoodle: boolean;
  /** How we decided. Absent when `isMoodle` is false. */
  via?: MoodleProbeVia;
  /** The site's own idea of its root, which may carry a path. */
  wwwroot?: string;
  siteName?: string;
  /** Web services on at all. */
  ws?: boolean;
  /** The mobile service enabled — the precondition for any token road. */
  mobile?: boolean;
  /** 1 = via the app (the default, which closes launch.php), 2 = browser, 3 = embedded. */
  typeoflogin?: number;
  /** The site offers at least one single-sign-on identity provider. */
  sso?: boolean;
  maintenance?: boolean;
  reason?: MoodleProbeReason;
}

/**
 * Addresses worth trying for a typed school domain.
 *
 * Students know `school.edu`, not `moodle.school.edu`. Bounded on purpose:
 * this runs on Semora's server against a host the student named, so it must
 * never become a scanner. Five candidates, one round of requests, no recursion.
 */
export function moodleProbeCandidates(input: string): string[] {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return [];
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return [];
  }
  if (url.protocol !== 'https:' || blockedHost(url.hostname)) return [];

  const host = url.hostname;
  const out: string[] = [url.origin];

  // A pasted page from inside Moodle: keep the first path segment, which is
  // the whole address of a sub-directory install.
  const segment = url.pathname.split('/').filter(Boolean)[0];
  if (segment && !/\.(php|ics|html?)$/i.test(segment)) out.push(`${url.origin}/${segment}`);

  // The shapes a university actually uses.
  if (!/^(moodle|lms|learn|courses|vle)\./i.test(host)) {
    out.push(`https://moodle.${host}`);
    out.push(`https://lms.${host}`);
  }
  out.push(`${url.origin}/moodle`);

  return [...new Set(out)].slice(0, 5);
}

/** Read what we care about out of the public-config envelope. */
export function readPublicConfig(payload: unknown): MoodleSiteProbe | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const entry = payload[0] as { error?: unknown; data?: Record<string, unknown>; exception?: unknown };
  // A Moodle exception envelope still proves it is a Moodle.
  if (entry?.error || entry?.exception) return { isMoodle: true, via: 'exception' };
  const data = entry?.data;
  if (!data || typeof data !== 'object') return null;
  if (typeof data.wwwroot !== 'string') return null;

  const providers = data.identityproviders;
  return {
    isMoodle: true,
    via: 'public_config',
    wwwroot: String(data.wwwroot).replace(/\/+$/, ''),
    siteName: typeof data.sitename === 'string' ? data.sitename.slice(0, 120) : undefined,
    ws: data.enablewebservices === 1 || data.enablewebservices === true,
    mobile: data.enablemobilewebservice === 1 || data.enablemobilewebservice === true,
    typeoflogin: typeof data.typeoflogin === 'number' ? data.typeoflogin : undefined,
    sso: Array.isArray(providers) ? providers.length > 0 : false,
    maintenance: data.maintenanceenabled === 1 || data.maintenanceenabled === true,
  };
}

async function getText(url: string, fetchImpl: typeof fetch, userAgent: string): Promise<{ status: number; body: string; headers: Headers } | null> {
  try {
    const response = await fetchImpl(url, {
      redirect: 'manual',
      headers: { Accept: 'application/json, text/html;q=0.8', 'User-Agent': userAgent },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const body = (await response.text()).slice(0, MAX_PROBE_BYTES);
    return { status: response.status, body, headers: response.headers };
  } catch {
    return null;
  }
}

/**
 * Ask a candidate address whether it is a Moodle.
 *
 * Never returns fetched HTML to the caller — only a verdict and the handful of
 * public settings above. A school's error page is not ours to pass around.
 */
export async function probeMoodleSite(
  input: string,
  options: { fetchImpl?: typeof fetch; userAgent?: string } = {},
): Promise<MoodleSiteProbe> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const userAgent = options.userAgent ?? MOODLE_USER_AGENT;
  const candidates = moodleProbeCandidates(input);
  if (!candidates.length) return { isMoodle: false, reason: 'not_moodle' };

  let sawBlock = false;
  let sawAnything = false;

  for (const base of candidates) {
    const config = await getText(
      `${base}/lib/ajax/service-nologin.php?args=${encodeURIComponent(PUBLIC_CONFIG_ARGS)}`,
      fetchImpl,
      userAgent,
    );
    if (config) {
      sawAnything = true;
      if (config.status === 403 || config.status === 429) sawBlock = true;
      if (config.status === 200) {
        try {
          const probe = readPublicConfig(JSON.parse(config.body));
          if (probe) return probe;
        } catch {
          // Not JSON: a firewall page or a non-Moodle site. Fall through to markup.
        }
      }
    }

    // Web services may simply be off, which is common and is not our business:
    // the calendar export does not need them. The export page still identifies
    // a Moodle by its session cookie or its meta keywords.
    const page = await getText(`${base}/calendar/export.php`, fetchImpl, userAgent);
    if (page) {
      sawAnything = true;
      if (page.status === 403 || page.status === 429) sawBlock = true;
      const setCookie = page.headers.get('set-cookie') ?? '';
      if (/MoodleSession/i.test(setCookie) || /<meta[^>]+content="[^"]*moodle/i.test(page.body)) {
        return { isMoodle: true, via: 'markup', wwwroot: base, siteName: new URL(base).hostname };
      }
    }
  }

  if (sawBlock) return { isMoodle: false, reason: 'blocked' };
  return { isMoodle: false, reason: sawAnything ? 'not_moodle' : 'unreachable' };
}
