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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  type TutorConversation, type TutorGradeSnapshot,
} from '@/lib/tutor';
import { RichText } from '@/components/RichText';
import { shareText, shareTextMessage } from '@/lib/shareLink';
import {
  normalizeSupportedDocument,
  SUPPORTED_DOCUMENT_PICKER_TYPE,
  unsupportedDocumentMessage,
} from '@/lib/documentFiles';
import { FileWorkProgress } from '@/components/FileWorkProgress';

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
                if (Platform.OS === 'ios') Haptics.selectionAsync();
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
  const { contentMaxWidth, isDesktop } = useResponsive();

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
  const [threadSheetOpen, setThreadSheetOpen] = useState(false);
  /** The answer as it is being written, before it becomes a stored turn. */
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<
    { uri: string; base64: string; mimeType: string } | null
  >(null);
  const [practice, setPractice] = useState<TutorPracticeQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [practiceFeedback, setPracticeFeedback] = useState<{ correct: boolean; feedback: string } | null>(null);
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
  const isTutorWorking = tutorWork !== null || sendMessage.isPending || generatePractice.isPending;

  useEffect(() => () => {
    if (fileProgressClearRef.current) clearTimeout(fileProgressClearRef.current);
  }, []);

  const scrollToEnd = useCallback(() => {
    // Defer past layout so the newest message is measured before we scroll.
    requestAnimationFrame(() =>
      scrollRef.current?.scrollToEnd({ animated: !streamingRef.current }));
  }, []);

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
  const starterPrompts = useMemo(() => {
    // Translated HERE, not at render. The chip both displays this string and
    // becomes the draft, so translating only the <Text> would show a Spanish
    // chip that types an English question into the composer.
    if (!courseId) {
      return [
        translate('What should I work on tonight?'),
        translate('Which deadline should I worry about first?'),
        translate('Help me plan the next two weeks.'),
      ];
    }
    const prompts: string[] = [];
    // The task title is the student's own text and is never translated.
    if (upcomingWork[0]) prompts.push(`${translate('Help me get started on')} ${upcomingWork[0].title}`);
    if (notes.length > 0) prompts.push(translate('Summarise the key ideas from my notes.'));
    if (gradeSnapshot?.percentage != null) {
      prompts.push(translate('What do I need on the rest to finish with an A?'));
    }
    prompts.push(translate('What should I study first for this course?'));
    return prompts.slice(0, 4);
  }, [courseId, upcomingWork, notes.length, gradeSnapshot?.percentage]);

  const handleGeneratePractice = async (mode: 'practice' | 'quiz') => {
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
      const next = await generatePractice.mutateAsync({ mode });
      setPractice(next);
      setSelectedAnswer(null);
      setPracticeFeedback(null);
      track('tutor_practice_generated', { screen: 'tutor', mode });
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
    if (Platform.OS === 'ios') Haptics.selectionAsync();
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
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
    if (Platform.OS === 'ios') Haptics.selectionAsync();
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
      if (Platform.OS === 'ios') Haptics.selectionAsync();
    } catch (e: any) {
      Alert.alert("Couldn't start a new chat", e?.message || 'Please try again.');
    }
  };

  const handleRenameThread = (thread: TutorConversation) => {
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
      <Stack.Screen options={{ title: translate('AI Tutor') }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Which conversation this is, and the way out to another one. A
            thread was previously an invisible, permanent, per-course singleton
            — this is the whole of the UI that changes that. */}
        <View style={[styles.threadBar, { borderBottomColor: colors.line, maxWidth: contentMaxWidth }]}>
          <TouchableOpacity
            style={styles.threadTitleBtn}
            onPress={() => setThreadSheetOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Switch chat"
          >
            <FontAwesome name="comments-o" size={13} color={colors.ink3} />
            <Text style={[styles.threadTitle, { color: colors.ink }]} numberOfLines={1}>
              {activeThread?.title || 'New chat'}
            </Text>
            <FontAwesome name="angle-down" size={14} color={colors.ink3} />
          </TouchableOpacity>
          {/* Only worth the space once it is close enough to matter. Before
              this the cap was invisible until the moment it refused a
              question, which is the one moment it is too late to be useful. */}
          {!!quota && quota.cap - quota.used <= 10 && (
            <Text style={[styles.quotaPill, { color: colors.amber, backgroundColor: colors.amber50 }]}>
              {`${Math.max(0, quota.cap - quota.used)} left today`}
            </Text>
          )}
          <TouchableOpacity
            style={[styles.newThreadBtn, { borderColor: colors.line }]}
            onPress={handleNewThread}
            disabled={isTutorWorking || createThread.isPending}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="New chat"
          >
            <FontAwesome name="plus" size={11} color={colors.brand} />
            <Text style={[styles.newThreadText, { color: colors.brand }]}>New</Text>
          </TouchableOpacity>
        </View>

        {/* Course scope picker — only worth showing when there's a choice to
            make. "General" keeps the unscoped chat that this screen already
            offered, so nothing is taken away by adding the scope. */}
        {semesterCourses.length > 0 && (
          <View style={[styles.scopeBar, { borderBottomColor: colors.line, maxWidth: contentMaxWidth }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scopeRow}>
              <Text style={[styles.scopeLabel, { color: colors.ink3 }]}>Course</Text>
              <TouchableOpacity
                style={[
                  styles.scopeChip,
                  { borderColor: colors.line, backgroundColor: colors.card },
                  courseId === null && { borderColor: colors.brand, backgroundColor: colors.brand50 },
                ]}
                onPress={() => {
                  if (Platform.OS === 'ios') Haptics.selectionAsync();
                  setCourseId(null);
                }}
                activeOpacity={0.8}
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
                    style={[
                      styles.scopeChip,
                      { borderColor: colors.line, backgroundColor: colors.card },
                      active && { borderColor: colors.brand, backgroundColor: colors.brand50 },
                    ]}
                    onPress={() => {
                      if (Platform.OS === 'ios') Haptics.selectionAsync();
                      setCourseId(c.id);
                      track('tutor_course_scoped', { screen: 'tutor' });
                    }}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.scopeDot, { backgroundColor: c.color || colors.brand }]} />
                    <Text
                      style={[styles.scopeChipText, { color: active ? colors.brand : colors.ink2 }]}
                      numberOfLines={1}
                    >
                      {c.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Notes / grounding bar */}
        <View style={[styles.notesBar, { borderBottomColor: colors.line, maxWidth: contentMaxWidth }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.notesRow}
          >
            <TouchableOpacity
              style={[styles.addNoteChip, { borderColor: colors.brand, backgroundColor: colors.brand50 }]}
              onPress={handleAddNotes}
              disabled={uploadNote.isPending}
              activeOpacity={0.8}
            >
              {uploadNote.isPending ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <FontAwesome name="paperclip" size={12} color={colors.brand} />
              )}
              <Text style={[styles.addNoteText, { color: colors.brand }]}>Add notes</Text>
            </TouchableOpacity>
            {notes.map((n) => (
              <TouchableOpacity
                key={n.id}
                style={[styles.noteChip, { backgroundColor: colors.card, borderColor: colors.line }]}
                onPress={() => confirmDeleteNote(n)}
                activeOpacity={0.7}
              >
                <FontAwesome name="file-text-o" size={11} color={colors.ink3} />
                <Text style={[styles.noteChipText, { color: colors.ink2 }]} numberOfLines={1}>
                  {n.filename}
                </Text>
                <FontAwesome name="times" size={11} color={colors.ink3} />
              </TouchableOpacity>
            ))}
          </ScrollView>
          {fileProgress && (
            <View style={styles.fileProgressWrap}>
              <FileWorkProgress
                compact
                title={fileProgress.stage === 'uploading'
                  ? `Uploading ${fileProgress.percent ?? 0}%`
                  : fileProgress.stage === 'reading'
                    ? 'Reading document…'
                    : fileProgress.stage === 'saving'
                      ? 'Saving document…'
                      : fileProgress.stage === 'ready'
                        ? 'Document ready'
                        : 'Preparing document…'}
                detail={fileProgress.filename}
                percent={fileProgress.stage === 'uploading' ? fileProgress.percent : undefined}
                complete={fileProgress.stage === 'ready'}
              />
            </View>
          )}
        </View>

        {courseId && (
          <View style={[styles.intelligencePanel, { borderBottomColor: colors.line, maxWidth: contentMaxWidth }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>
              <TouchableOpacity style={[styles.actionChip, { backgroundColor: colors.brand50, borderColor: colors.brand100 }]} onPress={() => handleGeneratePractice('practice')} disabled={isTutorWorking}>
                <FontAwesome name="pencil" size={12} color={colors.brand} />
                <Text style={[styles.actionText, { color: colors.brand }]}>{tutorWork?.kind === 'practice' ? 'Creating…' : 'Practice me'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionChip, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={() => handleGeneratePractice('quiz')} disabled={isTutorWorking}>
                <FontAwesome name="list-ol" size={12} color={colors.ink2} />
                <Text style={[styles.actionText, { color: colors.ink2 }]}>Quick quiz</Text>
              </TouchableOpacity>
              {upcomingWork.filter((task) => task.type === 'assignment' || task.type === 'project').slice(0, 2).map((task) => (
                <TouchableOpacity key={task.id} style={[styles.actionChip, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={() => handleExplainAssignment(task)} disabled={isTutorWorking}>
                  <FontAwesome name="lightbulb-o" size={13} color={colors.ink2} />
                  <Text style={[styles.actionText, { color: colors.ink2 }]} numberOfLines={1}>Explain {task.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Boolean, not a raw count. `a || b.length || c.length` yields the
                NUMBER 0 when everything is empty, and `0 && <View/>` renders a
                literal "0" on screen — which is what every brand-new user saw
                floating under the action chips. */}
            {(topicMastery.length > 0 || (riskReport?.recoveryPlan.length ?? 0) > 0 || upcomingWork.length > 0) && (
              <View style={[styles.coachBrief, { backgroundColor: colors.card, borderColor: colors.line }]}>
                <View style={styles.coachBriefHead}>
                  <FontAwesome name="compass" size={13} color={colors.teal} />
                  <Text style={[styles.coachBriefTitle, { color: colors.ink }]}>Course intelligence</Text>
                </View>
                {topicMastery.filter((topic) => topic.attempts > 0 && topic.correct / topic.attempts < 0.7).slice(0, 2).map((topic) => (
                  <Text key={topic.id} style={[styles.coachBriefText, { color: colors.ink3 }]}>Review {topic.topic} — {Math.round((topic.correct / topic.attempts) * 100)}% in practice.</Text>
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

        {/* Message list */}
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.messages, { maxWidth: contentMaxWidth }]}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToEnd}
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
                {courseId
                  ? 'Answers are grounded in this course’s syllabus, deadlines, grades, and any notes you attach above.'
                  : 'Ask across every course — your deadlines are already here. Pick a course above to add its syllabus and notes.'}
              </Text>
              {/* A blank chat box is a hard thing to start. These are the
                  questions this app can answer better than a general chatbot,
                  because it is holding the material — so the first question a
                  student asks is one that shows that. */}
              <View style={styles.starterWrap}>
                {starterPrompts.map((prompt) => (
                  <TouchableOpacity
                    key={prompt}
                    style={[styles.starterChip, { borderColor: colors.line, backgroundColor: colors.card }]}
                    onPress={() => {
                      if (Platform.OS === 'ios') Haptics.selectionAsync();
                      setDraft(prompt);
                      track('tutor_starter_tapped', { screen: 'tutor', scoped: !!courseId });
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.starterText, { color: colors.ink2 }]}>{prompt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((m) => (
              <View key={m.id} style={m.role === 'user' ? styles.messageUserWrap : styles.messageAssistantWrap}>
                <View style={[
                  styles.bubble,
                  m.role === 'user'
                    ? [styles.bubbleUser, { backgroundColor: colors.brand }]
                    : [styles.bubbleAssistant, { backgroundColor: colors.card, borderColor: colors.line }],
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
                      <View key={`${citation.kind}-${citation.label}-${index}`} style={[styles.citationChip, { borderColor: colors.line, backgroundColor: colors.paper }]}>
                        <FontAwesome name="book" size={9} color={colors.ink3} />
                        <Text style={[styles.citationText, { color: colors.ink3 }]} numberOfLines={1}>{citation.label}</Text>
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
                            if (Platform.OS === 'ios') Haptics.selectionAsync();
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
                            if (Platform.OS === 'ios') Haptics.selectionAsync();
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
              <View style={[styles.bubble, styles.bubbleAssistant, { backgroundColor: colors.card, borderColor: colors.line }]}>
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
                return (
                  <TouchableOpacity key={choice} style={[styles.answerChoice, { borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brand50 : colors.paper }]} onPress={() => !practiceFeedback && setSelectedAnswer(choice)} disabled={!!practiceFeedback}>
                    <Text style={[styles.answerChoiceText, { color: colors.ink2 }]}>{choice}</Text>
                  </TouchableOpacity>
                );
              })}
              {!practiceFeedback ? (
                <TouchableOpacity style={[styles.checkAnswerButton, { backgroundColor: selectedAnswer ? colors.brand : colors.line }]} onPress={handleCheckPractice} disabled={!selectedAnswer || evaluatePractice.isPending}>
                  {evaluatePractice.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.checkAnswerText}>Check answer</Text>}
                </TouchableOpacity>
              ) : (
                <View style={[styles.feedbackCard, { backgroundColor: practiceFeedback.correct ? colors.teal50 : colors.amber50 }]}>
                  <Text style={[styles.feedbackTitle, { color: practiceFeedback.correct ? colors.teal : colors.amber }]}>{practiceFeedback.correct ? 'Correct' : 'Keep working at it'}</Text>
                  <Text style={[styles.feedbackText, { color: colors.ink2 }]}>{practiceFeedback.feedback}</Text>
                  <TouchableOpacity onPress={() => handleGeneratePractice(practice.mode)}><Text style={[styles.nextQuestionText, { color: colors.brand }]}>Next question</Text></TouchableOpacity>
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
          <View style={[styles.attachmentBar, { borderTopColor: colors.line, backgroundColor: colors.paper, maxWidth: contentMaxWidth }]}>
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
        <View style={[styles.composer, { borderTopColor: colors.line, backgroundColor: colors.paper, maxWidth: contentMaxWidth }]}>
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
          <TouchableOpacity
            style={[
              styles.sendBtn,
              { backgroundColor: draft.trim() && !isTutorWorking ? colors.brand : colors.line },
            ]}
            onPress={handleSend}
            disabled={!draft.trim() || isTutorWorking}
            activeOpacity={0.85}
          >
            {isTutorWorking ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <FontAwesome name="arrow-up" size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Every chat in this scope. Ordered by last use, because the one you
          were in five minutes ago is the one you want back. */}
      <Modal
        visible={threadSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setThreadSheetOpen(false)}
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
                  {Platform.OS === 'ios' && (
                    <TouchableOpacity
                      onPress={() => handleRenameThread(thread)}
                      style={styles.threadRowAction}
                      accessibilityRole="button"
                      accessibilityLabel="Rename chat"
                    >
                      <FontAwesome name="pencil" size={13} color={colors.ink3} />
                    </TouchableOpacity>
                  )}
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
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  scopeBar: { borderBottomWidth: 1, width: '100%', alignSelf: 'center' },
  scopeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  scopeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginRight: 2 },
  scopeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 190 },
  scopeChipText: { fontSize: 13, fontWeight: '600' },
  scopeDot: { width: 7, height: 7, borderRadius: 999 },
  notesBar: { borderBottomWidth: 0.5, width: '100%', alignSelf: 'center' },
  notesRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 8, alignItems: 'center' },
  fileProgressWrap: { paddingHorizontal: 14, paddingBottom: 10 },
  addNoteChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  addNoteText: { fontSize: 13, fontWeight: '700' },
  noteChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, borderWidth: 0.5, maxWidth: 180 },
  noteChipText: { fontSize: 12.5, fontWeight: '500', flexShrink: 1 },
  intelligencePanel: { borderBottomWidth: 0.5, width: '100%', alignSelf: 'center', paddingVertical: 10 },
  actionRow: { paddingHorizontal: 14, gap: 8, alignItems: 'center' },
  actionChip: { maxWidth: 210, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8 },
  actionText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },
  coachBrief: { marginHorizontal: 14, marginTop: 10, borderWidth: 0.5, borderRadius: 12, padding: 11 },
  coachBriefHead: { flexDirection: 'row', gap: 7, alignItems: 'center', marginBottom: 5 },
  coachBriefTitle: { fontSize: 12.5, fontWeight: '800' },
  coachBriefText: { fontSize: 11.5, lineHeight: 16, marginTop: 3 },

  // Messages
  messages: { padding: 16, paddingBottom: 24, width: '100%', alignSelf: 'center', gap: 10 },
  bubble: { maxWidth: '86%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  bubbleUser: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bubbleAssistant: { alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 0.5 },
  bubbleText: { fontSize: 15, lineHeight: 21 },
  messageUserWrap: { alignSelf: 'flex-end', maxWidth: '86%' },
  messageAssistantWrap: { alignSelf: 'flex-start', maxWidth: '92%' },
  citationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 },
  citationChip: { maxWidth: 190, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 0.5, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4 },
  citationText: { fontSize: 9.5, fontWeight: '600', flexShrink: 1 },
  practiceCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 4 },
  practiceHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'center' },
  practiceEyebrow: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.8 },
  practiceTopics: { flex: 1, fontSize: 10.5, textAlign: 'right' },
  practicePrompt: { fontSize: 15, fontWeight: '700', lineHeight: 21, marginTop: 10, marginBottom: 10 },
  answerChoice: { borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 10, marginTop: 7 },
  answerChoiceText: { fontSize: 13, lineHeight: 18 },
  checkAnswerButton: { height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  checkAnswerText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  feedbackCard: { borderRadius: 11, padding: 11, marginTop: 12 },
  feedbackTitle: { fontSize: 13, fontWeight: '800' },
  feedbackText: { fontSize: 12.5, lineHeight: 18, marginTop: 4 },
  nextQuestionText: { fontSize: 12.5, fontWeight: '800', marginTop: 9 },
  practiceSources: { fontSize: 10.5, lineHeight: 15, marginTop: 10 },

  emptyState: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  emptyText: { fontSize: 13.5, textAlign: 'center', lineHeight: 19, maxWidth: 280 },

  // Threads
  threadBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 0.5, width: '100%', alignSelf: 'center' },
  threadTitleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  threadTitle: { flex: 1, fontSize: 13.5, fontWeight: '700' },
  quotaPill: { fontSize: 10.5, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  newThreadBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  newThreadText: { fontSize: 12, fontWeight: '700' },
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

  // Answer actions
  answerActions: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3, marginLeft: 2 },
  answerAction: { paddingVertical: 5, paddingHorizontal: 7 },

  // Starters
  starterWrap: { gap: 8, marginTop: 14, width: '100%', maxWidth: 340 },
  starterChip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11 },
  starterText: { fontSize: 13.5, lineHeight: 18 },

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
