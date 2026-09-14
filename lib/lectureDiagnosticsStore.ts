/**
 * The device side of lib/lectureDiagnostics.ts.
 *
 * One place that records a lecture failure BOTH ways: straight to analytics,
 * which works when there is signal, and onto the device, which works when there
 * is not. The stored copy is sent on the next recovery pass, which is to say at
 * launch, on foreground and when the connection comes back.
 *
 * Every lecture failure should go through `trackLectureFailure` rather than
 * calling `track` directly, because the failures worth having are exactly the
 * ones raised with no network.
 */
import { getDeviceItem, setDeviceItem } from '@/lib/deviceStore';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase';
import { failureProperties, type LectureFailure } from '@/lib/lectureFailure';
import {
  flushDiagnostics,
  recordDiagnostic,
  type DiagnosticStorage,
  type LectureDiagnostic,
} from '@/lib/lectureDiagnostics';

const storage: DiagnosticStorage = {
  read: (key) => getDeviceItem(key),
  write: (key, value) => setDeviceItem(key, value),
};

/** Report a lecture failure to analytics and to the device, in that order. */
export function trackLectureFailure(
  event: string,
  screen: string,
  failure: LectureFailure,
  seq: number,
  attempt: number,
): void {
  const props = failureProperties(failure, seq, attempt);
  track(event, { screen, ...props });
  try {
    recordDiagnostic(storage, { at: Date.now(), event, ...props });
  } catch {
    // Recording a diagnostic must never be the thing that breaks a recording.
  }
}

/**
 * Send whatever was stored while there was no signal.
 *
 * Deliberately inserts directly rather than going through `track`: `track`
 * swallows its own result, so it could never tell this whether an entry
 * actually landed, and an entry that did not land has to stay. The rows carry
 * `deferred: true` and their original timestamp, so a late arrival is not
 * mistaken for a failure that just happened.
 */
export async function flushLectureDiagnostics(): Promise<void> {
  try {
    await flushDiagnostics(storage, async (entry: LectureDiagnostic) => {
      const { at, event, ...rest } = entry;
      const { error } = await supabase.from('analytics_events').insert({
        app_name: 'semora',
        event_name: event,
        properties: { ...rest, deferred: true, occurred_at: new Date(at).toISOString() },
        created_at: new Date(at).toISOString(),
      });
      return !error;
    });
  } catch {
    // Best effort, behind whatever the student opened the app to do.
  }
}
