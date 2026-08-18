import React, { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Alert, Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FONTS, SCREEN_MAX_WIDTH, WEB_CARD_SHADOW } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { track } from '@/lib/analytics';
import { normalizeSupportedDocument, unsupportedDocumentMessage } from '@/lib/documentFiles';
import { useUploadCourseNote, type CourseNoteUploadProgress } from '@/lib/tutor';
import { useCreateDocumentNote } from '@/lib/lectures';
import { useFreeActionUsed } from '@/lib/queries';
import { useAppStore } from '@/store/appStore';

// Study material from a file.
//
// Two steps, deliberately in this order: pick the file, THEN choose what to
// make from it. The reverse (choose an outcome, then find a file) asks the
// student to commit before they know whether the document is even readable —
// and the readable check only happens once the text has been extracted.
//
// The three outcomes are not three pipelines. Notes are always generated,
// because a quiz and a deck are both built FROM notes (lecture-study-kit reads
// notes_md for quiz mode). Choosing "Quiz" means "notes, then take me straight
// into the quiz", which is why this screen routes rather than generates: the
// notes screen already owns generation, its progress states, and its retries.

type Outcome = 'notes' | 'quiz' | 'cards';

// `pro` mirrors the gate on the notes screen, where quiz and flashcard
// generation both refuse a free account. Repeating it here is not duplication
// for its own sake: without it this screen offers three outcomes as equals, and
// a free student picks "Practice quiz", spends the one free action they get on
// the notes, and meets the paywall holding something they did not ask for.
// Showing the badge before the file is chosen is the difference between a
// price and a bait.
const OUTCOMES: {
  key: Outcome;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  title: string;
  sub: string;
  tone: 'brand' | 'teal' | 'amber';
  pro: boolean;
}[] = [
  { key: 'notes', icon: 'file-text-o', title: 'Study notes', sub: 'Organised summary with the key points', tone: 'brand', pro: false },
  { key: 'quiz', icon: 'check-square-o', title: 'Practice quiz', sub: 'Questions to test yourself, with answers', tone: 'teal', pro: true },
  { key: 'cards', icon: 'clone', title: 'Flashcards', sub: 'A deck you can review anywhere', tone: 'amber', pro: true },
];

