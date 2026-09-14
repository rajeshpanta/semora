import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { listLocalLectureIds, retryPendingSegments, retryPendingUploads } from '@/lib/lectures';

/**
 * Lectures the server is asked about per pass.
 *
 * Every lecture with audio on this phone is handled regardless of this cap:
 * that list is bounded by what the student actually recorded, and skipping any
 * of it is how audio stays stranded. The cap is only on the server query, which
 * is a backstop for lectures whose files are already gone.
 */
const MAX_LECTURES_PER_PASS = 10;

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
let inFlight: Promise<void> | null = null;

/**
 * One pass, never two at once.
 *
 * Launch, foreground, a restored connection, a recovered session and the
 * lecture screen all ask for this, and two passes running together would each
 * pick up the same part, each upload the same bytes, and each spend one of the
 * three attempts that part is allowed. A second caller joins the pass already
 * running instead of starting another.
 */
export function recoverUnfinishedLectures(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = runRecoveryPass().finally(() => { inFlight = null; });
  return inFlight;
}

async function runRecoveryPass(): Promise<void> {
  if (!CAN_RECOVER) return;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;

  // Local files first, server status second.
  //
  // This used to ask only for lectures the server called 'uploading' or
  // 'transcribing', newest five. Lecture 04cd64e7 on 2026-09-14 was 'ready' —
  // the server had assembled notes from the four parts that arrived and
  // declared itself finished — while four more parts sat on the phone. Server
  // status cannot be the question, because the server does not know what it
  // has not been told. The audio on the device is the thing that is true.
  const local = await listLocalLectureIds();

  const { data: lectures } = await supabase
    .from('lecture_recordings')
    .select('id')
    .in('status', ['uploading', 'transcribing'])
    .order('created_at', { ascending: false })
    .limit(MAX_LECTURES_PER_PASS);

  // Local work leads: it is the part nothing else in the system can see.
  const ids: string[] = [];
  for (const id of [...local, ...((lectures ?? []) as { id: string }[]).map((l) => l.id)]) {
    if (!ids.includes(id)) ids.push(id);
  }
  if (ids.length === 0) return;

  for (const lecture of ids.map((id) => ({ id }))) {
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
