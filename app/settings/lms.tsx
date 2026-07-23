import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  disconnectLms,
  listLmsConnections,
  LMS_PROVIDER_LABELS,
  syncLmsConnection,
} from '@/lib/lms';
import { SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useResponsive } from '@/lib/responsive';
import { useColors } from '@/lib/theme';
import type { LmsProvider } from '@/types/database';

const PROVIDERS: Array<{ id: LmsProvider; icon: string; detail: string }> = [
  { id: 'canvas', icon: 'circle-o-notch', detail: 'Courses, assignments, due dates and points' },
  { id: 'google_classroom', icon: 'google', detail: 'Classwork, submissions and posted grades' },
  { id: 'blackboard', icon: 'black-tie', detail: 'Courses and gradebook assignments' },
  { id: 'moodle', icon: 'graduation-cap', detail: 'Enrolled courses and assignments' },
];

export default function LmsSettingsScreen() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['lmsConnections'],
    queryFn: listLmsConnections,
  });
  const sync = useMutation({
    mutationFn: syncLmsConnection,
    onSuccess: (result) => {
      query.refetch();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      Alert.alert('LMS synced', `${result.processed} assignments updated${result.skipped ? ` · ${result.skipped} skipped without usable due dates` : ''}.`);
    },
    onError: (error: Error, connectionId) => {
      query.refetch();
      const connection = query.data?.find((row) => row.id === connectionId);
      Alert.alert(
        'Sync needs attention',
        error.message,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Reconnect',
            onPress: () => router.push({
              pathname: '/settings/lms-connect',
              params: { provider: connection?.provider, connectionId },
            } as any),
          },
        ],
      );
    },
  });
  const remove = (id: string) => {
    Alert.alert(
      'Disconnect LMS?',
      'Automatic updates will stop. Imported courses, assignments, completion, and grades stay in Semora.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => disconnectLms(id)
            .then(() => query.refetch())
            .catch((error) => Alert.alert('Couldn’t disconnect', error.message)),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Learning Platforms' }} />
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} tintColor={colors.brand} />}
      >
        <View style={[styles.notice, { backgroundColor: colors.brand50 }]}>
          <FontAwesome name="shield" size={16} color={colors.brand} />
          <Text style={[styles.noticeText, { color: colors.ink2 }]}>
            Access tokens stay on this device. Semora stores only the course links and sync health.
          </Text>
        </View>

        {(query.data?.length ?? 0) > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.ink }]}>Connected</Text>
            {query.data!.map((connection) => {
              const needsAttention = ['error', 'credentials_required'].includes(connection.last_sync_status);
              return (
                <View key={connection.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
                  <View style={styles.connectionHead}>
                    <View style={[styles.providerIcon, { backgroundColor: needsAttention ? `${colors.coral}12` : colors.brand50 }]}>
                      <FontAwesome name={needsAttention ? 'exclamation-triangle' : 'check'} size={15} color={needsAttention ? colors.coral : colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.connectionName, { color: colors.ink }]}>{connection.display_name}</Text>
                      <Text style={[styles.meta, { color: colors.ink3 }]}>
                        {connection.links.length} {connection.links.length === 1 ? 'course' : 'courses'}
                        {connection.account_label ? ` · ${connection.account_label}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.status, { color: needsAttention ? colors.coral : '#0F766E' }]}>
                      {connection.last_sync_status.replace('_', ' ')}
                    </Text>
                  </View>
                  {connection.last_error && (
                    <Text style={[styles.error, { color: needsAttention ? colors.coral : colors.ink3 }]} numberOfLines={3}>
                      {connection.last_error}
                    </Text>
                  )}
                  <View style={[styles.connectionActions, { borderTopColor: colors.line }]}>
                    <TouchableOpacity
                      disabled={sync.isPending}
                      onPress={() => sync.mutate(connection.id)}
                      style={styles.textButton}
                    >
                      <FontAwesome name="refresh" size={13} color={colors.brand} />
                      <Text style={[styles.textButtonLabel, { color: colors.brand }]}>
                        {sync.isPending && sync.variables === connection.id ? 'Syncing…' : 'Sync now'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(connection.id)} style={styles.textButton}>
                      <FontAwesome name="unlink" size={13} color={colors.ink3} />
                      <Text style={[styles.textButtonLabel, { color: colors.ink3 }]}>Disconnect</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}

        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Add a platform</Text>
        {PROVIDERS.map((provider) => (
          <TouchableOpacity
            key={provider.id}
            onPress={() => router.push({ pathname: '/settings/lms-connect', params: { provider: provider.id } } as any)}
            style={[styles.providerRow, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <View style={[styles.providerIcon, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name={provider.icon as any} size={15} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: colors.ink }]}>{LMS_PROVIDER_LABELS[provider.id]}</Text>
              <Text style={[styles.meta, { color: colors.ink3 }]}>{provider.detail}</Text>
            </View>
            <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', padding: 20, paddingBottom: 45, gap: 10 },
  notice: { borderRadius: 15, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 6 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  sectionTitle: { fontSize: 19, fontFamily: 'Fraunces_700Bold', marginTop: 9, marginBottom: 1 },
  card: { borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  connectionHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  providerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  connectionName: { fontSize: 15, fontWeight: '800' },
  providerName: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  status: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  error: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  connectionActions: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, marginTop: 11 },
  textButton: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 30 },
  textButtonLabel: { fontSize: 12, fontWeight: '800' },
  providerRow: { minHeight: 66, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
