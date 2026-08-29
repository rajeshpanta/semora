/**
 * What a file picker failure is allowed to tell us.
 *
 * On 2026-08-26 two paying subscribers had never once succeeded in choosing a
 * document: eight attempts each, zero files selected. The record of it was
 * eight `scan_cancelled` events, identical to the ones a student produces by
 * opening the picker and changing their mind. The only reason we know they
 * were failures and not choices is that the gap between `scan_started` and
 * `scan_cancelled` was 0.00s and 0.04s — nobody browses a file system in forty
 * milliseconds. The exception that would have explained it was thrown into a
 * bare `catch {}` and destroyed.
 *
 * So this module exists to answer one question the next time it happens: what
 * actually threw. It deliberately does NOT answer "which file" — see
 * redactPickerMessage. A picker error message is one of the likeliest places
 * in the app for a real filename or an iCloud path to appear, and a filename
 * is a student's own words about their own coursework.
 */

/** Long enough for a native exception's shape, short enough to stay a label. */
export const PICKER_MESSAGE_MAX = 300;

export type PickerMethod = 'document' | 'photos' | 'camera';

/**
 * 'threw' — the picker call rejected or threw synchronously.
 * 'timeout' — it never settled. expo-image-picker's web build resolves from
 * inside a `change` listener with no reject path, so a MIME lookup that throws
 * in there leaves the promise pending forever.
 */
export type PickerFailureReason = 'threw' | 'timeout';

