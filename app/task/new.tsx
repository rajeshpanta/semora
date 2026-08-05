import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text, TextInput } from '@/components/LocalizedReactNative';
import {
  useEffect,
  useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { useCreateTask, useCourses, useGradeCategories } from '@/lib/queries';
import { useAppStore } from '@/store/appStore';
import { TASK_TYPES, TASK_TYPE_LABELS, COLORS, SCREEN_MAX_WIDTH, type TaskType } from '@/lib/constants';
import { DatePicker } from '@/components/DatePicker';
import { TaskPlanningFields } from '@/components/TaskPlanningFields';
import { useColors } from '@/lib/theme';
import { useResponsive, gridItemBasis } from '@/lib/responsive';
import { formatLocalDate } from '@/lib/dates';
import type { RecurrenceFrequency, TaskPriority } from '@/types/database';

export default function NewTaskScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ courseId?: string; defaultDate?: string }>();
  const createTask = useCreateTask();
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const { data: courses = [] } = useCourses(selectedSemesterId);

  const [courseId, setCourseId] = useState(params.courseId || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<TaskType>('assignment');
  // Optional defaultDate=today prefill for quick-add from the Today tab.
  // Falls through to null otherwise so the existing manual flow is unchanged.
  const [dueDate, setDueDate] = useState<Date | null>(
    params.defaultDate === 'today' ? new Date() : null,
  );
  const [dueTime, setDueTime] = useState<Date | null>(null);
  const [weight, setWeight] = useState('');
  const [gradeCategoryId, setGradeCategoryId] = useState<string | null>(null);
  const [isExtraCredit, setIsExtraCredit] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [recurrence, setRecurrence] = useState<RecurrenceFrequency | null>(null);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<Date | null>(null);
  const [reminderOffsets, setReminderOffsets] = useState<number[] | null>(null);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>([]);

  const selectedCourse = courses.find((c) => c.id === courseId);
  const { data: gradeCategories = [] } = useGradeCategories(courseId);
  const colors = useColors();
  const { contentMaxWidth, isWide, columns, width } = useResponsive();

  // A one-course semester has no meaningful choice to make. Preselect it so
  // quick-add never lets the student fill the entire form only to hit a
  // "Please select a course" alert at the end.
  useEffect(() => {
    if (!courseId && courses.length === 1) setCourseId(courses[0].id);
  }, [courseId, courses]);

  useEffect(() => {
    if (gradeCategoryId && !gradeCategories.some((category) => category.id === gradeCategoryId)) {
      setGradeCategoryId(null);
    }
  }, [gradeCategoryId, gradeCategories]);

  const handleSubmit = async () => {
    if (!courseId) {
      Alert.alert('Required', 'Please select a course.');
      return;
    }
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter a title.');
      return;
    }
    if (!dueDate) {
      Alert.alert('Required', 'Please select a due date.');
      return;
    }
    if (weight.trim()) {
      const w = parseFloat(weight);
      if (isNaN(w) || w < 0 || w > 100) {
        Alert.alert('Invalid weight', 'Please enter a weight between 0 and 100.');
        return;
      }
    }
    if (startDate && formatLocalDate(startDate) > formatLocalDate(dueDate)) {
      Alert.alert('Invalid start date', 'The start date must be on or before the due date.');
      return;
    }
    if (recurrence && recurrenceEndDate && formatLocalDate(recurrenceEndDate) < formatLocalDate(dueDate)) {
      Alert.alert('Invalid repeat date', 'The repeat end date must be on or after the due date.');
      return;
    }

    // Treat text still sitting in the subtask box as an intended final step.
    // Requiring a separate tap on + before Add Task made that draft vanish.
    const submittedSubtasks = [
      ...subtasks,
      ...(subtaskInput.trim() ? [subtaskInput.trim()] : []),
    ];

    try {
      await createTask.mutateAsync({
        course_id: courseId,
        title: title.trim(),
        description: description.trim() || null,
        type,
        due_date: formatLocalDate(dueDate),
        due_time: dueTime
          ? `${String(dueTime.getHours()).padStart(2, '0')}:${String(dueTime.getMinutes()).padStart(2, '0')}:00`
          : null,
        weight: weight.trim() ? parseFloat(weight) : null,
        grade_category_id: gradeCategoryId,
        is_extra_credit: isExtraCredit,
        priority,
        estimated_minutes: estimatedMinutes,
        start_date: startDate ? formatLocalDate(startDate) : null,
        recurrence_frequency: recurrence,
        recurrence_end_date: recurrence && recurrenceEndDate ? formatLocalDate(recurrenceEndDate) : null,
        reminder_offsets_minutes: reminderOffsets,
        _subtasks: submittedSubtasks,
        _courseName: selectedCourse?.name,
      } as any);
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Keyboard.dismiss();
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create task.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} keyboardShouldPersistTaps="always">
        <View style={[styles.card, { padding: width < 360 ? 16 : 24, backgroundColor: colors.card, borderColor: colors.line }]}>
          {/* Course picker */}
          <Text style={[styles.label, { color: colors.ink2 }]}>Course *</Text>
          {courses.length > 0 ? (
            isWide ? (
              // iPad/wide: wrap courses into a 2-3 column grid instead of an
              // iPhone-style horizontal scroll, so they fill the width.
              <View style={styles.courseWrap}>
                {courses.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.courseChip,
                      styles.courseChipWide,
                      { flexBasis: gridItemBasis(columns) },
                      { borderColor: colors.line, backgroundColor: colors.card },
                      courseId === c.id && { backgroundColor: c.color, borderColor: c.color },
                    ]}
                    onPress={() => setCourseId(c.id)}
                    activeOpacity={0.7}
                  >
                    <FontAwesome
                      name={c.icon as any}
                      size={12}
                      color={courseId === c.id ? '#fff' : c.color}
                    />
                    <Text
                      style={[styles.courseChipText, { color: colors.ink2 }, courseId === c.id && { color: '#fff' }]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.courseRow}>
                  {courses.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        styles.courseChip,
                        { borderColor: colors.line, backgroundColor: colors.card },
                        courseId === c.id && { backgroundColor: c.color, borderColor: c.color },
                      ]}
                      onPress={() => setCourseId(c.id)}
                      activeOpacity={0.7}
                    >
                      <FontAwesome
                        name={c.icon as any}
                        size={12}
                        color={courseId === c.id ? '#fff' : c.color}
                      />
                      <Text
                        style={[styles.courseChipText, { color: colors.ink2 }, courseId === c.id && { color: '#fff' }]}
                        numberOfLines={1}
                      >
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )
          ) : (
            <Text style={[styles.hint, { color: colors.ink3 }]}>Add a course first</Text>
          )}

          {/* Title */}
          <Text style={[styles.label, { color: colors.ink2 }]}>Title *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
            placeholder="e.g. Homework 3"
            placeholderTextColor={colors.ink3}
            value={title}
            onChangeText={setTitle}
          />

          {gradeCategories.length > 0 && (
            <>
              <Text style={[styles.label, { color: colors.ink2 }]}>Grade category</Text>
              <View style={styles.typeRow}>
                {gradeCategories.map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={[styles.typeChip, gradeCategoryId === category.id && { backgroundColor: colors.brand }]}
                    onPress={() => setGradeCategoryId(gradeCategoryId === category.id ? null : category.id)}
                  >
                    <Text style={[styles.typeChipText, { color: colors.ink2 }, gradeCategoryId === category.id && styles.typeChipTextActive]}>
                      {category.name} · {category.weight_percent}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!isExtraCredit && (
                <Text style={[styles.hint, { color: colors.ink3, marginTop: 5 }]}>Category rules override the individual weight for regular grade calculations.</Text>
              )}
            </>
          )}

          {/* Description */}
          <Text style={[styles.label, { color: colors.ink2 }]}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
            placeholder="Add notes..."
            placeholderTextColor={colors.ink3}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Type */}
          <Text style={[styles.label, { color: colors.ink2 }]}>Type</Text>
          <View style={styles.typeRow}>
            {TASK_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.typeChip,
                  isWide && styles.typeChipWide,
                  isWide && { flexBasis: gridItemBasis(columns) },
                  type === t && { backgroundColor: colors.brand },
                ]}
                onPress={() => setType(t)}
                activeOpacity={0.7}
              >
                <Text style={[styles.typeChipText, { color: colors.ink2 }, type === t && styles.typeChipTextActive]}>
                  {TASK_TYPE_LABELS[t]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Due Date & Time */}
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.ink2 }]}>Due Date *</Text>
              <DatePicker value={dueDate} onChange={setDueDate} mode="date" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.ink2 }]}>Time</Text>
              <DatePicker value={dueTime} onChange={setDueTime} onClear={() => setDueTime(null)} mode="time" placeholder="Optional" />
            </View>
          </View>

          {/* Weight. For extra credit this is the BONUS point value, which even
              a categorized 'bonus' course needs — the grade math scales it by
              the score. So we relabel instead of hiding it behind categories. */}
          <Text style={[styles.label, { color: colors.ink2 }]}>{isExtraCredit ? 'Extra credit worth (% points)' : 'Weight (%)'}</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
            placeholder={isExtraCredit ? 'e.g. 5' : 'e.g. 10'}
            placeholderTextColor={colors.ink3}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
          />
          {isExtraCredit && (
            <Text style={[styles.hint, { color: colors.ink3, marginTop: 5 }]}>Bonus points added on top of your course grade, scaled by your score.</Text>
          )}

          {/* Extra Credit */}
          <TouchableOpacity
            style={styles.ecRow}
            onPress={() => setIsExtraCredit(!isExtraCredit)}
            activeOpacity={0.7}
          >
            <View style={[styles.ecCheck, { borderColor: colors.line }, isExtraCredit && { backgroundColor: colors.brand, borderColor: colors.brand }]}>
              {isExtraCredit && <FontAwesome name="check" size={11} color="#fff" />}
            </View>
            <Text style={[styles.ecLabel, { color: colors.ink }]}>Extra Credit</Text>
            <Text style={[styles.ecHint, { color: colors.ink3 }]}>Won't count against total weight</Text>
          </TouchableOpacity>

          <TaskPlanningFields
            priority={priority}
            onPriorityChange={setPriority}
            estimatedMinutes={estimatedMinutes}
            onEstimatedMinutesChange={setEstimatedMinutes}
            startDate={startDate}
            onStartDateChange={setStartDate}
            recurrence={recurrence}
            onRecurrenceChange={(value) => {
              setRecurrence(value);
              if (!value) setRecurrenceEndDate(null);
            }}
            recurrenceEndDate={recurrenceEndDate}
            onRecurrenceEndDateChange={setRecurrenceEndDate}
            dueDate={dueDate}
            dueTime={dueTime}
            reminderOffsets={reminderOffsets}
            onReminderOffsetsChange={setReminderOffsets}
          />

          <Text style={[styles.label, { color: colors.ink2 }]}>Subtasks</Text>
          <Text style={[styles.hint, { color: colors.ink3 }]}>Break the work into small, checkable steps.</Text>
          {subtasks.map((subtask, index) => (
            <View key={`${subtask}-${index}`} style={[styles.subtaskRow, { borderColor: colors.line }]}>
              <FontAwesome name="circle-o" size={12} color={colors.ink3} />
              <Text style={[styles.subtaskText, { color: colors.ink }]}>{subtask}</Text>
              <TouchableOpacity onPress={() => setSubtasks((items) => items.filter((_, i) => i !== index))} hitSlop={8}>
                <FontAwesome name="times" size={14} color={colors.ink3} />
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.subtaskInputRow}>
            <TextInput
              style={[styles.input, { flex: 1, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
              placeholder="Add a step"
              placeholderTextColor={colors.ink3}
              value={subtaskInput}
              onChangeText={setSubtaskInput}
              maxLength={240}
              onSubmitEditing={() => {
                if (subtaskInput.trim()) {
                  setSubtasks((items) => [...items, subtaskInput.trim()]);
                  setSubtaskInput('');
                }
              }}
            />
            <TouchableOpacity
              style={[styles.subtaskAdd, { backgroundColor: colors.brand }]}
              onPress={() => {
                if (subtaskInput.trim()) {
                  setSubtasks((items) => [...items, subtaskInput.trim()]);
                  setSubtaskInput('');
                }
              }}
            >
              <FontAwesome name="plus" size={14} color="#fff" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.button,
              { backgroundColor: colors.brand },
              selectedCourse && { backgroundColor: selectedCourse.color },
              createTask.isPending && styles.buttonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={createTask.isPending}
            activeOpacity={0.8}
          >
            {createTask.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <FontAwesome name="plus" size={14} color="#fff" />
                <Text style={styles.buttonText}>Add Task</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 40, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#edf0f7' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  hint: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
  input: { height: 48, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#fafafa', paddingHorizontal: 16, fontSize: 15, color: '#111' },
  textArea: { height: 80, paddingTop: 12 },
  courseRow: { flexDirection: 'row', gap: 8 },
  courseWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  courseChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fafafa' },
  courseChipWide: { flexGrow: 1 },
  courseChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' },
  typeChipWide: { flexGrow: 1, alignItems: 'center' },
  typeChipActive: { backgroundColor: COLORS.brand },
  typeChipText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  typeChipTextActive: { color: '#fff' },
  dateRow: { flexDirection: 'row', gap: 12 },
  ecRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingVertical: 4 },
  ecCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#d1d5db', justifyContent: 'center', alignItems: 'center' },
  ecCheckActive: { backgroundColor: COLORS.brand, borderColor: COLORS.brand },
  ecLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  ecHint: { flex: 1, fontSize: 11, color: '#94a3b8', textAlign: 'right' },
  button: { flexDirection: 'row', height: 50, backgroundColor: COLORS.brand, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 24, gap: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  subtaskRow: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: 1 },
  subtaskText: { flex: 1, fontSize: 14 },
  subtaskInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  subtaskAdd: { width: 44, height: 44, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
});
