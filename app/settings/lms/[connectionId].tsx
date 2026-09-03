import { translate } from '@/lib/i18n';
import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import { Stack,
  router,
  useLocalSearchParams } from 'expo-router';
import { useMemo,
  useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ignoredLmsCourses,
  listLmsConnections,
  listLmsSyncRuns,
  LMS_PROVIDER_LABELS,
  lmsConnectionsQuery,
  pendingAsDiscovered,
  pendingLmsCoursesQuery,
  setLmsCourseMapping,
  setLmsCoursesIgnored,
  syncLmsConnection,
} from '@/lib/lms';
import { formatSpan, spanOf } from '@/lib/termMatch';
import { courseFactsOf } from '@/lib/lms';
import { supabase } from '@/lib/supabase';
import { SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import type { Course, LmsCourseLink } from '@/types/database';

function activityTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown time';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function LmsConnectionDetailScreen() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const queryClient = useQueryClient();
  const { connectionId } = useLocalSearchParams<{ connectionId: string }>();
  const [mappingLink, setMappingLink] = useState<LmsCourseLink | null>(null);

  // Everything this connection was told was "not mine".
  //
  // Dismissing has to be reversible. A student clearing a list of new courses
  // in a hurry, or tapping the wrong row, must not have to disconnect and
  // reconnect Canvas to undo it — that is the exact "reconnect every semester"
  // experience this whole feature exists to remove. So dismissal sets a
  // timestamp, never deletes, and everything dismissed stays listed here with
  // its dates intact.
  const dismissedQuery = useQuery({
    queryKey: ['lmsIgnoredCourses', connectionId],
    queryFn: () => ignoredLmsCourses(String(connectionId)),
    enabled: !!connectionId,
  });

  const restore = useMutation({
    mutationFn: async (externalCourseId: string) => {
      const row = (dismissedQuery.data ?? []).find(
        (item) => item.external_course_id === externalCourseId,
      );
      if (!row) return;
      await setLmsCoursesIgnored({
        connectionId: String(connectionId),
        courses: [pendingAsDiscovered(row)],
        ignored: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lmsIgnoredCourses', connectionId] });
      queryClient.invalidateQueries({ queryKey: pendingLmsCoursesQuery.queryKey });
      queryClient.invalidateQueries({ queryKey: lmsConnectionsQuery.queryKey });
    },
    onError: (error: unknown) => {
      Alert.alert('Could not restore', error instanceof Error ? error.message : 'Please try again.');
    },
  });

  const connectionQuery = useQuery({
    queryKey: ['lmsConnection', connectionId],
    queryFn: async () => {
      const all = await listLmsConnections();
      const connection = all.find((row) => row.id === connectionId);
      if (!connection) throw new Error('This LMS connection is no longer available.');
      return connection;
    },
    enabled: !!connectionId,
  });
  const coursesQuery = useQuery({
    queryKey: ['lmsMappingCourses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('courses').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as Course[];
    },
  });
  const historyQuery = useQuery({
    queryKey: ['lmsSyncRuns', connectionId],
    queryFn: () => listLmsSyncRuns(connectionId),
    enabled: !!connectionId,
  });
  const refresh = () => {
    connectionQuery.refetch();
    coursesQuery.refetch();
    historyQuery.refetch();
  };
  const sync = useMutation({
    mutationFn: () => syncLmsConnection(connectionId),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      refresh();
      Alert.alert('LMS synced', `${result.processed} assignments updated${result.skipped ? ` · ${result.skipped} need attention` : ''}.`);
    },
    onError: (error: Error) => {
      refresh();
      Alert.alert('Sync needs attention', error.message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reconnect',
          onPress: () => router.push({
            pathname: '/settings/lms-connect',
            params: {
              provider: connectionQuery.data?.provider,
              connectionId,
              baseUrl: connectionQuery.data?.base_url ?? '',
            },
          } as any),
        },
      ]);
    },
  });
  const saveMapping = useMutation({
    mutationFn: (input: { link: LmsCourseLink; courseId: string; enabled: boolean }) => setLmsCourseMapping({
      linkId: input.link.id,
      localCourseId: input.courseId,
      syncEnabled: input.enabled,
    }),
    onSuccess: () => {
      setMappingLink(null);
      connectionQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
    onError: (error: Error) => Alert.alert('Couldn’t save course mapping', error.message),
  });

  const connection = connectionQuery.data;
  const localCourses = coursesQuery.data ?? [];
  const mappedCourse = useMemo(() => new Map(localCourses.map((course) => [course.id, course])), [localCourses]);
  const loading = connectionQuery.isLoading || coursesQuery.isLoading;

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]}>
        <Stack.Screen options={{ title: translate('Learning platform') }} />
        <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
      </SafeAreaView>
    );
  }

  if (!connection) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]}>
        <Stack.Screen options={{ title: translate('Learning platform') }} />
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: colors.ink }]}>Connection unavailable</Text>
          <Text style={[styles.emptyText, { color: colors.ink3 }]}>{connectionQuery.error instanceof Error ? connectionQuery.error.message : 'Go back and reconnect your learning platform.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const needsReconnect = connection.last_sync_status === 'credentials_required';
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: connection.display_name }} />
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        refreshControl={<RefreshControl refreshing={connectionQuery.isRefetching || historyQuery.isRefetching} onRefresh={refresh} tintColor={colors.brand} />}
      >
        <View style={[styles.hero, { backgroundColor: needsReconnect ? colors.coral50 : colors.brand50 }]}>
          <FontAwesome name={needsReconnect ? 'exclamation-triangle' : 'university'} size={18} color={needsReconnect ? colors.coral : colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: colors.ink }]}>{LMS_PROVIDER_LABELS[connection.provider]}</Text>
            <Text style={[styles.heroText, { color: colors.ink2 }]}>
              {connection.background_sync_enabled
                ? connection.connection_method === 'calendar_feed'
                  ? 'Automatic Canvas Calendar Feed sync is on. Semora checks for dated assignment and event changes every few hours.'
                  : 'Automatic background sync is on. Semora checks this connection every few hours.'
                : needsReconnect
                  ? 'Your school needs you to reconnect before Semora can continue syncing.'
                  : 'This connection updates while you use Semora on this device.'}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Course mapping</Text>
          <Text style={[styles.sectionNote, { color: colors.ink3 }]}>Choose where each LMS course appears in Semora.</Text>
        </View>
        {connection.links.map((link) => {
          const course = mappedCourse.get(link.local_course_id);
          return (
            <View key={link.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <Text style={[styles.externalName, { color: colors.ink }]}>{link.external_name}</Text>
              <TouchableOpacity onPress={() => setMappingLink(link)} style={[styles.mappingTarget, { backgroundColor: colors.brand50 }]}>
                <FontAwesome name="exchange" size={12} color={colors.brand} />
                <Text style={[styles.mappingText, { color: colors.brand }]} numberOfLines={1}>
                  {course ? course.name : 'Choose a Semora course'}
                </Text>
                <FontAwesome name="chevron-right" size={10} color={colors.brand} />
              </TouchableOpacity>
              <TouchableOpacity
                disabled={saveMapping.isPending}
                onPress={() => saveMapping.mutate({ link, courseId: link.local_course_id, enabled: !link.sync_enabled })}
                style={styles.syncToggle}
              >
                <FontAwesome name={link.sync_enabled ? 'check-circle' : 'pause-circle'} size={14} color={link.sync_enabled ? '#0F766E' : colors.ink3} />
                <Text style={[styles.toggleText, { color: link.sync_enabled ? '#0F766E' : colors.ink3 }]}>
                  {link.sync_enabled ? 'Assignment sync on' : 'Assignment sync paused'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {(dismissedQuery.data?.length ?? 0) > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>Dismissed courses</Text>
              <Text style={[styles.sectionNote, { color: colors.ink3 }]}>
                Courses you told Semora were not yours. Nothing was deleted — restore one and it goes back on the list of courses waiting to be imported.
              </Text>
            </View>
            {dismissedQuery.data!.map((row) => {
              const range = formatSpan(spanOf([courseFactsOf(pendingAsDiscovered(row))]));
              const detail = [
                row.item_count ? `${row.item_count} ${row.item_count === 1 ? 'deadline' : 'deadlines'}` : null,
                range || null,
              ].filter(Boolean).join(' · ');
              return (
                <View key={row.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
                  <Text style={[styles.externalName, { color: colors.ink }]}>{row.external_name}</Text>
                  {!!detail && <Text style={[styles.sectionNote, { color: colors.ink3 }]}>{detail}</Text>}
                  <TouchableOpacity
                    disabled={restore.isPending}
                    onPress={() => restore.mutate(row.external_course_id)}
                    style={styles.syncToggle}
                  >
                    <FontAwesome name="undo" size={13} color={colors.brand} />
                    <Text style={[styles.toggleText, { color: colors.brand }]}>
                      {restore.isPending && restore.variables === row.external_course_id ? 'Restoring…' : 'Restore'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </>
        )}

        <TouchableOpacity
          onPress={() => sync.mutate()}
          disabled={sync.isPending}
          style={[styles.primary, { backgroundColor: colors.brand }]}
        >
          {sync.isPending ? <ActivityIndicator color="#fff" /> : <><FontAwesome name="refresh" size={14} color="#fff" /><Text style={styles.primaryText}>Sync now</Text></>}
        </TouchableOpacity>
        {needsReconnect && (
          <TouchableOpacity
            onPress={() => router.push({ pathname: '/settings/lms-connect', params: { provider: connection.provider, connectionId, baseUrl: connection.base_url ?? '', source: 'connection_detail' } } as any)}
            style={[styles.secondary, { borderColor: colors.brand }]}
          >
            <Text style={[styles.secondaryText, { color: colors.brand }]}>Reconnect {LMS_PROVIDER_LABELS[connection.provider]}</Text>
          </TouchableOpacity>
        )}

        {/* The only route back to something the student hid. Sits with the
            connection it belongs to rather than in a global settings list,
            because "hidden" only means anything for synced assignments. */}
        <TouchableOpacity
          onPress={() => router.push('/settings/lms/hidden' as any)}
          style={[styles.secondary, { borderColor: colors.line }]}
        >
          <Text style={[styles.secondaryText, { color: colors.ink2 }]}>Hidden assignments</Text>
        </TouchableOpacity>

        <View style={styles.sectionHead}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Sync activity</Text>
          <Text style={[styles.sectionNote, { color: colors.ink3 }]}>Recent attempts make it clear what changed and what needs attention.</Text>
        </View>
        {(historyQuery.data ?? []).length === 0 ? (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.emptyText, { color: colors.ink3 }]}>Your first completed sync will appear here.</Text>
          </View>
        ) : (historyQuery.data ?? []).map((run) => {
          const failed = run.status === 'error' || run.status === 'credentials_required';
          return (
            <View key={run.id} style={[styles.run, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <View style={[styles.runIcon, { backgroundColor: failed ? colors.coral50 : colors.brand50 }]}>
                <FontAwesome name={failed ? 'exclamation-triangle' : run.status === 'partial' ? 'info-circle' : 'check'} size={12} color={failed ? colors.coral : colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.runTitle, { color: colors.ink }]}>{run.trigger.replace('_', ' ')} sync · {run.status.replace('_', ' ')}</Text>
                <Text style={[styles.runMeta, { color: failed ? colors.coral : colors.ink3 }]} numberOfLines={2}>
                  {failed ? run.error_message : `${run.processed} updated${run.skipped ? ` · ${run.skipped} skipped` : ''}`} · {activityTime(run.started_at)}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <Modal visible={!!mappingLink} transparent animationType="slide" onRequestClose={() => setMappingLink(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modal, { backgroundColor: colors.paper }]}>
            <View style={styles.modalHead}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.modalTitle, { color: colors.ink }]}>Map LMS course</Text>
                <Text style={[styles.modalNote, { color: colors.ink3 }]} numberOfLines={2}>{mappingLink?.external_name}</Text>
              </View>
              <TouchableOpacity onPress={() => setMappingLink(null)}><FontAwesome name="times" size={18} color={colors.ink3} /></TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalList}>
              {localCourses.map((course) => (
                <TouchableOpacity
                  key={course.id}
                  onPress={() => mappingLink && saveMapping.mutate({ link: mappingLink, courseId: course.id, enabled: mappingLink.sync_enabled })}
                  style={[styles.courseOption, { backgroundColor: colors.card, borderColor: course.id === mappingLink?.local_course_id ? colors.brand : colors.line }]}
                >
                  <View style={[styles.courseDot, { backgroundColor: course.color }]} />
                  <Text style={[styles.courseOptionText, { color: colors.ink }]}>{course.name}</Text>
                  {course.id === mappingLink?.local_course_id && <FontAwesome name="check" size={13} color={colors.brand} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', padding: 20, paddingBottom: 48, gap: 10 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  hero: { borderRadius: 18, padding: 15, flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  heroTitle: { fontSize: 16, fontWeight: '800' },
  heroText: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  sectionHead: { marginTop: 14 },
  sectionTitle: { fontSize: 20, fontFamily: 'Fraunces_700Bold' },
  sectionNote: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  externalName: { fontSize: 15, fontWeight: '800' },
  mappingTarget: { marginTop: 9, minHeight: 38, borderRadius: 10, paddingHorizontal: 11, flexDirection: 'row', gap: 8, alignItems: 'center' },
  mappingText: { flex: 1, fontSize: 12, fontWeight: '800' },
  syncToggle: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, minHeight: 25 },
  toggleText: { fontSize: 12, fontWeight: '700' },
  primary: { minHeight: 51, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 7 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  secondary: { minHeight: 48, borderRadius: 14, borderWidth: 1.2, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 14, fontWeight: '800' },
  run: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  runIcon: { width: 30, height: 30, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  runTitle: { fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  runMeta: { fontSize: 11, lineHeight: 16, marginTop: 3 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.38)' },
  modal: { maxHeight: '78%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  modalHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 14 },
  modalTitle: { fontSize: 21, fontFamily: 'Fraunces_700Bold' },
  modalNote: { fontSize: 12, marginTop: 3 },
  modalList: { gap: 8 },
  courseOption: { minHeight: 52, borderWidth: 1.2, borderRadius: 13, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 10 },
  courseDot: { width: 10, height: 10, borderRadius: 5 },
  courseOptionText: { flex: 1, fontSize: 14, fontWeight: '700' },
});
