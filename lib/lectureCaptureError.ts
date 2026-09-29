/**
 * What a recorder failure may carry into analytics.
 *
 * 2026-09-21 and 09-23: on 1.15.1 the iOS recorder failed twice to bring the
 * microphone back after an interruption ended (RESTART_FAILED_INTERRUPTION_ENDED),
 * and the second time a lecture lost 33 minutes. The recorder had the OS error
 * in hand — its text names the domain and the code, e.g. "(com.apple.coreaudio
 * .avfaudio error 561145187.)", which is '!rec', cannotStartRecording — and
 * lectureSession dropped it, so nobody could say which call failed or why.
 *
 * Two sources, both reduced to flat, non-personal values:
 *   - `detail` from recorder builds that send it (1.15.2+): step, domain, code,
 *     attempts and circumstances, whitelisted key by key.
 *   - `message` from the builds already installed (1.15, 1.15.1): only the
 *     domain and number are parsed out of it. Text that carries no code is
 *     kept only after lib/redact.ts has removed paths, file names and emails.
 *
 * Pure on purpose: no react-native, tested in lectureCaptureError.test.ts.
 */

import type { CaptureDiagnostics } from '@/lib/lectureCapture/types';
import { redactSensitiveText } from '@/lib/redact';

/**
 * The keys a native recorder may attach. Anything else is dropped, so a field
 * added natively reaches analytics only once it is listed here on purpose.
 */
const DIAGNOSTIC_KEYS = new Set([
  'step', 'errDomain', 'errCode', 'errFourCC',
  'firstStep', 'firstErrCode', 'firstErrFourCC',
  'attempts', 'restarts', 'trigger', 'appState', 'locked', 'otherAudio',
  'shouldResume', 'interruptionReason', 'sinceBeganMs',
  // UIApplication.backgroundTimeRemaining in whole seconds, capped at 600
  // (= unlimited: on screen, or audio keeping the app running): when the
  // interruption began, and when the recovery gave up.
  'bgRemainingAtBegan', 'bgRemaining',
  'retryable', 'final', 'expired',
]);
const MAX_STRING = 64;

/** Only whitelisted keys with finite numbers, booleans or short strings. Undefined when nothing is left. */
export function sanitizeCaptureDiagnostics(raw: unknown): CaptureDiagnostics | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: CaptureDiagnostics = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!DIAGNOSTIC_KEYS.has(key)) continue;
    if (typeof value === 'boolean') out[key] = value;
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.trunc(value);
    else if (typeof value === 'string' && value.length > 0) out[key] = value.slice(0, MAX_STRING);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** '!rec' for 561145187: an OSStatus read as four characters, when all are printable. */
export function fourCC(code: number): string | null {
  if (!Number.isInteger(code) || code <= 0 || code > 0xffffffff) return null;
  const bytes = [24, 16, 8, 0].map((shift) => Math.floor(code / 2 ** shift) & 0xff);
  if (!bytes.every((b) => b >= 0x20 && b <= 0x7e)) return null;
  return String.fromCharCode(...bytes);
}

// "The operation couldn’t be completed. (com.apple.coreaudio.avfaudio error 561145187.)"
// "No se ha podido completar la operación. (Error com.apple.coreaudio.avfaudio 561145187.)"
// "The operation couldn’t be completed. (OSStatus error 561017449.)"
const LAST_PARENTHESES = /\(([^()]*)\)[\s.]*$/;
const DOMAIN = /(?:^|\s)((?:[A-Za-z][\w-]*\.)+[A-Za-z][\w-]*|NSOSStatusErrorDomain|OSStatus|NSCocoaErrorDomain|NSPOSIXErrorDomain)(?=\s|$)/;
const CODE = /(?:^|\s)(-?\d{1,10})\.?\s*$/;
const OWN_MESSAGES: Record<string, number> = {
  'No microphone input is available.': 1,
  'The microphone started but delivered no audio.': 2,
  'The microphone stopped before any audio arrived.': 3,
  "The microphone's format changed under the recorder.": 4,
  'The audio hardware changed during the attempt.': 5,
};

/** The domain and code inside an NSError's localized text, in any language. Null when there are none. */
export function parseNativeErrorMessage(message: unknown): CaptureDiagnostics | null {
  if (typeof message !== 'string' || !message.trim()) return null;
  const own = OWN_MESSAGES[message.trim()];
  if (own !== undefined) return { errDomain: 'SemoraRecorder', errCode: own };
  const inner = LAST_PARENTHESES.exec(message.trim())?.[1];
  if (!inner) return null;
  const code = CODE.exec(inner.trim())?.[1];
  if (code === undefined) return null;
  const out: CaptureDiagnostics = { errCode: Number(code) };
  const domain = DOMAIN.exec(inner.trim())?.[1];
  if (domain) out.errDomain = domain.slice(0, MAX_STRING);
  const cc = fourCC(Number(code));
  if (cc) out.errFourCC = cc;
  return out;
}

/**
 * The properties a `lecture_capture_failed` event carries beyond stage and
 * code. A recorder's own `detail` wins; otherwise the message is parsed; text
 * with no code in it is kept redacted and short.
 */
export function captureFailureProps(event: { message?: unknown; detail?: unknown }): CaptureDiagnostics {
  const detail = sanitizeCaptureDiagnostics(event.detail) ?? {};
  if (detail.errCode !== undefined) return detail;
  const parsed = parseNativeErrorMessage(event.message);
  if (parsed) return { ...detail, ...parsed };
  const text = redactSensitiveText(event.message, { maxLength: 120 });
  return text ? { ...detail, errText: text } : detail;
}
