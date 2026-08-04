'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './PomodoroTimer.module.css';

/**
 * Working Pomodoro timer.
 *
 * Focus and break lengths match the shipping app exactly (FOCUS_OPTIONS and
 * BREAK_OPTIONS in lib/pomodoro.ts) so the tool and the product agree.
 *
 * The countdown is derived from a wall-clock deadline rather than by
 * decrementing a counter on an interval: browsers throttle timers in
 * background tabs, so a decrementing counter drifts badly the moment you
 * switch away — which is exactly when a study timer is running.
 */
const FOCUS_OPTIONS = [15, 25, 45, 50];
const BREAK_OPTIONS = [5, 10, 15];

type Phase = 'focus' | 'break';

function fmt(totalSeconds: number) {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function PomodoroTimer() {
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [phase, setPhase] = useState<Phase>('focus');
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(25 * 60);
  const [completed, setCompleted] = useState(0);

  const deadlineRef = useRef<number | null>(null);
  const phaseLength = (p: Phase) => (p === 'focus' ? focusMin : breakMin) * 60;

  // Advance to the other phase. Focus -> break increments the session count.
  const advance = useCallback(() => {
    setPhase((prev) => {
      const next: Phase = prev === 'focus' ? 'break' : 'focus';
      if (prev === 'focus') setCompleted((c) => c + 1);
      const len = (next === 'focus' ? focusMin : breakMin) * 60;
      deadlineRef.current = Date.now() + len * 1000;
      setRemaining(len);
      return next;
    });
  }, [focusMin, breakMin]);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (deadlineRef.current === null) return;
      const left = (deadlineRef.current - Date.now()) / 1000;
      if (left <= 0) advance();
      else setRemaining(left);
    };
    const id = window.setInterval(tick, 250);
    // Re-sync immediately on return, so a throttled background tab corrects
    // itself the moment the page is visible again.
    const onVis = () => !document.hidden && tick();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [running, advance]);

  const start = () => {
    deadlineRef.current = Date.now() + remaining * 1000;
    setRunning(true);
  };
  const pause = () => {
    setRunning(false);
    deadlineRef.current = null;
  };
  const reset = () => {
    setRunning(false);
    deadlineRef.current = null;
    setPhase('focus');
    setRemaining(focusMin * 60);
    setCompleted(0);
  };

  const pick = (kind: Phase, minutes: number) => {
    if (kind === 'focus') setFocusMin(minutes);
    else setBreakMin(minutes);
    if (phase === kind) {
      setRunning(false);
      deadlineRef.current = null;
      setRemaining(minutes * 60);
    }
  };

  const total = phaseLength(phase);
  const progress = total > 0 ? 1 - remaining / total : 0;

  return (
    <div className={styles.wrap} data-phase={phase}>
      <p className={styles.phase}>{phase === 'focus' ? 'Focus' : 'Break'}</p>
      <p className={styles.clock} aria-live="off">
        {fmt(remaining)}
      </p>

      <div
        className={styles.track}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label={`${phase} progress`}
      >
        <div className={styles.fill} style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.primary} onClick={running ? pause : start}>
          {running ? 'Pause' : remaining === total ? 'Start' : 'Resume'}
        </button>
        <button type="button" className={styles.ghost} onClick={advance}>
          Skip
        </button>
        <button type="button" className={styles.ghost} onClick={reset}>
          Reset
        </button>
      </div>

      <div className={styles.options}>
        <div>
          <p className={styles.optLabel}>Focus</p>
          <div className={styles.chips}>
            {FOCUS_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                className={`${styles.chip} ${focusMin === m ? styles.chipOn : ''}`}
                aria-pressed={focusMin === m}
                onClick={() => pick('focus', m)}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className={styles.optLabel}>Break</p>
          <div className={styles.chips}>
            {BREAK_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                className={`${styles.chip} ${breakMin === m ? styles.chipOn : ''}`}
                aria-pressed={breakMin === m}
                onClick={() => pick('break', m)}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className={styles.count}>
        {completed === 0
          ? 'No focus blocks finished yet in this sitting.'
          : `${completed} focus ${completed === 1 ? 'block' : 'blocks'} finished this sitting.`}
      </p>
    </div>
  );
}
