import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Platform,
  RefreshControl, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, addDays, differenceInDays, isToday as isDateToday, isPast } from 'date-fns';
import { useSession } from '@/app/_layout';
import { useAppStore, findCurrentSemester } from '@/store/appStore';
import {
  useSemesters, useCourses, useTodayTasks, useDueSoonTasks,
  useTaskStats, useToggleTaskComplete, useTasks,
} from '@/lib/queries';
import { COLORS } from '@/lib/constants';

export default function TodayScreen() {
  const { session } = useSession();
  const router = useRouter();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const email = session?.user?.email ?? '';
  const name = email.split('@')[0] || 'there';
  const today = new Date();
  const dateLabel = format(today, "EEE · MMMM d");

  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);
  const { data: semesters = [] } = useSemesters();
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    qc.invalidateQueries().then(() => setRefreshing(false));
  }, []);

  // Next up: most urgent incomplete task
  const nextUp = dueSoonTasks.length > 0 ? dueSoonTasks[0] : null;
  const nextUpDays = nextUp ? Math.max(0, differenceInDays(new Date(nextUp.due_date + 'T00:00:00'), today)) : 0;

  // Weekly stats
  const weekExams = weekTasks.filter((t) => t.type === 'exam').length;
  const weekOverdue = weekTasks.filter((t) => !t.is_completed && new Date(t.due_date + 'T00:00:00') < today && !isDateToday(new Date(t.due_date + 'T00:00:00'))).length;
  const dayBuckets = Array.from({ length: 7 }, (_, i) => {
    const d = format(addDays(weekStart, i), 'yyyy-MM-dd');
    return weekTasks.filter((t) => t.due_date === d).length;
  });
  const maxBucket = Math.max(...dayBuckets, 1);
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayDayIndex = (today.getDay() + 6) % 7; // Mon=0


  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
      >
        {/* Header */}
        <Text style={styles.eyeLabel}>{dateLabel}</Text>
        <Text style={styles.greeting}>Hey, {name}</Text>
        {activeSemester && (
          <Text style={styles.semesterLabel}>{activeSemester.name}</Text>
        )}

        {/* Next Up Hero */}
        {nextUp && (
          <View style={styles.heroCard}>
            <View style={styles.heroTop}>
              <Text style={styles.heroEye}>NEXT UP</Text>
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText}>
                  {nextUpDays === 0 ? 'TODAY' : nextUpDays === 1 ? 'TOMORROW' : `${nextUpDays} DAYS`}
                </Text>
              </View>
            </View>
            <Text style={styles.heroTitle}>{nextUp.courses.name} · {nextUp.title}</Text>
            <Text style={styles.heroSub}>
              {format(new Date(nextUp.due_date + 'T00:00:00'), 'EEEE, MMMM d')}
              {nextUp.due_time ? ` · ${nextUp.due_time.slice(0, 5)}` : ''}
            </Text>
          </View>
        )}

        {/* Overdue — only shows when overdue tasks exist */}
        {overdueTasks.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionTitle, { color: COLORS.coral }]}>Overdue · {overdueTasks.length}</Text>
            </View>
            <View style={styles.overdueCard}>
              {overdueTasks.map((task, i) => {
                const isLast = i === overdueTasks.length - 1;
                return (
                  <TouchableOpacity
                    key={task.id}
                    style={[styles.overdueRow, !isLast && styles.taskRowBorder]}
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
                      <View style={[styles.cbx, { borderColor: COLORS.coral }]} />
                    </TouchableOpacity>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      <View style={styles.taskMeta}>
                        <View style={[styles.dot, { backgroundColor: task.courses.color }]} />
                        <Text style={[styles.taskCourse, { color: COLORS.coral }]}>
                          {task.courses.name} · {format(new Date(task.due_date + 'T00:00:00'), 'MMM d')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.overdueBadge}>
                      <Text style={styles.overdueBadgeText}>
                        {differenceInDays(today, new Date(task.due_date + 'T00:00:00'))}d late
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* Today's tasks */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Today · {todayTasks.length} tasks</Text>
        </View>

        {todayTasks.length > 0 ? (
          <View style={styles.taskCard}>
            {todayTasks.map((task, i) => {
              const isLast = i === todayTasks.length - 1;
              const urgent = task.due_time && !task.is_completed;
              return (
                <TouchableOpacity
                  key={task.id}
                  style={[styles.taskRow, !isLast && styles.taskRowBorder]}
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
                      task.is_completed && { backgroundColor: COLORS.teal, borderColor: COLORS.teal },
                      urgent && !task.is_completed && { borderColor: COLORS.coral },
                    ]}>
                      {task.is_completed && <FontAwesome name="check" size={9} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.taskTitle, task.is_completed && styles.taskDone]}>{task.title}</Text>
                    <View style={styles.taskMeta}>
                      <View style={[styles.dot, { backgroundColor: task.courses.color }]} />
                      <Text style={[
                        styles.taskCourse,
                        urgent && !task.is_completed && { color: COLORS.coral, fontWeight: '500' },
                      ]}>
                        {task.courses.name}{task.due_time && urgent ? ` · due ${task.due_time.slice(0, 5)}` : ''}
                      </Text>
                    </View>
                  </View>
                  {task.due_time && !urgent && (
                    <Text style={styles.taskTime}>{task.due_time.slice(0, 5)}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <FontAwesome name="check-circle" size={24} color={COLORS.teal} />
            <Text style={styles.emptyText}>You're free today!</Text>
            {dueSoonTasks.length > 0 ? (
              <Text style={styles.emptySub}>
                Next up: {dueSoonTasks[0].title} ({dueSoonTasks[0].courses.name}) — due {format(new Date(dueSoonTasks[0].due_date + 'T00:00:00'), 'EEE, MMM d')}
              </Text>
            ) : stats && stats.pending > 0 ? (
              <Text style={styles.emptySub}>
                You have {stats.pending} pending task{stats.pending > 1 ? 's' : ''} this semester. Check your courses for upcoming deadlines.
              </Text>
            ) : courses.length > 0 ? (
              <Text style={styles.emptySub}>
                No deadlines coming up. Scan a syllabus to import your assignments automatically.
              </Text>
            ) : (
              <Text style={styles.emptySub}>
                Get started by adding a semester and courses, or scan a syllabus.
              </Text>
            )}
          </View>
        )}

        {/* This Week */}
        <Text style={[styles.sectionTitle, { marginTop: 20, marginBottom: 10 }]}>This week</Text>
        <View style={styles.weekCard}>
          <View style={styles.weekStats}>
            <View style={styles.weekStat}>
              <Text style={styles.weekStatNum}>{weekTasks.length}</Text>
              <Text style={styles.weekStatLabel}>TASKS</Text>
            </View>
            <View style={styles.weekStat}>
              <Text style={styles.weekStatNum}>{weekExams}</Text>
              <Text style={styles.weekStatLabel}>EXAMS</Text>
            </View>
            <View style={styles.weekStat}>
              <Text style={[styles.weekStatNum, weekOverdue > 0 && { color: COLORS.coral }]}>{weekOverdue}</Text>
              <Text style={styles.weekStatLabel}>OVERDUE</Text>
            </View>
            <View style={styles.weekStat}>
              <Text style={styles.weekStatNum}>{courses.length}</Text>
              <Text style={styles.weekStatLabel}>COURSES</Text>
            </View>
          </View>
          {/* Bar chart */}
          <View style={styles.barChart}>
            {dayBuckets.map((count, i) => (
              <View key={i} style={styles.barCol}>
                <View style={[
                  styles.bar,
                  { height: `${Math.max((count / maxBucket) * 100, 5)}%` },
                  i === todayDayIndex
                    ? { backgroundColor: COLORS.brand }
                    : { backgroundColor: COLORS.brand100 },
                ]} />
              </View>
            ))}
          </View>
          <View style={styles.barLabels}>
            {dayLabels.map((l, i) => (
              <Text key={i} style={[styles.barLabel, i === todayDayIndex && { color: COLORS.brand, fontWeight: '600' }]}>{l}</Text>
            ))}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 18, paddingBottom: 120 },
  eyeLabel: { fontSize: 14, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', color: COLORS.ink3 },
  greeting: { fontSize: 26, fontWeight: '600', color: COLORS.ink, letterSpacing: -0.5, marginTop: 4, marginBottom: 2 },
  semesterLabel: { fontSize: 14, color: COLORS.ink3, fontWeight: '500', marginBottom: 16 },
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
  // Overdue
  overdueCard: { backgroundColor: '#fef2f2', borderRadius: 18, paddingHorizontal: 14, borderWidth: 0.5, borderColor: '#fecaca', marginBottom: 16 },
  overdueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  overdueBadge: { backgroundColor: '#fee2e2', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  overdueBadgeText: { fontSize: 12, fontWeight: '600', color: COLORS.coral },
  // Empty
  emptyCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 24, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.line },
  emptyText: { fontSize: 14, fontWeight: '500', color: COLORS.ink3 },
  emptySub: { fontSize: 14, color: COLORS.ink3, marginTop: 4 },
  // Week
  weekCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 14, borderWidth: 0.5, borderColor: COLORS.line },
  weekStats: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  weekStat: { alignItems: 'center' },
  weekStatNum: { fontSize: 20, fontWeight: '600', color: COLORS.ink },
  weekStatLabel: { fontSize: 14, color: COLORS.ink3, letterSpacing: 0.3 },
  barChart: { flexDirection: 'row', alignItems: 'flex-end', height: 34, gap: 4 },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { borderRadius: 3 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  barLabel: { flex: 1, textAlign: 'center', fontSize: 11, color: COLORS.ink3 },
});
