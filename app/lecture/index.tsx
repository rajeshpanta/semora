import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useResponsive } from '@/lib/responsive';
import {
  formatLectureDuration,
  isLectureInFlight,
  useLectures,
  type LectureWithCourse,
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
  const { data: lectures = [], isLoading, refetch, isRefetching } = useLectures();

  const anyInFlight = lectures.some((l) => isLectureInFlight(l.status));

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={colors.brand} />
        }
      >
        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : lectures.length === 0 ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.coral50 }]}>
              <FontAwesome name="microphone" size={26} color={colors.coral} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>Record your first lecture</Text>
            <Text style={[styles.emptyText, { color: colors.ink2 }]}>
              Hit record in class. Semora transcribes the audio, writes your notes, and can turn it
              all into flashcards and practice quizzes.
            </Text>
            <TouchableOpacity
              style={[styles.emptyBtn, { backgroundColor: colors.coral }]}
              activeOpacity={0.85}
              onPress={() => router.push('/lecture/record' as any)}
              accessibilityRole="button"
              accessibilityLabel="Record a lecture"
            >
              <FontAwesome name="microphone" size={15} color="#fff" />
              <Text style={styles.emptyBtnText}>Record a lecture</Text>
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
            <TouchableOpacity
              style={[styles.newBtn, { borderColor: colors.coral }]}
              activeOpacity={0.8}
              onPress={() => router.push('/lecture/record' as any)}
              accessibilityRole="button"
              accessibilityLabel="Record a new lecture"
            >
              <FontAwesome name="plus" size={13} color={colors.coral} />
              <Text style={[styles.newBtnText, { color: colors.coral }]}>New recording</Text>
            </TouchableOpacity>
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
  newBtn: {
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
