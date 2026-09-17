import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import {
  ASK_AFTER_SILENCE_MS,
  CAP_WARNING_NOTICE,
  HEADPHONES_NOTICE,
  LectureSession,
  TOO_QUIET_NOTICE,
  type SessionDeps,
} from '@/lib/lectureSession';
import type { CaptureEngine, EngineEvent, EngineStartOptions, EngineStatus } from '@/lib/lectureCapture/types';

// ── fakes ──────────────────────────────────────────────────────────────────

class FakeEngine implements CaptureEngine {
  readonly kind = 'expo' as const;
  calls: string[] = [];
  listeners = new Set<(e: EngineEvent) => void>();
  seq = 0;
  closed = 0;
  live = 0;
  paused = false;
  failStart = false;
  lastTickActive: boolean | null = null;

  onEvent(l: (e: EngineEvent) => void) { this.listeners.add(l); return () => this.listeners.delete(l); }
  emit(e: EngineEvent) { for (const l of this.listeners) l(e); }
  private closePart() {
    if (this.live <= 0) return;
    const part = { seq: this.seq, uri: `file:///lec/seg_${this.seq}.m4a`, seconds: this.live, bytes: 1000, hasGap: false };
    this.seq += 1;
    this.closed += this.live;
    this.live = 0;
    this.emit({ type: 'partClosed', part });
  }
  async start(_o: EngineStartOptions) { this.calls.push('start'); if (this.failStart) throw Object.assign(new Error('mic'), { code: 'CAPTURE_START_FAILED' }); }
  async pause() { this.calls.push('pause'); this.closePart(); this.paused = true; }
  async resume() { this.calls.push('resume'); this.paused = false; }
  async stop() { this.calls.push('stop'); this.closePart(); }
  async restartCapture() { this.calls.push('restart'); this.closePart(); }
  async tick(appActive: boolean) { this.lastTickActive = appActive; this.calls.push(`tick:${appActive}`); }
  status(): EngineStatus {
    return { capturing: !this.paused, paused: this.paused, closedSeconds: this.closed, livePartSeconds: this.live, levelDb: -20, inputName: 'iPhone Microphone', builtInMic: true, nextSeq: this.seq };
  }
  dispose() { this.calls.push('dispose'); }
}

function makeDeps(over: Partial<SessionDeps> = {}) {
  const log: string[] = [];
  const engine = new FakeEngine();
  let now = 1_000_000;
  let active = true;
  const appListeners = new Set<() => void>();
  const deps: SessionDeps = {
    now: () => now,
    setInterval: () => 1,
    clearInterval: () => {},
    platformCanRecord: () => true,
    freeDiskBytes: async () => 10 * 1024 ** 3,
    minFreeBytesToStart: 200 * 1024 ** 2,
    requestMicPermission: async () => true,
    requestNotificationPermission: async () => null,
    appIsActive: () => active,
    onAppActive: (l) => { appListeners.add(l); return () => appListeners.delete(l); },
    notify: (title) => log.push(`notify:${title}`),
    createEngine: () => engine,
    audioSession: { activate: async () => { log.push('session:on'); }, release: async () => { log.push('session:off'); } },
    keepAwake: { activate: () => log.push('awake:on'), deactivate: () => log.push('awake:off') },
    server: {
      start: async () => ({ lectureId: 'lec-1', maxSeconds: 5400 }),
      cancel: async (id) => { log.push(`cancel:${id}`); },
      finish: async (i) => { log.push(`finish:${i.segmentCount}:${i.durationSeconds}`); },
      finalize: async () => { log.push('finalize'); },
      heartbeat: async (i) => { log.push(`hb:${i.state}${i.wallSeconds !== undefined ? `:${i.wallSeconds}:${i.capturedSeconds}` : ''}`); },
      discard: async (id, owner) => { log.push(`server-discard:${id}:${owner}`); },
      addMarks: async (id, marks) => { log.push(`marks:${id}:${marks.join(',')}`); return true; },
    },
    currentUserId: async () => 'owner-1',
    lectureDirUri: (id) => `file:///docs/lectures/${id}/`,
    journal: {
      create: async (o, l) => { log.push(`j:create:${o}:${l}`); },
      partSaved: async (_o, _l, p) => { log.push(`j:part:${p.seq}:${p.seconds}`); },
      stop: async (_o, _l, n, d) => { log.push(`j:stop:${n}:${d}`); },
      markStopDeclared: async () => { log.push('j:declared'); },
      saveMarks: async (_o, _l, marks, synced) => { log.push(`j:marks:${marks.join(',')}:${synced}`); },
      discard: async (l) => { log.push(`j:discard:${l}`); },
    },
    queue: { kick: (r) => log.push(`q:${r}`), setActiveLecture: (id) => log.push(`q:active:${id}`) },
    track: (e) => log.push(`t:${e}`),
    ...over,
  };
  return {
    deps, log, engine,
    advance: (ms: number) => { now += ms; },
    setActive: (v: boolean) => { active = v; if (v) for (const l of appListeners) l(); },
  };
}

