import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Platform,
  RefreshControl, TouchableOpacity, Alert, ActivityIndicator, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { format, startOfWeek, addDays, differenceInDays, isToday as isDateToday, isPast, startOfDay } from 'date-fns';
import { useSession } from '@/app/_layout';
import { useAppStore, findCurrentSemester } from '@/store/appStore';
import {
  useSemesters, useCourses, useTodayTasks, useDueSoonTasks,
  useTaskStats, useToggleTaskComplete, useTasks,
} from '@/lib/queries';
import { COLORS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { displayName } from '@/lib/user';
import { formatTimeOfDay, classTimeStatus } from '@/lib/schedule';

// Max overdue rows shown before collapsing into a "Show N more" expander.
// 5 covers the typical case (0–3) without truncating; only kicks in when
// the user has accumulated a backlog.
const VISIBLE_OVERDUE = 5;

// Display labels for course_meetings.kind. Lecture is the default and
// rendered without a prefix; the others get "Lab · 2:00 PM" style.
const KIND_LABEL: Record<'lecture' | 'lab' | 'discussion' | 'other', string> = {
  lecture: 'Lecture',
  lab: 'Lab',
  discussion: 'Discussion',
  other: 'Meeting',
};

/** Time-of-day greeting. 0–4: "Hey" (still up); 5–11: morning;
 *  12–16: afternoon; 17–23: evening. */
function greetingFor(hour: number): string {
  if (hour < 5) return 'Hey';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function TodayScreen() {
  const colors = useColors();
  const { session } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  // Cap the overdue card so a procrastinator with 30 incomplete tasks doesn't
  // get a wall of red. Tap "Show N more" to expand inline.
  const [showAllOverdue, setShowAllOverdue] = useState(false);

  // Empty fallback so the greeting can degrade to just "Good morning" when we
  // have no usable name (vs. the old "Good morning, there" which read awkwardly).
  const userName = displayName(session?.user, '');
  // Bump every minute so `today`, `nowHHMM`, and the greeting refresh while
  // the screen sits open — without this, the NOW badge wouldn't appear when
  // a class actually starts and the greeting would be stuck on "Good morning"
  // all afternoon. See ticker effect below.
  const [, setMinuteTick] = useState(0);
  const today = new Date();
  // Diff against the start of today, not "right now". Otherwise at 11pm
  // a task due tomorrow shows as "TODAY" because differenceInDays truncates.
  const todayStart = startOfDay(today);
  const dateLabel = format(today, "EEE · MMMM d");
  const greeting = greetingFor(today.getHours());
  // "HH:MM:SS" for comparing against start_time / end_time strings from Postgres.
  const nowHHMM = `${String(today.getHours()).padStart(2, '0')}:${String(today.getMinutes()).padStart(2, '0')}:${String(today.getSeconds()).padStart(2, '0')}`;

  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);
  const { data: semesters = [], isLoading: semestersLoading } = useSemesters();
  const { data: courses = [] } = useCourses(selectedSemesterId);
  const { data: todayTasks = [] } = useTodayTasks(selectedSemesterId);
  const { data: dueSoonTasks = [] } = useDueSoonTasks(selectedSemesterId);
  const { data: stats } = useTaskStats(selectedSemesterId);
  const toggleComplete = useToggleTaskComplete();

  const activeSemester = semesters.find((s) => s.id === selectedSemesterId);

  // Overdue: past due, not completed
  const yesterdayStr = format(addDays(today, -1), 'yyyy-MM-dd');
  const { data: overdueTasks = [] } = useTasks(
    selectedSemesterId
      ? { semesterId: selectedSemesterId, dueDateTo: yesterdayStr, isCompleted: false }
      : { semesterId: null }
  );

  // Week data
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 6);
  const { data: weekTasks = [] } = useTasks(
    selectedSemesterId
      ? { semesterId: selectedSemesterId, dueDateFrom: format(weekStart, 'yyyy-MM-dd'), dueDateTo: format(weekEnd, 'yyyy-MM-dd') }
      : { semesterId: null }
  );

  useEffect(() => {
    if (semesters.length === 0) return;
    if (!selectedSemesterId || !semesters.some((s) => s.id === selectedSemesterId)) {
      setSelectedSemester(findCurrentSemester(semesters));
    }
  }, [semesters, selectedSemesterId]);

  // Per-minute re-render so time-of-day UI (NOW badge, class fade, greeting)
  // stays accurate while the screen is open. Aligned to the next minute
  // boundary so the badge flips at HH:MM:00, not at a random offset from when
  // the screen happened to mount. setInterval is cleared on unmount and during
  // re-runs to avoid leaks/duplicate timers.
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const msUntilNextMinute = 60_000 - (Date.now() % 60_000);
    const timeout = setTimeout(() => {
      setMinuteTick((t) => t + 1);
      interval = setInterval(() => setMinuteTick((t) => t + 1), 60_000);
    }, msUntilNextMinute);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  // Returning to Today after creating/completing a task elsewhere (Plan tab,
  // course detail, scan flow) — pull fresh task data. Scoped to task-shaped
  // queries so we don't churn courses/semester metadata that hasn't changed.
  // Skip the very first focus so the initial mount's auto-fetch isn't
  // immediately invalidated.
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['taskStats'] });
    }, [qc]),
  );

  // Notification-permission banner. Reminders are core to the app's value
  // (advance warning before deadlines). If the OS prompt was denied or
  // never answered, the scheduler runs but nothing fires — and the user
  // doesn't know why. Re-check on every focus so dismissing the banner by
  // enabling in Settings takes effect on tab re-entry.
  const [notifPermDenied, setNotifPermDenied] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') return;
      Notifications.getPermissionsAsync()
        .then(({ status }) => setNotifPermDenied(status !== 'granted'))
        .catch(() => {});
    }, []),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    qc.invalidateQueries().then(() => setRefreshing(false));
  }, []);

  // Today's classes — flatMap over course_meetings so a course with a
  // lecture *and* a lab meeting today shows up as two rows (one per
  // meeting), ordered by start time. Time-less meetings are kept and
  // sorted to the bottom; that's the chip-only "I meet on these days"
  // case from Phase 1.6.
  const todayDow = today.getDay();
  const todaysClasses = courses
    .flatMap((c) => (c.course_meetings ?? []).map((m) => ({ course: c, meeting: m })))
    .filter(({ meeting }) => meeting.days_of_week.includes(todayDow))
    .sort((a, b) =>
      (a.meeting.start_time ?? '99').localeCompare(b.meeting.start_time ?? '99'),
    );

  // Next up: most urgent incomplete task
  const nextUp = dueSoonTasks.length > 0 ? dueSoonTasks[0] : null;
  const nextUpDays = nextUp ? Math.max(0, differenceInDays(new Date(nextUp.due_date + 'T00:00:00'), todayStart)) : 0;

  // Weekly stats
  const weekExams = weekTasks.filter((t) => t.type === 'exam').length;
  const weekOverdue = weekTasks.filter((t) => !t.is_completed && new Date(t.due_date + 'T00:00:00') < todayStart && !isDateToday(new Date(t.due_date + 'T00:00:00'))).length;
  const todayStr = format(today, 'yyyy-MM-dd');
  const dayBuckets = Array.from({ length: 7 }, (_, i) => {
    const d = format(addDays(weekStart, i), 'yyyy-MM-dd');
    return weekTasks.filter((t) => t.due_date === d).length;
  });

  // "This week" highlight — single actionable callout. Priority: next
  // upcoming exam this week > heaviest day with 2+ tasks. Replaces the
  // prior bar chart, which looked nice but didn't drive any decision.
  const nextWeekExam = weekTasks
    .filter((t) => t.type === 'exam' && !t.is_completed && t.due_date >= todayStr)
    .sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  let weekHighlight: { icon: string; tone: 'coral' | 'ink2'; text: string } | null = null;
  if (nextWeekExam) {
    const examDate = format(new Date(nextWeekExam.due_date + 'T00:00:00'), 'EEE MMM d');
    weekHighlight = {
      icon: 'flag',
      tone: 'coral',
      text: `Next exam: ${nextWeekExam.courses.name} · ${nextWeekExam.title} — ${examDate}`,
    };
  } else {
    const heaviestIdx = dayBuckets.indexOf(Math.max(...dayBuckets));
    const heaviestCount = dayBuckets[heaviestIdx];
    if (heaviestCount >= 2) {
      const heaviestLabel = format(addDays(weekStart, heaviestIdx), 'EEEE');
      weekHighlight = {
        icon: 'calendar',
        tone: 'ink2',
        text: `${heaviestLabel} is busiest — ${heaviestCount} tasks due`,
      };
    }
  }

  // Tomorrow preview — surfaced in the evening when there's something to
  // peek at. Sunday-night use case ("Monday 8am class is in 9 hours") is
  // the primary motivator. dueSoonTasks already covers today→3 days so it
  // crosses the week boundary cleanly without a new query.
  const tomorrowDate = addDays(today, 1);
  const tomorrowDow = tomorrowDate.getDay();
  const tomorrowDayName = format(tomorrowDate, 'EEEE');
  const tomorrowStr = format(tomorrowDate, 'yyyy-MM-dd');
  const tomorrowsClasses = courses
    .flatMap((c) => (c.course_meetings ?? []).map((m) => ({ course: c, meeting: m })))
    .filter(({ meeting }) => meeting.days_of_week.includes(tomorrowDow))
    .sort((a, b) =>
      (a.meeting.start_time ?? '99').localeCompare(b.meeting.start_time ?? '99'),
    );
  const tomorrowsTasks = dueSoonTasks.filter((t) => t.due_date === tomorrowStr);
  const showTomorrow =
    today.getHours() >= 17 && (tomorrowsClasses.length > 0 || tomorrowsTasks.length > 0);


  // Show loading spinner on initial data fetch (not on pull-to-refresh)
  if (semestersLoading && semesters.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['top']}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {/* Header */}
        <Text style={[styles.eyeLabel, { color: colors.ink3 }]}>{dateLabel}</Text>
        <Text style={[styles.greeting, { color: colors.ink }]}>
          {userName ? `${greeting}, ${userName}` : greeting}
        </Text>
        {activeSemester && (
          <Text style={[styles.semesterLabel, { color: colors.ink3 }]}>{activeSemester.name}</Text>
        )}

        {/* Notification permission nudge. Surfaces when the OS prompt was
            denied / never answered. Tapping opens the device's Semora
            notification settings — iOS does not allow re-prompting in-app
            once the user has dismissed the system dialog. */}
        {notifPermDenied && (
          <TouchableOpacity
            style={[styles.notifBanner, { backgroundColor: colors.amber50, borderColor: colors.amber }]}
            onPress={() => Linking.openSettings().catch(() => {})}
            activeOpacity={0.7}
          >
            <FontAwesome name="bell-slash" size={14} color={colors.amber} />
            <Text style={[styles.notifBannerText, { color: colors.ink }]}>
              Turn on notifications to get reminders before deadlines
            </Text>
            <FontAwesome name="chevron-right" size={11} color={colors.amber} />
          </TouchableOpacity>
        )}

        {/* Today's classes — only renders when a course meets today. Hidden
            entirely when no schedule data exists, so users with no times set
            don't see an empty section. */}
        {todaysClasses.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>
                Today's classes · {todaysClasses.length}
              </Text>
            </View>
            <View style={[styles.classCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
              {todaysClasses.map(({ course, meeting }, i) => {
                const isLast = i === todaysClasses.length - 1;
                const status = classTimeStatus(meeting.start_time, meeting.end_time, nowHHMM);
                const isPast = status === 'past';
                const isNow = status === 'now';
                // Surface kind only when it adds info — lecture is the
                // default, but lab/discussion/other tells the user this
                // is a different block from the main lecture.
                const kindLabel = meeting.kind !== 'lecture' ? KIND_LABEL[meeting.kind] : null;
                return (
                  <TouchableOpacity
                    key={meeting.id}
                    style={[
                      styles.classRow,
                      !isLast && [styles.taskRowBorder, { borderBottomColor: colors.line }],
                      isPast && { opacity: 0.45 },
                    ]}
                    onPress={() => router.push(`/course/${course.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.classDot, { backgroundColor: course.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.classTitle,
                          { color: colors.ink },
                          isPast && { textDecorationLine: 'line-through', color: colors.ink3 },
                        ]}
                        numberOfLines={1}
                      >
                        {course.name}
                      </Text>
                      <Text style={[styles.classTime, { color: colors.ink3 }]}>
                        {kindLabel ? `${kindLabel} · ` : ''}
                        {meeting.start_time ? formatTimeOfDay(meeting.start_time) : 'TBD'}
                        {meeting.end_time ? ` – ${formatTimeOfDay(meeting.end_time)}` : ''}
                      </Text>
                    </View>
                    {isNow ? (
                      <View style={[styles.nowBadge, { backgroundColor: colors.teal }]}>
                        <View style={styles.nowDot} />
                        <Text style={styles.nowBadgeText}>NOW</Text>
                      </View>
                    ) : (
                      <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Overdue — only shows when overdue tasks exist. Capped at
            VISIBLE_OVERDUE rows; the rest are revealed via "Show N more".
            Placed BEFORE Next Up Hero: a task 4 days late is more urgent than
            one due tomorrow, so the red card should claim attention first. */}
        {overdueTasks.length > 0 && (() => {
          const visibleOverdue = showAllOverdue
            ? overdueTasks
            : overdueTasks.slice(0, VISIBLE_OVERDUE);
          const hiddenOverdueCount = overdueTasks.length - visibleOverdue.length;
          return (
          <>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: colors.coral }]}>Overdue · {overdueTasks.length}</Text>
            </View>
            <View style={[styles.overdueCard, { backgroundColor: colors.coral50, borderColor: colors.coral }]}>
              {visibleOverdue.map((task, i) => {
                // Last row gets no bottom border only when there's nothing
                // (more rows or expander) below it.
                const isLast = i === visibleOverdue.length - 1 && hiddenOverdueCount === 0;
                return (
                  <TouchableOpacity
                    key={task.id}
                    style={[styles.overdueRow, !isLast && [styles.taskRowBorder, { borderBottomColor: colors.line }]]}
                    onPress={() => router.push(`/task/${task.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        Alert.alert('Past Due Date', 'Was this submitted late?', [
                          { text: 'Yes, late', onPress: () => toggleComplete.mutate({ id: task.id, is_completed: true, submitted_late: true }) },
                          { text: 'No, on time', onPress: () => toggleComplete.mutate({ id: task.id, is_completed: true, submitted_late: false }) },
                          { text: 'Cancel', style: 'cancel' },
                        ]);
                      }}
                      hitSlop={8}
                    >
                      <View style={[styles.cbx, { borderColor: colors.coral }]} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.taskTitle, { color: colors.ink }]} numberOfLines={1}>{task.title}</Text>
                      <View style={styles.taskMeta}>
                        <View style={[styles.dot, { backgroundColor: task.courses.color }]} />
                        <Text style={[styles.taskCourse, { color: colors.coral }]} numberOfLines={1}>
                          {task.courses.name} · {format(new Date(task.due_date + 'T00:00:00'), 'MMM d')}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.overdueBadge, { backgroundColor: colors.coral50 }]}>
                      <Text style={[styles.overdueBadgeText, { color: colors.coral }]}>
                        {differenceInDays(todayStart, new Date(task.due_date + 'T00:00:00'))}d late
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              {hiddenOverdueCount > 0 && (
                <TouchableOpacity
                  onPress={() => setShowAllOverdue(true)}
                  style={styles.showMoreRow}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Show ${hiddenOverdueCount} more overdue tasks`}
                >
                  <Text style={[styles.showMoreText, { color: colors.coral }]}>
                    Show {hiddenOverdueCount} more
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </>
          );
        })()}

        {/* Next Up Hero — forward-looking pointer to the most urgent
            upcoming task. Sits below Overdue so emergencies surface first. */}
        {nextUp && (
          <View style={[styles.heroCard, { backgroundColor: colors.brand }]}>
            <View style={styles.heroTop}>
              <Text style={styles.heroEye}>NEXT UP</Text>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>
                  {nextUpDays === 0 ? 'TODAY' : nextUpDays === 1 ? 'TOMORROW' : `${nextUpDays} DAYS`}
                </Text>
              </View>
            </View>
            <Text style={styles.heroTitle} numberOfLines={2}>{nextUp.courses.name} · {nextUp.title}</Text>
            <Text style={styles.heroSub}>
              {format(new Date(nextUp.due_date + 'T00:00:00'), 'EEEE, MMMM d')}
              {nextUp.due_time ? ` · ${nextUp.due_time.slice(0, 5)}` : ''}
            </Text>
          </View>
        )}

        {/* Today's tasks — header shows progress when there's anything to do.
            The horizontal bar gives the momentum signal (vs SVG ring,
            which would require a native rebuild). Color jumps to teal
            at 100% to reward completion.

            We derive counts from weekTasks (no isCompleted filter) rather
            than todayTasks (which is incomplete-only via useTodayTasks).
            Otherwise completedToday is always 0 and the bar never moves. */}
        {(() => {
          const todayStr = format(today, 'yyyy-MM-dd');
          const allTodayTasks = weekTasks.filter((t) => t.due_date === todayStr);
          const completedToday = allTodayTasks.filter((t) => t.is_completed).length;
          const totalToday = allTodayTasks.length;
          const allDone = totalToday > 0 && completedToday === totalToday;
          return (
            <>
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>
                  {totalToday > 0
                    ? `Today · ${completedToday} of ${totalToday} done`
                    : 'Today'}
                </Text>
                {allDone && (
                  <Text style={[styles.sectionTitle, { color: colors.teal }]}>✓ All done</Text>
                )}
              </View>
              {totalToday > 0 && (
                <View style={[styles.progressTrack, { backgroundColor: colors.line }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${(completedToday / totalToday) * 100}%`,
                        backgroundColor: allDone ? colors.teal : colors.brand,
                      },
                    ]}
                  />
                </View>
              )}
            </>
          );
        })()}

        {todayTasks.length > 0 ? (
          <View style={[styles.taskCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            {todayTasks.map((task, i) => {
              const isLast = i === todayTasks.length - 1;
              const urgent = task.due_time && !task.is_completed;
              return (
                <TouchableOpacity
                  key={task.id}
                  style={[styles.taskRow, !isLast && [styles.taskRowBorder, { borderBottomColor: colors.line }]]}
                  onPress={() => router.push(`/task/${task.id}` as any)}
                  activeOpacity={0.7}
                >
                  <TouchableOpacity
                    onPress={() => {
                      const dueD = new Date(task.due_date + 'T00:00:00');
                      const isOverdue = !task.is_completed && isPast(dueD) && !isDateToday(dueD);
                      if (!task.is_completed && isOverdue) {
                        Alert.alert('Past Due Date', 'Was this submitted late?', [
                          { text: 'Yes, late', onPress: () => toggleComplete.mutate({ id: task.id, is_completed: true, submitted_late: true }) },
                          { text: 'No, on time', onPress: () => toggleComplete.mutate({ id: task.id, is_completed: true, submitted_late: false }) },
                          { text: 'Cancel', style: 'cancel' },
                        ]);
                      } else {
                        toggleComplete.mutate({ id: task.id, is_completed: !task.is_completed });
                      }
                    }}
                    hitSlop={8}
                  >
                    <View style={[
                      styles.cbx,
                      { borderColor: colors.ink3 },
                      task.is_completed && { backgroundColor: colors.teal, borderColor: colors.teal },
                      urgent && !task.is_completed && { borderColor: colors.coral },
                    ]}>
                      {task.is_completed && <FontAwesome name="check" size={9} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.taskTitle, { color: colors.ink }, task.is_completed && [styles.taskDone, { color: colors.ink3 }]]} numberOfLines={1}>{task.title}</Text>
                    <View style={styles.taskMeta}>
                      <View style={[styles.dot, { backgroundColor: task.courses.color }]} />
                      <Text style={[
                        styles.taskCourse,
                        { color: colors.ink3 },
                        urgent && !task.is_completed && { color: colors.coral, fontWeight: '500' },
                      ]} numberOfLines={1}>
                        {task.courses.name}{task.due_time && urgent ? ` · due ${task.due_time.slice(0, 5)}` : ''}
                      </Text>
                    </View>
                  </View>
                  {task.due_time && !urgent && (
                    <Text style={[styles.taskTime, { color: colors.ink3 }]}>{task.due_time.slice(0, 5)}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <FontAwesome name="check-circle" size={24} color={colors.teal} />
            <Text style={[styles.emptyText, { color: colors.ink3 }]}>You're free today!</Text>
            {dueSoonTasks.length > 0 ? (
              <Text style={[styles.emptySub, { color: colors.ink3 }]}>
                Next up: {dueSoonTasks[0].title} ({dueSoonTasks[0].courses.name}) — due {format(new Date(dueSoonTasks[0].due_date + 'T00:00:00'), 'EEE, MMM d')}
              </Text>
            ) : stats && stats.pending === 0 && stats.completed > 0 ? (
              // Truly caught up: tasks have been done, nothing pending. Reward
              // state — distinct from "no tasks ever entered" (which nudges
              // toward scanning a syllabus below).
              <Text style={[styles.emptySub, { color: colors.ink3 }]}>
                You're ahead — caught up for now. Enjoy the breather.
              </Text>
            ) : stats && stats.pending > 0 ? (
              <Text style={[styles.emptySub, { color: colors.ink3 }]}>
                You have {stats.pending} pending task{stats.pending > 1 ? 's' : ''} this semester. Check your courses for upcoming deadlines.
              </Text>
            ) : courses.length > 0 ? (
              <>
                <Text style={[styles.emptySub, { color: colors.ink3 }]}>
                  No deadlines coming up. Scan a syllabus to import your assignments.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyCta, { backgroundColor: colors.brand }]}
                  onPress={() => router.push('/scan' as any)}
                  activeOpacity={0.85}
                >
                  <FontAwesome name="camera" size={14} color="#fff" />
                  <Text style={styles.emptyCtaText}>Scan a syllabus</Text>
                </TouchableOpacity>
              </>
            ) : semesters.length === 0 ? (
              <>
                <Text style={[styles.emptySub, { color: colors.ink3 }]}>
                  Set up your semester to start tracking deadlines.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyCta, { backgroundColor: colors.brand }]}
                  onPress={() => router.push('/semester/new')}
                  activeOpacity={0.85}
                >
                  <FontAwesome name="plus" size={14} color="#fff" />
                  <Text style={styles.emptyCtaText}>Create your first semester</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={[styles.emptySub, { color: colors.ink3 }]}>
                  Add courses or scan a syllabus to populate your semester.
                </Text>
                <TouchableOpacity
                  style={[styles.emptyCta, { backgroundColor: colors.brand }]}
                  onPress={() => router.push('/course/new')}
                  activeOpacity={0.85}
                >
                  <FontAwesome name="plus" size={14} color="#fff" />
                  <Text style={styles.emptyCtaText}>Add a course</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Tomorrow preview — late-evening peek so a Sunday-9pm user doesn't
            see a dead screen when nothing's left today. Only renders after
            5pm, and only when tomorrow has a class or task worth surfacing. */}
        {showTomorrow && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 20, marginBottom: 10, color: colors.ink2 }]}>
              Tomorrow · {tomorrowDayName}
            </Text>
            <View style={[styles.classCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
              {tomorrowsClasses.map(({ course, meeting }, i) => {
                const isLastClass = i === tomorrowsClasses.length - 1;
                const isLast = isLastClass && tomorrowsTasks.length === 0;
                const kindLabel = meeting.kind !== 'lecture' ? KIND_LABEL[meeting.kind] : null;
                return (
                  <View
                    key={`tc-${meeting.id}`}
                    style={[
                      styles.classRow,
                      !isLast && [styles.taskRowBorder, { borderBottomColor: colors.line }],
                    ]}
                  >
                    <View style={[styles.classDot, { backgroundColor: course.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.classTitle, { color: colors.ink }]} numberOfLines={1}>
                        {course.name}
                      </Text>
                      <Text style={[styles.classTime, { color: colors.ink3 }]}>
                        {kindLabel ? `${kindLabel} · ` : ''}
                        {meeting.start_time ? formatTimeOfDay(meeting.start_time) : 'TBD'}
                        {meeting.end_time ? ` – ${formatTimeOfDay(meeting.end_time)}` : ''}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {tomorrowsTasks.map((task, i) => {
                const isLast = i === tomorrowsTasks.length - 1;
                return (
                  <TouchableOpacity
                    key={`tt-${task.id}`}
                    style={[
                      styles.taskRow,
                      !isLast && [styles.taskRowBorder, { borderBottomColor: colors.line }],
                    ]}
                    onPress={() => router.push(`/task/${task.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.cbx, { borderColor: colors.ink3 }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.taskTitle, { color: colors.ink }]} numberOfLines={1}>
                        {task.title}
                      </Text>
                      <View style={styles.taskMeta}>
                        <View style={[styles.dot, { backgroundColor: task.courses.color }]} />
                        <Text style={[styles.taskCourse, { color: colors.ink3 }]} numberOfLines={1}>
                          {task.courses.name}
                          {task.due_time ? ` · ${task.due_time.slice(0, 5)}` : ''}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* This Week */}
        <Text style={[styles.sectionTitle, { marginTop: 20, marginBottom: 10, color: colors.ink2 }]}>This week</Text>
        <View style={[styles.weekCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={styles.weekStats}>
            <View style={styles.weekStat}>
              <Text style={[styles.weekStatNum, { color: colors.ink }]}>{weekTasks.length}</Text>
              <Text style={[styles.weekStatLabel, { color: colors.ink3 }]}>TASKS</Text>
            </View>
            <View style={styles.weekStat}>
              <Text style={[styles.weekStatNum, { color: colors.ink }]}>{weekExams}</Text>
              <Text style={[styles.weekStatLabel, { color: colors.ink3 }]}>EXAMS</Text>
            </View>
            <View style={styles.weekStat}>
              <Text style={[styles.weekStatNum, { color: colors.ink }, weekOverdue > 0 && { color: colors.coral }]}>{weekOverdue}</Text>
              <Text style={[styles.weekStatLabel, { color: colors.ink3 }]}>OVERDUE</Text>
            </View>
            <View style={styles.weekStat}>
              <Text style={[styles.weekStatNum, { color: colors.ink }]}>{courses.length}</Text>
              <Text style={[styles.weekStatLabel, { color: colors.ink3 }]}>COURSES</Text>
            </View>
          </View>
          {/* Single actionable highlight: next exam if any, else heaviest day. */}
          {weekHighlight && (
            <View style={[styles.weekHighlight, { borderTopColor: colors.line }]}>
              <FontAwesome
                name={weekHighlight.icon as any}
                size={13}
                color={weekHighlight.tone === 'coral' ? colors.coral : colors.ink2}
              />
              <Text
                style={[
                  styles.weekHighlightText,
                  { color: weekHighlight.tone === 'coral' ? colors.coral : colors.ink2 },
                ]}
                numberOfLines={2}
              >
                {weekHighlight.text}
              </Text>
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Quick-add FAB. Hidden when the user has no courses, since
          /task/new requires a course selection. Position clears the
          tab bar (~80px tall on iOS). */}
      {courses.length > 0 && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.brand }]}
          onPress={() => router.push('/task/new?defaultDate=today' as any)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Add a new task for today"
        >
          <FontAwesome name="plus" size={20} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 18, paddingBottom: 120 },
  eyeLabel: { fontSize: 14, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: COLORS.ink3 },
  greeting: { fontSize: 26, fontWeight: '600', color: COLORS.ink, letterSpacing: -0.5, marginTop: 4, marginBottom: 2 },
  semesterLabel: { fontSize: 14, color: COLORS.ink3, fontWeight: '500', marginBottom: 16 },
  notifBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 12, borderWidth: 1,
    marginBottom: 16,
  },
  notifBannerText: { flex: 1, fontSize: 13, fontWeight: '500' },
  // Hero
  heroCard: { backgroundColor: COLORS.brand, borderRadius: 22, padding: 16, marginBottom: 18 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroEye: { fontSize: 14, fontWeight: '600', letterSpacing: 1, color: 'rgba(255,255,255,0.7)' },
  heroBadge: { backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  heroBadgeText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  heroTitle: { fontSize: 19, fontWeight: '600', color: '#fff', marginTop: 6, letterSpacing: -0.3 },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.82)', marginTop: 2 },
  // Section
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: COLORS.ink2 },
  // Today's classes
  classCard: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 14, borderWidth: 0.5, borderColor: COLORS.line, marginBottom: 18 },
  classRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  classDot: { width: 8, height: 8, borderRadius: 4 },
  classTitle: { fontSize: 14, fontWeight: '500', color: COLORS.ink },
  classTime: { fontSize: 13, color: COLORS.ink3, marginTop: 2 },
  nowBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
  },
  nowBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.4 },
  nowDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#fff' },
  // Tasks
  taskCard: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 14, borderWidth: 0.5, borderColor: COLORS.line },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  taskRowBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  cbx: { width: 20, height: 20, borderRadius: 7, borderWidth: 1.5, borderColor: COLORS.ink3, justifyContent: 'center', alignItems: 'center' },
  taskTitle: { fontSize: 14, fontWeight: '500', color: COLORS.ink },
  taskDone: { textDecorationLine: 'line-through', color: COLORS.ink3 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  taskCourse: { fontSize: 14, color: COLORS.ink3 },
  taskTime: { fontSize: 14, color: COLORS.ink3 },
  // Overdue (background + borders themed via inline style for dark mode)
  overdueCard: { borderRadius: 18, paddingHorizontal: 14, borderWidth: 0.5, marginBottom: 16 },
  overdueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  overdueBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  overdueBadgeText: { fontSize: 12, fontWeight: '600', color: COLORS.coral },
  showMoreRow: { paddingVertical: 12, alignItems: 'center' },
  showMoreText: { fontSize: 13, fontWeight: '600' },
  // Progress bar (Today's completion meter)
  progressTrack: {
    height: 4, borderRadius: 2, overflow: 'hidden',
    marginBottom: 10, marginHorizontal: 2,
  },
  progressFill: { height: '100%', borderRadius: 2 },
  // Empty
  emptyCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 24, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.line },
  emptyText: { fontSize: 14, fontWeight: '500', color: COLORS.ink3 },
  emptySub: { fontSize: 14, color: COLORS.ink3, marginTop: 4, textAlign: 'center' },
  emptyCta: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    marginTop: 14,
  },
  emptyCtaText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  // Week
  weekCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 14, borderWidth: 0.5, borderColor: COLORS.line },
  weekStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  weekStat: { alignItems: 'center' },
  weekStatNum: { fontSize: 20, fontWeight: '600', color: COLORS.ink },
  weekStatLabel: { fontSize: 14, color: COLORS.ink3, letterSpacing: 0.3 },
  weekHighlight: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingTop: 12, marginTop: 4,
    borderTopWidth: 0.5, borderTopColor: COLORS.line,
  },
  weekHighlightText: { flex: 1, fontSize: 13, fontWeight: '500' },
  // Floating action button (Quick-add task)
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 96,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
  },
});
