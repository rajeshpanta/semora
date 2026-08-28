import { Platform } from 'react-native';
import {
  buildWatchSnapshot,
  signedOutWatchSnapshot,
  type BuildWatchSnapshotInput,
} from '@/lib/watchSnapshot';

/**
 * Pushes the Watch payload out of the app, alongside the home-screen widget.
 *
 * Shaped after lib/widgetBridge.ts on purpose: same call site, same
 * best-effort contract, same sign-out cleanup. Both surfaces answer the same
 * question from the same data, and keeping them structurally parallel is what
 * stops one of them quietly falling out of sync with the Today tab.
 *
 * Best-effort by design. A Watch that is unpaired, asleep, out of range, or has
 * never had the app installed is the normal case, not an error — every failure
 * is swallowed, exactly like the widget's.
 */

/**
 * Deliberately NOT deduplicated against the last payload.
 *
 * Skipping an identical snapshot would save a send, but the Watch's freshness
 * line is derived from the timestamp on the payload it holds. A student with a
 * stable week who opens Semora every morning would watch that line drift to
 * "Updated 2d ago" and correctly conclude the numbers cannot be trusted — while
 * the phone was confirming them daily. `updateApplicationContext` is coalesced
 * by the system anyway, so the redundant sends cost far less than the wrong
 * signal would.
 */
export function updateWatchSnapshot(input: BuildWatchSnapshotInput): void {
  // WCSession does not exist on iPad, Android or web. The native module already
  // reports `unsupported` there; short-circuiting first keeps this off the hot
  // path of every Today-tab render on those platforms.
  if (Platform.OS !== 'ios') return;
  try {
    // Lazy require so environments without the native module (Expo Go, unit
    // tests, an older binary) never touch it at import time.
    const { sendWatchSnapshot } = require('@/modules/semora-watch-bridge');
    // Fire and forget: the Today screen must not await a Bluetooth accessory.
    sendWatchSnapshot(buildWatchSnapshot(input))?.catch?.(() => {});
  } catch {
    // Watch data is a nice-to-have; never let it surface as an app error.
  }
}

/**
 * Wipe the Watch payload on sign-out.
 *
 * Application context persists on the watch across launches and is readable
 * from the wrist without unlocking the phone — the same exposure that made
 * clearTodayWidget necessary for the home screen. Sends an explicit
 * `signed_out` state rather than zeros so the Watch shows "Sign in on your
 * iPhone" instead of a cheerful empty day for an account that is gone.
 */
export function clearWatchSnapshot(): void {
  if (Platform.OS !== 'ios') return;
  try {
    const { sendWatchSnapshot } = require('@/modules/semora-watch-bridge');
    sendWatchSnapshot(signedOutWatchSnapshot())?.catch?.(() => {});
  } catch {
    // Never let Watch cleanup block or fail a sign-out.
  }
}
