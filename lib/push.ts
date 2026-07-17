import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

/**
 * Server-side push registration — the re-engagement channel a
 * semester-cyclical app needs. LOCAL reminders (lib/notifications.ts) can
 * never reach a closed app between terms; an Expo push token stored
 * server-side lets a cron/admin job (send-push edge function) deliver
 * "new semester starting" / "N deadlines this week" nudges to a lapsed
 * user's device.
 *
 * Design notes:
 *   - We do NOT prompt for notification permission here. That prompt is
 *     primed elsewhere (the review screen, after the first import) to
 *     preserve conversion. This runs after sign-in and only registers a
 *     token when permission is ALREADY granted — otherwise it no-ops.
 *   - Fully guarded: every path swallows its own errors. Push
 *     registration is best-effort infra and must never break sign-in,
 *     launch, or the auth flow.
 */

// Resolve the EAS projectId the same way the rest of the app reads config.
// Path confirmed against app.json: extra.eas.projectId.
function getProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as any;
  return extra?.eas?.projectId;
}

/**
 * Register this device for server-side push, IF permission is already
 * granted. Call after a user is authenticated. Never throws.
 */
export async function registerForPushNotificationsAsync(): Promise<void> {
  // Expo push tokens are a native-only concept; web has no device token.
  if (Platform.OS === 'web') return;

  try {
    // Permission CHECK, not request — never pop the OS dialog here.
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    // Must have a signed-in user to attribute the token to. getUser is the
    // authoritative check (a cached session could be stale).
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const projectId = getProjectId();
    if (!projectId) {
      // Without a projectId Expo can't mint a token; bail quietly rather
      // than throw out of the sign-in path.
      if (__DEV__) console.warn('[push] No EAS projectId in expoConfig.extra.eas — skipping registration');
      return;
    }

    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse?.data;
    if (!token) return;

    // Upsert on the unique token so a device that re-signs-in under a
    // different account rebinds to the new user instead of leaving a stale
    // row that would push to the previous owner. The updated_at trigger
    // (migration 023) refreshes the timestamp on the conflict path.
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        { user_id: user.id, token, platform: Platform.OS },
        { onConflict: 'token' },
      );
    if (error && __DEV__) console.warn('[push] token upsert failed:', error.message);
  } catch (err) {
    // Best-effort — never let push registration break the caller.
    if (__DEV__) console.warn('[push] registerForPushNotificationsAsync failed:', err);
  }
}

/**
 * Delete THIS device's push token row on sign-out, so the signed-out
 * user stops receiving server pushes on a device they've left — and so
 * the next person to sign in here doesn't inherit A's row. Scoped to
 * userId (RLS also enforces this) and to this device's token. Never throws.
 */
export async function unregisterPushToken(userId: string): Promise<void> {
  if (Platform.OS === 'web' || !userId) return;

  try {
    const projectId = getProjectId();
    if (!projectId) return;

    // Look up THIS device's current token so we only delete our own row,
    // not every device the user owns.
    const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResponse?.data;
    if (!token) return;

    await supabase.from('push_tokens').delete().eq('user_id', userId).eq('token', token);
  } catch (err) {
    // Best-effort — a failed cleanup must never block sign-out.
    if (__DEV__) console.warn('[push] unregisterPushToken failed:', err);
  }
}
