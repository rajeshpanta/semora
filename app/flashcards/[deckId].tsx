import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform, Keyboard,
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
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { track } from '@/lib/analytics';
import { NotFound } from '@/components/NotFound';
import {
  useDeck, useCards, useCreateCard, useUpdateCard, useDeleteCard,
  useDeleteDeck, useReviewCard, dueCards, type Card, type Grade,
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
  const { contentMaxWidth } = useResponsive();
  const isPro = useAppStore((s) => s.isPro);

  const { data: deck, isLoading, isError } = useDeck(deckId);
  const { data: cards = [] } = useCards(deckId);
  const createCard = useCreateCard();
  const updateCard = useUpdateCard();
  const deleteCard = useDeleteCard();
  const deleteDeck = useDeleteDeck();
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
        <Stack.Screen options={{ title: 'Flashcards' }} />
        <View style={styles.centered}>
          <FontAwesome name="lock" size={30} color={colors.ink3} />
          <Text style={[styles.lockedText, { color: colors.ink2 }]}>Flashcards are a Pro feature.</Text>
          <TouchableOpacity
            style={[styles.upgradeBtn, { backgroundColor: colors.brand }]}
            onPress={() => router.push({ pathname: '/paywall', params: { context: 'flashcards' } } as any)}
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
    setReviewedCount(0);
    setMode('study');
    track('flashcard_study_started', { screen: 'flashcards', due: dueNow.length });
  };

  const exitStudy = () => {
    setMode('manage');
    setQueue([]);
    setStudyIndex(0);
    setRevealed(false);
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
    }
  };

  if (mode === 'study') {
    const done = studyIndex >= queue.length;
    const card = queue[studyIndex];
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <Stack.Screen options={{ title: deck.title, headerBackTitle: 'Decks' }} />
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

              <TouchableOpacity
                style={[styles.studyCard, { backgroundColor: colors.card, borderColor: colors.line }]}
                activeOpacity={revealed ? 1 : 0.85}
                onPress={() => { if (!revealed) { if (Platform.OS === 'ios') Haptics.selectionAsync(); setRevealed(true); } }}
              >
                <Text style={[styles.cardFace, { color: colors.ink }]}>{card.front}</Text>
                {revealed && (
                  <>
                    <View style={[styles.faceDivider, { backgroundColor: colors.line }]} />
                    <Text style={[styles.cardFace, styles.cardBack, { color: colors.ink2 }]}>{card.back}</Text>
                  </>
                )}
                {!revealed && (
                  <Text style={[styles.tapHint, { color: colors.ink3 }]}>Tap to reveal</Text>
                )}
              </TouchableOpacity>

              {revealed ? (
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
      <Stack.Screen options={{ title: deck.title, headerBackTitle: 'Decks' }} />
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
  shareDeckText: { fontSize: 14, fontWeight: '700' },
  deleteDeckText: { fontSize: 13.5, fontWeight: '600', color: '#ef4444' },

  // Study session
  studyWrap: { flex: 1, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', padding: 20 },
  studyProgress: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  progressText: { fontSize: 13, fontWeight: '600' },
  exitLink: { fontSize: 14, fontWeight: '600' },
  studyCard: { flex: 1, borderRadius: 18, borderWidth: 0.5, padding: 24, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  cardFace: { fontFamily: FONTS.displaySemibold, fontSize: 22, textAlign: 'center', lineHeight: 30 },
  cardBack: { fontFamily: undefined, fontSize: 17, fontWeight: '500', lineHeight: 24 },
  faceDivider: { height: 1, alignSelf: 'stretch', marginVertical: 20 },
  tapHint: { fontSize: 12.5, marginTop: 18, fontWeight: '500' },
  revealBtn: { height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  gradeRow: { flexDirection: 'row', gap: 8 },
  gradeBtn: { flex: 1, height: 52, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  gradeText: { fontSize: 14.5, fontWeight: '700', color: '#fff' },

  // Completion
  doneTitle: { fontFamily: FONTS.displaySemibold, fontSize: 22, marginTop: 6 },
  doneText: { fontSize: 14, textAlign: 'center' },
});
