import { Alert, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { MARKETING_URL, SUPPORT_EMAIL } from '@/lib/constants';

/**
 * The one place a failure becomes something the user can act on.
 *
 * Before this existed, every catch block ended in `Alert.alert('Error',
 * err.message)`. That produced three bad outcomes at once: the student saw a
 * sentence with no cause, had no way to reach us, and we recorded nothing we
 * could diagnose later. On 2026-08-22 one student tried to subscribe eleven
 * times in thirty-four minutes; all eleven attempts logged the single word
 * "purchase-error" and she was charged without ever receiving Pro. There was
 * nothing in the record to explain why, because nothing had been asked to
 * record it.
 *
 * Every failure surfaced through here carries a code, and every code is
 * reportable in two taps with the diagnostics already filled in.
 */

/** An Error that survived a network boundary with its machine identity intact. */
export type AppError = Error & { code?: string; status?: number };

/**
 * A short, stable, support-quotable identifier for any failure.
 *
 * Order matters: a server-sent `code` is the most specific thing we have, an
 * HTTP status is the next most specific, and only then do we fall back to a
 * shape derived from the message. Never returns empty — an unidentifiable
 * error is still given a name so the student has something to quote.
 */
export function errorCodeOf(err: any): string {
  const code = err?.code;
  if (typeof code === 'string' && code.trim()) return code.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  if (typeof code === 'number') return `E${code}`;
  const status = err?.status;
  if (typeof status === 'number' && status > 0) return `HTTP_${status}`;
  if (err?.name && err.name !== 'Error') return String(err.name).toUpperCase();
  return 'UNKNOWN';
}

/**
 * Diagnostics that identify the failure without identifying the person beyond
 * their own account. No receipts, no tokens, no file contents.
 */
async function diagnostics(code: string, screen?: string): Promise<string> {
  let userId = 'signed-out';
  try {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user?.id ?? 'signed-out';
  } catch {
    userId = 'unknown';
  }
  return [
    `Error code: ${code}`,
    screen ? `Screen: ${screen}` : null,
    `App: ${Constants.expoConfig?.version ?? 'unknown'} (${Platform.OS})`,
    `Account: ${userId}`,
    `When: ${new Date().toISOString()}`,
  ].filter(Boolean).join('\n');
}

/** Open the support form, falling back to a prefilled email. */
export async function contactSupport(code: string, screen: string | undefined, summary: string): Promise<void> {
  const details = await diagnostics(code, screen);
  const subject = `Semora issue: ${code}`;
  const body = `Hi Semora team,\n\nI hit this problem:\n${summary}\n\n---- please keep these details ----\n${details}\n`;
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  // Mail first, not the web form: the form cannot be prefilled, so choosing it
  // would throw away the very diagnostics this exists to deliver.
  try {
    if (await Linking.canOpenURL(mailto)) {
      await Linking.openURL(mailto);
      track('support_opened', { screen, code, via: 'mail' });
      return;
    }
  } catch {
    // fall through
  }
  try {
    await Linking.openURL(`${MARKETING_URL}/support`);
    track('support_opened', { screen, code, via: 'web' });
  } catch {
    Alert.alert('Contact Support', `Email us at ${SUPPORT_EMAIL} and quote:\n\n${details}`);
  }
}

export interface ReportErrorOptions {
  /** Screen name, for analytics and the support message. */
  screen?: string;
  /** Overrides the default "Something went wrong" heading. */
  title?: string;
  /** Shown instead of the raw error message when we have something kinder. */
  message?: string;
  /** When provided, the sheet offers Try Again as the primary action. */
  onRetry?: () => void;
}

/**
 * Show a failure the user can understand, quote, and escalate.
 *
 * Always names the code. Always offers support. Never swallows.
 */
export function reportError(err: any, opts: ReportErrorOptions = {}): void {
  const code = errorCodeOf(err);
  const { screen, onRetry } = opts;
  const summary =
    opts.message ||
    (typeof err?.message === 'string' && err.message.trim()
      ? err.message.trim()
      : 'Something went wrong. Please try again.');

  // Record it whether or not the student chooses to write in. An error nobody
  // reports is still an error we need to see in the funnel.
  track('error_shown', {
    screen,
    code,
    status: typeof err?.status === 'number' ? err.status : undefined,
    message: String(summary).slice(0, 120),
  });

  // The code goes in the body, not the title: it must be visible without being
  // the first thing a stressed student reads.
  const body = `${summary}\n\nError code: ${code}`;

  const buttons: any[] = [];
  if (onRetry) buttons.push({ text: 'Try Again', onPress: onRetry });
  buttons.push({
    text: 'Contact Support',
    onPress: () => { void contactSupport(code, screen, summary); },
  });
  buttons.push({ text: 'Close', style: 'cancel' });

  Alert.alert(opts.title ?? 'Something Went Wrong', body, buttons);
}
