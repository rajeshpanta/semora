import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { Alert, Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import { autoSaveAlert } from '@/lib/lectureAutoSaveCopy';
import { spokenDuration, useI18n } from '@/lib/i18n';
import { useColors } from '@/lib/theme';
import { getLectureSession } from '@/lib/lectureSessionRuntime';
import { formatLectureDuration } from '@/lib/lectures';

/** How long "Marked 23:14" replaces the label after a tap on the star. */
const MARK_FLASH_MS = 1500;

/**
 * "Recording 23:14 — tap to return".
 *
 * The recording outlives the recorder screen now, so a student can end up
 * elsewhere mid-lecture — by tapping a notification, by opening another screen
 * on purpose. Without this there would be no way back to Stop, and no visible
 * sign that the microphone is still on. Hidden on the recorder itself and when
 * nothing is recording.
 *
 * The colour and icon carry the state, so a forgotten pause or a microphone a
 * call killed is visible from every screen: coral with a pulsing dot while
 * capturing, grey with a pause icon while paused, amber with a crossed-out
 * microphone when the mic stopped. The fills are the darker `*Fill` tokens,
 * not the tone colours: white 13px on coral or amber was 2.4–3.9:1, under AA
 * for text this size in both themes, and the bar exists to be read at a glance
 * in a bright lecture hall. A star at the right end marks the moment
 * without leaving the screen the student is on — the professor's "this is on
 * the exam" is gone in three seconds.
 */
export function LectureRecordingBar() {
  const session = getLectureSession();
  const state = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const pathname = usePathname();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { t, locale } = useI18n();
  const [flashUntil, setFlashUntil] = useState(0);
  const [, setFlashTick] = useState(0);

  // A recording that saved itself while the student was elsewhere (the limit,
  // low storage, Stop from the lock screen): say so here, since no recorder
  // screen watched it. The recorder takes the notice first when it did.
  useEffect(() => {
    if (!state.finishedLectureId || state.phase !== 'idle') return;
    const timer = setTimeout(() => {
      const notice = session.takeFinishedNotice();
      if (!notice) return;
      // The ended recording's own limit: state.maxSeconds has already been
      // reset to the default by the time this runs.
      const noticeMaxSeconds = (notice as { maxSeconds?: number }).maxSeconds;
      const alert = autoSaveAlert(notice.autoSaved, Math.round((noticeMaxSeconds ?? state.maxSeconds) / 60));
      const view = { text: 'View', onPress: () => router.push(`/lecture/${notice.lectureId}` as any) };
      if (alert) Alert.alert(alert.title, alert.body, [{ text: 'OK', style: 'cancel' }, view]);
      else if (notice.autoSaved === 'lock_screen_stop') {
        Alert.alert('Recording saved', 'Your lecture is being turned into notes.', [{ text: 'OK', style: 'cancel' }, view]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [state.finishedLectureId, state.phase, state.maxSeconds, session, router]);

  // The pulsing dot: the same loop as the recorder's, and only while audio is
  // actually being captured — solid otherwise, so paused and stopped read as
  // "not moving" at a glance. Hooks stay above the early return below.
  const capturing = state.phase === 'recording' && state.micStoppedAt === null;
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!capturing) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [capturing, pulse]);

  // "Marked 23:14" for a moment after the star, then the label comes back.
  useEffect(() => {
    const remaining = flashUntil - Date.now();
    if (remaining <= 0) return;
    const timer = setTimeout(() => setFlashTick((n) => n + 1), remaining);
    return () => clearTimeout(timer);
  }, [flashUntil]);

  const live = state.phase === 'recording' || state.phase === 'paused';
  const paused = state.phase === 'paused';
  const micStopped = state.micStoppedAt !== null;
  const label = paused ? 'Recording paused' : micStopped ? 'Mic stopped' : 'Recording';

  // Spoken, not only coloured: accessibilityLiveRegion is Android-only, so a
  // VoiceOver user elsewhere in the app heard nothing when a call killed the
  // microphone or a pause was left running. Announced when the state changes
  // while the bar is showing — not on mount, which would talk over the screen
  // the student just arrived on.
  const shown = live && Platform.OS !== 'web' && pathname !== '/lecture/record';
  const announcedLabel = useRef<string | null>(null);
  useEffect(() => {
    if (!shown) {
      announcedLabel.current = null;
      return;
    }
    if (announcedLabel.current === null) {
      announcedLabel.current = label;
      return;
    }
    if (announcedLabel.current === label) return;
    announcedLabel.current = label;
    AccessibilityInfo.announceForAccessibility(t(label));
  }, [shown, label, t]);

  if (!shown) return null;

  const time = formatLectureDuration(state.elapsed);
  const lastMark = state.marks.length > 0 ? state.marks[state.marks.length - 1] : null;
  const flashing = Date.now() < flashUntil && lastMark !== null;
  const background = micStopped ? colors.amberFill : paused ? colors.pausedFill : colors.coralFill;

  const onMark = () => {
    if (!session.markImportant('bar')) return;
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setFlashUntil(Date.now() + MARK_FLASH_MS);
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 6 }]}>
      <View style={[styles.bar, { backgroundColor: background }]}>
        <TouchableOpacity
          style={styles.returnArea}
          onPress={() => router.navigate('/lecture/record' as any)}
          activeOpacity={0.85}
          accessibilityRole="button"
          // Each fixed phrase translated on its own: the spoken duration is
          // already in words, so no single pattern could match the whole.
          accessibilityLabel={`${t(label)}, ${spokenDuration(state.elapsed, locale)}. ${t('Return to the recording')}`}
        >
          {capturing ? (
            <Animated.View style={[styles.dot, { opacity: pulse }]} />
          ) : (
            <FontAwesome name={micStopped ? 'microphone-slash' : paused ? 'pause' : 'microphone'} size={12} color="#fff" />
          )}
          <Text style={[styles.text, styles.label]} numberOfLines={1}>
            {flashing ? `Marked ${formatLectureDuration(lastMark)}` : label}
          </Text>
          {flashing ? null : <Text style={styles.time} numberOfLines={1} adjustsFontSizeToFit>{time}</Text>}
          <Text style={styles.text} numberOfLines={1}>{micStopped ? '· Tap to fix' : '· Return'}</Text>
        </TouchableOpacity>
        {capturing ? (
          <>
            <View style={styles.divider} />
            <TouchableOpacity
              hitSlop={8}
              style={styles.markBtn}
              onPress={onMark}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Mark this moment important"
              accessibilityHint="Your notes will highlight what was just said, and your quiz will test it."
            >
              <FontAwesome name="star" size={13} color="#fff" />
              {state.marks.length > 0 ? <Text style={styles.text}>{String(state.marks.length)}</Text> : null}
            </TouchableOpacity>
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000, paddingHorizontal: 12 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '100%',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  returnArea: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  divider: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.35)' },
  markBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  // 14px semibold, not 13px bold: the larger size is what AA measures at, and
  // the label may shrink before the time does at accessibility text sizes.
  text: { color: '#fff', fontSize: 14, fontWeight: '600' },
  label: { flexShrink: 1 },
  time: { color: '#fff', fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
