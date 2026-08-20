import { translate } from '@/lib/i18n';
import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text, TextInput } from '@/components/LocalizedReactNative';
import {
  useMemo,
  useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSession } from '@/app/_layout';
import {
  listCollaborations, publishDeckToCollaboration, type CollaborationSummary,
} from '@/lib/collaboration';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useProUpsell } from '@/components/ProUpsellHost';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { useCourses } from '@/lib/queries';
import { track } from '@/lib/analytics';
import { NotFound } from '@/components/NotFound';
import {
  useDeck, useCards, useCreateCard, useUpdateCard, useDeleteCard,
  useDeleteDeck, useSetDeckCourse, useReviewCard, dueCards, type Card, type Grade,
} from '@/lib/flashcards';

// Grade buttons shown under a revealed card, in ascending recall quality.
const GRADES: { grade: Grade; label: string; color: string }[] = [
  { grade: 'again', label: 'Again', color: '#ef4444' },
  { grade: 'hard', label: 'Hard', color: '#f59e0b' },
  { grade: 'good', label: 'Good', color: '#3b82f6' },
  { grade: 'easy', label: 'Easy', color: '#22c55e' },
];

export default function DeckDetailScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const router = useRouter();
  const colors = useColors();
  const { t } = useI18n();
  const showProUpsell = useProUpsell();
  const { contentMaxWidth } = useResponsive();
  const isPro = useAppStore((s) => s.isPro);

  const { data: deck, isLoading, isError } = useDeck(deckId);
  const { data: cards = [] } = useCards(deckId);
  const createCard = useCreateCard();
  const updateCard = useUpdateCard();
  const deleteCard = useDeleteCard();
  const deleteDeck = useDeleteDeck();
  const setDeckCourse = useSetDeckCourse(deckId);
  const [showCoursePicker, setShowCoursePicker] = useState(false);
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const { data: courses = [] } = useCourses(selectedSemesterId);
  // Resolved from the deck's OWN joined course, not by searching the current
  // semester's list. The deck list spans every semester (useDecks has no
  // semester filter), so a deck belonging to last term's course found no match
  // here and read "Assign to a class" as though it had none — and tapping a
  // class would then have moved it quietly into the current semester. The
  // lecture screen has always used its joined row for exactly this reason.
  const deckCourse = deck?.courses ?? null;
  const reviewCard = useReviewCard();

  // 'manage' lists/edits cards; 'study' walks the due queue one card at a time.
  const [mode, setMode] = useState<'manage' | 'study'>('manage');

  // Add/edit card form state. editingId null => adding a new card.
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');

  // Study session: snapshot the due queue at session start so answering a
  // card (which pushes its due_at into the future) doesn't reshuffle the
  // list mid-session. Advance through it by index; reveal toggles the back.
  const [queue, setQueue] = useState<Card[]>([]);
  const [studyIndex, setStudyIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // Sticky for the current card: 'revealed' is which face is showing, this is
  // whether the answer has been seen at all. They diverge the moment flipping
  // back became possible.
  const [seenAnswer, setSeenAnswer] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const dueNow = useMemo(() => dueCards(cards), [cards]);

  // These hooks MUST stay above every early return below. React requires the
  // same hook call order on every render, and this screen returns early while
  // loading, on error, and for free users — so a hook placed after those
  // guards is skipped on render 1 and called on render 2. Because
  // app/_layout.tsx re-exports expo-router's ErrorBoundary at the ROOT and this
  // screen exports none, that mismatch replaces the ENTIRE app with the error
  // screen, not just this route.
  // ── Publish to a course space (migration 051) ──────────────
  // Only spaces where this user is owner/editor can accept a deck; the RPC
  // enforces that too, this just avoids offering a choice that will fail.
  const { session } = useSession();
  const { data: spaces = [] } = useQuery({
    queryKey: ['collaborations', session?.user.id],
    queryFn: () => listCollaborations(session!.user.id),
    enabled: !!session?.user.id,
  });
  const publishable = (spaces as CollaborationSummary[]).filter(
    (space) => space.membership.role === 'owner' || space.membership.role === 'editor',
  );

  const publishDeck = useMutation({
    mutationFn: (collaborationId: string) => {
      if (!deck) throw new Error('Deck is still loading.');
      return publishDeckToCollaboration(deck.id, collaborationId);
    },
  });

  const handleShareWithClass = () => {
    if (publishable.length === 0) {
      Alert.alert(
        'No course space yet',
        'Create a course space from a course first, then you can publish a deck to everyone in it.',
      );
      return;
    }
    Alert.alert(
      'Share with class',
      `Everyone in the space gets their own copy of "${deck?.title ?? 'this deck'}" to study. Their review progress stays theirs.`,
      [
        { text: 'Cancel', style: 'cancel' },
        ...publishable.slice(0, 3).map((space) => ({
          text: space.course_name,
          onPress: async () => {
            try {
              const r = await publishDeck.mutateAsync(space.id);
              Alert.alert('Shared', `${r.cards_published} cards published to ${space.course_name}.`);
            } catch (err: any) {
              Alert.alert('Could not share', err.message ?? 'Something went wrong.');
            }
          },
        })),
      ],
    );
  };


  if (!isPro) {
    // Non-Pro users shouldn't reach here (the index screen gates), but guard
    // deep links: bounce to the paywall teaser context.
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <Stack.Screen options={{ title: translate('Flashcards') }} />
        <View style={styles.centered}>
          <FontAwesome name="lock" size={30} color={colors.ink3} />
          <Text style={[styles.lockedText, { color: colors.ink2 }]}>Flashcards are a Pro feature.</Text>
          <TouchableOpacity
            style={[styles.upgradeBtn, { backgroundColor: colors.brand }]}
            onPress={() => showProUpsell('flashcards')}
          >
            <Text style={styles.upgradeText}>Unlock with Pro</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return <View style={[styles.centered, { backgroundColor: colors.paper }]}><ActivityIndicator size="large" color={colors.brand} /></View>;
  }
  if (isError || !deck) {
    return <NotFound title="Deck unavailable" message="This deck couldn't be loaded. It may have been deleted." onBack={() => router.back()} />;
  }

  // ── Card form ───────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setFront('');
    setBack('');
    setFormOpen(true);
  };

  const openEdit = (card: Card) => {
    setEditingId(card.id);
    setFront(card.front);
    setBack(card.back);
    setFormOpen(true);
  };

  const saveCard = async () => {
    const f = front.trim();
    const b = back.trim();
    if (!f || !b) {
      Alert.alert('Required', 'Both the front and back of the card are needed.');
      return;
    }
    try {
      if (editingId) {
        await updateCard.mutateAsync({ id: editingId, front: f, back: b });
      } else {
        await createCard.mutateAsync({ deck_id: deck.id, front: f, back: b });
      }
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Keyboard.dismiss();
      setFormOpen(false);
      setFront('');
      setBack('');
      setEditingId(null);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save the card.');
    }
  };

  const handleDeleteCard = (card: Card) => {
    Alert.alert('Delete Card', 'This flashcard will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteCard.mutateAsync({ id: card.id, deckId: deck.id });
            if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (err: any) {
            Alert.alert('Delete Failed', err.message ?? 'Something went wrong.');
          }
        },
      },
    ]);
  };

  const handleDeleteDeck = () => {
    Alert.alert('Delete Deck', 'This will permanently delete the deck and all its cards.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteDeck.mutateAsync(deck.id);
            router.back();
          } catch (err: any) {
            Alert.alert('Delete Failed', err.message ?? 'Something went wrong.');
          }
        },
      },
    ]);
  };

  // ── Study mode ──────────────────────────────────────────────
  const startStudy = () => {
    if (dueNow.length === 0) return;
    setQueue(dueNow);
    setStudyIndex(0);
    setRevealed(false);
    setSeenAnswer(false);
    setReviewedCount(0);
    setMode('study');
    track('flashcard_study_started', { screen: 'flashcards', due: dueNow.length });
  };

  const exitStudy = () => {
    setMode('manage');
    setQueue([]);
    setStudyIndex(0);
    setRevealed(false);
    setSeenAnswer(false);
  };

  const gradeCurrent = async (grade: Grade) => {
    const card = queue[studyIndex];
    if (!card) return;
    if (Platform.OS === 'ios') Haptics.selectionAsync();
    // Fire-and-forget the persist so the UI advances instantly; a failed
    // write just leaves the card due next session (the scheduler is pure,
    // no local state depends on the round-trip).
    reviewCard.mutate({ card, grade });
    track('flashcard_reviewed', { grade });
    setReviewedCount((n) => n + 1);
    if (studyIndex + 1 >= queue.length) {
      // Session complete.
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStudyIndex(queue.length); // sentinel → completion screen
    } else {
      setStudyIndex((i) => i + 1);
      setRevealed(false);
      setSeenAnswer(false);
    }
  };

  if (mode === 'study') {
    const done = studyIndex >= queue.length;
    const card = queue[studyIndex];
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <Stack.Screen options={{ title: deck.title, headerBackTitle: t('Decks') }} />
        <View style={[styles.studyWrap, { maxWidth: contentMaxWidth }]}>
          {done ? (
            <View style={styles.centered}>
              <FontAwesome name="check-circle" size={44} color={colors.teal} />
              <Text style={[styles.doneTitle, { color: colors.ink }]}>Session complete</Text>
              <Text style={[styles.doneText, { color: colors.ink3 }]}>
                You reviewed {reviewedCount} {reviewedCount === 1 ? 'card' : 'cards'}.
              </Text>
              <TouchableOpacity style={[styles.upgradeBtn, { backgroundColor: colors.brand }]} onPress={exitStudy}>
                <Text style={styles.upgradeText}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.studyProgress}>
                <Text style={[styles.progressText, { color: colors.ink3 }]}>
                  {studyIndex + 1} / {queue.length}
                </Text>
                <TouchableOpacity onPress={exitStudy} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={[styles.exitLink, { color: colors.ink2 }]}>Exit</Text>
                </TouchableOpacity>
              </View>

              {/* One side at a time, like a real card.
                  It used to reveal the answer BENEATH the question, leaving
                  both on screen — which is not a flashcard, it is a question
                  with the answer printed under it. Recall is the entire point:
                  if the prompt is still visible you are reading, not
                  remembering. Tapping now turns the card over, and tapping
                  again turns it back. */}
              <TouchableOpacity
                style={[styles.studyCard, { backgroundColor: colors.card, borderColor: colors.line }]}
                activeOpacity={0.85}
                onPress={() => {
                  if (Platform.OS === 'ios') Haptics.selectionAsync();
                  setRevealed((v) => {
                    if (!v) setSeenAnswer(true);
                    return !v;
                  });
                }}
                accessibilityRole="button"
                accessibilityLabel={revealed ? `Answer: ${card.back}. Tap to see the question.` : `Question: ${card.front}. Tap to see the answer.`}
              >
                {/* The only thing distinguishing the two faces once the text is
                    alone on the card. Without it a short answer and a short
                    question look identical and it is easy to lose track of
                    which side is showing. */}
                <Text style={[styles.faceLabel, { color: colors.ink3 }]}>
                  {revealed ? 'ANSWER' : 'QUESTION'}
                </Text>
                <Text style={[styles.cardFace, { color: colors.ink }]}>
                  {revealed ? card.back : card.front}
                </Text>
                <Text style={[styles.tapHint, { color: colors.ink3 }]}>
                  {revealed ? 'Tap to flip back' : 'Tap to reveal'}
                </Text>
              </TouchableOpacity>

              {/* Grading stays available once the answer has been seen, even
                  if the card is flipped back to re-read the question. Hiding it
                  on flip-back meant the only way to grade was to have the
                  answer on screen, which quietly punished checking the prompt
                  again — the one thing re-reading is for. */}
              {seenAnswer ? (
                <View style={styles.gradeRow}>
                  {GRADES.map((g) => (
                    <TouchableOpacity
                      key={g.grade}
                      style={[styles.gradeBtn, { backgroundColor: g.color }]}
                      onPress={() => gradeCurrent(g.grade)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.gradeText}>{g.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.revealBtn, { backgroundColor: colors.brand }]}
                  onPress={() => { if (Platform.OS === 'ios') Haptics.selectionAsync(); setRevealed(true); }}
                >
                  <Text style={styles.upgradeText}>Show Answer</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Manage mode ─────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: deck.title, headerBackTitle: t('Decks') }} />
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Study CTA */}
        <TouchableOpacity
          style={[styles.studyCta, { backgroundColor: dueNow.length > 0 ? colors.brand : colors.card, borderColor: colors.line }]}
          onPress={startStudy}
          disabled={dueNow.length === 0}
          activeOpacity={0.85}
        >
          <FontAwesome name="graduation-cap" size={16} color={dueNow.length > 0 ? '#fff' : colors.ink3} />
          <Text style={[styles.studyCtaText, { color: dueNow.length > 0 ? '#fff' : colors.ink3 }]}>
            {dueNow.length > 0 ? `Study ${dueNow.length} due` : 'Nothing due right now'}
          </Text>
        </TouchableOpacity>

        {/* Add / edit card form */}
        {formOpen ? (
          <View style={[styles.createCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.createLabel, { color: colors.ink2 }]}>{editingId ? 'Edit card' : 'New card'}</Text>
            <TextInput
              style={[styles.input, styles.multiline, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paper }]}
              value={front}
              onChangeText={setFront}
              placeholder="Front (question / prompt)"
              placeholderTextColor={colors.ink3}
              multiline
            />
            <TextInput
              style={[styles.input, styles.multiline, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paper, marginTop: 10 }]}
              value={back}
              onChangeText={setBack}
              placeholder="Back (answer)"
              placeholderTextColor={colors.ink3}
              multiline
            />
            <View style={styles.createActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.line }]}
                onPress={() => { setFormOpen(false); setEditingId(null); setFront(''); setBack(''); }}
              >
                <Text style={[styles.cancelText, { color: colors.ink2 }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.brand }]} onPress={saveCard}>
                {(createCard.isPending || updateCard.isPending)
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveText}>{editingId ? 'Save' : 'Add Card'}</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.addCardBtn, { borderColor: colors.line, backgroundColor: colors.card }]}
            onPress={() => { if (Platform.OS === 'ios') Haptics.selectionAsync(); openAdd(); }}
            activeOpacity={0.8}
          >
            <FontAwesome name="plus" size={13} color={colors.brand} />
            <Text style={[styles.addCardText, { color: colors.brand }]}>Add Card</Text>
          </TouchableOpacity>
        )}

        {/* Card list */}
        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Cards ({cards.length})</Text>
        {cards.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.ink3 }]}>No cards yet. Add your first one above.</Text>
          </View>
        ) : (
          cards.map((card) => (
            <View key={card.id} style={[styles.cardItem, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <TouchableOpacity style={{ flex: 1 }} onPress={() => openEdit(card)} activeOpacity={0.7}>
                <Text style={[styles.cardItemFront, { color: colors.ink }]} numberOfLines={2}>{card.front}</Text>
                <Text style={[styles.cardItemBack, { color: colors.ink3 }]} numberOfLines={2}>{card.back}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleDeleteCard(card)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Delete card"
              >
                <FontAwesome name="trash-o" size={16} color="#ef4444" />
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Which class this deck belongs to.
            A deck with no course sits in Uncategorized at the bottom of the
            list, and the deck screen was the one place that could not fix it.
            Shown whether or not a course is set, because a deck filed against
            the wrong class is as stuck as one filed against none. */}
        <TouchableOpacity
          style={styles.shareDeckBtn}
          onPress={() => setShowCoursePicker((v) => !v)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={deckCourse ? `Class: ${deckCourse.name}. Change it.` : 'Assign this deck to a class'}
        >
          <FontAwesome name="book" size={13} color={colors.brand} />
          <Text style={[styles.shareDeckText, { color: colors.brand }]}>
            {deckCourse ? `Class: ${deckCourse.name}` : 'Assign to a class'}
          </Text>
          <FontAwesome
            name={showCoursePicker ? 'chevron-up' : 'chevron-down'}
            size={10}
            color={colors.ink3}
          />
        </TouchableOpacity>

        {showCoursePicker && (
          <View style={styles.coursePickWrap}>
            {courses.map((c: { id: string; name: string; color: string | null }) => {
              const active = deck?.course_id === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.coursePick,
                    { borderColor: active ? colors.brand : colors.line, backgroundColor: active ? colors.brand50 : colors.card },
                  ]}
                  onPress={() =>
                    setDeckCourse.mutate(c.id, {
                      onSuccess: () => setShowCoursePicker(false),
                      onError: (e) =>
                        Alert.alert("Couldn't move the deck", (e as Error)?.message || 'Please try again.'),
                    })
                  }
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={c.name}
                >
                  <View style={[styles.coursePickDot, { backgroundColor: c.color || colors.brand }]} />
                  <Text style={[styles.coursePickText, { color: colors.ink2 }]} numberOfLines={1}>{c.name}</Text>
                </TouchableOpacity>
              );
            })}
            {/* course_id is nullable by design — a deck can legitimately span
                subjects, so the way back out has to exist too. */}
            {deck?.course_id ? (
              <TouchableOpacity
                style={[styles.coursePick, { borderColor: colors.line, backgroundColor: colors.card }]}
                onPress={() =>
                  setDeckCourse.mutate(null, {
                    onSuccess: () => setShowCoursePicker(false),
                    onError: (e) =>
                      Alert.alert("Couldn't move the deck", (e as Error)?.message || 'Please try again.'),
                  })
                }
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Remove from class"
              >
                <Text style={[styles.coursePickText, { color: colors.ink3 }]}>No class</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Publish to a course space */}
        <TouchableOpacity
          style={styles.shareDeckBtn}
          onPress={handleShareWithClass}
          disabled={publishDeck.isPending}
        >
          <FontAwesome name="users" size={13} color={colors.brand} />
          <Text style={[styles.shareDeckText, { color: colors.brand }]}>
            {publishDeck.isPending ? 'Sharing…' : 'Share with class'}
          </Text>
        </TouchableOpacity>

        {/* Delete deck */}
        <TouchableOpacity style={styles.deleteDeckBtn} onPress={handleDeleteDeck}>
          <FontAwesome name="trash-o" size={13} color="#ef4444" />
          <Text style={styles.deleteDeckText}>Delete Deck</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  content: { padding: 20, paddingBottom: 100, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },

  lockedText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12, marginTop: 8 },
  upgradeText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Study CTA + form
  studyCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: 14, borderWidth: 0.5, marginBottom: 14 },
  studyCtaText: { fontSize: 15.5, fontWeight: '700' },
  addCardBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 0.5, marginBottom: 16 },
  addCardText: { fontSize: 14.5, fontWeight: '700' },
  createCard: { borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: COLORS.line, marginBottom: 16 },
  createLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  multiline: { minHeight: 60, textAlignVertical: 'top' },
  createActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cancelBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 1, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  saveText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Card list
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  cardItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 0.5, marginBottom: 10 },
  cardItemFront: { fontSize: 14.5, fontWeight: '600' },
  cardItemBack: { fontSize: 13, marginTop: 3 },
  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 13.5, textAlign: 'center' },
  deleteDeckBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, marginTop: 20 },
  shareDeckBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, marginTop: 18 },
  coursePickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 4 },
  coursePick: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12, maxWidth: 220,
  },
  coursePickDot: { width: 8, height: 8, borderRadius: 4 },
  coursePickText: { fontSize: 13.5, flexShrink: 1 },
  shareDeckText: { fontSize: 14, fontWeight: '700' },
  deleteDeckText: { fontSize: 13.5, fontWeight: '600', color: '#ef4444' },

  // Study session
  studyWrap: { flex: 1, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', padding: 20 },
  studyProgress: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  progressText: { fontSize: 13, fontWeight: '600' },
  exitLink: { fontSize: 14, fontWeight: '600' },
  studyCard: { flex: 1, borderRadius: 18, borderWidth: 0.5, padding: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  // Both faces now use the same serif at the same size — the answer used to be
  // set smaller and in the system font, which read as a footnote to the
  // question rather than the other half of the same card. 23/32 keeps a long
  // answer comfortable without shrinking it.
  cardFace: { fontFamily: FONTS.displaySemibold, fontSize: 23, textAlign: 'center', lineHeight: 32 },
  faceLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.4, marginBottom: 14 },
  tapHint: { fontSize: 12.5, marginTop: 18, fontWeight: '500' },
  revealBtn: { height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  gradeRow: { flexDirection: 'row', gap: 8 },
  gradeBtn: { flex: 1, height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  gradeText: { fontSize: 14.5, fontWeight: '700', color: '#fff' },

  // Completion
  doneTitle: { fontFamily: FONTS.displaySemibold, fontSize: 22, marginTop: 6 },
  doneText: { fontSize: 14, textAlign: 'center' },
});
