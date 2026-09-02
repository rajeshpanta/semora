import { translate } from '@/lib/i18n';
import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert } from '@/components/LocalizedReactNative';
import { Text } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  useMutation,
  useQuery,
  useQueryClient } from '@tanstack/react-query';
import { Stack,
  router,
  useLocalSearchParams } from 'expo-router';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  canvasFreeFor,
  canvasFreePromoQuery,
  canvasSourceOf,
  disconnectLms,
  disableLmsBackgroundSync,
  enableLmsBackgroundSync,
  listLmsConnections,
  LMS_PROVIDER_LABELS,
  syncLmsConnection,
} from '@/lib/lms';
import { track } from '@/lib/analytics';
import { SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useResponsive } from '@/lib/responsive';
import { useColors } from '@/lib/theme';
import { useProUpsell } from '@/components/ProUpsellHost';
import { useAppStore } from '@/store/appStore';
import type { LmsProvider } from '@/types/database';

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

// Google Classroom is temporarily NOT offered here: it needs the Google OAuth
// client verified for its sensitive classroom.* scopes (same Google verification
// as Google Calendar), otherwise a user/reviewer hits Google's "app not verified"
// block — a dead-end. Re-add this entry once that verification is complete:
//   { id: 'google_classroom', icon: 'google', detail: 'Classwork, submissions and posted grades' },
const OTHER_PROVIDERS: Array<{ id: LmsProvider; icon: string; detail: string }> = [
  { id: 'blackboard', icon: 'black-tie', detail: 'Courses and gradebook assignments' },
  { id: 'moodle', icon: 'graduation-cap', detail: 'Enrolled courses and assignments' },
];