const startIt = async (s: LectureSession) => {
  const r = await s.start({ title: 'Bio 101', courseId: null });
  assert(r.ok, JSON.stringify(r));
};

// ── tests ──────────────────────────────────────────────────────────────────

Deno.test('start: journal before capture, heartbeat, queue told which lecture is live', async () => {
  const { deps, log, engine } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  assertEquals(s.getState().phase, 'recording');
  assertEquals(engine.calls, ['start']);
  assert(log.indexOf('j:create:owner-1:lec-1') < log.indexOf('session:on'), 'journal before the microphone');
  assert(log.includes('q:active:lec-1') && log.includes('awake:on') && log.includes('hb:recording'));
});

Deno.test('start: a server refusal leaves nothing behind', async () => {
  const { deps, engine } = makeDeps({
    server: {
      ...makeDeps().deps.server,
      start: async () => { throw Object.assign(new Error('used'), { code: 'FREE_LECTURE_USED', status: 402 }); },
    },
  });
  const s = new LectureSession(deps);
  const r = await s.start({ title: 'x', courseId: null });
  assertEquals(r, { ok: false, code: 'FREE_LECTURE_USED', message: 'used', status: 402 });
  assertEquals(s.getState().phase, 'idle');
  assertEquals(engine.calls, []);
});

Deno.test('start: a microphone that does not start cancels the lecture and the journal', async () => {
  const { deps, log, engine } = makeDeps();
  engine.failStart = true;
  const s = new LectureSession(deps);
  const r = await s.start({ title: 'x', courseId: null });
  assertEquals(r.ok, false);
  assert(log.includes('cancel:lec-1') && log.includes('j:discard:lec-1') && log.includes('session:off'));
  assertEquals(s.getState().phase, 'idle');
});

Deno.test('closed parts are journaled in order and hand off to the queue', async () => {
  const { deps, log, engine } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  engine.live = 300; await engine.restartCapture();
  engine.live = 300; await engine.restartCapture();
  await s.stop();
  const parts = log.filter((l) => l.startsWith('j:part'));
  assertEquals(parts, ['j:part:0:300', 'j:part:1:300']);
  assert(log.filter((l) => l === 'q:part_closed').length >= 2);
});

Deno.test('Pause then an immediate Stop keeps the last part and declares the right count', async () => {
  const { deps, log, engine } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  engine.live = 120;
  const p = s.pause();
  const stopped = s.stop();
  await p;
  const r = await stopped;
  assertEquals(r, { ok: true, lectureId: 'lec-1' });
  assertEquals(log.filter((l) => l.startsWith('j:part')), ['j:part:0:120']);
  // the journal records Stop only after the part is written
  assert(log.indexOf('j:part:0:120') < log.indexOf('j:stop:1:120'));
  assert(log.includes('finish:1:120') && log.includes('j:declared'));
  assertEquals(s.getState().finishedLectureId, 'lec-1');
});

Deno.test('Stop while offline still commits locally; the queue will send the count', async () => {
  const base = makeDeps();
  const { deps, log, engine } = makeDeps({
    server: { ...base.deps.server, finish: async () => { throw new Error('Network request failed'); } },
  });
  const s = new LectureSession(deps);
  await startIt(s);
  engine.live = 30;
  const r = await s.stop();
  assertEquals(r.ok, true);
  assert(log.includes('j:stop:1:30'));
  assert(!log.includes('j:declared'), 'not marked declared');
  assert(log.includes('q:stopped'));
});

Deno.test('a second Stop does nothing', async () => {
  const { deps, engine } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  engine.live = 10;
  const [a, b] = await Promise.all([s.stop(), s.stop()]);
  assertEquals(a.ok, true);
  assertEquals(b.ok, false);
  assertEquals(engine.calls.filter((c) => c === 'stop').length, 1);
});

