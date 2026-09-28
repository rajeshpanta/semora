import { deleteDeviceItem, getDeviceItem, setDeviceItem } from '@/lib/deviceStore';

/**
 * "The app is reloading itself right now."
 *
 * Updates.reloadAsync restarts the JavaScript but not the process, and the URL
 * that launched the process comes back with it as the initial URL (see
 * lib/shareLinks.ts). The only code that reloads is AppUpdateGate, applying an
 * update, so it stamps the moment just before; app/+native-intent.tsx reads the
 * stamp to tell that replay apart from a student really tapping a link.
 */
const KEY = 'semora.appUpdate.reloadingAt';

export function markReloading(now: number = Date.now()): void {
  setDeviceItem(KEY, String(now));
}

/** The reload did not happen after all. */
export function clearReloading(): void {
  deleteDeviceItem(KEY);
}

export function readReloadingAt(): number | null {
  const at = Number(getDeviceItem(KEY));
  return Number.isFinite(at) && at > 0 ? at : null;
}
