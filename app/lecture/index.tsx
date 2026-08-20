import React from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useResponsive } from '@/lib/responsive';
import {
  formatLectureDuration,
  isLectureInFlight,
  useLectures,
  type LectureWithCourse,
  isLectureStalled,
} from '@/lib/lectures';

// All recordings, newest first.

function statusLabel(lecture: LectureWithCourse): { text: string; tone: 'busy' | 'bad' | 'ok' } | null {
  switch (lecture.status) {
    case 'recording':
    case 'uploading':
      return { text: 'Uploading', tone: 'busy' };
    case 'transcribing':
      return { text: 'Transcribing', tone: 'busy' };
    case 'transcribed':
    case 'generating':
      return { text: 'Writing notes', tone: 'busy' };
    case 'failed':
      return { text: 'Failed', tone: 'bad' };
    default:
      return null;
  }
}

function LectureRow({ lecture }: { lecture: LectureWithCourse }) {
  const colors = useColors();
  const router = useRouter();
  const { localeTag } = useI18n();
  const status = statusLabel(lecture);

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
        <Text style={[styles.rowMeta, { color: colors.ink3 }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {status ? (
        <View
          style={[
            styles.statusPill,
            { backgroundColor: status.tone === 'bad' ? colors.coral50 : colors.amber50 },
          ]}
        >
          {status.tone === 'busy' && (
            <ActivityIndicator size="small" color={colors.amber} style={styles.pillSpinner} />
          )}
          <Text
            style={[
              styles.statusText,
              { color: status.tone === 'bad' ? colors.coral : colors.amber },
            ]}
          >
            {status.text}
          </Text>
        </View>
      ) : (
        <FontAwesome name="chevron-right" size={12} color={colors.ink3} />
      )}
    </TouchableOpacity>
  );
}

export default function LecturesScreen() {
  const colors = useColors();
  const router = useRouter();
  const { contentMaxWidth } = useResponsive();
  // Optional course scope: /lecture?courseId=<id> narrows the list to one
  // class, which is how the course screen reaches the lectures recorded for
  // it. Filtered client-side rather than in a second query — useLectures is
  // already cached and a student's lecture count is small.
  const { courseId: scopeCourseId, courseName: scopeCourseNameParam } =
    useLocalSearchParams<{ courseId?: string; courseName?: string }>();
  const { data: allLectures = [], isLoading, refetch, isRefetching } = useLectures();
  const lectures = scopeCourseId
    ? allLectures.filter((l) => l.course_id === scopeCourseId)
    : allLectures;
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
    (l) => isLectureInFlight(l.status) && !isLectureStalled(l),
  );

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
          <Text style={[styles.scopeLabel, { color: colors.ink3 }]}>{`Notes for ${scopeCourseName}`}</Text>
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
            {Platform.OS !== 'web' && (
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
        ) : (
          <>
            {anyInFlight && (
              <Text style={[styles.hint, { color: colors.ink3 }]}>
                Keep Semora open while a lecture finishes processing.
              </Text>
            )}
            <View style={styles.list}>
              {lectures.map((l) => (
                <LectureRow key={l.id} lecture={l} />
              ))}
            </View>
            <View style={styles.newRow}>
              {Platform.OS !== 'web' && (
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
          </>
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
  loading: { paddingTop: 60, alignItems: 'center' },
  hint: { fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
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
  newRow: { flexDirection: 'row', gap: 10 },
  newBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 13,
    marginTop: 14,
  },
  newBtnText: { fontSize: 14.5, fontWeight: '700' },
});
