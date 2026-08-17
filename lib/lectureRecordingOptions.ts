import { AudioQuality, IOSOutputFormat, type RecordingOptions } from 'expo-audio';

// ── Lecture capture settings ────────────────────────────────────────────────
// Speech, not music. Every value here is chosen against one budget: a
// 90-minute lecture must stay small enough to upload over campus wifi in
// pieces, and each piece must stay well under the transcription provider's
// 25 MB attachment ceiling.
//
// 32 kbps mono → 32000 × 300 / 8 ≈ 1.2 MB per 5-minute segment, ≈ 21.6 MB for a
// full 90-minute lecture. Neither shipped RecordingPreset is usable here:
// HIGH_QUALITY is stereo 44.1 kHz at 128 kbps (≈86 MB for the same lecture) and
// even LOW_QUALITY is stereo 44.1 kHz at 64 kbps (≈43 MB), because both are
// tuned for general audio rather than a single voice in a large room.

/**
 * MUST be declared at module scope.
 *
 * `useAudioRecorder` re-creates the native recorder whenever its options object
 * changes identity, so a config built inside a component — or derived from
 * state — would tear down and rebuild the recorder mid-lecture.
 */
export const LECTURE_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  // 22.05 kHz resolves speech fully (human voice tops out around 8 kHz) and
  // gives AAC-LC a bitrate-appropriate amount of signal to encode. 44.1 kHz at
  // 32 kbps starves the encoder and sounds worse, not better.
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
  // Top-level, NOT under `ios` — this is what populates RecorderState.metering,
  // which drives the level meter on the record screen.
  isMeteringEnabled: true,
  ios: {
    // The literal value is 'aac ' WITH a trailing space (a FourCC code). Always
    // reference the enum; the string is impossible to get right by eye.
    outputFormat: IOSOutputFormat.MPEG4AAC,
    // Required field. MEDIUM (64) is the encoder-effort knob, independent of
    // bitRate above.
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
    // bitRateStrategy is deliberately omitted: neither shipped preset sets it,
    // and its declared type (number) does not match the string values the
    // native layer documents. Not worth a cast to chase a marginal gain.
  },
  // Required by the type even though this feature is iOS-first today.
  android: {
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    // Speech-tuned input: automatic gain control plus noise suppression, which
    // is exactly right for a voice at the far end of a lecture hall.
    audioSource: 'voice_recognition',
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 32000,
  },
};

/**
 * Length of one captured chunk.
 *
 * Capture is segmented rather than written as one long file because an .m4a
 * killed before its writer finalizes has no `moov` atom — the file is not
 * truncated, it is unplayable. Losing a whole lecture to an OS kill or a crash
 * is unrecoverable; losing the last five minutes is survivable. Segmenting also
 * makes every upload small enough to retry and keeps each transcription request
 * to ~300 seconds of audio, far inside the server's time budget.
 */
export const SEGMENT_SECONDS = 300;

/** Hard ceiling on one recording. Mirrors MAX_LECTURE_SECONDS in lecture-transcribe. */
export const MAX_RECORDING_SECONDS = 90 * 60;

/** How long before the cap the user is warned, so the stop is never a surprise. */
export const RECORDING_WARN_SECONDS = MAX_RECORDING_SECONDS - 5 * 60;

/**
 * Free disk required before a recording may start.
 *
 * A 90-minute lecture is ~22 MB, but segments live on disk until they upload,
 * and a device that is already full will fail mid-lecture — the one failure
 * mode with no recovery, because the class does not happen twice.
 */
export const MIN_FREE_BYTES = 200 * 1024 * 1024;

/** Below this, unplugged, the user gets a warning (not a block). */
export const LOW_BATTERY_WARN = 0.3;
