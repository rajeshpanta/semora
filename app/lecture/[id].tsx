import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Alert, Text, TextInput, TouchableOpacity } from '@/components/LocalizedReactNative';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { FONTS, SCREEN_MAX_WIDTH, TASK_TYPE_LABELS } from '@/lib/constants';
import { useColors, type ColorPalette } from '@/lib/theme';
import { useProUpsell } from '@/components/ProUpsellHost';
import { translate, useI18n } from '@/lib/i18n';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { useGenerateFlashcards } from '@/lib/flashcards';
import { useCourses } from '@/lib/queries';
import { track } from '@/lib/analytics';
import {
  finalizeLecture,
  formatLectureDuration,
  generateLectureNotes,
  lectureKeys,
  useAttachLectureCourse,
  useSetLectureDeck,
  useDeleteLecture,
  useGenerateLectureQuiz,
  useLecture,
  useRetryLectureNotes,
  type LectureError,
  isLectureStalled,
  lectureCompleteness,
  useLectureLocalProgress,
  useLectureSegmentProgress,
  useLectureTimeline,
  useRenameLecture,
} from '@/lib/lectures';
import { actionItemsFromNotes, taskTitleFromItem } from '@/lib/lectureActionItems';
import { buildTimeline, formatTimestamp, type TimelineBlock } from '@/lib/lectureTimeline';
import { kickUploadQueue, retryLectureUploads } from '@/lib/lectureUploadQueue';
import { canRecordLectures, getLectureSession } from '@/lib/lectureSessionRuntime';

// One lecture: what the recording became.
//
// On open this screen:
//   1. asks for the notes once a transcript exists (idempotent server-side),
//      and keeps asking while a long lecture's notes are written in sections;
//   2. asks the upload queue to run, so any part of THIS lecture still on the
//      phone goes up now (the queue itself is app-wide and journal-driven).
// Both run on open rather than behind a button, so the common case looks like
// it simply worked.

/**
 * Inline markdown inside one line.
 *
 * The notes prompt asks for bolded key terms, and a model writing markdown
 * emits `**like this**` whether or not it is asked to. This renderer used to
 * print every line verbatim, so those markers showed up as literal asterisks
 * in the middle of the notes.
 *
 * Only `**bold**` is handled, deliberately. A single `*` is left exactly as it
 * is: in lecture notes it is far more likely to be multiplication in a formula
 * than an italic marker, and silently eating it would corrupt the maths the
 * notes exist to record.
 */
function InlineText({ text }: { text: string }) {
  if (!text.includes('**')) return <>{text}</>;
  // Capturing split, so the delimiters' contents survive as odd-indexed parts.
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <Text key={i} style={{ fontWeight: '700' }}>{part}</Text>
          // An unmatched '**' — generation cut off mid-line, say — never
          // pairs, so it would sit in the notes as literal asterisks. It has
          // no meaning of its own, unlike a single '*', so drop it.
          : <Text key={i}>{part.replace(/\*\*/g, '')}</Text>,
      )}
    </>
  );
}

/** Renders the markdown subset the notes generator emits: '#'/'##'/'###' headings and '- ' bullets. */
function NotesBody({
  md,
  inkColor,
  ink2Color,
  brandColor,
  highlightColor,
}: {
  md: string;
  inkColor: string;
  ink2Color: string;
  brandColor: string;
  /** Background for bullets the student marked important while recording (⭐). */
  highlightColor?: string;
}) {
  return (
    <View style={{ gap: 4 }}>
      {md.split('\n').map((line, i) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('## ')) {
          return (
            <Text key={i} style={[nb.heading, { color: inkColor }, i > 0 && { marginTop: 12 }]}>
              <InlineText text={trimmed.slice(3)} />
            </Text>
          );
        }
        if (trimmed.startsWith('#')) {
          return (
            <Text key={i} style={[nb.heading, { color: inkColor }, i > 0 && { marginTop: 12 }]}>
              <InlineText text={trimmed.replace(/^#+\s*/, '')} />
            </Text>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <View
              key={i}
              style={[
                nb.bulletRow,
                line.startsWith('  ') && nb.bulletIndent,
                highlightColor && trimmed.slice(2).startsWith('⭐') ? [nb.marked, { backgroundColor: highlightColor }] : null,
              ]}
            >
              <Text style={[nb.bulletDot, { color: brandColor }]}>•</Text>
              <Text style={[nb.bulletText, { color: ink2Color }]} selectable>
                <InlineText text={trimmed.slice(2)} />
              </Text>
            </View>
          );
        }
        if (!trimmed) return null;
        return (
          <Text key={i} style={[nb.paragraph, { color: ink2Color }]} selectable>
            <InlineText text={trimmed} />
          </Text>
        );
      })}
    </View>
  );
}

/**
 * A generation claim older than this is assumed dead.
 *
 * Both notes and quiz generation are synchronous edge invocations; if the
 * isolate is killed mid-flight the row keeps its "in progress" marker forever.
 * Without an expiry the screen spins and the retry button never renders.
 *
 * ─── WHY 170 SECONDS AND NOT THE 4 MINUTES THIS USED TO BE ───
 * 4 minutes was a guess made before anyone knew how long an invocation can
 * actually live. It can live 150 seconds. Across all 315 model calls ever
 * logged, the slowest is 148,552 ms and NOT ONE has crossed 150,000 — the
 * shape of a hard platform ceiling rather than a model that occasionally runs
 * long. The 148.5s one is the call that died: it finished, and the isolate was
 * killed before it could save.
 *
 * So past ~150 seconds from the claim there is nothing alive on the other end,
 * and every second the old threshold kept spinning after that was a second the
 * student waited for a result that could no longer arrive — 90 of them.
 *
 * 170 leaves ~20 seconds of margin over the ceiling, for the second or two
 * between the request starting and notes_started_at being stamped, for the
 * 4-second poll granularity, and for ordinary clock skew between a phone and
 * the server. Tighter than that and a device running fast could offer "Try
 * again" while the server is still working, which costs a duplicate model call.
 *
 * ─── STILL SAFELY AHEAD OF THE SERVER ───
 * sweep_stalled_lectures resets an abandoned claim at 4 minutes (migration
 * 107). 082's rule is that the server must never act before the client has
 * given up, and 107 satisfied it by matching this constant exactly. Lowering
 * this to 170s keeps the rule — the sweep now trails the client by 70 seconds
 * instead of arriving at the same moment. 107's comment naming this constant
 * as "4 minutes" is stale as of this change; the ORDER is what mattered, and
 * the order is unchanged.
 */
const STALE_GENERATION_MS = 170 * 1000;

/** A device that heartbeat this recently is still recording (or paused) the lecture. */
const OTHER_DEVICE_LIVE_MS = 3 * 60 * 1000;

interface TranscriptCardProps {
  blocks: TimelineBlock[];
  hasTimings: boolean;
  loading: boolean;
  /** The plain transcript, shown when there are no timings. */
  transcript: string;
  filter: 'all' | 'starred';
  showFilter: boolean;
  onFilter: (f: 'all' | 'starred') => void;
  /** The missing parts are on this phone and can be sent now. */
  recoverable: boolean;
  recovering: boolean;
  onRetry: () => void;
  colors: ColorPalette;
  onCardLayout: (e: LayoutChangeEvent) => void;
  onInnerLayout: (e: LayoutChangeEvent) => void;
  onRowLayout: (index: number, y: number) => void;
}

/**
 * The transcript, memoised on its own inputs.
 *
 * A 3-hour lecture is ~180 selectable rows. Inline in the screen they were
 * rebuilt on every render — each 4-second poll while notes were being
 * written, every keystroke of a rename — and in Spanish each row's text
 * passed the whole translate chain again. Nothing here changes on those
 * renders, so React.memo skips it; the callbacks it takes are stable.
 */
