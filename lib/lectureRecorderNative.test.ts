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


// ── iOS: the microphone after an interruption (2026-09 fix) ─────────────────
// 1.15.1 made one restart attempt when an interruption ended in the
// background, on the engine iOS had stopped, with no background time, and
// dropped the OS error: two lectures lost audio until the app was reopened,
// one of them 33 minutes. Each rule below fails silently on a device, and
// Swift cannot run here, so each one is checked in the source.

const IOS_CAPTURE = '../modules/semora-recorder/ios/LectureCapture.swift';

/** The body of `func <name>(` up to its matching brace. */
function funcBody(source: string, name: string): string {
  const start = source.indexOf(`func ${name}(`);
  assert(start >= 0, `func ${name} not found`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`func ${name} is not closed`);
}

/** Swift source with comments removed, so a rule cannot be met by a comment. */
function code(source: string): string {
  return source.split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
}

/** Asserts each needle occurs in `body`, in this order. */
function assertOrder(body: string, needles: string[], what: string) {
  let at = -1;
  for (const needle of needles) {
    const next = body.indexOf(needle, at + 1);
    assert(next > at, `${what}: "${needle}" missing or out of order`);
    at = next;
  }
}

function count(haystack: string, needle: string | RegExp): number {
  if (typeof needle === 'string') return haystack.split(needle).length - 1;
  return (haystack.match(new RegExp(needle.source, needle.flags.includes('g') ? needle.flags : needle.flags + 'g')) ?? []).length;
}

const swiftSource = () => read(IOS_CAPTURE).then(code);

Deno.test('iOS: the recording session stays mixable, the only kind iOS lets resume in the background', async () => {
  const swift = await swiftSource();
  const categories = swift.match(/setCategory\([^)]*\)/g) ?? [];
  assert(categories.length >= 1, 'a category is set');
  // A non-mixable session going active in the background is refused ('!int').
  assert(categories.every((c) => c.includes('.mixWithOthers')), categories.join('\n'));
});

