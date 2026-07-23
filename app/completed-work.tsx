import { useCallback, useMemo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { format } from 'date-fns';
import { useAppStore } from '@/store/appStore';
import { useTasks, type TaskWithCourse } from '@/lib/queries';
import { COLORS, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';

function completedSort(a: TaskWithCourse, b: TaskWithCourse) {
  return (b.completed_at || b.updated_at).localeCompare(a.completed_at || a.updated_at);
}

export default function CompletedWorkScreen() {
  const router = useRouter();
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const semesterId = useAppStore((state) => state.selectedSemesterId);
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useTasks(
    semesterId ? { semesterId, isCompleted: true } : { semesterId: null },
  );

  useFocusEffect(useCallback(() => {
    qc.invalidateQueries({ queryKey: ['tasks'] });
  }, [qc]));

  const { waiting, graded } = useMemo(() => {
    const completed = [...tasks].sort(completedSort);
    return {
      waiting: completed.filter((task) => task.score == null),
      graded: completed.filter((task) => task.score != null),
    };
  }, [tasks]);

  const openGrade = (task: TaskWithCourse) => {
    router.push({ pathname: '/task/[id]', params: { id: task.id, grade: '1' } } as any);
  };

  const renderTask = (task: TaskWithCourse, showBorder: boolean) => (
    <TouchableOpacity
      key={task.id}
      style={[styles.row, showBorder && { borderBottomWidth: 0.5, borderBottomColor: colors.line }]}
      onPress={() => openGrade(task)}
      activeOpacity={0.7}
    >
      <View style={[styles.statusIcon, { backgroundColor: task.score == null ? colors.amber50 : colors.teal50 }]}> 
        <FontAwesome name={task.score == null ? 'hourglass-half' : 'check'} size={12} color={task.score == null ? colors.amber : colors.teal} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.taskTitle, { color: colors.ink }]} numberOfLines={1}>{task.title}</Text>
        <View style={styles.meta}>
          <View style={[styles.dot, { backgroundColor: task.courses.color }]} />
          <Text style={[styles.metaText, { color: colors.ink3 }]} numberOfLines={1}>
            {task.courses.name}
            {task.completed_at ? ` · completed ${format(new Date(task.completed_at), 'MMM d')}` : ''}
          </Text>
        </View>
        {task.submitted_late && (
          <Text style={[styles.penalty, { color: colors.coral }]}> 
            Late{task.late_penalty_percent != null ? ` · ${task.late_penalty_percent}% expected penalty` : ''}
          </Text>
        )}
      </View>
      <View style={styles.gradeCol}>
        {task.score == null ? (
          <View style={[styles.addGrade, { backgroundColor: colors.brand50 }]}> 
            <Text style={[styles.addGradeText, { color: colors.brand }]}>Add grade</Text>
          </View>
        ) : (
          <>
            <Text style={[styles.score, { color: colors.teal }]}>{task.score}%</Text>
            <Text style={[styles.edit, { color: colors.brand }]}>Edit</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Completed Work' }} />
      {isLoading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.brand} /></View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} showsVerticalScrollIndicator={false}>
          <Text style={[styles.eyebrow, { color: colors.brand }]}>GRADES & PROGRESS</Text>
          <Text style={[styles.title, { color: colors.ink }]}>Completed work</Text>
          <Text style={[styles.subtitle, { color: colors.ink3 }]}>Add the grade when your instructor posts it. Course averages and your GPA estimate update immediately.</Text>

          <View style={[styles.summary, { backgroundColor: colors.brand }]}> 
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{waiting.length}</Text><Text style={styles.summaryLabel}>WAITING FOR GRADES</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}><Text style={styles.summaryValue}>{graded.length}</Text><Text style={styles.summaryLabel}>GRADED</Text></View>
          </View>

          {waiting.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Waiting for grades</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}> 
                {waiting.map((task, index) => renderTask(task, index < waiting.length - 1))}
              </View>
            </>
          )}

          {graded.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Graded</Text>
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}> 
                {graded.map((task, index) => renderTask(task, index < graded.length - 1))}
              </View>
            </>
          )}

          {tasks.length === 0 && (
            <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.line }]}> 
              <FontAwesome name="check-circle-o" size={28} color={colors.ink3} />
              <Text style={[styles.emptyTitle, { color: colors.ink }]}>No completed work yet</Text>
              <Text style={[styles.emptyText, { color: colors.ink3 }]}>Completed assignments will stay organized here until you add their grades.</Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 20, paddingBottom: 70, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { fontFamily: FONTS.display, fontSize: 31, marginTop: 5 },
  subtitle: { fontSize: 13.5, lineHeight: 20, marginTop: 6, marginBottom: 18 },
  summary: { borderRadius: 18, paddingVertical: 18, paddingHorizontal: 12, flexDirection: 'row', marginBottom: 20 },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryValue: { color: '#fff', fontSize: 24, fontWeight: '900' },
  summaryLabel: { color: 'rgba(255,255,255,0.72)', fontSize: 9.5, fontWeight: '800', marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  sectionTitle: { fontFamily: FONTS.displaySemibold, fontSize: 18, marginBottom: 9, marginTop: 5 },
  card: { borderRadius: 18, borderWidth: 0.5, marginBottom: 18, overflow: 'hidden' },
  row: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 11, padding: 14 },
  statusIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  taskTitle: { fontSize: 14.5, fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  metaText: { flex: 1, fontSize: 11.5, fontWeight: '500' },
  penalty: { fontSize: 10.5, fontWeight: '700', marginTop: 3 },
  gradeCol: { alignItems: 'flex-end', gap: 2 },
  addGrade: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
  addGradeText: { fontSize: 11.5, fontWeight: '800' },
  score: { fontSize: 17, fontWeight: '900' },
  edit: { fontSize: 10.5, fontWeight: '700' },
  empty: { borderRadius: 18, borderWidth: 0.5, padding: 28, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 10 },
  emptyText: { fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 5 },
});
