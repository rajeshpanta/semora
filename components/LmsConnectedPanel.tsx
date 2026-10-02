import { translate } from '@/lib/i18n';
import { Alert, Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  disconnectLms,
  disableLmsBackgroundSync,
  enableLmsBackgroundSync,
  lmsConnectionsQuery,
  LMS_PROVIDER_LABELS,
  lmsSyncedTitle,
  syncLmsConnection,
} from '@/lib/lms';
import { track } from '@/lib/analytics';
import { useColors } from '@/lib/theme';
import { useProUpsell } from '@/components/ProUpsellHost';

/**
 * The student's connected platforms, with everything they can do to one.
 *
 * Moved here unchanged from the old "Canvas or LMS Sync" screen (2026-10-01),
 * which was a waypoint: its platform list duplicated the connect screen's own
 * switch, and 15 of 25 students in the week measured reached the connect
 * screen without ever passing it. What that screen alone carried was this
 * card, so it now heads the connect screen instead. Renders nothing when
 * nothing is connected.
 */

function syncTimeLabel(value: string | null) {
  if (!value) return 'Not synced yet';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Sync time unavailable';
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Updated just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Updated ${hours}h ago`;
  return `Updated ${Math.round(hours / 24)}d ago`;
}

export function LmsConnectedPanel({ lmsAllowed, openPaywall }: {
  /** Whether this account may sync. A lapsed account still sees and manages its connections. */
  lmsAllowed: boolean;
  openPaywall: () => void;
}) {
  const colors = useColors();
  const showProUpsell = useProUpsell();
  const queryClient = useQueryClient();
  const query = useQuery(lmsConnectionsQuery);
  const sync = useMutation({
    mutationFn: (connectionId: string) => syncLmsConnection(connectionId),
    onSuccess: (result, connectionId) => {
      query.refetch();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      // Named for the platform that was synced: "LMS" is Semora's word, not
      // the student's, and a student with two connections could not tell
      // which one had just answered.
      Alert.alert(lmsSyncedTitle(query.data?.find((row) => row.id === connectionId)?.provider), `${result.processed} assignments updated${result.skipped ? ` · ${result.skipped} skipped without usable due dates` : ''}.`);
    },
    onError: (error: Error, connectionId) => {
      query.refetch();
      // Lapsed-Pro (stale client cache): the lms-sync function returns
      // PRO_REQUIRED. Route to the paywall like the connect flow does, not a
      // raw "sync needs attention" alert.
      if (/pro feature/i.test(error.message)) {
        track('paywall_open', { screen: 'settings_lms', context: 'lms' });
        showProUpsell('canvas');
        return;
      }
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
              params: {
                provider: connection?.provider,
                connectionId,
                baseUrl: connection?.base_url ?? '',
                // Without this a reconnect was recorded as source='settings',
                // which is where the screen is, not where the student came
                // from. The repair lane was therefore invisible.
                source: 'reconnect_sync_error',
              },
            } as any),
          },
        ],
      );
    },
  });
  const automatic = useMutation({
    mutationFn: async ({ connectionId, enabled }: { connectionId: string; enabled: boolean }) => {
      if (enabled) await enableLmsBackgroundSync(connectionId);
      else await disableLmsBackgroundSync(connectionId);
    },
    onSuccess: () => query.refetch(),
    onError: (error: Error) => Alert.alert('Couldn’t update automatic sync', error.message),
  });
  const toggleAutomatic = (connection: NonNullable<typeof query.data>[number]) => {
    if (connection.background_sync_enabled) {
      Alert.alert(
        'Turn off automatic sync?',
        'Semora will remove the encrypted server credential and will only sync this LMS while you use the app on this device.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Turn off', style: 'destructive', onPress: () => automatic.mutate({ connectionId: connection.id, enabled: false }) },
        ],
      );
      return;
    }
    Alert.alert(
      'Turn on automatic sync?',
      'Semora will encrypt this LMS credential in its secure server vault so it can check for assignment and grade changes every few hours, even when the app is closed. You can turn this off at any time.',
      [
        { text: 'Not now', style: 'cancel' },
        { text: 'Turn on', onPress: () => automatic.mutate({ connectionId: connection.id, enabled: true }) },
      ],
    );
  };
  const remove = (id: string) => {
    const label = LMS_PROVIDER_LABELS[query.data?.find((row) => row.id === id)?.provider ?? 'canvas'];
    Alert.alert(
      `Disconnect ${label}?`,
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
    <>
        {(query.data?.length ?? 0) > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.ink }]}>Connected</Text>
            {query.data!.map((connection) => {
              const needsAttention = ['error', 'credentials_required'].includes(connection.last_sync_status);
              // Syncing perfectly and still not doing its job. The status word
              // beside it will read "success", and it is telling the truth
              // about the sync — every course it was asked to import, it
              // imported. It just also found a term's worth it was not asked
              // about, and without this the card would look finished.
              const pendingCount = connection.pending_courses_count ?? 0;
              return (
                <View key={connection.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
                  <View style={styles.connectionHead}>
                    <View style={[styles.providerIcon, { backgroundColor: needsAttention ? `${colors.coral}12` : colors.brand50 }]}>
                      <FontAwesome name={needsAttention ? 'exclamation-triangle' : 'check'} size={15} color={needsAttention ? colors.coral : colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.connectionName, { color: colors.ink }]}>{connection.display_name}</Text>
                      <Text style={[styles.meta, { color: colors.ink2 }]}>
                        {connection.links.length} {connection.links.length === 1 ? 'course' : 'courses'}
                        {connection.account_label ? ` · ${connection.account_label}` : ''}
                      </Text>
                      <Text style={[styles.syncMeta, { color: colors.ink2 }]}>
                        {syncTimeLabel(connection.last_successful_sync_at ?? connection.last_synced_at)}
                        {connection.connection_method === 'calendar_feed'
                          ? connection.background_sync_enabled ? ` · ${LMS_PROVIDER_LABELS[connection.provider]} checks every few hours` : ' · Reconnect required'
                          : connection.background_sync_enabled ? ' · Automatic sync on' : ' · Device sync only'}
                      </Text>
                    </View>
                    <Text style={[styles.status, { color: needsAttention ? colors.coral : '#0F766E' }]}>
                      {/* In the student's words, not the sync's. */}
                      {connection.last_sync_status === 'success'
                        ? 'Up to date'
                        : needsAttention ? 'Needs attention' : connection.last_sync_status.replace('_', ' ')}
                    </Text>
                  </View>
                  {connection.last_error && (
                    <Text style={[styles.error, { color: needsAttention ? colors.coral : colors.ink2 }]} numberOfLines={3}>
                      {connection.last_error}
                    </Text>
                  )}
                  {pendingCount > 0 && (
                    <TouchableOpacity
                      onPress={() => router.push({
                        pathname: '/settings/lms/new-courses',
                        params: { connectionId: connection.id },
                      } as any)}
                      style={[styles.pendingBanner, { backgroundColor: colors.brand50 }]}
                    >
                      <FontAwesome name="plus-circle" size={14} color={colors.brand} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pendingTitle, { color: colors.ink }]}>
                          {pendingCount} new {pendingCount === 1 ? 'course' : 'courses'} found · Review
                        </Text>
                        <Text style={[styles.pendingBody, { color: colors.ink2 }]}>
                          {translate(`${LMS_PROVIDER_LABELS[connection.provider]} is listing ${pendingCount === 1 ? 'a course' : 'courses'} Semora has not imported. Review and choose a semester.`)}
                        </Text>
                      </View>
                      <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
                    </TouchableOpacity>
                  )}
                  <View style={[styles.connectionActions, { borderTopColor: colors.line }]}>
                    <TouchableOpacity
                      disabled={sync.isPending}
                      // Existing connections stay visible for a lapsed user, but
                      // a new sync needs access — route to the paywall instead
                      // of firing a sync the server will reject with
                      // PRO_REQUIRED. A grandfathered free account passes here,
                      // exactly as it passes lms_access_allowed server-side.
                      onPress={() => (lmsAllowed ? sync.mutate(connection.id) : openPaywall())}
                      style={styles.textButton}
                    >
                      <FontAwesome name={lmsAllowed ? 'refresh' : 'lock'} size={13} color={colors.brand} />
                      <Text style={[styles.textButtonLabel, { color: colors.brand }]}>
                        {sync.isPending && sync.variables === connection.id ? 'Syncing…' : 'Sync now'}
                      </Text>
                    </TouchableOpacity>
                    {connection.connection_method === 'calendar_feed' ? (connection.background_sync_enabled ? (
                        // A status, not a button: styled like "Sync now" beside
                        // it, it was tapped and seemed broken.
                        <View style={styles.textButton}>
                          <FontAwesome name="check" size={12} color={colors.ink3} />
                          <Text style={[styles.statusLine, { color: colors.ink2 }]}>Updates automatically</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => router.push({
                            pathname: '/settings/lms-connect',
                            params: {
                              provider: connection.provider,
                              connectionId: connection.id,
                              baseUrl: connection.base_url ?? '',
                              source: 'reconnect_button',
                            },
                          } as any)}
                          style={styles.textButton}
                        >
                          <FontAwesome name="link" size={13} color={colors.coral} />
                          <Text style={[styles.textButtonLabel, { color: colors.coral }]}>Reconnect</Text>
                        </TouchableOpacity>
                      )
                    ) : (
                      <TouchableOpacity
                        onPress={() => toggleAutomatic(connection)}
                        disabled={automatic.isPending}
                        style={styles.textButton}
                      >
                        <FontAwesome name={connection.background_sync_enabled ? 'clock-o' : 'bolt'} size={13} color={colors.brand} />
                        <Text style={[styles.textButtonLabel, { color: colors.brand }]}>
                          {automatic.isPending && automatic.variables?.connectionId === connection.id
                            ? 'Saving…'
                            : connection.background_sync_enabled ? 'Automatic on' : 'Automatic'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={[styles.connectionActions, { borderTopColor: colors.line, marginTop: 8, paddingTop: 8 }]}>
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: '/settings/lms/[connectionId]', params: { connectionId: connection.id } } as any)}
                      style={styles.textButton}
                    >
                      <FontAwesome name="list-ul" size={13} color={colors.ink2} />
                      <Text style={[styles.textButtonLabel, { color: colors.ink2 }]}>Courses & activity</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => remove(connection.id)} style={styles.textButton}>
                      <FontAwesome name="unlink" size={13} color={colors.ink3} />
                      <Text style={[styles.textButtonLabel, { color: colors.ink2 }]}>Disconnect</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </>
        )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 19, fontFamily: 'Fraunces_700Bold', marginTop: 9, marginBottom: 1 },
  card: { borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  connectionHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  providerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  connectionName: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 13, marginTop: 3, lineHeight: 18 },
  syncMeta: { fontSize: 12, marginTop: 4, lineHeight: 17 },
  status: { fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  pendingTitle: { fontSize: 13.5, fontWeight: '700' },
  pendingBody: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  error: { fontSize: 13, lineHeight: 18, marginTop: 10 },
  connectionActions: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, marginTop: 11 },
  textButton: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 30 },
  statusLine: { fontSize: 13, fontWeight: '600' },
  textButtonLabel: { fontSize: 13, fontWeight: '800' },
});
