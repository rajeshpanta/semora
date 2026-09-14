/**
 * Run with:
 *   ~/.deno/bin/deno test --no-lock --sloppy-imports --config lib/deno.test.json lib/lectureFailure.test.ts
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  classifyLectureFailure,
  failureProperties,
  segmentSeqFromFilename,
} from './lectureFailure.ts';

// The whole point: fourteen failures in seven days, every one with no code.
Deno.test('an unrecognisable failure still names its stage', () => {
  const f = classifyLectureFailure(new Error('something odd'), 'transfer');
  assertEquals(f.code, 'UNKNOWN_TRANSFER');
  assertEquals(f.stage, 'transfer');
  assertEquals(f.retry, 'retry');
});

Deno.test('nothing at all still produces a code', () => {
  assertEquals(classifyLectureFailure(undefined, 'register').code, 'UNKNOWN_REGISTER');
  assertEquals(classifyLectureFailure(null, 'session').code, 'UNKNOWN_SESSION');
  assertEquals(classifyLectureFailure({}, 'acknowledge').code, 'UNKNOWN_ACKNOWLEDGE');
});

Deno.test('an empty string code is not treated as a code', () => {
  const f = classifyLectureFailure(Object.assign(new Error('x'), { code: '' }), 'transfer');
  assertEquals(f.code, 'UNKNOWN_TRANSFER');
});

Deno.test('a real server code wins', () => {
  const err = Object.assign(new Error('out of free lectures'), { code: 'FREE_LECTURE_USED' });
  const f = classifyLectureFailure(err, 'register');
  assertEquals(f.code, 'FREE_LECTURE_USED');
  assertEquals(f.retry, 'permanent');
});

// This is the shape of the failures with no signed-in user on 2026-09-14.
Deno.test('a missing session waits for auth rather than spinning', () => {
  const f = classifyLectureFailure(new Error('Not authenticated'), 'session');
  assertEquals(f.code, 'AUTH_UNAVAILABLE');
  assertEquals(f.retry, 'wait_for_auth');
});

Deno.test('a 401 is auth even when the message says nothing', () => {
  const f = classifyLectureFailure({ status: 401, message: 'no' }, 'transfer');
  assertEquals(f.code, 'AUTH_UNAVAILABLE');
  assertEquals(f.retry, 'wait_for_auth');
});

Deno.test('the network is retried, a vanished file is not', () => {
  assertEquals(classifyLectureFailure(new Error('Network request failed'), 'transfer').retry, 'retry');
  const gone = classifyLectureFailure(new Error('ENOENT: no such file'), 'transfer');
  assertEquals(gone.code, 'LOCAL_FILE_MISSING');
  assertEquals(gone.retry, 'permanent');
});

Deno.test('status codes map to their own meanings', () => {
  assertEquals(classifyLectureFailure({ status: 429 }, 'transfer').code, 'RATE_LIMITED');
  assertEquals(classifyLectureFailure({ status: 413 }, 'transfer').code, 'PAYLOAD_TOO_LARGE');
  assertEquals(classifyLectureFailure({ status: 500 }, 'transfer').code, 'SERVER_ERROR');
  assertEquals(classifyLectureFailure({ status: 404 }, 'transfer').code, 'STORAGE_REFUSED');
  assertEquals(classifyLectureFailure({ status: 413 }, 'transfer').retry, 'permanent');
});

Deno.test('analytics properties carry no path, url or transcript', () => {
  const props = failureProperties(
    classifyLectureFailure({ status: 500, message: 'boom' }, 'transfer'),
    3,
    2,
  );
  assertEquals(props, { seq: 3, stage: 'transfer', code: 'SERVER_ERROR', retry: 'retry', attempt: 2, status: 500 });
});

Deno.test('segment filenames parse, and nothing else does', () => {
  assertEquals(segmentSeqFromFilename('seg_000.m4a'), 0);
  assertEquals(segmentSeqFromFilename('seg_007.m4a'), 7);
  assertEquals(segmentSeqFromFilename('seg_199.m4a'), 199);
  assertEquals(segmentSeqFromFilename('seg_7.m4a'), null);
  assertEquals(segmentSeqFromFilename('seg_007.mp3'), null);
  assertEquals(segmentSeqFromFilename('.DS_Store'), null);
  assertEquals(segmentSeqFromFilename('seg_007.m4a.tmp'), null);
});
