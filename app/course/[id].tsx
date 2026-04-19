import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { useCourse, useTasks, useUpdateCourse, useDeleteCourse, useToggleTaskComplete } from '@/lib/queries';
import { TaskItem } from '@/components/TaskItem';
import { GradeCard } from '@/components/GradeCard';
import { COURSE_COLORS, COURSE_ICONS, COLORS, calculateGrade, DEFAULT_GRADE_SCALE } from '@/lib/constants';
import type { GradeThreshold } from '@/types/database';
import { useAppStore } from '@/store/appStore';

export default function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: course, isLoading } = useCourse(id!);
  const { data: tasks = [] } = useTasks({ courseId: id });
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();
  const toggleComplete = useToggleTaskComplete();
  const isPro = useAppStore((s) => s.isPro);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editInstructor, setEditInstructor] = useState('');
  const [editMeetingTime, setEditMeetingTime] = useState('');
  const [editOfficeHours, setEditOfficeHours] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editingScale, setEditingScale] = useState(false);
  const [scaleRows, setScaleRows] = useState<GradeThreshold[]>([]);

  if (isLoading || !course) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={COLORS.brand} /></View>;
  }

  // Grade calculation
  const gradeScale = course.grade_scale || DEFAULT_GRADE_SCALE;
  const gradeTasks = tasks.map((t) => ({ weight: t.weight, score: t.score, is_extra_credit: t.is_extra_credit }));
  const { percentage, letter, weightAttempted, weightTotal } = calculateGrade(gradeTasks, gradeScale as GradeThreshold[]);
  const gradedCount = tasks.filter((t) => t.score != null).length;

  const startEdit = () => {
    setEditName(course.name);
    setEditInstructor(course.instructor || '');
    setEditMeetingTime(course.meeting_time || '');
    setEditOfficeHours(course.office_hours || '');
    setEditColor(course.color);
    setEditIcon(course.icon);
    setEditing(true);
  };

  const saveEdit = async () => {
    try {
      await updateCourse.mutateAsync({
        id: course.id,
        name: editName.trim(),
        instructor: editInstructor.trim() || undefined,
        meeting_time: editMeetingTime.trim() || undefined,
        office_hours: editOfficeHours.trim() || undefined,
        color: editColor,
        icon: editIcon,
      } as any);
      Keyboard.dismiss();
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditing(false);
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const startEditScale = () => {
    setScaleRows([...(gradeScale as GradeThreshold[])]);
    setEditingScale(true);
  };

  const saveScale = async () => {
    const sorted = [...scaleRows].sort((a, b) => b.min - a.min);
    try {
      await updateCourse.mutateAsync({ id: course.id, grade_scale: sorted } as any);
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingScale(false);
    } catch (err: any) { Alert.alert('Error', err.message); }
  };

  const handleDelete = () => {
    Alert.alert('Delete Course', 'This will also delete all tasks for this course.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteCourse.mutateAsync(course.id); router.back(); } catch (err: any) { Alert.alert('Delete Failed', err.message ?? 'Something went wrong. Please try again.'); } } },
    ]);
  };

  const pendingCount = tasks.filter((t) => !t.is_completed).length;
  const doneCount = tasks.filter((t) => t.is_completed).length;
  const displayColor = editing ? editColor : course.color;
  const displayIcon = editing ? editIcon : course.icon;

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        {/* Header */}
        <View style={[styles.header, { backgroundColor: displayColor + '12' }]}>
          <View style={[styles.headerIcon, { backgroundColor: displayColor + '25' }]}>
            <FontAwesome name={displayIcon as any} size={28} color={displayColor} />
          </View>
          {editing ? (
            <>
              <TextInput style={styles.editTitle} value={editName} onChangeText={setEditName} placeholder="Course Name" placeholderTextColor={COLORS.ink3} />
              <TextInput style={styles.editSub} value={editInstructor} onChangeText={setEditInstructor} placeholder="Instructor" placeholderTextColor={COLORS.ink3} />
              <TextInput style={styles.editSub} value={editMeetingTime} onChangeText={setEditMeetingTime} placeholder="Meeting time (e.g. MWF 10:00 AM)" placeholderTextColor={COLORS.ink3} />
              <TextInput style={styles.editSub} value={editOfficeHours} onChangeText={setEditOfficeHours} placeholder="Office hours (e.g. Tue 2-3 PM)" placeholderTextColor={COLORS.ink3} />
            </>
          ) : (
            <>
              <Text style={styles.headerTitle}>{course.name}</Text>
              {course.instructor && <Text style={styles.headerSub}>{course.instructor}</Text>}
            </>
          )}
          <View style={styles.statsRow}>
            <View style={styles.statBadge}><Text style={styles.statNum}>{pendingCount}</Text><Text style={styles.statLabel}>pending</Text></View>
            <View style={styles.statBadge}><Text style={[styles.statNum, { color: '#22c55e' }]}>{doneCount}</Text><Text style={styles.statLabel}>done</Text></View>
          </View>
        </View>

        {/* Course details — always show, tap to edit if empty */}
        {!editing && (
          <TouchableOpacity style={styles.detailsCard} onPress={!course.meeting_time && !course.office_hours ? startEdit : undefined} activeOpacity={0.8}>
            <View style={styles.detailRow}>
              <FontAwesome name="clock-o" size={13} color={course.meeting_time ? COLORS.ink2 : COLORS.ink3} />
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Class Meeting</Text>
                {course.meeting_time ? (
                  <Text style={styles.detailValue}>{course.meeting_time}</Text>
                ) : (
                  <Text style={styles.detailEmpty}>Tap Edit to add meeting time</Text>
                )}
              </View>
            </View>
            <View style={styles.detailDivider} />
            <View style={styles.detailRow}>
              <FontAwesome name="building-o" size={13} color={course.office_hours ? COLORS.ink2 : COLORS.ink3} />
              <View style={{ flex: 1 }}>
                <Text style={styles.detailLabel}>Office Hours</Text>
                {course.office_hours ? (
                  <Text style={styles.detailValue}>{course.office_hours}</Text>
                ) : (
                  <Text style={styles.detailEmpty}>Tap Edit to add office hours</Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}

        {/* Grade summary */}
        <View style={styles.gradeCard}>
          <GradeCard percentage={percentage} letter={letter} gradedCount={gradedCount} totalCount={tasks.length} weightAttempted={weightAttempted} weightTotal={weightTotal} />

          {/* Grade scale — Pro only */}
          {isPro ? (
            <>
              {!editingScale ? (
                <TouchableOpacity style={styles.scaleToggle} onPress={startEditScale}>
                  <View style={styles.scaleRow}>
                    {(gradeScale as GradeThreshold[]).map((g) => (
                      <Text key={g.letter} style={styles.scaleItem}>{g.letter}: {g.min}%+</Text>
                    ))}
                  </View>
                  <Text style={styles.editScaleLink}>Edit Scale</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.scaleEditor}>
                  <Text style={styles.scaleEditorTitle}>Grade Scale</Text>
                  {scaleRows.map((row, i) => (
                    <View key={i} style={styles.scaleEditRow}>
                      <TextInput
                        style={styles.scaleLetterInput}
                        value={row.letter}
                        onChangeText={(t) => { const r = [...scaleRows]; r[i] = { ...r[i], letter: t }; setScaleRows(r); }}
                        maxLength={2}
                      />
                      <TextInput
                        style={styles.scaleMinInput}
                        value={String(row.min)}
                        onChangeText={(t) => { const r = [...scaleRows]; r[i] = { ...r[i], min: parseFloat(t) || 0 }; setScaleRows(r); }}
                        keyboardType="decimal-pad"
                        placeholder="Min %"
                      />
                      <TouchableOpacity onPress={() => setScaleRows(scaleRows.filter((_, j) => j !== i))}>
                        <FontAwesome name="times" size={14} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.addScaleRow} onPress={() => setScaleRows([...scaleRows, { letter: '', min: 0 }])}>
                    <FontAwesome name="plus" size={11} color={COLORS.brand} /><Text style={styles.addScaleText}>Add Row</Text>
                  </TouchableOpacity>
                  <View style={styles.scaleActions}>
                    <TouchableOpacity style={styles.scaleCancelBtn} onPress={() => setEditingScale(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.scaleSaveBtn} onPress={saveScale}><Text style={styles.saveText}>Save Scale</Text></TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          ) : (
            <TouchableOpacity style={styles.scaleToggle} activeOpacity={0.8} onPress={() => router.push('/paywall' as any)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <FontAwesome name="lock" size={12} color={COLORS.brand} />
                <Text style={styles.editScaleLink}>Customize grade scale</Text>
              </View>
              <View style={styles.lockedBadge}>
                <FontAwesome name="star" size={9} color="#fff" />
                <Text style={styles.lockedBadgeText}>PRO</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Edit color/icon */}
        {editing && (
          <View style={styles.editCard}>
            <Text style={styles.editLabel}>Color</Text>
            <View style={styles.colorGrid}>
              {COURSE_COLORS.map((c) => (
                <TouchableOpacity key={c} style={[styles.colorCircle, { backgroundColor: c }, editColor === c && styles.colorSelected]} onPress={() => setEditColor(c)}>
                  {editColor === c && <FontAwesome name="check" size={11} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.editLabel}>Icon</Text>
            <View style={styles.iconGrid}>
              {COURSE_ICONS.map((ic) => (
                <TouchableOpacity key={ic} style={[styles.iconBtn, editIcon === ic && { borderColor: editColor, backgroundColor: editColor + '15' }]} onPress={() => setEditIcon(ic)}>
                  <FontAwesome name={ic as any} size={16} color={editIcon === ic ? editColor : '#94a3b8'} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: editColor }]} onPress={saveEdit}>
                {updateCourse.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Actions */}
        {!editing && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={startEdit}>
              <FontAwesome name="pencil" size={14} color={COLORS.brand} /><Text style={styles.actionText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete}>
              <FontAwesome name="trash-o" size={14} color="#ef4444" /><Text style={[styles.actionText, { color: '#ef4444' }]}>Delete</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={[styles.addTaskBtn, { backgroundColor: course.color }]} onPress={() => router.push(`/task/new?courseId=${course.id}` as any)}>
              <FontAwesome name="plus" size={12} color="#fff" /><Text style={styles.addTaskText}>Add Task</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tasks */}
        <Text style={styles.sectionTitle}>Tasks ({tasks.length})</Text>
        {tasks.length === 0 ? (
          <View style={styles.emptyState}><Text style={styles.emptyText}>No tasks yet for this course</Text></View>
        ) : (
          tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onToggle={(opts) => toggleComplete.mutate({ id: task.id, is_completed: !task.is_completed, submitted_late: opts?.submitted_late })}
              onPress={() => router.push(`/task/${task.id}` as any)}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 100 },
  header: { borderRadius: 18, padding: 24, alignItems: 'center', marginBottom: 14 },
  headerIcon: { width: 64, height: 64, borderRadius: 18, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  headerSub: { fontSize: 14, color: '#64748b', marginTop: 2 },
  editTitle: { fontSize: 20, fontWeight: '700', color: '#0f172a', textAlign: 'center', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 4, width: '100%' },
  editSub: { fontSize: 14, color: '#64748b', textAlign: 'center', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingBottom: 4, marginTop: 4, width: '100%' },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 12 },
  statBadge: { alignItems: 'center' },
  statNum: { fontSize: 20, fontWeight: '800', color: '#f59e0b' },
  statLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  detailsCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 16, borderWidth: 0.5, borderColor: COLORS.line, marginBottom: 14, gap: 12 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailLabel: { fontSize: 11, fontWeight: '600', color: COLORS.ink3, letterSpacing: 0.3 },
  detailValue: { fontSize: 13, fontWeight: '500', color: COLORS.ink, marginTop: 1 },
  detailEmpty: { fontSize: 12, color: COLORS.ink3, fontStyle: 'italic', marginTop: 1 },
  detailDivider: { height: 0.5, backgroundColor: COLORS.line, marginVertical: 10 },
  gradeCard: { backgroundColor: '#fff', borderRadius: 18, padding: 20, borderWidth: 1, borderColor: '#edf0f7', marginBottom: 14 },
  scaleToggle: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  scaleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scaleItem: { fontSize: 12, color: '#64748b', fontWeight: '500', backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  editScaleLink: { fontSize: 13, color: COLORS.brand, fontWeight: '600', marginTop: 8 },
  scaleEditor: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  scaleEditorTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  scaleEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  scaleLetterInput: { width: 50, height: 38, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, textAlign: 'center', fontSize: 14, fontWeight: '600', color: '#111' },
  scaleMinInput: { flex: 1, height: 38, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, fontSize: 14, color: '#111' },
  addScaleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6 },
  addScaleText: { fontSize: 13, color: COLORS.brand, fontWeight: '600' },
  scaleActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  scaleCancelBtn: { flex: 1, height: 38, borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  scaleSaveBtn: { flex: 1, height: 38, borderRadius: 8, backgroundColor: COLORS.brand, justifyContent: 'center', alignItems: 'center' },
  editCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: '#edf0f7' },
  editLabel: { fontSize: 12, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorCircle: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  colorSelected: { borderWidth: 3, borderColor: 'rgba(255,255,255,0.8)' },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  iconBtn: { width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  saveBtn: { flex: 1, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  saveText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#eef2ff' },
  deleteBtn: { backgroundColor: '#fef2f2' },
  actionText: { fontSize: 13, fontWeight: '600', color: COLORS.brand },
  addTaskBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  addTaskText: { fontSize: 13, fontWeight: '600', color: '#fff' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 14, color: '#94a3b8' },
  lockedFeature: { alignItems: 'center', paddingVertical: 12 },
  lockedIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  lockedTitle: { fontSize: 16, fontWeight: '600', color: COLORS.ink, marginBottom: 4 },
  lockedDesc: { fontSize: 13, color: COLORS.ink3, textAlign: 'center', lineHeight: 18, maxWidth: 260 },
  lockedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.brand, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginTop: 12 },
  lockedBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
});