Deno.test('iOS: a recovery never re-sets an unchanged category (the measured cause of the 1.15.1 failures)', async () => {
  // On a device, after Siri, setCategory from the background with the category
  // the session already had threw '!int' and left the session with no options,
  // so every activation after it failed too. Skipping it, recovery worked first try.
  const swift = await swiftSource();
  const configure = funcBody(swift, 'configureSession');
  assert(/configureSession\(recovering: Bool = false\)/.test(swift), 'configureSession(recovering:) defaults to setting the category');
  assert(/let alreadySet = session\.category == \.playAndRecord && session\.mode == \.default\s*&& session\.categoryOptions == \[\.mixWithOthers, \.defaultToSpeaker\]/.test(configure),
    'alreadySet compares category, mode AND options, with the same options setCategory uses');
  assert(/if !\(recovering && alreadySet\) \{\s*try step\("set_category"\)/.test(configure), 'the category is skipped only when recovering and already set');
  assertOrder(configure, ['alreadySet', 'setCategory(', 'setActive(true)'], 'the check comes before setCategory; activation always runs');
  assert(!/setActive\(true\)[^\n]*\n?[^\n]*alreadySet/.test(configure), 'activation is never skipped');
  // ...and never sits inside a condition: every brace opened before the
  // set_active step is closed again, so it runs at the function's top level.
  assertEquals(count(configure, 'try step("set_active")'), 1, 'one activation');
  const before = configure.slice(0, configure.indexOf('try step("set_active")'));
  assertEquals(count(before, '{') - count(before, '}'), 0, 'activation is not inside an if, guard or loop');
  // Only recovery skips it: start() and restart() run on screen and set it as always.
  assertEquals(count(swift, 'configureSession(recovering: true)'), 1);
  assert(funcBody(swift, 'bringUpEngine').includes('configureSession(recovering: true)'), 'the recovery path is the one that skips');
  for (const fn of ['start', 'restart']) {
    const body = funcBody(swift, fn);
    assert(body.includes('configureSession()') && !body.includes('recovering'), `${fn} keeps setting the category`);
  }
});

Deno.test('iOS: no silenced ringtone — setPrefersNoInterruptionsFromSystemAlerts is not used (owner decision)', async () => {
  // It silences the ringtone for the whole lecture: a product decision not made.
  const swift = await read(IOS_CAPTURE);
  assert(!swift.includes('PrefersNoInterruptionsFromSystemAlerts'), 'not set, not cleared, not mentioned');
  const release = code(funcBody(swift, 'releaseSession'));
  assert(release.includes('setActive(false, options: .notifyOthersOnDeactivation)'), 'the session is still given back');
  for (const fn of ['stop', 'abortStart']) {
    assert(code(funcBody(swift, fn)).includes('releaseSession()'), `${fn} gives the session back`);
  }
});

Deno.test('iOS: an interruption holds background time from .began, and .ended always recovers', async () => {
  const swift = await read(IOS_CAPTURE);
  const interruption = code(funcBody(swift, 'handleInterruption'));
  const began = interruption.slice(interruption.indexOf('case .began:'), interruption.indexOf('case .ended:'));
  const ended = interruption.slice(interruption.indexOf('case .ended:'));
  assertOrder(began, ['cancelRecovery()', 'interruptionActive = true', 'holdBackgroundTime()', 'markStopped()'], '.began');
  assert(began.includes('interruptionBgRemaining = LectureCapture.backgroundSecondsRemaining()'), 'bgRemaining read at .began');
  assertOrder(ended, ['interruptionActive = false', 'beginRecovery(.interruptionEnded)', 'releaseBackgroundTimeIfIdle()'], '.ended');
  assert(!/shouldResume[^\n]*return/.test(interruption), 'shouldResume is a hint, not a gate');
});

Deno.test('iOS: the ladder is bounded, and only the two policy refusals end it early', async () => {
  const swift = await swiftSource();
  const delays = swift.match(/recoveryRetryDelays: \[TimeInterval\] = \[([^\]]*)\]/)?.[1].split(',').map(Number) ?? [];
  assert(delays.length >= 3 && delays.length <= 6, `attempts: ${delays.length + 1}`);
  assert(delays.every((d, i) => d > 0 && (i === 0 || d >= delays[i - 1])), 'growing waits');
  const total = delays.reduce((a, b) => a + b, 0);
  // Inside the ~30 s of background time, verification included.
  assert(total <= 20, `ladder lasts ${total}s`);
  const restarts = Number(swift.match(/maxLadderRestarts = (\d+)/)?.[1]);
  assert(restarts >= 1 && restarts <= 3, `ladder restarts: ${restarts}`);
  const failedLadders = Number(swift.match(/maxFailedLadders = (\d+)/)?.[1]);
  assert(failedLadders >= 1 && failedLadders <= 5, `failed ladders before config changes stop starting new ones: ${failedLadders}`);
  const codes = swift.match(/policyRefusals: Set<Int> = \[([^\]]*)\]/)?.[1].split(',').map((s) => Number(s.trim().replace(/_/g, ''))) ?? [];
  // '!rec' cannotStartRecording and '!int' cannotInterruptOthers. '!pri' (a call still
  // holding the audio), 'siri' and the recorder's own codes must stay retryable.
  assertEquals(codes.sort(), [560557684, 561145187]);
  const failed = funcBody(swift, 'attemptFailed');
  assertOrder(failed, ['isPolicyRefusal', 'giveUp(generation)', 'backgroundTimeRemaining <', 'giveUp(generation)', 'asyncAfter'], 'attemptFailed');
  assert(failed.includes('LectureCapture.giveUpLingerSeconds'), 'a retry is only started with time left to report its failure');
  // During an interruption the ladder waits for .ended instead of burning time.
  assertOrder(failed, ['if interruptionActive { return }', 'isPolicyRefusal'], 'attemptFailed parks during an interruption');
});