const TranscriptCard = React.memo(function TranscriptCard({
  blocks, hasTimings, loading, transcript, filter, showFilter, onFilter,
  recoverable, recovering, onRetry, colors, onCardLayout, onInnerLayout, onRowLayout,
}: TranscriptCardProps) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.line, marginTop: 8 },
      ]}
      onLayout={onCardLayout}
    >
      {showFilter ? (
        <View style={styles.filterRow}>
          {(['all', 'starred'] as const).map((f) => {
            const active = filter === f;
            return (
              <TouchableOpacity
                key={f}
                style={[
                  styles.filterChip,
                  { backgroundColor: active ? colors.brand50 : colors.card, borderColor: active ? colors.brand : colors.line },
                ]}
                onPress={() => onFilter(f)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={f === 'all' ? 'All' : 'Starred'}
              >
                <Text style={[styles.chipText, { color: active ? colors.brand : colors.ink2 }]}>
                  {f === 'all' ? 'All' : 'Starred'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      {hasTimings ? (
        <View style={{ gap: 12 }} onLayout={onInnerLayout}>
          {filter === 'starred' && !blocks.some((b) => b.kind === 'paragraph' && b.marked) ? (
            <Text style={[styles.gapNote, { color: colors.ink2 }]}>
              None of your starred moments fall on a transcribed sentence. Showing all.
            </Text>
          ) : null}
          {blocks.map((block, i) => {
            // Filtered by skipping, so `i` stays the index the
            // scroll-to-mark effect looks rows up by.
            if (filter === 'starred' && block.kind === 'paragraph' && !block.marked) return null;
            if (block.kind === 'gap') {
              // The only place a student can see WHICH minutes
              // are lost. No minute estimate from the part count:
              // expo parts are 300 s and native chunks 120 s.
              return (
                <View key={i} style={[styles.timelineRow, { backgroundColor: colors.amber50, alignItems: 'flex-start' }]}>
                  <Text style={[styles.timelineStamp, { color: colors.amberText }]}>{formatTimestamp(block.start)}</Text>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[styles.timelineGap, { color: colors.amberText }]}>
                      {block.parts === 1
                        ? 'Missing here — 1 part never arrived'
                        : `Missing here — ${block.parts} parts never arrived`}
                    </Text>
                    {recoverable ? (
                      <TouchableOpacity
                        onPress={onRetry}
                        disabled={recovering}
                        accessibilityRole="button"
                        accessibilityLabel="Upload the missing part now"
                      >
                        <Text style={[styles.incompleteAction, { color: colors.brand }]}>
                          {recovering ? 'Trying…' : 'Upload it now'}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={[styles.gapNote, { color: colors.ink2 }]}>Not on this phone</Text>
                    )}
                  </View>
                </View>
              );
            }
            return (
              <View
                key={i}
                style={[styles.timelineRow, block.marked && { backgroundColor: colors.amber50 }]}
                onLayout={(e) => onRowLayout(i, e.nativeEvent.layout.y)}
              >
                <Text style={[styles.timelineStamp, { color: block.marked ? colors.amberText : colors.ink2 }]}>
                  {block.marked ? `⭐ ${formatTimestamp(block.start)}` : formatTimestamp(block.start)}
                </Text>
                <Text style={[styles.transcriptText, { color: colors.ink2, flex: 1 }]} selectable>{block.text}</Text>
              </View>
            );
          })}
        </View>
      ) : loading ? (
        <ActivityIndicator color={colors.brand} />
      ) : (
        <Text style={[styles.transcriptText, { color: colors.ink2 }]} selectable>
          {transcript}
        </Text>
      )}
    </View>
  );
});
// Longer than STALE_GENERATION_MS because transcription is genuinely slower
// and arrives in pieces: updated_at moves as each segment lands, so this only
// elapses when nothing at all has progressed. Long enough that a slow upload
// on bad signal is never mistaken for a dead one.
// (the threshold itself lives in lib/lectures as LECTURE_STALLED_MS, shared
// with the poller so the screen and the refetch loop cannot disagree)

// Notes are read, not skimmed — a student revising sits with this screen the
// way they would with a page of a textbook. 14pt with a 20pt line height is
// caption sizing; it was legible only by holding the phone closer or zooming.
// 16.5/25 is ordinary reading size, and the generous line height is what makes
// a dense bulleted page scannable rather than a wall.
//
// No maximum font scale is set anywhere here: Text scales with the reader's iOS
// text-size setting by default, and capping that is how an app becomes unusable
// for the people who most need it larger.
const nb = StyleSheet.create({
  marked: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, marginHorizontal: -6 },
  heading: { fontFamily: FONTS.displaySemibold, fontSize: 19, lineHeight: 26 },
  bulletRow: { flexDirection: 'row', gap: 9, paddingRight: 6 },
  bulletIndent: { paddingLeft: 18 },
  bulletDot: { fontSize: 16.5, lineHeight: 25 },
  bulletText: { flex: 1, fontSize: 16.5, lineHeight: 25 },
  paragraph: { fontSize: 16.5, lineHeight: 25 },
});

export default function LectureDetailScreen() {
  const colors = useColors();
  const showProUpsell = useProUpsell();
  const router = useRouter();
  const qc = useQueryClient();
  const { contentMaxWidth } = useResponsive();
  const { localeTag } = useI18n();
  const { id, generate } = useLocalSearchParams<{ id: string; generate?: string }>();

  // isPending / isError / fetchStatus, not just isLoading: a query that has
  // never fetched this id and cannot reach the server (paused offline, or
  // errored after retries) has `data` undefined exactly like a 404 does, and
  // the screen used to say "no longer available" about the lecture the
  // student had just recorded and walked out of wifi with.
  const { data: lecture, isPending, isError, fetchStatus, refetch } = useLecture(id);
  // What this phone holds of it, whatever the server says (or cannot say).
  const localProgress = useLectureLocalProgress(id);
  // Declared here, with the other hooks, and NOT beside the render branch that
  // uses it: there is an early return for the not-found case further down, and
  // a hook after it runs on some renders and not others — which React throws
  // on and TypeScript cannot see. `lecture` is optional-chained for the same
  // reason: at this point it may not have loaded yet.
  const { data: segmentProgress } = useLectureSegmentProgress(
    id,
    lecture?.status === 'uploading' || lecture?.status === 'transcribing' || lecture?.status === 'recording' ||
      (lecture ? lectureCompleteness(lecture).kind === 'missing' : false),
  );
  const isPro = useAppStore((s) => s.isPro);
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const { data: courses = [] } = useCourses(selectedSemesterId);

  const generateQuiz = useGenerateLectureQuiz(id);
  const retryNotes = useRetryLectureNotes(id);
  const deleteLecture = useDeleteLecture();
  const attachCourse = useAttachLectureCourse(id);
  const generateCards = useGenerateFlashcards();
  const setLectureDeck = useSetLectureDeck(id);

  const [showTranscript, setShowTranscript] = useState(false);
  const [showCoursePicker, setShowCoursePicker] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const notesRequestedRef = useRef(false);
  const resumeAttemptedRef = useRef(false);
  const renameLecture = useRenameLecture(id);
  const [renaming, setRenaming] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // "Mark important" taps, seconds into the recording. Document notes have
  // none and no timeline to point them at.
  const marks = lecture?.important_marks ?? [];
  const hasMarks = marks.length > 0 && lecture?.source !== 'document';
  // All / Starred filter inside the transcript card.
  const [transcriptFilter, setTranscriptFilter] = useState<'all' | 'starred'>('all');
  // Scroll-to-paragraph for a tapped starred moment: the outer ScrollView, the
  // transcript card's y, the timeline column's y inside the card, and each
  // paragraph's y inside the column (keyed by its index in timeline.blocks).
  const scrollRef = useRef<ScrollView>(null);
  const cardY = useRef(0);
  const innerY = useRef(0);
  const rowY = useRef(new Map<number, number>());
  // State, not a ref: a tap while the transcript is already open must still
  // re-run the scroll effect, and nothing else in its deps changes then.
  const [pendingMark, setPendingMark] = useState<number | null>(null);

  // 4.2: the transcript with timestamps, fetched once it is opened — or right
  // away when there are starred moments, so tapping one has somewhere to go.
  const timelineQuery = useLectureTimeline(id, (showTranscript || hasMarks) && lecture?.source !== 'document');
  // Keyed on the marks' VALUE: every poll delivers a fresh important_marks
  // array, and rebuilding the timeline on each would hand TranscriptCard new
  // blocks every 4 seconds, defeating its memo.
  const marksKey = JSON.stringify(lecture?.important_marks ?? []);
  const timeline = useMemo(
    () => buildTimeline(timelineQuery.data ?? [], JSON.parse(marksKey) as number[]),
    [timelineQuery.data, marksKey],
  );
  // Layout plumbing for scroll-to-mark, stable so the memoised card holds.
  const onCardLayout = useCallback((e: LayoutChangeEvent) => { cardY.current = e.nativeEvent.layout.y; }, []);
  const onInnerLayout = useCallback((e: LayoutChangeEvent) => { innerY.current = e.nativeEvent.layout.y; }, []);
  const onRowLayout = useCallback((index: number, y: number) => { rowY.current.set(index, y); }, []);

  // A starred chip was tapped: once the transcript is open and laid out,
  // scroll to the paragraph being spoken at (or just before) that moment.
  useEffect(() => {
    if (pendingMark === null || !showTranscript || !timeline.hasTimings) return;
    const m = pendingMark;
    let idx = -1;
    timeline.blocks.forEach((b, i) => {
      if (b.kind === 'paragraph' && b.start <= m + 10) idx = i;
    });
    if (idx < 0) {
      setPendingMark(null);
      return;
    }
    // Two frames: the first can run before the rows have reported their layout.
    // The mark is consumed only AFTER the scroll: clearing it first re-rendered,
    // which ran this effect's cleanup and cancelled the frames every time.
    let inner: number | null = null;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        const y = rowY.current.get(idx);
        if (y !== undefined) {
          scrollRef.current?.scrollTo({ y: Math.max(0, cardY.current + innerY.current + y - 12), animated: true });
        }
        setPendingMark(null);
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner !== null) cancelAnimationFrame(inner);
    };
  }, [pendingMark, showTranscript, timeline]);

  // "Fri, Oct 3" from the parser's YYYY-MM-DD. Parsed by parts on purpose:
  // `new Date('YYYY-MM-DD')` is UTC midnight, which is the previous evening
  // anywhere west of Greenwich and would show the wrong weekday.
  const dueLabel = useCallback((ymd: string) => {
    const [y, mo, d] = ymd.split('-').map(Number);
    return new Date(y, mo - 1, d).toLocaleDateString(localeTag, { weekday: 'short', month: 'short', day: 'numeric' });
  }, [localeTag]);
  // 4.6: "Due Friday" / "exam Oct 3" from the notes, one tap from a task.
  const actionItems = useMemo(
    () => actionItemsFromNotes(lecture?.notes_md, new Date(lecture?.created_at ?? Date.now())),
    [lecture?.notes_md, lecture?.created_at],
  );

  const saveTitle = useCallback(() => {
    const next = titleDraft.trim();
    if (!next || next === lecture?.title) {
      setRenaming(false);
      return;
    }
    renameLecture.mutate(next, {
      onSuccess: () => setRenaming(false),
      onError: (e) => Alert.alert("Couldn't rename", (e as Error)?.message || 'Please try again.'),
    });
  }, [titleDraft, lecture?.title, renameLecture]);

  const shareNotes = useCallback(() => {
    if (!lecture?.notes_md) return;
    // Plain text: the markdown markers mean nothing in Messages or Mail.
    const text = lecture.notes_md
      .split('\n')
      .map((l) => l.replace(/^#{1,3}\s+/, '').replace(/\*\*/g, '').replace(/^(\s*)[-*]\s+/, '$1• '))
      .join('\n');
    track('lecture_notes_shared', { source: lecture.source ?? null });
    Share.share({ title: lecture.title, message: [lecture.title, '', text].join('\n') }).catch(() => {});
  }, [lecture]);

  const addActionItemAsTask = useCallback((item: { text: string; type: string; dueDate: string | null }) => {
    if (!lecture) return;
    track('lecture_action_item_to_task', { type: item.type, hasDate: Boolean(item.dueDate) });
    router.push({
      pathname: '/task/new',
      params: {
        ...(lecture.course_id ? { courseId: lecture.course_id } : {}),
        title: taskTitleFromItem(item.text),
        type: item.type,
        ...(item.dueDate ? { dueDate: item.dueDate } : {}),
        description: [item.text, '', [translate('From your lecture:'), lecture.title].join(' ')].join('\n'),
      },
    } as any);
  }, [lecture, router]);

  // Ask for the notes as soon as a transcript lands. Idempotent server-side, so
  // a duplicate request from a re-render returns the cached notes for free.
  useEffect(() => {
    if (!lecture || !id) return;
    if (lecture.status !== 'transcribed' || lecture.notes_md) return;
    if (notesRequestedRef.current) return;
    notesRequestedRef.current = true;
    let cancelled = false;
    (async () => {
      // A long lecture's notes are written a section at a time (143); the
      // server says `continue` until they are done. Bounded, and only while
      // this screen is open — the scheduler carries on otherwise.
      for (let step = 0; step < 8 && !cancelled; step++) {
        const result = await generateLectureNotes(id);
        qc.invalidateQueries({ queryKey: lectureKeys.detail(id) });
        if (!result?.continue) break;
      }
      track('lecture_notes_generated', { screen: 'lecture_detail' });
    })().catch(() => {
      // The guard stays LATCHED. Re-arming it here turned a failing notes call
      // into an unbounded retry loop: the server resets the row to
      // 'transcribed' on failure, the 4-second poll re-delivers that status,
      // and the effect fires again — billing another model call every time.
      // The explicit "Try again" button below is the only retry path.
      qc.invalidateQueries({ queryKey: lectureKeys.detail(id) });
    });
    return () => { cancelled = true; };
  }, [lecture?.status, lecture?.notes_md, id, qc]);

  // Send whatever of this lecture is still on the phone, WHATEVER the server
  // calls it: a 'ready' lecture can still be missing parts that are sitting on
  // this phone (04cd64e7, 2026-09-14).
  useEffect(() => {
    if (!lecture || !id) return;
    const inFlight = lecture.status === 'uploading' || lecture.status === 'transcribing';
    const incomplete = lectureCompleteness(lecture).kind === 'missing';
    if (!inFlight && !incomplete) return;
    if (resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;
    void kickUploadQueue('lecture_opened').finally(() => {
      qc.invalidateQueries({ queryKey: lectureKeys.detail(id) });
    });
  }, [lecture?.status, lecture?.parts_missing, id, qc]);

  /**
   * "Try again": parts that stopped retrying get a fresh set of attempts, the
   * queue runs now, and the server is asked to finish the lecture.
   */
  const retryMissingParts = useCallback(() => {
    if (!id || recovering) return;
    setRecovering(true);
    retryLectureUploads(id)
      .then(() => finalizeLecture(id))
      .catch(() => {})
      .finally(() => {
        setRecovering(false);
        qc.invalidateQueries({ queryKey: lectureKeys.detail(id) });
        qc.invalidateQueries({ queryKey: lectureKeys.segmentProgress(id) });
      });
  }, [id, recovering, qc]);

  const handleQuiz = useCallback(() => {
    if (!lecture) return;
    if (lecture.quiz && lecture.quiz.length > 0) {
      router.push({ pathname: '/lecture/quiz', params: { id: lecture.id } } as any);
      return;
    }
    if (!isPro) {
      track('paywall_open', { screen: 'lecture_detail', context: 'lecture_quiz' });
      showProUpsell('quiz');
      return;
    }
    generateQuiz.mutate(undefined, {
      // Open it. Generating and then leaving the student on the same screen
      // reads as nothing having happened — the button relabels to "Take the
      // quiz" and they have to press it a second time to see what they just
      // waited for.
      onSuccess: () => {
        router.push({ pathname: '/lecture/quiz', params: { id: lecture.id } } as any);
      },
      onError: (err) => {
        const e = err as LectureError;
        if (e?.code === 'PRO_REQUIRED') {
          showProUpsell('quiz');
          return;
        }
        Alert.alert("Couldn't build a quiz", e?.message || 'Please try again.');
      },
    });
  }, [lecture, isPro, router, generateQuiz]);

  const handleFlashcards = useCallback(() => {
    if (!lecture) return;
    if (!lecture.course_id) {
      Alert.alert(
        'Attach a course first',
        'Flashcards are saved to a course deck. Attach this lecture to a course, then try again.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Attach course', onPress: () => setShowCoursePicker(true) },
        ],
      );
      return;
    }
    if (!isPro) {
      track('paywall_open', { screen: 'lecture_detail', context: 'lecture_flashcards' });
      showProUpsell('flashcards');
      return;
    }
    // Already made once — open it. Without this the generator was handed no
    // deckId, so every press created ANOTHER deck: three presses, three
    // near-identical decks, and review history split across all of them.
    // Mirrors handleQuiz, which has always opened an existing quiz rather than
    // rebuilding it.
    if (lecture.deck_id) {
      router.push(`/flashcards/${lecture.deck_id}` as any);
      return;
    }

    // Generate here and open the deck, rather than handing the student off to
    // the Flashcards tab to start again. The old behaviour routed to a scoped
    // deck list where they still had to find the generate control and pick the
    // same course they had already implied by pressing this button — three
    // steps to do the thing the button says it does.
    //
    // The lecture's notes are mirrored into this course's material, so the
    // existing generator picks them up with no lecture-specific plumbing.
    generateCards.mutate(
      // lectureId makes the cards come from THIS lecture's notes, not from
      // whatever the course happens to hold (supabase/functions/generate-flashcards).
      { courseId: lecture.course_id, lectureId: lecture.id, deckTitle: lecture.title || 'Lecture' },
      {
        onSuccess: (result) => {
          // Remember it before navigating, so returning to this lecture offers
          // the deck rather than offering to build it again.
          setLectureDeck.mutate(result.deckId);
          router.push(`/flashcards/${result.deckId}` as any);
        },
        onError: (err) => {
          const e = err as LectureError;
          if (e?.code === 'PRO_REQUIRED') {
            showProUpsell('flashcards');
            return;
          }
          Alert.alert("Couldn't make flashcards", e?.message || 'Please try again.');
        },
      },
    );
  }, [lecture, isPro, router, generateCards, setLectureDeck]);

  // Arriving from the document-upload flow with "make me a quiz" / "make me
  // flashcards". Both are built FROM the notes, so this waits for notes_md
  // rather than firing on mount — at which point the notes are usually still
  // being written.
  //
  // The ref is what stops it looping: handleQuiz and handleFlashcards both
  // mutate the lecture, which re-renders this screen with notes_md still set,
  // which would fire the effect again. One shot per arrival.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    if (!generate || !lecture?.notes_md) return;
    autoRan.current = true;
    if (generate === 'quiz') handleQuiz();
    else if (generate === 'cards') handleFlashcards();
  }, [generate, lecture?.notes_md, handleQuiz, handleFlashcards]);

  // The lecture being recorded on this phone right now: deleting it from here
  // would pull the folder out from under the microphone. Its way out is the
  // recorder's Discard.
  const liveLectureId = useSyncExternalStore(
    getLectureSession().subscribe,
    () => getLectureSession().getState().lectureId,
    () => null,
  );
  const isBeingRecordedHere = Boolean(id) && liveLectureId === id;

  const handleDelete = useCallback(() => {
    if (!lecture) return;
    Alert.alert(
      'Delete recording?',
      'The transcript and notes will be permanently deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteLecture.mutate(lecture.id, {
              // Offline, the phone's copy is gone and the discard is
              // remembered for the next connection: that is a deletion,
              // not an error. It used to throw "Couldn't delete" over a
              // message saying it would be deleted.
              // Typed to accept the mutation's older void result too, so
              // the screen compiles either side of lib/lectures.ts landing.
              onSuccess: (result: { serverDone?: boolean } | void) => {
                router.back();
                if (result && result.serverDone === false) {
                  Alert.alert(
                    'Deleted on this phone',
                    'Semora will remove it from your account when you are online.',
                  );
                }
              },
              onError: (err) =>
                Alert.alert("Couldn't delete", (err as Error)?.message || 'Please try again.'),
            });
          },
        },
      ],
    );
  }, [lecture, deleteLecture, router]);

  if (!lecture) {
    // Only a fetch that came back empty is a confirmed 404. Pending, paused
    // offline and errored all mean "not known yet".
    const confirmedGone = Boolean(id) && !isPending && !isError && lecture === null;
    if (confirmedGone) {
      return (
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
          <View style={styles.center}>
            <Text style={[styles.missingText, { color: colors.ink2 }]}>
              This recording is no longer available.
            </Text>
          </View>
        </SafeAreaView>
      );
    }
    const fetching = fetchStatus === 'fetching';
    // First load on a working connection, nothing of it on this phone: the
    // plain spinner it always showed.
    if (fetching && !isError) {
      return (
        <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        </SafeAreaView>
      );
    }
    // The receipt the just-stopped recording deserves while the server
    // cannot be reached: what the phone holds, and that it is safe.
    const retry = () => {
      void refetch();
      void kickUploadQueue('lecture_retry');
    };
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} showsVerticalScrollIndicator={false}>
          <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            {fetching ? (
              <ActivityIndicator color={colors.brand} />
            ) : (
              <FontAwesome name={localProgress ? 'mobile' : 'wifi'} size={20} color={colors.brand} />
            )}
            <Text style={[styles.stateTitle, { color: colors.ink }]}>
              {localProgress ? 'Saved on this phone — waiting for a connection' : "Couldn't load this lecture"}
            </Text>
            {localProgress ? (
              <View style={styles.ladder}>
                {localProgress.total > 0 ? (
                  <View style={styles.ladderRow}>
                    <View style={styles.ladderIcon}>
                      <FontAwesome name="cloud-upload" size={15} color={colors.brand} />
                    </View>
                    <Text style={[styles.ladderLabel, { color: colors.ink }]}>Uploaded</Text>
                    <Text style={[styles.ladderDetail, { color: colors.ink2 }]}>
                      {`${localProgress.received} of ${localProgress.expected ?? localProgress.total} parts uploaded`}
                    </Text>
                  </View>
                ) : null}
                {localProgress.waiting > 0 ? (
                  <View style={styles.ladderRow}>
                    <View style={styles.ladderIcon}>
                      <FontAwesome name="mobile" size={16} color={colors.ink2} />
                    </View>
                    <Text style={[styles.ladderLabel, { color: colors.ink }]}>On this phone</Text>
                    <Text style={[styles.ladderDetail, { color: colors.ink2 }]}>{`${localProgress.waiting} parts waiting`}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <Text style={[styles.stateText, { color: colors.ink2 }]}>
              {localProgress
                ? 'Semora will upload it and write your notes when you are back online. Nothing is lost.'
                : 'Check your connection and try again.'}
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, { borderColor: colors.brand, paddingHorizontal: 16 }]}
              onPress={retry}
              disabled={fetching}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Retry"
            >
              <FontAwesome name="refresh" size={12} color={colors.brand} />
              <Text style={[styles.retryText, { color: colors.brand }]}>{fetching ? 'Checking…' : 'Retry'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // 'transcribed' with no notes is only busy while notes are actually coming.
  // Once the server has recorded NOTES_FAILED, or a 'generating' claim has gone
  // stale because the invocation died, this must fall through to the content
  // branch — that is where the transcript and the "Try again" button live.
  // A recording can die in 'uploading'/'transcribing' too, and unlike notes
  // generation nothing was watching for it: `busy` below treated those two
  // states as permanently in-flight, so a recording whose segments never
  // arrived showed a spinner and "Keep Semora open until this finishes"
  // forever. One was found stuck for over an hour with 0 segments and no
  // error code — the student simply never got their notes and had nothing to
  // tap. There is no transcribe_started_at claim stamp to read, but updated_at
  // moves on every segment and status change, so a row that has not been
  // touched in TRANSCRIBE_STALE_MS has nothing left working on it.
  const transcriptionStale = isLectureStalled(lecture, segmentProgress ? {
    total: segmentProgress.total, waiting: segmentProgress.waitingLocally, received: segmentProgress.uploaded,
    transcribed: segmentProgress.transcribed, needsAttention: segmentProgress.needsAttention,
    waitingForSignIn: segmentProgress.waitingForSignIn, expected: segmentProgress.expected,
    stopped: localProgress?.stopped ?? false,
  } : null);
  const tooShortForNotes = lecture.error_code === 'TOO_SHORT_FOR_NOTES' && !lecture.notes_md;

  const notesStale =
    lecture.status === 'generating' &&
    (!lecture.notes_started_at ||
      Date.now() - new Date(lecture.notes_started_at).getTime() > STALE_GENERATION_MS);
  const busy =
    lecture.status === 'recording' ||
    ((lecture.status === 'uploading' || lecture.status === 'transcribing') && !transcriptionStale) ||
    (lecture.status === 'generating' && !notesStale) ||
    (lecture.status === 'transcribed' && !lecture.notes_md &&
      lecture.error_code !== 'NOTES_FAILED' && lecture.error_code !== 'TOO_SHORT_FOR_NOTES');

  // A killed invocation leaves quiz_generating stuck true; without an expiry the
  // Quiz button is disabled with a spinner on it forever.
  const quizBusy =
    lecture.quiz_generating &&
    !!lecture.quiz_started_at &&
    Date.now() - new Date(lecture.quiz_started_at).getTime() < STALE_GENERATION_MS;

  // The phone's own journal outranks the server row: Stop pressed on bad
  // wifi leaves capture_state 'recording' until the heartbeat lands, and the
  // screen said "still being recorded" about a lecture the student had
  // just stopped.
  const stoppedHere = Boolean(localProgress?.stopped);
  const busyCopy =
    lecture.status === 'recording' && lecture.capture_state !== 'stopped' && !stoppedHere
      ? 'This lecture is still being recorded.'
      : lecture.status === 'uploading' || lecture.status === 'recording'
        ? 'Uploading your recording…'
        : lecture.status === 'transcribing'
          ? 'Transcribing the audio. This usually takes a minute or two.'
          : 'Writing your lecture notes…';

  const meta = [
    lecture.courses?.name,
    lecture.duration_seconds > 0 ? formatLectureDuration(lecture.duration_seconds) : null,
    new Date(lecture.created_at).toLocaleDateString(localeTag, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    }),
    // No letters, so nothing to translate.
    hasMarks ? `★ ${marks.length}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // The post-Stop receipt (item 5): what was recorded and where each part of
  // it is, from numbers this screen already polls. Document notes keep the
  // plain spinner — there is nothing to upload or transcribe.
  const isLiveRecording =
    isBeingRecordedHere || (lecture.status === 'recording' && lecture.capture_state !== 'stopped' && !stoppedHere);
  // Another device is still recording this lecture (its heartbeat is fresh).
  // Delete from here would pull the audio out from under that microphone.
  const recordingElsewhere =
    !isBeingRecordedHere && !stoppedHere &&
    (lecture.capture_state === 'recording' || lecture.capture_state === 'paused') &&
    Boolean(lecture.last_heartbeat_at) &&
    Date.now() - new Date(lecture.last_heartbeat_at as string).getTime() < OTHER_DEVICE_LIVE_MS;
  // Gap rows in the transcript: the missing parts are on this phone.
  const completeness = lectureCompleteness(lecture);
  const missingOnThisPhone =
    completeness.kind === 'missing' && completeness.recoverable && (segmentProgress?.waitingLocally ?? 0) > 0;
  type LadderState = 'done' | 'active' | 'pending' | 'unknown';
  const ladder: { label: string; state: LadderState; detail: string | null }[] =
    lecture.source === 'document' ? [] : (() => {
      const p = segmentProgress;
      const inFlight = lecture.status === 'recording' || lecture.status === 'uploading';
      const recorded: LadderState = isLiveRecording ? 'active' : lecture.duration_seconds > 0 ? 'done' : 'unknown';
      const onPhone: LadderState = !p ? 'unknown' : p.waitingLocally > 0 ? 'active' : 'done';
      // Never claim completeness while the phone's declaration is unknown
      // (expected === null): a part that never reached the server has no row.
      const uploadedDone = !!p && p.expected !== null && p.uploaded >= p.expected;
      const uploaded: LadderState = uploadedDone ? 'done' : inFlight || (p?.waitingLocally ?? 0) > 0 ? 'active' : 'pending';
      const transcribedDone = !!p && p.expected !== null && p.transcribed >= p.expected;
      const transcribed: LadderState = transcribedDone ? 'done' : lecture.status === 'transcribing' ? 'active' : 'pending';
      const notes: LadderState = lecture.status === 'transcribed' || lecture.status === 'generating' ? 'active' : 'pending';
      return [
        {
          label: 'Recorded',
          state: recorded,
          detail: isLiveRecording ? 'Still recording' : lecture.duration_seconds > 0 ? formatLectureDuration(lecture.duration_seconds) : null,
        },
        { label: 'On this phone', state: onPhone, detail: p && p.waitingLocally > 0 ? `${p.waitingLocally} parts waiting` : null },
        { label: 'Uploaded', state: uploaded, detail: p ? (p.expected === null ? `${p.uploaded} so far` : `${p.uploaded} of ${p.expected}`) : null },
        { label: 'Transcribed', state: transcribed, detail: p ? `${p.transcribed} of ${p.expected ?? p.total}` : null },
        { label: 'Notes', state: notes, detail: null },
      ];
    })();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        showsVerticalScrollIndicator={false}
      >
        {renaming ? (
          <View style={styles.renameRow}>
            <TextInput
              style={[styles.renameInput, { color: colors.ink, borderColor: colors.brand, backgroundColor: colors.card }]}
              value={titleDraft}
              onChangeText={setTitleDraft}
              autoFocus
              maxLength={120}
              returnKeyType="done"
              onSubmitEditing={saveTitle}
              accessibilityLabel="Lecture name"
            />
            <TouchableOpacity
              onPress={saveTitle}
              disabled={renameLecture.isPending}
              style={[styles.renameSave, { backgroundColor: colors.brand }]}
              accessibilityRole="button"
              accessibilityLabel="Save name"
            >
              {renameLecture.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.renameSaveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => {
              setTitleDraft(lecture.title);
              setRenaming(true);
            }}
            activeOpacity={0.7}
            style={styles.titleRow}
            accessibilityRole="button"
            accessibilityLabel="Rename this lecture"
          >
            <Text style={[styles.title, { color: colors.ink, flexShrink: 1 }]}>{lecture.title}</Text>
            <FontAwesome name="pencil" size={14} color={colors.ink3} style={{ marginTop: 10 }} />
          </TouchableOpacity>
        )}
        <Text style={[styles.meta, { color: colors.ink2 }]}>{meta}</Text>

        {/* Shown whether or not a course is attached. It used to appear only
            while unattached, which left a lecture filed against the wrong class
            just as stuck as one filed against none — and the recorder now
            preselects a course, so wrong-but-set is the likelier mistake. */}
        {(
          <TouchableOpacity
            style={[styles.attachRow, { borderColor: colors.line, backgroundColor: colors.card }]}
            onPress={() => setShowCoursePicker((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={
              lecture.courses?.name
                ? `Class: ${lecture.courses.name}. Change it.`
                : 'Attach this lecture to a course'
            }
          >
            <FontAwesome name="link" size={13} color={colors.brand} />
            <Text style={[styles.attachText, { color: colors.ink2 }]}>
              {lecture.courses?.name
                ? `Class: ${lecture.courses.name}`
                : 'Attach a course so the AI Tutor and flashcards can use this lecture'}
            </Text>
            <FontAwesome
              name={showCoursePicker ? 'chevron-up' : 'chevron-down'}
              size={11}
              color={colors.ink3}
            />
          </TouchableOpacity>
        )}
        {showCoursePicker && (
          <View style={styles.chipWrap}>
            {courses.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.line }]}
                onPress={() =>
                  attachCourse.mutate(c.id, {
                    onSuccess: () => setShowCoursePicker(false),
                    onError: (e) =>
                      Alert.alert("Couldn't attach", (e as Error)?.message || 'Please try again.'),
                  })
                }
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={c.name}
              >
                <Text style={[styles.chipText, { color: colors.ink2 }]} numberOfLines={1}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
            {/* course_id is nullable by design — a lecture for a class that is
                not in Semora. Now that the row stays visible once attached, the
                way back out has to exist too, or a mis-tap is permanent. */}
            {lecture.course_id ? (
              <TouchableOpacity
                style={[styles.chip, { backgroundColor: colors.card, borderColor: colors.line }]}
                onPress={() =>
                  attachCourse.mutate(null, {
                    onSuccess: () => setShowCoursePicker(false),
                    onError: (e) =>
                      Alert.alert("Couldn't detach", (e as Error)?.message || 'Please try again.'),
                  })
                }
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Remove from class"
              >
                <Text style={[styles.chipText, { color: colors.ink2 }]}>No class</Text>
              </TouchableOpacity>
            ) : null}
            {courses.length === 0 && (
              <Text style={[styles.hint, { color: colors.ink2 }]}>
                No courses in this semester yet.
              </Text>
            )}
          </View>
        )}

        {busy && lecture.source === 'document' ? (
          <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <ActivityIndicator color={colors.brand} />
            <Text style={[styles.stateTitle, { color: colors.ink }]}>Working on your lecture</Text>
            <Text style={[styles.stateText, { color: colors.ink2 }]}>
              {recovering ? 'Picking up where the upload left off…' : busyCopy}
            </Text>
          </View>
        ) : busy ? (
          <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            {/* A receipt, not a spinner. After Stop every recorder app shows a
                spinner and no number, and the losses students report are
                discovered hours later. The headline is what was recorded; the
                ladder is where it is now, row by row, from numbers this screen
                already polls. */}
            {lecture.duration_seconds > 0 && !isLiveRecording ? (
              <FontAwesome name="check-circle" size={18} color={colors.teal} />
            ) : (
              <ActivityIndicator color={colors.brand} />
            )}
            <Text style={[styles.stateTitle, { color: colors.ink }]}>
              {lecture.duration_seconds > 0 && !isLiveRecording
                ? `${formatLectureDuration(lecture.duration_seconds)} recorded`
                : 'Working on your lecture'}
            </Text>
            {hasMarks ? (
              <View style={[styles.markedChip, { backgroundColor: colors.amber50 }]}>
                <Text style={[styles.markedChipText, { color: colors.amberText }]}>{`★ ${marks.length} marked`}</Text>
              </View>
            ) : null}
            <Text style={[styles.stateText, { color: colors.ink2 }]}>
              {recovering ? 'Picking up where the upload left off…' : busyCopy}
            </Text>
            {/* "All N parts uploaded — safe to close the app" used to appear
                whenever every server row had moved off 'pending'. A part that
                never reached the server has no row, so a lecture missing half
                its audio said exactly that. Three separate facts now: what is
                still on this phone, what the phone declared, and what arrived.
                When the declaration is unknown, nothing claims completeness. */}
            <View style={styles.ladder}>
              {ladder.map((row) => (
                <View key={row.label} style={styles.ladderRow}>
                  <View style={styles.ladderIcon}>
                    {row.state === 'done' ? (
                      <FontAwesome name="check-circle" size={16} color={colors.teal} />
                    ) : row.state === 'active' ? (
                      <ActivityIndicator size="small" color={colors.brand} />
                    ) : row.state === 'pending' ? (
                      <FontAwesome name="circle-o" size={15} color={colors.ink3} />
                    ) : (
                      <FontAwesome name="minus" size={13} color={colors.ink3} />
                    )}
                  </View>
                  <Text style={[styles.ladderLabel, { color: colors.ink }]}>{row.label}</Text>
                  {row.detail ? (
                    <Text style={[styles.ladderDetail, { color: colors.ink2 }]}>{row.detail}</Text>
                  ) : null}
                </View>
              ))}
            </View>
            {segmentProgress && segmentProgress.waitingForSignIn > 0 && segmentProgress.needsAttention === 0 ? (
              <Text style={[styles.stateText, { color: colors.ink2 }]}>
                Sign in to finish uploading this recording. It is saved on this phone.
              </Text>
            ) : null}
            {segmentProgress && segmentProgress.needsAttention > 0 ? (
              <TouchableOpacity
                style={[styles.retryBtn, { borderColor: colors.brand, paddingHorizontal: 16 }]}
                onPress={retryMissingParts}
                disabled={recovering}
                accessibilityRole="button"
                accessibilityLabel="Try uploading again"
              >
                <FontAwesome name="refresh" size={12} color={colors.brand} />
                <Text style={[styles.retryText, { color: colors.brand }]}>
                  {recovering ? 'Trying…' : 'Try uploading again'}
                </Text>
              </TouchableOpacity>
            ) : segmentProgress && segmentProgress.waitingForSignIn > 0 ? (
              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: colors.brand, borderColor: colors.brand, paddingHorizontal: 16 }]}
                onPress={() => router.push('/(auth)/sign-in' as any)}
                accessibilityRole="button"
                accessibilityLabel="Sign in"
              >
                <FontAwesome name="user-circle-o" size={12} color="#fff" />
                <Text style={[styles.retryText, { color: '#fff' }]}>Sign in</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={[styles.stateText, { color: colors.ink2 }]}>
              You can leave this screen. Anything still on this phone uploads whenever Semora is open.
            </Text>
          </View>
        ) : transcriptionStale ? (
          <View style={[styles.stateCard, { backgroundColor: colors.coral50, borderColor: colors.coral }]}>
            <FontAwesome name="exclamation-circle" size={20} color={colors.coral} />
            <Text style={[styles.stateTitle, { color: colors.ink }]}>This recording is taking longer than usual</Text>
            <Text style={[styles.stateText, { color: colors.ink2 }]}>
              {(segmentProgress?.uploaded ?? 0) === 0
                ? "None of the audio has reached us yet. If it was recorded on another phone, open Semora on that phone to upload it. Your free lecture hasn't been used."
                : 'Some of the audio arrived and the rest hasn’t yet. If it is on another phone, open Semora there. Semora keeps checking for it.'}
            </Text>
            {/* One filled primary. The outlined "Delete this recording" that
                sat beside it put recovery and destruction at the same weight,
                and stalled cards have shown on lectures that did finish; the
                "Delete recording" link at the bottom of the screen remains. */}
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: colors.brand, borderColor: colors.brand, paddingHorizontal: 16 }]}
              onPress={retryMissingParts}
              disabled={recovering}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Check again"
            >
              <FontAwesome name="refresh" size={13} color="#fff" />
              <Text style={[styles.retryText, { color: '#fff' }]}>{recovering ? 'Checking…' : 'Check again'}</Text>
            </TouchableOpacity>
          </View>
        ) : lecture.status === 'failed' ? (
          <View style={[styles.stateCard, { backgroundColor: colors.coral50, borderColor: colors.coral }]}>
            <FontAwesome name="exclamation-circle" size={20} color={colors.coral} />
            <Text style={[styles.stateTitle, { color: colors.ink }]}>
              {lecture.error_code === 'NO_SPEECH'
                ? "Couldn't hear any speech"
                : "Couldn't finish this recording"}
            </Text>
            <Text style={[styles.stateText, { color: colors.ink2 }]}>
              {lecture.error_code === 'NO_SPEECH'
                ? "There was no audible speech in this recording, so there's nothing to transcribe. Your free lecture wasn't used."
                : 'Something went wrong processing this recording. Your free lecture was not used — please try recording again.'}
            </Text>
            {/* The one action a failed lecture has. No upload retry here:
                segment progress is not polled for 'failed', so there is
                nothing to retry from this screen. */}
            {canRecordLectures() ? (
              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: colors.coral, borderColor: colors.coral, paddingHorizontal: 16 }]}
                onPress={() =>
                  router.replace({
                    pathname: '/lecture/record',
                    params: lecture.course_id ? { courseId: lecture.course_id } : undefined,
                  } as any)
                }
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Record again"
              >
                <FontAwesome name="microphone" size={13} color="#fff" />
                <Text style={[styles.retryText, { color: '#fff' }]}>Record again</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <>
            {/* Study tools */}
            <View style={styles.toolsRow}>
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: colors.card, borderColor: colors.line }]}
                onPress={handleFlashcards}
                activeOpacity={0.8}
                // Generation now happens on this button rather than on the
                // screen it used to hand off to, so the wait belongs here too:
                // an unlabelled pause on a tap that used to navigate instantly
                // reads as a dead button and gets pressed again.
                disabled={generateCards.isPending}
                accessibilityRole="button"
                accessibilityState={{ busy: generateCards.isPending }}
                accessibilityLabel={
                  lecture.deck_id
                    ? 'Open the flashcards made from this lecture'
                    : 'Make flashcards from this lecture'
                }
              >
                {generateCards.isPending ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <FontAwesome name="clone" size={16} color={colors.brand} />
                )}
                <Text style={[styles.toolText, { color: colors.ink }]}>
                  {generateCards.isPending
                    ? 'Making…'
                    : lecture.deck_id ? 'Flashcards' : 'Make cards'}
                </Text>
                {!isPro && !generateCards.isPending && (
                  <Text style={[styles.proTag, { color: colors.brand, backgroundColor: colors.brand50 }]}>
                    PRO
                  </Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolBtn, { backgroundColor: colors.card, borderColor: colors.line }]}
                onPress={handleQuiz}
                activeOpacity={0.8}
                disabled={generateQuiz.isPending || quizBusy}
                accessibilityRole="button"
                accessibilityLabel={
                  lecture.quiz && lecture.quiz.length > 0
                    ? 'Take the quiz'
                    : 'Generate a quiz from this lecture'
                }
              >
                {generateQuiz.isPending || quizBusy ? (
                  <ActivityIndicator size="small" color={colors.teal} />
                ) : (
                  <FontAwesome name="check-square-o" size={16} color={colors.teal} />
                )}
                <Text style={[styles.toolText, { color: colors.ink }]}>
                  {generateQuiz.isPending || quizBusy
                    ? 'Building…'
                    : lecture.quiz && lecture.quiz.length > 0
                      ? 'Take quiz'
                      : 'Quiz me'}
                </Text>
                {!isPro && !(lecture.quiz && lecture.quiz.length > 0) && (
                  <Text style={[styles.proTag, { color: colors.brand, backgroundColor: colors.brand50 }]}>
                    PRO
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* The notes changed after the quiz was made from them. */}
            {lecture.quiz_stale && lecture.quiz && lecture.quiz.length > 0 && isPro ? (
              <TouchableOpacity
                style={[styles.attachRow, { borderColor: colors.line, backgroundColor: colors.card }]}
                onPress={() =>
                  generateQuiz.mutate(undefined, {
                    onSuccess: () => router.push({ pathname: '/lecture/quiz', params: { id: lecture.id } } as any),
                    onError: (err) => Alert.alert("Couldn't build a quiz", (err as LectureError)?.message || 'Please try again.'),
                  })
                }
                disabled={generateQuiz.isPending || quizBusy}
                accessibilityRole="button"
                accessibilityLabel="Update the quiz from the new notes"
              >
                <FontAwesome name="refresh" size={12} color={colors.brand} />
                <Text style={[styles.attachText, { color: colors.ink2 }]}>
                  {generateQuiz.isPending || quizBusy ? 'Building…' : 'Your notes were updated. Update the quiz to match.'}
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Starred moments: time is the join key. The audio is deleted by
                design, so the transcript paragraph is where a tap lands. */}
            {hasMarks ? (
              <View style={styles.starredWrap}>
                <Text style={[styles.starredHead, { color: colors.ink2 }]}>Starred moments</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.starredRow}>
                  {[...marks].sort((a, b) => a - b).map((m, i) => (
                    <TouchableOpacity
                      key={`${i}-${m}`}
                      style={[styles.starredChip, { backgroundColor: colors.amber50, borderColor: colors.amber }]}
                      onPress={() => {
                        setTranscriptFilter('all');
                        setShowTranscript(true);
                        setPendingMark(m);
                      }}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={`Starred moment at ${formatTimestamp(m)}`}
                    >
                      <Text style={[styles.starredChipText, { color: colors.amberText }]}>{`⭐ ${formatTimestamp(m)}`}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {/* Notes */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <View style={styles.cardHead}>
                <FontAwesome name="pencil-square-o" size={15} color={colors.brand} />
                <Text style={[styles.cardTitle, { color: colors.ink, flex: 1 }]}>Lecture notes</Text>
                {lecture.notes_md ? (
                  <TouchableOpacity
                    onPress={shareNotes}
                    hitSlop={10}
                    style={styles.shareBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Share these notes"
                  >
                    <FontAwesome name="share-square-o" size={15} color={colors.brand} />
                    <Text style={[styles.shareText, { color: colors.brand }]}>Share</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {/* Late parts arrived after these notes were written; the
                  scheduler rewrites them (migration 143), so "updating" is
                  true. Not a button — a rewrite cannot be asked for from here. */}
              {lecture.notes_md && lecture.notes_stale ? (
                <View style={styles.notesStatusRow}>
                  <ActivityIndicator size="small" color={colors.ink2} />
                  <Text style={[styles.notesStatusText, { color: colors.ink2 }]}>
                    Updating these notes with the parts that arrived late…
                  </Text>
                </View>
              ) : null}
              {/* The database has recorded the cut (notes_truncated) since the
                  12k limit landed; 13 of 20 note sets hit it and the page
                  simply ended. Informational: the fix is server-side. */}
              {lecture.notes_md && lecture.notes_truncated && !lecture.notes_stale ? (
                <View style={[styles.incomplete, { backgroundColor: colors.amber50, borderColor: colors.amber }]}>
                  <FontAwesome name="scissors" size={13} color={colors.amber} />
                  <Text style={[styles.incompleteText, { color: colors.ink2, flex: 1 }]}>
                    These notes stop partway through the lecture. The end of class, key terms and action items may be missing.
                  </Text>
                </View>
              ) : null}
              {/* Say so when they are built from part of the lecture. The
                  database has recorded this since migration 138 and nothing
                  read it, so a student whose lecture lost half its audio was
                  shown notes and sent a push calling them ready. */}
              {(() => {
                if (completeness.kind !== 'missing') return null;
                return (
                  <View style={[styles.incomplete, { backgroundColor: colors.amber50, borderColor: colors.amber }]}>
                    <FontAwesome name="exclamation-triangle" size={13} color={colors.amber} />
                    <View style={{ flex: 1, gap: 6 }}>
                      <Text style={[styles.incompleteText, { color: colors.ink2 }]}>
                        {completeness.parts === 1
                          ? 'These notes are incomplete. 1 part of this recording has not arrived.'
                          : `These notes are incomplete. ${completeness.parts} parts of this recording have not arrived.`}
                      </Text>
                      {completeness.recoverable && (segmentProgress?.waitingLocally ?? 0) > 0 ? (
                        <TouchableOpacity
                          onPress={retryMissingParts}
                          disabled={recovering}
                          accessibilityRole="button"
                          accessibilityLabel="Upload the missing parts again"
                        >
                          <Text style={[styles.incompleteAction, { color: colors.brand }]}>
                            {recovering ? 'Trying…' : 'Upload them now'}
                          </Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={[styles.incompleteText, { color: colors.ink2 }]}>
                          {completeness.recoverable
                            ? "The missing audio isn't on this phone. If it was recorded on another phone, open Semora there."
                            : 'The missing audio could not be recovered.'}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })()}
              {lecture.notes_md ? (
                <NotesBody
                  md={lecture.notes_md}
                  inkColor={colors.ink}
                  ink2Color={colors.ink2}
                  brandColor={colors.brand}
                  highlightColor={colors.amber50}
                />
              ) : tooShortForNotes ? (
                <Text style={[styles.stateText, { color: colors.ink2, textAlign: 'left' }]}>
                  This recording was too short to write notes from. Its transcript is below.
                </Text>
              ) : (
                <>
                  <Text style={[styles.stateText, { color: colors.ink2, textAlign: 'left' }]}>
                    The notes couldn’t be written this time. Your transcript is safe below.
                  </Text>
                  <TouchableOpacity
                    style={[styles.retryBtn, { borderColor: colors.brand }]}
                    onPress={() =>
                      retryNotes.mutate(undefined, {
                        onError: (e) =>
                          Alert.alert(
                            "Couldn't write notes",
                            (e as Error)?.message || 'Please try again.',
                          ),
                      })
                    }
                    disabled={retryNotes.isPending}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Try writing the notes again"
                  >
                    {retryNotes.isPending ? (
                      <ActivityIndicator size="small" color={colors.brand} />
                    ) : (
                      <FontAwesome name="refresh" size={12} color={colors.brand} />
                    )}
                    <Text style={[styles.retryText, { color: colors.brand }]}>Try again</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* 4.6: action items → tasks. Pre-fills Add Task; the student saves. */}
            {actionItems.length > 0 ? (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
                <View style={styles.cardHead}>
                  <FontAwesome name="calendar-check-o" size={15} color={colors.teal} />
                  <Text style={[styles.cardTitle, { color: colors.ink }]}>Add to your tasks</Text>
                </View>
                {actionItems.map((item, i) => (
                  <TouchableOpacity
                    key={`${i}-${item.text}`}
                    style={[styles.actionRow, i > 0 && { borderTopColor: colors.line, borderTopWidth: 0.5 }]}
                    onPress={() => addActionItemAsTask(item)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Add to tasks: ${item.text}`}
                  >
                    {/* Show the guess before the tap: the type and date were
                        already understood, and a wrong weekday is cheaper to
                        catch here than on the Add Task screen. */}
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={[styles.actionText, { color: colors.ink2 }]}>{item.text}</Text>
                      <Text style={[styles.actionMeta, { color: colors.ink2 }]}>
                        {item.dueDate
                          ? `${TASK_TYPE_LABELS[item.type]} · due ${dueLabel(item.dueDate)}`
                          : `${TASK_TYPE_LABELS[item.type]} · No date found — you'll pick one`}
                      </Text>
                    </View>
                    <FontAwesome name="plus-circle" size={20} color={item.dueDate ? colors.teal : colors.ink3} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}

            {/* Transcript, collapsed */}
            {!!lecture.transcript && (
              <>
                <TouchableOpacity
                  style={[styles.transcriptToggle, { borderColor: colors.line }]}
                  onPress={() => setShowTranscript((v) => !v)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={showTranscript ? 'Hide transcript' : 'Show transcript'}
                >
                  <FontAwesome name="file-text-o" size={14} color={colors.ink2} />
                  <Text style={[styles.transcriptToggleText, { color: colors.ink2 }]}>
                    {showTranscript ? 'Hide transcript' : 'Show transcript'}
                  </Text>
                  <FontAwesome
                    name={showTranscript ? 'chevron-up' : 'chevron-down'}
                    size={11}
                    color={colors.ink3}
                  />
                </TouchableOpacity>
                {showTranscript && (
                  <TranscriptCard
                    blocks={timeline.blocks}
                    hasTimings={timeline.hasTimings}
                    loading={timelineQuery.isLoading}
                    transcript={lecture.transcript}
                    filter={transcriptFilter}
                    showFilter={hasMarks && timeline.hasTimings}
                    onFilter={setTranscriptFilter}
                    recoverable={missingOnThisPhone}
                    recovering={recovering}
                    onRetry={retryMissingParts}
                    colors={colors}
                    onCardLayout={onCardLayout}
                    onInnerLayout={onInnerLayout}
                    onRowLayout={onRowLayout}
                  />
                )}
              </>
            )}
          </>
        )}

        {/* Privacy fact, stated plainly where it is relevant. */}
        {!!lecture.audio_deleted_at && (
          <View style={styles.privacyRow}>
            <FontAwesome name="lock" size={11} color={colors.ink2} />
            <Text style={[styles.privacyText, { color: colors.ink2 }]}>
              The audio was deleted once your transcript was ready. Only the text is stored.
            </Text>
          </View>
        )}

        {isBeingRecordedHere ? (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => router.navigate('/lecture/record' as any)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Return to the recording"
          >
            <FontAwesome name="microphone" size={14} color={colors.coral} />
            <Text style={[styles.deleteText, { color: colors.coral }]}>This lecture is being recorded. Return to the recording</Text>
          </TouchableOpacity>
        ) : recordingElsewhere ? (
          <View style={styles.deleteBtn} accessible accessibilityRole="text">
            <FontAwesome name="mobile" size={16} color={colors.ink2} />
            <Text style={[styles.deleteText, { color: colors.ink2 }]}>Recording on another device — stop it there first</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDelete}
            disabled={deleteLecture.isPending}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Delete recording"
          >
            <FontAwesome name="trash-o" size={14} color={colors.coral} />
            <Text style={[styles.deleteText, { color: colors.coral }]}>Delete recording</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    padding: 20,
    paddingBottom: 40,
    width: '100%',
    maxWidth: SCREEN_MAX_WIDTH,
    alignSelf: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  missingText: { fontSize: 15, textAlign: 'center' },
  title: { fontFamily: FONTS.displaySemibold, fontSize: 23, letterSpacing: -0.3, marginTop: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  renameInput: {
    flex: 1, fontFamily: FONTS.displaySemibold, fontSize: 18,
    borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9,
  },
  renameSave: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, minWidth: 64, alignItems: 'center' },
  renameSaveText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  shareText: { fontSize: 13, fontWeight: '700' },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  actionText: { fontSize: 14.5, lineHeight: 20 },
  actionMeta: { fontSize: 12.5, lineHeight: 17 },
  timelineRow: { flexDirection: 'row', gap: 10, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 4, marginHorizontal: -4 },
  timelineStamp: { minWidth: 62, fontSize: 12, fontWeight: '700', lineHeight: 20, fontVariant: ['tabular-nums'] },
  timelineGap: { fontSize: 12.5, fontWeight: '700', fontStyle: 'italic' },
  gapNote: { fontSize: 12 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  filterChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 6 },
  starredWrap: { marginTop: 12, gap: 6 },
  starredHead: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  starredRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  starredChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  starredChipText: { fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  // Post-Stop receipt: the ★ chip under the headline and the status ladder.
  markedChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  markedChipText: { fontSize: 11.5, fontWeight: '600' },
  ladder: { alignSelf: 'stretch', marginTop: 4 },
  ladderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'stretch', paddingVertical: 4 },
  ladderIcon: { width: 18, alignItems: 'center', justifyContent: 'center' },
  ladderLabel: { fontSize: 14.5, fontWeight: '600' },
  ladderDetail: { flex: 1, textAlign: 'right', fontSize: 13, fontVariant: ['tabular-nums'] },
  notesStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  notesStatusText: { fontSize: 12.5, flex: 1 },
  meta: { fontSize: 13, marginTop: 4 },
  attachRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 12,
    borderWidth: 0.5,
    padding: 11,
    marginTop: 14,
  },
  attachText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  hint: { fontSize: 12.5, lineHeight: 18 },
  stateCard: {
    borderRadius: 18,
    borderWidth: 0.5,
    alignItems: 'center',
    padding: 24,
    marginTop: 16,
    gap: 9,
  },
  stateTitle: { fontFamily: FONTS.displaySemibold, fontSize: 16, textAlign: 'center' },
  stateText: { fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
  toolsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  toolBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 0.5,
    paddingVertical: 13,
  },
  toolText: { fontSize: 13.5, fontWeight: '600' },
  proTag: {
    fontSize: 9.5,
    fontWeight: '800',
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  card: { borderRadius: 18, borderWidth: 0.5, padding: 16, marginTop: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  // ink2, not ink3: ink3 is 3.37:1 and fails WCAG AA at this size, and this is
  // the one line on the screen a student must not miss.
  incomplete: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 9,
    borderRadius: 12, borderWidth: 1, padding: 11, marginBottom: 12,
  },
  incompleteText: { fontSize: 13.5, lineHeight: 19 },
  incompleteAction: { fontSize: 13.5, fontWeight: '700' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 10,
    marginTop: 12,
  },
  retryText: { fontSize: 13.5, fontWeight: '700' },
  transcriptToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 0.5,
    paddingVertical: 11,
    marginTop: 12,
  },
  transcriptToggleText: { fontSize: 13.5, fontWeight: '600' },
  transcriptText: { fontSize: 13.5, lineHeight: 20 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8, maxWidth: '100%' },
  chipText: { fontSize: 13.5, fontWeight: '600' },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 18,
    paddingHorizontal: 4,
  },
  privacyText: { flex: 1, fontSize: 11.5, lineHeight: 16 },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 14,
    marginTop: 12,
  },
  deleteText: { fontSize: 13.5, fontWeight: '600' },
});
