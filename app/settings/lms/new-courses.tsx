import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Alert, Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CanvasCourseReview, confirmSemesterConflict } from '@/components/CanvasCourseReview';
import {
  courseFactsOf,
  linkPendingCourses,
  lmsConnectionsQuery,
  pendingAsDiscovered,
  pendingLmsCoursesQuery,
  setLmsCoursesIgnored,
  syncLmsConnection,
} from '@/lib/lms';
import { formatSpan, matchSemester, spanOf, suggestNewSemester } from '@/lib/termMatch';
import { useSemesters } from '@/lib/queries';
import { SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useResponsive } from '@/lib/responsive';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { useProUpsell } from '@/components/ProUpsellHost';
import { track } from '@/lib/analytics';

/**
 * "4 new Canvas courses found."
 *
 * The other half of connect-Canvas-once. A connection used to watch exactly the
 * courses ticked on the day it was made; when the term turned over, the feed
 * filled with the next semester's classes and every deadline in them was
 * discarded while the connection reported perfect health. Syncs now record what
 * they could not place, and this is where the student answers for it.
 *
 * It renders the SAME review component as the first-time connect flow, because
 * this is the identical decision asked later — what is this work, and which
 * semester does it belong to. Two implementations of that question would
 * eventually disagree about what "Spring 2027" means.
 *
 * Nothing here is automatic. Detection is automatic; importing is not. A course
 * only becomes a course when someone says so, and the semester only exists
 * because they confirmed the one Semora proposed from the dates.
 */