export default function LmsSettingsScreen() {
  const colors = useColors();
  const showProUpsell = useProUpsell();
  // Which CTA sent them here. This screen is a waypoint, not a destination, for
  // anyone arriving from the syllabus paywall — so the only job here is to hand
  // the label on to the connect screen, where the funnel events are fired.
  // Defaults to 'settings' for the person who simply opened Settings.
  const source = canvasSourceOf(useLocalSearchParams<{ source?: string }>().source);
  const { contentMaxWidth } = useResponsive();
  const isPro = useAppStore((s) => s.isPro);
  const queryClient = useQueryClient();

  // Pro gate (teaser → paywall). The lms-sync edge function also enforces
  // PRO_REQUIRED server-side (the real, unbypassable gate), but gate here too so
  // free users see the upsell instead of a failed connect/sync. Matches the
  // calendar.tsx PRO-badge pattern.
  const openPaywall = () => {
    track('paywall_open', { screen: 'settings_lms', context: 'lms' });
    showProUpsell('canvas');
  };
  const query = useQuery({
    queryKey: ['lmsConnections'],
    queryFn: listLmsConnections,
  });
  const { data: canvasFreePromo } = useQuery(canvasFreePromoQuery);
  // The promo is named for Canvas because Canvas is what students use and what
  // it was opened up for, but the server gate (lms_access_allowed) is per
  // ACCOUNT, not per provider — so Blackboard and Moodle unlock with it. Every
  // gate on this screen therefore reads `lmsAllowed`, not `isPro`. Leaving the
  // other rows badged PRO while the server let them straight through would be
  // showing a price that is not being charged.
  const lmsFree = canvasFreeFor(query.data, isPro, canvasFreePromo);
  const lmsAllowed = isPro || lmsFree;
  const canvasFeedConnection = query.data?.find(
    (connection) => connection.provider === 'canvas' && connection.connection_method === 'calendar_feed',
  );
  const canvasFeedNeedsAttention = !!canvasFeedConnection && (
    !canvasFeedConnection.background_sync_enabled ||
    ['error', 'credentials_required'].includes(canvasFeedConnection.last_sync_status)
  );
  const sync = useMutation({
    mutationFn: (connectionId: string) => syncLmsConnection(connectionId),
    onSuccess: (result) => {
      query.refetch();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      Alert.alert('LMS synced', `${result.processed} assignments updated${result.skipped ? ` · ${result.skipped} skipped without usable due dates` : ''}.`);
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
      <Stack.Screen options={{ title: translate('Canvas & LMS') }} />
      <ScrollView
        contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={query.refetch} tintColor={colors.brand} />}
      >
        <View style={[styles.canvasHero, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={[styles.canvasHeroIcon, { backgroundColor: colors.brand50 }]}>
            <FontAwesome name="refresh" size={21} color={colors.brand} />
          </View>
          <Text style={[styles.canvasHeroTitle, { color: colors.ink }]}>Canvas deadline sync</Text>
          <Text style={[styles.canvasHeroText, { color: colors.ink3 }]}>
            Connect Canvas once. Semora keeps dated assignments and events updated automatically when an instructor changes a deadline.
          </Text>
          <View style={styles.benefits}>
            <View style={styles.benefit}>
              <FontAwesome name="clock-o" size={13} color={colors.brand} />
              <Text style={[styles.benefitText, { color: colors.ink2 }]}>Checks every few hours</Text>
            </View>
            <View style={styles.benefit}>
              <FontAwesome name="shield" size={13} color={colors.brand} />
              <Text style={[styles.benefitText, { color: colors.ink2 }]}>Private and read-only</Text>
            </View>
            <View style={styles.benefit}>
              <FontAwesome name="university" size={13} color={colors.brand} />
              <Text style={[styles.benefitText, { color: colors.ink2 }]}>No school approval needed</Text>
            </View>
          </View>
          <View style={[styles.howBox, { backgroundColor: colors.brand50 }]}>
            <Text style={[styles.howTitle, { color: colors.ink }]}>What you’ll do</Text>
            <Text style={[styles.howText, { color: colors.ink2 }]}>1. Open your school’s Canvas website in a browser.</Text>
            <Text style={[styles.howText, { color: colors.ink2 }]}>2. Copy the private link under Calendar → Calendar Feed.</Text>
            <Text style={[styles.howText, { color: colors.ink2 }]}>3. Paste it into Semora and choose your courses.</Text>
          </View>
          {!canvasFeedConnection && (
            <TouchableOpacity
              onPress={() => (lmsAllowed
                ? router.push({ pathname: '/settings/lms-connect', params: { provider: 'canvas', source } } as any)
                : openPaywall())}
              style={[styles.canvasButton, { backgroundColor: colors.brand }]}
            >
              <FontAwesome name={lmsAllowed ? 'link' : 'lock'} size={14} color="#fff" />
              <Text style={styles.canvasButtonText}>
                {lmsFree ? 'Connect Canvas · Free' : lmsAllowed ? 'Connect Canvas' : 'Connect Canvas · Pro'}
              </Text>
            </TouchableOpacity>
          )}
          {!!canvasFeedConnection && (
            <View style={[styles.connectedBadge, { backgroundColor: canvasFeedNeedsAttention ? `${colors.coral}12` : colors.brand50 }]}>
              <FontAwesome name={canvasFeedNeedsAttention ? 'exclamation-triangle' : 'check-circle'} size={14} color={canvasFeedNeedsAttention ? colors.coral : colors.brand} />
              <Text style={[styles.connectedBadgeText, { color: canvasFeedNeedsAttention ? colors.coral : colors.brand }]}>
                {canvasFeedNeedsAttention ? 'Canvas sync needs attention — reconnect below' : 'Canvas is connected — manage it below'}
              </Text>
            </View>
          )}
        </View>

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
                      <Text style={[styles.meta, { color: colors.ink3 }]}>
                        {connection.links.length} {connection.links.length === 1 ? 'course' : 'courses'}
                        {connection.account_label ? ` · ${connection.account_label}` : ''}
                      </Text>
                      <Text style={[styles.syncMeta, { color: colors.ink3 }]}>
                        {syncTimeLabel(connection.last_successful_sync_at ?? connection.last_synced_at)}
                        {connection.connection_method === 'calendar_feed'
                          ? connection.background_sync_enabled ? ' · Canvas checks every few hours' : ' · Reconnect required'
                          : connection.background_sync_enabled ? ' · Automatic sync on' : ' · Device sync only'}
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
                          Action required · {pendingCount} new {pendingCount === 1 ? 'course' : 'courses'}
                        </Text>
                        <Text style={[styles.pendingBody, { color: colors.ink3 }]}>
                          Canvas is listing {pendingCount === 1 ? 'a course' : 'courses'} Semora has not imported. Review and choose a semester.
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
                        <View style={styles.textButton}>
                          <FontAwesome name="clock-o" size={13} color={colors.brand} />
                          <Text style={[styles.textButtonLabel, { color: colors.brand }]}>Automatic updates</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => router.push({
                            pathname: '/settings/lms-connect',
                            params: { provider: connection.provider, connectionId: connection.id, baseUrl: connection.base_url ?? '' },
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
                      <FontAwesome name="random" size={13} color={colors.ink2} />
                      <Text style={[styles.textButtonLabel, { color: colors.ink2 }]}>Courses & activity</Text>
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

        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Other learning platforms</Text>
        {OTHER_PROVIDERS.map((provider) => (
          <TouchableOpacity
            key={provider.id}
            // Connecting a platform normally needs Pro; free users get the
            // locked teaser → paywall instead of opening the connect flow.
            // While the offer is live nobody is locked out — see lmsAllowed.
            onPress={() => (lmsAllowed
              ? router.push({ pathname: '/settings/lms-connect', params: { provider: provider.id, source } } as any)
              : openPaywall())}
            style={[styles.providerRow, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <View style={[styles.providerIcon, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name={provider.icon as any} size={15} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.providerName, { color: colors.ink }]}>{LMS_PROVIDER_LABELS[provider.id]}</Text>
              <Text style={[styles.meta, { color: colors.ink3 }]}>{provider.detail}</Text>
            </View>
            {lmsAllowed ? (
              <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
            ) : (
              <View style={[styles.proBadge, { backgroundColor: colors.brand }]}>
                <FontAwesome name="star" size={9} color="#fff" />
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', padding: 20, paddingBottom: 45, gap: 10 },
  canvasHero: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 18 },
  canvasHeroIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  canvasHeroTitle: { fontSize: 24, fontFamily: 'Fraunces_700Bold' },
  canvasHeroText: { fontSize: 14, lineHeight: 21, marginTop: 6 },
  benefits: { marginTop: 14, gap: 8 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  benefitText: { fontSize: 12, fontWeight: '700' },
  howBox: { borderRadius: 14, padding: 13, marginTop: 15, gap: 5 },
  howTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  howText: { fontSize: 12, lineHeight: 18 },
  canvasButton: { minHeight: 50, borderRadius: 14, marginTop: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  canvasButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  connectedBadge: { minHeight: 42, borderRadius: 13, marginTop: 15, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  connectedBadgeText: { fontSize: 12, fontWeight: '800' },
  sectionTitle: { fontSize: 19, fontFamily: 'Fraunces_700Bold', marginTop: 9, marginBottom: 1 },
  card: { borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, padding: 14 },
  connectionHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  providerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  connectionName: { fontSize: 15, fontWeight: '800' },
  providerName: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  syncMeta: { fontSize: 11, marginTop: 4, lineHeight: 16 },
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
  pendingBody: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  error: { fontSize: 12, lineHeight: 17, marginTop: 10 },
  connectionActions: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 11, marginTop: 11 },
  textButton: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 30 },
  textButtonLabel: { fontSize: 12, fontWeight: '800' },
  providerRow: { minHeight: 66, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Matches the PRO badge treatment on the calendar-sync teaser (calendar.tsx).
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  proBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
});
