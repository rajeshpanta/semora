import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { useCreateTask, useCourses } from '@/lib/queries';
import { useAppStore } from '@/store/appStore';
import { TASK_TYPES, TASK_TYPE_LABELS, COLORS, type TaskType } from '@/lib/constants';
import { DatePicker } from '@/components/DatePicker';
import { useColors } from '@/lib/theme';
import { formatLocalDate } from '@/lib/dates';

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
  const [isExtraCredit, setIsExtraCredit] = useState(false);

  const selectedCourse = courses.find((c) => c.id === courseId);
  const colors = useColors();

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

    try {
      await createTask.mutateAsync({
        course_id: courseId,
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        due_date: formatLocalDate(dueDate),
        due_time: dueTime
          ? `${String(dueTime.getHours()).padStart(2, '0')}:${String(dueTime.getMinutes()).padStart(2, '0')}:00`
          : undefined,
        weight: weight ? parseFloat(weight) : undefined,
        is_extra_credit: isExtraCredit,
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {/* Course picker */}
          <Text style={[styles.label, { color: colors.ink2 }]}>Course *</Text>
          {courses.length > 0 ? (
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
                style={[styles.typeChip, type === t && { backgroundColor: colors.brand }]}
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
              <DatePicker value={dueTime} onChange={setDueTime} mode="time" placeholder="Optional" />
            </View>
          </View>

          {/* Weight */}
          <Text style={[styles.label, { color: colors.ink2 }]}>Weight (%)</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
            placeholder="e.g. 10"
            placeholderTextColor={colors.ink3}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
          />

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
  content: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#edf0f7' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  hint: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
  input: { height: 48, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#fafafa', paddingHorizontal: 16, fontSize: 15, color: '#111' },
  textArea: { height: 80, paddingTop: 12 },
  courseRow: { flexDirection: 'row', gap: 8 },
  courseChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fafafa' },
  courseChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' },
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
});
