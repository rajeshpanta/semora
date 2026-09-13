/**
 * Hold an action until a React Native <Modal> has actually finished dismissing.
 *
 * iOS attaches a newly presented controller to whatever is on top at that
 * instant. If that is a Modal still on its way out, the new controller is torn
 * down with it, silently: no error, no delegate callback. The "+" menu's
 * "Upload a document" row hit exactly that. It closed the menu and opened the
 * scan screen in the same tick, the scan screen fires the document picker on
 * its first commit, and for a Pro account nothing awaits in between, so the
 * picker was presented onto the menu and vanished with it. 53 of 62 such taps
 * failed over 30 days; free accounts, whose free-scan check delays the picker,
 * failed 0 of 51.
 *
 * Modal's `onDismiss` comes from the completion block of UIKit's
 * dismissViewControllerAnimated:, so it is the real "gone" signal. It is iOS
 * only and could in principle never arrive, so a backstop timer runs the action
 * anyway. Whichever fires first wins; the other does nothing.
 *
 * InteractionManager cannot do this job: React Native 0.81 ships it disabled
 * (the stub resolves on the next tick), and it never tracked native Modal
 * animations in the first place.
 *
 * Kept free of react-native so the ordering can be unit tested.
 */
export interface DismissGate {
  /** Run `action` once the modal reports dismissal, or after `backstopMs`. */
  runAfterDismiss(action: () => void, backstopMs: number): void;
  /** Wire to the Modal's `onDismiss`. Safe to call with nothing pending. */
  onDismissed(): void;
  /** Drop anything pending without running it. */
  cancel(): void;
}

type Schedule = (fn: () => void, ms: number) => unknown;
type Unschedule = (handle: any) => void;

export function createDismissGate(
  schedule: Schedule = (fn, ms) => setTimeout(fn, ms),
  unschedule: Unschedule = (handle) => clearTimeout(handle),
): DismissGate {
  let pending: (() => void) | null = null;
  let timer: unknown = null;

  const clearTimer = () => {
    if (timer !== null) {
      unschedule(timer);
      timer = null;
    }
  };

  const flush = () => {
    const action = pending;
    // Cleared before running, so an action that re-enters the gate, or a late
    // second signal, can never run the same navigation twice.
    pending = null;
    clearTimer();
    action?.();
  };

  return {
    runAfterDismiss(action, backstopMs) {
      clearTimer();
      pending = action;
      timer = schedule(flush, backstopMs);
    },
    onDismissed: flush,
    cancel() {
      pending = null;
      clearTimer();
    },
  };
}
