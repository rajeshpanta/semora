import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Animated, FlatList, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, TextInput, TouchableOpacity } from '@/components/LocalizedReactNative';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useResponsive } from '@/lib/responsive';
import {
  formatLectureDuration,
  isLectureInFlight,
  useLectures,
  useLectureTranscriptSearch,
  type LectureWithCourse,
  isLectureStalled,
  useAppIsActive,
} from '@/lib/lectures';
import { canRecordLectures } from '@/lib/lectureSessionRuntime';
import { getLectureLocalProgress, subscribeUploadQueue } from '@/lib/lectureUploadQueue';
import { foldLecture, foldedMatches, searchWords } from '@/lib/lectureSearch';

// All recordings, newest first.

type FontAwesomeName = React.ComponentProps<typeof FontAwesome>['name'];

/**
 * The status pill's tones say whether anything is actually working:
 * 'live' — audio is being captured right now (coral, pulsing dot, no spinner);
 * 'busy' — the server is working on it (spinner);
 * 'waiting' — nothing can happen until the phone is online, signed in, or the
 *   audio arrives (no spinner: a spinner here promised progress that could not
 *   come);
 * 'warn' — finished, but with a gap; 'bad' — failed; 'ok' — notes landed since
 *   the list was last left.
 */
type StatusTone = 'live' | 'busy' | 'waiting' | 'warn' | 'bad' | 'ok';
interface RowStatus { text: string; tone: StatusTone; icon?: FontAwesomeName }

/** Ids of lectures whose notes this phone has already shown, JSON string[]. */
const SEEN_KEY = 'semora_lectures_seen_with_notes';
const SEEN_MAX = 500;

/** `seen` is null until the phone's record has loaded — no "Notes ready" until then. */
function statusLabel(lecture: LectureWithCourse, seen: Set<string> | null): RowStatus | null {
  const local = getLectureLocalProgress(lecture.id);
  if (local && local.waitingForSignIn > 0) return { text: 'Sign in to upload', tone: 'waiting', icon: 'user' };
  if (local && local.waiting > 0) return { text: 'Saved on phone', tone: 'waiting', icon: 'mobile' };
  const notesReady = (): RowStatus | null => {
    // "Missing parts", not "Incomplete": the shared 'Incomplete' key reads
    // "Pendiente" in Spanish, and this lecture is final, not pending.
    if ((lecture.parts_missing ?? 0) > 0) return { text: 'Missing parts', tone: 'warn', icon: 'exclamation-triangle' };
    if (lecture.notes_md && seen && !seen.has(lecture.id)) return { text: 'Notes ready', tone: 'ok', icon: 'check' };
    return null;
  };
  switch (lecture.status) {
    case 'recording':
      return lecture.capture_state === 'stopped'
        ? { text: 'Uploading', tone: 'busy' }
        : { text: 'Recording', tone: 'live' };
    case 'uploading':
    case 'transcribing':
      return isLectureStalled(lecture, local)
        ? { text: 'Waiting for audio', tone: 'waiting', icon: 'clock-o' }
        : { text: lecture.status === 'uploading' ? 'Uploading' : 'Transcribing', tone: 'busy' };
    case 'transcribed':
      // Notes already exist and are only being refreshed: nothing to wait for.
      if (lecture.notes_md) return notesReady();
      return lecture.error_code === 'NOTES_FAILED' ? { text: 'Notes failed', tone: 'bad' } : { text: 'Writing notes', tone: 'busy' };
    case 'generating':
      return { text: 'Writing notes', tone: 'busy' };
    case 'failed':
      return { text: 'Failed', tone: 'bad' };
    default:
      return notesReady();
  }
}

