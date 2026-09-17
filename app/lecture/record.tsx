import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PixelRatio, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Alert, Text, TextInput, TouchableOpacity } from '@/components/LocalizedReactNative';
import { Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { APP_STORE_URL, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { autoSaveAlert } from '@/lib/lectureAutoSaveCopy';
import { MAX_MARKS } from '@/lib/lectureCaptureRules';
import { MAX_PAUSE_MS } from '@/lib/lectureSession';
import { canRecordLectures, getLectureSession } from '@/lib/lectureSessionRuntime';
import { isNativeRecorderAvailable } from '@/lib/lectureCapture/nativeEngine';
import { useColors } from '@/lib/theme';
import { ProUpsellSheet } from '@/components/ProUpsellSheet';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { useCourses } from '@/lib/queries';
import { spokenDuration, useI18n } from '@/lib/i18n';
import { track } from '@/lib/analytics';
import { useLectureRecorder } from '@/lib/lectureRecorder';
import { formatLectureDuration, useFreeActionUsed, useLectureLocalProgress } from '@/lib/lectures';
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
//
// The recording itself does not belong to this screen (lib/lectureSession.ts).
// Leaving it — for any reason — keeps recording, and coming back shows the live
// session. Everything shown here is measured, not assumed: the clock is audio
// the microphone actually captured, and "stopped" means it stopped.

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Samples kept in the scrolling level history: one per second. */
const LEVEL_BARS = 40;
/** How long a Mark tap's outcome replaces the button label. */
const MARK_FLASH_MS = 1600;
/** A pause this long is probably forgotten; the copy turns amber and says so. */
const LONG_PAUSE_SECONDS = 30 * 60;
/** Stop is unavailable until this much audio exists (replaces the 'Too short' alert). */
const MIN_STOP_SECONDS = 5;
/**
 * Past this text scale the three-up control row no longer fits: "Continue
 * recording" and "Stop & save" side by side at AX sizes overflow the screen,
 * so the buttons stack instead. Font scaling itself is never capped.
 */
const STACK_CONTROLS_FONT_SCALE = 1.6;

type NoticeTone = 'coral' | 'amber';
type FontAwesomeName = React.ComponentProps<typeof FontAwesome>['name'];
interface LiveNotice {
  key: string;
  rank: number;
  tone: NoticeTone;
  icon: FontAwesomeName;
  /** Two-word chip label. */
  chip: string;
  /** The full sentence, shown in the card slot. */
  sentence: string;
  active: boolean;
}

export default function RecordLectureScreen() {
  const params = useLocalSearchParams<{ courseId?: string }>();
  const colors = useColors();
  const router = useRouter();
  const { contentMaxWidth } = useResponsive();
  const { t, localeTag, locale } = useI18n();
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const { data: courses = [] } = useCourses(selectedSemesterId);
  const isPro = useAppStore((s) => s.isPro);
  const { data: freeLectureUsed } = useFreeActionUsed();
  const [upsellVisible, setUpsellVisible] = useState(false);

  const navigation = useNavigation();
  const recorder = useLectureRecorder();
  const local = useLectureLocalProgress(recorder.lectureId);
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
  // The bottom dock's measured height, so the scroll content can clear it.
  const [dockHeight, setDockHeight] = useState(0);
  // A chip the student tapped to read in full; null shows the top-ranked notice.
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  // What the Mark button says for a moment after a tap (success or refusal).
  const [markFlash, setMarkFlash] = useState<{ text: string; ok: boolean } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One level sample per second, oldest first; bars are plain Views.
  const levelsRef = useRef<number[]>(new Array(LEVEL_BARS).fill(0));

  const isLive = recorder.phase === 'recording' || recorder.phase === 'paused';
  const isFinishing = recorder.phase === 'finishing';
  const maxMinutes = Math.round(recorder.maxSeconds / 60);

  // A swipe must not throw away a live recording by accident. It would not
  // stop it any more (the session outlives this screen), but a student who
  // swipes the recorder away mid-class should do so on purpose.
  const canLeaveFreely = !isLive && !recorder.savingLocally;
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: canLeaveFreely });
  }, [navigation, canLeaveFreely]);

  // Pulsing dot — the required "you are being recorded" affordance. It stays
  // SOLID (not hidden) while paused or stopped, so the state is visible at a
  // glance.
  const pulse = useRef(new Animated.Value(1)).current;
  const capturingNow = recorder.phase === 'recording' && recorder.micStoppedAt === null;
  useEffect(() => {
    if (!capturingNow) {
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
  }, [capturingNow, pulse]);

  // Covers every way a recording ends: Stop, the recording limit, a session
  // left running far too long, storage running out, or Stop from the lock
  // screen. Each of the automatic ones also says why.
  //
  // Only for a recording this screen saw running. One that ended while the
  // student was elsewhere (Stop from the lock screen, the limit) leaves its
  // finished state behind; opening Record later must not jump to that old
  // lecture.
  // The notice is taken once (takeFinishedNotice): if this screen did not
  // watch the recording, the app-wide bar shows the alert instead.
  const sawLiveRef = useRef(false);
  if (recorder.phase !== 'idle') sawLiveRef.current = true;
  useEffect(() => {
    if (!recorder.finishedLectureId || !sawLiveRef.current) return;
    // Only the recorder screen the student is looking at; one left mounted
    // under other screens leaves the notice to the app-wide bar.
    if (!navigation.isFocused()) return;
    const notice = getLectureSession().takeFinishedNotice();
    if (!notice) return;
    sawLiveRef.current = false;
    router.replace(`/lecture/${notice.lectureId}` as any);
    // The limit of the recording that just ended, carried on the notice: the
    // session has already reset its own maxSeconds to the default by now, so
    // a 3-hour recording would otherwise be quoted as a 90-minute one.
    const noticeMaxSeconds = (notice as { maxSeconds?: number }).maxSeconds;
    const alert = autoSaveAlert(notice.autoSaved, Math.round((noticeMaxSeconds ?? recorder.maxSeconds) / 60));
    if (alert) Alert.alert(alert.title, alert.body);
  }, [recorder.finishedLectureId, router, recorder.maxSeconds, navigation]);

  // Near the limit: one warning haptic, and an inline notice (below) rather
  // than a modal that takes the screen away from Stop and Mark and cannot show
  // on a locked phone.
  useEffect(() => {
    if (recorder.warnedNearLimit && isLive && !warnedRef.current) {
      warnedRef.current = true;
      if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    if (!isLive) warnedRef.current = false;
  }, [recorder.warnedNearLimit, isLive]);

  // Level history: recorder.level already changes once a second from the
  // session's tick, so pushing a sample per change adds no timer of its own.
  // Computed during the tick's own render — a second render per second was the
  // alternative — and keyed on the clock, so one sample per tick.
  const levels = useMemo(() => {
    if (isLive) {
      levelsRef.current = [...levelsRef.current.slice(1), recorder.phase === 'paused' ? 0 : recorder.level];
    } else if (levelsRef.current.some((v) => v > 0)) {
      levelsRef.current = new Array(LEVEL_BARS).fill(0);
    }
    return levelsRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.elapsed, recorder.phase, isLive]);

  useEffect(() => () => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
  }, []);

  const haptic = (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Medium) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(style);
  };

  const flash = useCallback((text: string, ok: boolean) => {
    if (flashTimer.current !== null) clearTimeout(flashTimer.current);
    setMarkFlash({ text, ok });
    flashTimer.current = setTimeout(() => {
      flashTimer.current = null;
      setMarkFlash(null);
    }, MARK_FLASH_MS);
  }, []);

  // Every Mark tap has a visible outcome. A refused tap (same moment twice, or
  // the cap) used to give nothing back and read as a broken button.
  const handleMark = useCallback(() => {
    const before = getLectureSession().getState().marks;
    const ok = recorder.markImportant();
    const after = getLectureSession().getState().marks;
    const elapsedAtMark = after.find((m) => !before.includes(m));
    if (ok && elapsedAtMark !== undefined) {
      haptic(Haptics.ImpactFeedbackStyle.Medium);
      flash(`Marked at ${formatClock(elapsedAtMark)}`, true);
      return;
    }
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    flash(before.length >= MAX_MARKS ? 'Mark limit reached' : 'Already marked this moment', false);
  }, [recorder, flash]);

  // The name a lecture gets when the title is left blank — shown as the
  // placeholder so a daily user sees what it will be called without typing.
  const course = courses.find((c) => c.id === courseId);
  const fallbackTitle = useMemo(
    () => `${course?.name ?? t('Lecture')} · ${new Date().toLocaleDateString(localeTag, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })}`,
    [course?.name, t, localeTag],
  );

  const beginRecording = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
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
      // Same upgrade moment the scan and notes limits use, so hitting the one
      // free action feels like one rule rather than three different refusals.
      track('paywall_open', { screen: 'lecture_record', context: 'lecture' });
      setUpsellVisible(true);
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
    if (result.code === 'CAPTURE_START_FAILED') {
      Alert.alert(
        "The microphone didn't start",
        'Another app may be using it. End any call or recording, then try again.',
      );
      return;
    }
    if (result.code === 'AUTH_REQUIRED' || result.status === 401) {
      Alert.alert('Please sign in again', 'Your session ended. Sign in again, then start recording.');
      return;
    }
    if (result.code === 'ALREADY_RECORDING') {
      return;
    }
    // Service-side refusals get their own branches, and the reason is not
    // cosmetic. "Couldn't start recording" reads as the student's device or
    // their attempt having failed. That is true for MIC_DENIED and NO_SPACE
    // above and false for every code below.
    if (result.code === 'AT_CAPACITY') {
      // Offers the upload path rather than only a date. Notes built from a file
      // go through lecture-study-kit, which never touches the daily audio
      // ledger, so it still works while transcription is full.
      Alert.alert(
        'Transcription is full for today',
        "Semora can only transcribe so much audio a day, and today's is spent. This is our limit, not anything you did, and it resets tomorrow.\n\nYou can still make notes from slides, a chapter, or a photo of the board — that does not use the transcription budget.",
        [
          { text: 'Not now', style: 'cancel' },
          {
            text: 'Make notes instead',
            onPress: () => router.replace({
              pathname: '/lecture/new',
              params: courseId ? { courseId } : undefined,
            } as any),
          },
        ],
      );
      return;
    }
    if (result.code === 'TOO_MANY_IN_FLIGHT') {
      // The 409 may name the lecture that is in the way. A free student whose
      // first lecture is stuck with parts needing attention was told only
      // this, with nowhere to go; the lecture screen is where "Try uploading
      // again" and Delete live.
      const inFlightId = (result as { lectureId?: string | null }).lectureId ?? null;
      Alert.alert(
        'A lecture is still processing',
        'Let the one already running finish before starting another. It will appear in Notes when it is done.',
        inFlightId
          ? [
            { text: 'OK', style: 'cancel' },
            { text: 'Open it', onPress: () => router.push(`/lecture/${inFlightId}` as any) },
          ]
          : undefined,
      );
      return;
    }
    if (result.code === 'UPDATE_REQUIRED' || result.status === 426) {
      Alert.alert(
        'Update Semora to record',
        'This version of Semora can lose parts of a recording. The current version keeps recording reliably, even with the phone locked.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Update', onPress: () => Linking.openURL(APP_STORE_URL).catch(() => {}) },
        ],
      );
      return;
    }
    if (result.code === 'START_TIMEOUT') {
      Alert.alert(
        "Couldn't reach Semora",
        'The connection is too slow to start a recording right now. Check your wifi or mobile data and try again.',
      );
      return;
    }
    if (result.code === 'NOT_CONFIGURED') {
      Alert.alert(
        'Recording is unavailable right now',
        'Lecture transcription is temporarily unavailable. Nothing is wrong with your device — please try again later.',
      );
      return;
    }
    Alert.alert(
      "Couldn't start recording",
      result.message || 'Something went wrong starting the recording. Please try again.',
    );
  }, [recorder, title, courseId, router, fallbackTitle]);

  const handleStartPressed = useCallback(async () => {
    // Guard BEFORE the first await: two quick taps would otherwise each create
    // a lecture holding its own reservation.
    if (startingRef.current) return;
    // A free student whose one action is already spent goes straight to the
    // upgrade, not through consent and the OS microphone prompt first. Only a
    // KNOWN used allowance (true, not undefined while loading); the server's
    // FREE_LECTURE_USED refusal in beginRecording stays the backstop.
    if (!isPro && freeLectureUsed === true) {
      track('paywall_open', { screen: 'lecture_record', context: 'lecture' });
      setUpsellVisible(true);
      return;
    }
    if (await hasAcceptedLectureConsent()) {
      void beginRecording();
      return;
    }
    setConsentVisible(true);
  }, [beginRecording, isPro, freeLectureUsed]);

  const handleConsentAccepted = useCallback(async () => {
    await rememberLectureConsent();
    setConsentVisible(false);
    track('lecture_consent_accepted', { screen: 'lecture_record' });
    void beginRecording();
  }, [beginRecording]);

  const handleStop = useCallback(async () => {
    haptic();
    // Stop is terminal — no Resume after it. While the microphone is live it
    // asks once; a Pause → Stop, a dead microphone, or the "carry on?" card
    // are already deliberate, so those go straight through.
    if (recorder.phase === 'recording' && recorder.micStoppedAt === null && !recorder.needsDecision) {
      Alert.alert(
        'Stop and save?',
        `${formatClock(recorder.elapsed)} recorded · ${recorder.marks.length} marked. Your notes are written right after.`,
        [
          { text: 'Keep recording', style: 'cancel' },
          { text: 'Stop & save', style: 'destructive', onPress: () => { void recorder.stop(); } },
        ],
      );
      return;
    }
    // Navigation is handled by the finishedLectureId effect above.
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

  const remaining = Math.max(0, recorder.maxSeconds - recorder.elapsed);
  const stoppedAtLabel = recorder.micStoppedAt
    ? new Date(recorder.micStoppedAt).toLocaleTimeString(localeTag, { hour: 'numeric', minute: '2-digit' })
    : null;

  const statusLabel =
    recorder.phase === 'recording'
      ? recorder.micStoppedAt !== null ? 'Microphone stopped' : 'Recording'
      : recorder.phase === 'paused'
        ? 'Paused — not recording'
        : recorder.phase === 'finishing'
          ? 'Saving…'
          : recorder.phase === 'starting'
            ? 'Starting…'
            : 'Ready to record';

  const partsUploaded = local?.received ?? 0;
  const partsKnown = Math.max(recorder.partsClosed, local?.total ?? 0);
  const allPartsUploaded = partsKnown > 0 && partsUploaded === partsKnown;
  // tick() still patches once a second while paused, so this re-renders.
  const pausedFor = recorder.phase === 'paused' && recorder.pausedAt
    ? Math.floor((Date.now() - recorder.pausedAt) / 1000)
    : 0;
  const maxPauseHours = Math.round(MAX_PAUSE_MS / 3_600_000);

  // One primary action per live state: Pause while the mic is live, Resume
  // while paused, Continue while the microphone is stopped or the student is
  // being asked. Pause is never offered on a microphone that is already dead.
  const primary: 'pause' | 'resume' | 'continue' =
    recorder.phase === 'paused' ? 'resume'
      : (recorder.micStoppedAt !== null || recorder.needsDecision) ? 'continue'
        : 'pause';
  const stopFilled = primary === 'pause';
  const stopDisabled = recorder.elapsed < MIN_STOP_SECONDS;
  const dockShown = isLive || isFinishing;
  // The start button's own words say where a tap goes when the free action is
  // already used, rather than "Start recording" opening a paywall.
  const needsUpgradeToRecord = !isPro && freeLectureUsed === true;
  // 1.13/1.14 without Semora's own recorder: parts are only saved while the app
  // runs, and a kill with the phone locked loses them. Do not promise more.
  const expoEngineRecords = canRecordLectures() && !isNativeRecorderAvailable();

  // Every live condition, most urgent first. Only the top one (or the chip the
  // student tapped) is shown as a sentence; the rest are chips, so a stopped
  // microphone never looks like a headphones tip.
  const needsAttention = local?.needsAttention ?? 0;
  const notices = useMemo(() => {
    const all: LiveNotice[] = [
      {
        key: 'resumeFailed', rank: 0, tone: 'coral', icon: 'exclamation-circle', chip: "Didn't resume",
        active: recorder.error === 'resumeFailed',
        sentence: 'The microphone didn’t start again. End any call or other recording, then tap Resume.',
      },
      {
        key: 'needsDecision', rank: 1, tone: 'amber', icon: 'exclamation-triangle', chip: 'Stopped',
        active: recorder.needsDecision,
        sentence: stoppedAtLabel
          ? `Recording stopped at ${stoppedAtLabel} while Semora was in the background. Everything before that is saved.`
          : 'Recording stopped while Semora was in the background. Everything before that is saved.',
      },
      {
        key: 'micStopped', rank: 2, tone: 'amber', icon: 'microphone-slash', chip: 'Mic stopped',
        active: !recorder.needsDecision && recorder.micStoppedAt !== null,
        sentence: stoppedAtLabel
          ? `The microphone stopped at ${stoppedAtLabel} — a call or another app may be using it. Recording picks up again as soon as it can.`
          : 'The microphone stopped — a call or another app may be using it. Recording picks up again as soon as it can.',
      },
      {
        // The engine reported a part it could not close or commit. The clock
        // kept running, so without this the loss was invisible until the
        // transcript showed a gap.
        key: 'partLost', rank: 3, tone: 'amber', icon: 'exclamation-triangle', chip: 'Part not saved',
        active: (isLive || isFinishing) && recorder.partLost,
        sentence: 'A part of the recording could not be saved on this phone. Everything else is safe, and the gap will be marked in your transcript.',
      },
      {
        key: 'partsWaiting', rank: 4, tone: 'amber', icon: 'exclamation-triangle', chip: 'Parts waiting',
        active: isLive && needsAttention > 0,
        sentence: 'Some parts haven’t uploaded yet. They are saved on this phone and will upload when the connection allows.',
      },
      {
        key: 'limit', rank: 4, tone: 'amber', icon: 'clock-o', chip: 'Limit soon',
        active: recorder.warnedNearLimit && Number.isFinite(recorder.maxSeconds) && recorder.phase === 'recording',
        sentence: `This recording reaches its ${maxMinutes}-minute limit soon. It will save automatically.`,
      },
      {
        key: 'lowStorage', rank: 5, tone: 'amber', icon: 'hdd-o', chip: 'Storage low',
        active: isLive && recorder.lowStorage,
        sentence: 'Your phone is almost out of storage. If it runs out, Semora will save the recording automatically.',
      },
      {
        key: 'lowBattery', rank: 6, tone: 'amber', icon: 'battery-quarter', chip: 'Low battery',
        active: isLive && recorder.lowBattery,
        sentence: 'Battery is low. Plug in to keep recording — everything recorded so far is saved.',
      },
      {
        key: 'tooQuiet', rank: 7, tone: 'amber', icon: 'volume-down', chip: 'Very quiet',
        active: isLive && recorder.tooQuiet,
        sentence: 'It’s very quiet. Move closer to the speaker, or take the phone out of your bag.',
      },
      {
        key: 'headphones', rank: 8, tone: 'amber', icon: 'headphones', chip: 'Headphones',
        active: isLive && Boolean(recorder.inputName) && !recorder.usingBuiltInMic,
        sentence: `Recording with ${recorder.inputName}. For a lecture, disconnect headphones so the phone's own microphone picks up the room.`,
      },
      {
        key: 'otherLiveRecording', rank: 9, tone: 'amber', icon: 'mobile', chip: 'Other device',
        active: isLive && recorder.otherLiveRecording,
        sentence: 'You’re also recording on another device. Both recordings will be saved separately.',
      },
      {
        key: 'hadGap', rank: 10, tone: 'amber', icon: 'info-circle', chip: 'Gap marked',
        active: recorder.micStoppedAt === null && recorder.hadGap && isLive,
        sentence: 'Recording is running again. A short stretch was missed and is marked in your transcript.',
      },
    ];
    return all.filter((n) => n.active).sort((a, b) => a.rank - b.rank);
  }, [
    recorder.error, recorder.needsDecision, recorder.micStoppedAt, stoppedAtLabel, isLive, isFinishing, needsAttention, recorder.partLost,
    recorder.warnedNearLimit, recorder.maxSeconds, recorder.phase, maxMinutes, recorder.lowStorage,
    recorder.lowBattery, recorder.tooQuiet, recorder.inputName, recorder.usingBuiltInMic,
    recorder.otherLiveRecording, recorder.hadGap,
  ]);
  const shownNotice = notices.find((n) => n.key === pinnedKey) ?? notices[0] ?? null;
  const noticeChips = notices.filter((n) => n !== shownNotice);

  // Spoken state changes. accessibilityLiveRegion is Android-only, so on iOS
  // a VoiceOver user recording with the phone in hand heard nothing when a
  // call killed the microphone, when the "carry on?" card appeared, when a
  // Mark tap was refused, or when Stop began saving. One announcement per
  // change, never on mount, and the clock is deliberately not among them.
  const announce = useCallback((text: string) => {
    if (Platform.OS === 'web') return;
    AccessibilityInfo.announceForAccessibility(t(text));
  }, [t]);
  const finishingNote = isFinishing
    ? recorder.savingLocally
      ? 'Closing the last part on this phone…'
      : 'Telling Semora how many parts to expect…'
    : null;
  // While saving, the note is the more useful sentence than "Saving…".
  const spokenStatus = finishingNote ?? statusLabel;
  const spokenStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (spokenStatusRef.current !== null && spokenStatusRef.current !== spokenStatus) announce(spokenStatus);
    spokenStatusRef.current = spokenStatus;
  }, [spokenStatus, announce]);
  // Conditions the status label does not already say. The stopped microphone
  // is covered by "Microphone stopped" above.
  const topNotice = notices[0] ?? null;
  const spokenNoticeRef = useRef<string | null>(null);
  useEffect(() => {
    const key = topNotice?.key ?? null;
    if (key !== spokenNoticeRef.current && topNotice &&
      (key === 'needsDecision' || key === 'resumeFailed' || key === 'partLost')) {
      announce(topNotice.sentence);
    }
    spokenNoticeRef.current = key;
  }, [topNotice, announce]);
  useEffect(() => {
    if (markFlash) announce(markFlash.text);
  }, [markFlash, announce]);

  // At accessibility text sizes the three-up control row stacks (see
  // STACK_CONTROLS_FONT_SCALE); read once per render so a size change while
  // recording takes effect on the next tick.
  const stackControls = PixelRatio.getFontScale() > STACK_CONTROLS_FONT_SCALE;
  useEffect(() => {
    if (pinnedKey !== null && (recorder.phase === 'idle' || !notices.some((n) => n.key === pinnedKey))) {
      setPinnedKey(null);
    }
  }, [pinnedKey, notices, recorder.phase]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ProUpsellSheet
        visible={upsellVisible}
        reason="lecture"
        onClose={() => setUpsellVisible(false)}
      />
      <LectureConsentSheet
        visible={consentVisible}
        onAccept={() => void handleConsentAccepted()}
        onCancel={() => setConsentVisible(false)}
      />

      <View style={styles.body}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { maxWidth: contentMaxWidth, paddingBottom: 40 + (dockShown ? dockHeight : 0) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Timer stage. NOT one accessible element: an explicit label on
              the container replaced everything inside it, so VoiceOver heard
              "Recording, 12:30" and never the saved-on-this-phone receipt,
              the parts count or the marks. Each row is its own element. */}
          <View style={[styles.stage, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={styles.statusRow} accessible accessibilityRole="text">
              {isLive && (
                <Animated.View
                  style={[
                    styles.recDot,
                    { backgroundColor: recorder.micStoppedAt !== null ? colors.amber : colors.coral },
                    capturingNow ? { opacity: pulse } : null,
                  ]}
                />
              )}
              <Text
                style={[
                  styles.statusLabel,
                  { color: recorder.micStoppedAt !== null ? colors.amberText : isLive ? colors.coralText : colors.ink2 },
                ]}
              >
                {statusLabel}
              </Text>
            </View>

            {/* The clock is read as a duration, not as "twelve thirty" the
                time of day. It scales with the reader's text size and shrinks
                to fit rather than wrapping a number mid-digit. */}
            <Text
              style={[styles.clock, { color: colors.ink }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              accessibilityLabel={spokenDuration(recorder.elapsed, locale)}
            >
              {formatClock(recorder.elapsed)}
            </Text>

            {/* Level history — the honest signal that the mic has been hearing
                the room for the last forty seconds, not a progress bar. Hidden
                from VoiceOver: the live region above already says the state. */}
            {isLive && (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.levelHistory}
              >
                {levels.map((v, i) => (
                  <View
                    key={i}
                    style={{
                      width: 4,
                      borderRadius: 2,
                      height: 4 + v * 40,
                      backgroundColor: recorder.phase === 'paused'
                        ? colors.ink3
                        : recorder.tooQuiet ? colors.amber : colors.coral,
                      opacity: i === LEVEL_BARS - 1 ? 1 : 0.45,
                    }}
                  />
                ))}
              </View>
            )}

            {/* The "every minute saved" receipt: what is closed on this phone,
                what the server has, what is marked. */}
            {isLive && (
              <View style={styles.savedStrip}>
                <View style={styles.savedCell}>
                  <FontAwesome
                    name={allPartsUploaded ? 'check-circle' : 'mobile'}
                    size={12}
                    color={allPartsUploaded ? colors.teal : colors.ink2}
                  />
                  <Text style={[styles.savedText, { color: colors.ink2 }]}>
                    {`Saved on this phone ${formatLectureDuration(recorder.savedSeconds)}`}
                  </Text>
                </View>
                {partsKnown > 0 && (
                  <View style={styles.savedCell}>
                    <FontAwesome name="cloud-upload" size={12} color={colors.brand} />
                    <Text style={[styles.savedText, { color: colors.ink2 }]}>
                      {`${partsUploaded} of ${partsKnown} parts uploaded`}
                    </Text>
                  </View>
                )}
                {recorder.marks.length > 0 && (
                  <View style={styles.savedCell}>
                    <FontAwesome name="star" size={12} color={colors.amber} />
                    <Text style={[styles.savedText, { color: colors.ink2 }]}>
                      {`${recorder.marks.length} marked`}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* The last few marks, so the index the student is building is
                visible — including marks that arrive from the lock screen. */}
            {isLive && recorder.marks.length > 0 && (
              <View
                accessible
                accessibilityLabel={t(`Marked moments: ${recorder.marks.map((m) => formatClock(m)).join(', ')}`)}
                style={styles.markChips}
              >
                {recorder.marks.slice(-4).map((m) => (
                  <Text
                    key={m}
                    style={[styles.markChip, { backgroundColor: colors.amber50, borderColor: colors.amber, color: colors.amberText }]}
                  >
                    {`⭐ ${formatClock(m)}`}
                  </Text>
                ))}
                {recorder.marks.length > 4 && (
                  <Text style={[styles.markChip, { backgroundColor: colors.amber50, borderColor: colors.amber, color: colors.amberText }]}>
                    {`+${recorder.marks.length - 4}`}
                  </Text>
                )}
              </View>
            )}

            {/* ink2, not ink3, on every line below that carries information:
                ink3 is 3.2:1 on paper and under AA at these sizes. */}
            {(recorder.phase === 'idle' || recorder.phase === 'starting') && (
              <Text style={[styles.capNote, { color: colors.ink2 }]}>
                {`Up to ${maxMinutes} minutes per recording`}
              </Text>
            )}
            {finishingNote && (
              <Text style={[styles.capNote, { color: colors.ink2 }]}>
                {finishingNote}
              </Text>
            )}

            {/* A forgotten pause is the one Semora's own 3-hour rule catches;
                say how long it has been, and what happens. */}
            {recorder.phase === 'paused' && (
              pausedFor >= LONG_PAUSE_SECONDS ? (
                <Text style={[styles.capNote, { color: colors.amberText, fontWeight: '700' }]}>
                  {`Paused ${Math.floor(pausedFor / 60)} min — Semora saves this on its own after ${maxPauseHours} hours`}
                </Text>
              ) : (
                <Text style={[styles.capNote, { color: colors.ink2 }]}>
                  {`Paused for ${formatLectureDuration(pausedFor)}`}
                </Text>
              )
            )}
            {recorder.phase === 'paused' && recorder.engineKind === 'native' && (
              <Text style={[styles.capNote, { color: colors.ink2, textAlign: 'center' }]}>
                The microphone stays open so Resume is instant — nothing is being saved.
              </Text>
            )}

            {isLive && Number.isFinite(recorder.maxSeconds) && (
              <Text
                style={[
                  styles.capNote,
                  {
                    color: recorder.warnedNearLimit ? colors.amberText : colors.ink2,
                    fontWeight: recorder.warnedNearLimit ? '700' : '400',
                  },
                ]}
                accessibilityLabel={`${t('Time left')}: ${spokenDuration(remaining, locale)}`}
              >
                {`${formatLectureDuration(remaining)} left`}
              </Text>
            )}
            {isLive && recorder.inputName ? (
              <Text style={[styles.capNote, { color: colors.ink2 }]} numberOfLines={1}>
                {`Microphone: ${recorder.inputName}`}
              </Text>
            ) : null}
            {/* Android 13+: without the notification permission the foreground
                service's Pause / Mark / Stop notification is suppressed, so the
                lock screen has no controls. Recording still works. */}
            {isLive && Platform.OS === 'android' && recorder.notificationsDenied ? (
              <TouchableOpacity
                onPress={() => Linking.openSettings()}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Turn on notifications to get Pause and Stop on the lock screen"
                accessibilityHint="Opens Semora's settings"
              >
                <Text style={[styles.capNote, { color: colors.ink2, textAlign: 'center', textDecorationLine: 'underline' }]}>
                  Turn on notifications to get Pause and Stop on the lock screen
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* What happens next — read before the coral microphone, not under Cancel. */}
          {!isLive && !isFinishing && (
            <View style={[styles.explainCard, { backgroundColor: colors.brand50 }]}>
              <View style={styles.explainRow}>
                <FontAwesome name="lock" size={13} color={colors.brand} style={styles.explainIcon} />
                <Text style={[styles.explainText, { color: colors.ink2 }]}>Keeps recording with the phone locked</Text>
              </View>
              <View style={styles.explainRow}>
                <FontAwesome name="mobile" size={15} color={colors.brand} style={styles.explainIcon} />
                <Text style={[styles.explainText, { color: colors.ink2 }]}>
                  {expoEngineRecords
                    ? 'Keep Semora open if you can — this version saves parts while the app is on screen'
                    : 'Saves every part on this phone as it goes'}
                </Text>
              </View>
              <View style={styles.explainRow}>
                <FontAwesome name="stop" size={13} color={colors.brand} style={styles.explainIcon} />
                <Text style={[styles.explainText, { color: colors.ink2 }]}>Tap Stop when class ends — notes follow</Text>
              </View>
            </View>
          )}

          {/* Notices: the most urgent condition in full, the rest as chips.
              Tapping a chip reads it in the card slot. */}
          {shownNotice && (
            <View
              style={[
                styles.warnCard,
                shownNotice.tone === 'coral'
                  ? { backgroundColor: colors.coral50, borderColor: colors.coral }
                  : { backgroundColor: colors.amber50, borderColor: colors.amber },
              ]}
              accessibilityLiveRegion="polite"
            >
              <FontAwesome
                name={shownNotice.icon}
                size={13}
                color={shownNotice.tone === 'coral' ? colors.coral : colors.amber}
                style={{ marginTop: 1 }}
              />
              <Text style={[styles.warnText, { color: colors.ink2 }]}>{shownNotice.sentence}</Text>
            </View>
          )}
          {noticeChips.length > 0 && (
            <View style={styles.chipRow}>
              {noticeChips.map((n) => {
                const tone = n.tone === 'coral' ? colors.coral : colors.amber;
                const toneText = n.tone === 'coral' ? colors.coralText : colors.amberText;
                const toneBg = n.tone === 'coral' ? colors.coral50 : colors.amber50;
                return (
                  <TouchableOpacity
                    key={n.key}
                    style={[styles.noticeChip, { borderColor: tone, backgroundColor: toneBg }]}
                    onPress={() => setPinnedKey(n.key)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={n.sentence}
                  >
                    <FontAwesome name={n.icon} size={11} color={tone} />
                    <Text style={[styles.noticeChipText, { color: toneText }]}>{n.chip}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* The one-free-lecture limit, stated BEFORE the tap rather than
              discovered as a paywall afterwards. */}
          {!isPro && !isLive && !isFinishing && (
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
          {!isLive && !isFinishing && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Title</Text>
              <TextInput
                style={[
                  styles.input,
                  { backgroundColor: colors.card, borderColor: colors.line, color: colors.ink },
                ]}
                placeholder={fallbackTitle}
                placeholderTextColor={colors.ink3}
                value={title}
                onChangeText={setTitle}
                maxLength={80}
                returnKeyType="done"
                accessibilityLabel="Lecture title"
              />

              <Text style={[styles.fieldLabel, { color: colors.ink2 }]}>Class</Text>
              {!params.courseId && (
                <Text style={[styles.fieldHint, { color: colors.ink3 }]}>
                  Attaching a course lets the AI Tutor and flashcards use this lecture.
                </Text>
              )}
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
                      accessibilityState={{ selected: active }}
                    >
                      <View style={[styles.courseDot, { backgroundColor: c.color || colors.brand }]} />
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

          {/* Start stays inline: the title field lives in this scroll, and a
              pinned Start under an open keyboard is its own problem. */}
          {(recorder.phase === 'idle' || recorder.phase === 'starting') && (
            <TouchableOpacity
              style={[styles.bigButton, { backgroundColor: colors.coral }, starting && { opacity: 0.6 }]}
              onPress={() => void handleStartPressed()}
              disabled={starting}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={needsUpgradeToRecord ? 'Upgrade to record' : 'Start recording'}
              accessibilityState={{ busy: starting }}
            >
              <FontAwesome name={needsUpgradeToRecord ? 'lock' : 'microphone'} size={20} color="#fff" />
              <Text style={styles.bigButtonText}>
                {starting ? 'Starting…' : needsUpgradeToRecord ? 'Upgrade to record' : 'Start recording'}
              </Text>
            </TouchableOpacity>
          )}

          {/* Discard stays in the scroll, away from the thumb zone. */}
          {isLive && (
            <TouchableOpacity
              style={styles.discardBtn}
              onPress={handleDiscard}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Discard recording"
            >
              <Text style={[styles.discardText, { color: colors.coral }]}>Discard recording</Text>
            </TouchableOpacity>
          )}

          {/* Explicit way out. A swipe is not discoverable, and this screen is
              reached from a menu. */}
          {!isLive && !isFinishing && (
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

          {/* Permanent reminder. The consent sheet is shown once; this never goes
              away, because the responsibility does not either. */}
          <Text style={[styles.consentNote, { color: colors.ink2 }]}>
            Recording laws vary by state and country, and some require everyone being recorded to
            agree. You are responsible for getting permission before you record.
          </Text>
        </ScrollView>

        {/* The dock: live controls pinned in the thumb zone, outside the scroll,
            so Stop and Mark are never under a stack of notices. */}
        {dockShown && (
          <View
            onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
            style={[styles.dock, { maxWidth: contentMaxWidth, backgroundColor: colors.paper, borderTopColor: colors.line }]}
          >
            {isFinishing ? (
              <>
                <View style={[styles.bigButton, styles.dockBig, { backgroundColor: colors.pausedFill }]}>
                  <Text style={styles.bigButtonText}>
                    {`Saving ${formatLectureDuration(recorder.elapsed)} on this phone…`}
                  </Text>
                </View>
                <Text style={[styles.finishingNote, { color: colors.ink2 }]}>
                  Keep Semora open for a moment while the last part is saved.
                </Text>
              </>
            ) : (
              <>
                {/* Mark important: the notes make sure this moment is covered and
                    flagged with a star, and the quiz tests it. */}
                <TouchableOpacity
                  style={[styles.markBtn, { backgroundColor: colors.amber50, borderColor: colors.amber }]}
                  onPress={handleMark}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Mark this moment important"
                  accessibilityHint="Your notes will highlight what was just said, and your quiz will test it."
                >
                  <FontAwesome name="star" size={15} color={colors.amber} />
                  <Text
                    style={[
                      styles.controlText,
                      { color: markFlash ? (markFlash.ok ? colors.amberText : colors.ink2) : colors.ink },
                    ]}
                  >
                    {markFlash ? markFlash.text : 'Mark important'}
                  </Text>
                </TouchableOpacity>
                {recorder.marks.length === 0 && (
                  <Text style={[styles.markHint, { color: colors.ink2 }]}>
                    Tap when your instructor says something that will be on the exam.
                  </Text>
                )}
                <View style={[styles.controlRow, stackControls && styles.controlRowStacked]}>
                  {primary === 'pause' && (
                    <TouchableOpacity
                      style={[styles.controlBtn, stackControls && styles.controlBtnStacked, { backgroundColor: colors.card, borderColor: colors.line }]}
                      onPress={() => {
                        haptic(Haptics.ImpactFeedbackStyle.Light);
                        void recorder.pause();
                      }}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel="Pause recording"
                    >
                      <FontAwesome name="pause" size={16} color={colors.ink} />
                      <Text style={[styles.controlText, { color: colors.ink }]}>Pause</Text>
                    </TouchableOpacity>
                  )}
                  {primary === 'resume' && (
                    <TouchableOpacity
                      style={[styles.controlBtn, stackControls && styles.controlBtnStacked, styles.filledBtn, { backgroundColor: colors.brand }]}
                      onPress={() => {
                        haptic(Haptics.ImpactFeedbackStyle.Light);
                        void recorder.resume();
                      }}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel="Resume recording"
                    >
                      <FontAwesome name="play" size={16} color="#fff" />
                      <Text style={[styles.controlText, { color: '#fff' }]}>Resume</Text>
                    </TouchableOpacity>
                  )}
                  {primary === 'continue' && (
                    <TouchableOpacity
                      style={[styles.controlBtn, stackControls && styles.controlBtnStacked, styles.filledBtn, { backgroundColor: colors.brand }]}
                      onPress={() => {
                        haptic(Haptics.ImpactFeedbackStyle.Light);
                        void recorder.continueRecording();
                      }}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel="Continue recording"
                    >
                      <FontAwesome name="microphone" size={16} color="#fff" />
                      <Text style={[styles.controlText, { color: '#fff' }]}>Continue recording</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.controlBtn,
                      stackControls && styles.controlBtnStacked,
                      stopFilled
                        ? [styles.filledBtn, { backgroundColor: colors.coral }]
                        : { borderWidth: 1.5, borderColor: colors.coral, backgroundColor: 'transparent' },
                      { opacity: stopDisabled ? 0.5 : 1 },
                    ]}
                    onPress={handleStop}
                    disabled={stopDisabled}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Stop and save recording"
                    accessibilityState={{ disabled: stopDisabled }}
                  >
                    <FontAwesome name="stop" size={15} color={stopFilled ? '#fff' : colors.coral} />
                    <Text style={[styles.controlText, { color: stopFilled ? '#fff' : colors.coral }]}>Stop & save</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1 },
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
  levelHistory: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
    height: 44,
    marginTop: 14,
    width: '100%',
  },
  savedStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    marginTop: 12,
  },
  savedCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  savedText: { fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
  markChips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 10 },
  markChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    overflow: 'hidden',
  },
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
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  noticeChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minHeight: 28,
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  noticeChipText: { fontSize: 12, fontWeight: '600' },
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
  dock: {
    width: '100%',
    maxWidth: SCREEN_MAX_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 0.5,
  },
  dockBig: { marginTop: 0 },
  controlRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  // Large type: every button on its own line (wrap + full width), so no
  // label is clipped and Stop is never pushed off the edge.
  controlRowStacked: { flexWrap: 'wrap' },
  controlBtnStacked: { minWidth: '100%' },
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
  filledBtn: { borderWidth: 0 },
  controlText: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  explainCard: {
    borderRadius: 14,
    padding: 14,
    marginTop: 12,
    gap: 8,
  },
  explainRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  explainIcon: { width: 16, textAlign: 'center' },
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
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  courseDot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
  finishingNote: { fontSize: 13, lineHeight: 18.5, textAlign: 'center', marginTop: 12, paddingHorizontal: 8 },
  cancelBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  cancelText: { fontSize: 15, fontWeight: '600' },
  discardBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 12 },
  markBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 13,
    minHeight: 56,
    borderWidth: 1,
  },
  markHint: { fontSize: 12, lineHeight: 17, textAlign: 'center', marginTop: 6 },
  discardText: { fontSize: 14, fontWeight: '600' },
});
