/**
 * The order in which a file picker is allowed to be opened.
 *
 * This is the shipped decision logic behind safePick in app/(tabs)/scan.tsx,
 * kept here — free of react-native — so the sequence that broke in production
 * can actually be tested rather than described. The screen supplies the real
 * InteractionManager, the real picker call and the real telemetry; everything
 * below is the ordering rule those three are wired into.
 *
 * Three guarantees, each earned by a specific production failure:
 *
 *   1. WAIT BEFORE PRESENTING. A picker presented while another modal is
 *      dismissing is silently dropped by UIKit, which strands
 *      expo-document-picker's native `pickingContext` forever (see
 *      waitForTransitions in scan.tsx for the full mechanism). The wait comes
 *      first, always, and it is inside the timeout so a stalled
 *      InteractionManager is reported instead of hanging the button.
 *
 *   2. ONE AT A TIME. A second call arriving while one is outstanding is a
 *      duplicate intent, not a failure. It resolves as a no-op rather than
 *      reaching the native module, which is where it would have thrown
 *      PickingInProgressException and been logged as if the student had
 *      cancelled.
 *
 *   3. A FAILURE IS NOT A CANCELLATION. These are different outcomes with
 *      different events. Collapsing them is what hid eight failures each from
 *      two paying subscribers behind `scan_cancelled`.
 */
import type { PickerFailureReason } from './pickerDiagnostics';

/** iOS gives no upper bound on how long a student may browse. This is only a
 *  backstop against a picker that never settles at all. */
export const PICK_TIMEOUT_MS = 120_000;

/** What the caller should do with the value runPick returned. */
export type PickOutcome = 'selected' | 'cancelled' | 'failed' | 'duplicate';

export interface PickResult {
  canceled?: boolean;
  assets?: unknown[] | null;
  /** Set by runPick when the picker threw or never settled. */
  failed?: boolean;
  /** Set by runPick when another pick was already outstanding. */
  duplicate?: boolean;
}

export interface PickFlowDeps {
  /** Resolves once running transitions have finished. */
  waitForTransitions: () => Promise<void>;
  /** Invokes the native picker. */
  work: () => Promise<any>;
  /** Reports a real failure. Never called for a duplicate or a cancellation. */
  onFailure: (err: unknown, reason: PickerFailureReason, elapsedMs: number) => void;
  /** Shared single-flight cell so concurrent callers can see each other. */
  inFlight: { current: boolean };
  now?: () => number;
  timeoutMs?: number;
  /**
   * Whether the native picker call itself can fail to settle, and so needs the
   * timeout even after it has been reached. Defaults to true.
   *
   * True only on web. expo-image-picker's web build resolves from inside a
   * `change` listener with no reject path, so a file with no MIME mapping
   * leaves it pending forever; that is what the timeout was written for.
   *
   * False on iOS and Android, and it matters. A native picker that reached the
   * screen always settles, on Pick or on Cancel, and one that never reached the
   * screen is caught by the document picker's own 3-second watchdog. A timeout
   * running over a picker the student is actually using can only be wrong: in
   * 45 days it fired 21 times, all on iOS, never on web, as students browsed
   * Files for over two minutes or left to fetch the file and came back (141s to
   * 407s, the timer catching up on resume). Each got "Couldn't open the picker"
   * over an open picker, and a file chosen after that was ignored, because the
   * race had already settled. With this false the timeout still guards the
   * pre-native wait, the only part on native that could stall, and is disarmed
   * the moment the native call starts.
   */
  nativeCallMayHang?: boolean;
}

const DUPLICATE: PickResult = { canceled: true, assets: [], duplicate: true };
const FAILED: PickResult = { canceled: true, assets: [], failed: true };

export async function runPick(deps: PickFlowDeps): Promise<any> {
  const {
    waitForTransitions, work, onFailure, inFlight,
    now = () => Date.now(),
    timeoutMs = PICK_TIMEOUT_MS,
    nativeCallMayHang = true,
  } = deps;

  // Read-and-set with no await in between, so two calls in the same tick
  // cannot both see `false`.
  if (inFlight.current) return DUPLICATE;
  inFlight.current = true;

  const startedAt = now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  // The native call, held separately from the race below.
  //
  // Promise.race does not cancel the loser. When the timeout wins, THIS is
  // still pending and expo-document-picker's native `pickingContext` is still
  // set — it is cleared only from the picker's own delegate callbacks. So this
  // promise, not the race, is the only thing that knows whether the native
  // module is free.
  // Whether the native module was actually reached. Nothing before this point
  // can strand anything, so the guard has nothing to protect until it flips.
  let nativeStarted = false;

  const pickPromise = (async () => {
    await waitForTransitions();
    nativeStarted = true;
    // A native picker is now responsible for settling (see nativeCallMayHang).
    // Disarming the timer leaves the race waiting on the picker alone.
    if (!nativeCallMayHang && timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    return work();
  })();

  // Release the guard when the NATIVE call settles, not when the race does.
  //
  // Clearing it in a `finally` around the race was the defect: on a timeout it
  // announced the picker was free while native still held the lock, so the very
  // next tap sailed past this guard, reached the module, and threw
  // PickingInProgressException instantly — the permanent strand, with
  // elapsed_ms of 1. Two paying subscribers hit exactly that, minutes after
  // subscribing. Registered before Promise.race so that on the ordinary paths
  // the guard is already down by the time runPick returns.
  //
  // Attaching a rejection handler here also keeps a late failure from surfacing
  // as an unhandled rejection once the race has already settled on the timeout.
  const release = () => { inFlight.current = false; };
  pickPromise.then(release, release);

  try {
    const result = await Promise.race([
      pickPromise,
      new Promise<'__timeout__'>((resolve) => {
        timer = setTimeout(() => resolve('__timeout__'), timeoutMs);
      }),
    ]);

    if (result === '__timeout__') {
      // A timeout BEFORE the native call was even reached — a transition that
      // never finished, typically a leaked InteractionManager handle. No
      // picker was presented, so there is no native context to protect, and
      // holding the guard here would disable the button for the rest of the
      // process: the same dead end this whole change exists to remove, reached
      // from the other side. Release it and let the student try again.
      if (!nativeStarted) inFlight.current = false;
      onFailure(null, 'timeout', now() - startedAt);
      return FAILED;
    }
    return result;
  } catch (err) {
    onFailure(err, 'threw', now() - startedAt);
    return FAILED;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    // `inFlight` is deliberately NOT cleared here. See `release` above: only
    // the native call settling proves the module is usable again.
  }
}

/**
 * Which of the four outcomes a picker result represents.
 *
 * Order matters: a failed or duplicated result also carries `canceled: true`
 * (callers that only understand cancellation still behave sanely), so those
 * two must be tested before the cancellation check or they would be
 * misclassified as exactly the thing this function exists to separate.
 */
export function classifyPick(result: PickResult | null | undefined): PickOutcome {
  if (!result) return 'failed';
  if (result.failed) return 'failed';
  if (result.duplicate) return 'duplicate';
  if (result.canceled) return 'cancelled';
  if (!result.assets || result.assets.length === 0) return 'cancelled';
  return 'selected';
}

/** Only a real cancellation should reach the `scan_cancelled` event. */
export function shouldTrackCancelled(result: PickResult | null | undefined): boolean {
  return classifyPick(result) === 'cancelled';
}