Deno.test('the recording limit saves the lecture on its own', async () => {
  const { deps, engine } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  engine.closed = 5100; engine.live = 300;
  await s.tick();
  assertEquals(s.getState().phase, 'idle');
  assertEquals(s.getState().autoSaved, 'limit');
});

Deno.test('a session left running far past the limit in real time is saved (the 34-hour recording)', async () => {
  const { deps, engine, advance } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  engine.live = 600;
  advance(34 * 3600_000);
  await s.tick();
  assertEquals(s.getState().phase, 'idle');
  assertEquals(s.getState().autoSaved, 'wall_clock');
});

Deno.test('coming back after a long dead microphone asks instead of restarting; Continue restarts', async () => {
  const { deps, engine, advance, setActive } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  setActive(false);
  engine.emit({ type: 'micStopped', at: deps.now() });
  advance(ASK_AFTER_SILENCE_MS + 60_000);
  setActive(true);
  await new Promise((r) => setTimeout(r, 0));
  assertEquals(s.getState().needsDecision, true);
  await s.tick();
  assertEquals(engine.lastTickActive, false, 'engine not allowed to restart while the student decides');
  await s.continueRecording();
  assert(engine.calls.includes('restart'));
  assertEquals(s.getState().needsDecision, false);
});

Deno.test('a short dead-mic stretch is restarted by the engine on return, without asking', async () => {
  const { deps, engine, advance, setActive } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  setActive(false);
  engine.emit({ type: 'micStopped', at: deps.now() });
  advance(60_000);
  setActive(true);
  await new Promise((r) => setTimeout(r, 0));
  assertEquals(s.getState().needsDecision, false);
  assertEquals(engine.lastTickActive, true);
});

Deno.test('discard writes the tombstone before stopping capture and removes the lecture everywhere', async () => {
  const { deps, log, engine } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  engine.live = 50;
  await s.discard();
  const tomb = log.indexOf('j:discard:lec-1');
  assert(tomb >= 0 && tomb < log.lastIndexOf('j:part:0:50'), 'tombstone first');
  assertEquals(log.filter((l) => l === 'j:discard:lec-1').length, 2);
  // As the owner — a signed-out phone cannot look it up — and BEFORE the queue
  // is told nothing is live, which is what lets it remove the folder.
  assert(log.includes('server-discard:lec-1:owner-1'), log.join(' '));
  assert(log.indexOf('server-discard:lec-1:owner-1') < log.lastIndexOf('q:active:null'), 'discard remembered before the folder can go');
  assertEquals(s.getState().phase, 'idle');
  assertEquals(s.getState().finishedLectureId, null);
});

Deno.test('start on a phone that locked meanwhile waits for the app, then opens the microphone', async () => {
  const { deps, engine, setActive } = makeDeps();
  setActive(false);
  const s = new LectureSession(deps);
  const pending = s.start({ title: 'x', courseId: null });
  await new Promise((r) => setTimeout(r, 5));
  assertEquals(engine.calls, [], 'no microphone from the background');
  setActive(true);
  const r = await pending;
  assert(r.ok, JSON.stringify(r));
  assertEquals(engine.calls, ['start']);
});

Deno.test('a refused notification permission is remembered, not fatal', async () => {
  const { deps } = makeDeps({ requestNotificationPermission: async () => false });
  const s = new LectureSession(deps);
  await startIt(s);
  assertEquals(s.getState().notificationsDenied, true);
  const { deps: d2 } = makeDeps({ requestNotificationPermission: async () => true });
  const s2 = new LectureSession(d2);
  await startIt(s2);
  assertEquals(s2.getState().notificationsDenied, false);
});

Deno.test('a locked phone is told before the cap and when the recording saves itself', async () => {
  const { deps, log, engine, setActive } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  setActive(false);
  engine.closed = 5400 - 300; engine.live = 0;
  await s.tick();
  assertEquals(log.filter((l) => l.startsWith('notify:')), [`notify:${CAP_WARNING_NOTICE.title}`]);
  await s.tick();
  assertEquals(log.filter((l) => l.startsWith('notify:')).length, 1, 'said once');
  engine.live = 300;
  await s.tick();
  assertEquals(s.getState().autoSaved, 'limit');
  assertEquals(log.filter((l) => l.startsWith('notify:')), [`notify:${CAP_WARNING_NOTICE.title}`, 'notify:Recording saved']);
});

