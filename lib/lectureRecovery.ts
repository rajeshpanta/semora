import { Platform } from 'react-native';
import { kickUploadQueue } from '@/lib/lectureUploadQueue';
import { flushLectureDiagnostics } from '@/lib/lectureDiagnosticsStore';

// Finishing what a recording left behind, for every lecture on this phone.
//
// All of the work is the upload queue's (lib/lectureUploadQueue.ts): it is
// driven by the audio and journal on the device, so it finds parts the server
// has never heard of — the ones a signed-out, locked phone could not deliver.
// This only asks it to run at the moments something may have changed: launch,
// sign-in, returning to the app, and the network coming back (see
// LectureRecoveryRuntime in app/_layout.tsx). One pass runs at a time.
//
// The server sweep is the other half and does not replace this: it can only
// finish what already reached the server.

const CAN_RECOVER = Platform.OS !== 'web';

export async function recoverUnfinishedLectures(reason = 'launch'): Promise<void> {
  if (!CAN_RECOVER) return;
  // Failures raised with no signal were kept on the device; they go out now.
  await flushLectureDiagnostics();
  await kickUploadQueue(reason);
}