export default function NewNotesFromDocument() {
  const params = useLocalSearchParams<{ courseId?: string }>();
  const router = useRouter();
  const colors = useColors();
  const courseId = params.courseId ?? null;

  const upload = useUploadCourseNote(courseId);
  const createNote = useCreateDocumentNote(courseId);
  const isPro = useAppStore((s) => s.isPro);
  const { data: freeActionUsed = false } = useFreeActionUsed();

  const [progress, setProgress] = useState<CourseNoteUploadProgress | null>(null);
  const [lectureId, setLectureId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  const busy = progress != null && progress.stage !== 'ready';

  const TONES = {
    brand: { fg: colors.brand, bg: colors.brand50 },
    teal: { fg: colors.teal, bg: colors.teal50 },
    amber: { fg: colors.amber, bg: colors.amber50 },
  } as const;

  const pick = async () => {
    if (Platform.OS === 'ios') Haptics.selectionAsync();

    // Checked BEFORE the picker, not after the upload. The server is the real
    // gate (lecture-study-kit charges the free action when it generates), but
    // if the refusal only arrived at generation the student would already have
    // uploaded a file and created a note — leaving an empty, un-generatable
    // row sitting in their Notes list as the reward for hitting the paywall.
    if (!isPro && freeActionUsed) {
      router.push({ pathname: '/paywall', params: { context: 'document_notes' } } as any);
      return;
    }

    try {
      // Left broad on purpose: iCloud and Drive report Office and iWork files
      // as octet-stream or zip, so a narrow `type` filter hides files the app
      // can actually read. normalizeSupportedDocument below is the real gate.
      const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;

      const document = normalizeSupportedDocument(asset.name, asset.mimeType);
      if (!document) {
        Alert.alert('Unsupported file', unsupportedDocumentMessage(asset.name));
        return;
      }

      setFilename(document.fileName);
      const note = await upload.mutateAsync({
        uri: asset.uri,
        filename: document.fileName,
        mimeType: document.mimeType,
        onProgress: setProgress,
      });

      const id = await createNote.mutateAsync({ noteId: note.id, filename: document.fileName });
      setLectureId(id);
      track('document_note_ready', { has_course: Boolean(courseId) });
    } catch (err: any) {
      setProgress(null);
      setFilename(null);
      Alert.alert(
        err?.code === 'NO_TEXT' ? "Couldn't read that file" : 'Upload failed',
        err?.message ?? 'Something went wrong. Please try again.',
      );
    }
  };

  const choose = (outcome: Outcome) => {
    if (!lectureId) return;
    if (Platform.OS === 'ios') Haptics.selectionAsync();
    // Stop here rather than routing into a screen that would only bounce the
    // student to the paywall a moment later, having also consumed their notes.
    const spec = OUTCOMES.find((o) => o.key === outcome);
    if (spec?.pro && !isPro) {
      track('paywall_open', { screen: 'document_note_new', context: `document_${outcome}` });
      router.push({ pathname: '/paywall', params: { context: `document_${outcome}` } } as any);
      return;
    }
    track('document_note_outcome', { outcome });
    // `generate` tells the notes screen to keep going once the notes exist,
    // rather than leaving the student on a page of notes wondering where the
    // quiz they asked for went.
    router.replace({
      pathname: '/lecture/[id]',
      params: outcome === 'notes' ? { id: lectureId } : { id: lectureId, generate: outcome },
    } as any);
  };

  const stageLabel = (p: CourseNoteUploadProgress): string => {
    switch (p.stage) {
      case 'validating': return 'Checking the file…';
      case 'preparing': return 'Preparing…';
      case 'uploading': return `Uploading${typeof p.percent === 'number' ? ` ${Math.round(p.percent)}%` : '…'}`;
      case 'saving': return 'Saving…';
      case 'reading': return 'Reading the text…';
      case 'ready': return 'Ready';
      default: return 'Working…';
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: SCREEN_MAX_WIDTH }]}>
        <Text style={[styles.title, { color: colors.ink }]}>Turn a file into study material</Text>
        <Text style={[styles.subtitle, { color: colors.ink2 }]}>
          Lecture slides, a textbook chapter, a photo of the whiteboard — Semora reads it and
          makes notes, a quiz, or flashcards.
        </Text>

        {/* ── Step 1: the file ─────────────────────────────────────────── */}
        {!lectureId ? (
          <TouchableOpacity
            onPress={pick}
            disabled={busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Choose a file"
            style={[
              styles.dropCard,
              { borderColor: busy ? colors.line : colors.brand, backgroundColor: colors.card },
              WEB_CARD_SHADOW,
            ]}
          >
            {busy ? (
              <>
                <ActivityIndicator color={colors.brand} />
                <Text style={[styles.dropTitle, { color: colors.ink }]}>
                  {progress ? stageLabel(progress) : 'Working…'}
                </Text>
                <Text style={[styles.dropSub, { color: colors.ink3 }]} numberOfLines={1}>
                  {filename ?? ''}
                </Text>
              </>
            ) : (
              <>
                <View style={[styles.dropIcon, { backgroundColor: colors.brand50 }]}>
                  <FontAwesome name="cloud-upload" size={26} color={colors.brand} />
                </View>
                <Text style={[styles.dropTitle, { color: colors.ink }]}>Choose a file</Text>
                <Text style={[styles.dropSub, { color: colors.ink3 }]}>
                  PDF · Images · Word · Slides · Text
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={[styles.fileChip, { backgroundColor: colors.teal50, borderColor: colors.teal }]}>
            <FontAwesome name="check-circle" size={15} color={colors.teal} />
            <Text style={[styles.fileChipText, { color: colors.ink }]} numberOfLines={1}>
              {filename}
            </Text>
          </View>
        )}

        {/* ── Step 2: what to make ─────────────────────────────────────── */}
        {lectureId ? (
          <>
            <Text style={[styles.stepLabel, { color: colors.ink3 }]}>WHAT SHOULD I MAKE?</Text>
            {OUTCOMES.map((o) => {
              const tone = TONES[o.tone];
              return (
                <TouchableOpacity
                  key={o.key}
                  onPress={() => choose(o.key)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={o.pro && !isPro ? `${o.title}. ${o.sub}. Pro feature` : `${o.title}. ${o.sub}`}
                  style={[
                    styles.outcomeCard,
                    { backgroundColor: colors.card, borderColor: colors.line },
                    WEB_CARD_SHADOW,
                  ]}
                >
                  <View style={[styles.outcomeIcon, { backgroundColor: tone.bg }]}>
                    <FontAwesome name={o.icon} size={20} color={tone.fg} />
                  </View>
                  <View style={styles.outcomeText}>
                    <View style={styles.outcomeTitleRow}>
                      <Text style={[styles.outcomeTitle, { color: colors.ink }]}>{o.title}</Text>
                      {o.pro && !isPro ? (
                        <View style={[styles.proBadge, { backgroundColor: colors.brand }]}>
                          <FontAwesome name="star" size={8} color="#fff" />
                          <Text style={styles.proBadgeText}>PRO</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.outcomeSub, { color: colors.ink2 }]}>{o.sub}</Text>
                  </View>
                  <FontAwesome name="chevron-right" size={13} color={colors.ink3} />
                </TouchableOpacity>
              );
            })}
            <Text style={[styles.footnote, { color: colors.ink3 }]}>
              {isPro
                ? 'Notes are made either way — a quiz and flashcards are built from them, and you can add the other two later from the notes screen.'
                : 'Your free action makes the notes. Quizzes and flashcards are built from them and need Pro.'}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 18, paddingBottom: 40, width: '100%', alignSelf: 'center', gap: 0 },
  title: { fontFamily: FONTS.display, fontSize: 26, lineHeight: 32, marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 21, marginBottom: 22 },

  dropCard: {
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    paddingVertical: 34,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 10,
  },
  dropIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dropTitle: { fontSize: 17, fontWeight: '700' },
  dropSub: { fontSize: 13, textAlign: 'center' },

  fileChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  fileChipText: { fontSize: 14, fontWeight: '600', flexShrink: 1 },

  stepLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 26, marginBottom: 12 },
  outcomeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  outcomeIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  outcomeText: { flex: 1, gap: 3 },
  outcomeTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  outcomeTitle: { fontSize: 16, fontWeight: '700' },
  proBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
  },
  proBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  outcomeSub: { fontSize: 13, lineHeight: 18 },
  footnote: { fontSize: 12, lineHeight: 17, marginTop: 4 },
});