Deno.test('on screen, nothing is posted: the recorder shows it', async () => {
  const { deps, log, engine } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  engine.closed = 5400 - 300;
  await s.tick();
  engine.live = 300;
  await s.tick();
  assertEquals(s.getState().autoSaved, 'limit');
  assertEquals(log.filter((l) => l.startsWith('notify:')), []);
});

Deno.test('a quiet room and headphones reach a locked phone, once', async () => {
  const { deps, log, engine, setActive } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  setActive(false);
  engine.status = () => ({ capturing: true, paused: false, closedSeconds: 0, livePartSeconds: engine.live, levelDb: -70, inputName: 'iPhone Microphone', builtInMic: true, nextSeq: 0 });
  for (let i = 0; i <= 61; i++) { engine.live = i; await s.tick(); }
  assertEquals(s.getState().tooQuiet, true);
  engine.emit({ type: 'inputChanged', name: 'AirPods', builtIn: false });
  engine.emit({ type: 'inputChanged', name: 'AirPods', builtIn: false });
  assertEquals(log.filter((l) => l.startsWith('notify:')), [`notify:${TOO_QUIET_NOTICE.title}`, `notify:${HEADPHONES_NOTICE.title}`]);
  assertEquals(s.getState().usingBuiltInMic, false);
});

Deno.test('a part the recorder could not finish is reported as lost audio', async () => {
  const { deps, engine } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  engine.emit({ type: 'failure', stage: 'capture_prepare', code: 'X' });
  assertEquals(s.getState().partLost, false);
  engine.emit({ type: 'failure', stage: 'capture_finalize', code: 'RENAME_FAILED' });
  assertEquals(s.getState().partLost, true);
  assertEquals(s.getState().hadGap, true);
});

Deno.test('wall time comes from the phase changes, so a sleeping runtime still reports the hours it ran', async () => {
  const { deps, log, engine, advance } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  // 40 minutes pass with NO ticks (the JS runtime was suspended).
  advance(40 * 60_000);
  engine.live = 10;
  await s.pause();
  advance(5 * 60_000);
  await s.resume();
  advance(10 * 60_000);
  engine.live = 10;
  await s.stop();
  assert(log.includes('hb:stopped:3000:20'), log.filter((l) => l.startsWith('hb')).join());
});

Deno.test('pause, resume, pause in quick succession run in order', async () => {
  const { deps, engine } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  engine.live = 10;
  await Promise.all([s.pause(), s.resume(), s.pause()]);
  assertEquals(engine.calls.filter((c) => c !== 'start' && !c.startsWith('tick')), ['pause', 'resume', 'pause']);
  assertEquals(s.getState().phase, 'paused');
});

Deno.test('the engine is not ticked while paused, and the stop report excludes the pause', async () => {
  const { deps, log, engine, advance } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  for (let i = 0; i < 10; i++) { advance(1000); await s.tick(); }
  engine.live = 10;
  await s.pause();
  engine.calls = [];
  for (let i = 0; i < 30; i++) { advance(1000); await s.tick(); }
  assertEquals(engine.calls.filter((c) => c.startsWith('tick')).length, 0);
  await s.stop();
  assert(log.includes('hb:stopped:10:10'), log.filter((l) => l.startsWith('hb')).join());
});

Deno.test('the timer shows captured audio, not wall-clock time', async () => {
  const { deps, engine, advance } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  engine.closed = 300; engine.live = 12.7;
  advance(3600_000); // an hour of wall clock passes with the mic dead
  await s.tick();
  assertEquals(s.getState().elapsed, 312);
  // the receipt is what is closed on disk, not what is still in the live part
  assertEquals(s.getState().savedSeconds, 300);
});

Deno.test('savedSeconds follows the parts closed on this phone and survives finishing', async () => {
  const { deps, engine } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  engine.live = 300; await engine.restartCapture();
  engine.live = 40;
  await s.tick();
  assertEquals(s.getState().savedSeconds, 300);
  assertEquals(s.getState().elapsed, 340);
  let seenWhileFinishing: number | null = null;
  const unsub = s.subscribe(() => {
    if (s.getState().phase === 'finishing') seenWhileFinishing = s.getState().savedSeconds;
  });
  await s.stop();
  unsub();
  assertEquals(seenWhileFinishing, 300, 'stop must not zero the receipt before the reset');
  assertEquals(s.getState().savedSeconds, 0);
});

