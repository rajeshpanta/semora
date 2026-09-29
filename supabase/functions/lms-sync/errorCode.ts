/**
 * Which failures cost a student their stored credential.
 *
 * Lives beside index.ts rather than inside it so it can be tested: index.ts
 * starts a server when it is imported. The decision is the one in this file
 * that is not symmetric — see "Throttled is not revoked" in index.ts — so it is
 * the one that most needs a test.
 */

/** Canvas's throttle wording, and the generic one. Shared with index.ts. */
export const THROTTLE_HINT = /rate.?limit|throttl|too many requests/i;

/** Any absolute URL, so the prose test below never reads a query string. */
const URL_IN_TEXT = /[a-z][a-z0-9+.-]*:\/\/\S+/gi;

export function errorCode(error: unknown): 'credentials_required' | 'provider_error' {
  const status = Number((error as any)?.status);
  const message = String((error as Error)?.message ?? '');
  // An explicitly-classified throttle is never a credential problem, however
  // the provider happened to spell its status code.
  if ((error as any)?.code === 'provider_throttled' || THROTTLE_HINT.test(message)) return 'provider_error';

  // MOODLE_PLAN.md Phase 2.7. Moodle's own errorcode, read BEFORE the message
  // regex below — 'enablewsdescription' is a site misconfiguration whose text
  // contains the word "token", and the regex would file it as a dead
  // credential and purge the student's Vault row over an admin's setting.
  const moodleCode = String((error as any)?.moodleErrorCode ?? '');
  if (moodleCode) {
    if (moodleCode === 'invalidtoken' || moodleCode === 'invalidlogin') return 'credentials_required';
    if (moodleCode === 'enablewsdescription' || moodleCode === 'servicenotavailable') return 'provider_error';
    if (moodleCode === 'accessexception' || moodleCode === 'nopermissions') return 'provider_error';
  }

  // The Moodle feed road stamps a bounded code on every failure it raises
  // (moodle-calendar.ts), and that code is the whole verdict. Only two say the
  // LINK is the problem: Moodle's own 'Invalid authentication' answer, and
  // export switched off. A firewall, a rate limit, maintenance, a redirect or
  // a dropped connection all keep the credential — Moodle answers a bad token
  // with HTTP 200 and a plain body, so nothing else is evidence of expiry.
  const feedCode = String((error as any)?.code ?? '');
  if (/^moodle_(feed|export)_/.test(feedCode)) {
    return feedCode === 'moodle_feed_expired' || feedCode === 'moodle_export_disabled'
      ? 'credentials_required'
      : 'provider_error';
  }

  // Matched on the prose only. A transport error quotes the URL it was
  // fetching, and a URL can carry 'token' as a parameter NAME — Moodle's
  // authtoken=, Google's pageToken= — which read as a dead credential and
  // purged a working one over a dropped connection.
  const prose = message.replace(URL_IN_TEXT, ' ');
  return status === 401 || status === 403 || /reconnect|permission|unauthor|token/i.test(prose)
    ? 'credentials_required'
    : 'provider_error';
}
