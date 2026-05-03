import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert,
  ActivityIndicator, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAppStore, findCurrentSemester } from '@/store/appStore';
import { useSemesters, useCourses, useTasks, useDeleteSemester } from '@/lib/queries';
import { COLORS, calculateGrade, DEFAULT_GRADE_SCALE } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { differenceInDays, isToday, isPast, format } from 'date-fns';
import type { GradeThreshold } from '@/types/database';
import type { TaskWithCourse } from '@/lib/queries';

export default function CoursesScreen() {
  const colors = useColors();
  const router = useRouter();
  const [showPicker, setShowPicker] = useState(false);

  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);

  const { data: semesters = [], isLoading: semestersLoading } = useSemesters();
  const deleteSemester = useDeleteSemester();
  const { data: courses = [] } = useCourses(selectedSemesterId);
  const { data: tasks = [] } = useTasks(selectedSemesterId ? { semesterId: selectedSemesterId } : { semesterId: null });

  useEffect(() => {
    if (semesters.length === 0) return;
    if (!selectedSemesterId || !semesters.some((s) => s.id === selectedSemesterId)) setSelectedSemester(findCurrentSemester(semesters));
  }, [semesters, selectedSemesterId]);

  const activeSemester = semesters.find((s) => s.id === selectedSemesterId);

  const handleNav = (route: string) => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  // The + button surfaces both creation paths: AI scan (Gemini-backed,
  // fills name + instructor + schedule + tasks from a syllabus) and
  // manual entry (no syllabus on hand, or class hasn't published one).
  // The Scan tab in the bottom nav stays as a direct entry point for
  // users who land with a syllabus already in hand.
  const handleAddCourse = () => {
    Alert.alert(
      'Add a course',
      'Scan a syllabus and the AI fills everything in — or type it yourself.',
      [
        { text: 'Scan syllabus', onPress: () => handleNav('/scan') },
        { text: 'Add manually', onPress: () => handleNav('/course/new') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleSelectSemester = (id: string) => {
    setSelectedSemester(id);
    setShowPicker(false);
    if (Platform.OS === 'ios') Haptics.selectionAsync();
  };

  // Per-row management menu in the picker modal. Single hub for edit /
  // delete on any semester (active or not). Closing the picker before
  // navigating to /semester/[id] avoids the modal lingering over the
  // edit screen.
  const handleSemesterMenu = (s: typeof semesters[0]) => {
    Alert.alert(s.name, undefined, [
      {
        text: 'Edit',
        onPress: () => {
          setShowPicker(false);
          router.push(`/semester/${s.id}` as any);
        },
      },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => confirmDeleteSemester(s),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmDeleteSemester = (s: typeof semesters[0]) => {
    Alert.alert(
      'Delete Semester',
      `Delete "${s.name}" and all its courses and tasks? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSemester.mutateAsync(s.id);
              // If we deleted the active semester, clear selection so
              // the useEffect at the top picks a new one (or shows
              // the empty state when nothing's left).
              if (s.id === selectedSemesterId) {
                setSelectedSemester(null);
              }
              setShowPicker(false);
            } catch (err: any) {
              Alert.alert('Delete Failed', err.message ?? 'Something went wrong. Please try again.');
            }
          },
        },
      ],
    );
  };

  // Helpers per course
  const getCourseTasks = (courseId: string) => tasks.filter((t) => t.course_id === courseId);
  const getNextTask = (courseId: string) => {
    const ct = getCourseTasks(courseId).filter((t) => !t.is_completed);
    ct.sort((a, b) => a.due_date.localeCompare(b.due_date));
    return ct[0] || null;
  };
  const getPendingCount = (courseId: string) => getCourseTasks(courseId).filter((t) => !t.is_completed).length;

  function getDueLabel(task: TaskWithCourse): { text: string; urgent: boolean } {
    const due = new Date(task.due_date + 'T00:00:00');
    const now = new Date();
    if (isToday(due)) return { text: task.due_time ? `due ${task.due_time.slice(0, 5)}` : 'due today', urgent: true };
    if (isPast(due)) return { text: 'overdue', urgent: true };
    const days = differenceInDays(due, now);
    if (days === 1) return { text: 'tomorrow', urgent: true };
    if (days <= 3) return { text: `${days} days`, urgent: true };
    return { text: `in ${days} days`, urgent: false };
  }

  function getSemesterDateLabel(s: typeof semesters[0]): string {
    if (!s.start_date && !s.end_date) return '';
    const parts: string[] = [];
    if (s.start_date) parts.push(format(new Date(s.start_date + 'T00:00:00'), 'MMM yyyy'));
    if (s.end_date) parts.push(format(new Date(s.end_date + 'T00:00:00'), 'MMM yyyy'));
    return parts.join(' – ');
  }

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
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.ink }]}>Courses</Text>

            {/* Semester selector — single hub for switch / edit / delete /
                create. Always tappable when a semester exists, even with
                only one, since the picker modal is also where edit and
                delete live now. */}
            {activeSemester ? (
              <TouchableOpacity
                style={styles.semesterSelector}
                onPress={() => setShowPicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.semesterName, { color: colors.ink2 }]}>{activeSemester.name}</Text>
                <FontAwesome name="chevron-down" size={10} color={colors.ink3} style={{ marginLeft: 4 }} />
                <View style={[styles.courseCountBadge, { backgroundColor: colors.brand50 }]}>
                  <Text style={[styles.courseCountText, { color: colors.brand }]}>{courses.length}</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <Text style={[styles.subtitle, { color: colors.ink3 }]}>No semester selected</Text>
            )}
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.brand }]} onPress={handleAddCourse} activeOpacity={0.8}>
              <FontAwesome name="plus" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Course cards */}
        {courses.length > 0 ? (
          <View style={styles.courseList}>
            {courses.map((course) => {
              const courseTasks = getCourseTasks(course.id);
              const nextTask = getNextTask(course.id);
              const pendingCount = getPendingCount(course.id);
              const scale = (course.grade_scale || DEFAULT_GRADE_SCALE) as GradeThreshold[];
              const gradeTasks = courseTasks.map((t) => ({ weight: t.weight, score: t.score, is_extra_credit: t.is_extra_credit }));
              const { percentage } = calculateGrade(gradeTasks, scale);
              const dueInfo = nextTask ? getDueLabel(nextTask) : null;

              // A course "needs schedule" when it has no structured
              // course_meetings rows — without them the Today tab can't
              // surface this class. Tapping the card goes to detail
              // where Edit is one tap away.
              const needsSchedule = (course.course_meetings ?? []).length === 0;
              return (
                <TouchableOpacity
                  key={course.id}
                  style={[styles.courseCard, { backgroundColor: colors.card, borderColor: colors.line }]}
                  onPress={() => router.push(`/course/${course.id}` as any)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.colorStrip, { backgroundColor: course.color }]} />
                  <View style={styles.courseTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.courseCode, { color: course.color }]}>{course.name}</Text>
                      {course.instructor && <Text style={[styles.courseInstructor, { color: colors.ink3 }]}>{course.instructor}</Text>}
                    </View>
                    <View style={[styles.upNextBadge, { backgroundColor: course.color + '15' }]}>
                      <Text style={[styles.upNextText, { color: course.color }]}>{pendingCount} UP NEXT</Text>
                    </View>
                  </View>
                  {needsSchedule && (
                    <View style={[styles.needsScheduleRow, { borderTopColor: colors.line, backgroundColor: colors.amber50 }]}>
                      <FontAwesome name="calendar-o" size={12} color={colors.amber} />
                      <Text style={[styles.needsScheduleText, { color: colors.amber }]}>
                        No schedule yet — won't appear on Today
                      </Text>
                      <Text style={[styles.needsScheduleAction, { color: colors.amber }]}>Add →</Text>
                    </View>
                  )}
                  {nextTask && (
                    <View style={[styles.nextRow, { borderTopColor: colors.line }]}>
                      <FontAwesome
                        name={nextTask.type === 'exam' ? 'exclamation-circle' : 'clock-o'}
                        size={13}
                        color={dueInfo?.urgent ? colors.coral : colors.ink3}
                      />
                      <Text style={[styles.nextTitle, { color: colors.ink }]} numberOfLines={1}>
                        <Text style={{ fontWeight: '500' }}>{nextTask.title}</Text>
                        {nextTask.due_time ? <Text style={{ color: colors.ink3 }}> · {nextTask.due_time.slice(0, 5)}</Text> : null}
                      </Text>
                      <Text style={[styles.nextDue, { color: colors.ink3 }, dueInfo?.urgent && { color: colors.coral, fontWeight: '600' }]}>
                        {dueInfo?.text}
                      </Text>
                    </View>
                  )}
                  {percentage !== null && (
                    <View style={styles.progressRow}>
                      <View style={[styles.progressBg, { backgroundColor: colors.line }]}>
                        <View style={[styles.progressFill, { width: `${Math.min(percentage, 100)}%`, backgroundColor: course.color }]} />
                      </View>
                      <Text style={[styles.progressText, { color: colors.ink3 }]}>{percentage}%</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : selectedSemesterId ? (
          <TouchableOpacity style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={handleAddCourse} activeOpacity={0.7}>
            <FontAwesome name="book" size={24} color={colors.ink3} />
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>No courses yet</Text>
            <Text style={[styles.emptyText, { color: colors.ink3 }]}>Tap to add your first course</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={() => handleNav('/semester/new')} activeOpacity={0.7}>
            <FontAwesome name="graduation-cap" size={24} color={colors.ink3} />
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>No semester</Text>
            <Text style={[styles.emptyText, { color: colors.ink3 }]}>Create a semester to get started</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Semester dropdown modal */}
      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowPicker(false)}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.ink }]}>Select Semester</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)} hitSlop={12}>
                <FontAwesome name="times" size={16} color={colors.ink3} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {semesters.map((s, i) => {
                const isSelected = s.id === selectedSemesterId;
                const dateLabel = getSemesterDateLabel(s);
                return (
                  // Row split into two press targets: the main area
                  // switches the active semester, the trailing ⋯ button
                  // opens the edit / delete menu. Two siblings (rather
                  // than nested TouchableOpacities) so the menu tap
                  // doesn't also fire the row-switch handler.
                  <View
                    key={s.id}
                    style={[styles.modalRow, i < semesters.length - 1 && [styles.modalRowBorder, { borderBottomColor: colors.line }]]}
                  >
                    <TouchableOpacity
                      style={styles.modalRowMain}
                      onPress={() => handleSelectSemester(s.id)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.modalRowName, { color: colors.ink }, isSelected && { color: colors.brand }]}>{s.name}</Text>
                        {dateLabel ? <Text style={[styles.modalRowDate, { color: colors.ink3 }]}>{dateLabel}</Text> : null}
                      </View>
                      {isSelected && <FontAwesome name="check" size={14} color={colors.brand} />}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.modalRowMenu}
                      onPress={() => handleSemesterMenu(s)}
                      activeOpacity={0.6}
                      hitSlop={8}
                      accessibilityLabel={`Manage ${s.name}`}
                    >
                      <FontAwesome name="ellipsis-h" size={14} color={colors.ink3} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </ScrollView>

            <TouchableOpacity style={[styles.modalAddBtn, { borderTopColor: colors.line }]} onPress={() => { setShowPicker(false); handleNav('/semester/new'); }}>
              <FontAwesome name="plus" size={12} color={colors.brand} />
              <Text style={[styles.modalAddText, { color: colors.brand }]}>New Semester</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 18, paddingBottom: 120 },

  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  title: { fontSize: 26, fontWeight: '700', color: COLORS.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: COLORS.ink3, marginTop: 4 },
  semesterSelector: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  semesterName: { fontSize: 15, fontWeight: '500', color: COLORS.ink2 },
  courseCountBadge: { marginLeft: 8, backgroundColor: COLORS.brand50, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8 },
  courseCountText: { fontSize: 12, fontWeight: '700', color: COLORS.brand },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.brand, justifyContent: 'center', alignItems: 'center' },

  // Course cards
  courseList: { gap: 10 },
  courseCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 14, borderWidth: 0.5, borderColor: COLORS.line, position: 'relative', overflow: 'hidden' },
  colorStrip: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  courseTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  courseCode: { fontSize: 15, fontWeight: '500', marginTop: 1 },
  courseInstructor: { fontSize: 14, color: COLORS.ink3, marginTop: 3 },
  upNextBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  upNextText: { fontSize: 14, fontWeight: '600' },
  needsScheduleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 10, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8,
  },
  needsScheduleText: { flex: 1, fontSize: 12, fontWeight: '500' },
  needsScheduleAction: { fontSize: 12, fontWeight: '700' },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, marginTop: 10, borderTopWidth: 0.5, borderTopColor: COLORS.line },
  nextTitle: { flex: 1, fontSize: 14, color: COLORS.ink },
  nextDue: { fontSize: 14, color: COLORS.ink3, fontWeight: '500' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  progressBg: { flex: 1, height: 4, backgroundColor: COLORS.line, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
  progressText: { fontSize: 14, color: COLORS.ink3, fontWeight: '500' },

  // Empty states
  emptyCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 32, alignItems: 'center', gap: 6, borderWidth: 0.5, borderColor: COLORS.line },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.ink },
  emptyText: { fontSize: 14, color: COLORS.ink3 },

  // Semester dropdown modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 28 },
  modalContent: { backgroundColor: COLORS.card, borderRadius: 22, paddingTop: 20, paddingBottom: 8, maxHeight: 400 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 },
  modalTitle: { fontSize: 17, fontWeight: '600', color: COLORS.ink },
  modalList: { paddingHorizontal: 20 },
  modalRow: { flexDirection: 'row', alignItems: 'center' },
  modalRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  modalRowMenu: { paddingVertical: 14, paddingHorizontal: 12, marginLeft: 4 },
  modalRowBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  modalRowName: { fontSize: 15, fontWeight: '500', color: COLORS.ink },
  modalRowDate: { fontSize: 13, color: COLORS.ink3, marginTop: 2 },
  modalAddBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, marginHorizontal: 20, marginTop: 4, borderTopWidth: 0.5, borderTopColor: COLORS.line },
  modalAddText: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
});
