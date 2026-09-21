import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Alert } from '@/components/LocalizedReactNative';
import { getDeviceItem, setDeviceItem } from '@/lib/deviceStore';
import { useI18n, timeFormatOptions } from '@/lib/i18n';
import { subscribeUploadQueue, takeInterruptedRecordingNotices } from '@/lib/lectureUploadQueue';

/**
 * Tells the student about a recording the app was killed in the middle of.
 *
 * The saved parts are finished automatically (lib/lectureUploadQueue.ts); this
 * only makes sure it is not a surprise — and not a silence. Shown once per
 * lecture, ever. A kill that saved nothing at all (parts 0, savedSeconds 0)
 * gets its own honest sentence and no View: the lecture row is gone.
 */
export function LectureInterruptedNotice() {
  const router = useRouter();
  const { localeTag } = useI18n();

  useEffect(() => {
    const show = () => {
      for (const notice of takeInterruptedRecordingNotices()) {
        const key = `semora_lecture_interrupted_shown_${notice.lectureId}`;
        if (getDeviceItem(key)) continue;
        setDeviceItem(key, '1');
        const when = notice.startedAtMs
          ? new Date(notice.startedAtMs).toLocaleTimeString(localeTag, timeFormatOptions())
          : null;
        // Nothing reached this phone's disk before the kill (1.13/1.14 on the
        // expo engine, locked phone): there is no lecture to open, so no View.
        // Only raised for a recording that ran longer than one part; a shorter
        // one is still abandoned silently (lib/lectureUploadQueue.ts).
        if (notice.parts === 0 && notice.savedSeconds === 0) {
          Alert.alert(
            "Your recording couldn't be saved",
            when
              ? `Your recording from ${when} couldn't be saved because Semora was closed while the phone was locked.`
              : "Your recording couldn't be saved because Semora was closed while the phone was locked.",
            [{ text: 'OK', style: 'cancel' }],
          );
          continue;
        }
        const minutes = Math.max(1, Math.round(notice.savedSeconds / 60));
        Alert.alert(
          'Your recording was interrupted',
          when
            ? `Semora closed while recording your lecture from ${when}. ${minutes} minutes were saved and are being turned into notes.`
            : `Semora closed while recording a lecture. ${minutes} minutes were saved and are being turned into notes.`,
          [
            { text: 'OK', style: 'cancel' },
            { text: 'View', onPress: () => router.push(`/lecture/${notice.lectureId}` as any) },
          ],
        );
      }
    };
    show();
    return subscribeUploadQueue(show);
  }, [router, localeTag]);

  return null;
}
