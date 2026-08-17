import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text } from '@/components/LocalizedReactNative';
import {
  View,
  StyleSheet,
  ScrollView,
  Share,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSession } from '@/app/_layout';
import { useAppStore, findCurrentSemester } from '@/store/appStore';
import { useSemesters, useCourses, useTaskStats } from '@/lib/queries';
import { signOut } from '@/lib/auth';
import { displayName } from '@/lib/user';
import { COLORS, PROMO_SURFACE, FONTS, SCREEN_MAX_WIDTH, APP_STORE_REVIEW_URL, MARKETING_URL, SUPPORT_EMAIL } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { getAppLocale } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { getProducts, isEligibleForIntroOffer } from '@/lib/purchases';
import { getMyCode, getRedemptionCount, inviteLink, applyPendingReferral, syncPromoPro } from '@/lib/referral';
import { track } from '@/lib/analytics';
import { shareLink, shareLinkMessage } from '@/lib/shareLink';
import { GlobalSearchButton } from '@/components/GlobalSearchButton';

export default function MeScreen() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const { session } = useSession();
  const name = displayName(session?.user, 'User');
  const initial = (name[0] ?? '?').toUpperCase();
  const [signingOut, setSigningOut] = useState(false);
  // Real store prices (regional/currency-correct); hardcoded strings are
  // only the fallback while products load or the store is unreachable.
  const [annualPrice, setAnnualPrice] = useState('$19.99');
  const [monthlyPrice, setMonthlyPrice] = useState('$3.99');
  // Default OFF: only promise the 7-day trial once Apple confirms THIS
  // Apple ID is still intro-offer eligible. Promising a trial the payment
  // sheet won't honor (re-subscribers) is a bait-and-switch / App Review risk.
  const [trialEligible, setTrialEligible] = useState(false);
  useEffect(() => {
    getProducts().then((p) => {
      if (p?.annual?.displayPrice) setAnnualPrice(p.annual.displayPrice);
      if (p?.monthly?.displayPrice) setMonthlyPrice(p.monthly.displayPrice);
      const groupId = (p?.monthly as any)?.subscriptionInfoIOS?.subscriptionGroupId;
      if (groupId) {
        isEligibleForIntroOffer(groupId)
          .then((ok: boolean) => setTrialEligible(ok === true))
          .catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const handleSignOut = () => {
    if (signingOut) return;
    Alert.alert(
      'Sign out?',
      'You\'ll need to sign in again to use Semora.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            try {
              // Logging out is an exit from the web app, not a request to
              // create another account. The redirect lives inside signOut so
              // it runs only after the storage clears have settled — doing it
              // here raced the page unload against them.
              await signOut({ landing: 'marketing' });
            } finally {
              // Don't reset on success — native unmounts when AuthGate sees
              // the cleared session, while web leaves for the marketing site.
              // Reset only matters if signOut throws.
              setSigningOut(false);
            }
          },
        },
      ],
    );
  };

  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);
  const isPro = useAppStore((s) => s.isPro);
  const { data: semesters = [] } = useSemesters();
  const { data: courses = [] } = useCourses(selectedSemesterId);
  const { data: stats } = useTaskStats(selectedSemesterId);

  useEffect(() => {
    if (semesters.length === 0) return;
    if (!selectedSemesterId || !semesters.some((s) => s.id === selectedSemesterId)) setSelectedSemester(findCurrentSemester(semesters));
  }, [semesters, selectedSemesterId]);

  const activeSemester = semesters.find((s) => s.id === selectedSemesterId);
  const router = useRouter();

  // Send the tap to the App Store review composer rather than the in-app
  // prompt. requestReview() is throttled by Apple to roughly three prompts a
  // year and no-ops silently past that — and Today already spends one of those
  // on its own automatic prompt, so this button was frequently doing nothing at
  // all. It has no web implementation either, which is why it only ever showed
  // an apology on app.semoraai.com.
  //
  // Opening the store also gives the web the behaviour we want for free: a
  // browser visitor who has never installed Semora lands on the listing.
  const handleRate = async () => {
    track('rate_tapped', { screen: 'me' });
    try {
      await Linking.openURL(APP_STORE_REVIEW_URL);
    } catch {
      Alert.alert('Rate Semora', 'Could not open the App Store. You can search for Semora there to leave a review.');
    }
  };

  /**
   * Open the support form on semoraai.com, optionally with a topic chosen.
   *
   * Deliberately the web form rather than a `mailto:` link. A mailto opens
   * nothing at all on a device with no mail account configured, and the app
   * cannot tell — the tap simply appears to do nothing. The form POSTs to
   * Supabase, so the message is stored before an email is attempted and
   * reaches us either way (website/SUPPORT_FORM.md).
   */
  const openSupport = async (topic?: 'feature') => {
    track('support_opened', { screen: 'me', topic: topic ?? 'general' });
    const url = topic ? `${MARKETING_URL}/support?topic=${topic}` : `${MARKETING_URL}/support`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'Contact support',
        `Email us at ${SUPPORT_EMAIL} and we'll get back to you within 24 hours.`,
      );
    }
  };

  // ── Invite friends (referral) ────────────────────────────────
  // The Me tab is the canonical place to apply a code stashed pre-signup
  // (a friend who tapped an invite link before creating an account) — it's
  // hit on every account after onboarding, and applyPendingReferral is
  // idempotent, so this needs no _layout wiring. Also reflect any active
  // promo grant locally in case the launch entitlement read (entitlements
  // table only) missed a referral month.
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState(0);
  const [sharingInvite, setSharingInvite] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Apply a stashed code first (may grant Pro), then load the code + count
    // so "N friends joined" reflects a just-applied redemption too.
    applyPendingReferral()
      .catch(() => {})
      .finally(() => {
        syncPromoPro().catch(() => {});
        getMyCode().then((c) => { if (!cancelled) setReferralCode(c); }).catch(() => {});
        getRedemptionCount().then((n) => { if (!cancelled) setReferralCount(n); }).catch(() => {});
      });
    return () => { cancelled = true; };
  }, []);

  const handleShareInvite = async () => {
    if (sharingInvite) return;
    // Lazily create the code if it wasn't loaded yet, so the button always works.
    const code = referralCode ?? (await getMyCode());
    if (!code) {
      Alert.alert('Try again', 'We couldn\'t prepare your invite link. Please check your connection and try again.');
      return;
    }
    if (!referralCode) setReferralCode(code);
    setSharingInvite(true);
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    try {
      const link = inviteLink(code);
      const result = await shareLink({
        url: link,
        message: getAppLocale() === 'es'
          ? `Acompáñame en Semora, el escáner de programas con IA que organiza todo el semestre. Usa mi enlace y ambos recibiremos un mes gratis de Pro: ${link}`
          : `Join me on Semora — the AI syllabus scanner that puts your whole semester on autopilot. Use my link and we both get a free month of Pro: ${link}`,
      });
      const note = shareLinkMessage(result, link);
      if (note) Alert.alert(note.title, note.body);
      track('referral_shared', { screen: 'me', result });
    } catch (err: any) {
      // Share.share rejects only if the sheet fails to present (user-dismiss
      // doesn't reject on iOS), so anything here is a real failure.
      Alert.alert('Couldn\'t share', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSharingInvite(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} showsVerticalScrollIndicator={false}>
        {/* Profile */}
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: colors.brand }]}><Text style={styles.avatarText}>{initial}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: colors.ink }]}>{name}</Text>
            <Text style={[styles.profileSub, { color: colors.ink3 }]}>{activeSemester?.name ?? 'No semester'}</Text>
          </View>
          <GlobalSearchButton />
        </View>

        {/* Pro status when subscribed, a pitch when not.
            These used to be one card, which meant a paying subscriber got a
            full-height promo panel — glow, display type and all — to be told
            something they already knew. Status is a line, not a billboard. */}
        {isPro ? (
          <View style={[styles.proStatus, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <FontAwesome name="check-circle" size={15} color={colors.teal} />
            <Text style={[styles.proStatusText, { color: colors.ink }]}>Semora Pro</Text>
            <Text style={[styles.proStatusMeta, { color: colors.ink3 }]}>Active</Text>
          </View>
        ) : (
        <TouchableOpacity
          style={[styles.proCard, { backgroundColor: PROMO_SURFACE }]}
          activeOpacity={0.85}
          onPress={() => router.push('/paywall' as any)}
        >
          <View style={[styles.proGlow, { backgroundColor: colors.brand }]} />
          <View style={{ position: 'relative' }}>
            <View style={styles.proLabel}>
              <FontAwesome name="star" size={11} color={colors.brand100} />
              <Text style={[styles.proLabelText, { color: colors.brand100 }]}>SEMORA PRO</Text>
            </View>
            {(
              <>
                <Text style={styles.proTitle}>Unlimited scans, smart plans, grade forecasts.</Text>
                <View style={styles.proPrice}>
                  <Text style={styles.proPriceAmount}>{annualPrice}</Text>
                  <Text style={styles.proPricePeriod}>/year · cancel any time</Text>
                </View>
                <View style={styles.proButton}>
                  <Text style={styles.proButtonText}>Upgrade to Pro</Text>
                </View>
                <Text style={styles.proAlt}>
                  {trialEligible
                    ? `Or ${monthlyPrice}/month with 7-day free trial`
                    : `Or ${monthlyPrice}/month`}
                </Text>
              </>
            )}
          </View>
        </TouchableOpacity>
        )}

        {/* Share my semester — the organic-growth entry point. A tasteful
            card under the Pro card; the screen itself gates Pro + shows the
            locked teaser, so this is always tappable. */}
        <TouchableOpacity
          style={[styles.shareCard, { backgroundColor: colors.brand50, borderColor: colors.brand100 }]}
          activeOpacity={0.85}
          onPress={() => router.push('/share-semester' as any)}
        >
          <View style={[styles.shareIcon, { backgroundColor: colors.brand }]}>
            <FontAwesome name="share-square-o" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.shareTitle, { color: colors.ink }]}>Share my semester</Text>
            <Text style={[styles.shareSub, { color: colors.ink3 }]}>A beautiful card of your whole term</Text>
          </View>
          <FontAwesome name="chevron-right" size={12} color={colors.brand} />
        </TouchableOpacity>

        {/* Invite friends — referral growth engine. Both sides get a free
            month of Pro. Matches the shareCard styling; the Share button opens
            the native sheet with semora://invite?code=... */}
        <View style={[styles.inviteCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={styles.inviteHeader}>
            <View style={[styles.inviteIcon, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name="gift" size={16} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.inviteTitle, { color: colors.ink }]}>Invite friends</Text>
              <Text style={[styles.inviteSub, { color: colors.ink3 }]}>
                You both get a free month of Pro
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.inviteBtn, { backgroundColor: colors.brand }, sharingInvite && { opacity: 0.6 }]}
            activeOpacity={0.85}
            onPress={handleShareInvite}
            disabled={sharingInvite}
          >
            <FontAwesome name="share" size={13} color="#fff" />
            <Text style={styles.inviteBtnText}>Share invite link</Text>
          </TouchableOpacity>

          <Text style={[styles.inviteCount, { color: colors.ink3 }]}>
            {referralCount === 0
              ? 'No friends yet — share your link to get started'
              : `${referralCount} friend${referralCount !== 1 ? 's' : ''} joined`}
          </Text>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.statNum, { color: colors.brand }]}>{courses.length}</Text>
            <Text style={[styles.statLabel, { color: colors.ink3 }]}>COURSES</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.statNum, { color: colors.ink }]}>{stats?.completed ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.ink3 }]}>DONE</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={[styles.statNum, { color: colors.coral }]}>{stats?.pending ?? 0}</Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.ink3 }]}>PENDING</Text>
          </View>
        </View>

        {/* Academic tools — relocated from Settings (these are feature screens,
            not settings). The destination screens own their own Pro gating, so
            these are always tappable. Mirrors WebAppFrame.tsx's TOOL_ITEMS list
            (icons/labels/routes kept identical) so native and desktop-web give
            the same set of tools the same visibility — on native this was the
            only way to reach these mid-2026: no tab-bar presence, only a
            Today-tab card or drilling into a specific course. */}
        <Text style={[styles.toolsTitle, { color: colors.ink2 }]}>Academic tools</Text>
        <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <SettingsRow icon="bolt" label="Smart Plan" onPress={() => router.push('/planner' as any)} colors={colors} />
          <SettingsRow icon="bar-chart" label="Workload" onPress={() => router.push('/dashboard' as any)} colors={colors} />
          <SettingsRow icon="line-chart" label="Progress Insights" onPress={() => router.push('/insights' as any)} colors={colors} />
          <SettingsRow icon="clone" label="Flashcards" onPress={() => router.push('/flashcards' as any)} colors={colors} />
          <SettingsRow icon="clock-o" label="Focus Timer" onPress={() => router.push('/pomodoro' as any)} colors={colors} />
          <SettingsRow icon="comments-o" label="AI Tutor" onPress={() => router.push('/tutor' as any)} colors={colors} />
          <SettingsRow icon="users" label="Class Collaboration" last onPress={() => router.push('/collaboration' as any)} colors={colors} />
        </View>

        {/* Settings & Support */}
        <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <SettingsRow icon="cog" label="Settings" onPress={() => router.push('/settings')} colors={colors} />
          <SettingsRow icon="question-circle-o" label="Help & FAQ" onPress={() => router.push('/settings/help')} colors={colors} />
          <SettingsRow icon="life-ring" label="Contact support" onPress={() => openSupport()} colors={colors} />
          <SettingsRow icon="lightbulb-o" label="Request a feature" onPress={() => openSupport('feature')} colors={colors} />
          <SettingsRow icon="star-o" label="Rate Semora" last onPress={handleRate} colors={colors} />
        </View>

        {/* Sign out */}
        <TouchableOpacity
          style={[
            styles.signOutBtn,
            { backgroundColor: colors.card, borderColor: colors.line },
            signingOut && { opacity: 0.5 },
          ]}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.7}
        >
          <FontAwesome name="sign-out" size={14} color={colors.coral} />
          <Text style={[styles.signOutText, { color: colors.coral }]}>
            {signingOut ? 'Signing out...' : 'Sign Out'}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.ink3 }]}>
          Semora {Constants.expoConfig?.version ?? '1.2'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsRow({ icon, label, last, onPress, colors }: { icon: string; label: string; last?: boolean; onPress?: () => void; colors?: any }) {
  const c = colors ?? COLORS;
  return (
    <TouchableOpacity style={[styles.settingsRow, !last && [styles.settingsRowBorder, { borderBottomColor: c.line }]]} activeOpacity={0.7} onPress={onPress}>
      <FontAwesome name={icon as any} size={16} color={c.ink2} />
      <Text style={[styles.settingsLabel, { color: c.ink }]}>{label}</Text>
      <FontAwesome name="chevron-right" size={11} color={c.ink3} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 120, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, marginBottom: 20 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.brand, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  profileName: { fontFamily: FONTS.displaySemibold, fontSize: 20, color: COLORS.ink },
  profileSub: { fontSize: 14, color: COLORS.ink3, marginTop: 2 },
  // Pro card — bold premium design
  // Full size on purpose: a free account should be in no doubt that it is on
  // the free tier, and a small card reads as a footnote rather than a state.
  // Only the SUBSCRIBED state shrank (proStatus below) — nothing to sell to
  // someone who already bought.
  proCard: { backgroundColor: COLORS.ink, borderRadius: 22, padding: 22, marginBottom: 20, overflow: 'hidden' },
  // Subscribed state: one line. Nothing to sell to someone who already bought.
  proStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 14, borderWidth: 0.5, paddingVertical: 11, paddingHorizontal: 14,
    marginBottom: 14,
  },
  proStatusText: { fontSize: 15, fontWeight: '700' },
  proStatusMeta: { fontSize: 13.5, marginLeft: 'auto' },
  proGlow: { position: 'absolute', right: -30, top: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: COLORS.brand, opacity: 0.4 },
  proLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  proLabelText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, color: COLORS.brand100 },
  proTitle: { fontFamily: FONTS.display, fontSize: 22, color: '#fff', lineHeight: 28, maxWidth: 240 },
  proPrice: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 16 },
  proPriceAmount: { fontSize: 28, fontWeight: '800', color: '#fff' },
  proPricePeriod: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  proButton: { backgroundColor: '#fff', borderRadius: 14, padding: 13, alignItems: 'center', marginTop: 14 },
  proButtonText: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  proAlt: { fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 10 },
  // Share my semester entry
  shareCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: COLORS.brand50, borderRadius: 18, padding: 14, marginBottom: 20, borderWidth: 0.5, borderColor: COLORS.brand100 },
  shareIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: COLORS.brand, alignItems: 'center', justifyContent: 'center' },
  shareTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  shareSub: { fontSize: 12.5, color: COLORS.ink3, marginTop: 1 },
  // Invite friends (referral)
  inviteCard: { backgroundColor: COLORS.card, borderRadius: 18, padding: 14, marginBottom: 20, borderWidth: 0.5, borderColor: COLORS.line },
  inviteHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  inviteIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: COLORS.brand50, alignItems: 'center', justifyContent: 'center' },
  inviteTitle: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  inviteSub: { fontSize: 12.5, color: COLORS.ink3, marginTop: 1 },
  inviteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 44, borderRadius: 12, backgroundColor: COLORS.brand },
  inviteBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  inviteCount: { fontSize: 12.5, color: COLORS.ink3, textAlign: 'center', marginTop: 10 },
  // Stats
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 18, padding: 12, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.line },
  statNum: { fontSize: 22, fontWeight: '600', color: COLORS.ink },
  statLabel: { fontSize: 14, color: COLORS.ink3, fontWeight: '500', letterSpacing: 0.5, marginTop: 2 },
  // Settings
  toolsTitle: { fontSize: 13, fontWeight: '600', color: COLORS.ink2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  settingsCard: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 14, marginBottom: 20, borderWidth: 0.5, borderColor: COLORS.line },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  settingsRowBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  settingsLabel: { flex: 1, fontSize: 14, color: COLORS.ink },
  // Sign out
  signOutBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.line, marginBottom: 16 },
  signOutText: { fontSize: 14, fontWeight: '500', color: COLORS.coral },
  version: { textAlign: 'center', fontSize: 14, color: COLORS.ink3 },
});
