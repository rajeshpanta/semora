import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';

// Events are logged into the SHARED `analytics_events` table (also used by the
// Citizen app) and tagged with app_name='semora', so `where app_name='semora'`
// isolates this app. The table is device-based (a `device_id` column, no
// user_id), so analytics stays anonymous and is never tied to account identity.

const DEVICE_ID_KEY = 'semora_device_id';
let cachedDeviceId: string | null = null;

// A random per-install id — not security-sensitive, just needs to be stable.
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    let id = SecureStore.getItem(DEVICE_ID_KEY);
    if (!id) {
      id = uuid();
      SecureStore.setItem(DEVICE_ID_KEY, id);
    }
    cachedDeviceId = id;
  } catch {
    cachedDeviceId = uuid(); // SecureStore unavailable (e.g. web) — ephemeral id
  }
  return cachedDeviceId;
}

/**
 * Fire-and-forget analytics event. Inserts into the shared `analytics_events`
 * table tagged app_name='semora'. Include a `screen` in `properties` so every
 * event records which page it came from. Never throws and never blocks the UI —
 * analytics failing must never affect the app.
 */
export function track(eventName: string, properties: Record<string, any> = {}): void {
  try {
    supabase
      .from('analytics_events')
      .insert({
        app_name: 'semora',
        event_name: eventName,
        properties,
        device_id: getDeviceId(),
        platform: Platform.OS,
        app_version: Constants.expoConfig?.version ?? null,
      })
      // Two-arg .then swallows both fulfilment and rejection so a failed
      // insert can never surface as an unhandled rejection.
      .then(() => {}, () => {});
  } catch {
    // never let analytics break a render path
  }
}
