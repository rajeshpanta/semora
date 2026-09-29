import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { PART_SECONDS } from '@/lib/lectureCaptureRules';
import {
  decidePart,
  failureStopsPass,
  folderIsFinished,
  LOCAL_GIVE_UP_MS,
  MAX_PART_ATTEMPTS,
  mayDeleteLocalCopy,
  nextAttemptDelayMs,
  shouldRestoreWrittenOffPart,
  unsavedCaptureWasLost,
  type PartDecisionInput,
} from '@/lib/lectureQueueRules';

const NOW = 1_800_000_000_000;
const base = (over: Partial<PartDecisionInput> = {}): PartDecisionInput => ({
  journalOwnerId: 'owner',
  signedInUserId: 'owner',
  discardIntent: false,
  part: { state: 'saved_locally', attemptCount: 0, nextAttemptAt: null, firstSeenAt: NOW - 60_000 },
  server: { status: 'none', objectExists: false },
  now: NOW,
  ...over,
});

Deno.test('a part with no server row is uploaded', () => {
  assertEquals(decidePart(base()), { action: 'upload' });
});

Deno.test('audio is never uploaded as another account, and never while signed out', () => {
  assertEquals(decidePart(base({ signedInUserId: 'someone-else' })), { action: 'skip', reason: 'not_owner' });
  assertEquals(decidePart(base({ signedInUserId: null })), { action: 'skip', reason: 'no_session' });
});

Deno.test('a discarded recording never comes back', () => {
  assertEquals(decidePart(base({ discardIntent: true })), { action: 'skip', reason: 'discarded' });
});

Deno.test('offline: nothing is decided from silence', () => {
  assertEquals(decidePart(base({ server: null })), { action: 'skip', reason: 'unknown_server' });
});

Deno.test('the server is the authority on what it has', () => {
  assertEquals(decidePart(base({ server: { status: 'done', objectExists: null } })), { action: 'transcribed' });
  assertEquals(decidePart(base({ server: { status: 'transcribing', objectExists: true } })), { action: 'received' });
  assertEquals(decidePart(base({ server: { status: 'uploaded', objectExists: true } })), { action: 'received' });
  // a row that says uploaded but whose object is gone is uploaded again
  assertEquals(decidePart(base({ server: { status: 'uploaded', objectExists: false } })), { action: 'upload' });
  // written off before the audio arrived
  assertEquals(decidePart(base({ server: { status: 'failed', objectExists: false } })), { action: 'upload' });
  assertEquals(decidePart(base({ server: { status: 'pending', objectExists: false } })), { action: 'upload' });
});

Deno.test('a part the server has given up on is written off, not re-sent forever', () => {
  // three server recoveries spent
  assertEquals(decidePart(base({ server: { status: 'failed', objectExists: false, recoveryAttempts: 3 } })), { action: 'written_off' });
  // a lecture that is over is NOT a write-off: the phone may hold the only copy
  assertEquals(decidePart(base({ server: { status: 'failed', objectExists: false, recoveryAttempts: 0, lectureStatus: 'ready' } })), { action: 'upload' });
  assertEquals(decidePart(base({ server: { status: 'failed', objectExists: false, recoveryAttempts: null, lectureStatus: 'failed' } })), { action: 'upload' });
  // the bytes are already on the server: its recovery pass claims them, the phone waits
  assertEquals(decidePart(base({ server: { status: 'failed', objectExists: true, recoveryAttempts: 0, lectureStatus: 'ready' } })), { action: 'received' });
  // three attempts spent is final even with the object there
  assertEquals(decidePart(base({ server: { status: 'failed', objectExists: true, recoveryAttempts: 3, lectureStatus: 'ready' } })), { action: 'written_off' });
  // storage could not be checked: the upload path (create-only upload treats "exists" as success)
  assertEquals(decidePart(base({ server: { status: 'failed', objectExists: null, recoveryAttempts: 1, lectureStatus: 'ready' } })), { action: 'upload' });
  // still worth a try: the server has attempts left and the lecture is open
  assertEquals(decidePart(base({ server: { status: 'failed', objectExists: false, recoveryAttempts: 2, lectureStatus: 'uploading' } })), { action: 'upload' });
  // a lecture that is ready does not stop a part it never received from arriving late
  assertEquals(decidePart(base({ server: { status: 'none', objectExists: false, lectureStatus: 'ready' } })), { action: 'upload' });
});

