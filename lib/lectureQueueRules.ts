/**
 * What the upload queue does with one saved part, as a pure decision.
 *
 * Record Lecture completion plan, step 2.8. The queue that shipped on the
 * 09-14 branch had six defects this replaces with explicit rules:
 *
 *   - it retried every account's parts as whoever was signed in (a second
 *     student on the same phone retried the first one's audio forever);
 *   - it retried without limit;
 *   - it kept every lecture folder forever and re-scanned all of them on every
 *     foreground;
 *   - a discarded recording could come back;
 *   - it deleted the phone's copy on a receipt that did not prove the server
 *     would ever transcribe the part;
 *   - and nothing ever gave up on audio that could not be delivered, although
 *     the privacy policy says audio is not kept.
 *
 * No react-native, no expo, no network: tested in lectureQueueRules.test.ts.
 */

import { PART_SECONDS } from '@/lib/lectureCaptureRules';

/** Upload attempts before a part asks the student for attention instead of retrying on its own. */
export const MAX_PART_ATTEMPTS = 10;
/**
 * How long an undeliverable part is kept on the phone, counted from when the
 * queue first saw it — never from the file's age, which says nothing about how
 * long delivery has been attempted.
 */
export const LOCAL_GIVE_UP_MS = 7 * 24 * 60 * 60 * 1000;

/** The server's view of a part, when the queue could read it. */
export type ServerPartStatus = 'none' | 'pending' | 'uploaded' | 'transcribing' | 'done' | 'failed';

export type LocalPartState =
  | 'saved_locally'
  | 'queued'
  | 'transferring'
  | 'awaiting_ack'
  | 'server_received'
  | 'transcribed'
  | 'quarantined';

export type PartDecision =
  | { action: 'skip'; reason: 'not_owner' | 'no_session' | 'discarded' | 'quarantined' | 'backoff' | 'unknown_server' }
  | { action: 'upload' }
  | { action: 'received' }
  | { action: 'transcribed' }
  | { action: 'needs_attention' }
  | { action: 'expired' }
  /** The server has given this part up for good: re-sending it changes nothing. */
  | { action: 'written_off' };

/**
 * Server recovery attempts at which a 'failed' part is final. Mirrors the
 * server's own give-up (migration 142: three recover calls, then it stops).
 */
export const SERVER_WRITE_OFF_ATTEMPTS = 3;

export interface PartDecisionInput {
  journalOwnerId: string;
  signedInUserId: string | null;
  discardIntent: boolean;
  part: {
    state: LocalPartState;
    attemptCount: number;
    nextAttemptAt: number | null;
    firstSeenAt?: number | null;
    /**
     * Why a quarantined part is quarantined. 'local_commit' means its file is
     * already gone (or was deleted on expiry), so there is nothing left to expire.
     */
    lastFailureStage?: string | null;
  };
  /** null when the server could not be asked (offline): nothing is decided from silence. */
  server: {
    status: ServerPartStatus;
    objectExists: boolean | null;
    /** The server's own retries on this part (migration 142). Absent on older rows. */
    recoveryAttempts?: number | null;
    /** The lecture row's status, when the queue read it. */
    lectureStatus?: string | null;
  } | null;
  now: number;
}

export function decidePart(input: PartDecisionInput): PartDecision {
  const { part, server, now } = input;

  if (input.discardIntent) return { action: 'skip', reason: 'discarded' };
  // Audio belongs to the account that recorded it. It is never uploaded as
  // anyone else, and it is kept (not deleted) while someone else is signed in.
  if (!input.signedInUserId) return { action: 'skip', reason: 'no_session' };
  if (input.signedInUserId !== input.journalOwnerId) return { action: 'skip', reason: 'not_owner' };
  if (part.state === 'transcribed') return { action: 'transcribed' };
  if (part.state === 'quarantined') {
    // A quarantined part whose file may still be on the phone (a permanent
    // upload refusal, a write-off) is held to the same 7-day promise as any
    // other undeliverable audio. Once expired its stage is 'local_commit', so
    // this does not fire again on the next pass.
    const fs = part.firstSeenAt ?? null;
    if (part.lastFailureStage !== 'local_commit' && fs !== null && now - fs > LOCAL_GIVE_UP_MS) return { action: 'expired' };
    return { action: 'skip', reason: 'quarantined' };
  }

  if (server === null) return { action: 'skip', reason: 'unknown_server' };

  // The server is the authority on what it has.
  if (server.status === 'done') return { action: 'transcribed' };
  if (server.status === 'transcribing') return { action: 'received' };
  if (server.status === 'uploaded' && server.objectExists !== false) return { action: 'received' };

  // A 'failed' part is final only once the server has spent its own recovery
  // attempts on it (migration 142): sending the bytes again only starts the
  // same loop again. A lecture that is already 'ready' or 'failed' is NOT
  // enough — the phone may hold the only copy of a part that never arrived,
  // and the server folds late parts back in (foldInLateParts).
  //   - bytes already on the server: the recovery pass claims a failed part
  //     whose object exists, so the phone only waits;
  //   - bytes not there: upload. The upsert moves failed back to pending
  //     (allowed by the 145 client-columns trigger), and LOCAL_GIVE_UP_MS
  //     below still ends it after 7 days.
  // The 7-day promise holds whatever the server is still doing with a part
  // it has not transcribed.
  const firstSeen = part.firstSeenAt ?? null;
  if (firstSeen !== null && now - firstSeen > LOCAL_GIVE_UP_MS) return { action: 'expired' };

  if (server.status === 'failed') {
    if ((server.recoveryAttempts ?? 0) >= SERVER_WRITE_OFF_ATTEMPTS) return { action: 'written_off' };
    if (server.objectExists === true) return { action: 'received' };
  }

  if (part.attemptCount >= MAX_PART_ATTEMPTS) return { action: 'needs_attention' };
  if (part.nextAttemptAt !== null && part.nextAttemptAt > now) return { action: 'skip', reason: 'backoff' };

  // none / pending / failed, or 'uploaded' whose object is gone: send the bytes.
  return { action: 'upload' };
}