Deno.test('pausedAt records when the pause began, clears on resume, and resets on stop', async () => {
  const { deps, engine, advance } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  assertEquals(s.getState().pausedAt, null);
  advance(10_000);
  engine.live = 10;
  await s.pause();
  assertEquals(s.getState().pausedAt, 1_010_000);
  advance(5_000);
  await s.tick();
  assertEquals(s.getState().pausedAt, 1_010_000, 'a tick while paused keeps the original time');
  await s.resume();
  assertEquals(s.getState().pausedAt, null);
  await s.pause();
  assertEquals(s.getState().pausedAt, 1_015_000);
  await s.stop();
  assertEquals(s.getState().pausedAt, null);
});

Deno.test('a second start while recording is refused', async () => {
  const { deps } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  assertEquals(await s.start({ title: 'y', courseId: null }), { ok: false, code: 'ALREADY_RECORDING' });
});

Deno.test('mark important: saved on the phone, sent, one mark per moment, lock screen too', async () => {
  const { deps, log, engine } = makeDeps();
  const s = new LectureSession(deps);
  assertEquals(s.markImportant(), false);
  await startIt(s);
  engine.closed = 120; engine.live = 5;
  assertEquals(s.markImportant(), true);
  assertEquals(s.markImportant(), false);
  engine.live = 40;
  engine.emit({ type: 'markRequested' });
  await new Promise((r) => setTimeout(r, 0));
  await s.stop();
  assertEquals(s.getState().marks, []);
  assert(log.includes('j:marks:125:false'), log.join(' '));
  assert(log.includes('marks:lec-1:125'), log.join(' '));
  assert(log.includes('j:marks:125,160:true'), log.join(' '));
  assert(log.includes('t:lecture_marked_important'));
});

Deno.test('mark important offline: stays unsynced, retried at the heartbeat', async () => {
  let online = false;
  const base = makeDeps();
  const { deps, log, engine } = makeDeps({
    server: { ...base.deps.server, addMarks: async (_id, marks) => { log.push(`try:${marks.join(',')}`); return online; } },
  });
  const s = new LectureSession(deps);
  await startIt(s);
  engine.closed = 30;
  s.markImportant();
  await new Promise((r) => setTimeout(r, 0));
  assertEquals(s.getState().marksSynced, false);
  online = true;
  await (s as any).heartbeat();
  assertEquals(s.getState().marksSynced, true);
  assert(log.filter((l) => l === 'try:30').length === 2, log.join(' '));
});

Deno.test('native-style stop: status resets to zero after stop, the declared count still comes from the real parts', async () => {
  const { deps, log, engine } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  engine.live = 120; await engine.restartCapture();
  engine.live = 120; await engine.restartCapture();
  engine.live = 30;
  // Behave like the native module: the last part's event comes a moment AFTER
  // stop resolves, and status reads zeros once stopped.
  engine.stop = async () => {
    engine.calls.push('stop');
    const part = { seq: engine.seq, uri: 'file:///lec/last.m4a', seconds: 30, bytes: 10, hasGap: false };
    setTimeout(() => engine.emit({ type: 'partClosed', part }), 20);
    engine.seq = 0; engine.closed = 0; engine.live = 0;
    return { nextSeq: 3, closedSeconds: 270 };
  };
  await s.stop();
  assert(log.includes('finish:3:270'), log.join(' '));
  assert(log.includes('j:stop:3:270'), log.join(' '));
  assert(log.includes('j:part:2:30'), 'the late last part is journaled');
  assert(log.indexOf('j:stop:3:270') < log.lastIndexOf('q:active:null'), 'stop is journaled before the queue is told nothing records');
});

Deno.test('an old native build that returns nothing and zeros its status still declares the parts it reported', async () => {
  const { deps, log, engine } = makeDeps();
  const s = new LectureSession(deps);
  await startIt(s);
  engine.live = 120; await engine.restartCapture();
  engine.live = 120; await engine.restartCapture();
  engine.stop = async () => { engine.calls.push('stop'); engine.seq = 0; engine.closed = 0; };
  await s.stop();
  assert(log.some((l) => l.startsWith('finish:2:')), log.join(' '));
});
