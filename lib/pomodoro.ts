import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { requestNotificationPermission } from '@/lib/notifications';

// ── Pomodoro focus timer ────────────────────────────────────
// A single running session is persisted to SecureStore so returning to the
// screen (or a cold relaunch) resumes correctly. We store the *start
// timestamp* and phase length rather than a ticking remaining-seconds
// counter — a decrementing counter drifts while the app is backgrounded
// (JS timers are throttled/paused), whereas `endAt - now` is always accurate
// no matter how long we were away. The end-of-phase notification is a real
// DATE-trigger scheduled on the OS, so it fires even when backgrounded.

// Phase durations are chosen up-front, in minutes. Defaults match the
// classic 25/5 Pomodoro technique.
export const DEFAULT_FOCUS_MINUTES = 25;
export const DEFAULT_BREAK_MINUTES = 5;
// Focus-length options the picker offers (minutes).
export const FOCUS_OPTIONS = [15, 25, 45, 50] as const;
export const BREAK_OPTIONS = [5, 10, 15] as const;

export type PomodoroPhase = 'focus' | 'break';

// The persisted, resumable session. Absent when nothing is running/paused.
interface PersistedSession {
  phase: PomodoroPhase;
  focusMinutes: number;
  breakMinutes: number;
  // ms epoch when the current phase ends. Only meaningful while `running`.
  endAt: number;
  // Remaining ms captured at pause time. Only meaningful while paused.
  remainingMs: number;
  running: boolean;
  // Completed focus blocks in THIS sitting — drives the cycle count.
  cycle: number;
  // Optional task this session is tied to (deep-link).
  taskId: string | null;
  taskTitle: string | null;
  // Scheduled notification id so we can cancel it on pause/reset.
  notifId: string | null;
}

const SESSION_KEY = 'semora_pomodoro_session';
// Lifetime count of completed focus blocks on this device. Mirrors the
// store's SecureStore usage (store/appStore.ts) since appStore is contended.
const LIFETIME_KEY = 'semora_pomodoro_lifetime';
// Distinct notification tag so a Pomodoro alert is never confused with a
// task reminder during any future prune/cancel sweeps.
const NOTIF_TAG = 'pomodoro';

function getItem(key: string): string | null {
  if (Platform.OS === 'web') return null;
  try { return SecureStore.getItem(key); } catch { return null; }
}

function setItem(key: string, value: string) {
  if (Platform.OS === 'web') return;
  try { SecureStore.setItem(key, value); } catch {}
}

function deleteItem(key: string) {
  if (Platform.OS === 'web') return;
  try { SecureStore.deleteItemAsync(key).catch(() => {}); } catch {}
}

function loadSession(): PersistedSession | null {
  const raw = getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as PersistedSession;
    // Defensive: a corrupt/partial blob shouldn't crash the screen — treat
    // it as no session.
    if (s && (s.phase === 'focus' || s.phase === 'break')) return s;
  } catch {}
  return null;
}

function saveSession(s: PersistedSession) {
  setItem(SESSION_KEY, JSON.stringify(s));
}

function clearSession() {
  deleteItem(SESSION_KEY);
}

/** Lifetime completed focus blocks on this device (best-effort, never NaN). */
export function getLifetimeSessions(): number {
  const n = parseInt(getItem(LIFETIME_KEY) ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function incrementLifetimeSessions(): number {
  const next = getLifetimeSessions() + 1;
  setItem(LIFETIME_KEY, String(next));
  return next;
}

/**
 * Schedule the OS notification that fires when the current phase ends, so the
 * user is alerted even if the app is backgrounded. Returns the notification
 * id (to cancel on pause/reset) or null on failure/no-permission. Mirrors the
 * DATE-trigger pattern in lib/notifications.ts.
 */
async function scheduleEndNotification(
  phase: PomodoroPhase,
  endAt: number,
  taskTitle: string | null,
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  // Nothing to schedule if the end is already in the past.
  if (endAt <= Date.now()) return null;
  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return null;
  try {
    const isFocus = phase === 'focus';
    const title = isFocus ? '🍅 Focus block done' : '☕️ Break over';
    const body = isFocus
      ? taskTitle
        ? `Nice work on “${taskTitle}”. Time for a break.`
        : 'Nice work — time for a break.'
      : 'Break’s over. Ready for another focus block?';
    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        // fireAt mirrors lib/notifications.ts so the shared prune logic there
        // can score this notification correctly; tag marks it as ours.
        data: { tag: NOTIF_TAG, fireAt: endAt },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(endAt),
      },
    });
  } catch {
    // Scheduling failing is never fatal — the in-app countdown still works.
    return null;
  }
}

