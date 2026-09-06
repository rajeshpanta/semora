import { translate } from '@/lib/i18n';
import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text, TextInput } from '@/components/LocalizedReactNative';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Text as RawText,
  Image,
  Modal,
  Linking,
  // Only for Alert.prompt, which the localized wrapper does not expose (it
  // wraps .alert alone). Every other dialog on this screen goes through the
  // wrapper so its buttons stay translated.
  Alert as NativeAlert,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useHeaderHeight } from '@react-navigation/elements';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, DEFAULT_GRADE_SCALE, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { calculateCourseGrade } from '@/lib/grades';
import type { GradeThreshold } from '@/types/database';
import { useColors } from '@/lib/theme';
import { useProUpsell } from '@/components/ProUpsellHost';
import { useResponsive } from '@/lib/responsive';
import { splitPracticeFeedback } from '@/lib/practiceFeedback';
import { readingSpaceFor } from '@/lib/readingSpace';
import { useAppStore, findCurrentSemester } from '@/store/appStore';
import { track } from '@/lib/analytics';
import { useCourse, useCourses, useSemesters, useGradeCategories, useTasks } from '@/lib/queries';
import { buildAcademicRiskReport } from '@/lib/academicRisk';
import {
  useTutorConversation, useTutorMessages, useSendTutorMessage,
  useCourseNotes, useUploadCourseNote, useDeleteCourseNote, useGenerateTutorPractice,
  useEvaluateTutorPractice, useCourseTopicMastery, type TutorPracticeQuestion,
  prepareCourseNotes, type CourseNoteReadProgress, type CourseNoteUploadProgress,
  useTutorThreads, useCreateTutorThread, useRenameTutorThread, useDeleteTutorThread,
  useRateTutorMessage, useTutorQuota, useOpenPractice,
  type TutorConversation, type TutorGradeSnapshot, type TutorPracticeEvaluation,
} from '@/lib/tutor';
import { RichText } from '@/components/RichText';
import { shareText, shareTextMessage } from '@/lib/shareLink';
import {
  normalizeSupportedDocument,
  SUPPORTED_DOCUMENT_PICKER_TYPE,
  unsupportedDocumentMessage,
} from '@/lib/documentFiles';
import { FileWorkProgress } from '@/components/FileWorkProgress';

/**
 * A thread rail is only worth its width if what remains still holds a full
 * reading measure. These three numbers are the whole adaptive rule; there is
 * no device check anywhere in this screen.
 */
const RAIL_MIN = 240;
const RAIL_MAX = 320;
const GUTTER_MIN = 32;
/** Treat "within 24pt of the bottom" as still reading the newest message. */
const END_SLACK = 24;
/** Points that hold a typical source name at the default text size. */
const CITATION_BASE = 190;
/** Left to the column so a chip never runs edge to edge with the prose. */
const CHIP_GUTTER = 24;
/** Points that hold a typical starter sentence at the default text size. */
const STARTER_BASE = 340;

/** An opener for an empty thread. Most fill the composer; one runs a quiz. */
type Starter = { label: string; practiceFocus?: string };

