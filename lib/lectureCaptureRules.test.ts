import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  addImportantMark,
  builtInMicrophone,
  capturedSeconds,
  micIsDead,
  nearLimit,
  normalizeMeter,
  partFilename,
  partStoragePath,
  reachedLimit,
  shouldCutPart,
  storageAction,
  tooQuiet,
  wallClockExceeded,
} from '@/lib/lectureCaptureRules';

Deno.test('a part is never cut while the app is not active (the 5:00 deaths)', () => {
  assertEquals(shouldCutPart({ appActive: false, partSeconds: 300 }), false);
  assertEquals(shouldCutPart({ appActive: false, partSeconds: 5400 }), false);
  assertEquals(shouldCutPart({ appActive: true, partSeconds: 299 }), false);
  assertEquals(shouldCutPart({ appActive: true, partSeconds: 300 }), true);
  assertEquals(shouldCutPart({ appActive: true, partSeconds: 3000 }), true);
});

const sample = (at: number, nativeRecording: boolean, partSeconds: number) => ({ at, nativeRecording, partSeconds });

Deno.test('dead mic: the recorder says it stopped for the whole window', () => {
  const s = [0, 2000, 4000, 6000, 8000, 9000].map((t) => sample(t, false, 12));
  assertEquals(micIsDead(s, 9000), true);
});

Deno.test('dead mic: "recording" but the clock stood still (the bookkeeping lie)', () => {
  const s = [0, 2000, 4000, 6000, 8000, 9000].map((t) => sample(t, true, 40.2));
  assertEquals(micIsDead(s, 9000), true);
});

Deno.test('live mic: recording and the clock moves', () => {
  const s = [0, 2000, 4000, 6000, 8000, 9000].map((t) => sample(t, true, 40 + t / 1000));
  assertEquals(micIsDead(s, 9000), false);
});

Deno.test('dead mic is not declared before the window is covered', () => {
  const s = [0, 2000, 4000].map((t) => sample(t, false, 0));
  assertEquals(micIsDead(s, 4000), false);
  assertEquals(micIsDead([], 10_000), false);
});

Deno.test('a brief blip inside the window is not a dead mic', () => {
  const s = [
    sample(0, true, 10), sample(2000, false, 12), sample(4000, true, 14), sample(6000, true, 16), sample(8000, true, 18), sample(9000, true, 19),
  ];
  assertEquals(micIsDead(s, 9000), false);
});

Deno.test('captured seconds come from the recorder, not the wall clock', () => {
  assertEquals(capturedSeconds(900, 42.7), 942);
  assertEquals(capturedSeconds(0, -3), 0);
});

Deno.test('limits', () => {
  assertEquals(reachedLimit(5400, 5400), true);
  assertEquals(reachedLimit(5399, 5400), false);
  assertEquals(nearLimit(5100, 5400), true);
  assertEquals(nearLimit(5099, 5400), false);
});

Deno.test('wall clock: the 34-hour session is saved; a normal one is not', () => {
  const start = 1_000_000;
  assertEquals(wallClockExceeded({ startedAtMs: start, nowMs: start + 34 * 3600_000, monotonicElapsedMs: 0, maxSeconds: 5400 }), true);
  assertEquals(wallClockExceeded({ startedAtMs: start, nowMs: start + 110 * 60_000, monotonicElapsedMs: 0, maxSeconds: 5400 }), false);
  assertEquals(wallClockExceeded({ startedAtMs: start, nowMs: start + 121 * 60_000, monotonicElapsedMs: 0, maxSeconds: 5400 }), true);
});

Deno.test('wall clock: a clock set backwards cannot extend the session', () => {
  const start = 10_000_000;
  assertEquals(wallClockExceeded({ startedAtMs: start, nowMs: start - 3600_000, monotonicElapsedMs: 5 * 3600_000, maxSeconds: 5400 }), true);
});

Deno.test('storage thresholds', () => {
  assertEquals(storageAction(1024 * 1024 * 1024), 'ok');
  assertEquals(storageAction(250 * 1024 * 1024), 'warn');
  assertEquals(storageAction(100 * 1024 * 1024), 'cut');
  assertEquals(storageAction(null), 'ok');
});

Deno.test('too quiet over the first minute', () => {
  assertEquals(tooQuiet(Array(30).fill(-52)), true);
  assertEquals(tooQuiet(Array(30).fill(-30)), false);
  assertEquals(tooQuiet(Array(10).fill(-60)), false); // not enough samples to judge
  assertEquals(tooQuiet(Array(30).fill(-160)), false); // no metering, not silence
});

Deno.test('meter normalisation', () => {
  assertEquals(normalizeMeter(-50), 0);
  assertEquals(normalizeMeter(0), 1);
  assertEquals(normalizeMeter(-25), 0.5);
  assertEquals(normalizeMeter(undefined), 0);
});

Deno.test('the built-in microphone is found by port type or name', () => {
  const airpods = { uid: 'BT-1', name: 'AirPods Pro', type: 'BluetoothHFP' };
  const phone = { uid: 'Built-In Microphone', name: 'iPhone Microphone', type: 'MicrophoneBuiltIn' };
  assertEquals(builtInMicrophone([airpods, phone]), phone);
  assertEquals(builtInMicrophone([airpods]), null);
  assertEquals(builtInMicrophone([{ uid: 'x', name: 'iPad Microphone', type: '' }])?.uid, 'x');
});

Deno.test('part names match the server path rule', () => {
  assertEquals(partFilename(7), 'seg_007.m4a');
  assertEquals(partFilename(123), 'seg_123.m4a');
  assertEquals(partStoragePath('owner', 'lec', 3), 'owner/lec/seg_003.m4a');
});

Deno.test('mark important: a double tap is one mark, order kept, capped', () => {
  assertEquals(addImportantMark([], 12.7), [12]);
  assertEquals(addImportantMark([12], 18), [12]);
  assertEquals(addImportantMark([12, 300], 100), [12, 100, 300]);
  const full = Array.from({ length: 200 }, (_, i) => i * 20);
  assertEquals(addImportantMark(full, 99999).length, 200);
});
