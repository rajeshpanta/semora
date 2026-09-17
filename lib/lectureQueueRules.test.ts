import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  decidePart,
  failureStopsPass,
  folderIsFinished,
  LOCAL_GIVE_UP_MS,
  MAX_PART_ATTEMPTS,
  mayDeleteLocalCopy,
  nextAttemptDelayMs,
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
  // the lecture is over either way
  assertEquals(decidePart(base({ server: { status: 'failed', objectExists: false, recoveryAttempts: 0, lectureStatus: 'ready' } })), { action: 'written_off' });
  assertEquals(decidePart(base({ server: { status: 'failed', objectExists: false, recoveryAttempts: null, lectureStatus: 'failed' } })), { action: 'written_off' });
  // still worth a try: the server has attempts left and the lecture is open
  assertEquals(decidePart(base({ server: { status: 'failed', objectExists: false, recoveryAttempts: 2, lectureStatus: 'uploading' } })), { action: 'upload' });
  // a lecture that is ready does not stop a part it never received from arriving late
  assertEquals(decidePart(base({ server: { status: 'none', objectExists: false, lectureStatus: 'ready' } })), { action: 'upload' });
  assertEquals(mayDeleteLocalCopy({ action: 'written_off' }), false);
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

Deno.test('the local copy is deleted only once transcribed (or expired)', () => {
  assertEquals(mayDeleteLocalCopy({ action: 'transcribed' }), true);
  assertEquals(mayDeleteLocalCopy({ action: 'expired' }), true);
  assertEquals(mayDeleteLocalCopy({ action: 'received' }), false);
  assertEquals(mayDeleteLocalCopy({ action: 'upload' }), false);
});

Deno.test('a folder is removed only when nothing is left to deliver', () => {
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
