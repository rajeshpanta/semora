import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text } from '@/components/LocalizedReactNative';
import {
  useCallback,
  useEffect,
  useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useAppStore, findCurrentSemester } from '@/store/appStore';
import { useSemesters, useCourses, useTasks, useDeleteSemester, useGpaScale, useSemesterGradeCategories } from '@/lib/queries';
import { COLORS, FONTS, DEFAULT_GRADE_SCALE, SCREEN_MAX_WIDTH, WEB_CARD_SHADOW } from '@/lib/constants';
import { calculateCourseGrade, calculateSemesterGpaWithScale, DEFAULT_GPA_SCALE } from '@/lib/grades';
import { useColors } from '@/lib/theme';
import CourseCard, { formatMeetings, type CourseCardData } from '@/components/CourseCard';
import AppHeader from '@/components/AppHeader';
import { canvasFreePromoQuery, canvasOfferFor, lmsConnectionsQuery } from '@/lib/lms';
import { ProUpsellSheet } from '@/components/ProUpsellSheet';
import { track } from '@/lib/analytics';
import { useResponsive } from '@/lib/responsive';
import { differenceInCalendarDays, isToday, isPast, format } from 'date-fns';
import type { GradeThreshold } from '@/types/database';
import type { TaskWithCourse } from '@/lib/queries';
import { GlobalSearchButton } from '@/components/GlobalSearchButton';

// Grid geometry, shared by the tile width calculation and the container's gap
// so the two can never drift apart. CONTENT_PADDING mirrors styles.content.
const CONTENT_PADDING = 18;
const GRID_GAP = 12;

