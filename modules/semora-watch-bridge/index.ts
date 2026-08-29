import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/**
 * JS face of the iPhone → Watch bridge.
 *
 * Everything here is total: on Android, on web, in Expo Go, and on an iPhone
 * with no Watch, these calls return a status object rather than throwing. The
 * Watch is an accessory to Semora, never a dependency of it.
 */

export type WatchActivationState =
  | 'notActivated'
  | 'inactive'
  | 'activated'
  | 'unsupported'
  | 'unknown';

export interface WatchStatus {
  /** False on Android/web, on iPad, and anywhere WatchConnectivity is absent. */
  supported: boolean;
  /** A Watch is paired to this iPhone. Only meaningful once activated. */
  paired: boolean;
  /** The Semora Watch app is installed on that Watch. */
  watchAppInstalled: boolean;
  activationState: WatchActivationState;
  /** The Watch is awake and in range right now. Not required for context. */
  reachable: boolean;
  activationError: string | null;
}

export type WatchSendReason =
  | 'unsupported'
  | 'not_activated'
  | 'no_watch_paired'
  | 'watch_app_not_installed'
  | 'update_failed';

export interface WatchSendResult {
  ok: boolean;
  reason: WatchSendReason | null;
  error?: string;
  activationState?: WatchActivationState;
  payload?: Record<string, unknown>;
}

const UNSUPPORTED_STATUS: WatchStatus = {
  supported: false,
  paired: false,
  watchAppInstalled: false,
  activationState: 'unsupported',
  reachable: false,
  activationError: null,
};

/** Mirrors WatchSnapshotRecord in SemoraWatchBridgeModule.swift. Built by
 *  lib/watchSnapshot.ts, which owns the shape. */
export interface NativeWatchSnapshot {
  state: string;
  dueTodayCount: number;
  overdueCount: number;
  items: Array<{
    id: string;
    title: string;
    course: string;
    colorHex: string;
    dueDate: string;
    dueTime?: string | null;
    bucket: string;
  }>;
  /**
   * Localised chrome for the Watch and its complication, keyed by
   * lib/surfaceStrings.ts. Optional so an older native build ignores it, and a
   * Watch that receives none falls back to the English it shipped with.
   */
  strings?: Record<string, string>;
}

/** What the Watch asks for. Re-validated in lib/watchCompletion.ts. */
export interface WatchCompletionRequestEvent {
  type: string;
  requestId: string;
  taskId: string;
  requestedAt?: string;
}

/** What the phone answers. */
export interface WatchCompletionAck {
  requestId: string;
  taskId: string;
  ok: boolean;
  reason?: string | null;
}

interface NativeBridge {
  getStatus(): WatchStatus;
  sendTestSnapshot(dueTodayCount: number, overdueCount: number): Promise<WatchSendResult>;
  sendSnapshot(snapshot: NativeWatchSnapshot): Promise<WatchSendResult>;
  sendCompletionAck(ack: WatchCompletionAck): Promise<WatchSendResult>;
  addListener(event: string, listener: (payload: any) => void): { remove(): void };
}

// `requireOptionalNativeModule` returns null instead of throwing when the
// native side is absent — which is the normal case on Android and in any JS-only
// test environment. Reaching for the non-optional variant here would turn a
// missing accessory into a startup crash.
const native =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<NativeBridge>('SemoraWatchBridge')
    : null;

/** True when the native bridge is linked into this binary at all. */
export const isWatchBridgeAvailable = native != null;

export function getWatchStatus(): WatchStatus {
  if (!native) return UNSUPPORTED_STATUS;
  try {
    return native.getStatus();
  } catch {
    // A native throw here would be a bug, not a condition — but the caller is
    // a UI thread and the honest answer is "no Watch", not a red screen.
    return UNSUPPORTED_STATUS;
  }
}

/**
 * Phase 2 diagnostic send. The payload's shape, type tag, and message are fixed
 * in native code; only the two counts travel from JS.
 */
export async function sendWatchTestSnapshot(
  options: { dueTodayCount?: number; overdueCount?: number } = {},
): Promise<WatchSendResult> {
  const { dueTodayCount = 3, overdueCount = 1 } = options;

  if (!native) return { ok: false, reason: 'unsupported' };

  try {
    return await native.sendTestSnapshot(dueTodayCount, overdueCount);
  } catch (error) {
    return {
      ok: false,
      reason: 'update_failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Push the real snapshot to the Watch.
 *
 * Total, like everything else here: on Android, on web, on an iPhone with no
 * Watch, or on a binary built before this module existed, it resolves with a
 * status rather than throwing. Callers treat the Watch as an accessory and
 * ignore the result.
 */
export async function sendWatchSnapshot(
  snapshot: NativeWatchSnapshot,
): Promise<WatchSendResult> {
  if (!native) return { ok: false, reason: 'unsupported' };

  try {
    return await native.sendSnapshot(snapshot);
  } catch (error) {
    return {
      ok: false,
      reason: 'update_failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Subscribe to completion requests coming from the Watch.
 *
 * Returns an unsubscribe function that is safe to call even when no native
 * module exists, so the caller needs no platform branch of its own.
 *
 * Subscribing matters for more than delivery: the native side buffers requests
 * that arrive before anyone is listening — which is the normal case when iOS
 * wakes the app in the background to hand one over — and flushes them the
 * moment the first listener attaches.
 */
export function addWatchCompletionRequestListener(
  handler: (request: WatchCompletionRequestEvent) => void,
): () => void {
  if (!native) return () => {};
  try {
    const subscription = native.addListener('onWatchCompletionRequest', handler);
    return () => {
      try {
        subscription.remove();
      } catch {
        // Already torn down.
      }
    };
  } catch {
    return () => {};
  }
}

/** Tell the Watch what happened to one request. */
export async function sendWatchCompletionAck(
  ack: WatchCompletionAck,
): Promise<WatchSendResult> {
  if (!native) return { ok: false, reason: 'unsupported' };
  try {
    return await native.sendCompletionAck(ack);
  } catch (error) {
    return {
      ok: false,
      reason: 'update_failed',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
