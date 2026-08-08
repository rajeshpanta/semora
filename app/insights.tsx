import { translate } from '@/lib/i18n';
import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert } from '@/components/LocalizedReactNative';
import { Text } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import {
  Stack,
  router } from 'expo-router';
import { useMemo } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SyncStatusPill } from '@/components/OfflineSyncBridge';
import { track } from '@/lib/analytics';
import { SCREEN_MAX_WIDTH } from '@/lib/constants';
import { buildProgressInsights, exportSemesterReport, printSemesterReport } from '@/lib/progressInsights';
import {
  useCourses,
  useSemesterGradeCategories,
  useSemesters,
  useTasks,
} from '@/lib/queries';
import { useResponsive } from '@/lib/responsive';
import { useColors } from '@/lib/theme';
import { useAppStore } from '@/store/appStore';

export default function InsightsScreen() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const isPro = useAppStore((state) => state.isPro);
  const semesterId = useAppStore((state) => state.selectedSemesterId);
  const { data: semesters = [] } = useSemesters();
  const { data: courses = [] } = useCourses(semesterId);
  const { data: tasks = [] } = useTasks(
    semesterId ? { semesterId } : { semesterId: null },
  );
  const { data: categories = [] } = useSemesterGradeCategories(semesterId);
  // Whole screen is Pro (owner directive). Don't crunch the real trends/report
  // for free users — the locked teaser below never reads `insights`. Pass empty
  // inputs so buildProgressInsights stays a cheap no-op until they upgrade.
  const insights = useMemo(
    () => buildProgressInsights(
      isPro ? courses : [],
      isPro ? tasks : [],
      isPro ? categories : [],
    ),
    [isPro, courses, tasks, categories],
  );
  const semester = semesters.find((row) => row.id === semesterId);
  const maxWeekly = Math.max(1, ...insights.weekly.map((row) => row.completed));

  const openPaywall = () => {
    Haptics.selectionAsync().catch(() => {});
    track('paywall_open', { screen: 'insights', context: 'insights' });
    router.push({ pathname: '/paywall', params: { context: 'insights' } } as any);
  };

  const shareReport = async () => {
    // Defense in depth: the share button only renders for Pro, but never run
    // the CSV export (the paid deliverable) without an active subscription.
    if (!isPro) {
      openPaywall();
      return;
    }
    try {
      // Real file export (CSV written to cache + native share sheet), not a
      // one-line-per-course text blurb. Mirrors the .ics export pattern.
      await exportSemesterReport(semester?.name ?? 'Current semester', insights);
      track('insights_exported', { screen: 'insights', format: 'csv' });
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (err: any) {
      // Share.share doesn't reject on user-dismiss (iOS), so anything here is a
      // real failure (nothing to export, write error, unsupported platform).
      Alert.alert('Couldn\'t export', err?.message ?? 'Something went wrong. Please try again.');
    }
  };

  // Printing isn't a phone interaction — genuinely new on web, no native
  // counterpart. Useful for bringing a clean grade/schedule summary to an
  // advising or office-hours meeting.
  const printReport = () => {
    if (!isPro) {
      openPaywall();
      return;
    }
    try {
      printSemesterReport(semester?.name ?? 'Current semester', insights);
      track('insights_exported', { screen: 'insights', format: 'print' });
    } catch (err: any) {
      Alert.alert('Couldn\'t print', err?.message ?? 'Something went wrong. Please try again.');
    }
  };

  // Pro gate — the entire screen is a Pro feature. Free users get a locked
  // teaser that sells the report and routes to /paywall (context 'insights');
  // none of the real trends/report/export are computed or shown above.
  if (!isPro) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <Stack.Screen options={{ title: translate('Progress Insights') }} />
        <ScrollView
          contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: colors.brand }]}>SEMESTER REPORT</Text>
              <Text style={[styles.title, { color: colors.ink }]}>Progress Insights</Text>
              <Text style={[styles.subtitle, { color: colors.ink3 }]}>
                See completion trends, on-time rates, per-class grade patterns, and export a semester report.
              </Text>
            </View>
          </View>

          <View style={[styles.lockCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={[styles.lockIcon, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name="lock" size={22} color={colors.brand} />
            </View>
            <View style={styles.lockBadgeRow}>
              <View style={[styles.proBadge, { backgroundColor: colors.brand }]}>
                <FontAwesome name="star" size={9} color="#fff" />
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            </View>
            <Text style={[styles.lockTitle, { color: colors.ink }]}>Unlock Progress Insights</Text>
            <Text style={[styles.lockText, { color: colors.ink3 }]}>
              Track completion rhythm, on-time and missing work, and per-class grade trends — then export a full semester report.
            </Text>
            <TouchableOpacity
              style={[styles.upgradeButton, { backgroundColor: colors.brand }]}
              onPress={openPaywall}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Upgrade to Pro to unlock Progress Insights"
            >
              <Text style={styles.upgradeButtonText}>Upgrade to Pro</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: translate('Progress Insights') }} />
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.brand }]}>SEMESTER REPORT</Text>
            <Text style={[styles.title, { color: colors.ink }]}>{semester?.name ?? 'Your progress'}</Text>
            <Text style={[styles.subtitle, { color: colors.ink3 }]}>
              Patterns you can act on, not just another chart.
            </Text>
          </View>
          {Platform.OS === 'web' && (
            <TouchableOpacity
              onPress={printReport}
              style={[styles.shareButton, { backgroundColor: colors.brand50, marginRight: 8 }]}
              accessibilityRole="button"
              accessibilityLabel="Print semester report"
            >
              <FontAwesome name="print" size={17} color={colors.brand} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={shareReport}
            style={[styles.shareButton, { backgroundColor: colors.brand50 }]}
            accessibilityRole="button"
            accessibilityLabel="Share semester report"
          >
            <FontAwesome name="share-square-o" size={17} color={colors.brand} />
          </TouchableOpacity>
        </View>

        <SyncStatusPill />

        <View style={styles.metricGrid}>
          <Metric label="Kept up" value={`${insights.completionRate}%`} detail={`${insights.completedDueSoFarTasks}/${insights.dueSoFarTasks} due so far`} color={colors.brand} />
          <Metric label="On time" value={insights.onTimeRate == null ? '—' : `${insights.onTimeRate}%`} detail="of finished work" color="#0F766E" />
          <Metric label="Missing" value={String(insights.missingCount)} detail="past due" color={insights.missingCount ? colors.coral : '#0F766E'} />
          <Metric label="Graded" value={String(insights.gradedTasks)} detail="scores recorded" color="#7C3AED" />
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Completion rhythm</Text>
          <Text style={[styles.cardSub, { color: colors.ink3 }]}>Last eight weeks</Text>
          <View style={styles.chart}>
            {insights.weekly.map((week) => (
              <View key={week.weekStart} style={styles.barColumn}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${Math.max(6, week.completed / maxWeekly * 100)}%`,
                        backgroundColor: colors.brand,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.barValue, { color: colors.ink2 }]}>{week.completed}</Text>
                <Text style={[styles.barLabel, { color: colors.ink3 }]}>{week.label.split(' ')[1]}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.habitLine, { borderTopColor: colors.line }]}>
            <FontAwesome name="bolt" size={14} color={colors.coral} />
            <Text style={[styles.habitText, { color: colors.ink2 }]}>
              {insights.currentWeeklyStreak
                ? `${insights.currentWeeklyStreak}-week completion streak`
                : 'Complete one task this week to start a streak'}
              {insights.bestCompletionDay ? ` · Strongest on ${insights.bestCompletionDay}s` : ''}
              {insights.bestCompletionHour ? ` around ${insights.bestCompletionHour}` : ''}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.ink }]}>By class</Text>
        {insights.courseInsights.length === 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>No class trends yet</Text>
            <Text style={[styles.emptyText, { color: colors.ink3 }]}>
              Add assignments and grades, then Semora will reveal completion, timing, and grade trends.
            </Text>
          </View>
        ) : insights.courseInsights.map((course) => (
          <TouchableOpacity
            key={course.courseId}
            style={[styles.courseCard, { backgroundColor: colors.card, borderColor: colors.line }]}
            onPress={() => router.push(`/course/${course.courseId}` as any)}
            activeOpacity={0.75}
          >
            <View style={[styles.courseStripe, { backgroundColor: course.color }]} />
            <View style={{ flex: 1 }}>
              <View style={styles.courseHead}>
                <Text numberOfLines={1} style={[styles.courseName, { color: colors.ink }]}>{course.name}</Text>
                <Text style={[styles.grade, { color: course.color }]}>
                  {course.grade == null ? 'No grade' : `${course.grade}% ${course.letter ?? ''}`}
                </Text>
              </View>
              <View style={styles.courseStats}>
                <Text style={[styles.courseStat, { color: colors.ink3 }]}>{course.completionRate}% complete</Text>
                <Text style={[styles.dot, { color: colors.ink3 }]}>·</Text>
                <Text style={[styles.courseStat, { color: colors.ink3 }]}>
                  {course.onTimeRate == null ? 'Timing pending' : `${course.onTimeRate}% on time`}
                </Text>
                {course.missingCount > 0 && (
                  <>
                    <Text style={[styles.dot, { color: colors.ink3 }]}>·</Text>
                    <Text style={[styles.courseStat, { color: colors.coral }]}>{course.missingCount} missing</Text>
                  </>
                )}
              </View>
              {course.gradeTrend != null && (
                <Text style={[styles.trend, { color: course.gradeTrend >= 0 ? '#0F766E' : colors.coral }]}>
                  <FontAwesome name={course.gradeTrend >= 0 ? 'arrow-up' : 'arrow-down'} size={10} />
                  {' '}{Math.abs(course.gradeTrend)} points vs. earlier grades
                </Text>
              )}
            </View>
            <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
}) {
  const colors = useColors();
  return (
    <View style={[styles.metric, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Text style={[styles.metricLabel, { color: colors.ink3 }]}>{label}</Text>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={[styles.metricDetail, { color: colors.ink3 }]}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', padding: 20, paddingBottom: 48, gap: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eyebrow: { fontSize: 11, letterSpacing: 1.1, fontWeight: '800' },
  title: { fontSize: 27, lineHeight: 34, fontFamily: 'Fraunces_700Bold', marginTop: 2 },
  subtitle: { fontSize: 14, marginTop: 3 },
  shareButton: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', flexGrow: 1, padding: 15, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth },
  metricLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  metricValue: { fontSize: 25, fontWeight: '800', marginTop: 5 },
  metricDetail: { fontSize: 12, marginTop: 2 },
  card: { borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, padding: 17 },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  cardSub: { fontSize: 12, marginTop: 2 },
  chart: { height: 150, flexDirection: 'row', gap: 7, alignItems: 'flex-end', marginTop: 15 },
  barColumn: { flex: 1, alignItems: 'center', height: '100%' },
  barTrack: { flex: 1, width: '68%', justifyContent: 'flex-end' },
  bar: { width: '100%', minHeight: 4, borderRadius: 6 },
  barValue: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  barLabel: { fontSize: 9, marginTop: 1 },
  habitLine: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 13, paddingTop: 13, flexDirection: 'row', gap: 9 },
  habitText: { flex: 1, fontSize: 13, lineHeight: 18 },
  sectionTitle: { fontSize: 20, fontFamily: 'Fraunces_700Bold', marginTop: 2 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  emptyText: { fontSize: 14, lineHeight: 20, marginTop: 5 },
  courseCard: { minHeight: 86, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, overflow: 'hidden' },
  courseStripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  courseHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  courseName: { flex: 1, fontSize: 15, fontWeight: '800' },
  grade: { fontSize: 13, fontWeight: '800' },
  courseStats: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  courseStat: { fontSize: 12 },
  dot: { marginHorizontal: 5 },
  trend: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  // Locked teaser for free users (whole-screen Pro gate). Mirrors the
  // lock/PRO-badge + "Upgrade to Pro" treatment used elsewhere.
  lockCard: { borderRadius: 19, borderWidth: StyleSheet.hairlineWidth, padding: 22, alignItems: 'center', gap: 12 },
  lockIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  lockBadgeRow: { flexDirection: 'row' },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  proBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  lockTitle: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
  lockText: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  upgradeButton: { height: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch', marginTop: 4 },
  upgradeButtonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