export interface PickerFailureContext {
  method: PickerMethod;
  reason: PickerFailureReason;
  /** Invocation → failure. The number that separated a throw from a choice. */
  elapsedMs: number;
  platform: string;
  appVersion?: string | null;
  nativeBuild?: string | null;
  osVersion?: string | null;
  /** 'phone' | 'pad' on iOS. Stands in for a model we can't read without a new native dep. */
  interfaceIdiom?: string | null;
  /** 'active' | 'background' | 'inactive' at the moment of failure. */
  appState?: string | null;
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
 * costs us a little diagnostic colour; one that keeps a filename puts a
 * student's coursework in an analytics table forever.
 */
export function redactPickerMessage(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  let text = raw;

  // file:///…, content://…, assets-library://…, ph://…, http(s)://…
  text = text.replace(/\b[a-z][a-z0-9+.-]*:\/\/\S*/gi, '<uri>');
  // Absolute POSIX paths, including the /private/var/mobile/… the picker copies into.
  text = text.replace(/(^|[\s"'(\[])\/[^\s"')\]]*/g, '$1<path>');
  // A bare basename with a known document/image extension, quoted or not.
  text = text.replace(
    /\S+\.(pdf|docx?|pptx?|xlsx?|pages|key|numbers|txt|rtf|csv|heic|heif|jpe?g|png|webp|gif|tiff?|zip)\b/gi,
    '<file>',
  );
  // Anything still in quotes is far more likely a filename than a constant.
  text = text.replace(/"[^"]{0,200}"/g, '"<redacted>"');
  text = text.replace(/'[^']{0,200}'/g, "'<redacted>'");
  // Emails, in case a provider echoes an iCloud account back in the error.
  text = text.replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/gi, '<email>');

  text = text.replace(/\s+/g, ' ').trim();
  return text.length > PICKER_MESSAGE_MAX
    ? `${text.slice(0, PICKER_MESSAGE_MAX - 1)}…`
    : text;
}

/**
 * The error's machine identity, independent of its prose.
 *
 * Mirrors lib/errorReport.errorCodeOf's precedence (explicit code, then
 * status, then name) but is duplicated rather than imported: errorReport pulls
 * in react-native, supabase and expo-constants, and this module has to stay
 * importable by a plain unit test.
 */
export function pickerErrorCode(err: any): string {
  const code = err?.code;
  if (typeof code === 'string' && code.trim()) {
    return code.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  }
  if (typeof code === 'number') return `E${code}`;
  const status = err?.status;
  if (typeof status === 'number' && status > 0) return `HTTP_${status}`;
  if (err?.name && err.name !== 'Error') {
    return String(err.name).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  }
  return 'UNKNOWN';
}

/**
 * The code expo-modules-core gives PickingInProgressException.
 *
 * Derived, not guessed: Exception.code falls back to errorCodeFromString(name)
 * (expo-modules-core/ios/Core/Exceptions/CodedError.swift), which strips the
 * trailing "Exception", splits on case boundaries and upper-cases — so
 * `PickingInProgressException` becomes exactly this.
 */
export const PICKING_IN_PROGRESS_CODE = 'ERR_PICKING_IN_PROGRESS';

/**
 * The code from the patched module's PickerHostBusyException
 * (patches/expo-document-picker+14.0.8.patch).
 *
 * This is the failure that USED to become a strand. The patched module now
 * refuses before assigning `pickingContext`, so the module stays usable and the
 * next tap — once the transition has finished — works. It must never be
 * classified as stranded: telling someone to restart the app for a condition
 * that clears itself in a frame is the wrong instruction, and it would also
 * make `stranded` useless as the measure of whether the patch worked.
 */
export const PICKER_HOST_BUSY_CODE = 'ERR_PICKER_HOST_BUSY';

/**
 * True when the failure is the native picker refusing because it still thinks
 * a previous pick is running.
 *
 * This is the one failure JS cannot retry its way out of. `pickingContext` is
 * cleared only by the picker's own delegate callbacks, so once a presentation
 * has silently failed there is nothing any amount of retrying, re-navigating
 * or signing out can do — only a new process. The message shown for this case
 * has to say that, because "please try again" is advice that cannot succeed.
 */
export function isPickerStrandedError(err: unknown): boolean {
  if (!err) return false;
  const code = pickerErrorCode(err);
  if (code === PICKING_IN_PROGRESS_CODE) return true;
  // Belt and braces: match the reason text too, in case a future version
  // reaches JS with a custom code but the same sentence.
  const message = (err as { message?: unknown })?.message;
  return typeof message === 'string'
    && /different document picking in progress/i.test(message);
}

/**
 * The `scan_picker_failed` property bag.
 *
 * Every value here is either a constant, a number, or a redacted string. There
 * is no path by which a filename, a URI or file bytes reach this object.
 */
export function describePickerFailure(
  err: unknown,
  ctx: PickerFailureContext,
): Record<string, unknown> {
  const anyErr = err as any;
  const isTimeout = ctx.reason === 'timeout';
  return {
    screen: 'scan',
    method: ctx.method,
    reason: ctx.reason,
    // A timeout has no exception, so it gets a code of its own rather than
    // the 'UNKNOWN' that a missing error would otherwise produce — the two
    // are different failures and must not merge in the analytics.
    error_code: isTimeout ? 'PICKER_TIMEOUT' : pickerErrorCode(anyErr),
    error_name: isTimeout ? 'Timeout' : (typeof anyErr?.name === 'string' ? anyErr.name : null),
    error_message: isTimeout ? '' : redactPickerMessage(anyErr?.message),
    elapsed_ms: Math.max(0, Math.round(ctx.elapsedMs)),
    // The tell. Under ~150ms the picker cannot have been presented and
    // dismissed by a human, so the event is a throw no matter what else
    // the payload says.
    instant: ctx.elapsedMs < 150,
    // Whether this is the unrecoverable case. Splitting it out means a single
    // query can answer "did the transition fix actually stop the stranding?"
    // without re-deriving it from the code string every time.
    stranded: isTimeout ? false : isPickerStrandedError(anyErr),
    platform: ctx.platform,
    app_version: ctx.appVersion ?? null,
    native_build: ctx.nativeBuild ?? null,
    os_version: ctx.osVersion ?? null,
    interface_idiom: ctx.interfaceIdiom ?? null,
    app_state: ctx.appState ?? null,
  };
}
