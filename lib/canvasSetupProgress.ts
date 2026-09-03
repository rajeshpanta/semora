/**
 * What the student had already worked out, kept across leaving the app.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────
 * Getting a Canvas Calendar Feed link REQUIRES leaving Semora. There is no
 * other way: the link lives in a dialog inside Canvas's web UI, so the student
 * must switch to a browser, sign in, navigate, copy, and come back. On a phone
 * that round trip can easily evict Semora from memory.
 *
 * Every piece of progress they made before switching — which school they are
 * at, which lane they chose, how many times they have tried — lived in React
 * state and died with it. They returned holding the link they went to fetch
 * and were shown the first screen again, starting from "which school?".
 *
 * ─── WHAT IS DELIBERATELY NOT STORED ────────────────────────
 * The feed URL. It is a bearer credential — anyone holding it can read that
 * student's deadlines — and it has a proper home already: the server-side
 * Vault, written once at connect time. Persisting it on the device to save a
 * few seconds of retyping would be trading a real secret for a convenience,
 * and it is the one value the student can always paste again because they are
 * arriving WITH it in their clipboard.
 *
 * So this holds only navigational facts: which school, which lane, how many
 * attempts. None of it is secret, and none of it is useful to anyone else.
 */

export type CanvasLaneChoice = 'phone' | 'laptop';

export interface CanvasSetupProgress {
  /** The Canvas hostname the student identified, if they got that far. */
  host: string | null;
  /** The school's display name, so the UI can say it back to them. */
  schoolName: string | null;
  /** Which route they chose through the setup. */
  setupLane: CanvasLaneChoice | null;
  /** Failed paste attempts, which is what escalation is keyed on. */
  attempts: number;
  /** When this was written, so stale progress does not haunt a later attempt. */
  savedAt: string | null;
}

export const EMPTY_PROGRESS: CanvasSetupProgress = {
  host: null, schoolName: null, setupLane: null, attempts: 0, savedAt: null,
};

/**
 * Twelve hours. Long enough to cover "I will do this when I get to my laptop
 * tonight", short enough that ahalf-finished attempt from last term does not
 * reappear as though it were current.
 */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function canvasSetupStorageKey(userId: string): string {
  return `semora_canvas_setup_v1:${userId}`;
}

export function parseCanvasSetupProgress(
  raw: string | null | undefined,
  now: number = Date.now(),
): CanvasSetupProgress {
  if (!raw) return EMPTY_PROGRESS;
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_PROGRESS;
  }
  if (!parsed || typeof parsed !== 'object') return EMPTY_PROGRESS;

  // Expired progress is the same as none. Returning it would put a student
  // back into a flow they abandoned, with a school they may have since left.
  const savedAt = typeof parsed.savedAt === 'string' ? parsed.savedAt : null;
  if (savedAt) {
    const age = now - new Date(savedAt).getTime();
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) return EMPTY_PROGRESS;
  } else {
    return EMPTY_PROGRESS;
  }

  const setupLane = parsed.setupLane === 'phone' || parsed.setupLane === 'laptop' ? parsed.setupLane : null;
  const attempts = Number.isFinite(parsed.attempts) ? Math.max(0, Math.min(99, Math.trunc(parsed.attempts))) : 0;
  return {
    host: typeof parsed.host === 'string' && parsed.host ? parsed.host : null,
    schoolName: typeof parsed.schoolName === 'string' && parsed.schoolName ? parsed.schoolName : null,
    setupLane,
    attempts,
    savedAt,
  };
}

export function serializeCanvasSetupProgress(
  progress: CanvasSetupProgress,
  now: Date = new Date(),
): string {
  return JSON.stringify({ ...progress, savedAt: now.toISOString() });
}

/**
 * How many failures before the student is offered a different route.
 *
 * Two, not one: a single mistyped or half-copied paste is ordinary and
 * interrupting it would be nagging. Two in a row means the instructions are
 * not working for this person, and repeating them a third time is the least
 * useful thing the screen could do. Production's worst session made 3 attempts
 * and then left.
 */
export const ESCALATE_AFTER_ATTEMPTS = 2;

export function shouldEscalate(progress: CanvasSetupProgress): boolean {
  return progress.attempts >= ESCALATE_AFTER_ATTEMPTS;
}
