import { useCallback, useMemo, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { track } from '@/lib/analytics';
import { useCourse, useGradeCategories, useTasks } from '@/lib/queries';
import { buildAcademicRiskReport } from '@/lib/academicRisk';
import {
  useTutorConversation, useTutorMessages, useSendTutorMessage,
  useCourseNotes, useUploadCourseNote, useDeleteCourseNote, useGenerateTutorPractice,
  useEvaluateTutorPractice, useCourseTopicMastery, type TutorPracticeQuestion,
} from '@/lib/tutor';

export default function TutorScreen() {
  const router = useRouter();
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const isPro = useAppStore((s) => s.isPro);
  // Optional course scope: /tutor?courseId=<id> grounds the tutor on that
  // course. Without it, the tutor is a general study chat.
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();

  // ── Pro gate: locked teaser routes to the paywall ─────────────
  if (!isPro) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <Stack.Screen options={{ title: 'AI Tutor' }} />
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
                router.push({ pathname: '/paywall', params: { context: 'tutor' } } as any);
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

  return <TutorChat courseId={courseId ?? null} />;
}

// Pro-only chat body, split out so the hooks below never run for free users
// (the early return above would otherwise violate the rules-of-hooks).
function TutorChat({ courseId }: { courseId: string | null }) {
  const router = useRouter();
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();

  const { data: course } = useCourse(courseId ?? '');
  const { data: courseTasks = [] } = useTasks(courseId ? { courseId } : { semesterId: null });
  const { data: gradeCategories = [] } = useGradeCategories(courseId);
  const { data: conversation } = useTutorConversation(courseId);
  const conversationId = conversation?.id ?? null;
  const { data: messages = [], isLoading } = useTutorMessages(conversationId);
  const sendMessage = useSendTutorMessage(conversationId, courseId);
  const generatePractice = useGenerateTutorPractice(conversationId, courseId);
  const evaluatePractice = useEvaluateTutorPractice(conversationId, courseId);
  const { data: topicMastery = [] } = useCourseTopicMastery(courseId);
  const { data: notes = [] } = useCourseNotes(courseId);
  const uploadNote = useUploadCourseNote(courseId);
  const deleteNote = useDeleteCourseNote(courseId);

  const [draft, setDraft] = useState('');
  const [practice, setPractice] = useState<TutorPracticeQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [practiceFeedback, setPracticeFeedback] = useState<{ correct: boolean; feedback: string } | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const scrollToEnd = useCallback(() => {
    // Defer past layout so the newest message is measured before we scroll.
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const riskReport = useMemo(
    () => course ? buildAcademicRiskReport(courseTasks, [course], gradeCategories) : null,
    [course, courseTasks, gradeCategories],
  );
  const upcomingWork = useMemo(
    () => courseTasks.filter((task) => !task.is_completed).sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 3),
    [courseTasks],
  );

  const handleGeneratePractice = async (mode: 'practice' | 'quiz') => {
    if (!courseId) {
      Alert.alert('Pick a course first', 'Open the Tutor from a course to create grounded practice.');
      return;
    }
    try {
      const next = await generatePractice.mutateAsync({ mode });
      setPractice(next);
      setSelectedAnswer(null);
      setPracticeFeedback(null);
      track('tutor_practice_generated', { screen: 'tutor', mode });
      scrollToEnd();
    } catch (e: any) {
      if (e?.code === 'PRO_REQUIRED') {
        router.push({ pathname: '/paywall', params: { context: 'tutor' } } as any);
        return;
      }
      Alert.alert('Could not create practice', e?.message || 'Please try again.');
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
    if (!conversationId || sendMessage.isPending) return;
    const text = `Explain the assignment “${task.title}” and help me make a plan to complete it.`;
    try {
      await sendMessage.mutateAsync({ message: text, mode: 'explain_assignment', assignmentId: task.id });
      track('tutor_assignment_explained', { screen: 'tutor' });
      scrollToEnd();
    } catch (e: any) {
      Alert.alert('Could not explain assignment', e?.message || 'Please try again.');
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sendMessage.isPending || !conversationId) return;
    if (Platform.OS === 'ios') Haptics.selectionAsync();
    setDraft('');
    scrollToEnd();
    try {
      await sendMessage.mutateAsync(text);
      track('tutor_message_sent', { screen: 'tutor', scoped: !!courseId, grounded: notes.length > 0 });
      scrollToEnd();
    } catch (e: any) {
      // Server marks Pro-required with code PRO_REQUIRED — route to paywall
      // instead of showing a dead-end error (client isPro can be stale).
      if (e?.code === 'PRO_REQUIRED') {
        router.push({ pathname: '/paywall', params: { context: 'tutor' } } as any);
        return;
      }
      // Restore the draft so the user doesn't lose what they typed.
      setDraft(text);
      Alert.alert('Could not send', e?.message || 'Please try again.');
    }
  };

  const handleAddNotes = async () => {
    if (!courseId) {
      Alert.alert(
        'Pick a course first',
        'Open the tutor from a course to attach lecture notes for grounding.',
      );
      return;
    }
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await DocumentPicker.getDocumentAsync({
      // PDFs + images — the edge function OCRs whatever we upload.
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    try {
      await uploadNote.mutateAsync({
        uri: asset.uri,
        filename: asset.name || 'notes',
        mimeType: asset.mimeType || 'application/pdf',
      });
      track('tutor_note_uploaded', { screen: 'tutor' });
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message || 'Please try again.');
    }
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
      <Stack.Screen options={{ title: 'AI Tutor' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
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
        </View>

        {courseId && (
          <View style={[styles.intelligencePanel, { borderBottomColor: colors.line, maxWidth: contentMaxWidth }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actionRow}>
              <TouchableOpacity style={[styles.actionChip, { backgroundColor: colors.brand50, borderColor: colors.brand100 }]} onPress={() => handleGeneratePractice('practice')} disabled={generatePractice.isPending}>
                <FontAwesome name="pencil" size={12} color={colors.brand} />
                <Text style={[styles.actionText, { color: colors.brand }]}>{generatePractice.isPending ? 'Creating…' : 'Practice me'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionChip, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={() => handleGeneratePractice('quiz')} disabled={generatePractice.isPending}>
                <FontAwesome name="list-ol" size={12} color={colors.ink2} />
                <Text style={[styles.actionText, { color: colors.ink2 }]}>Quick quiz</Text>
              </TouchableOpacity>
              {upcomingWork.filter((task) => task.type === 'assignment' || task.type === 'project').slice(0, 2).map((task) => (
                <TouchableOpacity key={task.id} style={[styles.actionChip, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={() => handleExplainAssignment(task)} disabled={sendMessage.isPending}>
                  <FontAwesome name="lightbulb-o" size={13} color={colors.ink2} />
                  <Text style={[styles.actionText, { color: colors.ink2 }]} numberOfLines={1}>Explain {task.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {(topicMastery.length > 0 || riskReport?.recoveryPlan.length || upcomingWork.length) && (
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
                  ? 'Answers are grounded in this course’s syllabus, deadlines, and any notes you attach above.'
                  : 'Open the tutor from a course to ground answers in your syllabus and notes.'}
              </Text>
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
                  <Text style={[styles.bubbleText, { color: m.role === 'user' ? '#fff' : colors.ink }]}>{m.content}</Text>
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
              </View>
            ))
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
          {sendMessage.isPending && (
            <View style={[styles.bubble, styles.bubbleAssistant, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <ActivityIndicator size="small" color={colors.ink3} />
            </View>
          )}
        </ScrollView>

        {/* Composer */}
        <View style={[styles.composer, { borderTopColor: colors.line, backgroundColor: colors.paper, maxWidth: contentMaxWidth }]}>
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
              { backgroundColor: draft.trim() && !sendMessage.isPending ? colors.brand : colors.line },
            ]}
            onPress={handleSend}
            disabled={!draft.trim() || sendMessage.isPending}
            activeOpacity={0.85}
          >
            {sendMessage.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <FontAwesome name="arrow-up" size={16} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  notesBar: { borderBottomWidth: 0.5, width: '100%', alignSelf: 'center' },
  notesRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 8, alignItems: 'center' },
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

  // Composer
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 0.5, width: '100%', alignSelf: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 22, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 15 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