Deno.test('iOS: attempt 1 restarts the same engine, later attempts rebuild it, in the app restart\'s order', async () => {
  const swift = await swiftSource();
  const attempt = funcBody(swift, 'attemptRecovery');
  assert(attempt.includes('bringUpEngine(rebuild: attempt > 1)'), 'attempt 1 = same engine; 2+ = new engine');
  const up = funcBody(swift, 'bringUpEngine');
  // The observer goes before the stop (a stop-versus-notification deadlock);
  // the engine is torn down before the session is activated; the engine starts last.
  assertOrder(up, ['removeEngineObserver()', 'removeTap(onBus: 0)', 'engine.stop()', 'engine = AVAudioEngine()', 'configureSession(recovering: true)', 'startEngine(strictFormat: true)'], 'bringUpEngine');
  assert(/if rebuild \{\s*engine = AVAudioEngine\(\)\s*\}/.test(up), 'only a rebuild replaces the engine');
  // The configuration activates the mixable session before the engine starts.
  assertOrder(funcBody(swift, 'configureSession'), ['setCategory(', 'setActive(true)', 'pinBuiltInMic()'], 'configureSession');
  // A media reset's brand-new engine is not asked for its input node before the session is set up.
  assert(/if engineTapped \{\s*engine\.inputNode\.removeTap/.test(up), 'a tap is only removed where one was installed');
  assertOrder(funcBody(swift, 'recoverFromReset'), ['removeEngineObserver()', 'engine = AVAudioEngine()', 'engineTapped = false', 'beginRecovery(.mediaServicesReset)'], 'recoverFromReset');
});

Deno.test('iOS: configuration changes are observed without blocking, for the engine in use', async () => {
  const swift = await swiftSource();
  const observe = funcBody(swift, 'observeEngineConfiguration');
  // queue nil + an async hop: never a main-queue observer the engine's queue waits on.
  assert(/forName: \.AVAudioEngineConfigurationChange, object: engine, queue: nil/.test(observe), 'queue: nil, for this engine');
  assert(observe.includes('DispatchQueue.main.async'), 'handled on main, asynchronously');
  assert(!/queue: \.main\s*\)[^]*?beginRecovery\(\.configurationChanged\)/.test(observe), 'no main-queue delivery');
  assertOrder(observe, ['removeEngineObserver()', 'let epoch = engineObserverEpoch', 'markConfigurationChange()', 'engineConfigurationChanged(epoch: epoch)'], 'observeEngineConfiguration');
  assert(funcBody(swift, 'removeEngineObserver').includes('engineObserverEpoch += 1'), 'a removed observer\'s pending change is stale');
  assert(/guard epoch == engineObserverEpoch else \{ return \}/.test(funcBody(swift, 'engineConfigurationChanged')), 'stale changes are ignored');
  // Marked on the capture queue, in order with the buffers.
  assert(/queue\.async \{ self\.heardAtConfigChange = self\.heardBuffers \}/.test(funcBody(swift, 'markConfigurationChange')));
  // Watched before the engine starts, so a change during the start is not missed.
  assertOrder(funcBody(swift, 'startEngine'), ['installTap(', 'observeEngineConfiguration()', 'engine.start()'], 'startEngine');
  // A failed attempt leaves the engine in use watched.
  assert(/catch \{[^}]*if engineObserver == nil \{ observeEngineConfiguration\(\) \}/.test(funcBody(swift, 'attemptRecovery')));
  for (const fn of ['stop', 'abortStart', 'removeObservers']) {
    assert(/removeEngineObserver\(\)|removeObservers\(\)/.test(funcBody(swift, fn)), `${fn} drops the engine observer`);
  }
});

