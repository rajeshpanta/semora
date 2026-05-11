import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform, Keyboard, Linking,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import {
  useCourse, useTasks, useUpdateCourse, useDeleteCourse, useToggleTaskComplete,
  useCreateCourseMeeting, useUpdateCourseMeeting, useDeleteCourseMeeting,
  useCreateCourseOfficeHours, useUpdateCourseOfficeHours, useDeleteCourseOfficeHours,
  useLatestSyllabus,
} from '@/lib/queries';
import { TaskItem } from '@/components/TaskItem';
import { GradeCard } from '@/components/GradeCard';
import { ScheduleEditor, type ScheduleBlock, isNewBlock } from '@/components/ScheduleEditor';
import { COURSE_COLORS, COURSE_ICONS, COLORS, calculateGrade, DEFAULT_GRADE_SCALE } from '@/lib/constants';
import type { GradeThreshold } from '@/types/database';
import { useAppStore } from '@/store/appStore';
import { useColors } from '@/lib/theme';
import { formatMeetings } from '@/lib/schedule';

export default function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: course, isLoading } = useCourse(id!);
  const { data: tasks = [] } = useTasks({ courseId: id });
  const { data: syllabus } = useLatestSyllabus(id);
  const updateCourse = useUpdateCourse();
  const deleteCourse = useDeleteCourse();
  const toggleComplete = useToggleTaskComplete();
  const createMeeting = useCreateCourseMeeting();
  const updateMeeting = useUpdateCourseMeeting();
  const deleteMeeting = useDeleteCourseMeeting();
  const createOfficeHours = useCreateCourseOfficeHours();
  const updateOfficeHours = useUpdateCourseOfficeHours();
  const deleteOfficeHours = useDeleteCourseOfficeHours();
  const isPro = useAppStore((s) => s.isPro);
  const colors = useColors();

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editInstructor, setEditInstructor] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editIcon, setEditIcon] = useState('');
  // Multi-block schedule. Existing rows from the DB carry their real
  // id; new blocks the user adds get a "new-" id (see
  // ScheduleEditor.NEW_BLOCK_PREFIX). saveEdit diffs against the
  // course's joined course_meetings to compute create/update/delete.
  const [editMeetings, setEditMeetings] = useState<ScheduleBlock[]>([]);
  // Office hours reuse the same block shape; ScheduleBlock.kind is
  // ignored on save since the office hours table has no kind column.
  const [editOfficeHourBlocks, setEditOfficeHourBlocks] = useState<ScheduleBlock[]>([]);
  const [editingScale, setEditingScale] = useState(false);
  const [scaleRows, setScaleRows] = useState<GradeThreshold[]>([]);

  if (isLoading || !course) {
    return <View style={[styles.loading, { backgroundColor: colors.paper }]}><ActivityIndicator size="large" color={colors.brand} /></View>;
  }

  // Grade calculation
  const gradeScale = course.grade_scale || DEFAULT_GRADE_SCALE;
  const gradeTasks = tasks.map((t) => ({ weight: t.weight, score: t.score, is_extra_credit: t.is_extra_credit }));
  const { percentage, letter, weightAttempted, weightTotal } = calculateGrade(gradeTasks, gradeScale as GradeThreshold[]);
  const gradedCount = tasks.filter((t) => t.score != null).length;

  const startEdit = () => {
    setEditName(course.name);
    setEditInstructor(course.instructor || '');
    setEditColor(course.color);
    setEditIcon(course.icon);
    setEditMeetings(
      (course.course_meetings ?? []).map((m) => ({
        id: m.id,
        days_of_week: m.days_of_week,
        start_time: m.start_time,
        end_time: m.end_time,
        kind: m.kind,
      })),
    );
    setEditOfficeHourBlocks(
      (course.course_office_hours ?? []).map((o) => ({
        id: o.id,
        // The DB allows null days for "by appointment"; the editor
        // requires non-null. Coerce; the user can pick chips on edit.
        days_of_week: o.days_of_week ?? [],
        start_time: o.start_time,
        end_time: o.end_time,
        kind: 'lecture' as const, // ignored on save
      })),
    );
    setEditing(true);
  };

  const saveEdit = async () => {
    // Per-block sanity check before the DB course_meetings_time_order /
    // course_office_hours_time_order constraints fire. Skip blocks the
    // user added but never filled (no days picked) — those are dropped
    // at save time.
    const blocksToPersist = editMeetings.filter((m) => m.days_of_week.length > 0);
    // Office hours: drop new empty rows (user added a block and never filled
    // it), but keep existing empty-day rows. course_office_hours.days_of_week
    // is nullable per migration 018 to represent "by appointment" — the
    // Gemini parser writes those, and the editor coerces null → [] on load
    // for chip rendering. Filtering them out here would treat them as
    // user-removed and delete the row on every save.
    const ohToPersist = editOfficeHourBlocks.filter(
      (m) => !isNewBlock(m.id) || m.days_of_week.length > 0,
    );
    for (const m of [...blocksToPersist, ...ohToPersist]) {
      if (m.start_time && m.end_time && m.start_time >= m.end_time) {
        Alert.alert('Invalid schedule', 'End time must be after start time.');
        return;
      }
    }
    try {
      // 1. Update course-level fields. Schedule lives in course_meetings
      // (a child table), so this mutation doesn't carry days/times —
      // those go through the meeting mutations below.
      await updateCourse.mutateAsync({
        id: course.id,
        name: editName.trim(),
        instructor: editInstructor.trim() || undefined,
        color: editColor,
        icon: editIcon,
      } as any);

      // 2. Diff meetings: create new- blocks, delete originals not
      // present anymore, update existing blocks whose fields changed.
      const original = course.course_meetings ?? [];
      const keptIds = new Set(blocksToPersist.filter((m) => !isNewBlock(m.id)).map((m) => m.id));
      const toDelete = original.filter((m) => !keptIds.has(m.id));
      const toCreate = blocksToPersist.filter((m) => isNewBlock(m.id));
      const toUpdate = blocksToPersist.filter((m) => {
        if (isNewBlock(m.id)) return false;
        const orig = original.find((o) => o.id === m.id);
        if (!orig) return false;
        // Compare by stringifying days array — small enough that this
        // is cheaper than threading a deep-equal helper through.
        return (
          orig.kind !== m.kind ||
          orig.start_time !== m.start_time ||
          orig.end_time !== m.end_time ||
          JSON.stringify(orig.days_of_week) !== JSON.stringify(m.days_of_week)
        );
      });

      const meetingOps: Promise<unknown>[] = [
        ...toCreate.map((m) =>
          createMeeting.mutateAsync({
            course_id: course.id,
            days_of_week: m.days_of_week,
            start_time: m.start_time,
            end_time: m.end_time,
            kind: m.kind,
          }),
        ),
        ...toUpdate.map((m) =>
          updateMeeting.mutateAsync({
            id: m.id,
            days_of_week: m.days_of_week,
            start_time: m.start_time,
            end_time: m.end_time,
            kind: m.kind,
          }),
        ),
        ...toDelete.map((m) =>
          deleteMeeting.mutateAsync({ id: m.id, courseId: course.id }),
        ),
      ];

      // 3. Office hours diff — same shape as meetings, different table.
      // ScheduleBlock.kind is dropped since course_office_hours has no
      // kind column.
      const ohOriginal = course.course_office_hours ?? [];
      const ohKeptIds = new Set(ohToPersist.filter((m) => !isNewBlock(m.id)).map((m) => m.id));
      const ohToDelete = ohOriginal.filter((m) => !ohKeptIds.has(m.id));
      const ohToCreate = ohToPersist.filter((m) => isNewBlock(m.id));
      const ohToUpdate = ohToPersist.filter((m) => {
        if (isNewBlock(m.id)) return false;
        const orig = ohOriginal.find((o) => o.id === m.id);
        if (!orig) return false;
        return (
          orig.start_time !== m.start_time ||
          orig.end_time !== m.end_time ||
          JSON.stringify(orig.days_of_week ?? []) !== JSON.stringify(m.days_of_week)
        );
      });

      const ohOps: Promise<unknown>[] = [
        ...ohToCreate.map((m) =>
          createOfficeHours.mutateAsync({
            course_id: course.id,
            days_of_week: m.days_of_week,
            start_time: m.start_time,
            end_time: m.end_time,
          }),
        ),
        ...ohToUpdate.map((m) =>
          updateOfficeHours.mutateAsync({
            id: m.id,
            days_of_week: m.days_of_week,
            start_time: m.start_time,
            end_time: m.end_time,
          }),
        ),
        ...ohToDelete.map((m) =>
          deleteOfficeHours.mutateAsync({ id: m.id, courseId: course.id }),
        ),
      ];

      const results = await Promise.allSettled([...meetingOps, ...ohOps]);
      const rejections = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );
      if (rejections.length > 0) {
        // Log every reason — the alert only shows the first, but the
        // others are still useful in dev logs.
        for (const r of rejections) {
          console.warn('[saveEdit] schedule mutation rejected:', r.reason);
        }
        const firstMsg = String(
          (r => r?.message ?? r)(rejections[0].reason) ?? 'Unknown error',
        );
        Alert.alert(
          'Saved partially',
          `${rejections.length} of ${results.length} schedule change${
            results.length === 1 ? '' : 's'
          } didn't save.\n\n${firstMsg}`,
        );
      }

      Keyboard.dismiss();
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(
          rejections.length === 0
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        );
      }
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

  // Open the most recent uploaded syllabus in the system viewer.
  // Storage URLs are signed on demand (60s) so the bucket can stay
  // private. If the row exists but the file was never uploaded
  // successfully (Phase-6 catch path treats storage upload as
  // non-critical), the signed URL still resolves but yields a 404 —
  // surface that as a clear message rather than a silent failure.
  const handleViewSyllabus = async () => {
    if (!syllabus) return;
    try {
      const { data, error } = await supabase.storage
        .from('syllabi')
        .createSignedUrl(syllabus.storage_path, 60);
      if (error) throw error;
      if (!data?.signedUrl) {
        Alert.alert('Cannot open', 'The syllabus file is missing from storage.');
        return;
      }
      await Linking.openURL(data.signedUrl);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Failed to open syllabus.');
    }
  };

  const pendingCount = tasks.filter((t) => !t.is_completed).length;
  const doneCount = tasks.filter((t) => t.is_completed).length;
  const displayColor = editing ? editColor : course.color;
  const displayIcon = editing ? editIcon : course.icon;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        {/* Header */}
        <View style={[styles.header, { backgroundColor: displayColor + '12' }]}>
          <View style={[styles.headerIcon, { backgroundColor: displayColor + '25' }]}>
            <FontAwesome name={displayIcon as any} size={28} color={displayColor} />
          </View>
          {editing ? (
            <>
              <TextInput style={[styles.editTitle, { color: colors.ink, borderBottomColor: colors.line }]} value={editName} onChangeText={setEditName} placeholder="Course Name" placeholderTextColor={colors.ink3} />
              <TextInput style={[styles.editSub, { color: colors.ink2, borderBottomColor: colors.line }]} value={editInstructor} onChangeText={setEditInstructor} placeholder="Instructor" placeholderTextColor={colors.ink3} />
            </>
          ) : (
            <>
              <Text style={[styles.headerTitle, { color: colors.ink }]}>{course.name}</Text>
              {course.instructor && <Text style={[styles.headerSub, { color: colors.ink2 }]}>{course.instructor}</Text>}
            </>
          )}
          <View style={styles.statsRow}>
            <View style={styles.statBadge}><Text style={styles.statNum}>{pendingCount}</Text><Text style={[styles.statLabel, { color: colors.ink3 }]}>pending</Text></View>
            <View style={styles.statBadge}><Text style={[styles.statNum, { color: '#22c55e' }]}>{doneCount}</Text><Text style={[styles.statLabel, { color: colors.ink3 }]}>done</Text></View>
          </View>
        </View>

        {/* Course details — always show, tap empty card to edit. */}
        {!editing && (() => {
          const scheduleText = formatMeetings(course.course_meetings);
          const officeHoursText = formatMeetings(
            (course.course_office_hours ?? []).map((o) => ({
              days_of_week: o.days_of_week ?? [],
              start_time: o.start_time,
              end_time: o.end_time,
            })),
          );
          const hasAnyMeeting = !!scheduleText;
          const hasAnyOfficeHours = !!officeHoursText;
          return (
            <TouchableOpacity
              style={[styles.detailsCard, { backgroundColor: colors.card, borderColor: colors.line }]}
              onPress={!hasAnyMeeting && !hasAnyOfficeHours ? startEdit : undefined}
              activeOpacity={0.8}
            >
              <View style={styles.detailRow}>
                <FontAwesome name="clock-o" size={13} color={hasAnyMeeting ? colors.ink2 : colors.ink3} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, { color: colors.ink3 }]}>Class Schedule</Text>
                  {scheduleText ? (
                    <Text style={[styles.detailValue, { color: colors.ink }]}>{scheduleText}</Text>
                  ) : (
                    <Text style={[styles.detailEmpty, { color: colors.ink3 }]}>Tap Edit to add a schedule</Text>
                  )}
                </View>
              </View>
              <View style={[styles.detailDivider, { backgroundColor: colors.line }]} />
              <View style={styles.detailRow}>
                <FontAwesome name="building-o" size={13} color={hasAnyOfficeHours ? colors.ink2 : colors.ink3} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.detailLabel, { color: colors.ink3 }]}>Office Hours</Text>
                  {officeHoursText ? (
                    <Text style={[styles.detailValue, { color: colors.ink }]}>{officeHoursText}</Text>
                  ) : (
                    <Text style={[styles.detailEmpty, { color: colors.ink3 }]}>Tap Edit to add office hours</Text>
                  )}
                </View>
              </View>
              {/* Original syllabus link — only when a successful upload
                  exists. Tapping shorts out the parent's onPress (which
                  is the empty-card → startEdit shortcut) by handling
                  the press itself. */}
              {syllabus && (
                <>
                  <View style={[styles.detailDivider, { backgroundColor: colors.line }]} />
                  <TouchableOpacity
                    style={styles.detailRow}
                    onPress={handleViewSyllabus}
                    activeOpacity={0.7}
                  >
                    <FontAwesome name="file-text-o" size={13} color={colors.ink2} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.detailLabel, { color: colors.ink3 }]}>Syllabus</Text>
                      <Text style={[styles.detailValue, { color: course.color }]} numberOfLines={1}>
                        View original {syllabus.file_name ? `· ${syllabus.file_name}` : ''}
                      </Text>
                    </View>
                    <FontAwesome name="external-link" size={11} color={colors.ink3} />
                  </TouchableOpacity>
                </>
              )}
            </TouchableOpacity>
          );
        })()}

        {/* Grade summary */}
        <View style={[styles.gradeCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <GradeCard percentage={percentage} letter={letter} gradedCount={gradedCount} totalCount={tasks.length} weightAttempted={weightAttempted} weightTotal={weightTotal} />

          {/* Grade scale — Pro only */}
          {isPro ? (
            <>
              {!editingScale ? (
                <TouchableOpacity style={[styles.scaleToggle, { borderTopColor: colors.line }]} onPress={startEditScale}>
                  <View style={styles.scaleRow}>
                    {(gradeScale as GradeThreshold[]).map((g) => (
                      <Text key={g.letter} style={[styles.scaleItem, { color: colors.ink2 }]}>{g.letter}: {g.min}%+</Text>
                    ))}
                  </View>
                  <Text style={[styles.editScaleLink, { color: colors.brand }]}>Edit Scale</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.scaleEditor, { borderTopColor: colors.line }]}>
                  <Text style={[styles.scaleEditorTitle, { color: colors.ink }]}>Grade Scale</Text>
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
                    <FontAwesome name="plus" size={11} color={colors.brand} /><Text style={[styles.addScaleText, { color: colors.brand }]}>Add Row</Text>
                  </TouchableOpacity>
                  <View style={styles.scaleActions}>
                    <TouchableOpacity style={[styles.scaleCancelBtn, { borderColor: colors.line }]} onPress={() => setEditingScale(false)}><Text style={[styles.cancelText, { color: colors.ink2 }]}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity style={[styles.scaleSaveBtn, { backgroundColor: colors.brand }]} onPress={saveScale}><Text style={styles.saveText}>Save Scale</Text></TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          ) : (
            <TouchableOpacity style={[styles.scaleToggle, { borderTopColor: colors.line }]} activeOpacity={0.8} onPress={() => router.push('/paywall' as any)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <FontAwesome name="lock" size={12} color={colors.brand} />
                <Text style={[styles.editScaleLink, { color: colors.brand }]}>Customize grade scale</Text>
              </View>
              <View style={[styles.lockedBadge, { backgroundColor: colors.brand }]}>
                <FontAwesome name="star" size={9} color="#fff" />
                <Text style={styles.lockedBadgeText}>PRO</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Edit color/icon */}
        {editing && (
          <View style={[styles.editCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.editLabel, { color: colors.ink2, marginTop: 0 }]}>Schedule</Text>
            <ScheduleEditor
              value={editMeetings}
              onChange={setEditMeetings}
              accentColor={editColor}
              hint="Pick the days this class meets. Times are optional but power Today's class list. Add another meeting if you have a lab or discussion section on a different day."
            />
            <Text style={[styles.editLabel, { color: colors.ink2 }]}>Office hours</Text>
            <ScheduleEditor
              value={editOfficeHourBlocks}
              onChange={setEditOfficeHourBlocks}
              accentColor={editColor}
              showKind={false}
              noun="office hour block"
              hint="Optional. Add the days and times your instructor or TA holds office hours. Use the free-text field above for room or Zoom info."
            />
            <Text style={[styles.editLabel, { color: colors.ink2 }]}>Color</Text>
            <View style={styles.colorGrid}>
              {COURSE_COLORS.map((c) => (
                <TouchableOpacity key={c} style={[styles.colorCircle, { backgroundColor: c }, editColor === c && styles.colorSelected]} onPress={() => setEditColor(c)}>
                  {editColor === c && <FontAwesome name="check" size={11} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.editLabel, { color: colors.ink2 }]}>Icon</Text>
            <View style={styles.iconGrid}>
              {COURSE_ICONS.map((ic) => (
                <TouchableOpacity key={ic} style={[styles.iconBtn, { borderColor: colors.line }, editIcon === ic && { borderColor: editColor, backgroundColor: editColor + '15' }]} onPress={() => setEditIcon(ic)}>
                  <FontAwesome name={ic as any} size={16} color={editIcon === ic ? editColor : colors.ink3} />
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.editActions}>
              <TouchableOpacity style={[styles.cancelBtn, { borderColor: colors.line }]} onPress={() => setEditing(false)}><Text style={[styles.cancelText, { color: colors.ink2 }]}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: editColor }]} onPress={saveEdit}>
                {updateCourse.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Actions */}
        {!editing && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.brand50 }]} onPress={startEdit}>
              <FontAwesome name="pencil" size={14} color={colors.brand} /><Text style={[styles.actionText, { color: colors.brand }]}>Edit</Text>
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
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Tasks ({tasks.length})</Text>
        {tasks.length === 0 ? (
          <View style={styles.emptyState}><Text style={[styles.emptyText, { color: colors.ink3 }]}>No tasks yet for this course</Text></View>
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
