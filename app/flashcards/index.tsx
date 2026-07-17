import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { track } from '@/lib/analytics';
import {
  useDecks, useCreateDeck, useCourseLookup, type DeckWithCounts, type CourseLite,
} from '@/lib/flashcards';

export default function FlashcardsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const isPro = useAppStore((s) => s.isPro);
  // Optional course scope: /flashcards?courseId=<id> preselects the course
  // for a newly created deck (from the course detail entry row).
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();

  const { data: decks = [], isLoading } = useDecks();
  const { data: courseMap = {} } = useCourseLookup();
  const createDeck = useCreateDeck();

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  // Group decks by course for section rendering: each course that has decks,
  // then an "Uncategorized" bucket. Course order follows the lookup's name.
  const sections = useMemo(() => {
    const byCourse = new Map<string | null, DeckWithCounts[]>();
    for (const d of decks) {
      const key = d.course_id && courseMap[d.course_id] ? d.course_id : null;
      const arr = byCourse.get(key) ?? [];
      arr.push(d);
      byCourse.set(key, arr);
    }
    const courseKeys = [...byCourse.keys()].filter((k): k is string => k !== null);
    courseKeys.sort((a, b) => (courseMap[a]?.name ?? '').localeCompare(courseMap[b]?.name ?? ''));
    const result: { key: string; course: CourseLite | null; decks: DeckWithCounts[] }[] = [];
    for (const k of courseKeys) {
      result.push({ key: k, course: courseMap[k], decks: byCourse.get(k)! });
    }
    if (byCourse.has(null)) {
      result.push({ key: '__uncat__', course: null, decks: byCourse.get(null)! });
    }
    return result;
  }, [decks, courseMap]);

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) {
      Alert.alert('Required', 'Please enter a deck title.');
      return;
    }
    try {
      const deck = await createDeck.mutateAsync({
        title,
        course_id: courseId ?? null,
      });
      track('deck_created', { screen: 'flashcards', scoped: !!courseId });
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Keyboard.dismiss();
      setNewTitle('');
      setCreating(false);
      router.push(`/flashcards/${deck.id}` as any);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not create the deck.');
    }
  };

  // ── Pro gate: locked teaser routes to the paywall ─────────────
  if (!isPro) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <Stack.Screen options={{ title: 'Flashcards' }} />
        <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}>
          <View style={[styles.teaserCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={[styles.teaserIcon, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name="clone" size={26} color={colors.brand} />
            </View>
            <Text style={[styles.teaserTitle, { color: colors.ink }]}>Flashcards with spaced repetition</Text>
            <Text style={[styles.teaserDesc, { color: colors.ink3 }]}>
              Build decks per course and study with a proven spaced-repetition
              scheduler that surfaces each card right before you'd forget it.
            </Text>
            <TouchableOpacity
              style={[styles.upgradeBtn, { backgroundColor: colors.brand }]}
              onPress={() => {
                if (Platform.OS === 'ios') Haptics.selectionAsync();
                router.push({ pathname: '/paywall', params: { context: 'flashcards' } } as any);
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

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Flashcards' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Create-deck affordance */}
        {creating ? (
          <View style={[styles.createCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.createLabel, { color: colors.ink2 }]}>New deck</Text>
            <TextInput
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.paper }]}
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="e.g. Bio 101 — Chapter 3 terms"
              placeholderTextColor={colors.ink3}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
              maxLength={80}
            />
            <View style={styles.createActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.line }]}
                onPress={() => { setCreating(false); setNewTitle(''); }}
              >
                <Text style={[styles.cancelText, { color: colors.ink2 }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.brand }]} onPress={handleCreate}>
                {createDeck.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveText}>Create</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.newDeckBtn, { backgroundColor: colors.brand }]}
            onPress={() => { if (Platform.OS === 'ios') Haptics.selectionAsync(); setCreating(true); }}
            activeOpacity={0.85}
          >
            <FontAwesome name="plus" size={13} color="#fff" />
            <Text style={styles.newDeckText}>New Deck</Text>
          </TouchableOpacity>
        )}

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
        ) : decks.length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome name="clone" size={34} color={colors.ink3} />
            <Text style={[styles.emptyTitle, { color: colors.ink2 }]}>No decks yet</Text>
            <Text style={[styles.emptyText, { color: colors.ink3 }]}>
              Create a deck to start building flashcards for a course.
            </Text>
          </View>
        ) : (
          sections.map((section) => (
            <View key={section.key} style={{ marginTop: 18 }}>
              <View style={styles.sectionHeader}>
                <FontAwesome
                  name={(section.course?.icon as any) ?? 'inbox'}
                  size={13}
                  color={section.course?.color ?? colors.ink3}
                />
                <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>
                  {section.course?.name ?? 'Uncategorized'}
                </Text>
              </View>
              {section.decks.map((deck) => (
                <TouchableOpacity
                  key={deck.id}
                  style={[styles.deckRow, { backgroundColor: colors.card, borderColor: colors.line }]}
                  onPress={() => router.push(`/flashcards/${deck.id}` as any)}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.deckTitle, { color: colors.ink }]} numberOfLines={2}>{deck.title}</Text>
                    <Text style={[styles.deckMeta, { color: colors.ink3 }]}>
                      {deck.card_count} {deck.card_count === 1 ? 'card' : 'cards'}
                    </Text>
                  </View>
                  {deck.due_count > 0 && (
                    <View style={[styles.dueBadge, { backgroundColor: colors.brand }]}>
                      <Text style={styles.dueBadgeText}>{deck.due_count} due</Text>
                    </View>
                  )}
                  <FontAwesome name="chevron-right" size={13} color={colors.ink3} style={{ marginLeft: 10 }} />
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 100, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },

  // Pro teaser
  teaserCard: { borderRadius: 18, padding: 24, borderWidth: 0.5, borderColor: COLORS.line, alignItems: 'center', marginTop: 20 },
  teaserIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  teaserTitle: { fontFamily: FONTS.displaySemibold, fontSize: 19, color: COLORS.ink, textAlign: 'center', marginBottom: 8 },
  teaserDesc: { fontSize: 14, color: COLORS.ink3, textAlign: 'center', lineHeight: 20, maxWidth: 300, marginBottom: 18 },
  upgradeBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  upgradeText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // Create deck
  newDeckBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 12 },
  newDeckText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  createCard: { borderRadius: 16, padding: 16, borderWidth: 0.5, borderColor: COLORS.line },
  createLabel: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  input: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  createActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  cancelBtn: { flex: 1, height: 44, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 1, height: 44, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  saveText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Sections + deck rows
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  deckRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14, borderWidth: 0.5, marginBottom: 10 },
  deckTitle: { fontSize: 15.5, fontWeight: '600' },
  deckMeta: { fontSize: 12.5, marginTop: 3 },
  dueBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  dueBadgeText: { fontSize: 11.5, fontWeight: '800', color: '#fff' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
  emptyText: { fontSize: 13.5, textAlign: 'center', lineHeight: 19, maxWidth: 260 },
});