export default function TutorScreen() {
  const router = useRouter();
  const colors = useColors();
  const showProUpsell = useProUpsell();
  const { contentMaxWidth } = useResponsive();
  const isPro = useAppStore((s) => s.isPro);
  // Optional course scope: /tutor?courseId=<id> grounds the tutor on that
  // course. Without it, the tutor is a general study chat.
  // `assignmentId` arrives from the "Stuck on this?" prompt on a task, so the
  // student lands on an explanation of the thing they tapped rather than on an
  // empty chat box they now have to describe it into.
  const { courseId, assignmentId } = useLocalSearchParams<{ courseId?: string; assignmentId?: string }>();

  // ── Pro gate: locked teaser routes to the paywall ─────────────
  if (!isPro) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <Stack.Screen options={{ title: translate('AI Tutor') }} />
        <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}>
          <View style={[styles.teaserCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={[styles.teaserIcon, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name="comments" size={26} color={colors.brand} />
            </View>
            <Text style={[styles.teaserTitle, { color: colors.ink }]}>Your personal AI tutor</Text>
            <Text style={[styles.teaserDesc, { color: colors.ink3 }]}>
              Ask anything about your course. The tutor answers from your own
              syllabus, deadlines, and uploaded lecture notes — not generic
              search results.
            </Text>
            <TouchableOpacity
              style={[styles.upgradeBtn, { backgroundColor: colors.brand }]}
              onPress={() => {
                if (Platform.OS !== 'web') Haptics.selectionAsync();
                showProUpsell('tutor');
              }}
              activeOpacity={0.85}
            >
              <FontAwesome name="star" size={13} color="#fff" />
              <Text style={styles.upgradeText}>Unlock with Pro</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return <TutorChat initialCourseId={courseId ?? null} explainAssignmentId={assignmentId ?? null} />;
}

// Pro-only chat body, split out so the hooks below never run for free users
// (the early return above would otherwise violate the rules-of-hooks).
function TutorChat({
  initialCourseId,
  explainAssignmentId,
}: {
  initialCourseId: string | null;
  explainAssignmentId: string | null;
}) {
  // The tutor is reachable two ways: from a course (which passes courseId) and
  // from the Study Tools list, which passes nothing. Opening it the second way
  // used to be a dead end — "Add notes" and the practice chips just told you to
  // "open the tutor from a course" with no way to do so from here. The scope is
  // now state, seeded from the route, so a student can pick the course on this
  // screen instead of backing out to find another entry point.
  const [courseId, setCourseId] = useState<string | null>(initialCourseId);
  // Expo Router reuses this screen when only the param changes, so navigating
  // from one course's tutor straight to another would otherwise keep showing
  // the first course. Adjusting during render (rather than in an effect) is the
  // sanctioned way to follow a prop: it converges on the same commit, with no
  // extra pass and no dependency array to get wrong.
  const [lastParam, setLastParam] = useState<string | null>(initialCourseId);
  if (initialCourseId !== lastParam) {
    setLastParam(initialCourseId);
    setCourseId(initialCourseId);
  }
  const router = useRouter();
  const colors = useColors();
  const showProUpsell = useProUpsell();
  const { contentMaxWidth, proseMaxWidth, measureScale, fontScale, isDesktop, width: winWidth, height: winHeight } = useResponsive();

  // ── Adaptive geometry, derived rather than named ────────────────────────
  //
  // No device is mentioned here on purpose. Every value below answers "what
  // does this content need?", so a window Apple has not shipped yet lands in
  // the right layout without a code change.
  //
  // The rail appears exactly when the window can pay for it in full: a rail,
  // a complete reading measure, and a gutter on each side. One pixel short of
  // that and the sheet is the better answer, because a rail that squeezes the
  // prose has taken the thing it was meant to serve.
  // The rail holds thread titles, so its spatial need scales with the text the
  // same way the prose measure does. Deriving both from measureScale is what
  // keeps a student on Larger Text from getting a rail of bare ellipses: the
  // rail asks for more room, the threshold rises with it, and below that the
  // rail simply steps aside and gives the whole window to the answer.
  const railMin = Math.round(RAIL_MIN * measureScale);
  const railMax = Math.round(RAIL_MAX * measureScale);
  const railWidth = Math.round(Math.min(railMax, Math.max(railMin, winWidth * 0.22)));
  const showThreadRail = winWidth >= railMin + proseMaxWidth + GUTTER_MIN * 2;
  // Derived from what is left AFTER the rail, not from the window. Using the
  // window happened to fit at today's sizes and would have overflowed silently
  // the first time either constant moved.
  const columnWidth = Math.min(proseMaxWidth, winWidth - (showThreadRail ? railWidth : 0));

  // A source chip is a name, and a name it cannot finish saying is worth very
  // little. Its width therefore comes from the same two facts everything else
  // here uses — how big the text actually is, and how much column there is to
  // spend — rather than from a constant. Unlike the prose measure this is NOT
  // clamped: a measure has an upper bound because over-long lines hurt to
  // read, whereas a chip only ever wants to be exactly as wide as its label.
  // When even the whole column cannot hold it, the chip has run out of room to
  // grow and wrapping is the only way left to show the name, so it takes a
  // second line instead of an ellipsis.
  const citationIdeal = Math.round(CITATION_BASE * fontScale);
  const citationMaxWidth = Math.max(
    CITATION_BASE,
    Math.min(columnWidth - CHIP_GUTTER, citationIdeal),
  );
  const citationLines = citationIdeal > citationMaxWidth ? 2 : 1;
  const citationIcon = Math.round(9 * measureScale);

  // Starter chips hold a whole sentence, so they answer the same question the
  // citation chips do — how wide does this text need to be here? — and get the
  // same answer. Without this they stay 340pt while the words inside them
  // treble, which turns four openers into four narrow towers of text in a
  // column with room to spare.
  const starterMaxWidth = Math.max(
    STARTER_BASE,
    Math.min(columnWidth - CHIP_GUTTER, Math.round(STARTER_BASE * fontScale)),
  );

  // The navigation bar is not 44pt. It grows with Dynamic Type and differs by
  // presentation, so asking for its real height is the only version of this
  // that survives an accessibility text size.
  const headerHeight = useHeaderHeight();


  // Resolve the semester by derivation rather than reading global state alone:
  // selectedSemesterId is only populated by the tabs that set it, so arriving
  // here straight from Study Tools left it null and the picker had no courses
  // to offer. Deriving costs nothing and needs no effect, so there is no state
  // write on this path to loop on.
  const selectedSemesterId = useAppStore((st) => st.selectedSemesterId);
  const { data: semesters = [] } = useSemesters();
  const activeSemesterId = selectedSemesterId ?? findCurrentSemester(semesters);
  const { data: semesterCourses = [] } = useCourses(activeSemesterId);
  const { data: course } = useCourse(courseId ?? '');
  const { data: courseTasks = [] } = useTasks(courseId ? { courseId } : { semesterId: null });
  const { data: gradeCategories = [] } = useGradeCategories(courseId);
  const { data: conversation } = useTutorConversation(courseId);
  const { data: threads = [] } = useTutorThreads(courseId);
  const createThread = useCreateTutorThread(courseId);
  const renameThread = useRenameTutorThread(courseId);
  const deleteThread = useDeleteTutorThread(courseId);
  // A thread the student picked wins; otherwise the newest one, with the
  // find-or-create hook as the fallback for a scope that has none yet.
  const [pickedThreadId, setPickedThreadId] = useState<string | null>(null);
  // The pick wins outright rather than being validated against the list: a
  // thread created a moment ago is not in `threads` until that query refetches,
  // and checking membership first would silently drop the student back into the
  // previous conversation for a frame. A deleted thread clears the pick at the
  // point of deletion, so a stale id cannot survive here.
  const conversationId = pickedThreadId ?? threads[0]?.id ?? conversation?.id ?? null;
  const activeThread = threads.find((t) => t.id === conversationId) ?? null;

  const { data: messages = [], isLoading } = useTutorMessages(conversationId);
  /** Read inside the layout handler so measuring does not re-bind on every turn. */
  const messagesRef = useRef(0);
  messagesRef.current = messages.length;
  const sendMessage = useSendTutorMessage(conversationId, courseId);
  const rateMessage = useRateTutorMessage(conversationId);
  const generatePractice = useGenerateTutorPractice(conversationId, courseId);
  const evaluatePractice = useEvaluateTutorPractice(conversationId, courseId);
  const { data: topicMastery = [] } = useCourseTopicMastery(courseId);
  const { data: notes = [] } = useCourseNotes(courseId);
  const { data: quota } = useTutorQuota();
  const { data: openPractice } = useOpenPractice(courseId);
  const uploadNote = useUploadCourseNote(courseId);
  const deleteNote = useDeleteCourseNote(courseId);

  const [draft, setDraft] = useState('');
  // Mirrored during render so the composer's onLayout — a native callback that
  // can fire before an effect would have run — always sees the current draft
  // when deciding whether this height is the composer's resting height.
  const draftRef = useRef('');
  draftRef.current = draft;
  const [threadSheetOpen, setThreadSheetOpen] = useState(false);
  const [contextSheetOpen, setContextSheetOpen] = useState(false);
  /** The answer as it is being written, before it becomes a stored turn. */
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<
    { uri: string; base64: string; mimeType: string } | null
  >(null);
  const [practice, setPractice] = useState<TutorPracticeQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [practiceFeedback, setPracticeFeedback] = useState<TutorPracticeEvaluation | null>(null);
  const [fileProgress, setFileProgress] = useState<CourseNoteUploadProgress | null>(null);
  const [readProgress, setReadProgress] = useState<CourseNoteReadProgress | null>(null);
  const [tutorWork, setTutorWork] = useState<{
    kind: 'answer' | 'practice';
    stage: 'reading' | 'creating';
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  // Streaming grows the content on every token. Animating each of those is
  // both janky and pointless — the view is already at the bottom — so the
  // auto-scroll drops the animation while an answer is arriving.
  const streamingRef = useRef(false);
  const tutorWorkInFlightRef = useRef(false);
  const fileProgressClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One line that says what is actually behind the next answer. Names the
  // course because that is the fact a student checks before trusting a reply,
  // and counts the material because "3 notes" is the difference between a
  // grounded answer and a general one. Kept to nouns — no controls, no state
  // the student has to maintain.
  const contextSummary = useMemo(() => {
    if (!courseId) return translate('All courses · your deadlines');
    const parts: string[] = [course?.name || translate('Course')];
    if (notes.length) parts.push(`${notes.length} ${notes.length === 1 ? translate('note') : translate('notes')}`);
    return parts.join(' · ');
  }, [courseId, course?.name, notes.length]);

  const isTutorWorking = tutorWork !== null || sendMessage.isPending || generatePractice.isPending;
  // `conversationId` belongs in here, not only inside handleSend. handleSend
  // returns silently when it is null — during the cold-start window, and
  // permanently if the conversation query fails — while the button stayed
  // fully brand-coloured and did nothing when tapped. One derived flag now
  // drives the fill, the glyph colour, `disabled` and the VoiceOver state, so
  // they cannot disagree again.
  const sendEnabled = !!draft.trim() && !isTutorWorking && !!conversationId;

  useEffect(() => () => {
    if (fileProgressClearRef.current) clearTimeout(fileProgressClearRef.current);
  }, []);

  const scrollToEnd = useCallback(() => {
    // Defer past layout so the newest message is measured before we scroll.
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: !streamingRef.current }));
  }, []);

  // onContentSizeChange covers the list growing. It does NOT cover the list's
  // own frame SHRINKING, which is what happens when the composer gets taller —
  // on Larger Text, or when the keyboard comes up. Content size is unchanged,
  // so nothing re-scrolls and the newest message ends up behind the composer.
  // Only re-pin when the student was actually at the bottom; someone who has
  // scrolled up to re-read an earlier step keeps their place.
  const atEndRef = useRef(true);
  const handleScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    atEndRef.current =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - END_SLACK;
  }, []);
  const keepEndVisible = useCallback(() => {
    if (atEndRef.current) scrollToEnd();
  }, [scrollToEnd]);

  /**
   * The height of the conversation viewport as it is actually laid out.
   *
   * This is the space the student can genuinely read in, and it is already
   * correct for every case a fixed reserve had to guess at: the context line
   * wrapping, the composer growing to two lines, Dynamic Type inflating both,
   * longer Spanish copy, and the keyboard — the ScrollView sits inside the
   * KeyboardAvoidingView, so its frame shrinks when the keyboard appears
   * without anything here knowing what a keyboard is.
   *
   * Rounded to 8pt so ordinary layout jitter does not re-render, and it feeds
   * only the readingSpace word sent to the server, never layout, so measuring
   * it cannot feed back into what it measures.
   */
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const handleViewportLayout = useCallback((e: LayoutChangeEvent) => {
    const measured = e.nativeEvent.layout.height;
    setViewportHeight((previous) => (
      previous == null || Math.abs(previous - measured) >= 8 ? measured : previous
    ));
    if (messagesRef.current > 0) keepEndVisible();
  }, [keepEndVisible]);
  /**
   * How much of an answer fits on one screenful here — the same content-need
   * question Phase 2 asks about layout, asked about the answer.
   *
   * Reserves the chrome that always sits between the student and the prose:
   * the navigation bar, the one context line, and the composer. Sent to the
   * server as a single word so presentation can adapt without anything about
   * the device leaving the phone.
   */
  /**
   * The composer's own height, and the height it returns to once it is empty.
   *
   * The ScrollView frame is the right thing to measure, but it is measured at
   * the wrong instant: the composer is at its TALLEST when the student presses
   * send, and collapses the moment the draft clears. Rendering the real screen
   * caught it — a three-line question on an iPhone 15 drops the frame from
   * 612pt to about 570pt, and the compact boundary sits at 587pt, so the answer
   * was sized for a screen the student no longer had by the time it arrived.
   * Two composer lines are enough to flip that device; the iPad needs twelve,
   * and the already-compact cases cannot move.
   *
   * Worse than the size of the error is its direction: long questions are hard
   * questions, so the student asking the most involved thing was getting the
   * most compressed answer. That is the opposite of what this phase is for.
   *
   * Both terms are measured — no reserve, no device rule, no estimate of what a
   * keyboard or a line of text "usually" costs. `restingComposerHeight` is
   * simply the composer's own height whenever the draft is empty, which is its
   * height at mount and again after every send.
   */
  const [composerHeight, setComposerHeight] = useState<number | null>(null);
  const restingComposerHeight = useRef<number | null>(null);
  const handleComposerLayout = useCallback((e: LayoutChangeEvent) => {
    const measured = e.nativeEvent.layout.height;
    if (draftRef.current.length === 0) restingComposerHeight.current = measured;
    setComposerHeight((previous) => (
      previous == null || Math.abs(previous - measured) >= 8 ? measured : previous
    ));
  }, []);

  const readingSpace = useMemo(() => {
    // Nothing has been laid out yet, so there is nothing honest to say. The
    // field is omitted and the server keeps its own default, exactly as it
    // does for a client that predates this signal.
    if (viewportHeight == null) return null;
    // Give back only what the composer is currently borrowing beyond its
    // resting height. Empty draft, unknown resting height, or a composer that
    // has not grown all leave this at zero.
    const borrowed = composerHeight != null && restingComposerHeight.current != null
      ? Math.max(0, composerHeight - restingComposerHeight.current)
      : 0;
    return readingSpaceFor({ columnWidth, usableHeight: viewportHeight + borrowed, fontScale });
  }, [columnWidth, viewportHeight, composerHeight, fontScale]);


  // Switching course must not carry the previous course's thread along.
  useEffect(() => { setPickedThreadId(null); }, [courseId]);

  // Arriving from a task: explain it, once, as soon as there is a thread to
  // put the answer in. Latched by ref rather than state so a re-render during
  // the request cannot fire a second one.
  const autoExplainedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!explainAssignmentId || !conversationId) return;
    if (autoExplainedRef.current === explainAssignmentId) return;
    const task = courseTasks.find((candidate) => candidate.id === explainAssignmentId);
    if (!task) return;
    autoExplainedRef.current = explainAssignmentId;
    handleExplainAssignment(task);
    // handleExplainAssignment is stable enough for this one-shot latch; adding
    // it to the deps would re-run the effect on every render it is recreated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [explainAssignmentId, conversationId, courseTasks]);

  // A question the student generated and never answered. It used to live only
  // in this component's state, so checking the notes it asked about threw it
  // away; the row was always in the database, it just had no way back.
  useEffect(() => {
    if (openPractice && !practice && !practiceFeedback) setPractice(openPractice);
  }, [openPractice, practice, practiceFeedback]);

  /**
   * The grade exactly as the course screen renders it, sent with each question
   * so the tutor can answer "what do I need on the final".
   *
   * Computed here from the same function the course screen uses rather than
   * re-derived on the server: two implementations of category weighting, drop
   * -lowest and extra credit would eventually disagree, and a tutor that
   * contradicts the number on the course screen is worse than one that cannot
   * see grades at all.
   */
  const gradeSnapshot = useMemo<TutorGradeSnapshot | null>(() => {
    if (!course || !courseId) return null;
    const result = calculateCourseGrade(
      courseTasks.map((task) => ({
        id: task.id,
        grade_category_id: task.grade_category_id,
        weight: task.weight,
        score: task.score,
        points_earned: task.points_earned,
        points_possible: task.points_possible,
        is_extra_credit: task.is_extra_credit,
      })),
      gradeCategories,
      ((course as any).grade_scale || DEFAULT_GRADE_SCALE) as GradeThreshold[],
      (course as any).extra_credit_policy || 'bonus',
    );
    if (result.percentage == null && result.categoryBreakdown.length === 0) return null;
    return {
      percentage: result.percentage,
      letter: result.letter,
      weightRemaining: Math.max(0, result.weightTotal - result.weightAttempted),
      categories: result.categoryBreakdown.map((category) => ({
        name: category.name,
        weight: category.weight,
        average: category.average,
        graded: category.gradedCount,
      })),
    };
  }, [course, courseId, courseTasks, gradeCategories]);

  const riskReport = useMemo(
    () => course ? buildAcademicRiskReport(courseTasks, [course], gradeCategories) : null,
    [course, courseTasks, gradeCategories],
  );
  const upcomingWork = useMemo(
    () => courseTasks.filter((task) => !task.is_completed).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 3),
    [courseTasks],
  );

  /**
   * Openers for an empty thread.
   *
   * Chosen to be questions a general chatbot CANNOT answer — they need this
   * student's deadlines, this course's notes, this course's weighting — so the
   * first exchange demonstrates the only reason to use the tutor here rather
   * than somewhere else.
   */
  /**
   * What is worth being quizzed on right now, or null when nothing is.
   *
   * Reuses the judgement the coach brief already makes — a topic practised
   * and got wrong more often than not is the one to revisit — and falls back
   * to the work actually coming up. If a course has neither, Semora has no
   * opinion worth offering and the starter does not appear at all.
   */
  const practiceAnchor = useMemo(() => {
    if (!courseId) return null;
    const weak = topicMastery.find((t) => t.attempts > 0 && t.correct / t.attempts < 0.7);
    if (weak) return weak.topic;
    return upcomingWork[0]?.title ?? null;
  }, [courseId, topicMastery, upcomingWork]);

  const starterPrompts = useMemo<Starter[]>(() => {
    // Translated HERE, not at render. The chip both displays this string and
    // becomes the draft, so translating only the <Text> would show a Spanish
    // chip that types an English question into the composer.
    if (!courseId) {
      return [
        translate('What should I work on tonight?'),
        translate('Which deadline should I worry about first?'),
        translate('Help me plan the next two weeks.'),
      ].map((label) => ({ label }));
    }
    const prompts: Starter[] = [];
    // The task title is the student's own text and is never translated.
    if (upcomingWork[0]) prompts.push({ label: `${translate('Help me get started on')} ${upcomingWork[0].title}` });
    // Second, so that when it shares an anchor with the opener above the two
    // read as one item you can either begin or be tested on — not as a repeat.
    // The focus string steers the question the generator writes, so the label
    // is a promise the backend actually keeps.
    if (practiceAnchor) {
      prompts.push({
        label: `${translate('Quiz me on')} ${practiceAnchor}`,
        practiceFocus: `Create a quiz question on ${practiceAnchor}.`,
      });
    }
    if (notes.length > 0) prompts.push({ label: translate('Summarise the key ideas from my notes.') });
    if (gradeSnapshot?.percentage != null) {
      prompts.push({ label: translate('What do I need on the rest to finish with an A?') });
    }
    prompts.push({ label: translate('What should I study first for this course?') });
    return prompts.slice(0, 4);
  }, [courseId, upcomingWork, notes.length, gradeSnapshot?.percentage, practiceAnchor]);

  const handleGeneratePractice = async (mode: 'practice' | 'quiz', focus?: string) => {
    if (tutorWorkInFlightRef.current || isTutorWorking) return;
    if (!courseId) {
      Alert.alert(
        'Pick a course first',
        semesterCourses.length
          ? 'Choose a course above and the tutor will build practice from its material.'
          : 'Add a course first — practice is generated from a course\'s own material.',
      );
      return;
    }
    tutorWorkInFlightRef.current = true;
    try {
      if (notes.length > 0) {
        await prepareCourseNotes(courseId, notes, (progress) => {
          setTutorWork({ kind: 'practice', stage: 'reading' });
          setReadProgress(progress);
        });
      }
      setTutorWork({ kind: 'practice', stage: 'creating' });
      const next = await generatePractice.mutateAsync({ mode, focus });
      setPractice(next);
      setSelectedAnswer(null);
      setPracticeFeedback(null);
      track('tutor_practice_generated', { screen: 'tutor', mode, focused: !!focus });
      scrollToEnd();
    } catch (e: any) {
      if (e?.code === 'PRO_REQUIRED') {
        showProUpsell('tutor');
        return;
      }
      Alert.alert('Could not create practice', e?.message || 'Please try again.');
    } finally {
      tutorWorkInFlightRef.current = false;
      setTutorWork(null);
      setReadProgress(null);
    }
  };

  /**
   * The move after a miss: a NEW question on the same idea, not the same one
   * again.
   *
   * Retrying the question they just missed cannot measure understanding — the
   * correct answer is on screen by then — and record_tutor_practice_attempt
   * increments attempts AND correct on every call with no per-question
   * uniqueness, so a re-answer would inflate mastery and could be repeated to
   * farm it. A fresh question on the same concept proves the same thing
   * honestly and counts once, like any other question.
   */
  const handleAnotherOnTopic = (mode: 'practice' | 'quiz', topic: string | null) => {
    handleGeneratePractice(
      mode,
      topic ? `Create a ${mode} question on ${topic}, testing the same idea from a different angle than the last one.` : undefined,
    );
  };

  /**
   * Offered only when mastery says this topic has been missed before. One
   * re-explanation after a single slip is noise; after a pattern it is the
   * thing the student actually needs, and it costs a message from their
   * daily allowance, so it should not be offered on a whim.
   */
  const handleExplainDifferently = async (topic: string | null, misconception: string) => {
    if (!conversationId || tutorWorkInFlightRef.current || isTutorWorking) return;
    tutorWorkInFlightRef.current = true;
    const subject = topic ? `"${topic}"` : 'this';
    try {
      setTutorWork({ kind: 'answer', stage: 'creating' });
      await runTurn({
        message: `I keep getting ${subject} wrong. I just answered a practice question incorrectly and the issue was: ${misconception} Explain the underlying idea a different way, starting from something simpler, and give one concrete example.`,
      });
      track('tutor_practice_reexplain', { screen: 'tutor' });
      scrollToEnd();
    } catch (e: any) {
      Alert.alert('Could not explain that', e?.message || 'Please try again.');
    } finally {
      tutorWorkInFlightRef.current = false;
      setTutorWork(null);
    }
  };

  const handleCheckPractice = async () => {
    if (!practice || !selectedAnswer || evaluatePractice.isPending) return;
    try {
      const result = await evaluatePractice.mutateAsync({ practiceId: practice.id, answer: selectedAnswer });
      setPracticeFeedback(result);
      track('tutor_practice_answered', { screen: 'tutor', correct: result.correct, mode: practice.mode });
    } catch (e: any) {
      Alert.alert('Could not check answer', e?.message || 'Please try again.');
    }
  };

  const handleExplainAssignment = async (task: typeof courseTasks[number]) => {
    if (!conversationId || tutorWorkInFlightRef.current || isTutorWorking) return;
    tutorWorkInFlightRef.current = true;
    const text = `Explain the assignment “${task.title}” and help me make a plan to complete it.`;
    try {
      if (courseId && notes.length > 0) {
        await prepareCourseNotes(courseId, notes, (progress) => {
          setTutorWork({ kind: 'answer', stage: 'reading' });
          setReadProgress(progress);
        });
      }
      setTutorWork({ kind: 'answer', stage: 'creating' });
      await runTurn({ message: text, mode: 'explain_assignment', assignmentId: task.id });
      track('tutor_assignment_explained', { screen: 'tutor' });
      scrollToEnd();
    } catch (e: any) {
      Alert.alert('Could not explain assignment', e?.message || 'Please try again.');
    } finally {
      tutorWorkInFlightRef.current = false;
      setTutorWork(null);
      setReadProgress(null);
    }
  };

  /**
   * Send one turn and paint the answer as it is written.
   *
   * The reply used to appear all at once after three to ten seconds of a
   * spinner, which is the same wait dressed as a failure. Deltas land in local
   * state; once the turn is stored the message list becomes the source of
   * truth again and the streaming copy is dropped in the same commit, so the
   * bubble never duplicates or flickers.
   */
  const runTurn = async (input: {
    message: string;
    mode?: 'chat' | 'explain_assignment';
    assignmentId?: string | null;
    image?: { base64: string; mimeType: string } | null;
  }) => {
    streamingRef.current = true;
    // Repainting on every token means re-parsing the whole answer's markdown
    // several hundred times as it grows, which is quadratic and shows up as
    // stutter on an older phone. ~13 frames a second still reads as typing,
    // and the final text is painted unconditionally below.
    let lastPaint = 0;
    let latest = '';
    try {
      await sendMessage.mutateAsync({
        ...input,
        grades: gradeSnapshot,
        // Added at the funnel rather than at each call site so no send path
        // can quietly ship without it.
        readingSpace,
        onDelta: (soFar) => {
          latest = soFar;
          const now = Date.now();
          if (now - lastPaint < 75) return;
          lastPaint = now;
          setStreamingText(soFar);
          scrollToEnd();
        },
      });
      // Whatever the throttle skipped. Without this the visible answer can stop
      // a word or two short until the stored turn replaces it.
      if (latest) setStreamingText(latest);
    } finally {
      streamingRef.current = false;
      setStreamingText(null);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || tutorWorkInFlightRef.current || isTutorWorking || !conversationId) return;
    tutorWorkInFlightRef.current = true;
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    const photo = attachment;
    setDraft('');
    setAttachment(null);
    scrollToEnd();
    try {
      if (courseId && notes.length > 0) {
        await prepareCourseNotes(courseId, notes, (progress) => {
          setTutorWork({ kind: 'answer', stage: 'reading' });
          setReadProgress(progress);
        });
      }
      setTutorWork({ kind: 'answer', stage: 'creating' });
      await runTurn({
        message: text,
        image: photo ? { base64: photo.base64, mimeType: photo.mimeType } : null,
      });
      track('tutor_message_sent', {
        screen: 'tutor', scoped: !!courseId, grounded: notes.length > 0, photo: !!photo,
      });
      scrollToEnd();
    } catch (e: any) {
      // Server marks Pro-required with code PRO_REQUIRED — route to paywall
      // instead of showing a dead-end error (client isPro can be stale).
      if (e?.code === 'PRO_REQUIRED') {
        showProUpsell('tutor');
        return;
      }
      // Restore the draft AND the photo — re-taking a picture of a problem set
      // because the network blipped is a genuinely annoying thing to ask.
      setDraft(text);
      if (photo) setAttachment(photo);
      if (e?.code === 'TUTOR_DAILY_CAP') {
        Alert.alert("That's today's limit", e?.message || 'Please try again tomorrow.');
        return;
      }
      Alert.alert('Could not send', e?.message || 'Please try again.');
    } finally {
      tutorWorkInFlightRef.current = false;
      setTutorWork(null);
      setReadProgress(null);
    }
  };

  const handleAddNotes = async () => {
    if (!courseId) {
      // The picker is right above this chip now, so say where to go rather than
      // sending the student back out to find a different way in.
      Alert.alert(
        'Pick a course first',
        semesterCourses.length
          ? 'Choose a course above, then attach lecture notes to ground the tutor on it.'
          : 'Add a course first — the tutor grounds notes against a specific course.',
      );
      return;
    }
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await DocumentPicker.getDocumentAsync({
      type: SUPPORTED_DOCUMENT_PICKER_TYPE,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const document = normalizeSupportedDocument(asset.name, asset.mimeType);
    if (!document) {
      Alert.alert('Unsupported file', unsupportedDocumentMessage(asset.name));
      return;
    }
    try {
      if (fileProgressClearRef.current) clearTimeout(fileProgressClearRef.current);
      setFileProgress({ stage: 'validating', filename: document.fileName });
      await uploadNote.mutateAsync({
        uri: asset.uri,
        filename: document.fileName,
        mimeType: document.mimeType,
        onProgress: setFileProgress,
      });
      track('tutor_note_uploaded', { screen: 'tutor' });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fileProgressClearRef.current = setTimeout(() => setFileProgress(null), 900);
    } catch (e: any) {
      setFileProgress(null);
      Alert.alert('Upload failed', e?.message || 'Please try again.');
    }
  };

  // ── A photo of the problem ───────────────────────────────────
  // The most common tutoring moment there is — "here's question 4, I'm stuck"
  // — and until now the only way to show the tutor anything was to file it
  // permanently as course material. This is read for one turn and discarded.
  const pickPhoto = async (source: 'camera' | 'library') => {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(
        source === 'camera' ? 'Camera Access Needed' : 'Photo Access Needed',
        'Semora needs access so you can show the tutor a problem. You can enable it in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ base64: true, quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.6,
        // Ask iOS for the compatible representation so a HEIC never has to be
        // decoded at all. The server handles one if it arrives anyway.
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) {
      Alert.alert("Couldn't read that photo", 'Please try another one.');
      return;
    }
    setAttachment({ uri: asset.uri, base64: asset.base64, mimeType: asset.mimeType || 'image/jpeg' });
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    track('tutor_photo_attached', { screen: 'tutor', source });
  };

  const handleAttachPhoto = () => {
    if (isTutorWorking) return;
    // A desktop browser has no camera to open. expo-image-picker's web build
    // sets capture="camera" on a file input, which phones honour and desktops
    // ignore — so the option works, but it promises a camera and delivers a
    // file dialog. Mobile web keeps the real camera, so this gates on
    // isDesktop rather than Platform.OS, matching the scan screen.
    const options = [
      ...(isDesktop ? [] : [{ text: 'Take a photo', onPress: () => pickPhoto('camera') }]),
      { text: isDesktop ? 'Choose an image' : 'Choose from library', onPress: () => pickPhoto('library') },
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert(
      'Show the tutor a problem',
      'It reads the photo for this question only — it is not saved to your course.',
      options,
    );
  };

  // Long-press already selects the text; this is the one-tap route out to
  // Notes, Messages, or the clipboard.
  //
  // Through shareText, NOT Share.share directly: react-native-web's Share is
  // not a polyfill — it rejects outright wherever `navigator.share` is missing
  // (Firefox everywhere, Chrome and Edge on macOS and Linux). Calling it raw
  // and catching the rejection is a button that silently does nothing, which
  // is precisely what this control did on those browsers. The ladder falls
  // back to the clipboard, and copying an answer is a fine outcome.
  const handleShareAnswer = async (text: string) => {
    const result = await shareText({ text });
    track('tutor_answer_shared', { screen: 'tutor', result });
    const notice = shareTextMessage(result);
    if (notice) Alert.alert(notice.title, notice.body);
  };

  // ── Threads ──────────────────────────────────────────────────
  const handleNewThread = async () => {
    if (isTutorWorking) return;
    try {
      const created = await createThread.mutateAsync();
      setPickedThreadId(created.id);
      setThreadSheetOpen(false);
      setPractice(null);
      setPracticeFeedback(null);
      setSelectedAnswer(null);
      if (Platform.OS !== 'web') Haptics.selectionAsync();
    } catch (e: any) {
      Alert.alert("Couldn't start a new chat", e?.message || 'Please try again.');
    }
  };

  // Android has no Alert.prompt — React Native only implements it on iOS — so
  // the rename control used to be hidden there entirely: an Android student
  // could delete a chat but never retitle one. iOS keeps the native prompt it
  // already shipped with; Android gets the sheet-local card below.
  const [renamingThread, setRenamingThread] = useState<TutorConversation | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  const commitRename = () => {
    const target = renamingThread;
    if (!target) return;
    const title = renameDraft.trim();
    setRenamingThread(null);
    // An empty box means "I changed my mind", not "call this chat nothing".
    if (!title || title === (target.title ?? '')) return;
    renameThread.mutate({ id: target.id, title });
  };

  const handleRenameThread = (thread: TutorConversation) => {
    if (Platform.OS === 'ios') {
      NativeAlert.prompt?.(
        'Rename chat',
        undefined,
        (value?: string) => {
          if (value == null) return;
          renameThread.mutate({ id: thread.id, title: value });
        },
        'plain-text',
        thread.title ?? '',
      );
      return;
    }
    setRenameDraft(thread.title ?? '');
    setRenamingThread(thread);
  };

  const handleDeleteThread = (thread: TutorConversation) => {
    Alert.alert(
      'Delete chat?',
      'The whole conversation is removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteThread.mutateAsync(thread.id).catch((e: any) =>
              Alert.alert("Couldn't delete", e?.message || 'Please try again.'));
            if (pickedThreadId === thread.id) setPickedThreadId(null);
          },
        },
      ],
    );
  };

  const confirmDeleteNote = (note: { id: string; storage_path: string; filename: string }) => {
    Alert.alert('Remove note?', `“${note.filename}” will no longer ground the tutor.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          deleteNote.mutate({ id: note.id, storage_path: note.storage_path });
        },
      },
    ]);
  };

  const title = course?.name ? `Tutor · ${course.name}` : 'AI Tutor';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      {/* Thread identity belongs in the navigation bar, where iOS puts a
          document's title, not in a bar of its own below it. Reclaiming that
          row is the first 44pt of the 278pt the chrome used to spend before
          the student saw a single word of an answer. */}
      <Stack.Screen
        options={{
          title: activeThread?.title || translate('AI Tutor'),
          headerRight: () => (
            <TouchableOpacity
              onPress={handleNewThread}
              disabled={isTutorWorking || createThread.isPending}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="New chat"
            >
              <FontAwesome
                name="pencil-square-o"
                size={19}
                color={isTutorWorking || createThread.isPending ? colors.ink3 : colors.brand}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? headerHeight : 0}
      >
        <View style={styles.workspace}>
          {/* iPad, wide only: the thread list earns a permanent column here
              because it REPLACES navigation rather than adding decoration —
              switching chats stops being "open a sheet, choose, dismiss". It
              collapses back into the sheet the moment the window narrows, so
              Split View and portrait keep the phone behaviour. */}
          {showThreadRail && (
            <View style={[styles.rail, { width: railWidth, borderRightColor: colors.line }]}>
              <Text style={[styles.railHead, { color: colors.ink3 }]}>Chats</Text>
              <ScrollView contentContainerStyle={styles.railList}>
                {threads.map((t) => {
                  const active = t.id === conversationId;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.railRow, active && { backgroundColor: colors.brand50 }]}
                      onPress={() => {
                        setPickedThreadId(t.id);
                        setPractice(null); setPracticeFeedback(null); setSelectedAnswer(null);
                      }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={t.title || 'Untitled chat'}
                      accessibilityState={{ selected: active }}
                    >
                      <Text
                        style={[styles.railRowText, { color: active ? colors.brand : colors.ink2 }]}
                        numberOfLines={1}
                      >
                        {t.title || 'New chat'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={styles.mainCol}>
            {/* ONE context line replaces four stacked bars.
                What is permanently true — which course is grounding this answer,
                and how much material is behind it — stays visible, because that
                is the thing a student needs to trust the answer. The CONTROLS
                for changing it do not need to be on screen at all times, so they
                moved behind this row. Progressive disclosure, applied to the
                distinction between a fact and a control. */}
            <TouchableOpacity
              style={[styles.contextBar, { borderBottomColor: colors.line, maxWidth: columnWidth }]}
              onPress={() => setContextSheetOpen(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Context: ${contextSummary}. Opens course, notes and study tools.`}
            >
              {courseId ? (
                <View style={[styles.contextDot, { backgroundColor: course?.color || colors.brand }]} />
              ) : (
                <FontAwesome name="globe" size={12} color={colors.ink3} />
              )}
              <Text style={[styles.contextText, { color: colors.ink2 }]} numberOfLines={1}>
                {contextSummary}
              </Text>
              {!!quota && quota.cap - quota.used <= 10 && (
                <Text style={[styles.quotaPill, { color: colors.amber, backgroundColor: colors.amber50 }]}>
                  {`${Math.max(0, quota.cap - quota.used)} left`}
                </Text>
              )}
              <FontAwesome name="sliders" size={13} color={colors.ink3} />
            </TouchableOpacity>

        {/* Message list.
            Pinning to the newest thing is a CONVERSATION affordance, so the
            two handlers below are gated on there being one. An empty thread is
            a page you read from the top, and at large text its openers are
            taller than a small phone — anchoring it to the bottom opened a
            fresh Tutor on its last two starters with the heading scrolled
            away. */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.messages, { maxWidth: columnWidth }]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={messages.length ? scrollToEnd : undefined}
          onLayout={handleViewportLayout}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {isLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
          ) : messages.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={[styles.teaserIcon, { backgroundColor: colors.brand50 }]}>
                <FontAwesome name="comments" size={24} color={colors.brand} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.ink2 }]}>
                {course?.name ? `Ask about ${course.name}` : 'Ask your study question'}
              </Text>
              <Text style={[styles.emptyText, { color: colors.ink3 }]}>
                {/* "above" was true when four bars sat over this. The
                    controls now live behind the context line, so the copy
                    points there instead of at empty space. */}
                {courseId
                  ? 'Answers are grounded in this course’s syllabus, deadlines, grades, and any notes you add.'
                  : 'Ask across every course — your deadlines are already here. Choose a course from the context bar to add its syllabus and notes.'}
              </Text>
              {/* A blank chat box is a hard thing to start. These are the
                  questions this app can answer better than a general chatbot,
                  because it is holding the material — so the first question a
                  student asks is one that shows that. */}
              <View style={[styles.starterWrap, { maxWidth: starterMaxWidth }]}>
                {starterPrompts.map((starter) => (
                  <TouchableOpacity
                    key={starter.label}
                    style={[styles.starterChip, { borderColor: colors.line, backgroundColor: colors.card }]}
                    disabled={!!starter.practiceFocus && isTutorWorking}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.selectionAsync();
                      track('tutor_starter_tapped', {
                        screen: 'tutor', scoped: !!courseId,
                        kind: starter.practiceFocus ? 'practice' : 'prompt',
                      });
                      // The prompts hand the student a sentence to send. This
                      // one is already the whole request, so making them press
                      // send again would be ceremony; it runs the quiz.
                      if (starter.practiceFocus) handleGeneratePractice('quiz', starter.practiceFocus);
                      else setDraft(starter.label);
                    }}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                  >
                    {!!starter.practiceFocus && (
                      <FontAwesome name="list-ol" size={Math.round(13 * measureScale)} color={colors.brand} />
                    )}
                    <Text style={[styles.starterText, { color: colors.ink2 }]}>{starter.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((m) => (
              <View key={m.id} style={m.role === 'user' ? styles.messageUserWrap : styles.messageAssistantWrap}>
                {/* A question is an utterance and keeps its bubble. An answer
                    is material — often two thousand words of it — and a
                    rounded, bordered, filled card around that much prose reads
                    as a chat transcript when it should read as something you
                    settle in to study. So the answer sits on the paper itself:
                    no fill, no border, no radius, full measure. What lost is
                    decoration; what won is the answer. */}
                <View style={[
                  m.role === 'user' ? styles.bubble : styles.answer,
                  m.role === 'user' ? [styles.bubbleUser, { backgroundColor: colors.brand }] : null,
                ]}>
                  {m.role === 'user' ? (
                    // RawText, NOT the localized wrapper: this is the student's
                    // own sentence. The wrapper translates any string that
                    // matches a catalogue key, so a question they typed could
                    // come back rendered in the other language — their words,
                    // silently rewritten. The assistant side already avoids
                    // this by going through RichText.
                    <RawText selectable style={[styles.bubbleText, { color: '#fff' }]}>{m.content}</RawText>
                  ) : (
                    <RichText
                      text={m.content}
                      color={colors.ink}
                      strongColor={colors.ink}
                      mutedColor={colors.ink2}
                      accentColor={colors.brand}
                      surfaceColor={colors.paper}
                      lineColor={colors.line}
                    />
                  )}
                </View>
                {m.role === 'assistant' && m.citations?.length > 0 && (
                  <View style={styles.citationRow}>
                    {m.citations.slice(0, 3).map((citation, index) => (
                      <View
                        key={`${citation.kind}-${citation.label}-${index}`}
                        style={[styles.citationChip, { borderColor: colors.line, backgroundColor: colors.paper, maxWidth: citationMaxWidth }]}
                      >
                        <FontAwesome name="book" size={citationIcon} color={colors.ink3} />
                        <Text style={[styles.citationText, { color: colors.ink3 }]} numberOfLines={citationLines}>{citation.label}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {/* Rating and share sit under the answer, not on it: they are
                    about the answer rather than part of it. A rescued turn
                    (id 'local-…') has no row to rate, so it only offers share. */}
                {m.role === 'assistant' && (
                  <View style={styles.answerActions}>
                    {!m.id.startsWith('local-') && (
                      <>
                        <TouchableOpacity
                          onPress={() => {
                            if (Platform.OS !== 'web') Haptics.selectionAsync();
                            rateMessage.mutate({ messageId: m.id, rating: m.rating === 1 ? null : 1 });
                          }}
                          style={styles.answerAction}
                          accessibilityRole="button"
                          accessibilityLabel="Helpful"
                        >
                          <FontAwesome
                            name={m.rating === 1 ? 'thumbs-up' : 'thumbs-o-up'}
                            size={12}
                            color={m.rating === 1 ? colors.teal : colors.ink3}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            if (Platform.OS !== 'web') Haptics.selectionAsync();
                            rateMessage.mutate({ messageId: m.id, rating: m.rating === -1 ? null : -1 });
                          }}
                          style={styles.answerAction}
                          accessibilityRole="button"
                          accessibilityLabel="Not helpful"
                        >
                          <FontAwesome
                            name={m.rating === -1 ? 'thumbs-down' : 'thumbs-o-down'}
                            size={12}
                            color={m.rating === -1 ? colors.coral : colors.ink3}
                          />
                        </TouchableOpacity>
                      </>
                    )}
                    <TouchableOpacity
                      onPress={() => handleShareAnswer(m.content)}
                      style={styles.answerAction}
                      accessibilityRole="button"
                      accessibilityLabel="Share this answer"
                    >
                      <FontAwesome name="share-square-o" size={12} color={colors.ink3} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))
          )}
          {/* The answer as it is being written. Replaced by the stored turn the
              moment the send resolves, in the same commit, so there is never a
              frame with both. */}
          {streamingText !== null && (
            <View style={styles.messageAssistantWrap}>
              {/* Must match the stored turn exactly, or the answer visibly
                  reflows the instant streaming finishes. */}
              <View style={styles.answer}>
                <RichText
                  text={streamingText}
                  color={colors.ink}
                  strongColor={colors.ink}
                  mutedColor={colors.ink2}
                  accentColor={colors.brand}
                  surfaceColor={colors.paper}
                  lineColor={colors.line}
                />
              </View>
            </View>
          )}
          {practice && (
            <View style={[styles.practiceCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <View style={styles.practiceHead}>
                <Text style={[styles.practiceEyebrow, { color: colors.brand }]}>{practice.mode === 'quiz' ? 'QUICK QUIZ' : 'PRACTICE'}</Text>
                <Text style={[styles.practiceTopics, { color: colors.ink3 }]} numberOfLines={1}>{practice.topics.join(' · ')}</Text>
              </View>
              <Text style={[styles.practicePrompt, { color: colors.ink }]}>{practice.prompt}</Text>
              {practice.choices.map((choice) => {
                const selected = selectedAnswer === choice;
                // Once answered, the choice they picked says so on the choice
                // itself. It carries "what did I put" and "was it right" where
                // the student is already looking, which is why the card below
                // no longer has to repeat either one back to them.
                //
                // Marked in WORDS, not by colour alone — and never in red. A
                // wrong answer here is the ordinary way practice works, so it
                // is marked the way a tutor would point at it, not the way a
                // form marks a validation error.
                const answered = !!practiceFeedback;
                const isTheirs = answered && selected;
                const markColor = isTheirs ? (practiceFeedback!.correct ? colors.teal : colors.amber) : colors.line;
                return (
                  <TouchableOpacity
                    key={choice}
                    style={[styles.answerChoice, {
                      borderColor: isTheirs ? markColor : (selected && !answered ? colors.brand : colors.line),
                      backgroundColor: isTheirs
                        ? (practiceFeedback!.correct ? colors.teal50 : colors.amber50)
                        : (selected && !answered ? colors.brand50 : colors.paper),
                      opacity: answered && !selected ? 0.55 : 1,
                    }]}
                    onPress={() => !practiceFeedback && setSelectedAnswer(choice)}
                    disabled={!!practiceFeedback}
                    accessibilityRole="radio"
                    accessibilityLabel={isTheirs
                      ? `${choice}. ${translate(practiceFeedback!.correct ? 'Your answer, correct.' : 'Your answer, not correct.')}`
                      : choice}
                    accessibilityState={{ selected, disabled: !!practiceFeedback }}
                  >
                    <Text style={[styles.answerChoiceText, { color: colors.ink2 }]}>{choice}</Text>
                    {isTheirs && (
                      <Text style={[styles.choiceMark, { color: markColor }]}>
                        {practiceFeedback!.correct ? 'Your answer · correct' : 'Your answer'}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
              {/* Same arithmetic as the send button: #fff on colors.line is
                  about 1.24:1 over light-mode paper, so until a choice was
                  tapped this primary action read as an empty pill. The label
                  colour follows the fill. */}
              {!practiceFeedback ? (
                <TouchableOpacity
                  style={[styles.checkAnswerButton, { backgroundColor: selectedAnswer ? colors.brand : colors.line }]}
                  onPress={handleCheckPractice}
                  disabled={!selectedAnswer || evaluatePractice.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Check answer"
                  accessibilityState={{ disabled: !selectedAnswer || evaluatePractice.isPending }}
                >
                  {evaluatePractice.isPending
                    ? <ActivityIndicator size="small" color={colors.ink2} />
                    : <Text style={[styles.checkAnswerText, { color: selectedAnswer ? '#fff' : colors.ink2 }]}>Check answer</Text>}
                </TouchableOpacity>
              ) : (
                <View style={[styles.feedbackCard, { backgroundColor: practiceFeedback.correct ? colors.teal50 : colors.amber50 }]}>
                  <Text style={[styles.feedbackTitle, { color: practiceFeedback.correct ? colors.teal : colors.amber }]}>{practiceFeedback.correct ? 'Correct' : 'Keep working at it'}</Text>
                  {(() => {
                    // Order follows the recovery, not the grading: what you
                    // were thinking, then what the idea actually is. The
                    // duplicated explanation is removed from the verdict line
                    // rather than printed twice (see lib/practiceFeedback).
                    const teaching = practiceFeedback.correct ? null : practiceFeedback.teaching ?? null;
                    const split = splitPracticeFeedback(practiceFeedback.feedback, teaching?.why_correct);
                    const focusTopic = teaching?.focus ?? practice.topics[0] ?? null;
                    const mastered = focusTopic ? topicMastery.find((t) => t.topic === focusTopic) : undefined;
                    // "Repeatedly", not "once" — a single slip does not earn a
                    // whole re-explanation, and each one spends a message from
                    // the student's daily allowance.
                    const repeatedMiss = !!mastered && mastered.attempts >= 2 && mastered.correct / mastered.attempts < 0.7;
                    return (
                      <>
                        {!!teaching && (
                          <Text style={[styles.feedbackText, { color: colors.ink2 }]}>{teaching.misconception}</Text>
                        )}
                        {!!split.verdict && (
                          <Text style={[teaching ? styles.feedbackAnswer : styles.feedbackText, { color: teaching ? colors.ink : colors.ink2 }]}>
                            {split.verdict}
                          </Text>
                        )}
                        {!!split.whyCorrect && (
                          <Text style={[styles.feedbackWhy, { color: colors.ink2 }]}>{split.whyCorrect}</Text>
                        )}
                        <View style={styles.recoveryRow}>
                          {practiceFeedback.correct ? (
                            <TouchableOpacity
                              onPress={() => handleGeneratePractice(practice.mode)}
                              style={styles.recoveryAction}
                              accessibilityRole="button"
                            >
                              <Text style={[styles.nextQuestionText, { color: colors.brand }]}>Next question</Text>
                            </TouchableOpacity>
                          ) : (
                            <>
                              <TouchableOpacity
                                onPress={() => handleAnotherOnTopic(practice.mode, focusTopic)}
                                style={styles.recoveryAction}
                                disabled={isTutorWorking}
                                accessibilityRole="button"
                                accessibilityLabel={focusTopic ? `${translate('Another question on')} ${focusTopic}` : 'Next question'}
                              >
                                <Text style={[styles.nextQuestionText, { color: colors.brand }]} numberOfLines={2}>
                                  {focusTopic ? `${translate('Another on')} ${focusTopic}` : 'Next question'}
                                </Text>
                              </TouchableOpacity>
                              {!!teaching && repeatedMiss && (
                                <TouchableOpacity
                                  onPress={() => handleExplainDifferently(focusTopic, teaching.misconception)}
                                  style={styles.recoveryAction}
                                  disabled={isTutorWorking}
                                  accessibilityRole="button"
                                >
                                  <Text style={[styles.recoverySecondary, { color: colors.brand }]} numberOfLines={2}>
                                    Explain this differently
                                  </Text>
                                </TouchableOpacity>
                              )}
                            </>
                          )}
                        </View>
                      </>
                    );
                  })()}
                </View>
              )}
              {practice.citations?.length > 0 && <Text style={[styles.practiceSources, { color: colors.ink3 }]}>Sources: {practice.citations.map((citation) => citation.label).join(' · ')}</Text>}
            </View>
          )}
          {isTutorWorking && streamingText === null && (
            <FileWorkProgress
              compact
              title={tutorWork?.stage === 'reading'
                ? 'Reading your documents…'
                : tutorWork?.kind === 'practice'
                  ? 'Creating practice…'
                  : 'Writing your answer…'}
              detail={tutorWork?.stage === 'reading' && readProgress
                ? `${readProgress.completed} of ${readProgress.total} ready · ${readProgress.filename}`
                : course?.name ? `Grounded in ${course.name}` : undefined}
            />
          )}
        </ScrollView>

        {/* Composer */}
        {!!attachment && (
          <View style={[styles.attachmentBar, { borderTopColor: colors.line, backgroundColor: colors.paper, maxWidth: columnWidth }]}>
            <Image source={{ uri: attachment.uri }} style={styles.attachmentThumb} />
            <Text style={[styles.attachmentLabel, { color: colors.ink2 }]} numberOfLines={2}>
              Attached to your next question. It isn{'\u2019'}t saved to your course.
            </Text>
            <TouchableOpacity
              onPress={() => setAttachment(null)}
              style={styles.attachmentRemove}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
            >
              <FontAwesome name="times-circle" size={18} color={colors.ink3} />
            </TouchableOpacity>
          </View>
        )}
        <View
          onLayout={handleComposerLayout}
          style={[styles.composer, { borderTopColor: colors.line, backgroundColor: colors.paper, maxWidth: columnWidth }]}
        >
          <TouchableOpacity
            style={[styles.attachBtn, { borderColor: colors.line }]}
            onPress={handleAttachPhoto}
            disabled={isTutorWorking}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Attach a photo of a problem"
          >
            <FontAwesome name="camera" size={15} color={attachment ? colors.brand : colors.ink3} />
          </TouchableOpacity>
          <TextInput
            style={[styles.input, { color: colors.ink, backgroundColor: colors.card, borderColor: colors.line }]}
            value={draft}
            onChangeText={setDraft}
            placeholder={course?.name ? `Ask about ${course.name}…` : 'Ask a study question…'}
            placeholderTextColor={colors.ink3}
            multiline
            maxLength={4000}
          />
          {/* The glyph colour has to follow the pill, not be assumed white.
              `colors.line` is a near-transparent hairline — over light-mode
              paper it resolves to roughly #E8E7E4, and white on that is about
              1.2:1. The arrow and the in-flight spinner were both invisible,
              so for the whole duration of every answer the primary control of
              this screen was a blank grey disc.

              Labelled too: this is the one control on the screen VoiceOver
              could not name. Its only child is a glyph in a Unicode
              private-use codepoint, so there is no text to fall back on, and
              every other icon-only control here is already labelled. */}
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: sendEnabled ? colors.brand : colors.line },
            ]}
            onPress={handleSend}
            disabled={!sendEnabled}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={isTutorWorking ? 'Sending your question' : 'Send'}
            accessibilityState={{ disabled: !sendEnabled, busy: isTutorWorking }}
          >
            {isTutorWorking ? (
              <ActivityIndicator size="small" color={colors.ink2} />
            ) : (
              /* ink2, not ink3: ink3 clears 3:1 against the disabled pill in
                 neither theme (2.72 light, 2.75 dark). ink2 is 5.98 and 5.51. */
              <FontAwesome name="arrow-up" size={16} color={sendEnabled ? '#fff' : colors.ink2} />
            )}
          </TouchableOpacity>
        </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* The controls the four stacked bars used to hold. Same handlers, same
          capabilities — they simply stopped charging rent on every screen. */}
      <Modal
        visible={contextSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setContextSheetOpen(false)}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setContextSheetOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { backgroundColor: colors.paper }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.line }]} />
          <ScrollView contentContainerStyle={{ paddingBottom: 28 }}>
            {semesterCourses.length > 0 && (
              <View style={styles.ctxSection}>
                <Text style={[styles.ctxLabel, { color: colors.ink3 }]}>Course</Text>
                <View style={styles.ctxChipWrap}>
                  <TouchableOpacity
                    style={[styles.scopeChip, { borderColor: colors.line, backgroundColor: colors.card },
                      courseId === null && { borderColor: colors.brand, backgroundColor: colors.brand50 }]}
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.selectionAsync();
                      setCourseId(null);
                      setPractice(null); setPracticeFeedback(null); setSelectedAnswer(null);
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: courseId === null }}
                  >
                    <Text style={[styles.scopeChipText, { color: courseId === null ? colors.brand : colors.ink2 }]}>
                      General
                    </Text>
                  </TouchableOpacity>
                  {semesterCourses.map((c) => {
                    const active = c.id === courseId;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.scopeChip, { borderColor: colors.line, backgroundColor: colors.card },
                          active && { borderColor: colors.brand, backgroundColor: colors.brand50 }]}
                        onPress={() => {
                          if (Platform.OS !== 'web') Haptics.selectionAsync();
                          setCourseId(c.id);
                          setPractice(null); setPracticeFeedback(null); setSelectedAnswer(null);
                          track('tutor_course_scoped', { screen: 'tutor' });
                        }}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <View style={[styles.scopeDot, { backgroundColor: c.color || colors.brand }]} />
                        <Text style={[styles.scopeChipText, { color: active ? colors.brand : colors.ink2 }]} numberOfLines={1}>
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={styles.ctxSection}>
              <Text style={[styles.ctxLabel, { color: colors.ink3 }]}>Material</Text>
              <View style={styles.ctxChipWrap}>
                <TouchableOpacity
                  style={[styles.addNoteChip, { borderColor: colors.brand, backgroundColor: colors.brand50 }]}
                  onPress={handleAddNotes}
                  disabled={uploadNote.isPending}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Add notes"
                >
                  {uploadNote.isPending
                    ? <ActivityIndicator size="small" color={colors.brand} />
                    : <FontAwesome name="paperclip" size={12} color={colors.brand} />}
                  <Text style={[styles.addNoteText, { color: colors.brand }]}>Add notes</Text>
                </TouchableOpacity>
                {notes.map((n) => (
                  <TouchableOpacity
                    key={n.id}
                    style={[styles.noteChip, { backgroundColor: colors.card, borderColor: colors.line }]}
                    onPress={() => confirmDeleteNote(n)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={n.filename}
                    accessibilityHint="Removes this note from the tutor's material"
                  >
                    <FontAwesome name="file-text-o" size={11} color={colors.ink3} />
                    <Text style={[styles.noteChipText, { color: colors.ink2 }]} numberOfLines={1}>{n.filename}</Text>
                    <FontAwesome name="times" size={11} color={colors.ink3} />
                  </TouchableOpacity>
                ))}
              </View>
              {fileProgress && (
                <View style={styles.fileProgressWrap}>
                  <FileWorkProgress
                    compact
                    title={fileProgress.stage === 'uploading' ? `Uploading ${fileProgress.percent ?? 0}%`
                      : fileProgress.stage === 'reading' ? 'Reading document…'
                      : fileProgress.stage === 'saving' ? 'Saving document…'
                      : fileProgress.stage === 'ready' ? 'Document ready' : 'Preparing document…'}
                    detail={fileProgress.filename}
                    percent={fileProgress.stage === 'uploading' ? fileProgress.percent : undefined}
                    complete={fileProgress.stage === 'ready'}
                  />
                </View>
              )}
            </View>

            {courseId && (
              <View style={styles.ctxSection}>
                <Text style={[styles.ctxLabel, { color: colors.ink3 }]}>Study tools</Text>
                <View style={styles.ctxChipWrap}>
                  <TouchableOpacity
                    style={[styles.actionChip, { backgroundColor: colors.brand50, borderColor: colors.brand100 }]}
                    onPress={() => { setContextSheetOpen(false); handleGeneratePractice('practice'); }}
                    disabled={isTutorWorking}
                    accessibilityRole="button"
                  >
                    <FontAwesome name="pencil" size={12} color={colors.brand} />
                    <Text style={[styles.actionText, { color: colors.brand }]}>Practice me</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionChip, { backgroundColor: colors.card, borderColor: colors.line }]}
                    onPress={() => { setContextSheetOpen(false); handleGeneratePractice('quiz'); }}
                    disabled={isTutorWorking}
                    accessibilityRole="button"
                  >
                    <FontAwesome name="list-ol" size={12} color={colors.ink2} />
                    <Text style={[styles.actionText, { color: colors.ink2 }]}>Quick quiz</Text>
                  </TouchableOpacity>
                  {upcomingWork.filter((t) => t.type === 'assignment' || t.type === 'project').slice(0, 2).map((task) => (
                    <TouchableOpacity
                      key={task.id}
                      style={[styles.actionChip, { backgroundColor: colors.card, borderColor: colors.line }]}
                      onPress={() => { setContextSheetOpen(false); handleExplainAssignment(task); }}
                      disabled={isTutorWorking}
                      accessibilityRole="button"
                    >
                      <FontAwesome name="lightbulb-o" size={13} color={colors.ink2} />
                      <Text style={[styles.actionText, { color: colors.ink2 }]} numberOfLines={1}>Explain {task.title}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {(topicMastery.length > 0 || (riskReport?.recoveryPlan.length ?? 0) > 0 || upcomingWork.length > 0) && (
                  <View style={[styles.coachBrief, { backgroundColor: colors.card, borderColor: colors.line, marginHorizontal: 0 }]}>
                    <View style={styles.coachBriefHead}>
                      <FontAwesome name="compass" size={13} color={colors.teal} />
                      <Text style={[styles.coachBriefTitle, { color: colors.ink }]}>Course intelligence</Text>
                    </View>
                    {topicMastery.filter((t) => t.attempts > 0 && t.correct / t.attempts < 0.7).slice(0, 2).map((t) => (
                      <Text key={t.id} style={[styles.coachBriefText, { color: colors.ink3 }]}>Review {t.topic} — {Math.round((t.correct / t.attempts) * 100)}% in practice.</Text>
                    ))}
                    {riskReport?.recoveryPlan.slice(0, 1).map((step) => (
                      <Text key={step.id} style={[styles.coachBriefText, { color: colors.ink3 }]}>{step.title}: {step.detail}</Text>
                    ))}
                    {!topicMastery.length && !riskReport?.recoveryPlan.length && upcomingWork[0] && (
                      <Text style={[styles.coachBriefText, { color: colors.ink3 }]}>Start with {upcomingWork[0].title} due {upcomingWork[0].due_date}.</Text>
                    )}
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Every chat in this scope. Ordered by last use, because the one you
          were in five minutes ago is the one you want back. */}
      <Modal
        visible={threadSheetOpen}
        transparent
        animationType="slide"
        // Android's Back must close the rename card first — otherwise it tears
        // down the whole sheet and silently discards what was being typed.
        onRequestClose={() => {
          if (renamingThread) { setRenamingThread(null); return; }
          setThreadSheetOpen(false);
        }}
      >
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setThreadSheetOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={[styles.sheet, { backgroundColor: colors.paper, maxWidth: contentMaxWidth }]}>
          <View style={styles.sheetHandleWrap}><View style={[styles.sheetHandle, { backgroundColor: colors.line }]} /></View>
          <View style={styles.sheetHead}>
            <Text style={[styles.sheetTitle, { color: colors.ink }]}>
              {course?.name ? `Chats · ${course.name}` : 'General chats'}
            </Text>
            <TouchableOpacity
              style={[styles.sheetNewBtn, { backgroundColor: colors.brand }]}
              onPress={handleNewThread}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Start a new chat"
            >
              <FontAwesome name="plus" size={11} color="#fff" />
              <Text style={styles.sheetNewText}>New chat</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.sheetList} contentContainerStyle={{ paddingBottom: 24 }}>
            {threads.length === 0 && (
              <Text style={[styles.sheetEmpty, { color: colors.ink3 }]}>
                No chats yet. Ask a question and this one gets named after it.
              </Text>
            )}
            {threads.map((thread) => {
              const active = thread.id === conversationId;
              return (
                <View
                  key={thread.id}
                  style={[
                    styles.threadRow,
                    { borderColor: active ? colors.brand : colors.line, backgroundColor: colors.card },
                  ]}
                >
                  <TouchableOpacity
                    style={styles.threadRowMain}
                    onPress={() => {
                      setPickedThreadId(thread.id);
                      setThreadSheetOpen(false);
                      setPractice(null);
                      setPracticeFeedback(null);
                      setSelectedAnswer(null);
                    }}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={thread.title || 'Untitled chat'}
                  >
                    <Text style={[styles.threadRowTitle, { color: active ? colors.brand : colors.ink }]} numberOfLines={1}>
                      {thread.title || 'New chat'}
                    </Text>
                    <Text style={[styles.threadRowMeta, { color: colors.ink3 }]}>
                      {new Date(thread.updated_at || thread.created_at).toLocaleDateString()}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleRenameThread(thread)}
                    style={styles.threadRowAction}
                    accessibilityRole="button"
                    accessibilityLabel="Rename chat"
                  >
                    <FontAwesome name="pencil" size={13} color={colors.ink3} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteThread(thread)}
                    style={styles.threadRowAction}
                    accessibilityRole="button"
                    accessibilityLabel="Delete chat"
                  >
                    <FontAwesome name="trash-o" size={14} color={colors.coral} />
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>

        {renamingThread && (
          <View style={styles.renameOverlay}>
            <View style={[styles.renameCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <Text style={[styles.renameTitle, { color: colors.ink }]}>Rename chat</Text>
              <TextInput
                value={renameDraft}
                onChangeText={setRenameDraft}
                autoFocus
                selectTextOnFocus
                maxLength={80}
                returnKeyType="done"
                onSubmitEditing={commitRename}
                placeholder="Chat name"
                placeholderTextColor={colors.ink3}
                style={[styles.renameInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paper }]}
              />
              <View style={styles.renameActions}>
                <TouchableOpacity
                  onPress={() => setRenamingThread(null)}
                  style={styles.renameBtn}
                  accessibilityRole="button"
                >
                  <Text style={[styles.renameBtnText, { color: colors.ink2 }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={commitRename}
                  style={[styles.renameBtn, styles.renameBtnPrimary, { backgroundColor: colors.brand }]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.renameBtnText, { color: '#fff' }]}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ── Workspace ────────────────────────────────────────────────────────────
  workspace: { flex: 1, flexDirection: 'row' },
  mainCol: { flex: 1 },
  rail: { borderRightWidth: 0.5 },
  railHead: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase',
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
  },
  railList: { paddingHorizontal: 10, paddingBottom: 20, gap: 2 },
  railRow: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8 },
  railRowText: { fontSize: 13.5, fontWeight: '600' },

  // ── The one context line ─────────────────────────────────────────────────
  contextBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    minHeight: 44, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 0.5, width: '100%', alignSelf: 'center',
  },
  contextDot: { width: 9, height: 9, borderRadius: 5 },
  /** An answer on the page, not in a box. Full measure, breathing room. */
  answer: { alignSelf: 'stretch', paddingHorizontal: 2, paddingVertical: 4 },
  contextText: { flex: 1, fontSize: 13, fontWeight: '600' },

  // ── Context sheet ────────────────────────────────────────────────────────
  ctxSection: { paddingHorizontal: 18, paddingTop: 18 },
  ctxLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 0.6,
    textTransform: 'uppercase', marginBottom: 9,
  },
  ctxChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },

  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 100, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },

  // Pro teaser (mirrors flashcards)
  teaserCard: { borderRadius: 18, padding: 24, borderWidth: 0.5, borderColor: COLORS.line, alignItems: 'center', marginTop: 20 },
  teaserIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  teaserTitle: { fontFamily: FONTS.displaySemibold, fontSize: 19, color: COLORS.ink, textAlign: 'center', marginBottom: 8 },
  teaserDesc: { fontSize: 14, color: COLORS.ink3, textAlign: 'center', lineHeight: 20, maxWidth: 300, marginBottom: 18 },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  upgradeText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Notes bar
  scopeChip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 190 },
  scopeChipText: { fontSize: 13, fontWeight: '600' },
  scopeDot: { width: 7, height: 7, borderRadius: 999 },
  fileProgressWrap: { paddingHorizontal: 14, paddingBottom: 10 },
  addNoteChip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  addNoteText: { fontSize: 13, fontWeight: '700' },
  noteChip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, borderWidth: 0.5, maxWidth: 180 },
  noteChipText: { fontSize: 12.5, fontWeight: '500', flexShrink: 1 },
  actionChip: { minHeight: 44, maxWidth: 210, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8 },
  actionText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  coachBrief: { marginHorizontal: 14, marginTop: 10, borderWidth: 0.5, borderRadius: 12, padding: 11 },
  coachBriefHead: { flexDirection: 'row', gap: 7, alignItems: 'center', marginBottom: 5 },
  coachBriefTitle: { fontSize: 12.5, fontWeight: '800' },
  coachBriefText: { fontSize: 11.5, lineHeight: 16, marginTop: 3 },

  // Messages
  messages: { padding: 16, paddingBottom: 24, width: '100%', alignSelf: 'center', gap: 10 },
  bubble: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleUser: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  messageUserWrap: { alignSelf: 'flex-end', maxWidth: '86%' },
  messageAssistantWrap: { alignSelf: 'flex-start', maxWidth: '92%' },
  citationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  citationChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 0.5, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4 },
  citationText: { fontSize: 9.5, fontWeight: '600', flexShrink: 1 },
  practiceCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 4 },
  practiceHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  practiceEyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 },
  practiceTopics: { flex: 1, fontSize: 10.5, textAlign: 'right' },
  practicePrompt: { fontSize: 15, fontWeight: '700', lineHeight: 21, marginTop: 10, marginBottom: 10 },
  answerChoice: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 10, marginTop: 7 },
  answerChoiceText: { fontSize: 13, lineHeight: 18 },
  checkAnswerButton: { height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  checkAnswerText: { fontSize: 13, fontWeight: '800' },
  feedbackCard: { borderRadius: 11, padding: 11, marginTop: 12 },
  feedbackTitle: { fontSize: 13, fontWeight: '800' },
  feedbackText: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  nextQuestionText: { fontSize: 12.5, fontWeight: '800' },
  /** Small caption on the choice the student actually picked. */
  choiceMark: { fontSize: 10.5, fontWeight: '700', marginTop: 3, letterSpacing: 0.2 },
  /** The correct answer, once, after the diagnosis. */
  feedbackAnswer: { fontSize: 12.5, fontWeight: '700', lineHeight: 17, marginTop: 8 },
  feedbackWhy: { fontSize: 12.5, lineHeight: 17, marginTop: 4 },
  /** Wraps rather than scrolls: at large text each action takes its own row. */
  recoveryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 20, rowGap: 0, marginTop: 4 },
  recoveryAction: { minHeight: 44, justifyContent: 'center' },
  recoverySecondary: { fontSize: 12.5, fontWeight: '600' },
  practiceSources: { fontSize: 10.5, lineHeight: 15, marginTop: 10 },

  emptyState: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  emptyText: { fontSize: 13.5, textAlign: 'center', lineHeight: 19, maxWidth: 280 },

  // Threads
  quotaPill: { fontSize: 10.5, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { maxHeight: '70%', width: '100%', alignSelf: 'center', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 8 },
  sheetHandleWrap: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 10 },
  sheetTitle: { flex: 1, fontFamily: FONTS.displaySemibold, fontSize: 17 },
  sheetNewBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  sheetNewText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  sheetList: { paddingHorizontal: 14 },
  sheetEmpty: { fontSize: 13, lineHeight: 19, paddingHorizontal: 4, paddingVertical: 18, textAlign: 'center' },
  threadRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, marginBottom: 8, paddingRight: 6 },
  threadRowMain: { flex: 1, paddingHorizontal: 12, paddingVertical: 11, gap: 3 },
  threadRowTitle: { fontSize: 14, fontWeight: '600' },
  threadRowMeta: { fontSize: 11 },
  threadRowAction: { padding: 9 },
  renameOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 28,
  },
  renameCard: { width: '100%', maxWidth: 380, borderRadius: 18, borderWidth: 1, padding: 18 },
  renameTitle: { fontSize: 16.5, fontWeight: '700', marginBottom: 12 },
  renameInput: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  renameActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 14 },
  renameBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10 },
  renameBtnPrimary: { minWidth: 84, alignItems: 'center' },
  renameBtnText: { fontSize: 14.5, fontWeight: '700' },

  // Answer actions
  answerActions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3, marginLeft: 2 },
  answerAction: { paddingVertical: 5, paddingHorizontal: 7 },

  // Starters
  starterWrap: { gap: 8, marginTop: 14, width: '100%' },
  starterChip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  starterText: { flex: 1, fontSize: 13.5, lineHeight: 18 },

  // Attachment
  attachmentBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: 0.5, width: '100%', alignSelf: 'center' },
  attachmentThumb: { width: 42, height: 42, borderRadius: 8 },
  attachmentLabel: { flex: 1, fontSize: 11.5, lineHeight: 16 },
  attachmentRemove: { padding: 4 },
  attachBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },

  // Composer
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 0.5, width: '100%', alignSelf: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
