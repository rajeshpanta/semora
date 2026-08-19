import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text } from '@/components/LocalizedReactNative';
import {
  View,
  StyleSheet,
  ScrollView,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useSession } from '@/app/_layout';
import { useAppStore } from '@/store/appStore';
import { supabase } from '@/lib/supabase';
import {
  getProducts,
  openSubscriptionManagement,
  restorePurchases,
  validateAfterPurchase,
} from '@/lib/purchases';
import { rescheduleAllTaskReminders } from '@/lib/notifications';
import { COLORS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { accountSubtitle, displayName, hasEmailPassword } from '@/lib/user';
import { useOfflineSyncStatus } from '@/components/OfflineSyncBridge';
import { track } from '@/lib/analytics';
import Constants from 'expo-constants';
import { languageName, translate, useI18n } from '@/lib/i18n';

export default function SettingsScreen() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const { session } = useSession();
  const userId = session?.user?.id;
  // Apple users can legitimately have no email on record — see accountSubtitle.
  const accountSub = accountSubtitle(session?.user);
  const name = displayName(session?.user, 'User');
  const showChangePassword = hasEmailPassword(session?.user);
  const isPro = useAppStore((s) => s.isPro);
  const setIsPro = useAppStore((s) => s.setIsPro);
  const setSubscriptionPlan = useAppStore((s) => s.setSubscriptionPlan);
  const subscriptionPlan = useAppStore((s) => s.subscriptionPlan);
  const themeMode = useAppStore((s) => s.themeMode);
  const languagePreference = useAppStore((s) => s.languagePreference);
  const { locale } = useI18n();
  const themeModeLabel = themeMode === 'system' ? 'System' : themeMode === 'light' ? 'Light' : 'Dark';
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);
  const [managing, setManaging] = useState(false);
  const [monthlyPrice, setMonthlyPrice] = useState('$3.99');
  const [annualPrice, setAnnualPrice] = useState('$19.99');
  const syncStatus = useOfflineSyncStatus();
  const hasPaidPlan = isPro && subscriptionPlan !== null;

  useEffect(() => {
    let active = true;
    getProducts().then((products) => {
      if (!active || !products) return;
      if (products.monthly?.displayPrice) setMonthlyPrice(products.monthly.displayPrice);
      if (products.annual?.displayPrice) setAnnualPrice(products.annual.displayPrice);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Always-reachable Restore (mirrors the paywall's handler). The paywall is
  // only reachable while !isPro, so without this a user whose subscription
  // lapsed but whose cached isPro is still true had no way to re-validate
  // until the next launch. Same race-guard + transient handling as the paywall.
  const handleRestore = async () => {
    if (restoring) return;
    setRestoring(true);
    try {
      const { data: { session: startSession } } = await supabase.auth.getSession();
      const expectedUserId = startSession?.user.id;
      const entitlement = await restorePurchases();
      const { data: { session: endSession } } = await supabase.auth.getSession();
      if (endSession?.user.id !== expectedUserId) return;
      // Transient network/server failure — don't write it or claim "no subscription".
      if (entitlement.transient && !entitlement.is_pro) {
        Alert.alert('Connection Issue', 'We couldn\'t reach the server to check your subscription. Please try again in a moment.');
        return;
      }
      setIsPro(entitlement.is_pro);
      setSubscriptionPlan(entitlement.plan);
      if (entitlement.is_pro) {
        if (expectedUserId) rescheduleAllTaskReminders(expectedUserId);
        if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Restored', 'Your Pro subscription has been restored.');
      } else if (entitlement.restoreError === 'linked_other_account') {
        Alert.alert(
          'Subscription Linked Elsewhere',
          'This subscription is linked to a different Semora account. To use it on this device, sign in to the account that originally purchased it. If that account no longer exists, please contact support.',
        );
      } else {
        Alert.alert('No Subscription Found', 'We couldn\'t find an active subscription for this account.');
      }
    } catch (err: any) {
      Alert.alert('Restore Failed', err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  // Present Apple's in-app StoreKit sheet, which is scoped to Semora rather
  // than opening the user's full Apple Account subscription list.
  const handleManageSubscription = async () => {
    if (managing) return;
    // On web this opens Stripe's billing portal. It returns opened:false only
    // when the account has no Stripe customer, which means they subscribed
    // through the App Store — and Apple, not us, owns that cancellation.
    if (Platform.OS === 'web') {
      setManaging(true);
      try {
        const result = await openSubscriptionManagement();
        if (!result.opened) {
          Alert.alert(
            'Manage Semora on iPhone or iPad',
            'This subscription was purchased through the App Store. Open Semora on your iPhone or iPad, then go to Settings → Subscription → Manage Semora Plan.',
          );
        }
      } finally {
        setManaging(false);
      }
      return;
    }

    setManaging(true);
    try {
      const result = await openSubscriptionManagement();
      if (!result.opened) {
        Alert.alert(
          'Couldn\'t open subscription management',
          'Please try again. You can also manage Semora from Settings → Apple Account → Subscriptions.',
        );
        return;
      }
      if (result.purchase) {
        const entitlement = await validateAfterPurchase(result.purchase);
        if (!entitlement.transient) {
          setIsPro(entitlement.is_pro);
          setSubscriptionPlan(entitlement.plan);
        }
      }
    } finally {
      setManaging(false);
    }
  };

  // Reflect the user's *actual* enabled reminders on the settings row,
  // not just what's available on their tier. Filter Pro-only flags out
  // for free users so the display matches what the scheduler actually
  // fires (see lib/notifications.ts where 1d/3d are forced off for
  // free users at schedule time).
  const { data: reminderPrefs } = useQuery({
    queryKey: ['reminderPrefs', userId],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('reminder_same_day, reminder_1day, reminder_3day')
        .eq('id', userId!)
        .maybeSingle();
      return data ?? { reminder_same_day: true, reminder_1day: true, reminder_3day: true };
    },
    enabled: !!userId,
  });
  const reminderLabel = (() => {
    if (!reminderPrefs) return undefined; // hide value while loading
    const parts: string[] = [];
    if (reminderPrefs.reminder_same_day) parts.push('Same day');
    if (isPro && reminderPrefs.reminder_1day) parts.push('1 day');
    if (isPro && reminderPrefs.reminder_3day) parts.push('3 days');
    return parts.length === 0 ? 'Off' : parts.join(', ');
  })();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: translate('Settings') }} />

      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} showsVerticalScrollIndicator={false}>
        {/* Account */}
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Account</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={[styles.row, showChangePassword && styles.rowBorder, showChangePassword && { borderBottomColor: colors.line }]}>
            <FontAwesome name="user" size={16} color={colors.ink2} style={styles.icon} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, { color: colors.ink }]}>{name}</Text>
              <Text style={[styles.rowSub, { color: colors.ink3 }]}>{accountSub}</Text>
            </View>
          </View>
          {showChangePassword && (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => router.push('/settings/password')}
            >
              <FontAwesome name="lock" size={16} color={colors.ink2} style={styles.icon} />
              <Text style={[styles.rowLabel, { flex: 1, color: colors.ink }]}>Change Password</Text>
              <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
            </TouchableOpacity>
          )}
        </View>

        {/* Language is intentionally its own early section. It used to sit
            near the bottom of a long Preferences card and was easy to miss. */}
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Language</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <SettingsRow
            icon="language"
            label="App language"
            value={languageName(languagePreference, locale)}
            onPress={() => router.push('/settings/language' as any)}
            last
          />
        </View>

        {/* Preferences */}
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Preferences</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <SettingsRow
            icon="bell"
            label="Notifications"
            value={reminderLabel}
            onPress={() => router.push('/settings/notifications')}
          />
          <SettingsRow
            icon="calendar"
            label="Calendar Sync"
            pro
            isPro={isPro}
            onPress={() => router.push('/settings/calendar')}
          />
          <SettingsRow
            icon="refresh"
            label="Connect Canvas"
            value="Automatic deadline sync"
            pro
            isPro={isPro}
            onPress={() => router.push('/settings/lms' as any)}
          />
          <SettingsRow
            icon="cloud"
            label="Offline & Sync"
            value={
              syncStatus.conflictCount
                ? `${syncStatus.conflictCount} conflicts`
                : syncStatus.pendingCount
                  ? `${syncStatus.pendingCount} waiting`
                  : syncStatus.isOnline ? 'Up to date' : 'Offline'
            }
            onPress={() => router.push('/settings/sync' as any)}
          />
          <SettingsRow
            icon="graduation-cap"
            label="GPA Scale"
            value="School rules"
            pro
            isPro={isPro}
            onPress={() => router.push('/settings/gpa-scale' as any)}
          />
          <SettingsRow
            icon="sun-o"
            label="Appearance"
            value={themeModeLabel}
            onPress={() => router.push('/settings/appearance')}
          />
          <SettingsRow
            icon="th-large"
            label="Widgets"
            onPress={() => router.push('/settings/widgets')}
            last
          />
        </View>

        {/* Subscription — free users can enter either plan directly. Existing
            subscribers get Apple's in-app, Semora-scoped management sheet. */}
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Subscription</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {!hasPaidPlan && (
            <>
              <SettingsRow
                icon="calendar-o"
                label="Monthly plan"
                value={`${monthlyPrice}/${locale === 'es' ? 'mes' : 'month'}`}
                onPress={() => {
                  track('paywall_open', { screen: 'settings', context: 'settings_monthly' });
                  router.push({ pathname: '/paywall', params: { context: 'settings', plan: 'monthly' } } as any);
                }}
              />
              <SettingsRow
                icon="star"
                label="Yearly plan"
                value={`${annualPrice}/${locale === 'es' ? 'año' : 'year'}`}
                onPress={() => {
                  track('paywall_open', { screen: 'settings', context: 'settings_annual' });
                  router.push({ pathname: '/paywall', params: { context: 'settings', plan: 'annual' } } as any);
                }}
              />
            </>
          )}
          {hasPaidPlan && (
            <SettingsRow
              icon="credit-card"
              label="Manage Semora Plan"
              value={managing ? 'Opening…' : subscriptionPlan === 'annual' ? 'Annual' : subscriptionPlan === 'monthly' ? 'Monthly' : 'Active'}
              onPress={handleManageSubscription}
            />
          )}
          <SettingsRow
            icon="refresh"
            label="Restore Purchases"
            value={restoring ? 'Restoring…' : undefined}
            onPress={handleRestore}
            last
          />
        </View>

        {/* Support — Help & FAQ screen exists but was orphaned; link it here. */}
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Support</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <SettingsRow
            icon="question-circle-o"
            label="Help & FAQ"
            onPress={() => router.push('/settings/help' as any)}
            last
          />
        </View>

        {/* Legal — Apple requires Terms + Privacy to be reachable outside the paywall. */}
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Legal</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <SettingsRow
            icon="file-text-o"
            label="Terms of Service"
            onPress={() => Linking.openURL(locale === 'es' ? 'https://semoraai.com/es/terminos' : 'https://semoraai.com/terms')}
          />
          <SettingsRow
            icon="shield"
            label="Privacy Policy"
            onPress={() => Linking.openURL(locale === 'es' ? 'https://semoraai.com/es/privacidad' : 'https://semoraai.com/privacy')}
            last
          />
        </View>

        {/* Danger zone */}
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Danger Zone</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => router.push('/settings/delete-account')}>
            <FontAwesome name="trash" size={16} color={colors.coral} style={styles.icon} />
            <Text style={[styles.rowLabel, { flex: 1, color: colors.coral }]}>Delete Account</Text>
            <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
          </TouchableOpacity>
        </View>

        <Text style={[styles.hint, { color: colors.ink3 }]}>
          Deleting your account removes all data permanently and cannot be undone.
        </Text>

        <Text style={[styles.version, { color: colors.ink3 }]}>
          Semora {Constants.expoConfig?.version ?? '1.2'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// `pro` marks a row whose destination is a Pro feature. For free users we show
// the same PRO badge treatment used on the calendar/LMS/GPA screens themselves,
// so Settings reads honestly at a glance. The destination screen still owns the
// real gate (teaser → paywall), so tapping keeps navigating there; the badge is
// hidden for Pro users so it never clutters a paid account.
function SettingsRow({ icon, label, value, last, onPress, pro, isPro }: { icon: string; label: string; value?: string; last?: boolean; onPress?: () => void; pro?: boolean; isPro?: boolean }) {
  const colors = useColors();
  const showBadge = pro && !isPro;
  return (
    <TouchableOpacity style={[styles.row, !last && styles.rowBorder, !last && { borderBottomColor: colors.line }]} activeOpacity={0.7} onPress={onPress}>
      <FontAwesome name={icon as any} size={16} color={colors.ink2} style={styles.icon} />
      <Text style={[styles.rowLabel, { flex: 1, color: colors.ink }]}>{label}</Text>
      {showBadge ? (
        <View style={[styles.proBadge, { backgroundColor: colors.brand }]}>
          <FontAwesome name="lock" size={9} color="#fff" />
          <Text style={styles.proBadgeText}>PRO</Text>
        </View>
      ) : (
        value && <Text style={[styles.rowValue, { color: colors.ink3 }]}>{value}</Text>
      )}
      <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 40, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.ink2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 16, marginBottom: 24, borderWidth: 0.5, borderColor: COLORS.line },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  icon: { width: 24, textAlign: 'center', marginRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: COLORS.ink },
  rowSub: { fontSize: 13, color: COLORS.ink3, marginTop: 2 },
  rowValue: { fontSize: 14, color: COLORS.ink3, marginRight: 8 },
  hint: { fontSize: 13, color: COLORS.ink3, lineHeight: 18, paddingHorizontal: 4 },
  // Matches the PRO badge on the calendar/course grade-scale teasers.
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.brand, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginRight: 8 },
  proBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  version: { textAlign: 'center', fontSize: 14, color: COLORS.ink3, marginTop: 24 },
});
