import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { format, differenceInCalendarWeeks, startOfISOWeek } from 'date-fns';
import { useAppStore, findCurrentSemester } from '@/store/appStore';
import { useSemesters, useCourses, useTasks } from '@/lib/queries';
import { COLORS, FONTS, SCREEN_MAX_WIDTH, DEFAULT_GRADE_SCALE } from '@/lib/constants';
import type { GradeThreshold } from '@/types/database';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import {
  buildWeeklyWorkload, perCourseLoad, examDensity, type WorkloadTask,
} from '@/lib/workload';
import { getStudySuggestions, type UrgencyTier } from '@/lib/studySuggestions';
import { WorkloadChart } from '@/components/WorkloadChart';
import { track } from '@/lib/analytics';

const TIER_META: Record<UrgencyTier, { label: string; icon: 'exclamation-circle' | 'clock-o' | 'calendar-o' }> = {
  now: { label: 'Do now', icon: 'exclamation-circle' },
  soon: { label: 'Coming up', icon: 'clock-o' },
  ahead: { label: 'Plan ahead', icon: 'calendar-o' },
};

export default function DashboardScreen() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const router = useRouter();
  const qc = useQueryClient();

  const isPro = useAppStore((s) => s.isPro);
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);

  const { data: semesters = [] } = useSemesters();
  const { data: courses = [] } = useCourses(selectedSemesterId);
  const { data: tasks = [] } = useTasks(
    selectedSemesterId ? { semesterId: selectedSemesterId } : { semesterId: null },
  );

  const [refreshing, setRefreshing] = useState(false);

  const activeSemester = semesters.find((s) => s.id === selectedSemesterId);

  // Fire the view event once per focus. Also self-heal the selected semester if
  // it's stale (same guard the tabs use) so the dashboard isn't blank when
  // arrived-at directly.
  useFocusEffect(
    useCallback(() => {
      track('dashboard_viewed', { screen: 'dashboard' });
      if (semesters.length > 0 && (!selectedSemesterId || !semesters.some((s) => s.id === selectedSemesterId))) {
        setSelectedSemester(findCurrentSemester(semesters));
      }
    }, [semesters, selectedSemesterId]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    qc.invalidateQueries().then(() => setRefreshing(false));
  }, [qc]);

  // ── Derived analytics (memoized on the raw data) ───────────────────────
  const workloadTasks = tasks as unknown as WorkloadTask[];
  const currentWeekStart = format(startOfISOWeek(new Date()), 'yyyy-MM-dd');

  const weeks = useMemo(
    () => buildWeeklyWorkload(workloadTasks, activeSemester ?? null),
    [workloadTasks, activeSemester],
  );
  const courseLoads = useMemo(
    () => perCourseLoad(
      workloadTasks,
      courses.map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        grade_scale: (c.grade_scale ?? DEFAULT_GRADE_SCALE) as GradeThreshold[],
      })),
    ),
    [workloadTasks, courses],
  );
  const examWeeks = useMemo(() => examDensity(workloadTasks), [workloadTasks]);
  const topSuggestions = useMemo(
    () => getStudySuggestions(workloadTasks, undefined, new Date(), 3),
    [workloadTasks],
  );

  // Free tier sees this week for real; Pro sees the whole semester. The
  // multi-week chart, crunch-week lookahead, and exam density are all
  // "shape of the term" analysis — that IS the Pro product here, so they are
  // what the upgrade buys rather than a dimmed preview of themselves.
  const visibleWeeks = useMemo(
    () => (isPro ? weeks : weeks.filter((w) => w.weekStart === currentWeekStart)),
    [isPro, weeks, currentWeekStart],
  );

  const crunchWeeks = weeks.filter((w) => w.isCrunch);
  const nextCrunch = crunchWeeks.find((w) => w.weekStart >= currentWeekStart) ?? crunchWeeks[0] ?? null;

  // Weeks remaining until the semester ends (0 when it's already over / undated).
  const weeksRemaining = useMemo(() => {
    if (!activeSemester?.end_date) return null;
    const end = new Date(activeSemester.end_date + 'T00:00:00');
    if (Number.isNaN(end.getTime())) return null;
    return Math.max(0, differenceInCalendarWeeks(end, new Date(), { weekStartsOn: 1 }));
  }, [activeSemester]);

  const maxCourseLoad = Math.max(...courseLoads.map((c) => c.loadScore), 1);

  const onTapSuggestion = (taskId: string, tier: UrgencyTier) => {
    if (Platform.OS === 'ios') Haptics.selectionAsync().catch(() => {});
    track('study_suggestion_tapped', { screen: 'dashboard', tier });
    router.push(`/task/${taskId}` as any);
  };

  const openPaywall = () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push({ pathname: '/paywall', params: { context: 'dashboard' } } as any);
  };


  // ── Empty state: no data to analyze yet. ──────────────────────────────
  const hasAnyIncomplete = workloadTasks.some((t) => !t.is_completed);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Workload' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >
        {/* This semester header */}
        <View style={styles.headerBlock}>
          <Text style={[styles.title, { color: colors.ink }]}>This semester</Text>
          <Text style={[styles.subtitle, { color: colors.ink3 }]}>
            {activeSemester?.name ?? 'No semester selected'}
            {weeksRemaining != null ? ` · ${weeksRemaining} ${weeksRemaining === 1 ? 'week' : 'weeks'} left` : ''}
          </Text>
        </View>

        {!hasAnyIncomplete ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>Nothing on the horizon</Text>
            <Text style={[styles.emptyText, { color: colors.ink3 }]}>
              Scan a syllabus or add tasks and your workload chart, crunch weeks,
              and study plan will appear here.
            </Text>
          </View>
        ) : (
          <>
            {/* Weekly workload chart */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <View style={styles.cardHead}>
                <Text style={[styles.cardTitle, { color: colors.ink }]}>
                  {isPro ? 'Weekly workload' : 'This week'}
                </Text>
                <View style={styles.legendRow}>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.brand }]} />
                    <Text style={[styles.legendText, { color: colors.ink3 }]}>Normal</Text>
                  </View>
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: colors.coral }]} />
                    <Text style={[styles.legendText, { color: colors.ink3 }]}>Crunch</Text>
                  </View>
                </View>
              </View>
              <WorkloadChart weeks={visibleWeeks} currentWeekStart={currentWeekStart} />
            </View>

            {/* Sits under a chart that already works, not in place of one. */}
            {!isPro && (
              <TouchableOpacity
                style={[styles.upsell, { backgroundColor: colors.brand50, borderColor: colors.brand100 }]}
                activeOpacity={0.85}
                onPress={openPaywall}
                accessibilityRole="button"
                accessibilityLabel="See your whole semester with Pro"
              >
                <FontAwesome name="bar-chart" size={15} color={colors.brand} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.upsellTitle, { color: colors.ink }]}>See the whole semester</Text>
                  <Text style={[styles.upsellText, { color: colors.ink3 }]}>
                    Pro charts every week ahead, flags crunch weeks before they arrive, and shows
                    where the exams pile up.
                  </Text>
                </View>
                <FontAwesome name="chevron-right" size={12} color={colors.brand} style={{ marginTop: 3 }} />
              </TouchableOpacity>
            )}

            {/* Crunch-week callout */}
            {isPro && nextCrunch && (
              <View style={[styles.crunchCard, { backgroundColor: colors.coral50, borderColor: colors.coral + '40' }]}>
                <FontAwesome name="exclamation-triangle" size={15} color={colors.coral} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.crunchTitle, { color: colors.coral }]}>
                    Crunch week: {nextCrunch.weekLabel}
                  </Text>
                  <Text style={[styles.crunchText, { color: colors.ink2 }]}>
                    {nextCrunch.items.length} {nextCrunch.items.length === 1 ? 'deadline' : 'deadlines'} stack up that week
                    {crunchWeeks.length > 1 ? ` (${crunchWeeks.length} crunch weeks this term)` : ''}. Get ahead now.
                  </Text>
                </View>
              </View>
            )}

            {/* Exam strip */}
            {isPro && examWeeks.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
                <Text style={[styles.cardTitle, { color: colors.ink, marginBottom: 10 }]}>Exam density</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.examStrip}>
                    {examWeeks.map((ew) => (
                      <View key={ew.weekStart} style={[styles.examChip, { backgroundColor: colors.brand50, borderColor: colors.line }]}>
                        <Text style={[styles.examChipWeek, { color: colors.ink3 }]}>{ew.weekLabel}</Text>
                        <View style={styles.examCountRow}>
                          <FontAwesome name="file-text-o" size={11} color={colors.brand} />
                          <Text style={[styles.examCount, { color: colors.brand }]}>
                            {ew.exams.length} {ew.exams.length === 1 ? 'exam' : 'exams'}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            {/* Per-course load */}
            {courseLoads.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
                <Text style={[styles.cardTitle, { color: colors.ink, marginBottom: 12 }]}>Load by course</Text>
                {courseLoads.map((cl) => (
                  <TouchableOpacity
                    key={cl.courseId}
                    style={styles.courseRow}
                    onPress={() => router.push(`/course/${cl.courseId}` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.courseRowTop}>
                      <View style={[styles.courseDot, { backgroundColor: cl.courseColor }]} />
                      <Text style={[styles.courseName, { color: colors.ink }]} numberOfLines={1}>{cl.courseName}</Text>
                      <Text style={[styles.courseMeta, { color: colors.ink3 }]}>
                        {cl.remainingCount} left
                        {cl.weightRemaining != null ? ` · ${Math.round(cl.weightRemaining)}% of grade` : ''}
                      </Text>
                    </View>
                    <View style={[styles.loadBarBg, { backgroundColor: colors.line }]}>
                      <View
                        style={[
                          styles.loadBarFill,
                          { width: `${Math.max(4, (cl.loadScore / maxCourseLoad) * 100)}%`, backgroundColor: cl.courseColor },
                        ]}
                      />
                    </View>
                    {cl.nextDueDate && (
                      <Text style={[styles.courseNext, { color: colors.ink3 }]} numberOfLines={1}>
                        Next: {cl.nextDueTitle} · {format(new Date(cl.nextDueDate + 'T00:00:00'), 'MMM d')}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Top-3 study suggestions (embedded, computed here from the same
                data so it shares the screen's fetch). */}
            {topSuggestions.length > 0 && (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
                <View style={styles.cardHead}>
                  <Text style={[styles.cardTitle, { color: colors.ink }]}>Smart Plan</Text>
                  <TouchableOpacity style={styles.plannerLink} onPress={() => router.push('/planner' as any)}>
                    <Text style={[styles.plannerLinkText, { color: colors.brand }]}>Open timed plan</Text>
                    <FontAwesome name="chevron-right" size={9} color={colors.brand} />
                  </TouchableOpacity>
                </View>
                {topSuggestions.map((s) => {
                  const meta = TIER_META[s.tier];
                  const accent = s.tier === 'now' ? colors.coral : s.tier === 'soon' ? colors.amber : colors.ink3;
                  return (
                    <TouchableOpacity
                      key={s.taskId}
                      style={styles.suggestionRow}
                      onPress={() => onTapSuggestion(s.taskId, s.tier)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={s.line}
                    >
                      <View style={[styles.suggestionDot, { backgroundColor: s.courseColor || accent }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.suggestionTitle, { color: colors.ink }]} numberOfLines={1}>{s.title}</Text>
                        <Text style={[styles.suggestionSub, { color: colors.ink3 }]} numberOfLines={1}>
                          {s.courseName} · {s.daysUntilDue <= 0 ? 'due today' : s.daysUntilDue === 1 ? 'due tomorrow' : `due in ${s.daysUntilDue} days`}
                        </Text>
                      </View>
                      <View style={styles.tierBadge}>
                        <FontAwesome name={meta.icon} size={11} color={accent} />
                        <Text style={[styles.tierText, { color: accent }]}>{meta.label}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 18, paddingBottom: 120, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },

  // Header
  headerBlock: { marginBottom: 14 },
  title: { fontFamily: FONTS.display, fontSize: 27, color: COLORS.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: COLORS.ink3, marginTop: 4 },

  // Generic card
  card: { backgroundColor: COLORS.card, borderRadius: 18, padding: 16, borderWidth: 0.5, borderColor: COLORS.line, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { fontFamily: FONTS.displaySemibold, fontSize: 16, color: COLORS.ink },
  subtle: { fontSize: 11.5, fontWeight: '600' },
  plannerLink: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  plannerLinkText: { fontSize: 11.5, fontWeight: '700' },

  // Chart legend
  legendRow: { flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 2 },
  legendText: { fontSize: 11, fontWeight: '500' },

  // Crunch callout
  crunchCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, borderWidth: 0.5, padding: 14, marginBottom: 14 },
  crunchTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  crunchText: { fontSize: 12.5, lineHeight: 17 },

  // Exam strip
  examStrip: { flexDirection: 'row', gap: 8 },
  examChip: { borderRadius: 10, borderWidth: 0.5, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', gap: 4, minWidth: 78 },
  examChipWeek: { fontSize: 11, fontWeight: '600' },
  examCountRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  examCount: { fontSize: 12, fontWeight: '700' },

  // Per-course load
  courseRow: { paddingVertical: 8 },
  courseRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  courseDot: { width: 10, height: 10, borderRadius: 5 },
  courseName: { flex: 1, fontSize: 14, fontWeight: '600' },
  courseMeta: { fontSize: 11.5, fontWeight: '500' },
  loadBarBg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  loadBarFill: { height: 6, borderRadius: 3 },
  courseNext: { fontSize: 11.5, marginTop: 5 },

  // Study suggestions
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  suggestionDot: { width: 8, height: 8, borderRadius: 4 },
  suggestionTitle: { fontSize: 14, fontWeight: '600' },
  suggestionSub: { fontSize: 12, marginTop: 1 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tierText: { fontSize: 11, fontWeight: '700' },

  // Empty
  emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  emptyText: { fontSize: 13, lineHeight: 18 },

  // Locked (free) hero
  // Free-tier upgrade banner. Replaced the full-screen lock styles when the
  // Workload dashboard stopped being all-or-nothing for free users.
  upsell: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  upsellTitle: { fontSize: 14, fontWeight: '700' },
  upsellText: { fontSize: 13, lineHeight: 19, marginTop: 3 },
});
