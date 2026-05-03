import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { format, isPast, isToday } from 'date-fns';
import { useTask, useUpdateTask, useDeleteTask, useToggleTaskComplete } from '@/lib/queries';
import { TASK_TYPE_LABELS, TASK_TYPES, COLORS, type TaskType } from '@/lib/constants';
import { DatePicker } from '@/components/DatePicker';
import { useColors } from '@/lib/theme';
import { formatLocalDate } from '@/lib/dates';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: task, isLoading } = useTask(id!);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const toggleComplete = useToggleTaskComplete();

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState<TaskType>('assignment');
  const [editDueDate, setEditDueDate] = useState<Date | null>(null);
  const [editDueTime, setEditDueTime] = useState<Date | null>(null);
  const [editWeight, setEditWeight] = useState('');
  const [scoreInput, setScoreInput] = useState('');
  const [scorePossible, setScorePossible] = useState('');
  const [scoreMode, setScoreMode] = useState<'percent' | 'points'>('points');
  const [showScoreInput, setShowScoreInput] = useState(false);
  const colors = useColors();

  if (isLoading || !task) {
    return <View style={[styles.loading, { backgroundColor: colors.paper }]}><ActivityIndicator size="large" color={colors.brand} /></View>;
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
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      await updateTask.mutateAsync({
        id: task.id,
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        type: editType,
        due_date: formatLocalDate(editDueDate!),
        due_time: editDueTime
          ? `${String(editDueTime.getHours()).padStart(2, '0')}:${String(editDueTime.getMinutes()).padStart(2, '0')}:00`
          : undefined,
        weight: editWeight ? parseFloat(editWeight) : undefined,
      });
      Keyboard.dismiss();
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleToggle = async () => {
    const completing = !task.is_completed;
    const pastDue = isPast(dueDate) && !isToday(dueDate);

    if (completing && pastDue) {
      // Ask about late submission
      Alert.alert(
        'Past Due Date',
        'This assignment\'s due date has passed. Was it submitted late?',
        [
          {
            text: 'Yes, submitted late',
            onPress: async () => {
              try {
                await toggleComplete.mutateAsync({ id: task.id, is_completed: true, submitted_late: true });
                if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
              } catch (err: any) {
                Alert.alert('Error', err.message ?? 'Failed to update task.');
              }
            },
          },
          {
            text: 'No, on time',
            onPress: async () => {
              try {
                await toggleComplete.mutateAsync({ id: task.id, is_completed: true, submitted_late: false });
                if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (err: any) {
                Alert.alert('Error', err.message ?? 'Failed to update task.');
              }
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    } else {
      try {
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(completing ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
        }
        await toggleComplete.mutateAsync({ id: task.id, is_completed: completing });
      } catch (err: any) {
        Alert.alert('Error', err.message ?? 'Failed to update task.');
      }
    }
  };

  const handleSaveScore = async () => {
    let score: number;

    if (scoreMode === 'points') {
      const earned = parseFloat(scoreInput);
      // Use task.weight if available, otherwise use manual input
      const possible = task.weight != null ? task.weight : parseFloat(scorePossible);
      if (isNaN(earned) || earned < 0) {
        Alert.alert('Invalid', 'Please enter points earned.');
        return;
      }
      if (isNaN(possible) || possible <= 0) {
        Alert.alert('Invalid', 'Please enter total points possible.');
        return;
      }
      score = parseFloat(((earned / possible) * 100).toFixed(2));
    } else {
      score = parseFloat(scoreInput);
      if (isNaN(score) || score < 0 || score > 100) {
        Alert.alert('Invalid', 'Please enter a percentage between 0 and 100.');
        return;
      }
    }

    try {
      await updateTask.mutateAsync({ id: task.id, score });
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        {/* Course strip */}
        <View style={[styles.courseStrip, { backgroundColor: courseColor + '15' }]}>
          <View style={[styles.courseDot, { backgroundColor: courseColor }]} />
          <Text style={[styles.courseName, { color: courseColor }]}>{task.courses.name}</Text>
          <View style={styles.badges}>
            <View style={styles.typeBadge}><Text style={[styles.typeText, { color: colors.ink2 }]}>{TASK_TYPE_LABELS[task.type]}</Text></View>
            {task.is_extra_credit && <View style={[styles.ecBadge, { backgroundColor: colors.brand50 }]}><Text style={[styles.ecBadgeText, { color: colors.brand }]}>EC</Text></View>}
            {task.submitted_late && <View style={styles.lateBadge}><Text style={styles.lateBadgeText}>LATE</Text></View>}
          </View>
        </View>

        {/* Main card */}
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {editing ? (
            <>
              <TextInput style={[styles.editInput, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]} value={editTitle} onChangeText={setEditTitle} placeholder="Title" placeholderTextColor={colors.ink3} />
              <TextInput style={[styles.editInput, { height: 80, borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]} value={editDescription} onChangeText={setEditDescription} placeholder="Description" placeholderTextColor={colors.ink3} multiline textAlignVertical="top" />
              <Text style={[styles.editLabel, { color: colors.ink2 }]}>Type</Text>
              <View style={styles.typeRow}>
                {TASK_TYPES.map((t) => (
                  <TouchableOpacity key={t} style={[styles.typeChip, editType === t && { backgroundColor: colors.brand }]} onPress={() => setEditType(t)}>
                    <Text style={[styles.typeChipText, { color: colors.ink2 }, editType === t && { color: '#fff' }]}>{TASK_TYPE_LABELS[t]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}><Text style={[styles.editLabel, { color: colors.ink2 }]}>Due Date</Text><DatePicker value={editDueDate} onChange={setEditDueDate} mode="date" /></View>
                <View style={{ flex: 1 }}><Text style={[styles.editLabel, { color: colors.ink2 }]}>Time</Text><DatePicker value={editDueTime} onChange={setEditDueTime} mode="time" placeholder="Optional" /></View>
              </View>
              <Text style={[styles.editLabel, { color: colors.ink2 }]}>Weight (%)</Text>
              <TextInput style={[styles.editInput, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]} value={editWeight} onChangeText={setEditWeight} keyboardType="decimal-pad" placeholder="Optional" placeholderTextColor={colors.ink3} />
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
              <View style={styles.detailsGrid}>
                <View style={styles.detailItem}>
                  <FontAwesome name="calendar" size={13} color="#94a3b8" />
                  <Text style={[styles.detailText, overdue && { color: '#ef4444', fontWeight: '700' }]}>
                    {format(dueDate, 'EEEE, MMM d, yyyy')}
                    {overdue && ' (OVERDUE)'}
                  </Text>
                </View>
                {task.due_time && (
                  <View style={styles.detailItem}>
                    <FontAwesome name="clock-o" size={13} color="#94a3b8" />
                    <Text style={styles.detailText}>{task.due_time.slice(0, 5)}</Text>
                  </View>
                )}
                {task.weight != null && (
                  <View style={styles.detailItem}>
                    <FontAwesome name="balance-scale" size={13} color="#94a3b8" />
                    <Text style={styles.detailText}>{task.weight}% of grade{task.is_extra_credit ? ' (extra credit)' : ''}</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        {/* Score section */}
        {!editing && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={styles.scoreHeader}>
              <Text style={[styles.scoreLabel, { color: colors.ink3 }]}>GRADE</Text>
              {task.score != null ? (
                <View style={styles.scoreDisplay}>
                  <Text style={styles.scoreValue}>{task.score}%</Text>
                  <TouchableOpacity onPress={() => {
                    // Pre-fill from existing score
                    if (task.weight) {
                      // Convert percentage back to points for points mode
                      const earned = parseFloat(((task.score! / 100) * task.weight).toFixed(2));
                      setScoreInput(String(earned));
                      setScorePossible(String(task.weight));
                      setScoreMode('points');
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
                  onPress={() => {
                    // Pre-fill "Total" from weight if available
                    if (task.weight) {
                      setScorePossible(String(task.weight));
                      setScoreMode('points');
                    }
                    setShowScoreInput(true);
                  }}
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
                    onPress={() => setScoreMode('points')}
                  >
                    <Text style={[styles.scoreModeText, { color: colors.ink2 }, scoreMode === 'points' && styles.scoreModeTextActive]}>Points (13/15)</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.scoreModeBtn, scoreMode === 'percent' && { backgroundColor: colors.brand }]}
                    onPress={() => setScoreMode('percent')}
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
                      {task.weight != null ? (
                        <View style={[styles.scoreLocked, { backgroundColor: colors.brand50, borderColor: colors.brand }]}>
                          <Text style={[styles.scoreLockedText, { color: colors.brand }]}>{task.weight}</Text>
                        </View>
                      ) : (
                        <TextInput
                          style={[styles.scoreInput, { borderColor: colors.line, color: colors.ink, backgroundColor: colors.card }]}
                          placeholder="Total"
                          placeholderTextColor={colors.ink3}
                          value={scorePossible}
                          onChangeText={setScorePossible}
                          keyboardType="decimal-pad"
                        />
                      )}
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

        {/* Toggle complete */}
        {!editing && (
          <TouchableOpacity
            style={[styles.toggleBtn, task.is_completed && styles.toggleBtnDone]}
            onPress={handleToggle}
            activeOpacity={0.8}
          >
            <FontAwesome name={task.is_completed ? 'undo' : 'check-circle'} size={18} color={task.is_completed ? '#64748b' : '#fff'} />
            <Text style={[styles.toggleText, task.is_completed && styles.toggleTextDone]}>
              {task.is_completed ? 'Mark Incomplete' : 'Mark Complete'}
            </Text>
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
  content: { padding: 20, paddingBottom: 100 },
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
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  titleDone: { textDecorationLine: 'line-through', color: '#94a3b8' },
  description: { fontSize: 14, color: '#64748b', lineHeight: 20, marginTop: 8 },
  detailsGrid: { marginTop: 16, gap: 10 },
  detailItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 14, color: '#475569', fontWeight: '500' },
  scoreHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreLabel: { fontSize: 11, fontWeight: '700', color: '#94a3b8', letterSpacing: 0.5 },
  scoreDisplay: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scoreValue: { fontSize: 24, fontWeight: '800', color: '#22c55e' },
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
  toggleBtn: { height: 52, backgroundColor: '#22c55e', borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 14 },
  toggleBtnDone: { backgroundColor: '#f1f5f9' },
  toggleText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  toggleTextDone: { color: '#64748b' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: '#eef2ff' },
  actionBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
  editInput: { height: 48, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#fafafa', paddingHorizontal: 16, fontSize: 15, color: '#111', marginBottom: 12 },
  editLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 8 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9' },
  typeChipActive: { backgroundColor: COLORS.brand },
  typeChipText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  dateRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  saveBtn: { flex: 1, height: 44, borderRadius: 10, backgroundColor: COLORS.brand, justifyContent: 'center', alignItems: 'center' },
  saveText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