export default function CoursesScreen() {
  const colors = useColors();
  const { contentMaxWidth, deckMaxWidth, isDesktop, isWide, isXWide, width } = useResponsive();
  const router = useRouter();
  const [showPicker, setShowPicker] = useState(false);
  const [showGrades, setShowGrades] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    queryClient.invalidateQueries().then(() => setRefreshing(false));
  }, [queryClient]);

  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);
  const coursesView = useAppStore((s) => s.coursesView);
  const setCoursesView = useAppStore((s) => s.setCoursesView);
  const isGrid = coursesView === 'grid';

  // Exactly two tiles per row, at a measured width rather than a percentage.
  //
  // flexBasis + flexGrow got this wrong in the obvious case: with three
  // courses the lone tile on the second row stretched to fill the space and
  // stopped matching the two above it. A computed width makes every tile
  // identical whatever the count, and never reflows to three across on a
  // wider phone — two is the density that keeps a course name readable.
  const gridColumnWidth = Math.min(width, deckMaxWidth) - CONTENT_PADDING * 2;
  const tileWidth = Math.floor((gridColumnWidth - GRID_GAP) / 2);
  // Under ~380pt (SE, mini, a narrow Split View) a half-width tile is about
  // 150pt across. The same type that reads comfortably on a Pro truncates a
  // course name to two words there, so the tile tightens rather than clipping.
  const compactTile = width < 380;

  const { data: semesters = [], isLoading: semestersLoading } = useSemesters();
  const deleteSemester = useDeleteSemester();
  const { data: courses = [] } = useCourses(selectedSemesterId);
  const isPro = useAppStore((st) => st.isPro);
  const [canvasUpsell, setCanvasUpsell] = useState(false);
  const { data: lmsConnections } = useQuery(lmsConnectionsQuery);
  const { data: canvasFreePromo } = useQuery(canvasFreePromoQuery);
  const { offer: canvasOffer, free: canvasFree } = canvasOfferFor(lmsConnections, isPro, canvasFreePromo);
  const { data: tasks = [] } = useTasks(selectedSemesterId ? { semesterId: selectedSemesterId } : { semesterId: null });
  const { data: gradeCategories = [] } = useSemesterGradeCategories(selectedSemesterId);
  const { data: gpaScale = DEFAULT_GPA_SCALE } = useGpaScale();

  useEffect(() => {
    if (semesters.length === 0) return;
    if (!selectedSemesterId || !semesters.some((s) => s.id === selectedSemesterId)) setSelectedSemester(findCurrentSemester(semesters));
  }, [semesters, selectedSemesterId]);

  const activeSemester = semesters.find((s) => s.id === selectedSemesterId);

  const handleNav = (route: string) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route as any);
  };

  // The + button surfaces both creation paths: AI scan (Luna-backed,
  // fills name + instructor + schedule + tasks from a syllabus) and
  // manual entry (no syllabus on hand, or class hasn't published one).
  // The Scan tab in the bottom nav stays as a direct entry point for
  // users who land with a syllabus already in hand.
  const handleAddCourse = () => {
    // Canvas leads when it is worth offering.
    //
    // A student who connects Canvas never has to scan that course at all, and
    // their deadlines keep updating when the instructor moves them — so
    // offering it AFTER scanning is offering it too late. It is listed first
    // for the same reason it is first in the "+" menu.
    //
    // Suppressed once Canvas is connected and syncing: someone who already did
    // this should not be asked again every time they add a course.
    const canvasOption =
      canvasOffer === 'healthy'
        ? []
        : [{
            text:
              canvasOffer === 'needs_attention' ? 'Finish Canvas setup'
              // Adding a course is exactly when someone would want to know
              // Canvas already has classes waiting to be imported.
              : canvasOffer === 'new_courses' ? 'Import new Canvas courses'
              : canvasOffer === 'locked' ? 'Connect Canvas (Pro)'
              // The price is the headline while the offer is on. "(Free)" sits
              // where "(Pro)" sat, so the row reads as the same offer with the
              // wall taken out rather than as a different feature.
              : canvasFree ? 'Connect Canvas (Free)'
              : 'Connect Canvas',
            onPress: () => {
              track('canvas_offer_tapped', { screen: 'courses', offer: canvasOffer, free: canvasFree });
              // Free account: the upgrade sheet, right here. Sending someone
              // to another screen to find out something costs money turns one
              // tap into a journey.
              if (canvasOffer === 'locked') {
                setCanvasUpsell(true);
                return;
              }
              handleNav(canvasOffer === 'new_courses' ? '/settings/lms/new-courses' : '/settings/lms');
            },
          }];
    Alert.alert(
      'Add a course',
      canvasFree && canvasOffer === 'none'
        ? 'Limited time: Canvas sync is free, no Pro needed. Every class you have arrives on its own — or scan a syllabus, or type it yourself.'
        : canvasOffer === 'none' || canvasOffer === 'locked'
        ? 'Connect Canvas and your classes arrive on their own — or scan a syllabus, or type it yourself.'
        : 'Scan a syllabus and the AI fills everything in — or type it yourself.',
      [
        ...canvasOption,
        { text: 'Scan syllabus', onPress: () => handleNav('/scan') },
        { text: 'Add manually', onPress: () => handleNav('/course/new') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleSelectSemester = (id: string) => {
    setSelectedSemester(id);
    setShowPicker(false);
    if (Platform.OS !== 'web') Haptics.selectionAsync();
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
  const getOverdueCount = (courseId: string) => {
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    return getCourseTasks(courseId).filter((t) => !t.is_completed && t.due_date < todayKey).length;
  };

  // Courses in the order they need you: most overdue first, then most
  // pending, then alphabetical. A course list sorted by creation date makes
  // the student do the triage the screen could have done for them.
  const orderedCourses = [...courses].sort((a, b) => {
    const overdue = getOverdueCount(b.id) - getOverdueCount(a.id);
    if (overdue !== 0) return overdue;
    const pending = getPendingCount(b.id) - getPendingCount(a.id);
    if (pending !== 0) return pending;
    return a.name.localeCompare(b.name);
  });

  // ONE prompt, not one per card. The old card put a full-width amber warning
  // inside every course missing class times, so four such courses shouted the
  // same sentence four times and became the loudest thing on the screen.
  const missingSchedule = courses.filter((c) => (c.course_meetings ?? []).length === 0);
  const courseGradeSummaries = courses.map((course) => {
    const courseTasks = getCourseTasks(course.id);
    const scale = (course.grade_scale || DEFAULT_GRADE_SCALE) as GradeThreshold[];
    const grade = calculateCourseGrade(
      courseTasks.map((task) => ({
        id: task.id,
        grade_category_id: task.grade_category_id,
        weight: task.weight,
        score: task.score,
        points_earned: task.points_earned,
        points_possible: task.points_possible,
        is_extra_credit: task.is_extra_credit,
      })),
      gradeCategories.filter((category) => category.course_id === course.id),
      scale,
      course.extra_credit_policy || 'bonus',
    );
    return { courseId: course.id, ...grade, creditHours: course.credit_hours ?? 3 };
  });
  const gradeByCourse = new Map(courseGradeSummaries.map((grade) => [grade.courseId, grade]));
  const semesterGpa = calculateSemesterGpaWithScale(courseGradeSummaries, gpaScale);

  function getDueLabel(task: TaskWithCourse): { text: string; urgent: boolean } {
    const due = new Date(task.due_date + 'T00:00:00');
    const now = new Date();
    if (isToday(due)) return { text: task.due_time ? `due ${task.due_time.slice(0, 5)}` : 'due today', urgent: true };
    if (isPast(due)) return { text: 'overdue', urgent: true };
    // Calendar diff — `due` is midnight, so a 24h-period diff truncated
    // to 0 for tomorrow ("tomorrow" was unreachable, showed "0 days").
    const days = differenceInCalendarDays(due, now);
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
      <ProUpsellSheet
        visible={canvasUpsell}
        reason="canvas"
        onClose={() => setCanvasUpsell(false)}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: deckMaxWidth }]}
        showsVerticalScrollIndicator={false}
        // Courses is a primary tab and was the only one without pull-to-refresh
        // — a student looking at a stale grade had to leave the screen to do
        // anything about it. Matches Today's handler exactly.
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />
        }
      >

        {/* Header */}
        {/* Desktop web only — see components/AppHeader.tsx. Native keeps
            the header it shipped with. */}
        {isDesktop ? (
        <AppHeader
            title="Courses"
            context={
              activeSemester ? (
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
              )
            }
            actions={
              <>
                {/* Layout toggle. Only worth showing once there is something to
                    lay out — on an empty semester it is a control over nothing. */}
                {courses.length > 0 && (
                  <View style={[styles.viewToggle, { borderColor: colors.line, backgroundColor: colors.card }]}>
                    {(['list', 'grid'] as const).map((mode) => {
                      const active = coursesView === mode;
                      return (
                        <TouchableOpacity
                          key={mode}
                          style={[styles.viewToggleBtn, active && { backgroundColor: colors.brand50 }]}
                          onPress={() => setCoursesView(mode)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          accessibilityLabel={mode === 'list' ? 'List view' : 'Grid view'}
                        >
                          <FontAwesome
                            name={mode === 'list' ? 'bars' : 'th-large'}
                            size={13}
                            color={active ? colors.brand : colors.ink3}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
                {courses.length > 0 && (
                  <TouchableOpacity
                    style={[styles.gradeToggle, { borderColor: colors.line, backgroundColor: colors.card }]}
                    onPress={() => setShowGrades((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={showGrades ? 'Hide grades' : 'Show grades'}
                  >
                    <FontAwesome name={showGrades ? 'eye-slash' : 'eye'} size={12} color={colors.ink3} />
                    <Text style={[styles.gradeToggleText, { color: colors.ink3 }]}>
                      {showGrades ? 'Hide grades' : 'Show grades'}
                    </Text>
                  </TouchableOpacity>
                )}
                <GlobalSearchButton />
                <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.brand }]} onPress={handleAddCourse} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Add a course">
                  <FontAwesome name="plus" size={14} color="#fff" />
                </TouchableOpacity>
              </>
            }
          />
        ) : (
          <>
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
              {/* Layout toggle. Only worth showing once there is something to
                  lay out — on an empty semester it is a control over nothing. */}
              {courses.length > 0 && (
                <View style={[styles.viewToggle, { borderColor: colors.line, backgroundColor: colors.card }]}>
                  {(['list', 'grid'] as const).map((mode) => {
                    const active = coursesView === mode;
                    return (
                      <TouchableOpacity
                        key={mode}
                        style={[styles.viewToggleBtn, active && { backgroundColor: colors.brand50 }]}
                        onPress={() => setCoursesView(mode)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={mode === 'list' ? 'List view' : 'Grid view'}
                      >
                        <FontAwesome
                          name={mode === 'list' ? 'bars' : 'th-large'}
                          size={13}
                          color={active ? colors.brand : colors.ink3}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <GlobalSearchButton />
              <TouchableOpacity style={[styles.addBtn, { backgroundColor: colors.brand }]} onPress={handleAddCourse} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Add a course">
                <FontAwesome name="plus" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          </>
        )}

        {/* Only when there is a GPA to report. It used to render regardless,
            so a student with no marked work gave a whole banner to the
            sentence "Add grades to completed work to begin tracking" — an
            instruction, styled as a statistic, above the actual content. */}
        {courses.length > 0 && (!isDesktop || semesterGpa.gpa != null) && (
          <View style={[styles.gpaCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={[styles.gpaIcon, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name="graduation-cap" size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.gpaLabel, { color: colors.ink3 }]}>CURRENT SEMESTER GPA ESTIMATE</Text>
              {semesterGpa.gpa != null ? (
                <Text style={[styles.gpaMeta, { color: colors.ink2 }]}>
                  {semesterGpa.reportingCourses} of {courses.length} courses · {semesterGpa.reportingCredits} graded credits
                </Text>
              ) : (
                <Text style={[styles.gpaMeta, { color: colors.ink2 }]}>Add grades to completed work to begin tracking.</Text>
              )}
            </View>
            <Text style={[styles.gpaValue, { color: semesterGpa.gpa != null ? colors.brand : colors.ink3 }]}>
              {semesterGpa.gpa != null ? semesterGpa.gpa.toFixed(2) : '—'}
            </Text>
          </View>
        )}

        {isDesktop && missingSchedule.length > 0 && (
          <TouchableOpacity
            style={[styles.setupBanner, { backgroundColor: colors.amber50, borderColor: colors.amber }]}
            onPress={() => router.push(`/course/${missingSchedule[0].id}/edit` as any)}
            accessibilityRole="button"
          >
            <FontAwesome name="calendar-o" size={14} color={colors.amber} />
            <Text style={[styles.setupText, { color: colors.ink2 }]}>
              {missingSchedule.length === 1
                ? `${missingSchedule[0].name} has no class times yet, so it won't appear on Today.`
                : `${missingSchedule.length} courses have no class times yet, so they won't appear on Today.`}
            </Text>
            <Text style={[styles.setupAction, { color: colors.amber }]}>Add times</Text>
          </TouchableOpacity>
        )}

        {/* Course cards */}
        {courses.length > 0 ? (
          <View style={[
            isGrid ? styles.courseGrid : styles.courseList,
            !isGrid && isWide && styles.courseListWide,
          ]}>
            {(isDesktop ? orderedCourses : courses).map((course) => {
              const courseTasks = getCourseTasks(course.id);
              const nextTask = getNextTask(course.id);
              const pendingCount = getPendingCount(course.id);
              const { percentage, letter } = gradeByCourse.get(course.id) || { percentage: null, letter: null };
              const dueInfo = nextTask ? getDueLabel(nextTask) : null;

              // A course "needs schedule" when it has no structured
              // course_meetings rows — without them the Today tab can't
              // surface this class. Tapping the card goes to detail
              // where Edit is one tap away.
              const needsSchedule = (course.course_meetings ?? []).length === 0;

              // Canvas-style tile: a colour block you recognise from across the
              // room, then the name. Deliberately NOT the list card at half
              // width — a dense row squeezed into a column reads worse than
              // either layout done properly. The tile keeps the two numbers a
              // student actually scans for (what's pending, where the grade is)
              // and drops the rest; the detail screen is one tap away.
              if (isGrid) {
                return (
                  <TouchableOpacity
                    key={course.id}
                    style={[
                      styles.gridTile,
                      { width: tileWidth, backgroundColor: colors.card, borderColor: colors.line },
                    ]}
                    onPress={() => router.push(`/course/${course.id}` as any)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${course.name}, ${pendingCount} pending`}
                  >
                    <View style={[styles.gridBanner, compactTile && styles.gridBannerCompact, { backgroundColor: course.color }]}>
                      {needsSchedule && (
                        <View style={styles.gridBannerFlag}>
                          <FontAwesome name="calendar-o" size={11} color="#fff" />
                        </View>
                      )}
                    </View>
                    <View style={[styles.gridBody, compactTile && styles.gridBodyCompact]}>
                      <Text
                        style={[styles.gridName, compactTile && styles.gridNameCompact, { color: colors.ink }]}
                        numberOfLines={2}
                      >
                        {course.name}
                      </Text>
                      {course.instructor ? (
                        <Text style={[styles.gridInstructor, { color: colors.ink3 }]} numberOfLines={1}>
                          {course.instructor}
                        </Text>
                      ) : null}
                      <View style={styles.gridFooter}>
                        <Text style={[styles.gridPending, { color: pendingCount > 0 ? course.color : colors.ink3 }]}>
                          {pendingCount > 0 ? `${pendingCount} due` : 'All clear'}
                        </Text>
                        {percentage !== null && (
                          <Text style={[styles.gridGrade, { color: colors.ink2 }]}>
                            {letter ? `${letter} · ` : ''}{percentage}%
                          </Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              }

              // Desktop web gets the redesigned card; native keeps the one
              // it shipped with. See components/CourseCard.tsx for why the
              // desktop version exists.
              if (!isDesktop) {
                return (
                  <TouchableOpacity
                    key={course.id}
                    style={[styles.courseCard, isWide && styles.courseCardWide, { backgroundColor: colors.card, borderColor: colors.line }]}
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
                        <Text style={[styles.progressText, { color: colors.ink3 }]}>{letter ? `${letter} · ` : ''}{percentage}%</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }

              const cardData: CourseCardData = {
                id: course.id,
                name: course.name,
                color: course.color,
                instructor: course.instructor,
                meetingLabel: formatMeetings(course.course_meetings),
                overdueCount: getOverdueCount(course.id),
                pendingCount,
                completedCount: courseTasks.filter((t) => t.is_completed).length,
                totalCount: courseTasks.length,
                nextTitle: nextTask?.title ?? null,
                nextDue: dueInfo?.text ?? null,
                nextUrgent: !!dueInfo?.urgent,
                nextIsExam: nextTask?.type === 'exam',
                gradeLetter: letter,
                gradePercent: percentage,
              };
              return (
                <CourseCard
                  key={course.id}
                  course={cardData}
                  showGrade={showGrades}
                  width={isXWide ? '32%' : isWide ? '48.5%' : undefined}
                  onPress={() => router.push(`/course/${course.id}` as any)}
                  onAddSchedule={() => router.push(`/course/${course.id}/edit` as any)}
                />
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
              <TouchableOpacity onPress={() => setShowPicker(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
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
                      accessibilityRole="button"
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
  gradeToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7,
  },
  gradeToggleText: { fontSize: 12, fontWeight: '600' },
  setupBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 14,
  },
  setupText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  setupAction: { fontSize: 12, fontWeight: '700' },
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: CONTENT_PADDING, paddingBottom: 120, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },

  // Header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  title: { fontFamily: FONTS.display, fontSize: 27, color: COLORS.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: COLORS.ink3, marginTop: 4 },
  semesterSelector: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  semesterName: { fontSize: 15, fontWeight: '500', color: COLORS.ink2 },
  courseCountBadge: { marginLeft: 8, backgroundColor: COLORS.brand50, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8 },
  courseCountText: { fontSize: 12, fontWeight: '700', color: COLORS.brand },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.brand, justifyContent: 'center', alignItems: 'center' },
  gpaCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 0.5, padding: 14, marginBottom: 14, ...WEB_CARD_SHADOW },
  gpaIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  gpaLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.7 },
  gpaMeta: { fontSize: 11.5, lineHeight: 16, marginTop: 3 },
  gpaValue: { fontFamily: FONTS.display, fontSize: 27 },

  // Course cards
  courseList: { gap: 10 },

  // Two columns on a phone, and the tiles simply wrap on wider windows —
  // `flexBasis: 47%` with wrap gives 2 up on a phone and 2 up on an iPad at
  // the capped content width, which is the density the layout is for.
  courseGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  // Width is set inline from tileWidth — see the note where it is computed.
  gridTile: {
    borderRadius: 18, borderWidth: 0.5, overflow: 'hidden',
    backgroundColor: COLORS.card, borderColor: COLORS.line,
  },
  // The colour block is the point of this layout: it is what makes a course
  // identifiable at a glance without reading anything.
  gridBanner: { height: 62, justifyContent: 'flex-start', alignItems: 'flex-end', padding: 8 },
  gridBannerFlag: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  gridBannerCompact: { height: 52 },
  gridBody: { padding: 12, gap: 3 },
  gridBodyCompact: { padding: 10 },
  gridName: { fontSize: 15, fontWeight: '600', lineHeight: 19 },
  gridNameCompact: { fontSize: 14, lineHeight: 18 },
  gridInstructor: { fontSize: 12.5 },
  gridFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  gridPending: { fontSize: 12.5, fontWeight: '600' },
  gridGrade: { fontSize: 12.5, fontWeight: '500' },

  viewToggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 2, gap: 2 },
  viewToggleBtn: { width: 30, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  // Wide windows (iPad landscape / large Split View): 2-column grid.
  courseListWide: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  courseCardWide: { flexBasis: '47%', flexGrow: 1, maxWidth: '49%' },
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
  emptyCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 32, alignItems: 'center', gap: 6, borderWidth: 0.5, borderColor: COLORS.line, ...WEB_CARD_SHADOW },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.ink },
  emptyText: { fontSize: 14, color: COLORS.ink3 },

  // Semester dropdown modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 28 },
  modalContent: { backgroundColor: COLORS.card, borderRadius: 22, paddingTop: 20, paddingBottom: 8, maxHeight: 400, width: '100%', maxWidth: 420, alignSelf: 'center' },
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