Deno.test('iOS: a configuration change during a recovery is never dropped, and restarts the ladder a bounded number of times', async () => {
  const swift = await swiftSource();
  // The 2026-09-25 critique: `trigger == .configurationChanged, recovery != nil { return }`
  // dropped the change and left a dead engine counted as recovered.
  assert(!/configurationChanged,\s*recovery != nil\s*\{\s*return\s*\}/.test(swift), 'the dropped-change guard is gone');
  const begin = funcBody(swift, 'beginRecovery');
  assertOrder(begin, ['guard alive', 'if let current = recovery', 'restartRecovery(current, because: trigger)', 'return', 'engine.isRunning, !stalled { return }'], 'beginRecovery: in flight first, healthy check after');
  const restart = funcBody(swift, 'restartRecovery');
  assert(restart.includes('current.restarts < LectureCapture.maxLadderRestarts'), 'bounded');
  assertOrder(restart, ['next.restarts += 1', 'next.generation = nextGeneration()', 'next.attempt = 0', 'next.started = nil', 'next.verifyPending = false', 'runLadder(next)'], 'a restart is a new run');
  // Past the bound the change fails the attempt it hit (it is not ignored).
  assert(/if current\.verifyPending \{\s*attemptFailed\(current\.generation, AttemptFailure\(\s*step: "configuration_changed"/.test(restart), 'past the bound: the attempt fails');
  // .ended during a recovery (one a change started mid-interruption) gets a full ladder of its own.
  assert(/if trigger == \.interruptionEnded \{[^]*?Recovery\(generation: 0, trigger: \.interruptionEnded\)/.test(restart));
  // Ladders that keep failing are not restarted forever by configuration changes.
  assert(/trigger == \.configurationChanged, failedLadders >= LectureCapture\.maxFailedLadders/.test(begin));
  assert(funcBody(swift, 'giveUp').includes('failedLadders += 1'));
  assert(funcBody(swift, 'finishRecovery').includes('failedLadders = 0'));
});

Deno.test('iOS: a recovery is done only with the engine running and a real buffer after the attempt and the last change', async () => {
  const swift = await swiftSource();
  const heard = funcBody(swift, 'heard');
  assertOrder(heard, ['guard engine.isRunning else { return false }', 'heardBuffers', 'heardAtConfigChange', 'count > started.heardBefore && count > atChange'], 'heard(since:)');
  assert(!heard.includes('lastBufferAt'), 'lastBufferAt is set by the lock-screen Resume: never proof');
  // Real buffers are counted in consume() only, from the tap currently installed.
  assertEquals(count(swift, 'heardBuffers += 1'), 1, 'one place counts buffers');
  assert(/if tap == tapEpoch \{ heardBuffers \+= 1 \}/.test(funcBody(swift, 'consume')), 'counted in consume, current tap only');
  for (const fn of ['resume', 'pause', 'restart', 'start']) {
    assert(!/heardBuffers|tapEpoch/.test(funcBody(swift, fn)), `${fn} never touches the proof`);
  }
  assert(/self\.queue\.async \{ self\.consume\(copy, tap: epoch\) \}/.test(swift), 'each tap tags its buffers');
  assert(/self\.tapEpoch \+= 1\s*return \(self\.tapEpoch, self\.heardBuffers\)/.test(funcBody(swift, 'startEngine')), 'the baseline is taken as the new tap goes in');
  // Both the timed check and the first-buffer check go through heard(since:).
  const verify = funcBody(swift, 'verifyRecovery');
  assertOrder(verify, ['current.verifyPending', 'started.attempt == attempt', 'heard(since: started)', 'finishRecovery(generation)'], 'verifyRecovery');
  assert(/heard\(since: started\)/.test(funcBody(swift, 'recoveryHeardAudio')));
  // Exactly three places finish a recovery, and each one only behind the proof:
  // "the engine is running" or "the engine started" alone is never enough.
  assertEquals(count(swift, 'finishRecovery('), 4, 'the definition plus three callers');
  assert(/if let started = current\.started, heard\(since: started\) \{\s*finishRecovery\(generation\)/.test(funcBody(swift, 'attemptRecovery')), 'attemptRecovery: late audio from the last attempt');
  assert(/guard let started = current\.started, heard\(since: started\) else \{ return \}\s*finishRecovery\(current\.generation\)/.test(funcBody(swift, 'recoveryHeardAudio')), 'recoveryHeardAudio: the first buffer back');
  assert(/if heard\(since: started\) \{\s*finishRecovery\(generation\)\s*\} else if engine\.isRunning/.test(funcBody(swift, 'verifyRecovery')), 'verifyRecovery: running but silent is a failed attempt');
  // Audio coming back with no recovery in flight (a give-up's engine delivering
  // late) resets the give-up count — and never declares an interruption over:
  // that hop can land just after a new .began.
  const lateAudio = funcBody(swift, 'recoveryHeardAudio').match(/guard let current = recovery else \{([^}]*)\}/)?.[1] ?? '';
  assert(lateAudio.includes('failedLadders = 0') && lateAudio.includes('return'), 'late audio resets failedLadders');
  assert(!lateAudio.includes('interruptionActive'), 'late audio leaves interruptionActive to .ended');
  // consume() never finishes a recovery by itself (the old race): it asks main to check.
  const consume = funcBody(swift, 'consume');
  assert(consume.includes('recoveryHeardAudio()') && !consume.includes('finishRecovery'), 'consume hops to recoveryHeardAudio');
  assertEquals(count(swift, /finishRecovery\(\)/), 0, 'finishRecovery always names its generation');
  assert(/guard let current = recovery, current\.generation == generation else \{ return \}/.test(funcBody(swift, 'finishRecovery')));
});

Deno.test('iOS: one background task for the whole ladder, ended on every path', async () => {
  const swift = await swiftSource();
  assertEquals(count(swift, 'beginBackgroundTask('), 1, 'one place begins a task');
  const hold = funcBody(swift, 'holdBackgroundTime');
  assert(/^\s*guard backgroundTask == \.invalid else \{ return \}/.test(hold), 'a new task only if none is held');
  assert(!swift.includes('renewBackgroundTime'), 'no end-and-begin "renewal"');
  // The expiry handler ends its own identifier, unconditionally.
  assert(/beginBackgroundTask\(withName: "semora-lecture-microphone"\) \{ \[weak self\] in\s*self\?\.backgroundTimeExpired\(id\)\s*UIApplication\.shared\.endBackgroundTask\(id\)\s*\}/.test(hold));
  // endBackgroundTask only where a task is let go: release, the expiry handler, deinit.
  assertEquals(count(swift, 'endBackgroundTask('), 3);
  assert(funcBody(swift, 'releaseBackgroundTime').includes('endBackgroundTask(id)'));
  // Expiry does not give up on an engine that is running with its proof pending.
  const expired = funcBody(swift, 'backgroundTimeExpired');
  assertOrder(expired, ['guard backgroundTask == id', 'backgroundTask = .invalid', 'if current.verifyPending, engine.isRunning', 'return', 'giveUp(current.generation, expired: true)'], 'backgroundTimeExpired');
  // After giving up, ~4 s more so the failure event and the notice leave the phone.
  const linger = Number(swift.match(/giveUpLingerSeconds: TimeInterval = (\d+(?:\.\d+)?)/)?.[1]);
  assert(linger >= 3 && linger <= 5, `linger ${linger}s`);
  const giveUp = funcBody(swift, 'giveUp');
  assertOrder(giveUp, ['emit(.failure(', 'notifyCaptureStopped()', 'if !expired { lingerThenRelease() }'], 'giveUp');
  assert(!giveUp.includes('releaseBackgroundTime()'), 'giveUp never ends the task at once');
  assert(/guard let self, self\.lingerToken == token else \{ return \}/.test(funcBody(swift, 'lingerThenRelease')), 'an older linger never cuts a newer one short');
  // A task is only let go when nothing needs it: no interruption, no recovery, no report leaving.
  assert(/guard recovery == nil, !interruptionActive, !lingering else \{ return \}/.test(funcBody(swift, 'releaseBackgroundTimeIfIdle')));
  assert(funcBody(swift, 'finishRecovery').includes('releaseBackgroundTimeIfIdle()'));
  assert(funcBody(swift, 'stop').includes('releaseBackgroundTime()'));
  assert(/defer \{ releaseBackgroundTime\(\) \}/.test(funcBody(swift, 'restart')));
  assert(funcBody(swift, 'restart').includes('cancelRecovery()'), "the app's restart cancels a retry in flight");
  // Stop too: a verification still pending after Stop would otherwise give up
  // and post "microphone stopped" for a lecture that was already saved.
  assertOrder(code(funcBody(await read(IOS_CAPTURE), 'stop')), ['cancelRecovery()', 'releaseSession()'], 'stop cancels the recovery before giving the session back');
  assert(/deinit \{\s*if backgroundTask != \.invalid \{\s*UIApplication\.shared\.endBackgroundTask\(backgroundTask\)/.test(swift), 'deinit ends a task still held');
});

Deno.test('iOS: a recovery never installs a tap the hardware would reject (an uncatchable exception)', async () => {
  const swift = await swiftSource();
  const start = funcBody(swift, 'startEngine');
  assertOrder(start, ['outputFormat(forBus: 0)', 'format.sampleRate > 0, format.channelCount > 0', 'if strictFormat', 'checkTapFormat(format, input: input)', 'installTap('], 'startEngine');
  const check = funcBody(swift, 'checkTapFormat');
  assert(check.includes('let sessionRate = AVAudioSession.sharedInstance().sampleRate'), 'the session rate is read');
  assert(check.includes('let hardware = input.inputFormat(forBus: 0)'), 'the hardware input format is read');
  assert(check.includes('abs(format.sampleRate - sessionRate) < 1'), 'compared with the session rate');
  assert(check.includes('abs(format.sampleRate - hardware.sampleRate) < 1'), 'compared with the hardware rate');
  assert(/hardware\.sampleRate > 0 && hardware\.channelCount > 0 && sessionRate > 0/.test(check), 'a 0 Hz or 0-channel reading fails too');
  assertOrder(check, ['guard agrees else', 'throw StepError'], 'a disagreement throws');
  assert(/throw StepError\(step: "tap_format"/.test(check), 'a transient step failure, never a crash');
  const tapCode = Number(check.match(/code: (\d+)/)?.[1]);
  assert(tapCode > 0 && ![561145187, 560557684].includes(tapCode), 'retryable');
  // Only recovery attempts are strict: start() and restart() behave exactly as before.
  assertEquals(count(swift, 'startEngine(strictFormat: true)'), 1);
  assert(/try startEngine\(\)/.test(funcBody(swift, 'start')) && /try startEngine\(\)/.test(funcBody(swift, 'restart')));
});

Deno.test('iOS: a failed recovery carries its step, OS error and background time to JS, and JS keeps every key', async () => {
  const [raw, module] = await Promise.all([read(IOS_CAPTURE), read(IOS_MODULE)]);
  const swift = code(raw);
  const diag = funcBody(swift, 'diagnostics');
  for (const key of ['step', 'errDomain', 'errCode', 'errFourCC', 'firstStep', 'firstErrCode', 'firstErrFourCC', 'attempts',
    'trigger', 'appState', 'locked', 'shouldResume', 'interruptionReason', 'sinceBeganMs', 'final', 'expired',
    'bgRemaining', 'bgRemainingAtBegan']) {
    assert(diag.includes(`"${key}"`), `diagnostics has ${key}`);
  }
  assert(/min\(remaining, backgroundSecondsCap\)/.test(funcBody(swift, 'backgroundSecondsRemaining')), 'bgRemaining is capped');
  assert(/payload\["detail"\] = detail/.test(module), 'onFailure forwards detail');
  assert(/payload\["info"\] = info/.test(module), 'onCaptureResumed forwards info');
  // Every key the recorder sends must be on the JS whitelist, or it vanishes silently.
  const { sanitizeCaptureDiagnostics, parseNativeErrorMessage } = await import('./lectureCaptureError.ts');
  const sent = new Set<string>();
  for (const body of [diag, funcBody(swift, 'attemptRecovery')]) {
    for (const m of body.matchAll(/(?:\bd|\binfo)\["(\w+)"\]\s*=/g)) sent.add(m[1]);
    for (const m of body.matchAll(/^\s*"(\w+)": /gm)) sent.add(m[1]);
  }
  assert(sent.size >= 18, `keys found: ${[...sent].join(', ')}`);
  for (const key of sent) {
    assert(sanitizeCaptureDiagnostics({ [key]: 1 }) !== undefined, `JS whitelist drops "${key}"`);
  }
  // The recorder's own errors map to the same codes in JS (for text-only reports).
  const own = [...swift.matchAll(/code: (\d+),\s*(?:message|userInfo: \[NSLocalizedDescriptionKey):\s*"([^"]+)"/g)];
  assert(own.length >= 5, `own errors found: ${own.length}`);
  for (const [, ownCode, message] of own) {
    assertEquals(parseNativeErrorMessage(message)?.errCode, Number(ownCode), message);
  }
});

Deno.test('iOS: the stopped notice reaches a phone in Focus', async () => {
  const swift = await swiftSource();
  assert(funcBody(swift, 'postStoppedNotice').includes('interruptionLevel = .timeSensitive'));
  // Every stopped notice is posted through that one function.
  assertEquals(count(swift, 'UNNotificationRequest('), 1, 'one place builds the request');
  assert(funcBody(swift, 'postStoppedNotice').includes('UNNotificationRequest('));
});

// ── Telling the student (merged from the 2026-09-24 recorder work) ─────────
// Its retry schedule is replaced by the recovery above (a phone showed every
// one of its retries refused); what it added to TELLING the student is kept.

Deno.test('iOS keeps telling the student while the microphone stays stopped, and clears every notice when it comes back', async () => {
  const swift = await read(IOS_CAPTURE);
  const ids = [...swift.matchAll(/"(semora-lecture-capture-stopped(?:-\d)?)"/g)].map((m) => m[1]);
  assertEquals(new Set(ids).size, 3, 'the first notice and two reminders');
  const offsets = swift.match(/reminderOffsets: \[TimeInterval\] = \[([^\]]+)\]/)?.[1].split(',').map((n) => Number(eval(n.trim())));
  assert(offsets && offsets.length === 2 && offsets[0] >= 60 && offsets[1] > offsets[0], `reminders later, spaced: ${offsets}`);
  // One place clears, and it clears all three; every path that means "audio is
  // back" or "the student is looking" goes through it.
  const clear = code(funcBody(swift, 'clearStoppedNotices'));
  assert(clear.includes('LectureCapture.reminderIds') && clear.includes('removePendingNotificationRequests') && clear.includes('removeDeliveredNotifications'));
  assert(code(funcBody(swift, 'clearStoppedNotification')).includes('LectureCapture.clearStoppedNotices()'));
  // Posting books the reminders with the system (a suspended app still delivers them).
  const notify = code(funcBody(swift, 'notifyCaptureStopped'));
  assertOrder(notify, ['stalledSince != nil', 'postStoppedNotice(id: LectureCapture.stoppedNotificationId', 'LectureCapture.reminderIds, LectureCapture.reminderOffsets'], 'notifyCaptureStopped');
  assert(code(funcBody(swift, 'postStoppedNotice')).includes('content.interruptionLevel = .timeSensitive'), 'every notice is time-sensitive');
});

Deno.test('iOS lights the lock screen when the recovery gives up, and never leaves reminders for a later recording', async () => {
  const swift = await read(IOS_CAPTURE);
  const giveUp = code(funcBody(swift, 'giveUp'));
  assertOrder(giveUp, ['notifyCaptureStopped()', 'if #available(iOS 16.2, *)', 'LectureActivityController.shared.alertMicStopped('], 'giveUp tells the student both ways');
  const activity = await read(MODULE_ACTIVITY);
  assert(/@available\(iOS 16\.2, \*\)\s*func alertMicStopped/.test(activity), 'alerting updates need the 16.2 guard');
  // A new capture, and a new process, start with no stale "Recording paused".
  const start = code(funcBody(swift, 'start'));
  assert(start.indexOf('clearStoppedNotification()') >= 0 && start.indexOf('clearStoppedNotification()') < start.indexOf('configureSession()'),
    'start() clears reminders a killed capture left behind, before anything else');
  const module = code(await read(IOS_MODULE));
  assert(/OnCreate \{[^}]*LectureCapture\.clearStoppedNotices\(\)/.test(module), 'the module clears them when it is created');
});