Deno.test('retries are bounded, then the student is asked', () => {
  const part = { state: 'saved_locally' as const, attemptCount: MAX_PART_ATTEMPTS, nextAttemptAt: null, firstSeenAt: NOW - 60_000 };
  assertEquals(decidePart(base({ part })), { action: 'needs_attention' });
});

Deno.test('backoff is respected', () => {
  const part = { state: 'saved_locally' as const, attemptCount: 2, nextAttemptAt: NOW + 10_000, firstSeenAt: NOW - 60_000 };
  assertEquals(decidePart(base({ part })), { action: 'skip', reason: 'backoff' });
});

Deno.test('undeliverable audio is given up after 7 days from when the queue first saw it', () => {
  const part = { state: 'saved_locally' as const, attemptCount: 3, nextAttemptAt: null, firstSeenAt: NOW - LOCAL_GIVE_UP_MS - 1 };
  assertEquals(decidePart(base({ part })), { action: 'expired' });
  // an old file that the queue only just found is NOT expired (c199acd0's parts)
  const found = { state: 'saved_locally' as const, attemptCount: 0, nextAttemptAt: null, firstSeenAt: NOW - 1000 };
  assertEquals(decidePart(base({ part: found })), { action: 'upload' });
});

Deno.test('the local copy is deleted only once transcribed (or expired, or written off)', () => {
  assertEquals(mayDeleteLocalCopy({ action: 'transcribed' }), true);
  assertEquals(mayDeleteLocalCopy({ action: 'expired' }), true);
  assertEquals(mayDeleteLocalCopy({ action: 'written_off' }), true);
  assertEquals(mayDeleteLocalCopy({ action: 'needs_attention' }), false);
  assertEquals(mayDeleteLocalCopy({ action: 'skip', reason: 'quarantined' }), false);
  assertEquals(mayDeleteLocalCopy({ action: 'received' }), false);
  assertEquals(mayDeleteLocalCopy({ action: 'upload' }), false);
});

Deno.test('quarantined audio still on the phone expires after 7 days; already-gone audio is left alone', () => {
  const eightDaysAgo = NOW - 8 * 24 * 60 * 60 * 1000;
  const held = { state: 'quarantined' as const, attemptCount: 1, nextAttemptAt: null, firstSeenAt: eightDaysAgo, lastFailureStage: 'register' };
  assertEquals(decidePart(base({ part: held })), { action: 'expired' });
  // offline does not keep it: the privacy promise needs no server
  assertEquals(decidePart(base({ part: held, server: null })), { action: 'expired' });
  // already expired (or the file vanished): no repeat expiry on every pass
  assertEquals(decidePart(base({ part: { ...held, lastFailureStage: 'local_commit' } })), { action: 'skip', reason: 'quarantined' });
  // younger than 7 days, or never stamped: kept
  assertEquals(decidePart(base({ part: { ...held, firstSeenAt: NOW - 60_000 } })), { action: 'skip', reason: 'quarantined' });
  assertEquals(decidePart(base({ part: { ...held, firstSeenAt: null } })), { action: 'skip', reason: 'quarantined' });
  // another account's audio is still never touched
  assertEquals(decidePart(base({ part: held, signedInUserId: 'someone-else' })), { action: 'skip', reason: 'not_owner' });
});

Deno.test('a folder is removed only when nothing is left to deliver', () => {
  // written-off parts whose files were deleted: the folder can go
  assertEquals(folderIsFinished({ audioFilesPresent: 0, discardIntent: false, parts: [{ state: 'quarantined' }, { state: 'quarantined' }] }), true);
  assertEquals(folderIsFinished({ audioFilesPresent: 1, discardIntent: false, parts: [{ state: 'quarantined' }] }), false);
  assertEquals(folderIsFinished({ audioFilesPresent: 0, discardIntent: false, parts: [{ state: 'transcribed' }, { state: 'quarantined' }] }), true);
  assertEquals(folderIsFinished({ audioFilesPresent: 1, discardIntent: false, parts: [{ state: 'transcribed' }] }), false);
  assertEquals(folderIsFinished({ audioFilesPresent: 0, discardIntent: false, parts: [{ state: 'server_received' }] }), false);
  assertEquals(folderIsFinished({ audioFilesPresent: 0, discardIntent: true, parts: [{ state: 'saved_locally' }] }), true);
});

