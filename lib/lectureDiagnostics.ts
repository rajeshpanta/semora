/**
 * Lecture failures that happened while there was nothing to report them to.
 *
 * Phase 1 Step 1 of LECTURE_AUDIO_PLAN.md, last item. `track` fires an insert
 * at Supabase and swallows the result, so an event raised with no signal is
 * simply gone. That is the worst possible place to lose telemetry: the failures
 * this feature cares about are the ones that happen in a lecture hall with no
 * bars, and the analytics were blind to exactly them. On 2026-09-14 the failure
 * for part 7 — the Stop — produced no event at all, while parts 1 and 5 did.
 *
 * So a failure is written to the device first and sent later. Bounded, because
 * a diagnostic buffer that can grow without limit is a bug waiting to fill a
 * student's phone, and old entries are worth less than new ones.
 *
 * Pure: storage arrives as two functions so the ring, the cap, the expiry and
 * the flush ordering can all be tested.
 */

import type { LectureStage, RetryClass } from '@/lib/lectureFailure';

export const DIAGNOSTIC_KEY = 'semora_lecture_diag_v1';
/** Enough to cover a long lecture's worth of parts several times over. */
export const MAX_DIAGNOSTICS = 60;
/** Older than this and nobody is going to act on it. */
export const DIAGNOSTIC_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface LectureDiagnostic {
  /** Epoch ms, so a late flush still says when it actually happened. */
  at: number;
  event: string;
  seq: number;
  stage: LectureStage;
  code: string;
  retry: RetryClass;
  attempt: number;
  status?: number;
}

export interface DiagnosticStorage {
  read(key: string): string | null;
  write(key: string, value: string): void;
}

function parse(raw: string | null): LectureDiagnostic[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is LectureDiagnostic =>
      !!entry && typeof entry === 'object'
      && typeof (entry as LectureDiagnostic).at === 'number'
      && typeof (entry as LectureDiagnostic).event === 'string'
      && typeof (entry as LectureDiagnostic).code === 'string');
  } catch {
    // A truncated write is not worth a crash, and it is not worth keeping.
    return [];
  }
}

/**
 * Append one, drop what is stale, and keep the newest.
 *
 * Returns the list as it was stored, so a caller can act on it without a
 * second read.
 */
export function recordDiagnostic(
  storage: DiagnosticStorage,
  entry: LectureDiagnostic,
  now: number = Date.now(),
): LectureDiagnostic[] {
  const kept = parse(storage.read(DIAGNOSTIC_KEY))
    .filter((e) => now - e.at < DIAGNOSTIC_TTL_MS)
    .concat(entry)
    // Newest wins when the cap bites: an old failure has usually been
    // superseded by whatever happened next.
    .slice(-MAX_DIAGNOSTICS);
  storage.write(DIAGNOSTIC_KEY, JSON.stringify(kept));
  return kept;
}

export function readDiagnostics(
  storage: DiagnosticStorage,
  now: number = Date.now(),
): LectureDiagnostic[] {
  return parse(storage.read(DIAGNOSTIC_KEY)).filter((e) => now - e.at < DIAGNOSTIC_TTL_MS);
}

/**
 * Send what is stored, oldest first, and keep whatever did not go.
 *
 * `send` reports success per entry. An entry that fails stays, so a flush with
 * no signal costs nothing and loses nothing. Entries are cleared BEFORE the
 * sends are awaited would be wrong in the other direction, so the write happens
 * after, with the failures put back.
 */
export async function flushDiagnostics(
  storage: DiagnosticStorage,
  send: (entry: LectureDiagnostic) => Promise<boolean>,
  now: number = Date.now(),
): Promise<{ sent: number; kept: number }> {
  const pending = readDiagnostics(storage, now);
  if (pending.length === 0) {
    storage.write(DIAGNOSTIC_KEY, JSON.stringify([]));
    return { sent: 0, kept: 0 };
  }

  const unsent: LectureDiagnostic[] = [];
  let sent = 0;
  for (const entry of pending) {
    let ok = false;
    try {
      ok = await send(entry);
    } catch {
      ok = false;
    }
    if (ok) sent += 1;
    else unsent.push(entry);
  }
  storage.write(DIAGNOSTIC_KEY, JSON.stringify(unsent));
  return { sent, kept: unsent.length };
}