export default function NewCanvasCourses() {
  const colors = useColors();
  const { t, locale } = useI18n();
  const { contentMaxWidth } = useResponsive();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ connectionId?: string }>();
  const showProUpsell = useProUpsell();

  const { data: pending, isPending } = useQuery(pendingLmsCoursesQuery);
  const { data: connections } = useQuery(lmsConnectionsQuery);
  const { data: semesters = [], refetch: refetchSemesters } = useSemesters();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [semesterId, setSemesterId] = useState('');
  const [working, setWorking] = useState(false);

  // One connection's worth at a time. Almost every account has exactly one, but
  // mixing two schools' courses into a single "which semester?" question would
  // be incoherent.
  const connectionId = params.connectionId
    ?? pending?.[0]?.connection_id
    ?? connections?.find((c) => (c.pending_courses_count ?? 0) > 0)?.id
    ?? '';
  const rows = useMemo(
    () => (pending ?? []).filter((row) => row.connection_id === connectionId),
    [pending, connectionId],
  );
  const courses = useMemo(() => rows.map(pendingAsDiscovered), [rows]);
  const facts = useMemo(() => courses.map(courseFactsOf), [courses]);
  const suggestion = useMemo(() => suggestNewSemester(facts), [facts]);

  useEffect(() => {
    if (courses.length) setSelected(new Set(courses.map((course) => course.id)));
  }, [courses.length]);

  useEffect(() => {
    track('lms_new_courses_viewed', { screen: 'lms_new_courses', count: rows.length });
  }, [rows.length]);

  // Same rule as the connect screen: pre-select only on a strong match, so a
  // term that genuinely has nowhere to go leaves the choice open rather than
  // guessing.
  useEffect(() => {
    if (semesterId || !courses.length || !semesters.length) return;
    const match = matchSemester(facts, semesters);
    if (match.confidence === 'strong' && match.semesterId) setSemesterId(match.semesterId);
  }, [facts, semesters, semesterId, courses.length]);

  const chosenCourses = courses.filter((course) => selected.has(course.id));
  const target = semesters.find((semester) => semester.id === semesterId) ?? null;
  const range = formatSpan(spanOf(facts), locale === 'es' ? 'es' : 'en');

  const commit = async () => {
    if (!connectionId || !semesterId || working) return;
    setWorking(true);
    try {
      const created = await linkPendingCourses({
        connectionId,
        semesterId,
        externalCourseIds: chosenCourses.map((course) => course.id),
      });
      // Import their work immediately. Confirming and then waiting up to an
      // hour for the deadlines to appear would read as a failure.
      const result = await syncLmsConnection(connectionId, 'manual');
      track('lms_new_courses_imported', { screen: 'lms_new_courses', count: created });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pendingLmsCoursesQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: lmsConnectionsQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: ['courses'] }),
        queryClient.invalidateQueries({ queryKey: ['tasks'] }),
      ]);
      Alert.alert(
        t('Imported'),
        `${created} ${created === 1 ? t('course') : t('courses')} and ${result.processed} ${t('deadlines')} added to ${target?.name ?? t('your semester')}.`,
        [{ text: t('Done'), onPress: () => router.back() }],
      );
    } catch (error) {
      Alert.alert(
        t('Import failed'),
        error instanceof Error ? error.message : t('Nothing was saved. Please try again.'),
      );
    } finally {
      setWorking(false);
    }
  };

  const dismiss = async () => {
    if (!connectionId || working) return;
    setWorking(true);
    try {
      await setLmsCoursesIgnored({ connectionId, courses: chosenCourses, ignored: true });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: pendingLmsCoursesQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: lmsConnectionsQuery.queryKey }),
      ]);
      track('lms_new_courses_dismissed', { screen: 'lms_new_courses', count: chosenCourses.length });
      router.back();
    } catch (error) {
      Alert.alert(t('Could not dismiss'), error instanceof Error ? error.message : t('Please try again.'));
    } finally {
      setWorking(false);
    }
  };

  if (isPending) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.paper }]}>
        <Stack.Screen options={{ title: t('New Canvas courses') }} />
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      </SafeAreaView>
    );
  }

  if (!rows.length) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor: colors.paper }]}>
        <Stack.Screen options={{ title: t('New Canvas courses') }} />
        <View style={styles.empty}>
          <FontAwesome name="check-circle" size={26} color={colors.brand} />
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>{t('Nothing new right now')}</Text>
          <Text style={[styles.emptyBody, { color: colors.ink3 }]}>
            {t('Semora checks Canvas about hourly. When next semester’s courses appear, they will show up here.')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: t('New Canvas courses') }} />
      {/* The review below contains a text field — the inline "create semester"
          name — so this screen needs the same keyboard handling the connect
          screen has. Without it the field can sit under the keyboard on iOS,
          at the one moment the student has to type something. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.title, { color: colors.ink }]}>
          {rows.length} {rows.length === 1 ? t('new Canvas course') : t('new Canvas courses')}
          {suggestion ? ` ${t('for')} ${suggestion.name}` : ''}
        </Text>
        <Text style={[styles.subtitle, { color: colors.ink3 }]}>
          {t('Canvas is now listing courses Semora has not imported. Nothing has been added to your semesters — choose what belongs and where it goes.')}
        </Text>

        <CanvasCourseReview
          courses={courses}
          semesters={semesters}
          selected={selected}
          onToggle={(id) => {
            const next = new Set(selected);
            if (next.has(id)) next.delete(id); else next.add(id);
            setSelected(next);
          }}
          onSelectAll={(ids) => setSelected(new Set(ids))}
          semesterId={semesterId}
          onSemesterChange={setSemesterId}
          onSemesterCreated={() => { refetchSemesters(); }}
          footer={
            <>
              {/* The free plan allows one semester (010). A student who
                  connected Canvas last term and is now looking at next term's
                  courses meets that limit here — the honest place for it, with
                  the work in front of them and their connection intact. They
                  never have to reconnect Canvas: the courses stay on this
                  screen, and upgrading resumes from exactly here. */}
              {!semesters.some((semester) => semester.id === semesterId) && (
                <TouchableOpacity
                  onPress={() => showProUpsell('semester')}
                  style={[styles.upsell, { borderColor: colors.line, backgroundColor: colors.card }]}
                >
                  <FontAwesome name="unlock-alt" size={13} color={colors.brand} />
                  <Text style={[styles.upsellText, { color: colors.ink2 }]}>
                    {t('Need another semester? Pro removes the one-semester limit — your Canvas connection stays exactly as it is.')}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={() => {
                  if (!semesterId) {
                    Alert.alert(t('Choose a semester'), t('Pick where these courses belong, or create the one Semora suggested.'));
                    return;
                  }
                  if (!chosenCourses.length) {
                    Alert.alert(t('Select courses'), t('Choose at least one course to import.'));
                    return;
                  }
                  if (!confirmSemesterConflict(chosenCourses, target, range, () => { void commit(); })) return;
                  void commit();
                }}
                disabled={working}
                style={[styles.primary, { backgroundColor: colors.brand }]}
              >
                {working
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryText}>{t('Import into')} {target?.name ?? t('a semester')}</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={dismiss} disabled={working} style={styles.secondary}>
                <Text style={[styles.secondaryText, { color: colors.ink3 }]}>
                  {t('Not my courses — dismiss')}
                </Text>
              </TouchableOpacity>
            </>
          }
        />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 18, paddingBottom: 60, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 6 },
  subtitle: { fontSize: 13.5, lineHeight: 19, marginBottom: 14 },
  primary: {
    marginTop: 22,
    minHeight: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary: { marginTop: 14, alignItems: 'center', paddingVertical: 10 },
  secondaryText: { fontSize: 13, fontWeight: '600' },
  upsell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 20,
  },
  upsellText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  empty: { padding: 40, alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyBody: { fontSize: 13.5, lineHeight: 19, textAlign: 'center' },
});
