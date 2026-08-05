import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text, TextInput } from '@/components/LocalizedReactNative';
import {
  useEffect,
  useRef,
  useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Keyboard,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { format, isPast, isToday } from 'date-fns';
import {
  useTask, useUpdateTask, useDeleteTask, useToggleTaskComplete,
  useTaskSubtasks, useCreateTaskSubtask, useToggleTaskSubtask, useDeleteTaskSubtask,
  useGradeCategories,
} from '@/lib/queries';
import { TASK_TYPE_LABELS, TASK_TYPES, COLORS, SCREEN_MAX_WIDTH, type TaskType } from '@/lib/constants';
import { DatePicker } from '@/components/DatePicker';
import { NotFound } from '@/components/NotFound';
import { useColors } from '@/lib/theme';
import { useResponsive, gridItemBasis } from '@/lib/responsive';
import { formatLocalDate } from '@/lib/dates';
import { track } from '@/lib/analytics';
import { TaskPlanningFields } from '@/components/TaskPlanningFields';
import { recurrenceLabel, reminderSummary } from '@/lib/taskPlanning';
import type { RecurrenceFrequency, TaskPriority } from '@/types/database';
import { estimateTaskMinutes, formatStudyDuration } from '@/lib/studyPlanner';
import { useTaskCompletionFlow } from '@/components/TaskCompletionFlow';

export default function TaskDetailScreen() {
  const { id, grade } = useLocalSearchParams<{ id: string; grade?: string }>();
  const router = useRouter();
  const { data: task, isLoading, isError } = useTask(id!);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const toggleComplete = useToggleTaskComplete();
  const { data: subtasks = [] } = useTaskSubtasks(id!);
  const { data: gradeCategories = [] } = useGradeCategories(task?.course_id);
  const createSubtask = useCreateTaskSubtask();
  const toggleSubtask = useToggleTaskSubtask();
  const deleteSubtask = useDeleteTaskSubtask();

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState<TaskType>('assignment');
  const [editDueDate, setEditDueDate] = useState<Date | null>(null);
  const [editDueTime, setEditDueTime] = useState<Date | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [editGradeCategoryId, setEditGradeCategoryId] = useState<string | null>(null);
  const [editPriority, setEditPriority] = useState<TaskPriority>('normal');
  const [editEstimatedMinutes, setEditEstimatedMinutes] = useState<number | null>(null);
  const [editStartDate, setEditStartDate] = useState<Date | null>(null);
  const [editRecurrence, setEditRecurrence] = useState<RecurrenceFrequency | null>(null);
  const [editRecurrenceEndDate, setEditRecurrenceEndDate] = useState<Date | null>(null);
  const [editReminderOffsets, setEditReminderOffsets] = useState<number[] | null>(null);
  const [subtaskInput, setSubtaskInput] = useState('');
  const [scoreInput, setScoreInput] = useState('');
  const [scorePossible, setScorePossible] = useState('');
  const [scoreMode, setScoreMode] = useState<'percent' | 'points'>('points');
  const [showScoreInput, setShowScoreInput] = useState(false);
  const gradeDeepLinkOpened = useRef(false);
  const { confirmCompletion, confirmLatePenalty } = useTaskCompletionFlow();
  const colors = useColors();
  const { contentMaxWidth, isWide, width, columns } = useResponsive();

  useEffect(() => {
    if (!task || grade !== '1' || gradeDeepLinkOpened.current) return;
    if (!task.is_completed && task.score == null) return;
    gradeDeepLinkOpened.current = true;
    if (task.points_earned != null && task.points_possible != null) {
      setScoreMode('points');
      setScoreInput(String(task.points_earned));
      setScorePossible(String(task.points_possible));
    } else if (task.score != null) {
      setScoreMode('percent');
      setScoreInput(String(task.score));
    }
    setShowScoreInput(true);
  }, [task, grade]);

  if (isLoading) {
    return <View style={[styles.loading, { backgroundColor: colors.paper }]}><ActivityIndicator size="large" color={colors.brand} /></View>;
  }
  if (isError || !task || !task.courses) {
    return <NotFound title="Task unavailable" message="This task couldn't be loaded. It may have been deleted." onBack={() => router.back()} />;
  }

  const courseColor = task.courses.color;
  const dueDate = new Date(task.due_date + 'T00:00:00');
  const overdue = !task.is_completed && isPast(dueDate) && !isToday(dueDate);

  const startEdit = () => {
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditType(task.type);
    setEditDueDate(new Date(task.due_date + 'T00:00:00'));
    if (task.due_time) {
      const [h, m] = task.due_time.split(':');
      const d = new Date(); d.setHours(+h, +m, 0, 0);
      setEditDueTime(d);
    } else {
      setEditDueTime(null);
    }
    setEditWeight(task.weight != null ? String(task.weight) : '');
    setEditGradeCategoryId(task.grade_category_id);
    setEditPriority(task.priority || 'normal');
    setEditEstimatedMinutes(task.estimated_minutes ?? null);
    setEditStartDate(task.start_date ? new Date(task.start_date + 'T00:00:00') : null);
    setEditRecurrence(task.recurrence_frequency || null);
    setEditRecurrenceEndDate(task.recurrence_end_date ? new Date(task.recurrence_end_date + 'T00:00:00') : null);
    setEditReminderOffsets(task.reminder_offsets_minutes ?? null);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!editTitle.trim()) {
      Alert.alert('Required', 'Please enter a task title.');
      return;
    }
    if (editWeight.trim()) {
      const w = parseFloat(editWeight);
      if (isNaN(w) || w < 0 || w > 100) {
        Alert.alert('Invalid weight', 'Please enter a weight between 0 and 100.');
        return;
      }
    }
    if (!editDueDate) {
      Alert.alert('Required', 'Please select a due date.');
      return;
    }
    if (editStartDate && formatLocalDate(editStartDate) > formatLocalDate(editDueDate)) {
      Alert.alert('Invalid start date', 'The start date must be on or before the due date.');
      return;
    }
    if (editRecurrence && editRecurrenceEndDate && formatLocalDate(editRecurrenceEndDate) < formatLocalDate(editDueDate)) {
      Alert.alert('Invalid repeat date', 'The repeat end date must be on or after the due date.');
      return;
    }
    const applyEdit = async (scope: 'occurrence' | 'future' | 'all') => {
      try {
        await updateTask.mutateAsync({
        id: task.id,
        _seriesScope: scope,
        title: editTitle.trim(),
        // Send explicit null (not undefined) for cleared fields — PostgREST
        // omits undefined keys, so undefined silently keeps the old value
        // when the user clears a time/weight/description on an edit.
        description: editDescription.trim() || null,
        type: editType,
        due_date: formatLocalDate(editDueDate!),
        due_time: editDueTime
          ? `${String(editDueTime.getHours()).padStart(2, '0')}:${String(editDueTime.getMinutes()).padStart(2, '0')}:00`
          : null,
        weight: editWeight.trim() ? parseFloat(editWeight) : null,
        grade_category_id: editGradeCategoryId,
        priority: editPriority,
        estimated_minutes: editEstimatedMinutes,
        start_date: editStartDate ? formatLocalDate(editStartDate) : null,
        recurrence_frequency: editRecurrence,
        recurrence_end_date: editRecurrence && editRecurrenceEndDate ? formatLocalDate(editRecurrenceEndDate) : null,
        reminder_offsets_minutes: editReminderOffsets,
        });
        Keyboard.dismiss();
        if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setEditing(false);
      } catch (err: any) {
        Alert.alert('Error', err.message);
      }
    };

    if (task.recurrence_frequency && task.recurrence_series_id) {
      Alert.alert(
        'Update recurring task',
        'Which occurrences should receive these changes?',
        [
          { text: 'This task only', onPress: () => applyEdit('occurrence') },
          { text: 'This and future', onPress: () => applyEdit('future') },
          { text: 'Entire series', onPress: () => applyEdit('all') },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    await applyEdit('occurrence');
  };

  const handleToggle = async () => {
    const completing = !task.is_completed;
    const decision = completing ? await confirmCompletion(task) : null;
    if (completing && !decision) return;

    try {
      await toggleComplete.mutateAsync({
        id: task.id,
        is_completed: completing,
        ...(decision || {}),
      });
      // Haptic AFTER the mutation succeeds — firing it first gives false
      // success/warning feedback when the toggle actually fails.
      if (Platform.OS === 'ios') {
        const feedback = completing && decision?.submitted_late
          ? Haptics.NotificationFeedbackType.Warning
          : completing
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning;
        Haptics.notificationAsync(feedback);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to update task.');
    }
  };

  const handleToggleLate = async () => {
    const nextLate = !task.submitted_late;
    try {
      const decision = nextLate ? await confirmLatePenalty(task) : null;
      if (nextLate && !decision) return;
      // This is a metadata correction, not another completion. Use the normal
      // task update so it does not replay the celebration or completion count.
      await updateTask.mutateAsync({
        id: task.id,
        submitted_late: nextLate,
        late_penalty_percent: nextLate ? decision!.late_penalty_percent : null,
      });
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(nextLate ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to update task.');
    }
  };

  const handleSaveScore = async () => {
    let score: number;
    let pointsEarned: number | null = null;
    let pointsPossible: number | null = null;

    if (scoreMode === 'points') {
      const earned = parseFloat(scoreInput);
      // Points possible is the raw total on THIS assignment — never the grade
      // weight. A 20%-weighted exam can still be scored out of 50 points.
      const possible = parseFloat(scorePossible);
      if (isNaN(earned) || earned < 0) {
        Alert.alert('Invalid', 'Please enter points earned.');
        return;
      }
      if (isNaN(possible) || possible <= 0) {
        Alert.alert('Invalid', 'Please enter total points possible.');
        return;
      }
      if (!task.is_extra_credit && earned > possible) {
        Alert.alert('Invalid', 'Points earned can\'t exceed the total (mark it extra credit if it can).');
        return;
      }
      score = parseFloat(((earned / possible) * 100).toFixed(2));
      pointsEarned = earned;
      pointsPossible = possible;
    } else {
      score = parseFloat(scoreInput);
      if (isNaN(score) || score < 0 || score > 100) {
        Alert.alert('Invalid', 'Please enter a percentage between 0 and 100.');
        return;
      }
    }

    try {
      await updateTask.mutateAsync({
        id: task.id,
        score,
        points_earned: pointsEarned,
        points_possible: pointsPossible,
      });
      Keyboard.dismiss();
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowScoreInput(false);
      setScoreInput('');
      setScorePossible('');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Task', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteTask.mutateAsync(task.id); router.back(); } catch (err: any) { Alert.alert('Delete Failed', err.message ?? 'Something went wrong. Please try again.'); } } },
    ]);
  };

  const handleAddSubtask = async () => {
    const title = subtaskInput.trim();
    if (!title) return;
    try {
      await createSubtask.mutateAsync({ task_id: task.id, title, position: subtasks.length });
      setSubtaskInput('');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to add subtask.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} keyboardShouldPersistTaps="always">
        {/* Course strip */}
        <View style={[styles.courseStrip, { backgroundColor: courseColor + '15' }]}>
          <View style={[styles.courseDot, { backgroundColor: courseColor }]} />
          <Text style={[styles.courseName, { color: courseColor }]} numberOfLines={1} ellipsizeMode="tail">{task.courses.name}</Text>
          <View style={styles.badges}>
            <View style={styles.typeBadge}><Text style={[styles.typeText, { color: colors.ink2 }]}>{TASK_TYPE_LABELS[task.type]}</Text></View>
            {task.is_extra_credit && <View style={[styles.ecBadge, { backgroundColor: colors.brand50 }]}><Text style={[styles.ecBadgeText, { color: colors.brand }]}>EC</Text></View>}
            {task.submitted_late && <View style={styles.lateBadge}><Text style={styles.lateBadgeText}>LATE</Text></View>}
          </View>
        </View>

        {/* Main card */}
        <View style={[styles.card, width < 360 && styles.cardNarrow, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {editing ? (
            <>
              <TextInput style={[styles.editInput, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]} value={editTitle} onChangeText={setEditTitle} placeholder="Title" placeholderTextColor={colors.ink3} />
              <TextInput style={[styles.editInput, { height: 80, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]} value={editDescription} onChangeText={setEditDescription} placeholder="Description" placeholderTextColor={colors.ink3} multiline textAlignVertical="top" />
              <Text style={[styles.editLabel, { color: colors.ink2 }]}>Type</Text>
              <View style={[styles.typeRow, isWide && styles.typeRowWide]}>
                {TASK_TYPES.map((t) => (
                  <TouchableOpacity key={t} style={[styles.typeChip, isWide && styles.typeChipWide, isWide && { flexBasis: gridItemBasis(columns), maxWidth: columns >= 3 ? '32%' : '49%' }, editType === t && { backgroundColor: colors.brand }]} onPress={() => setEditType(t)}>
                    <Text style={[styles.typeChipText, { color: colors.ink2 }, editType === t && { color: '#fff' }]} numberOfLines={1}>{TASK_TYPE_LABELS[t]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}><Text style={[styles.editLabel, { color: colors.ink2 }]}>Due Date</Text><DatePicker value={editDueDate} onChange={setEditDueDate} mode="date" /></View>
                <View style={{ flex: 1 }}><Text style={[styles.editLabel, { color: colors.ink2 }]}>Time</Text><DatePicker value={editDueTime} onChange={setEditDueTime} onClear={() => setEditDueTime(null)} mode="time" placeholder="Optional" /></View>
              </View>
              {/* For extra credit this weight is the BONUS point value the grade
                  math scales by score — used even in a categorized course — so we
                  relabel it rather than implying the category overrides it. */}
              <Text style={[styles.editLabel, { color: colors.ink2 }]}>{task.is_extra_credit ? 'Extra credit worth (% points)' : 'Weight (%)'}</Text>
              <TextInput style={[styles.editInput, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]} value={editWeight} onChangeText={setEditWeight} keyboardType="decimal-pad" placeholder={task.is_extra_credit ? 'e.g. 5' : 'Optional'} placeholderTextColor={colors.ink3} />
              {task.is_extra_credit && (
                <Text style={[styles.editLabel, { color: colors.ink3, marginTop: 4, fontWeight: '500' }]}>Bonus points added on top of your course grade, scaled by your score.</Text>
              )}
              {gradeCategories.length > 0 && (
                <>
                  <Text style={[styles.editLabel, { color: colors.ink2 }]}>Grade category</Text>
                  <View style={[styles.typeRow, isWide && styles.typeRowWide]}>
                    {gradeCategories.map((category) => (
                      <TouchableOpacity
                        key={category.id}
                        style={[styles.typeChip, editGradeCategoryId === category.id && { backgroundColor: colors.brand }]}
                        onPress={() => setEditGradeCategoryId(editGradeCategoryId === category.id ? null : category.id)}
                      >
                        <Text style={[styles.typeChipText, { color: colors.ink2 }, editGradeCategoryId === category.id && { color: '#fff' }]}>{category.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
              <TaskPlanningFields
                priority={editPriority}
                onPriorityChange={setEditPriority}
                estimatedMinutes={editEstimatedMinutes}
                onEstimatedMinutesChange={setEditEstimatedMinutes}
                startDate={editStartDate}
                onStartDateChange={setEditStartDate}
                recurrence={editRecurrence}
                onRecurrenceChange={(value) => {
                  setEditRecurrence(value);
                  if (!value) setEditRecurrenceEndDate(null);
                }}
                recurrenceEndDate={editRecurrenceEndDate}
                onRecurrenceEndDateChange={setEditRecurrenceEndDate}
                dueDate={editDueDate}
                dueTime={editDueTime}
                reminderOffsets={editReminderOffsets}
                onReminderOffsetsChange={setEditReminderOffsets}
              />
              <View style={styles.editActions}>
                <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.line }]} onPress={() => setEditing(false)}><Text style={[styles.cancelText, { color: colors.ink2 }]}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.brand }]} onPress={saveEdit}>
                  {updateTask.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.ink }, task.is_completed && styles.titleDone]}>{task.title}</Text>
              {task.description && <Text style={[styles.description, { color: colors.ink2 }]}>{task.description}</Text>}
              {task.lms_connection_id && (
                <TouchableOpacity
                  disabled={!task.lms_url}
                  onPress={() => task.lms_url && Linking.openURL(task.lms_url).catch(() => {})}
                  style={[styles.sourceBanner, { backgroundColor: task.lms_removed_at ? colors.coral50 : colors.brand50 }]}
                >
                  <FontAwesome
                    name={task.lms_removed_at ? 'exclamation-triangle' : 'university'}
                    size={13}
                    color={task.lms_removed_at ? colors.coral : colors.brand}
                  />
                  <Text style={[styles.sourceText, { color: task.lms_removed_at ? colors.coral : colors.brand }]}>
                    {task.lms_removed_at ? 'No longer listed in the LMS · kept in Semora' : 'Synced from your learning platform'}
                  </Text>
                  {!!task.lms_url && <FontAwesome name="external-link" size={11} color={task.lms_removed_at ? colors.coral : colors.brand} />}
                </TouchableOpacity>
              )}
              <View style={[styles.detailsGrid, isWide && styles.detailsGridWide]}>
                <View style={[styles.detailItem, isWide && styles.detailItemWide]}>
                  <FontAwesome name="calendar" size={13} color="#94a3b8" />
                  <Text style={[styles.detailText, overdue && { color: '#ef4444', fontWeight: '700' }]} numberOfLines={1} ellipsizeMode="tail">
                    {format(dueDate, 'EEEE, MMM d, yyyy')}
                    {overdue && ' (OVERDUE)'}
                  </Text>
                </View>
                {task.due_time && (
                  <View style={[styles.detailItem, isWide && styles.detailItemWide]}>
                    <FontAwesome name="clock-o" size={13} color="#94a3b8" />
                    <Text style={styles.detailText} numberOfLines={1} ellipsizeMode="tail">{task.due_time.slice(0, 5)}</Text>
                  </View>
                )}
                {task.weight != null && (
                  <View style={[styles.detailItem, isWide && styles.detailItemWide]}>
                    <FontAwesome name="balance-scale" size={13} color="#94a3b8" />
                    <Text style={styles.detailText} numberOfLines={1} ellipsizeMode="tail">{task.weight}% of grade{task.is_extra_credit ? ' (extra credit)' : ''}</Text>
                  </View>
                )}
                {task.grade_category_id && (
                  <View style={[styles.detailItem, isWide && styles.detailItemWide]}>
                    <FontAwesome name="folder-open-o" size={13} color="#94a3b8" />
                    <Text style={styles.detailText} numberOfLines={1}>
                      {gradeCategories.find((category) => category.id === task.grade_category_id)?.name || 'Grade category'}
                    </Text>
                  </View>
                )}
                <View style={[styles.detailItem, isWide && styles.detailItemWide]}>
                  <FontAwesome name="flag" size={13} color={task.priority === 'high' ? '#ef4444' : '#94a3b8'} />
                  <Text style={styles.detailText}>{task.priority === 'high' ? 'High' : task.priority === 'low' ? 'Low' : 'Normal'} priority</Text>
                </View>
                <View style={[styles.detailItem, isWide && styles.detailItemWide]}>
                  <FontAwesome name="hourglass-half" size={13} color="#94a3b8" />
                  <Text style={styles.detailText}>
                    {formatStudyDuration(estimateTaskMinutes(task))} effort{task.estimated_minutes == null ? ' · smart estimate' : ''}
                  </Text>
                </View>
                {task.start_date && (
                  <View style={[styles.detailItem, isWide && styles.detailItemWide]}>
                    <FontAwesome name="play-circle-o" size={13} color="#94a3b8" />
                    <Text style={styles.detailText}>Start {format(new Date(task.start_date + 'T00:00:00'), 'MMM d, yyyy')}</Text>
                  </View>
                )}
                {task.recurrence_frequency && (
                  <View style={[styles.detailItem, isWide && styles.detailItemWide]}>
                    <FontAwesome name="repeat" size={13} color="#94a3b8" />
                    <Text style={styles.detailText}>{recurrenceLabel(task.recurrence_frequency)}</Text>
                  </View>
                )}
                <View style={[styles.detailItem, isWide && styles.detailItemWide]}>
                  <FontAwesome name="bell-o" size={13} color="#94a3b8" />
                  <Text style={styles.detailText}>
                    {reminderSummary(task.reminder_offsets_minutes, task.due_date, task.due_time)}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Subtasks are part of doing the work, so they must be visible/editable
            while a task is still incomplete — not gated behind completion or a
            score like the grade card below. */}
        {!editing && (
          <View style={[styles.card, width < 360 && styles.cardNarrow, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={styles.subtaskHeader}>
              <Text style={[styles.scoreLabel, { color: colors.ink3 }]}>SUBTASKS</Text>
              {subtasks.length > 0 && (
                <Text style={[styles.subtaskProgress, { color: colors.ink3 }]}>
                  {subtasks.filter((item) => item.is_completed).length}/{subtasks.length} done
                </Text>
              )}
            </View>
            {subtasks.map((subtask) => (
              <View key={subtask.id} style={[styles.subtaskRow, { borderBottomColor: colors.line }]}>
                <TouchableOpacity
                  onPress={() => toggleSubtask.mutate({ id: subtask.id, taskId: task.id, is_completed: !subtask.is_completed })}
                  hitSlop={8}
                >
                  <FontAwesome name={subtask.is_completed ? 'check-circle' : 'circle-o'} size={19} color={subtask.is_completed ? '#22c55e' : colors.ink3} />
                </TouchableOpacity>
                <Text style={[styles.subtaskTitle, { color: colors.ink }, subtask.is_completed && styles.subtaskDone]}>{subtask.title}</Text>
                <TouchableOpacity onPress={() => deleteSubtask.mutate({ id: subtask.id, taskId: task.id })} hitSlop={8}>
                  <FontAwesome name="trash-o" size={14} color={colors.ink3} />
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.subtaskInputRow}>
              <TextInput
                style={[styles.subtaskInput, { borderColor: colors.line, color: colors.ink, backgroundColor: colors.card }]}
                value={subtaskInput}
                onChangeText={setSubtaskInput}
                maxLength={240}
                placeholder="Add a step"
                placeholderTextColor={colors.ink3}
                onSubmitEditing={handleAddSubtask}
              />
              <TouchableOpacity style={[styles.subtaskAdd, { backgroundColor: colors.brand }]} onPress={handleAddSubtask} disabled={createSubtask.isPending}>
                {createSubtask.isPending ? <ActivityIndicator size="small" color="#fff" /> : <FontAwesome name="plus" size={13} color="#fff" />}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Score section */}
        {!editing && (
          <View style={[styles.card, width < 360 && styles.cardNarrow, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={styles.scoreHeader}>
              <Text style={[styles.scoreLabel, { color: colors.ink3 }]}>GRADE RECEIVED</Text>
              {task.score != null ? (
                <View style={styles.scoreDisplay}>
                  <View>
                    <Text style={styles.scoreValue}>{task.score}%</Text>
                    {task.points_earned != null && task.points_possible != null && (
                      <Text style={[styles.scorePoints, { color: colors.ink3 }]}>{task.points_earned}/{task.points_possible} points</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => {
                    if (task.points_earned != null && task.points_possible != null) {
                      setScoreMode('points');
                      setScoreInput(String(task.points_earned));
                      setScorePossible(String(task.points_possible));
                    } else {
                      setScoreInput(String(task.score));
                      setScoreMode('percent');
                    }
                    setShowScoreInput(true);
                  }}>
                    <Text style={[styles.editLink, { color: colors.brand }]}>Edit</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.addScoreBtn, { backgroundColor: colors.brand50 }]}
                  onPress={() => setShowScoreInput(true)}
                  activeOpacity={0.7}
                >
                  <FontAwesome name="plus" size={11} color={colors.brand} />
                  <Text style={[styles.addScoreText, { color: colors.brand }]}>Add Grade</Text>
                </TouchableOpacity>
              )}
            </View>
            {showScoreInput && (
              <>
                {/* Mode toggle */}
                <View style={styles.scoreModeRow}>
                  <TouchableOpacity
                    style={[styles.scoreModeBtn, scoreMode === 'points' && { backgroundColor: colors.brand }]}
                    onPress={() => { if (scoreMode !== 'points') { setScoreMode('points'); setScoreInput(''); setScorePossible(''); } }}
                  >
                    <Text style={[styles.scoreModeText, { color: colors.ink2 }, scoreMode === 'points' && styles.scoreModeTextActive]}>Points (13/15)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.scoreModeBtn, scoreMode === 'percent' && { backgroundColor: colors.brand }]}
                    onPress={() => { if (scoreMode !== 'percent') { setScoreMode('percent'); setScoreInput(''); setScorePossible(''); } }}
                  >
                    <Text style={[styles.scoreModeText, { color: colors.ink2 }, scoreMode === 'percent' && styles.scoreModeTextActive]}>Percentage</Text>
                  </TouchableOpacity>
                </View>

                {scoreMode === 'points' ? (
                  <>
                    {!task.weight && (
                      <View style={[styles.scoreWarning, { backgroundColor: colors.amber50 }]}>
                        <FontAwesome name="info-circle" size={12} color={colors.amber} />
                        <Text style={[styles.scoreWarningText, { color: colors.amber }]}>
                          No weight set for this assignment. Add weight in Edit or enter total below.
                        </Text>
                      </View>
                    )}
                    {task.weight != null && (
                      <Text style={[styles.scorePreFillHint, { color: colors.ink3 }]}>
                        This assignment is worth {task.weight}% of your grade
                      </Text>
                    )}
                    <View style={styles.scoreInputRow}>
                      <TextInput
                        style={[styles.scoreInput, { borderColor: colors.line, color: colors.ink, backgroundColor: colors.card }]}
                        placeholder="Earned"
                        placeholderTextColor={colors.ink3}
                        value={scoreInput}
                        onChangeText={setScoreInput}
                        keyboardType="decimal-pad"
                        autoFocus={!!task.weight}
                      />
                      <Text style={[styles.scoreSlash, { color: colors.ink3 }]}>/</Text>
                      <TextInput
                        style={[styles.scoreInput, { borderColor: colors.line, color: colors.ink, backgroundColor: colors.card }]}
                        placeholder="Total"
                        placeholderTextColor={colors.ink3}
                        value={scorePossible}
                        onChangeText={setScorePossible}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </>
                ) : (
                  <>
                    {task.weight != null && (
                      <Text style={[styles.scorePreFillHint, { color: colors.ink3 }]}>
                        Enter your percentage score on this {task.weight}% assignment
                      </Text>
                    )}
                    <View style={styles.scoreInputRow}>
                      <TextInput
                        style={[styles.scoreInput, { borderColor: colors.line, color: colors.ink, backgroundColor: colors.card }]}
                        placeholder="e.g. 86.67"
                        placeholderTextColor={colors.ink3}
                        value={scoreInput}
                        onChangeText={setScoreInput}
                        keyboardType="decimal-pad"
                      />
                      <Text style={[styles.scoreSlash, { color: colors.ink3 }]}>%</Text>
                    </View>
                  </>
                )}

                <View style={styles.scoreActionsRow}>
                  <TouchableOpacity style={[styles.scoreSubmit, { backgroundColor: colors.brand }]} onPress={handleSaveScore}>
                    <Text style={styles.scoreSubmitText}>Save Grade</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setShowScoreInput(false); setScoreInput(''); setScorePossible(''); }}>
                    <Text style={[styles.scoreCancelText, { color: colors.ink3 }]}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        )}

        {/* Late status — editable so a mis-tapped "Yes, late" can be undone without losing the score */}
        {!editing && task.is_completed && (
          <View style={[styles.card, width < 360 && styles.cardNarrow, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={styles.lateRow}>
              <View style={styles.lateInfo}>
                <Text style={[styles.scoreLabel, { color: colors.ink3 }]}>SUBMITTED LATE</Text>
                <Text style={[styles.lateStatusText, { color: task.submitted_late ? '#ef4444' : colors.ink2 }]}>
                  {task.submitted_late
                    ? `Yes, submitted late${task.late_penalty_percent != null ? ` · ${task.late_penalty_percent}% expected penalty` : ''}`
                    : 'No, on time'}
                </Text>
                {task.submitted_late && task.score == null && task.late_penalty_percent != null && (
                  <Text style={[styles.penaltyCap, { color: colors.coral }]}>Estimated maximum: {Math.max(0, 100 - task.late_penalty_percent)}% until the final grade is posted</Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.lateChangeBtn, { backgroundColor: colors.brand50 }]}
                onPress={handleToggleLate}
                disabled={updateTask.isPending}
                activeOpacity={0.7}
              >
                {updateTask.isPending
                  ? <ActivityIndicator color={colors.brand} size="small" />
                  : <Text style={[styles.lateChangeText, { color: colors.brand }]}>{task.submitted_late ? 'Mark on time' : 'Mark late'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Toggle complete */}
        {!editing && (
          <TouchableOpacity
            style={[styles.toggleBtn, task.is_completed && styles.toggleBtnDone]}
            onPress={handleToggle}
            disabled={toggleComplete.isPending}
            activeOpacity={0.8}
          >
            <FontAwesome name={task.is_completed ? 'undo' : 'check-circle'} size={18} color={task.is_completed ? '#64748b' : '#fff'} />
            <Text style={[styles.toggleText, task.is_completed && styles.toggleTextDone]}>
              {task.is_completed ? 'Mark Incomplete' : 'Mark Complete'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Focus session — start a Pomodoro linked to this task. The
            /pomodoro screen is Pro-gated (it shows the paywall teaser to free
            users), so we route unconditionally and let it decide. Hidden for
            completed tasks — there's nothing left to focus on. */}
        {!editing && !task.is_completed && (
          <TouchableOpacity
            style={[styles.focusBtn, { backgroundColor: colors.brand50, borderColor: colors.brand100 }]}
            activeOpacity={0.8}
            onPress={() => {
              if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              track('pomodoro_entry_tapped', { screen: 'task_detail' });
              router.push({ pathname: '/pomodoro', params: { taskId: task.id, title: task.title } } as any);
            }}
          >
            <FontAwesome name="clock-o" size={16} color={colors.brand} />
            <Text style={[styles.focusBtnText, { color: colors.brand }]}>Start focus session</Text>
          </TouchableOpacity>
        )}

        {/* Actions */}
        {!editing && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.brand50 }]} onPress={startEdit}>
              <FontAwesome name="pencil" size={14} color={colors.brand} /><Text style={[styles.actionBtnText, { color: colors.brand }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#fef2f2' }]} onPress={handleDelete}>
              <FontAwesome name="trash-o" size={14} color="#ef4444" /><Text style={[styles.actionBtnText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 100, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  courseStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 12, marginBottom: 14 },
  courseDot: { width: 10, height: 10, borderRadius: 5 },
  courseName: { fontSize: 14, fontWeight: '600', flex: 1 },
  badges: { flexDirection: 'row', gap: 4 },
  typeBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  typeText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  ecBadge: { backgroundColor: '#eef2ff', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
  ecBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.brand },
  lateBadge: { backgroundColor: '#fef2f2', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
  lateBadgeText: { fontSize: 11, fontWeight: '700', color: '#ef4444' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 24, borderWidth: 1, borderColor: '#edf0f7', marginBottom: 14 },
  cardNarrow: { padding: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  titleDone: { textDecorationLine: 'line-through', color: '#94a3b8' },
  description: { fontSize: 14, color: '#64748b', lineHeight: 20, marginTop: 8 },
  sourceBanner: { minHeight: 39, borderRadius: 11, paddingHorizontal: 11, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceText: { flex: 1, fontSize: 12, fontWeight: '700' },
  detailsGrid: { marginTop: 16, gap: 10 },
  detailsGridWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailItemWide: { width: '48%' },
  detailText: { fontSize: 14, color: '#475569', fontWeight: '500', flexShrink: 1 },
  scoreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5 },
  scoreDisplay: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreValue: { fontSize: 24, fontWeight: '800', color: '#22c55e' },
  scorePoints: { fontSize: 11, fontWeight: '600', marginTop: -2 },
  editLink: { fontSize: 13, color: COLORS.brand, fontWeight: '600' },
  addScoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#eef2ff' },
  addScoreText: { fontSize: 13, fontWeight: '600', color: COLORS.brand },
  scoreWarning: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.amber50, padding: 8, borderRadius: 8, marginTop: 8, marginBottom: 6 },
  scoreWarningText: { flex: 1, fontSize: 11, color: COLORS.amber, fontWeight: '500' },
  scorePreFillHint: { fontSize: 11, color: COLORS.ink3, marginTop: 6, marginBottom: 4, fontStyle: 'italic' },
  scoreModeRow: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 10 },
  scoreModeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center' },
  scoreModeBtnActive: { backgroundColor: COLORS.brand },
  scoreModeText: { fontSize: 12, fontWeight: '600', color: COLORS.ink2 },
  scoreModeTextActive: { color: '#fff' },
  scoreInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreSlash: { fontSize: 18, fontWeight: '600', color: COLORS.ink3 },
  scoreInput: { flex: 1, height: 44, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, fontSize: 15, color: COLORS.ink, backgroundColor: '#fafafa' },
  scoreLocked: { flex: 1, height: 44, borderRadius: 10, backgroundColor: COLORS.brand50, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.brand100 },
  scoreLockedText: { fontSize: 16, fontWeight: '700', color: COLORS.brand },
  scoreActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  scoreSubmit: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.brand },
  scoreSubmitText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  scoreCancelText: { fontSize: 14, color: COLORS.ink3, fontWeight: '600' },
  lateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  lateInfo: { flex: 1, gap: 4 },
  lateStatusText: { fontSize: 15, fontWeight: '700' },
  penaltyCap: { fontSize: 11.5, lineHeight: 16, fontWeight: '600', marginTop: 3, maxWidth: 240 },
  lateChangeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.brand50 },
  lateChangeText: { fontSize: 13, fontWeight: '600', color: COLORS.brand },
  toggleBtn: { height: 52, backgroundColor: '#22c55e', borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 14 },
  toggleBtnDone: { backgroundColor: '#f1f5f9' },
  focusBtn: { height: 50, borderRadius: 14, borderWidth: 1.5, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 14 },
  focusBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.brand },
  toggleText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  toggleTextDone: { color: '#64748b' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#eef2ff' },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
  editInput: { height: 48, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#fafafa', paddingHorizontal: 16, fontSize: 15, color: '#111', marginBottom: 12 },
  editLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 8 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  typeRowWide: { gap: 12 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  typeChipWide: { flexGrow: 1, alignItems: 'center' },
  typeChipActive: { backgroundColor: COLORS.brand },
  typeChipText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  dateRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  saveBtn: { flex: 1, height: 44, borderRadius: 10, backgroundColor: COLORS.brand, justifyContent: 'center', alignItems: 'center' },
  saveText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  subtaskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  subtaskProgress: { fontSize: 12, fontWeight: '600' },
  subtaskRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1 },
  subtaskTitle: { flex: 1, fontSize: 14, fontWeight: '500' },
  subtaskDone: { textDecorationLine: 'line-through', opacity: 0.55 },
  subtaskInputRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  subtaskInput: { flex: 1, height: 42, borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  subtaskAdd: { width: 42, height: 42, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
});
