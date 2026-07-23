import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSemesters, useTasks, useToggleTaskComplete } from '@/lib/queries';
import { useAppStore } from '@/store/appStore';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { TaskItem } from '@/components/TaskItem';
import { SCREEN_MAX_WIDTH, TASK_TYPES, TASK_TYPE_LABELS, type TaskType } from '@/lib/constants';
import type { TaskPriority } from '@/types/database';

type StatusFilter = 'all' | 'open' | 'completed';

export default function TaskSearchScreen() {
  const router = useRouter();
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const semesterId = useAppStore((state) => state.selectedSemesterId);
  const { data: semesters = [] } = useSemesters();
  // Search is intentionally account-wide. Students often remember a task
  // but not which semester it was filed under.
  const { data: tasks = [], isLoading } = useTasks();
  const toggleTask = useToggleTaskComplete();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [priority, setPriority] = useState<TaskPriority | 'all'>('all');
  const [semesterScope, setSemesterScope] = useState<'all' | 'current'>('all');
  const [courseId, setCourseId] = useState<string | 'all'>('all');
  const [type, setType] = useState<TaskType | 'all'>('all');
  const activeSemester = semesters.find((semester) => semester.id === semesterId);
  const semesterNames = useMemo(
    () => new Map(semesters.map((semester) => [semester.id, semester.name])),
    [semesters],
  );

  // Derive the course filter options from the loaded tasks (search is
  // account-wide, so we can't lean on the single-semester useCourses hook).
  // Respect the semester scope so the chips only offer courses the current
  // scope can actually surface.
  const courseOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const task of tasks) {
      if (semesterScope === 'current' && task.courses.semester_id !== semesterId) continue;
      if (!byId.has(task.course_id)) byId.set(task.course_id, task.courses.name);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, semesterScope, semesterId]);

  // A course chosen under one scope may vanish when the scope changes; drop the
  // stale selection so the filter can't silently hide every result.
  const activeCourseId = courseId !== 'all' && courseOptions.some((c) => c.id === courseId) ? courseId : 'all';

  const results = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return tasks.filter((task) => {
      const matchesText = !needle || [
        task.title,
        task.description,
        task.courses.name,
        task.type,
        semesterNames.get(task.courses.semester_id),
      ]
        .some((value) => value?.toLocaleLowerCase().includes(needle));
      const matchesStatus = status === 'all' || (status === 'open' ? !task.is_completed : task.is_completed);
      const matchesPriority = priority === 'all' || (task.priority || 'normal') === priority;
      const matchesSemester = semesterScope === 'all' || task.courses.semester_id === semesterId;
      const matchesCourse = activeCourseId === 'all' || task.course_id === activeCourseId;
      const matchesType = type === 'all' || task.type === type;
      return matchesText && matchesStatus && matchesPriority && matchesSemester && matchesCourse && matchesType;
    });
  }, [tasks, query, status, priority, semesterScope, semesterId, semesterNames, activeCourseId, type]);

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={label}
      style={[styles.chip, { borderColor: colors.line }, selected && { backgroundColor: colors.brand, borderColor: colors.brand }]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, { color: selected ? '#fff' : colors.ink2 }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <View style={[styles.content, { maxWidth: contentMaxWidth }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <FontAwesome name="search" size={16} color={colors.ink3} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Search tasks, courses, or notes"
            placeholderTextColor={colors.ink3}
            style={[styles.input, { color: colors.ink }]}
            returnKeyType="search"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <FontAwesome name="times-circle" size={16} color={colors.ink3} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.scopeRow}>
          {chip('All semesters', semesterScope === 'all', () => setSemesterScope('all'))}
          {semesterId && chip(
            activeSemester?.name || 'Current semester',
            semesterScope === 'current',
            () => setSemesterScope('current'),
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {chip('All', status === 'all', () => setStatus('all'))}
          {chip('Open', status === 'open', () => setStatus('open'))}
          {chip('Completed', status === 'completed', () => setStatus('completed'))}
          {chip('High priority', priority === 'high', () => setPriority(priority === 'high' ? 'all' : 'high'))}
          {chip('Normal priority', priority === 'normal', () => setPriority(priority === 'normal' ? 'all' : 'normal'))}
          {chip('Low priority', priority === 'low', () => setPriority(priority === 'low' ? 'all' : 'low'))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {chip('Any type', type === 'all', () => setType('all'))}
          {TASK_TYPES.map((taskType) =>
            chip(TASK_TYPE_LABELS[taskType], type === taskType, () => setType(type === taskType ? 'all' : taskType)),
          )}
        </ScrollView>

        {courseOptions.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {chip('All courses', activeCourseId === 'all', () => setCourseId('all'))}
            {courseOptions.map((course) =>
              chip(course.name, activeCourseId === course.id, () => setCourseId(activeCourseId === course.id ? 'all' : course.id)),
            )}
          </ScrollView>
        )}

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
        ) : (
          <ScrollView contentContainerStyle={styles.results} keyboardShouldPersistTaps="handled">
            <Text style={[styles.count, { color: colors.ink3 }]}>{results.length} {results.length === 1 ? 'task' : 'tasks'}</Text>
            {results.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onPress={() => router.push(`/task/${task.id}` as any)}
                onToggle={(options) => toggleTask.mutate({
                  id: task.id,
                  is_completed: !task.is_completed,
                  submitted_late: options?.submitted_late,
                  late_penalty_percent: options?.late_penalty_percent,
                })}
              />
            ))}
            {results.length === 0 && (
              <View style={styles.empty}>
                <FontAwesome name="search" size={28} color={colors.ink3} />
                <Text style={[styles.emptyTitle, { color: colors.ink }]}>No matching tasks</Text>
                <Text style={[styles.emptyText, { color: colors.ink3 }]}>Try a course name, task title, or different filter.</Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 14 },
  searchBox: { height: 50, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 14 },
  input: { flex: 1, fontSize: 15, height: '100%' },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 12 },
  filters: { gap: 8, paddingVertical: 10 },
  chip: { height: 36, borderRadius: 10, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 12 },
  chipText: { fontSize: 12, fontWeight: '700' },
  results: { paddingBottom: 50 },
  count: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 30 },
  emptyTitle: { marginTop: 12, fontSize: 17, fontWeight: '700' },
  emptyText: { marginTop: 5, fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