async function cancelNotif(notifId: string | null) {
  if (Platform.OS === 'web' || !notifId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch {}
}

// The public shape a screen consumes.
export interface PomodoroState {
  phase: PomodoroPhase;
  focusMinutes: number;
  breakMinutes: number;
  running: boolean;
  // Whole seconds left in the current phase (recomputed each tick from the
  // authoritative endAt, never decremented in place).
  remainingSeconds: number;
  // 0..1 progress through the current phase, for a ring/bar.
  progress: number;
  cycle: number;
  taskId: string | null;
  taskTitle: string | null;
  lifetimeSessions: number;
}

export interface PomodoroControls {
  start: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  reset: () => Promise<void>;
  setFocusMinutes: (m: number) => void;
  setBreakMinutes: (m: number) => void;
}

/**
 * Timer hook. Owns the resumable session and drives a 1s tick while running.
 * `onPhaseComplete(phase, minutes)` fires when a phase's countdown reaches
 * zero in-app (so the screen can haptic + track); the OS notification handles
 * the backgrounded case independently.
 */
export function usePomodoro(
  initialTaskId: string | null,
  initialTaskTitle: string | null,
  onPhaseComplete?: (phase: PomodoroPhase, minutes: number) => void,
): [PomodoroState, PomodoroControls] {
  // Hydrate once from SecureStore. A running session's endAt is honored, so a
  // relaunch mid-focus resumes at the correct remaining time.
  const [session, setSession] = useState<PersistedSession>(() => {
    const persisted = loadSession();
    if (persisted) {
      // A never-started leftover (idle, no elapsed cycles, no live endAt) must
      // not shadow the task we were actually opened from — otherwise tapping
      // "Focus" on task B hydrates a stale un-started task-A session and
      // mislabels/links the timer as A. Rebind it to the deep-link task.
      // A running OR paused/in-progress session is always preserved as-is so
      // we never clobber real focus work.
      const neverStarted = !persisted.running && persisted.cycle === 0 && persisted.endAt === 0;
      if (neverStarted && initialTaskId && initialTaskId !== persisted.taskId) {
        return { ...persisted, taskId: initialTaskId, taskTitle: initialTaskTitle };
      }
      return persisted;
    }
    return {
      phase: 'focus',
      focusMinutes: DEFAULT_FOCUS_MINUTES,
      breakMinutes: DEFAULT_BREAK_MINUTES,
      endAt: 0,
      remainingMs: DEFAULT_FOCUS_MINUTES * 60_000,
      running: false,
      cycle: 0,
      taskId: initialTaskId,
      taskTitle: initialTaskTitle,
      notifId: null,
    };
  });
  const [lifetimeSessions, setLifetimeSessions] = useState(getLifetimeSessions);
  // Drives re-render on each tick. `now` is only read while running.
  const [now, setNow] = useState(() => Date.now());
  // Guard so the phase-complete handler fires exactly once per phase even if
  // several ticks land past endAt before state settles.
  const completedRef = useRef(false);

  // Persist on every session change (single source of truth for resume). A
  // pristine, never-started session (stopped, full clock, no cycles, no
  // linked task) has nothing worth resuming — clear it so a stale blob from a
  // prior sitting can't shadow a fresh open.
  useEffect(() => {
    const pristine =
      !session.running &&
      session.cycle === 0 &&
      session.remainingMs === phaseLengthMs(session) &&
      !session.taskId;
    if (pristine) {
      clearSession();
    } else {
      saveSession(session);
    }
  }, [session]);

  // 1s tick while running. We recompute `now` rather than decrementing so the
  // displayed time is always endAt-anchored (accurate across backgrounding).
  useEffect(() => {
    if (!session.running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [session.running]);

  // Re-sync the clock the instant we foreground — a backgrounded JS interval
  // is throttled, so without this the countdown could show a stale value for
  // a beat before the next tick.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);

  const remainingMs = session.running
    ? Math.max(0, session.endAt - now)
    : session.remainingMs;

  // Phase-complete detection (in-app). The OS notification covers the
  // backgrounded case; this path advances the timer to the next phase and
  // fires the completion callback exactly once.
  useEffect(() => {
    if (!session.running) { completedRef.current = false; return; }
    if (remainingMs > 0) { completedRef.current = false; return; }
    if (completedRef.current) return;
    completedRef.current = true;

    const finishedPhase = session.phase;
    const finishedMinutes =
      finishedPhase === 'focus' ? session.focusMinutes : session.breakMinutes;

    // A completed FOCUS block bumps the cycle count + lifetime total.
    let nextCycle = session.cycle;
    if (finishedPhase === 'focus') {
      nextCycle = session.cycle + 1;
      setLifetimeSessions(incrementLifetimeSessions());
    }
    const nextPhase: PomodoroPhase = finishedPhase === 'focus' ? 'break' : 'focus';
    const nextLenMin = nextPhase === 'focus' ? session.focusMinutes : session.breakMinutes;

    // Auto-advance to the next phase, PAUSED, so the student decides when to
    // begin the break / next focus block rather than being force-marched.
    cancelNotif(session.notifId);
    setSession((s) => ({
      ...s,
      phase: nextPhase,
      cycle: nextCycle,
      running: false,
      endAt: 0,
      remainingMs: nextLenMin * 60_000,
      notifId: null,
    }));
    onPhaseComplete?.(finishedPhase, finishedMinutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, session.running]);

  const start = useCallback(async () => {
    const lenMin = session.phase === 'focus' ? session.focusMinutes : session.breakMinutes;
    const endAt = Date.now() + lenMin * 60_000;
    const notifId = await scheduleEndNotification(session.phase, endAt, session.taskTitle);
    completedRef.current = false;
    setNow(Date.now());
    setSession((s) => ({ ...s, running: true, endAt, remainingMs: lenMin * 60_000, notifId }));
  }, [session.phase, session.focusMinutes, session.breakMinutes, session.taskTitle]);

  const pause = useCallback(async () => {
    await cancelNotif(session.notifId);
    setSession((s) => ({
      ...s,
      running: false,
      // Freeze the remaining time so resume picks up exactly where we stopped.
      remainingMs: Math.max(0, s.endAt - Date.now()),
      endAt: 0,
      notifId: null,
    }));
  }, [session.notifId]);

  const resume = useCallback(async () => {
    const endAt = Date.now() + session.remainingMs;
    const notifId = await scheduleEndNotification(session.phase, endAt, session.taskTitle);
    completedRef.current = false;
    setNow(Date.now());
    setSession((s) => ({ ...s, running: true, endAt, notifId }));
  }, [session.remainingMs, session.phase, session.taskTitle]);

  const reset = useCallback(async () => {
    await cancelNotif(session.notifId);
    completedRef.current = false;
    const lenMin = session.phase === 'focus' ? session.focusMinutes : session.breakMinutes;
    clearSession();
    setSession((s) => ({
      ...s,
      running: false,
      endAt: 0,
      remainingMs: lenMin * 60_000,
      // A reset returns to a focus block and zeroes the cycle count.
      phase: 'focus',
      cycle: 0,
      notifId: null,
    }));
  }, [session.notifId, session.phase, session.focusMinutes, session.breakMinutes]);

  // Length changes only apply while stopped; they reset the shown remaining
  // time for the current phase.
  const setFocusMinutes = useCallback((m: number) => {
    setSession((s) => {
      if (s.running) return s;
      return {
        ...s,
        focusMinutes: m,
        remainingMs: s.phase === 'focus' ? m * 60_000 : s.remainingMs,
      };
    });
  }, []);

  const setBreakMinutes = useCallback((m: number) => {
    setSession((s) => {
      if (s.running) return s;
      return {
        ...s,
        breakMinutes: m,
        remainingMs: s.phase === 'break' ? m * 60_000 : s.remainingMs,
      };
    });
  }, []);

  const phaseLenMs = phaseLengthMs(session);
  const progress = phaseLenMs > 0 ? 1 - remainingMs / phaseLenMs : 0;

  const state: PomodoroState = {
    phase: session.phase,
    focusMinutes: session.focusMinutes,
    breakMinutes: session.breakMinutes,
    running: session.running,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    progress: Math.min(1, Math.max(0, progress)),
    cycle: session.cycle,
    taskId: session.taskId,
    taskTitle: session.taskTitle,
    lifetimeSessions,
  };

  return [state, { start, pause, resume, reset, setFocusMinutes, setBreakMinutes }];
}

function phaseLengthMs(s: PersistedSession): number {
  return (s.phase === 'focus' ? s.focusMinutes : s.breakMinutes) * 60_000;
}

/** mm:ss for the big countdown. */
export function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const m = Math.floor(safe / 60);
  const sec = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
