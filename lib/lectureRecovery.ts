import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { retryPendingSegments, retryPendingUploads } from '@/lib/lectures';

// Finishing what a killed app left behind — for every unfinished recording,
// not just the one the student happens to reopen.
//
// A recording is driven entirely from the device: segments upload as they
// close, and the server will not assemble a transcript while any segment is
// unfinished. Every step after "audio captured" therefore depends on the app
// still being alive, and often it is not — iOS terminates backgrounded apps
// under memory pressure, students force-quit out of habit, and a 50-minute
// lecture is ten segments of opportunity for lecture-hall wifi to drop one.
//
// The recovery itself is NOT new: retryPendingUploads() re-sends audio still
// on the device, retryPendingSegments() re-asks for transcription, and the
// pair already runs — from app/lecture/[id].tsx, and only there. That helps
// exactly the students who think to go back and open that specific lecture.
// The audio is sitting on the phone the whole time; nothing was missing except
// something to ask.
//
// So this adds no new mechanism. It runs the same two calls, in the same order
// and for the same reasons, once at launch across every unfinished recording.
//
// Migration 082's server sweep is the other half and does not replace this:
// the sweep can only salvage what already reached the server, because it
// cannot reach audio that never left the phone. This recovers the audio; the
// sweep guarantees the row stops being stuck even for a student who never
// opens the app again.

/** No recorder and no local segment files exist on web. */
const CAN_RECOVER = Platform.OS !== 'web';

/**
 * One pass over everything unfinished.
 *
 * Safe on every launch: both calls are idempotent, and an account with nothing
 * stranded spends a single indexed query and stops. Capped at five because
 * this runs behind whatever the student actually opened the app to do — a
 * bigger backlog than that is the sweep's problem, not the launch path's.
 */
export async function recoverUnfinishedLectures(): Promise<void> {
  if (!CAN_RECOVER) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  const { data: lectures, error } = await supabase
    .from('lecture_recordings')
    .select('id')
    .in('status', ['uploading', 'transcribing'])
    .order('created_at', { ascending: false })
    .limit(5);
  if (error || !lectures?.length) return;

  for (const lecture of lectures as { id: string }[]) {
    try {
      // Uploads first, then transcription — a segment whose bytes never
      // arrived cannot be transcribed, and the server will not assemble a
      // transcript while any segment is unfinished. Same order as the detail
      // screen, for the same reason.
      const uploaded = await retryPendingUploads(lecture.id);
      await retryPendingSegments(lecture.id);
      if (uploaded > 0) {
        track('lecture_recovered_on_launch', { segments: uploaded });
      }
    } catch {
      // Best-effort by design: this runs behind the student's actual intent
      // and must never surface an error or block the UI. A recording this
      // cannot rescue is left for the server sweep, which will finalise or
      // fail it rather than leaving a spinner.
      continue;
    }
  }
}
