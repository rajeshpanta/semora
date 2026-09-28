/**
 * Source checks on the native lecture recorder: the rules here live in Swift
 * and Kotlin, which nothing in this repo can run, and each one fails silently
 * on a device.
 *
 * - The Live Activity attributes are declared twice (the app module and the
 *   widget extension). ActivityKit matches them by name and shape: a field in
 *   one copy only means the widget never draws the activity.
 * - Every request and update carries a stale date, and the widget's stale view
 *   hides Pause and Mark (M4). A nil stale date let a killed app's activity
 *   show "Recording" with a running clock until the next launch.
 * - getStatus reports `active` on both platforms (device-realities-4).
 * - Android reopens a microphone that fails every read, with a capped backoff
 *   (device-realities-2). The Kotlin formula is mirrored here and compared.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

const read = (file: string) => Deno.readTextFile(new URL(file, import.meta.url));

const MODULE_ACTIVITY = '../modules/semora-recorder/ios/LectureRecordingActivity.swift';
const WIDGET_ACTIVITY = '../targets/widget/LectureRecordingActivity.swift';
const IOS_MODULE = '../modules/semora-recorder/ios/SemoraRecorderModule.swift';
const ANDROID_MODULE = '../modules/semora-recorder/android/src/main/java/expo/modules/semorarecorder/SemoraRecorderModule.kt';
const ANDROID_CAPTURE = '../modules/semora-recorder/android/src/main/java/expo/modules/semorarecorder/LectureCapture.kt';
const ANDROID_SERVICE = '../modules/semora-recorder/android/src/main/java/expo/modules/semorarecorder/LectureRecordingService.kt';

/** The body of `struct <name>` up to its matching brace. */
function structBody(source: string, name: string): string {
  const start = source.indexOf(`struct ${name}`);
  assert(start >= 0, `struct ${name} not found`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`struct ${name} is not closed`);
}

/** Stored `public var name: Type` lines, at the struct's own level only. */
function storedProperties(body: string): string[] {
  let depth = 0;
  const out: string[] = [];
  for (const line of body.split('\n')) {
    if (depth === 0) {
      const m = line.match(/^\s*public var (\w+): ([^={]+?)\s*$/);
      if (m) out.push(`${m[1]}: ${m[2]}`);
    }
    for (const ch of line) {
      if (ch === '{') depth++;
      if (ch === '}') depth--;
    }
  }
  return out;
}

Deno.test('Live Activity attributes have the same shape in the app and the widget', async () => {
  const [app, widget] = await Promise.all([read(MODULE_ACTIVITY), read(WIDGET_ACTIVITY)]);
  for (const name of ['LectureRecordingAttributes', 'ContentState']) {
    const a = storedProperties(structBody(app, name));
    const w = storedProperties(structBody(widget, name));
    assert(a.length > 0, `${name}: no properties parsed`);
    assertEquals(a, w, `${name} differs between the module and the widget`);
  }
  for (const intent of ['StopLectureRecordingIntent', 'MarkLectureMomentIntent', 'ToggleLectureRecordingPauseIntent']) {
    assert(app.includes(`struct ${intent}`) && widget.includes(`struct ${intent}`), `${intent} must exist in both targets`);
  }
});

Deno.test('every activity request and update carries a stale date', async () => {
  const app = await read(MODULE_ACTIVITY);
  assert(!/staleDate:\s*nil/.test(app), 'a nil stale date never lets a dead activity go stale');
  const withDate = app.match(/staleDate:\s*LectureActivityController\.staleDate\(\)/g) ?? [];
  assert(withDate.length >= 2, 'request and update both need the stale date');
  // The native heartbeat must beat well inside the stale window.
  const stale = Number(app.match(/staleAfter: TimeInterval = (\d+)/)?.[1]);
  const beat = Number(app.match(/heartbeatSeconds: TimeInterval = (\d+)/)?.[1]);
  assert(stale > 0 && beat > 0 && beat * 2 < stale, `heartbeat ${beat}s vs stale ${stale}s`);
  const ios = await read(IOS_MODULE);
  assert(ios.includes('LectureActivityController.shared.refresh('), 'the capture heartbeat must refresh the activity');
});

Deno.test('the stale widget hides Pause and Mark and stops the clock', async () => {
  const widget = await read(WIDGET_ACTIVITY);
  const guarded = widget.match(/if !context\.isStale \{\s*PauseControl\([^)]*\)\s*MarkControl\([^)]*\)\s*\}/g) ?? [];
  assertEquals(guarded.length, 2, 'lock screen and Dynamic Island both hide Pause/Mark when stale');
  const unguardedPause = (widget.match(/PauseControl\(context:/g) ?? []).length;
  assertEquals(unguardedPause, 2, 'no other Pause control is drawn');
  const elapsed = widget.match(/ElapsedText\(state: context\.state[^)]*\)/g) ?? [];
  assert(elapsed.length >= 3 && elapsed.every((e) => e.includes('isStale: context.isStale')), 'every clock knows it is stale');
});

Deno.test('getStatus reports active on iOS and Android', async () => {
  const [ios, android] = await Promise.all([read(IOS_MODULE), read(ANDROID_MODULE)]);
  assertEquals((ios.match(/"active":/g) ?? []).length, 2, 'both iOS return paths');
  assert(/"active" to \(capture != null\)/.test(android));
});

Deno.test('Android swipe-away reports TASK_REMOVED and notifies before stopping', async () => {
  const service = await read(ANDROID_SERVICE);
  const body = service.slice(service.indexOf('override fun onTaskRemoved'));
  const failure = body.indexOf('"TASK_REMOVED"');
  const notice = body.indexOf('notifyClosed(');
  const stop = body.indexOf('stopCapture()');
  assert(failure >= 0 && notice > failure && stop > notice, 'order: onFailure, notice, then stopCapture');
});

