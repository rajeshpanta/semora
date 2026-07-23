import { useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { track } from '@/lib/analytics';
import {
  usePomodoro, formatCountdown, FOCUS_OPTIONS, BREAK_OPTIONS,
  type PomodoroPhase,
} from '@/lib/pomodoro';
import { useToggleStudyBlock } from '@/lib/queries';

export default function PomodoroScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ taskId?: string; title?: string; minutes?: string; blockId?: string }>();
  const isPro = useAppStore((s) => s.isPro);
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();

  const taskId = params.taskId ?? null;
  const taskTitle = params.title ?? null;
  const requestedMinutes = params.minutes ? Number(params.minutes) : null;
  const studyBlockId = params.blockId ?? null;
  const toggleStudyBlock = useToggleStudyBlock();

  // Fire the completion analytics + haptic when a phase's countdown hits zero
  // in-app. Only a completed FOCUS block counts as a "pomodoro_completed".
  const onPhaseComplete = useCallback((
    phase: PomodoroPhase,
    minutes: number,
    _completedTaskId: string | null,
    completedBlockId: string | null,
  ) => {
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (phase === 'focus') {
      track('pomodoro_completed', { minutes, screen: 'pomodoro' });
      if (completedBlockId) {
        toggleStudyBlock.mutate({ id: completedBlockId, is_completed: true });
        track('study_block_completed', { source: 'focus_timer', minutes });
      }
    }
  }, [toggleStudyBlock]);

  const [state, controls] = usePomodoro(
    taskId,
    taskTitle,
    requestedMinutes,
    studyBlockId,
    onPhaseComplete,
  );

  const handleStart = useCallback(async () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await controls.start();
    track('pomodoro_started', { linked: !!state.taskId, screen: 'pomodoro' });
  }, [controls, state.taskId]);

  const handleResume = useCallback(async () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await controls.resume();
  }, [controls]);

  const handlePause = useCallback(async () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await controls.pause();
  }, [controls]);

  const handleReset = useCallback(async () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await controls.reset();
  }, [controls]);

  // ── Pro gate ──────────────────────────────────────────────
  // Free users get a locked teaser that routes to the paywall — the whole
  // feature is Pro (owner directive). Mirrors the teaser pattern in
  // components/GradeCard.tsx / app/course/[id].tsx.
  if (!isPro) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Focus' }} />
        <View style={[styles.lockWrap, { maxWidth: contentMaxWidth }]}>
          <View style={[styles.lockIcon, { backgroundColor: colors.brand50 }]}>
            <FontAwesome name="clock-o" size={30} color={colors.brand} />
          </View>
          <Text style={[styles.lockTitle, { color: colors.ink }]}>Focus Timer</Text>
          <Text style={[styles.lockDesc, { color: colors.ink3 }]}>
            Beat procrastination with a built-in Pomodoro timer. Pick a focus
            length, link it to a task, and get a nudge the moment each block
            ends — even if you leave the app.
          </Text>
          <TouchableOpacity
            style={[styles.lockCta, { backgroundColor: colors.brand }]}
            activeOpacity={0.85}
            onPress={() => {
              if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push({ pathname: '/paywall', params: { context: 'pomodoro' } } as any);
            }}
          >
            <FontAwesome name="star" size={13} color="#fff" />
            <Text style={styles.lockCtaText}>Unlock with Pro</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isFocus = state.phase === 'focus';
  // Phase-tinted accent: coral for focus (work), teal for the break.
  const accent = isFocus ? colors.coral : colors.teal;
  const accentBg = isFocus ? colors.coral50 : colors.teal50;
  const canStart = !state.running && state.remainingSeconds > 0;
  // A partially-elapsed, paused phase resumes; a full phase starts fresh.
  const isPaused =
    !state.running &&
    state.remainingSeconds <
      (isFocus ? state.focusMinutes : state.breakMinutes) * 60;
  const usesPlannedFocusLength = !(FOCUS_OPTIONS as readonly number[]).includes(state.focusMinutes);
  const focusOptions: readonly number[] = usesPlannedFocusLength
    ? [state.focusMinutes, ...FOCUS_OPTIONS]
    : FOCUS_OPTIONS;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Focus' }} />
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}>
        {/* Linked task banner */}
        {state.taskTitle ? (
          <View style={[styles.taskBanner, { backgroundColor: accentBg }]}>
            <FontAwesome name="link" size={12} color={accent} />
            <Text style={[styles.taskBannerText, { color: accent }]} numberOfLines={1}>
              Focusing on {state.taskTitle}
            </Text>
          </View>
        ) : null}

        {/* Phase label */}
        <View style={[styles.phasePill, { backgroundColor: accentBg }]}>
          <FontAwesome name={isFocus ? 'bullseye' : 'coffee'} size={12} color={accent} />
          <Text style={[styles.phaseText, { color: accent }]}>
            {isFocus ? 'FOCUS' : 'BREAK'}
          </Text>
        </View>

        {/* Big countdown + progress ring stand-in (bar) */}
        <View style={[styles.timerCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.countdown, { color: colors.ink }]}>
            {formatCountdown(state.remainingSeconds)}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.line }]}>
            <View style={[styles.progressFill, { backgroundColor: accent, width: `${Math.round(state.progress * 100)}%` }]} />
          </View>
          <Text style={[styles.cycleText, { color: colors.ink3 }]}>
            {state.cycle === 0
              ? 'No focus blocks yet this sitting'
              : `${state.cycle} focus block${state.cycle === 1 ? '' : 's'} done`}
            {state.lifetimeSessions > 0 ? ` · ${state.lifetimeSessions} all-time` : ''}
          </Text>
        </View>

        {/* Primary controls */}
        <View style={styles.controlsRow}>
          {state.running ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: accent }]}
              activeOpacity={0.85}
              onPress={handlePause}
            >
              <FontAwesome name="pause" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Pause</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: accent }, !canStart && styles.btnDisabled]}
              activeOpacity={0.85}
              disabled={!canStart}
              onPress={isPaused ? handleResume : handleStart}
            >
              <FontAwesome name="play" size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>
                {isPaused ? 'Resume' : isFocus ? 'Start focus' : 'Start break'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.resetBtn, { borderColor: colors.line }]}
            activeOpacity={0.7}
            onPress={handleReset}
          >
            <FontAwesome name="refresh" size={15} color={colors.ink2} />
            <Text style={[styles.resetBtnText, { color: colors.ink2 }]}>Reset</Text>
          </TouchableOpacity>
        </View>

        {/* Length pickers — only while stopped, so a running block can't be
            silently re-lengthened underneath the user. */}
        {!state.running && (
          <View style={[styles.pickerCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.pickerLabel, { color: colors.ink2 }]}>Focus length</Text>
            <View style={styles.chipRow}>
              {focusOptions.map((m) => {
                const active = state.focusMinutes === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.chip, { borderColor: colors.line }, active && { backgroundColor: colors.brand, borderColor: colors.brand }]}
                    onPress={() => {
                      if (Platform.OS === 'ios') Haptics.selectionAsync();
                      controls.setFocusMinutes(m);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, { color: colors.ink2 }, active && styles.chipTextActive]}>
                      {m}m{active && usesPlannedFocusLength ? ' plan' : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.pickerLabel, { color: colors.ink2, marginTop: 14 }]}>Break length</Text>
            <View style={styles.chipRow}>
              {BREAK_OPTIONS.map((m) => {
                const active = state.breakMinutes === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.chip, { borderColor: colors.line }, active && { backgroundColor: colors.brand, borderColor: colors.brand }]}
                    onPress={() => {
                      if (Platform.OS === 'ios') Haptics.selectionAsync();
                      controls.setBreakMinutes(m);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, { color: colors.ink2 }, active && styles.chipTextActive]}>{m}m</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <Text style={[styles.hint, { color: colors.ink3 }]}>
          The timer keeps running in the background. You{'’'}ll get a
          notification the moment your {isFocus ? 'focus block' : 'break'} ends.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 60, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },

  // Pro lock
  lockWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  lockIcon: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  lockTitle: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink, marginBottom: 8 },
  lockDesc: { fontSize: 14, lineHeight: 21, textAlign: 'center', color: COLORS.ink3, maxWidth: 320, marginBottom: 24 },
  lockCta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, height: 50, borderRadius: 14, backgroundColor: COLORS.brand },
  lockCtaText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  taskBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, marginBottom: 14 },
  taskBannerText: { fontSize: 13, fontWeight: '600', flex: 1 },

  phasePill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginBottom: 16 },
  phaseText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },

  timerCard: { borderRadius: 22, padding: 28, borderWidth: 1, borderColor: COLORS.line, alignItems: 'center', marginBottom: 18 },
  countdown: { fontFamily: FONTS.display, fontSize: 68, color: COLORS.ink, fontVariant: ['tabular-nums'] },
  progressTrack: { height: 8, borderRadius: 4, width: '100%', overflow: 'hidden', marginTop: 18 },
  progressFill: { height: 8, borderRadius: 4 },
  cycleText: { fontSize: 13, fontWeight: '500', marginTop: 14, textAlign: 'center' },

  controlsRow: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  primaryBtn: { flex: 1, height: 54, borderRadius: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 },
  primaryBtnText: { fontSize: 17, fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.4 },
  resetBtn: { height: 54, paddingHorizontal: 20, borderRadius: 16, borderWidth: 1.5, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  resetBtnText: { fontSize: 15, fontWeight: '600' },

  pickerCard: { borderRadius: 18, padding: 18, borderWidth: 1, borderColor: COLORS.line, marginBottom: 18 },
  pickerLabel: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, marginBottom: 10, textTransform: 'uppercase' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5 },
  chipText: { fontSize: 14, fontWeight: '700' },
  chipTextActive: { color: '#fff' },

  hint: { fontSize: 12.5, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
});