Deno.test('network and account failures stop the pass; a bad file does not', () => {
  assertEquals(failureStopsPass('retry'), true);
  assertEquals(failureStopsPass('wait_for_auth'), true);
  assertEquals(failureStopsPass('permanent'), false);
});

Deno.test('backoff grows and is capped', () => {
  assertEquals(nextAttemptDelayMs(1, () => 0.5), 30_000);
  assertEquals(nextAttemptDelayMs(3, () => 0.5), 120_000);
  assertEquals(nextAttemptDelayMs(20, () => 0.5), 1_800_000);
});

Deno.test('parts wrongly written off by the old rule are restored while the server has recoveries left', () => {
  const part = { state: 'quarantined' as const, writtenOff: true, lastFailureStage: 'register' };
  assertEquals(shouldRestoreWrittenOffPart({ part, server: { status: 'failed', recoveryAttempts: 0 } }), true);
  assertEquals(shouldRestoreWrittenOffPart({ part, server: { status: 'failed', recoveryAttempts: null } }), true);
  assertEquals(shouldRestoreWrittenOffPart({ part, server: { status: 'failed', recoveryAttempts: 2 } }), true);
  // the server really gave up: stays written off
  assertEquals(shouldRestoreWrittenOffPart({ part, server: { status: 'failed', recoveryAttempts: 3 } }), false);
  // not failed any more, or the server could not be read: nothing to repair from
  assertEquals(shouldRestoreWrittenOffPart({ part, server: { status: 'done', recoveryAttempts: 0 } }), false);
  assertEquals(shouldRestoreWrittenOffPart({ part, server: null }), false);
  // the file is already gone
  assertEquals(shouldRestoreWrittenOffPart({ part: { ...part, lastFailureStage: 'local_commit' }, server: { status: 'failed', recoveryAttempts: 0 } }), false);
  // a quarantine that is not a write-off (a permanent upload refusal) is not this repair's business
  assertEquals(shouldRestoreWrittenOffPart({ part: { ...part, writtenOff: false }, server: { status: 'failed', recoveryAttempts: 0 } }), false);
  assertEquals(shouldRestoreWrittenOffPart({ part: { ...part, state: 'saved_locally' }, server: { status: 'failed', recoveryAttempts: 0 } }), false);
  // a restored part then uploads under the new rule
  assertEquals(decidePart(base({ server: { status: 'failed', objectExists: false, recoveryAttempts: 0, lectureStatus: 'ready' } })), { action: 'upload' });
});

Deno.test('a capture that saved nothing is reported only when it ran longer than one part', () => {
  assertEquals(unsavedCaptureWasLost(NOW - PART_SECONDS * 1000 - 1, NOW), true);
  // Killed 20 s in, reopened an hour later: the recorder's last write was 20 s after Start.
  assertEquals(unsavedCaptureWasLost(NOW - 60 * 60 * 1000, NOW - 60 * 60 * 1000 + 20_000), false);
  assertEquals(unsavedCaptureWasLost(NOW - 60 * 60 * 1000, null), false);
  assertEquals(unsavedCaptureWasLost(NOW - 2 * 60 * 60 * 1000, NOW), true);
  // a kill inside the first part stays a silent abandon
  assertEquals(unsavedCaptureWasLost(NOW - PART_SECONDS * 1000, NOW), false);
  assertEquals(unsavedCaptureWasLost(NOW - 30_000, NOW), false);
  // no start time: nothing claimed
  assertEquals(unsavedCaptureWasLost(null, NOW), false);
  assertEquals(unsavedCaptureWasLost(undefined, NOW), false);
  assertEquals(unsavedCaptureWasLost(0, NOW), false);
});
