import { translate } from '@/lib/i18n';
import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text, TextInput } from '@/components/LocalizedReactNative';
import {
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
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import { COLORS, PROMO_SURFACE, FONTS, SCREEN_MAX_WIDTH, TASK_TYPE_LABELS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useProUpsell } from '@/components/ProUpsellHost';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { track } from '@/lib/analytics';
import {
  useDecks, useCreateDeck, useCourseLookup, useGenerateFlashcards, useScopeTasks,
  type DeckWithCounts, type CourseLite,
} from '@/lib/flashcards';
import {
  prepareCourseNotes,
  useCourseNotes,
  useUploadCourseNote,
  type CourseNote,
  type CourseNoteReadProgress,
  type CourseNoteUploadProgress,
} from '@/lib/tutor';
import { FileWorkProgress } from '@/components/FileWorkProgress';
import {
  normalizeSupportedDocument,
  SUPPORTED_DOCUMENT_PICKER_TYPE,
  unsupportedDocumentMessage,
} from '@/lib/documentFiles';

/**
 * Shared empty default for the notes query.
 *
 * `useCourseNotes` is `enabled: !!courseId`, so on /flashcards without a course
 * scope `data` stays undefined forever. A `= []` default would then mint a NEW
 * array on every render, which is an effect dependency below — and that effect
 * sets state, so the screen re-rendered itself without end and React threw
 * "Maximum update depth exceeded" (#185). One stable reference stops it.
 */
const NO_NOTES: CourseNote[] = [];

export default function FlashcardsScreen() {
  const router = useRouter();
  const colors = useColors();
  const showProUpsell = useProUpsell();
  const { contentMaxWidth } = useResponsive();
  const isPro = useAppStore((s) => s.isPro);
  // Optional course scope: /flashcards?courseId=<id> preselects the course
  // for a newly created deck (from the course detail entry row).
  const { courseId } = useLocalSearchParams<{ courseId?: string }>();

  const { data: decks = [], isLoading } = useDecks();
  const { data: courseMap = {} } = useCourseLookup();
  const createDeck = useCreateDeck();
  const generateFlashcards = useGenerateFlashcards();
  const { data: scopeTasks = [] } = useScopeTasks(courseId);
  const { data: courseNotes = NO_NOTES } = useCourseNotes(courseId);
  const uploadNote = useUploadCourseNote(courseId);

  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  // Scope picker for the generate flow: 'course' (default) or one specific
  // task's id (exam/quiz/assignment/reading) — see useScopeTasks. Collapsed
  // until the student taps "Generate with AI", matching the existing
  // New-Deck expand pattern below.
  const [generateOpen, setGenerateOpen] = useState(false);
  const [scopeTaskId, setScopeTaskId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);
  const [fileProgress, setFileProgress] = useState<CourseNoteUploadProgress | null>(null);
  const [readProgress, setReadProgress] = useState<CourseNoteReadProgress | null>(null);
  const [generationStage, setGenerationStage] = useState<'reading' | 'creating' | null>(null);
  const generationInFlightRef = useRef(false);
  const fileProgressClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isGenerating = generationStage !== null || generateFlashcards.isPending;

  useEffect(() => () => {
    if (fileProgressClearRef.current) clearTimeout(fileProgressClearRef.current);
  }, []);

  useEffect(() => {
    // Newly uploaded notes join the selection automatically; students can
    // still tap any chip below to focus a deck on only the notes they choose.
    setSelectedNoteIds((current) => {
      const known = new Set(courseNotes.map((note) => note.id));
      const retained = current.filter((id) => known.has(id));
      const next = retained.length ? retained : courseNotes.map((note) => note.id);
      // React only skips the re-render when the updater returns the SAME
      // reference, and both branches above always build a fresh array. Return
      // `current` when nothing actually changed, so an unchanged note list
      // can't keep the component re-rendering itself.
      const unchanged = next.length === current.length
        && next.every((id, i) => id === current[i]);
      return unchanged ? current : next;
    });
  }, [courseNotes]);

  const handleAddMaterial = async () => {
    if (!courseId) return;
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
      track('flashcards_material_uploaded', { screen: 'flashcards', courseId });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      fileProgressClearRef.current = setTimeout(() => setFileProgress(null), 900);
    } catch (e: any) {
      setFileProgress(null);
      Alert.alert('Upload failed', e?.message || 'Please try again.');
    }
  };

  const handleGenerate = async () => {
    if (!courseId || generationInFlightRef.current || isGenerating) return;
    generationInFlightRef.current = true;
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    try {
      const selectedNotes = courseNotes.filter((note) => selectedNoteIds.includes(note.id));
      if (selectedNotes.length > 0) {
        await prepareCourseNotes(courseId, selectedNotes, (progress) => {
          setGenerationStage('reading');
          setReadProgress(progress);
        });
      }
      setGenerationStage('creating');
      // Send noteIds ONLY when the user actually narrowed the selection.
      // `noteIds: []` means "use no attachments" server-side, and this list is
      // built from uploaded notes only (useCourseNotes filters source='upload')
      // — so a student who recorded a lecture and tapped "Make flashcards from
      // this lecture" sent an empty array, which excluded the very lecture they
      // asked about. Omitting the field lets the server use everything it has,
      // lecture-sourced notes included.
      const narrowed = courseNotes.length > 0 && selectedNoteIds.length !== courseNotes.length;
      const result = await generateFlashcards.mutateAsync({
        courseId,
        taskId: scopeTaskId ?? undefined,
        ...(narrowed ? { noteIds: selectedNoteIds } : {}),
      });
      track('deck_generated', {
        screen: 'flashcards', courseId, cardsAdded: result.cardsAdded,
        scoped: !!scopeTaskId,
      });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setGenerateOpen(false);
      setScopeTaskId(null);
      router.push(`/flashcards/${result.deckId}` as any);
    } catch (err: any) {
      // Defense in depth: this screen already gates !isPro above, so this
      // should rarely fire — but client isPro can be stale, same reasoning
      // as the AI Tutor screen's identical guard.
      if (err?.code === 'PRO_REQUIRED') {
        showProUpsell('flashcards');
        return;
      }
      Alert.alert('Could not generate flashcards', err?.message ?? 'Please try again.');
    } finally {
      generationInFlightRef.current = false;
      setGenerationStage(null);
      setReadProgress(null);
    }
  };

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
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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
        <Stack.Screen options={{ title: translate('Flashcards') }} />
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
                if (Platform.OS !== 'web') Haptics.selectionAsync();
                showProUpsell('flashcards');
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
      <Stack.Screen options={{ title: translate('Flashcards') }} />
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        keyboardShouldPersistTaps="handled"
      >
        {/* AI-generate affordance — only when opened scoped to a course
            (the entry row on course detail passes ?courseId=), since
            generation is grounded in that course's syllabus + notes. Tap to
            expand a scope picker (whole course, or one specific exam/quiz —
            sourced from real tasks, not a free-text box like competitors
            use) plus an optional material upload for something like a
            teacher's review packet. */}
        {!!courseId && !generateOpen && (
          <TouchableOpacity
            style={[styles.generateBtn, { backgroundColor: PROMO_SURFACE }]}
            onPress={() => { if (Platform.OS !== 'web') Haptics.selectionAsync(); setGenerateOpen(true); }}
            activeOpacity={0.85}
          >
            <View style={[styles.generateGlow, { backgroundColor: colors.brand }]} />
            <FontAwesome name="magic" size={14} color="#fff" style={{ zIndex: 1 }} />
            <View style={{ flex: 1, zIndex: 1 }}>
              <Text style={styles.generateTitle}>Generate with AI</Text>
              <Text style={styles.generateSub}>From this course's syllabus and notes</Text>
            </View>
          </TouchableOpacity>
        )}

        {!!courseId && generateOpen && (
          <View style={[styles.generatePanel, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={styles.generatePanelHeader}>
              <FontAwesome name="magic" size={13} color={colors.brand} />
              <Text style={[styles.generatePanelTitle, { color: colors.ink }]}>Generate with AI</Text>
              <TouchableOpacity onPress={() => { setGenerateOpen(false); setScopeTaskId(null); }} hitSlop={10}>
                <FontAwesome name="times" size={15} color={colors.ink3} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.generateSectionLabel, { color: colors.ink3 }]}>Focus on</Text>
            <View style={styles.scopeRow}>
              <TouchableOpacity
                style={[styles.scopeChip, { borderColor: colors.line }, scopeTaskId === null && { backgroundColor: colors.brand, borderColor: colors.brand }]}
                onPress={() => setScopeTaskId(null)}
              >
                <Text style={[styles.scopeChipText, { color: colors.ink2 }, scopeTaskId === null && { color: '#fff' }]}>Whole course</Text>
              </TouchableOpacity>
              {scopeTasks.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.scopeChip, { borderColor: colors.line }, scopeTaskId === a.id && { backgroundColor: colors.brand, borderColor: colors.brand }]}
                  onPress={() => setScopeTaskId(a.id)}
                >
                  <Text style={[styles.scopeChipText, { color: colors.ink2 }, scopeTaskId === a.id && { color: '#fff' }]}>
                    {TASK_TYPE_LABELS[a.type as keyof typeof TASK_TYPE_LABELS] ?? a.type}: {a.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {scopeTasks.length === 0 && (
              <Text style={[styles.generateHint, { color: colors.ink3 }]}>
                No exams, quizzes, assignments, or readings tracked for this course yet — add one to focus generation on it specifically.
              </Text>
            )}

            <Text style={[styles.generateSectionLabel, { color: colors.ink3, marginTop: 16 }]}>Study material</Text>
            <TouchableOpacity
              style={[styles.uploadRow, { borderColor: colors.line }]}
              onPress={handleAddMaterial}
              disabled={uploadNote.isPending}
              activeOpacity={0.7}
            >
              {uploadNote.isPending ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <FontAwesome name="paperclip" size={13} color={colors.brand} />
              )}
              <Text style={[styles.uploadRowText, { color: colors.ink2 }]}>
                {uploadNote.isPending
                  ? 'Uploading…'
                  : courseNotes.length > 0
                    ? `${courseNotes.length} file${courseNotes.length !== 1 ? 's' : ''} added — add another`
                    : "Add notes, slides, a spreadsheet, PDF, or photo"}
              </Text>
            </TouchableOpacity>
            {fileProgress && (
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
            )}
            {courseNotes.length > 0 && (
              <View style={styles.noteSelectWrap}>
                <Text style={[styles.noteSelectHint, { color: colors.ink3 }]}>Choose the notes to use</Text>
                <View style={styles.noteSelectRow}>
                  {courseNotes.map((note) => {
                    const selected = selectedNoteIds.includes(note.id);
                    return (
                      <TouchableOpacity
                        key={note.id}
                        style={[styles.noteSelectChip, { borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brand50 : colors.paper }]}
                        onPress={() => setSelectedNoteIds((current) => selected ? current.filter((id) => id !== note.id) : [...current, note.id])}
                      >
                        <FontAwesome name={selected ? 'check-square-o' : 'square-o'} size={12} color={selected ? colors.brand : colors.ink3} />
                        <Text style={[styles.noteSelectText, { color: colors.ink2 }]} numberOfLines={1}>{note.filename}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.generateConfirmBtn, { backgroundColor: colors.brand }, isGenerating && { opacity: 0.7 }]}
              onPress={handleGenerate}
              disabled={isGenerating}
              activeOpacity={0.85}
            >
              {isGenerating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.generateConfirmText}>
                  {scopeTaskId ? `Generate for ${scopeTasks.find((a) => a.id === scopeTaskId)?.title ?? 'this item'}` : 'Generate for whole course'}
                </Text>
              )}
            </TouchableOpacity>
            {generationStage && (
              <FileWorkProgress
                compact
                title={generationStage === 'reading' ? 'Reading selected documents…' : 'Creating flashcards…'}
                detail={generationStage === 'reading' && readProgress
                  ? `${readProgress.completed} of ${readProgress.total} ready · ${readProgress.filename}`
                  : 'Using your syllabus and selected course material'}
              />
            )}
          </View>
        )}

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
            onPress={() => { if (Platform.OS !== 'web') Haptics.selectionAsync(); setCreating(true); }}
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

  // AI generate
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, marginBottom: 10, overflow: 'hidden', position: 'relative' },
  generateGlow: { position: 'absolute', right: -20, top: -20, width: 100, height: 100, borderRadius: 50, opacity: 0.35 },
  generateTitle: { fontSize: 15, fontWeight: '700', color: '#fff', zIndex: 1 },
  generateSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 1, zIndex: 1 },

  // AI generate — expanded scope-picker panel
  generatePanel: { borderRadius: 16, borderWidth: 0.5, padding: 16, marginBottom: 10 },
  generatePanelHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  generatePanelTitle: { flex: 1, fontSize: 15, fontWeight: '700' },
  generateSectionLabel: { fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  generateHint: { fontSize: 12.5, lineHeight: 17 },
  scopeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scopeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  scopeChipText: { fontSize: 13, fontWeight: '600' },
  uploadRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14 },
  uploadRowText: { flex: 1, fontSize: 13, lineHeight: 18 },
  noteSelectWrap: { marginTop: 10 },
  noteSelectHint: { fontSize: 11.5, fontWeight: '600', marginBottom: 7 },
  noteSelectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  noteSelectChip: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7 },
  noteSelectText: { fontSize: 11.5, flexShrink: 1 },
  generateConfirmBtn: { marginTop: 16, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  generateConfirmText: { fontSize: 14.5, fontWeight: '700', color: '#fff' },

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