/** Mirror of LectureCapture.autoRestartDelayMs. */
function autoRestartDelayMs(attempt: number): number {
  const step = Math.min(6, Math.max(0, attempt - 1));
  return Math.min(60_000, 1_000 * 2 ** step);
}

Deno.test('Android automatic microphone reopen backs off and is capped', async () => {
  const kotlin = await read(ANDROID_CAPTURE);
  assert(kotlin.includes('val step = (attempt - 1).coerceIn(0, 6)'));
  assert(kotlin.includes('return minOf(60_000L, 1_000L shl step)'));
  assertEquals([1, 2, 3, 4, 5, 6, 7, 8, 50].map(autoRestartDelayMs), [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000]);
  assertEquals(autoRestartDelayMs(0), 1000);
  const n = Number(kotlin.match(/RESTART_AFTER_NEGATIVE_READS = (\d+)/)?.[1]);
  // Each failed read waits 500 ms: reopen within a few seconds, not on the first blip.
  assert(n >= 3 && n * 500 <= 5_000, `negative reads before reopen: ${n}`);
});

// ── iOS: a microphone that an interruption took (2026-09-24) ──────────────
//
// On 09-23 a call, alarm or other app took the microphone 29 minutes into a
// lecture on 1.15.1. The single restart attempt, made the instant the
// interruption ended with Semora in the background, was refused; one ordinary
// notice went unseen and 33 minutes were lost.

const IOS_CAPTURE = '../modules/semora-recorder/ios/LectureCapture.swift';

Deno.test('iOS retries the microphone on a schedule, inside a background task, and a new interruption or Stop cancels it', async () => {
  const swift = await read(IOS_CAPTURE);
  const offsets = swift.match(/recoveryOffsets: \[TimeInterval\] = \[([^\]]+)\]/)?.[1].split(',').map((n) => Number(n.trim()));
  assert(offsets && offsets.length >= 4, 'more than one attempt');
  assertEquals(offsets[0], 0, 'the first attempt is immediate');
  assert(offsets.every((n, i) => i === 0 || n > offsets[i - 1]), 'offsets rise');
  assert(offsets[offsets.length - 1] <= 25, 'the schedule fits in one ~30 s background task');
  assert(swift.includes('beginBackgroundTask(withName: "semora.lecture.recover")'), 'no background task: iOS suspends the app between attempts');
  assert(/func stop\(\) \{\s*recoveryGeneration \+= 1/.test(swift), 'Stop must cancel pending attempts');
  assert(/case \.began:[\s\S]{0,300}recoveryGeneration \+= 1/.test(swift), 'a new interruption must cancel pending attempts');
  assert(swift.includes('if recovering && reason == "ENGINE_CONFIGURATION_CHANGED" { return }'),
    'a configuration change caused by a retry must not restart the schedule');
});

Deno.test('iOS keeps telling the student while the microphone stays stopped, and clears every notice when it comes back', async () => {
  const swift = await read(IOS_CAPTURE);
  const ids = [...swift.matchAll(/"(semora-lecture-capture-stopped(?:-\d)?)"/g)].map((m) => m[1]);
  assertEquals(new Set(ids).size, 3, 'the first notice and two reminders');
  const clear = swift.slice(swift.indexOf('private func clearStoppedNotification()'), swift.indexOf('private func notifyCaptureStopped('));
  assert(clear.includes('LectureCapture.reminderIds'), 'a recovery must clear the reminders too');
  assert(swift.includes('LectureActivityController.shared.alertMicStopped('), 'the Live Activity alert is not raised');
  const activity = await read(MODULE_ACTIVITY);
  assert(/@available\(iOS 16\.2, \*\)\s*func alertMicStopped/.test(activity), 'alerting updates need the 16.2 guard');
});

Deno.test('iOS reports what the OS said, through the existing failure message', async () => {
  const swift = await read(IOS_CAPTURE);
  assert(/code: "RESTART_FAILED_\\\(reason\)", message: message\)/.test(swift), 'the restart failure must carry the report');
  assert(swift.includes('static func report('), 'report() missing');
  assert(swift.includes('static func fourCC('), 'fourCC() missing');
  // Deliberately NOT set until tested on a device: the header says "other
  // alerts" are silenced too, and a student's alarm must never be.
  assert(!swift.includes('setPrefersNoInterruptionsFromSystemAlerts'), 'untested: may silence the student\'s alarms');
});

Deno.test('iOS tells the student even when the background time runs out, and never leaves reminders for a later recording', async () => {
  const swift = await read(IOS_CAPTURE);
  const start = swift.slice(swift.indexOf('func start() throws {'), swift.indexOf('func pause()'));
  assert(start.indexOf('clearStoppedNotification()') >= 0 && start.indexOf('clearStoppedNotification()') < start.indexOf('configureSession()'),
    'start() must clear reminders a killed capture left behind');
  assert(/if index == 0 \{[\s\S]{0,600}queue\.async \{ self\.markStopped\(\) \}\s*notifyCaptureStopped\(after: offsets\[offsets\.count - 1\] \+ 5\)/.test(swift),
    'the first refused try must mark capture stopped and book the notice with the system');
  const expired = swift.slice(swift.indexOf('private func backgroundTaskExpired'), swift.indexOf('private func endBackgroundTask'));
  assert(expired.includes('lastRecoveryFacts'), 'a schedule cut short must still report what iOS said');
  assert(/if state\.stalled \|\| index > 0 \{ chunkHasGap = true \}/.test(swift), 'a clean configuration-change restart must not mark a gap');
});