/**
 * Should a part an earlier queue wrote off be given back to the queue?
 *
 * The queue that shipped before M1 wrote a part off as soon as its lecture was
 * 'ready' or 'failed', although the server still had recoveries left and the
 * phone held the only copy. Those parts are restored: attempts reset, back to
 * saved_locally. A part whose file is already gone ('local_commit') has nothing
 * to send, so it stays as it is. uploadPart still checks the file itself.
 */
export function shouldRestoreWrittenOffPart(input: {
  part: { state: LocalPartState; writtenOff?: boolean; lastFailureStage?: string | null };
  server: { status: ServerPartStatus; recoveryAttempts?: number | null } | null;
}): boolean {
  const { part, server } = input;
  return part.state === 'quarantined' &&
    part.writtenOff === true &&
    part.lastFailureStage !== 'local_commit' &&
    server !== null &&
    server.status === 'failed' &&
    (server.recoveryAttempts ?? 0) < SERVER_WRITE_OFF_ATTEMPTS;
}

/**
 * A capture that died before saving any part: is it worth telling the student?
 *
 * Only when it ran longer than one part. A kill inside the first part was
 * always abandoned silently (a Start and an immediate close); a capture that
 * ran past a part boundary and still saved nothing is a lost lecture — on
 * 1.13/1.14 an app kill with the phone locked — and silence would hide it.
 * An unknown start time says nothing, so nothing is claimed.
 */
export function unsavedCaptureWasLost(
  startedAtMs: number | null | undefined,
  lastCaptureActivityMs: number | null | undefined,
): boolean {
  // Measured to the last moment the recorder was seen writing, NOT to when the
  // queue next runs: a capture killed 20 seconds in and reopened an hour later
  // lost nothing worth telling the student about. Unknown activity: silent.
  return typeof startedAtMs === 'number' && startedAtMs > 0 &&
    typeof lastCaptureActivityMs === 'number' && lastCaptureActivityMs - startedAtMs > PART_SECONDS * 1000;
}

/**
 * May the phone delete its copy of this part?
 *
 * Only once the server has TRANSCRIBED it. A row that says 'uploaded' proves
 * the bytes arrived; it does not prove they will be transcribed (a provider
 * outage), and the phone's copy is what makes those recoverable.
 * An expired part is deleted too: the privacy promise outranks the retry.
 * So is a written-off part: it is only written off once the server spent its
 * own three recoveries on it, and a manual retry never resends it.
 */
export function mayDeleteLocalCopy(decision: PartDecision): boolean {
  return decision.action === 'transcribed' || decision.action === 'expired' || decision.action === 'written_off';
}

/**
 * Is a lecture's folder finished with?
 *
 * True when no audio file is left in it and nothing in its journal is still
 * waiting to be delivered. The folder — journal included — is then removed, so
 * the queue stops visiting it on every foreground.
 */
export function folderIsFinished(input: {
  audioFilesPresent: number;
  discardIntent: boolean;
  parts: { state: LocalPartState }[];
}): boolean {
  if (input.audioFilesPresent > 0) return false;
  if (input.discardIntent) return true;
  return input.parts.every((p) => p.state === 'transcribed' || p.state === 'quarantined');
}

/**
 * Should a failure stop the whole pass?
 *
 * A failure that is about the network or the account blocks every other part
 * too, so the pass ends and waits for the next trigger. A failure about this
 * one file does not, and the other parts get their turn.
 */
export function failureStopsPass(retry: 'retry' | 'wait_for_auth' | 'permanent'): boolean {
  return retry !== 'permanent';
}

/** Bounded exponential backoff with jitter (30 s → 30 min). */
export function nextAttemptDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 30 * 60_000);
  return Math.round(base * (0.75 + random() * 0.5));
}
