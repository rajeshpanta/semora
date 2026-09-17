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
  if (part.state === 'quarantined') return { action: 'skip', reason: 'quarantined' };

  if (server === null) return { action: 'skip', reason: 'unknown_server' };

  // The server is the authority on what it has.
  if (server.status === 'done') return { action: 'transcribed' };
  if (server.status === 'transcribing') return { action: 'received' };
  if (server.status === 'uploaded' && server.objectExists !== false) return { action: 'received' };

  // A part the server refused deterministically (a provider 4xx on that file,
  // a file too long, an allowance write-off) and gave up on, or whose lecture
  // is already over: sending the bytes again only starts the same loop again.
  // The student is told instead (needs attention), and may retry by hand.
  if (server.status === 'failed') {
    const serverGaveUp = (server.recoveryAttempts ?? 0) >= SERVER_WRITE_OFF_ATTEMPTS;
    const lectureOver = server.lectureStatus === 'ready' || server.lectureStatus === 'failed';
    if (serverGaveUp || lectureOver) return { action: 'written_off' };
  }

  const firstSeen = part.firstSeenAt ?? null;
  if (firstSeen !== null && now - firstSeen > LOCAL_GIVE_UP_MS) return { action: 'expired' };

  if (part.attemptCount >= MAX_PART_ATTEMPTS) return { action: 'needs_attention' };
  if (part.nextAttemptAt !== null && part.nextAttemptAt > now) return { action: 'skip', reason: 'backoff' };

  // none / pending / failed, or 'uploaded' whose object is gone: send the bytes.
  return { action: 'upload' };
}

/**
 * May the phone delete its copy of this part?
 *
 * Only once the server has TRANSCRIBED it. A row that says 'uploaded' proves
 * the bytes arrived; it does not prove they will be transcribed (a provider
 * outage, a write-off), and the phone's copy is what makes those recoverable.
 * An expired part is deleted too: the privacy promise outranks the retry.
 */
export function mayDeleteLocalCopy(decision: PartDecision): boolean {
  return decision.action === 'transcribed' || decision.action === 'expired';
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
