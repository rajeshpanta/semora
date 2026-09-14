/**
 * Naming lecture failures, so a failure is never just "it did not work".
 *
 * Phase 1 Step 1 of LECTURE_AUDIO_PLAN.md. Over the seven days to 2026-09-14
 * there were fourteen `lecture_segment_upload_failed` events and every single
 * one carried `code: null` or `code: ""`. Four students lost audio and nothing
 * recorded why. A missing code becomes a deliberate `UNKNOWN_<STAGE>` here, so
 * the next fourteen at least say where they died.
 *
 * Pure on purpose: no react-native, no network, no filesystem.
 */

/** Where in the pipeline a part was when it failed. */
export type LectureStage =
  | 'capture_prepare'
  | 'capture_finalize'
  | 'local_commit'
  | 'session'
  | 'register'
  | 'sign_url'
  | 'transfer'
  | 'acknowledge'
  | 'transcribe_dispatch'
  | 'finish_declare'
  | 'reconcile';

/**
 * What the caller should do next.
 *
 * `retry` is the ordinary case: try again later, the part is still good.
 * `wait_for_auth` means the account is the blocker, so retrying on a timer is
 * pointless until a session exists. `permanent` means this part will never
 * succeed and should be quarantined rather than spun on forever.
 */
export type RetryClass = 'retry' | 'wait_for_auth' | 'permanent';

export interface LectureFailure {
  stage: LectureStage;
  code: string;
  retry: RetryClass;
  status?: number;
}

const AUTH_PATTERNS = [
  'not authenticated',
  'jwt expired',
  'invalid claim',
  'refresh token',
  'auth session missing',
];

const NETWORK_PATTERNS = [
  'network request failed',
  'timeout',
  'timed out',
  'connection',
  'offline',
  'socket',
];

const MISSING_FILE_PATTERNS = [
  'no such file',
  'file does not exist',
  'could not be read',
  'enoent',
];

function textOf(err: unknown): string {
  if (err == null) return '';
  if (typeof err === 'string') return err.toLowerCase();
  const e = err as { message?: unknown; error?: unknown };
  const parts = [e.message, e.error].filter((p) => typeof p === 'string') as string[];
  return parts.join(' ').toLowerCase();
}

function codeOf(err: unknown): string | null {
  const e = err as { code?: unknown } | null;
  if (e && typeof e.code === 'string' && e.code.trim() !== '') return e.code.trim();
  return null;
}

function statusOf(err: unknown): number | undefined {
  const e = err as { status?: unknown; statusCode?: unknown } | null;
  if (!e) return undefined;
  if (typeof e.status === 'number') return e.status;
  if (typeof e.statusCode === 'number') return e.statusCode;
  return undefined;
}

/**
 * Turn whatever was thrown into a stage, a code and a retry class.
 *
 * The stage always comes from the caller, because only the caller knows where
 * it was. Everything else is inferred, and the inference is deliberately
 * conservative: when nothing matches, the answer is `UNKNOWN_<STAGE>` and
 * `retry`, never an empty string and never `permanent`.
 */
export function classifyLectureFailure(err: unknown, stage: LectureStage): LectureFailure {
  const status = statusOf(err);
  const text = textOf(err);
  const explicit = codeOf(err);

  // A server code we already understand wins: those are localised, deliberate
  // and more specific than anything guessed from a message.
  if (explicit) {
    const retry: RetryClass =
      explicit === 'FREE_LECTURE_USED' || explicit === 'NO_TEXT' ? 'permanent'
      : explicit === 'PROVIDER_BUSY' ? 'retry'
      : 'retry';
    return { stage, code: explicit, retry, status };
  }

  if (AUTH_PATTERNS.some((p) => text.includes(p)) || status === 401 || status === 403) {
    return { stage, code: 'AUTH_UNAVAILABLE', retry: 'wait_for_auth', status };
  }

  if (MISSING_FILE_PATTERNS.some((p) => text.includes(p))) {
    // The bytes are gone. Spinning on this forever only burns battery.
    return { stage, code: 'LOCAL_FILE_MISSING', retry: 'permanent', status };
  }

  if (NETWORK_PATTERNS.some((p) => text.includes(p))) {
    return { stage, code: 'NETWORK_UNAVAILABLE', retry: 'retry', status };
  }

  if (status === 429) return { stage, code: 'RATE_LIMITED', retry: 'retry', status };
  if (status === 413) return { stage, code: 'PAYLOAD_TOO_LARGE', retry: 'permanent', status };
  if (status !== undefined && status >= 500) {
    return { stage, code: 'SERVER_ERROR', retry: 'retry', status };
  }
  if (status !== undefined && status >= 400) {
    return { stage, code: 'STORAGE_REFUSED', retry: 'retry', status };
  }

  return { stage, code: `UNKNOWN_${stage.toUpperCase()}`, retry: 'retry', status };
}

/** The shape that goes into analytics. Never carries a path, URL or transcript. */
export function failureProperties(failure: LectureFailure, seq: number, attempt: number) {
  return {
    seq,
    stage: failure.stage,
    code: failure.code,
    retry: failure.retry,
    attempt,
    ...(failure.status !== undefined ? { status: failure.status } : {}),
  };
}

/** `seg_007.m4a` → 7. Anything else → null. */
export function segmentSeqFromFilename(name: string): number | null {
  const match = /^seg_(\d{3})\.m4a$/.exec(name);
  if (!match) return null;
  const seq = Number(match[1]);
  return Number.isInteger(seq) && seq >= 0 ? seq : null;
}
