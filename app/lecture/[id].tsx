import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Alert, Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useProUpsell } from '@/components/ProUpsellHost';
import { useI18n } from '@/lib/i18n';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { useGenerateFlashcards } from '@/lib/flashcards';
import { useCourses } from '@/lib/queries';
import { track } from '@/lib/analytics';
import {
  formatLectureDuration,
  retryPendingUploads,
  generateLectureNotes,
  lectureKeys,
  retryPendingSegments,
  useAttachLectureCourse,
  useSetLectureDeck,
  useDeleteLecture,
  useGenerateLectureQuiz,
  useLecture,
  useRetryLectureNotes,
  type LectureError,
  isLectureStalled,
  useLectureSegmentProgress,
} from '@/lib/lectures';

// One lecture: what the recording became.
//
// This screen also owns two recovery paths, because there is no server-side
// queue and nothing else will notice:
//   1. once a transcript exists, it asks for the notes (idempotent server-side);
//   2. if segments were left un-transcribed by a killed app or a dropped
//      connection, it retries them.
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
}: {
  md: string;
  inkColor: string;
  ink2Color: string;
  brandColor: string;
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
            <View key={i} style={[nb.bulletRow, line.startsWith('  ') && nb.bulletIndent]}>
              <Text style={[nb.bulletDot, { color: brandColor }]}>•</Text>
              <Text style={[nb.bulletText, { color: ink2Color }]}>
                <InlineText text={trimmed.slice(2)} />
              </Text>
            </View>
          );
        }
        if (!trimmed) return null;
        return (
          <Text key={i} style={[nb.paragraph, { color: ink2Color }]}>
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

  const { data: lecture, isLoading } = useLecture(id);
  // Declared here, with the other hooks, and NOT beside the render branch that
  // uses it: there is an early return for the not-found case further down, and
  // a hook after it runs on some renders and not others — which React throws
  // on and TypeScript cannot see. `lecture` is optional-chained for the same
  // reason: at this point it may not have loaded yet.
  const { data: segmentProgress } = useLectureSegmentProgress(
    id,
    lecture?.status === 'uploading' || lecture?.status === 'transcribing',
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

  // Ask for the notes as soon as a transcript lands. Idempotent server-side, so
  // a duplicate request from a re-render returns the cached notes for free.
  useEffect(() => {
    if (!lecture || !id) return;
    if (lecture.status !== 'transcribed' || lecture.notes_md) return;
    if (notesRequestedRef.current) return;
    notesRequestedRef.current = true;
    generateLectureNotes(id)
      .then(() => {
        track('lecture_notes_generated', { screen: 'lecture_detail' });
        qc.invalidateQueries({ queryKey: lectureKeys.detail(id) });
      })
      .catch(() => {
        // The guard stays LATCHED. Re-arming it here turned a failing notes call
        // into an unbounded retry loop: the server resets the row to
        // 'transcribed' on failure, the 4-second poll re-delivers that status,
        // and the effect fires again — billing another model call every time.
        // The explicit "Try again" button below is the only retry path.
        qc.invalidateQueries({ queryKey: lectureKeys.detail(id) });
      });
  }, [lecture?.status, lecture?.notes_md, id, qc]);

  // Finish any segment left stranded by a killed app or a dropped connection.
  useEffect(() => {
    if (!lecture || !id) return;
    if (lecture.status !== 'uploading' && lecture.status !== 'transcribing') return;
    if (resumeAttemptedRef.current) return;
    resumeAttemptedRef.current = true;
    setRecovering(true);
    // Uploads first, then transcription: a segment whose bytes never arrived
    // cannot be transcribed, and the server will not assemble a transcript
    // while any segment is unfinished.
    retryPendingUploads(id)
      .then(() => retryPendingSegments(id))
      .catch(() => {})
      .finally(() => {
        setRecovering(false);
        qc.invalidateQueries({ queryKey: lectureKeys.detail(id) });
      });
  }, [lecture?.status, id, qc]);

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
      { courseId: lecture.course_id, deckTitle: lecture.title || 'Lecture' },
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
              onSuccess: () => router.back(),
              onError: (err) =>
                Alert.alert("Couldn't delete", (err as Error)?.message || 'Please try again.'),
            });
          },
        },
      ],
    );
  }, [lecture, deleteLecture, router]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (!lecture) {
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
  const transcriptionStale = isLectureStalled(lecture);

  const notesStale =
    lecture.status === 'generating' &&
    (!lecture.notes_started_at ||
      Date.now() - new Date(lecture.notes_started_at).getTime() > STALE_GENERATION_MS);
  const busy =
    lecture.status === 'recording' ||
    ((lecture.status === 'uploading' || lecture.status === 'transcribing') && !transcriptionStale) ||
    (lecture.status === 'generating' && !notesStale) ||
    (lecture.status === 'transcribed' && !lecture.notes_md &&
      lecture.error_code !== 'NOTES_FAILED');

  // A killed invocation leaves quiz_generating stuck true; without an expiry the
  // Quiz button is disabled with a spinner on it forever.
  const quizBusy =
    lecture.quiz_generating &&
    !!lecture.quiz_started_at &&
    Date.now() - new Date(lecture.quiz_started_at).getTime() < STALE_GENERATION_MS;

  const busyCopy =
    lecture.status === 'uploading' || lecture.status === 'recording'
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
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.ink }]}>{lecture.title}</Text>
        <Text style={[styles.meta, { color: colors.ink3 }]}>{meta}</Text>

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
                <Text style={[styles.chipText, { color: colors.ink3 }]}>No class</Text>
              </TouchableOpacity>
            ) : null}
            {courses.length === 0 && (
              <Text style={[styles.hint, { color: colors.ink3 }]}>
                No courses in this semester yet.
              </Text>
            )}
          </View>
        )}

        {busy ? (
          <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <ActivityIndicator color={colors.brand} />
            <Text style={[styles.stateTitle, { color: colors.ink }]}>Working on your lecture</Text>
            <Text style={[styles.stateText, { color: colors.ink2 }]}>
              {recovering ? 'Picking up where the upload left off…' : busyCopy}
            </Text>
            {/* The number, not just the spinner. A student packing up after
                class needs to know whether the audio is still leaving the
                phone: "9 of 10 parts uploaded" means stay on the wifi one more
                minute, and an identical spinner never said that. */}
            {segmentProgress && segmentProgress.total > 0 ? (
              <Text style={[styles.stateText, { color: colors.ink3 }]}>
                {segmentProgress.uploaded < segmentProgress.total
                  ? `${segmentProgress.uploaded} of ${segmentProgress.total} parts uploaded — stay connected until this finishes`
                  : `All ${segmentProgress.total} parts uploaded — safe to close the app`}
              </Text>
            ) : null}
            <Text style={[styles.stateText, { color: colors.ink3 }]}>
              Keep Semora open until this finishes.
            </Text>
          </View>
        ) : transcriptionStale ? (
          <View style={[styles.stateCard, { backgroundColor: colors.coral50, borderColor: colors.coral }]}>
            <FontAwesome name="exclamation-circle" size={20} color={colors.coral} />
            <Text style={[styles.stateTitle, { color: colors.ink }]}>This recording didn{'\u2019'}t finish</Text>
            <Text style={[styles.stateText, { color: colors.ink2 }]}>
              {lecture.segment_count === 0
                ? "None of the audio reached us, so there's nothing to transcribe — this usually means the recording was interrupted or the connection dropped before it could upload. Your free lecture wasn't used."
                : "The audio stopped uploading part way through and processing has stalled. Your free lecture wasn't used."}
            </Text>
            <TouchableOpacity
              style={[styles.retryBtn, { borderColor: colors.coral }]}
              onPress={handleDelete}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <FontAwesome name="trash-o" size={13} color={colors.coral} />
              <Text style={[styles.retryText, { color: colors.coral }]}>Delete this recording</Text>
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

            {/* Notes */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <View style={styles.cardHead}>
                <FontAwesome name="pencil-square-o" size={15} color={colors.brand} />
                <Text style={[styles.cardTitle, { color: colors.ink }]}>Lecture notes</Text>
              </View>
              {lecture.notes_md ? (
                <NotesBody
                  md={lecture.notes_md}
                  inkColor={colors.ink}
                  ink2Color={colors.ink2}
                  brandColor={colors.brand}
                />
              ) : (
                <>
                  <Text style={[styles.stateText, { color: colors.ink3, textAlign: 'left' }]}>
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
                  <View
                    style={[
                      styles.card,
                      { backgroundColor: colors.card, borderColor: colors.line, marginTop: 8 },
                    ]}
                  >
                    <Text style={[styles.transcriptText, { color: colors.ink2 }]}>
                      {lecture.transcript}
                    </Text>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {/* Privacy fact, stated plainly where it is relevant. */}
        {!!lecture.audio_deleted_at && (
          <View style={styles.privacyRow}>
            <FontAwesome name="lock" size={11} color={colors.ink3} />
            <Text style={[styles.privacyText, { color: colors.ink3 }]}>
              The audio was deleted once your transcript was ready. Only the text is stored.
            </Text>
          </View>
        )}

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