// One pulse for every live row: a module value, so rows that scroll in and
// out share it. Reference-counted — the loop runs only while at least one
// live row is mounted. It used to start once and run for the rest of the
// session, a native display-link animation driving a value no view was
// attached to after the lecture finished or the student left Notes.
const livePulse = new Animated.Value(1);
let livePulseRows = 0;
let livePulseLoop: Animated.CompositeAnimation | null = null;
function retainLivePulse() {
  livePulseRows += 1;
  if (livePulseRows !== 1) return;
  // On web this would be a 60 fps JavaScript timer for as long as a row shows.
  if (Platform.OS === 'web') return;
  livePulseLoop = Animated.loop(
    Animated.sequence([
      Animated.timing(livePulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      Animated.timing(livePulse, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]),
  );
  livePulseLoop.start();
}
function releaseLivePulse() {
  livePulseRows = Math.max(0, livePulseRows - 1);
  if (livePulseRows !== 0) return;
  livePulseLoop?.stop();
  livePulseLoop = null;
  livePulse.setValue(1);
}

const noop = () => 0;
function RowGap() {
  return <View style={{ height: 8 }} />;
}
function LectureRow({ lecture, seen }: { lecture: LectureWithCourse; seen: Set<string> | null }) {
  const colors = useColors();
  const router = useRouter();
  const { localeTag } = useI18n();
  // Re-rendered when the phone's own upload progress changes, so "Saved on
  // phone" becomes "Uploading" the moment it is true, not on the next refetch.
  useSyncExternalStore(subscribeUploadQueue, () => getLectureLocalProgress(lecture.id)?.waiting ?? -1, noop);
  const status = statusLabel(lecture, seen);
  const tone = status?.tone ?? null;
  useEffect(() => {
    if (tone !== 'live') return;
    retainLivePulse();
    return releaseLivePulse;
  }, [tone]);
  // The tone colour on the dot, spinner and icon; the darker `*Text` token on
  // the words. Coral on coral50 and amber on amber50 were ~3.3:1 in light mode
  // at this 11.5px — under AA — and these pills say which lecture is still
  // recording, which failed and which is waiting for its audio.
  const pillColor = tone === 'live' || tone === 'bad' ? colors.coral : tone === 'ok' ? colors.teal : colors.amber;
  const pillText = tone === 'live' || tone === 'bad' ? colors.coralText : tone === 'ok' ? colors.teal : colors.amberText;
  const pillBackground = tone === 'live' || tone === 'bad' ? colors.coral50 : tone === 'ok' ? colors.teal50 : colors.amber50;

  const meta = [
    lecture.courses?.name,
    lecture.duration_seconds > 0 ? formatLectureDuration(lecture.duration_seconds) : null,
    new Date(lecture.created_at).toLocaleDateString(localeTag, { month: 'short', day: 'numeric' }),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TouchableOpacity
      style={[styles.row, { backgroundColor: colors.card, borderColor: colors.line }]}
      activeOpacity={0.7}
      onPress={() => router.push(`/lecture/${lecture.id}` as any)}
      accessibilityRole="button"
      // An explicit label REPLACES the accessible names of everything inside,
      // so the title alone would hide the course, the duration and — worse —
      // the processing status from VoiceOver entirely.
      accessibilityLabel={[lecture.title, meta, status?.text].filter(Boolean).join(', ')}
      accessibilityState={{ busy: status?.tone === 'busy' }}
    >
      <View style={[styles.rowIcon, { backgroundColor: colors.coral50 }]}>
        <FontAwesome name="microphone" size={16} color={colors.coral} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.ink }]} numberOfLines={1}>
          {lecture.title}
        </Text>
        <Text style={[styles.rowMeta, { color: colors.ink2 }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {status ? (
        <View style={[styles.statusPill, { backgroundColor: pillBackground }]}>
          {status.tone === 'live' ? (
            <Animated.View style={[styles.pillDot, { backgroundColor: pillColor, opacity: livePulse }]} />
          ) : status.tone === 'busy' ? (
            <ActivityIndicator size="small" color={pillColor} style={styles.pillSpinner} />
          ) : status.icon ? (
            <FontAwesome name={status.icon} size={11} color={pillColor} />
          ) : null}
          <Text style={[styles.statusText, { color: pillText }]}>{status.text}</Text>
        </View>
      ) : (
        <FontAwesome name="chevron-right" size={12} color={colors.ink3} />
      )}
    </TouchableOpacity>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const colors = useColors();
  return (
    <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <FontAwesome name="search" size={14} color={colors.ink3} />
      <TextInput
        style={[styles.searchInput, { color: colors.ink }]}
        value={value}
        onChangeText={onChange}
        placeholder="Search your notes and lectures"
        placeholderTextColor={colors.ink3}
        returnKeyType="search"
        autoCorrect={false}
        clearButtonMode="while-editing"
        accessibilityLabel="Search your notes and lectures"
      />
    </View>
  );
}

export default function LecturesScreen() {
  const colors = useColors();
  const { t } = useI18n();
  const router = useRouter();
  const { contentMaxWidth } = useResponsive();
  // Optional course scope: /lecture?courseId=<id> narrows the list to one
  // class, which is how the course screen reaches the lectures recorded for
  // it. Filtered client-side rather than in a second query — useLectures is
  // already cached and a student's lecture count is small.
  const { courseId: scopeCourseId, courseName: scopeCourseNameParam } =
    useLocalSearchParams<{ courseId?: string; courseName?: string }>();
  const { data: allLectures = [], isLoading, refetch, isRefetching } = useLectures();
  const scoped = scopeCourseId
    ? allLectures.filter((l) => l.course_id === scopeCourseId)
    : allLectures;
  // 4.10: search names, classes and notes here (folded once per lecture, not
  // per keystroke), and transcripts on the server after a short pause.
  const [query, setQuery] = useState('');
  const [settledQuery, setSettledQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSettledQuery(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  // From the second lecture: a student with three 90-minute lectures wanting
  // to find where one idea was explained had no search box at all.
  const searchable = scoped.length >= 2;
  const folded = useMemo(() => new Map(scoped.map((l) => [l.id, foldLecture(l)])), [scoped]);
  const { data: transcriptHits, isFetching: searchingTranscripts, isPlaceholderData: staleHits } = useLectureTranscriptSearch(settledQuery, searchable);
  const lectures = useMemo(() => {
    const words = searchWords(settledQuery);
    if (!searchable || !words.length) return scoped;
    // Hits kept on screen from the previous query are not this query's matches.
    const hits = new Set(staleHits ? [] : transcriptHits ?? []);
    return scoped.filter((l) => hits.has(l.id) || foldedMatches(folded.get(l.id) ?? '', words));
  }, [scoped, searchable, settledQuery, transcriptHits, staleHits, folded]);
  // "Notes ready" on rows whose notes landed since the list was last left.
  // The record of what this phone has shown lives on the phone; it is read
  // once, and written on blur so the pill stays for the whole visit and is
  // gone the next time. null until read: no pill is better than every row
  // claiming to be new for a moment.
  const [seen, setSeen] = useState<Set<string> | null>(null);
  // null until the list has actually loaded: leaving the tab during a cold
  // start used to write an empty record, and every lecture read as new after.
  const allLecturesRef = useRef<LectureWithCourse[] | null>(null);
  allLecturesRef.current = isLoading ? null : allLectures;
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SEEN_KEY)
      .then((raw) => {
        // No record yet (first visit since this shipped): nothing is "new"
        // until the list has been left once.
        if (cancelled || raw === null) return;
        const ids = JSON.parse(raw) as unknown;
        setSeen(new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []));
      })
      .catch(() => {
        // Unreadable record: treated like none, written fresh on blur.
      });
    return () => { cancelled = true; };
  }, []);
  useFocusEffect(
    useCallback(() => () => {
      if (!allLecturesRef.current) return;
      const ids = allLecturesRef.current.filter((l) => l.notes_md).map((l) => l.id).slice(0, SEEN_MAX);
      setSeen(new Set(ids));
      AsyncStorage.setItem(SEEN_KEY, JSON.stringify(ids)).catch(() => {});
    }, []),
  );
  const renderRow = useCallback(
    ({ item }: { item: LectureWithCourse }) => <LectureRow lecture={item} seen={seen} />,
    [seen],
  );
  const keyFor = useCallback((item: LectureWithCourse) => item.id, []);
  // Prefer the name the caller passed: deriving it from the lectures themselves
  // fails in exactly the case where the label matters most — a class with no
  // recordings yet, where the list would otherwise look empty for no stated
  // reason. The derived name is the fallback for a link that omits it.
  const scopeCourseName = scopeCourseId
    ? scopeCourseNameParam
      ?? allLectures.find((l) => l.course_id === scopeCourseId)?.courses?.name
    : undefined;

  // Stalled rows keep an in-flight STATUS forever, so asking about status
  // alone left this list promising "Keep Semora open while a lecture finishes
  // processing" about a recording that stopped hours ago. Same rule the detail
  // screen and the poller use.
  const anyInFlight = allLectures.some(
    (l) => isLectureInFlight(l.status) && !isLectureStalled(l, getLectureLocalProgress(l.id)),
  );
  // Keep the list honest while something is still working, slowly — and only
  // while this list is the screen on top and the app is on screen. The
  // recorder sits on top of it for a whole class, often on a locked phone, and
  // each refetch downloads every lecture's notes. Realtime invalidation covers
  // the time away.
  const isFocused = useIsFocused();
  const appActive = useAppIsActive();
  useEffect(() => {
    if (!anyInFlight || !isFocused || !appActive) return;
    const timer = setInterval(() => { void refetch(); }, 15_000);
    return () => clearInterval(timer);
  }, [anyInFlight, isFocused, appActive, refetch]);

  // Record · Upload first, above the search box: the list grows every week,
  // and the button used to sit after its last row.
  const newRow = scoped.length === 0 ? null : (
    <View style={styles.newRow}>
      {canRecordLectures() && (
        <TouchableOpacity
          style={[styles.newBtn, { borderColor: colors.coral }]}
          activeOpacity={0.8}
          onPress={() =>
            router.push({
              pathname: '/lecture/record',
              params: scopeCourseId ? { courseId: scopeCourseId } : undefined,
            } as any)
          }
          accessibilityRole="button"
          accessibilityLabel="Record a new lecture"
        >
          <FontAwesome name="microphone" size={13} color={colors.coral} />
          <Text style={[styles.newBtnText, { color: colors.coral }]}>Record</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.newBtn, { borderColor: colors.brand }]}
        activeOpacity={0.8}
        onPress={() =>
          router.push({
            pathname: '/lecture/new',
            params: scopeCourseId ? { courseId: scopeCourseId } : undefined,
          } as any)
        }
        accessibilityRole="button"
        accessibilityLabel="Upload a file"
      >
        <FontAwesome name="cloud-upload" size={13} color={colors.brand} />
        <Text style={[styles.newBtnText, { color: colors.brand }]}>Upload</Text>
      </TouchableOpacity>
    </View>
  );
  const header = (
    <>
      {newRow}
      {scopeCourseName ? (
        <Text style={[styles.scopeLabel, { color: colors.ink2 }]}>{`Notes for ${scopeCourseName}`}</Text>
      ) : null}
      {searchable && <SearchBox value={query} onChange={setQuery} />}
      {anyInFlight && (
        <Text style={[styles.hint, { color: colors.ink2 }]}>
          A lecture is still processing. You can leave — it finishes on its own.
        </Text>
      )}
      {lectures.length === 0 && scoped.length > 0 && searchingTranscripts ? (
        // Transcript hits are still on their way: "No lectures match" here
        // flashed before the lectures that do match arrived.
        <View style={styles.searching}>
          <ActivityIndicator color={colors.brand} accessibilityLabel={t('Searching transcripts')} />
        </View>
      ) : lectures.length === 0 && scoped.length > 0 ? (
        <Text style={[styles.hint, { color: colors.ink2, textAlign: 'center', marginTop: 24 }]}>
          No lectures match your search.
        </Text>
      ) : null}
    </>
  );

  // A list, not a ScrollView of every row: a term of lectures renders only
  // the rows on screen.
  if (!isLoading && scoped.length > 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <FlatList
          data={lectures}
          renderItem={renderRow}
          keyExtractor={keyFor}
          ItemSeparatorComponent={RowGap}
          ListHeaderComponent={header}
          contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
          style={styles.safe}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={7}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.brand} />
          }
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.brand} />
        }
      >
        {scopeCourseName ? (
          <Text style={[styles.scopeLabel, { color: colors.ink2 }]}>{`Notes for ${scopeCourseName}`}</Text>
        ) : null}

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : lectures.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.coral50 }]}>
              <FontAwesome name="microphone" size={26} color={colors.coral} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>
              {scopeCourseId ? 'No notes for this class yet' : 'Make your first notes'}
            </Text>
            <Text style={[styles.emptyText, { color: colors.ink2 }]}>
              Record a class, or upload slides, a chapter or a photo of the board. Semora writes
              the notes and can turn them into flashcards and practice quizzes.
            </Text>
            {canRecordLectures() && (
              <TouchableOpacity
                style={[styles.emptyBtn, { backgroundColor: colors.coral }]}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/lecture/record',
                    params: scopeCourseId ? { courseId: scopeCourseId } : undefined,
                  } as any)
                }
                accessibilityRole="button"
                accessibilityLabel="Record a lecture"
              >
                <FontAwesome name="microphone" size={15} color="#fff" />
                <Text style={styles.emptyBtnText}>Record a lecture</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.emptyBtnAlt, { borderColor: colors.brand }]}
              activeOpacity={0.85}
              onPress={() =>
                router.push({
                  pathname: '/lecture/new',
                  params: scopeCourseId ? { courseId: scopeCourseId } : undefined,
                } as any)
              }
              accessibilityRole="button"
              accessibilityLabel="Upload a file"
            >
              <FontAwesome name="cloud-upload" size={15} color={colors.brand} />
              <Text style={[styles.emptyBtnText, { color: colors.brand }]}>Upload a file</Text>
            </TouchableOpacity>
          </View>
        ) : null}
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
  loading: { paddingTop: 60, alignItems: 'center' },
  searching: { paddingTop: 24, alignItems: 'center' },
  hint: { fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 9,
    borderRadius: 12, borderWidth: 0.5, paddingHorizontal: 12, marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
  list: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 0.5,
    padding: 14,
  },
  rowIcon: { width: 38, height: 38, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 14.5, fontWeight: '600' },
  rowMeta: { fontSize: 12.5, marginTop: 2 },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  pillSpinner: { transform: [{ scale: 0.7 }] },
  pillDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 11.5, fontWeight: '600' },
  scopeLabel: { fontSize: 13, fontWeight: '600', marginBottom: 10, paddingHorizontal: 2 },
  empty: { alignItems: 'center', paddingTop: 70, paddingHorizontal: 18 },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  emptyTitle: { fontFamily: FONTS.displaySemibold, fontSize: 21, marginTop: 18, textAlign: 'center' },
  emptyText: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 16,
    paddingHorizontal: 22,
    paddingVertical: 14,
    marginTop: 22,
  },
  emptyBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  // The secondary way in. Outlined rather than filled so the two buttons read
  // as a choice with a recommendation, not two equal shouts — except on web,
  // where recording does not exist and this is the only button on screen.
  emptyBtnAlt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingHorizontal: 22,
    paddingVertical: 13,
    marginTop: 12,
  },
  newRow: { flexDirection: 'row', gap: 10, marginTop: 0, marginBottom: 12 },
  newBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 13,
  },
  newBtnText: { fontSize: 14.5, fontWeight: '700' },
});
