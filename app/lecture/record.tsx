import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Alert, Text, TextInput, TouchableOpacity } from '@/components/LocalizedReactNative';
import { Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { useCourses } from '@/lib/queries';
import { useI18n } from '@/lib/i18n';
import { track } from '@/lib/analytics';
import { useLectureRecorder } from '@/lib/lectureRecorder';
import { MAX_RECORDING_SECONDS } from '@/lib/lectureRecordingOptions';
import { formatLectureDuration, useFreeActionUsed } from '@/lib/lectures';
import {
  LectureConsentSheet,
  hasAcceptedLectureConsent,
  rememberLectureConsent,
} from '@/components/LectureConsentSheet';

// The recorder screen.
//
// Order of operations on this screen is a compliance requirement, not a
// preference: title and course are chosen FIRST, then the consent sheet, then
// the OS microphone prompt, then capture. Asking for the title afterwards (the
// obvious design) means the server cannot check the free-lecture allowance or
// the shared transcription capacity until the recording already exists — and
// telling a student their 90-minute lecture cannot be transcribed after the
// class has ended is a failure with no recovery.

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function RecordLectureScreen() {
  const params = useLocalSearchParams<{ courseId?: string }>();
  const colors = useColors();
  const router = useRouter();
  const { contentMaxWidth } = useResponsive();
  const { t, localeTag } = useI18n();
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const { data: courses = [] } = useCourses(selectedSemesterId);
  const isPro = useAppStore((s) => s.isPro);
  const { data: freeLectureUsed } = useFreeActionUsed();

  const navigation = useNavigation();
  const recorder = useLectureRecorder();
  const [title, setTitle] = useState('');
  // Preselected when the caller already knows the class — the "+" menu asks
  // before it routes here, and the course screen passes its own id. Arriving
  // with it set is what stops a recording being filed nowhere; the chips below
  // stay editable so it can still be changed or cleared.
  const [courseId, setCourseId] = useState<string | null>(params.courseId ?? null);
  const [consentVisible, setConsentVisible] = useState(false);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const warnedRef = useRef(false);

  const isLive = recorder.phase === 'recording' || recorder.phase === 'paused';
  // Nothing is being captured, so there is nothing to protect and no reason to
  // hold the user here. 'finishing' counts: by then the audio session is already
  // released, the uploads survive unmount (nothing aborts them), and any segment
  // that fails keeps its local file for the lecture screen's resume path. The
  // only thing waiting here buys is watching a spinner — on bad campus wifi that
  // was minutes of it, with the app needing a force-quit to escape.
  const canLeaveFreely = !isLive;

  // The swipe-to-dismiss lock exists so a half-finished lecture can't be thrown
  // away by a stray gesture — but it was applied to the ROUTE, unconditionally,
  // while the only exits (Stop / Discard) render solely once recording is live.
  // A start that failed therefore left the user on a screen with no gesture, no
  // header button and no control: the app had to be force-quit. Re-lock only
  // while there is actually a recording to protect.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: canLeaveFreely });
  }, [navigation, canLeaveFreely]);

  // Pulsing dot — the required "you are being recorded" affordance. It stays
  // SOLID (not hidden) while paused, because a paused session still holds the
  // microphone session and the user must be able to tell at a glance.
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (recorder.phase !== 'recording') {
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
  }, [recorder.phase, pulse]);

  // Covers BOTH ways a recording ends. The 90-minute cap stops from inside the
  // timer, where there is no tap to hang navigation off, so a user who recorded
  // to the limit would otherwise be dropped back on an empty setup form with no
  // sign of where their lecture went.
  useEffect(() => {
    if (recorder.finishedLectureId) {
      router.replace(`/lecture/${recorder.finishedLectureId}` as any);
    }
  }, [recorder.finishedLectureId, router]);

  useEffect(() => {
    if (recorder.warnedNearLimit && !warnedRef.current) {
      warnedRef.current = true;
      Alert.alert(
        '5 minutes left',
        'This recording reaches its 90-minute limit soon. It will save automatically.',
      );
    }
  }, [recorder.warnedNearLimit]);

  const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(style);
  };

  const beginRecording = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    const fallbackTitle = `${t('Lecture')} · ${new Date().toLocaleDateString(localeTag, {
      month: 'short',
      day: 'numeric',
    })}`;
    const result = await recorder.start({
      title: title.trim() || fallbackTitle,
      courseId,
    });
    startingRef.current = false;
    setStarting(false);

    if (result.ok) {
      haptic();
      return;
    }

    if (result.code === 'FREE_LECTURE_USED') {
      // Explain before navigating. Dropping someone onto a paywall with no
      // stated reason reads as a bug, and the server already localized this.
      Alert.alert(
        'Free lecture already used',
        result.message ||
          "You've used your free lecture recording. Upgrade to Pro for unlimited lectures.",
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'See Pro',
            onPress: () => {
              track('paywall_open', { screen: 'lecture_record', context: 'lecture' });
              router.push('/paywall' as any);
            },
          },
        ],
      );
      return;
    }
    if (result.code === 'WEB_UNSUPPORTED') {
      Alert.alert(
        'Use the iPhone app to record',
        'Lecture recording needs the microphone and background audio, which browsers can’t provide. Everything you record shows up here on the web afterwards.',
      );
      return;
    }
    if (result.code === 'MIC_DENIED') {
      Alert.alert(
        'Microphone access needed',
        'Semora needs microphone access to record your lecture. You can enable it in Settings.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    if (result.code === 'NO_SPACE') {
      Alert.alert(
        'Not enough storage',
        'Free up some space on your device before recording a lecture.',
      );
      return;
    }
    Alert.alert(
      "Couldn't start recording",
      result.message || 'Something went wrong starting the recording. Please try again.',
    );
  }, [recorder, title, courseId, router, t, localeTag]);

  const handleStartPressed = useCallback(async () => {
    // Guard BEFORE the first await. `starting` is React state, so it does not
    // update until the next render — two quick taps both got past it, and each
    // created its own lecture row holding its own 90-minute reservation, one of
    // which nothing would ever release.
    if (startingRef.current) return;
    if (await hasAcceptedLectureConsent()) {
      void beginRecording();
      return;
    }
    setConsentVisible(true);
  }, [beginRecording]);

  const handleConsentAccepted = useCallback(async () => {
    await rememberLectureConsent();
    setConsentVisible(false);
    track('lecture_consent_accepted', { screen: 'lecture_record' });
    void beginRecording();
  }, [beginRecording]);

  const handleStop = useCallback(async () => {
    haptic();
    if (recorder.elapsed < 5) {
      Alert.alert('Too short', 'Record at least a few seconds before saving.');
      return;
    }
    // Navigation is handled by the finishedLectureId effect above, which also
    // covers the automatic stop at the 90-minute cap.
    await recorder.stop();
  }, [recorder]);

  const handleDiscard = useCallback(() => {
    Alert.alert(
      'Discard recording?',
      'This recording and everything captured so far will be deleted.',
      [
        { text: 'Keep recording', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            await recorder.discard();
            router.back();
          },
        },
      ],
    );
  }, [recorder, router]);

  const remaining = Math.max(0, MAX_RECORDING_SECONDS - recorder.elapsed);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <LectureConsentSheet
        visible={consentVisible}
        onAccept={() => void handleConsentAccepted()}
        onCancel={() => setConsentVisible(false)}
      />

      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Timer stage */}
        <View style={[styles.stage, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={styles.statusRow}>
            {isLive && (
              <Animated.View
                style={[
                  styles.recDot,
                  { backgroundColor: colors.coral },
                  recorder.phase === 'recording' ? { opacity: pulse } : null,
                ]}
              />
            )}
            <Text
              style={[styles.statusLabel, { color: isLive ? colors.coral : colors.ink3 }]}
            >
              {recorder.phase === 'recording'
                ? 'Recording'
                : recorder.phase === 'paused'
                  ? 'Paused — not recording'
                  : recorder.phase === 'finishing'
                    ? 'Saving…'
                    : 'Ready to record'}
            </Text>
          </View>

          <Text style={[styles.clock, { color: colors.ink }]}>{formatClock(recorder.elapsed)}</Text>

          {/* Live input meter — also the honest signal that the mic is actually
              picking something up, which is what a student checks when they sit
              at the back of a lecture hall. */}
          {isLive ? (
            <View style={[styles.meterTrack, { backgroundColor: colors.line }]}>
              <View
                style={[
                  styles.meterFill,
                  {
                    backgroundColor: recorder.phase === 'paused' ? colors.ink3 : colors.coral,
                    width: `${Math.round((recorder.phase === 'paused' ? 0 : recorder.level) * 100)}%`,
                  },
                ]}
              />
            </View>
          ) : (
            <Text style={[styles.capNote, { color: colors.ink3 }]}>
              Up to 90 minutes per recording
            </Text>
          )}

          {isLive && (
            <Text style={[styles.capNote, { color: colors.ink3 }]}>
              {`${formatLectureDuration(remaining)} left`}
            </Text>
          )}
        </View>

        {/* Upload progress — real counts, not a spinner. Transcription happens
            while the lecture is still being recorded, so by Stop most of it is
            usually already done. */}
        {isLive && recorder.segmentsClosed > 0 && (
          <View style={[styles.progressCard, { backgroundColor: colors.brand50 }]}>
            <FontAwesome name="cloud-upload" size={13} color={colors.brand} />
            <Text style={[styles.progressText, { color: colors.ink2 }]}>
              {`${recorder.segmentsUploaded} of ${recorder.segmentsClosed} parts uploaded`}
            </Text>
          </View>
        )}
        {recorder.uploadFailed > 0 && (
          <View style={[styles.warnCard, { backgroundColor: colors.amber50, borderColor: colors.amber }]}>
            <FontAwesome name="exclamation-triangle" size={13} color={colors.amber} style={{ marginTop: 1 }} />
            <Text style={[styles.warnText, { color: colors.ink2 }]}>
              Some parts haven’t uploaded yet. Keep recording — Semora will retry them, and you
              can finish the upload from the lecture screen.
            </Text>
          </View>
        )}
        {recorder.interrupted && (
          <View style={[styles.warnCard, { backgroundColor: colors.amber50, borderColor: colors.amber }]}>
            <FontAwesome name="info-circle" size={13} color={colors.amber} style={{ marginTop: 1 }} />
            <Text style={[styles.warnText, { color: colors.ink2 }]}>
              Recording resumed after an interruption. A short gap is marked in your transcript.
            </Text>
          </View>
        )}

        {/* The one-free-lecture limit, stated BEFORE the tap rather than
            discovered as a paywall afterwards. A student who records a whole
            class and only then learns they had no allowance left has lost
            something they cannot get back. */}
        {!isPro && !isLive && recorder.phase !== 'finishing' && (
          <View
            style={[
              styles.warnCard,
              freeLectureUsed
                ? { backgroundColor: colors.coral50, borderColor: colors.coral }
                : { backgroundColor: colors.brand50, borderColor: colors.brand50 },
            ]}
          >
            <FontAwesome
              name={freeLectureUsed ? 'lock' : 'gift'}
              size={13}
              color={freeLectureUsed ? colors.coral : colors.brand}
              style={{ marginTop: 1 }}
            />
            <Text style={[styles.warnText, { color: colors.ink2 }]}>
              {freeLectureUsed
                ? "You've used your free action. Semora Pro includes unlimited lectures and scans."
                : 'Free accounts include one AI action — this lecture or a syllabus scan. Pro includes unlimited lectures and scans.'}
            </Text>
          </View>
        )}

        {/* Setup — only before recording starts. Both fields are needed up front
            so the server can authorize the recording before the mic opens. */}
        {!isLive && recorder.phase !== 'finishing' && (
          <>
            <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Title</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: colors.card, borderColor: colors.line, color: colors.ink },
              ]}
              placeholder="e.g. Week 4 — Neural networks"
              placeholderTextColor={colors.ink3}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
              returnKeyType="done"
            />

            <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Course (optional)</Text>
            <Text style={[styles.fieldHint, { color: colors.ink3 }]}>
              Attaching a course lets the AI Tutor and flashcards use this lecture.
            </Text>
            <View style={styles.chipWrap}>
              {courses.map((c) => {
                const active = courseId === c.id;
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: active ? colors.brand : colors.card,
                        borderColor: active ? colors.brand : colors.line,
                      },
                    ]}
                    onPress={() => setCourseId(active ? null : c.id)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={c.name}
                  >
                    <Text
                      style={[styles.chipText, { color: active ? '#fff' : colors.ink2 }]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {courses.length === 0 && (
                <Text style={[styles.fieldHint, { color: colors.ink3 }]}>
                  No courses yet — you can attach one later.
                </Text>
              )}
            </View>
          </>
        )}

        {/* Controls */}
        {recorder.phase === 'idle' || recorder.phase === 'starting' ? (
          <TouchableOpacity
            style={[styles.bigButton, { backgroundColor: colors.coral }, starting && { opacity: 0.6 }]}
            onPress={() => void handleStartPressed()}
            disabled={starting}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Start recording"
          >
            <FontAwesome name="microphone" size={20} color="#fff" />
            <Text style={styles.bigButtonText}>
              {starting ? 'Starting…' : 'Start recording'}
            </Text>
          </TouchableOpacity>
        ) : recorder.phase === 'finishing' ? (
          <>
            <View style={[styles.bigButton, { backgroundColor: colors.ink3 }]}>
              <Text style={styles.bigButtonText}>Saving your lecture…</Text>
            </View>
            <Text style={[styles.finishingNote, { color: colors.ink3 }]}>
              Semora keeps uploading if you leave. Your lecture will be waiting under
              Lectures.
            </Text>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => router.back()}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Leave while the lecture finishes saving"
            >
              <Text style={[styles.cancelText, { color: colors.brand }]}>Leave</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.controlRow}>
              <TouchableOpacity
                style={[styles.controlBtn, { backgroundColor: colors.card, borderColor: colors.line }]}
                onPress={() => {
                  haptic(Haptics.ImpactFeedbackStyle.Light);
                  if (recorder.phase === 'paused') void recorder.resume();
                  else recorder.pause();
                }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={recorder.phase === 'paused' ? 'Resume recording' : 'Pause recording'}
              >
                <FontAwesome
                  name={recorder.phase === 'paused' ? 'play' : 'pause'}
                  size={16}
                  color={colors.ink}
                />
                <Text style={[styles.controlText, { color: colors.ink }]}>
                  {recorder.phase === 'paused' ? 'Resume' : 'Pause'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.controlBtn, styles.stopBtn, { backgroundColor: colors.coral }]}
                onPress={handleStop}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Stop and save recording"
              >
                <FontAwesome name="stop" size={15} color="#fff" />
                <Text style={[styles.controlText, { color: '#fff' }]}>Stop & save</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.discardBtn}
              onPress={handleDiscard}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Discard recording"
            >
              <Text style={[styles.discardText, { color: colors.coral }]}>Discard recording</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Explicit way out. A swipe is not discoverable, and this screen is
            reached from a menu — someone who opens it to look, or whose start
            fails, needs a visible exit that is not "force-quit the app". */}
        {!isLive && recorder.phase !== 'finishing' && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Cancel and go back"
          >
            <Text style={[styles.cancelText, { color: colors.ink2 }]}>Cancel</Text>
          </TouchableOpacity>
        )}

        {/* What happens next */}
        {!isLive && recorder.phase !== 'finishing' && (
          <View style={[styles.explainCard, { backgroundColor: colors.brand50 }]}>
            <FontAwesome name="magic" size={14} color={colors.brand} style={{ marginTop: 2 }} />
            <Text style={[styles.explainText, { color: colors.ink2 }]}>
              Semora transcribes as you record and writes your lecture notes when you stop. Keep the
              app open or lock your screen — recording continues either way.
            </Text>
          </View>
        )}

        {/* Permanent reminder. The consent sheet is shown once; this never goes
            away, because the responsibility does not either. */}
        <Text style={[styles.consentNote, { color: colors.ink3 }]}>
          Recording laws vary by state and country, and some require everyone being recorded to
          agree. You are responsible for getting permission before you record.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    padding: 20,
    paddingBottom: 40,
    width: '100%',
    maxWidth: SCREEN_MAX_WIDTH,
    alignSelf: 'center',
  },
  stage: {
    borderRadius: 22,
    borderWidth: 0.5,
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recDot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { fontSize: 12.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  clock: {
    fontFamily: FONTS.displaySemibold,
    fontSize: 54,
    letterSpacing: 1,
    marginTop: 10,
    fontVariant: ['tabular-nums'],
  },
  capNote: { fontSize: 12.5, marginTop: 8 },
  meterTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    marginTop: 14,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', borderRadius: 3 },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 11,
    marginTop: 12,
  },
  progressText: { flex: 1, fontSize: 12.5, fontWeight: '500' },
  warnCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    padding: 11,
    marginTop: 10,
  },
  warnText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  bigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 20,
  },
  bigButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  controlRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  controlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 15,
    borderWidth: 0.5,
  },
  stopBtn: { borderWidth: 0 },
  controlText: { fontSize: 15, fontWeight: '600' },
  explainCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
  },
  explainText: { flex: 1, fontSize: 13, lineHeight: 19 },
  consentNote: { fontSize: 12, lineHeight: 17, marginTop: 14, textAlign: 'center', paddingHorizontal: 6 },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginTop: 20, marginBottom: 6 },
  fieldHint: { fontSize: 12.5, lineHeight: 17, marginBottom: 8 },
  input: {
    borderRadius: 14,
    borderWidth: 0.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, maxWidth: '100%' },
  chipText: { fontSize: 13.5, fontWeight: '600' },
  finishingNote: { fontSize: 13, lineHeight: 18.5, textAlign: 'center', marginTop: 12, paddingHorizontal: 8 },
  cancelBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  cancelText: { fontSize: 15, fontWeight: '600' },
  discardBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  discardText: { fontSize: 14, fontWeight: '600' },
});
