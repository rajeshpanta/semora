import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';
import {
  decideUpdate, AUTO_UPDATE_FLAG_KEY, FETCH_TIMEOUT_MS, COLD_START_GRACE_MS,
  TRACK_FLUSH_MS, type UpdateMoment,
} from '@/lib/appUpdate';

/**
 * Applies a downloaded OTA in the session it arrives.
 *
 * See lib/appUpdate.ts for why this exists and when it is allowed to act. This
 * half is only the plumbing: read the flag, ask expo-updates what it is
 * holding, and reload at one of the two safe moments.
 *
 * Renders nothing and is mounted once, high in the tree.
 */

const updateFlagQuery = {
  queryKey: ['promo', AUTO_UPDATE_FLAG_KEY] as const,
  queryFn: async () => {
    // Fails CLOSED: any error leaves this false, which is exactly today's
    // two-launch behaviour. The safe direction for something that restarts a
    // student's app.
    const { data, error } = await supabase.rpc('promo_active', { p_key: AUTO_UPDATE_FLAG_KEY });
    if (error) return false;
    return data === true;
  },
  staleTime: 10 * 60 * 1000,
};

/** expo-updates, loaded defensively — it is absent on web and in Expo Go. */
function updatesModule() {
  if (Platform.OS === 'web') return null;
  try {
    const Updates = require('expo-updates');
    return Updates?.isEnabled ? Updates : null;
  } catch {
    return null;
  }
}

export function AppUpdateGate() {
  const pathname = usePathname();
  const { data: enabled = false, isFetched } = useQuery(updateFlagQuery);
  // When this component mounted, so a slow flag read cannot turn a "cold
  // start" into a reload five seconds into someone's session.
  const mountedAt = useRef(Date.now());

  // At most once per session. A second reload could only ever be a loop.
  const applied = useRef(false);
  // usePathname changes constantly; the callback below must read the CURRENT
  // route without being re-created (and re-arming listeners) on every screen.
  const routeRef = useRef(pathname);
  routeRef.current = pathname;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const attempt = useCallback(async (moment: UpdateMoment) => {
    const Updates = updatesModule();
    if (!Updates || applied.current) return;

    try {
      // What is already downloaded? On a launch after any previous one, the
      // native layer has usually fetched it already and this is instant.
      let pending = Boolean(Updates.isUpdatePending);

      // Nothing waiting, and this is a cold start: ask once, briefly. This is
      // what collapses the FIRST encounter with an update to a single launch
      // instead of two. Bounded so a slow network costs a moment, not a boot.
      if (!pending && moment === 'cold-start') {
        const check = await Promise.race([
          Updates.checkForUpdateAsync(),
          new Promise((resolve) => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)),
        ]) as { isAvailable?: boolean } | null;
        if (check?.isAvailable) {
          const fetched = await Promise.race([
            Updates.fetchUpdateAsync(),
            new Promise((resolve) => setTimeout(() => resolve(null), FETCH_TIMEOUT_MS)),
          ]) as { isNew?: boolean } | null;
          pending = Boolean(fetched?.isNew);
        }
      }

      const decision = decideUpdate({
        isUpdatePending: pending,
        enabled: enabledRef.current,
        moment,
        pathname: routeRef.current,
        alreadyAppliedThisSession: applied.current,
      });
      if (!decision.apply) return;

      applied.current = true;
      // track() is fire-and-forget and reloadAsync tears down this JS context
      // immediately, so the insert can die in flight. This event is the ONLY
      // evidence that an update was ever applied — without it, adoption is
      // unmeasurable and we are back to inferring it from code markers.
      //
      // A brief, bounded wait lets the request leave. Best effort by design:
      // delivery is worth a fraction of a second, never a stalled launch.
      track('ota_applied', { moment, screen: routeRef.current ?? 'unknown' });
      await new Promise((resolve) => setTimeout(resolve, TRACK_FLUSH_MS));
      await Updates.reloadAsync();
    } catch {
      // Never let an update attempt break a launch. Falling back to the
      // two-launch path is the whole point of it being a fallback.
    }
  }, []);

  // Cold start — but only once the flag has actually been read.
  //
  // The first version fired this on mount, before the query resolved. That
  // looked right and was not: the native layer usually has the update already
  // downloaded, so `isUpdatePending` is true and there is no await before the
  // decision — which then read the flag's INITIAL false and bailed. The cold
  // start path would have been dead on arrival the day the flag was switched
  // on, and only the resume path would ever have worked.
  useEffect(() => {
    if (!isFetched || !enabled) return;
    // If the read was slow enough that the student has had time to start
    // doing something, this is no longer a cold start. Wait for a resume.
    if (Date.now() - mountedAt.current > COLD_START_GRACE_MS) return;
    void attempt('cold-start');
  }, [isFetched, enabled, attempt]);

  // Coming back from the background: they already walked away from whatever
  // they were doing, so a restart costs nothing they were in the middle of.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void attempt('resumed');
    });
    return () => sub.remove();
  }, [attempt]);

  return null;
}
