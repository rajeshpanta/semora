import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import type { ProductOrSubscription } from 'react-native-iap';
import { COLORS, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { getProducts, purchaseProduct, restorePurchases, validateAfterPurchase, PRODUCT_IDS, setupPurchaseListeners, setPurchaseAnalyticsContext } from '@/lib/purchases';
import { rescheduleAllTaskReminders } from '@/lib/notifications';
import { track } from '@/lib/analytics';
import { isEligibleForIntroOfferIOS } from 'react-native-iap';
import { supabase } from '@/lib/supabase';

const FEATURES = [
  {
    icon: 'camera' as const,
    title: 'Unlimited Scans & Courses',
    desc: 'Scan unlimited syllabi and add as many courses as you need.',
  },
  {
    icon: 'bar-chart' as const,
    title: 'Workload Dashboard & Study Plan',
    desc: 'See your whole semester at a glance, spot crunch weeks, and get smart “start this now” suggestions.',
  },
  {
    icon: 'graduation-cap' as const,
    title: 'Flashcards, Focus Timer & AI Tutor',
    desc: 'Study with spaced-repetition flashcards, a Pomodoro timer, and an AI tutor that knows your syllabus.',
  },
  {
    icon: 'line-chart' as const,
    title: 'Grade Scale & Forecasting',
    desc: 'Customize grading scales and forecast your final GPA.',
  },
  {
    icon: 'bell' as const,
    title: 'Advance Reminders & Calendar Sync',
    desc: '1- and 3-day advance reminders, class-schedule sync, and export to Apple or Google Calendar.',
  },
  {
    icon: 'users' as const,
    title: 'Share & Streaks',
    desc: 'Share a course with classmates, post your semester, and keep your study streak going.',
  },
];

export default function PaywallScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ context?: string; count?: string; courseId?: string }>();
  const setIsPro = useAppStore((s) => s.setIsPro);
  const setSubscriptionPlan = useAppStore((s) => s.setSubscriptionPlan);
  const colors = useColors();
  const { contentMaxWidth, isXWide } = useResponsive();
  const insets = useSafeAreaInsets();

  // Reverse-trial entry: opened automatically right after the first scan's
  // "aha". Lead with the free trial (momentum, not a block) and dismiss to
  // the freshly-populated course rather than back to the review list.
  const isPostScan = params.context === 'postScan';
  const importedCount = Number(params.count) || 0;

  useEffect(() => {
    track('paywall_viewed', { screen: 'paywall', context: params.context ?? 'direct' });
  }, []);

  // Annual is the recommended path for the default paywall (better value,
  // surfaced first). The post-scan reverse trial instead leads with the
  // monthly free trial, so the CTA reads "Try 7 Days Free".
  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly'>(isPostScan ? 'monthly' : 'annual');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [monthlySub, setMonthlySub] = useState<ProductOrSubscription | null>(null);
  const [annualSub, setAnnualSub] = useState<ProductOrSubscription | null>(null);
  // Whether THIS Apple ID still qualifies for the 7-day intro trial.
  // Default OFF (pessimistic): re-subscribers don't qualify, and promising a
  // trial the payment sheet won't honor is a bait-and-switch / App Review
  // risk. Flipped true only once isEligibleForIntroOfferIOS confirms it.
  const [trialEligible, setTrialEligible] = useState(false);

  // A sheet dismissal can surface BOTH as a requestPurchase rejection
  // (handled in handlePurchase) and via the error listener — dedupe so one
  // cancel never logs purchase_cancelled twice.
  const lastCancelTrackedAt = useRef(0);
  const trackCancelledOnce = () => {
    if (Date.now() - lastCancelTrackedAt.current < 3000) return;
    lastCancelTrackedAt.current = Date.now();
    track('purchase_cancelled', { screen: 'paywall', context: params.context ?? 'direct' });
  };

  useEffect(() => {
    getProducts().then((products) => {
      if (products) {
        setMonthlySub(products.monthly);
        setAnnualSub(products.annual);
        const groupId = (products.monthly as any)?.subscriptionInfoIOS?.subscriptionGroupId;
        if (groupId) {
          isEligibleForIntroOfferIOS(groupId)
            .then((ok: boolean) => setTrialEligible(ok === true))
            .catch(() => {});
        }
      }
    });

    const removeSubs = setupPurchaseListeners(
      async (p) => {
        // StoreKit reports purchase complete — but we don't grant Pro
        // until our edge function has verified the signed transaction
        // and written the entitlement row tied to this Semora account.
        const { data: { session: startSession } } = await supabase.auth.getSession();
        const expectedUserId = startSession?.user.id;
        const entitlement = await validateAfterPurchase(p);
        // Race guard: if the session changed mid-validation (signed out,
        // switched accounts), don't write a stale entitlement to the store.
        const { data: { session: endSession } } = await supabase.auth.getSession();
        if (endSession?.user.id !== expectedUserId) {
          setLoading(false);
          // Don't finish the transaction — let StoreKit redeliver it
          // once the right account is signed in.
          return false;
        }
        // Transient failure = we don't actually know. Don't write a false
        // downgrade (the concurrent _layout listener may have already
        // validated and written Pro); leave the transaction pending.
        if (entitlement.transient && !entitlement.is_pro) {
          setLoading(false);
          Alert.alert(
            'Verification Pending',
            'Your purchase went through but we couldn\'t verify it yet. Tap Restore in a moment to retry.',
          );
          return false;
        }
        setIsPro(entitlement.is_pro);
        setSubscriptionPlan(entitlement.plan);
        setLoading(false);
        if (entitlement.is_pro) {
          // Newly Pro: existing tasks only have same-day reminders (scheduled
          // while free). Reschedule so the 1-/3-day advance reminders appear.
          if (expectedUserId) rescheduleAllTaskReminders(expectedUserId);
          if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          handleClose();
          // Only ack the StoreKit transaction once the server entitlement
          // is written. Otherwise a crash here would charge the user
          // without granting Pro.
          return true;
        }
        if (entitlement.restoreError === 'linked_other_account') {
          Alert.alert(
            'Subscription Linked Elsewhere',
            'This subscription is linked to a different Semora account. Sign in to that account to use Pro on this device, or contact support if it no longer exists.',
          );
          // Terminal: retrying on this account will never succeed, so
          // ack the receipt instead of looping it every launch.
          return true;
        }
        Alert.alert(
          'Verification Pending',
          'Your purchase went through but we couldn\'t verify it with the App Store yet. Tap Restore in a moment to retry.',
        );
        return false;
      },
      (err: any) => {
        // The native layer reports purchase failures through THIS channel
        // (the request promise still resolves) — swallowing them made the
        // Subscribe button look dead. Surface everything except the user
        // closing the payment sheet themselves.
        setLoading(false);
        // The user didn't buy — clear the registered analytics context so a
        // later background-delivered transaction can't inherit it.
        setPurchaseAnalyticsContext(null);
        const code = err?.code;
        if (code === 'user-cancelled' || code === 'E_USER_CANCELLED') {
          // Cancellation is a distinct funnel outcome, never a "failure".
          trackCancelledOnce();
          return;
        }
        // Ask to Buy: a kid's purchase is awaiting parental approval.
        // StoreKit reports this via 'deferred-payment' — it is NOT a
        // failure; the transaction arrives automatically once approved.
        if (code === 'deferred-payment') {
          Alert.alert(
            'Waiting for Approval',
            'This purchase needs approval (Ask to Buy). Pro will activate automatically as soon as it\'s approved — nothing else to do.',
          );
          return;
        }
        // A previous purchase is sitting unfinished (we don't ack until
        // server validation succeeds). Re-buying is blocked by StoreKit —
        // the way out is validating the existing transaction via Restore.
        if (code === 'duplicate-purchase' || code === 'already-owned' || code === 'pending') {
          // Recoverable, but still a failed ATTEMPT — track it with its code
          // so the funnel shows how often users hit the stuck-transaction
          // path (vs. silently losing them to the Later button).
          track('purchase_failed', { screen: 'paywall', reason: String(code) });
          Alert.alert(
            'Almost There',
            'Your earlier purchase is still being finalized. Tap Complete Purchase to finish activating Pro.',
            [
              { text: 'Complete Purchase', onPress: () => handleRestore() },
              { text: 'Later', style: 'cancel' },
            ],
          );
          return;
        }
        // Real failure. Prefer the machine code; fall back to a truncated
        // message. No receipts/identifiers — reasons stay small and non-PII.
        track('purchase_failed', {
          screen: 'paywall',
          reason: String(code ?? err?.message ?? 'unknown').slice(0, 100),
        });
        Alert.alert('Purchase Failed', err?.message ?? 'Something went wrong. Please try again.');
      },
    );

    return removeSubs;
  }, []);

  const annualPrice = annualSub?.displayPrice ?? '$19.99';
  const monthlyPrice = monthlySub?.displayPrice ?? '$3.99';

  // Derived value claims ("Just X/month", "SAVE N%") computed from the
  // STOREFRONT products — hardcoded USD math was wrong in every other
  // region and went stale on any price change (App Review risk). When live
  // product data is unavailable (the hardcoded-fallback path above), these
  // resolve null and the claims are HIDDEN entirely: a missing sub-line
  // beats a confidently wrong number. `price` is the numeric amount and
  // `currency` the ISO code on react-native-iap v15's ProductCommon.
  const { annualPerMonth, savingsPct } = useMemo(() => {
    const annual = typeof annualSub?.price === 'number' ? annualSub.price : null;
    const monthly = typeof monthlySub?.price === 'number' ? monthlySub.price : null;
    let perMonth: string | null = null;
    if (annual !== null && annual > 0 && annualSub?.currency) {
      try {
        // Device locale + the PRODUCT's currency, so "€1.67" in Berlin and
        // "₹99" in Mumbai. Hermes ships full Intl on iOS in SDK 54; the
        // try/catch hides the claim if a storefront currency ever fails.
        perMonth = new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency: annualSub.currency,
        }).format(annual / 12);
      } catch {
        perMonth = null;
      }
    }
    let pct: number | null = null;
    if (annual !== null && annual > 0 && monthly !== null && monthly > 0) {
      const computed = Math.round((1 - annual / 12 / monthly) * 100);
      // Only a sane, positive saving is worth advertising — if pricing ever
      // makes annual NOT cheaper, showing "SAVE 0%" (or negative) is worse
      // than no badge.
      pct = computed >= 1 && computed < 100 ? computed : null;
    }
    return { annualPerMonth: perMonth, savingsPct: pct };
  }, [annualSub, monthlySub]);

  const handleClose = () => {
    // From the post-scan reverse trial, "back" would land on the review
    // list (which we already saved). Send the user to their new course
    // instead — or Today if we somehow don't have the id.
    if (isPostScan) {
      if (params.courseId) {
        router.replace(`/course/${params.courseId}` as any);
      } else {
        router.replace('/(tabs)' as any);
      }
      return;
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)' as any);
    }
  };

  const handlePurchase = async () => {
    const productId = selectedPlan === 'annual' ? PRODUCT_IDS.annual : PRODUCT_IDS.monthly;
    setLoading(true);
    // Register funnel context BEFORE the request: purchase_success fires at
    // the validation choke point in lib/purchases.ts (which the paywall
    // listener AND the global _layout listener both funnel through), where
    // the paywall's context param and trial eligibility aren't reachable.
    setPurchaseAnalyticsContext({
      context: params.context ?? 'direct',
      trial: selectedPlan === 'monthly' && trialEligible,
    });
    try {
      const didPurchase = await purchaseProduct(productId);
      if (!didPurchase) {
        // requestPurchase rejected with user-cancelled (the v15 promise-side
        // cancellation path — see purchaseProduct).
        setLoading(false);
        setPurchaseAnalyticsContext(null);
        trackCancelledOnce();
      }
    } catch (err: any) {
      setLoading(false);
      setPurchaseAnalyticsContext(null);
      // Pre-flight failures (store unreachable, product cache empty) never
      // reach the error listener — track them here.
      track('purchase_failed', {
        screen: 'paywall',
        reason: String(err?.code ?? err?.message ?? 'unknown').slice(0, 100),
      });
      Alert.alert('Purchase Failed', err.message ?? 'Something went wrong. Please try again.');
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const { data: { session: startSession } } = await supabase.auth.getSession();
      const expectedUserId = startSession?.user.id;
      const entitlement = await restorePurchases();
      // Race guard: see purchase listener above.
      const { data: { session: endSession } } = await supabase.auth.getSession();
      if (endSession?.user.id !== expectedUserId) {
        return;
      }
      // Transient network/server failure — we don't actually know the
      // answer, so don't write it and don't claim "no subscription".
      if (entitlement.transient && !entitlement.is_pro) {
        Alert.alert('Connection Issue', 'We couldn\'t reach the server to check your subscription. Please try again in a moment.');
        return;
      }
      setIsPro(entitlement.is_pro);
      setSubscriptionPlan(entitlement.plan);
      if (entitlement.is_pro) {
        if (expectedUserId) rescheduleAllTaskReminders(expectedUserId);
        if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Restored', 'Your Pro subscription has been restored.', [
          { text: 'OK', onPress: handleClose },
        ]);
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

  return (
    <View style={[styles.screen, { backgroundColor: colors.paper }]}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Fixed close button outside ScrollView */}
        <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.card, top: insets.top + 8 }]} onPress={handleClose} hitSlop={16} accessibilityRole="button" accessibilityLabel="Close">
          <FontAwesome name="times" size={20} color={colors.ink2} />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} showsVerticalScrollIndicator={false} bounces={false}>

          {/* Hero */}
          <View style={[styles.hero, { backgroundColor: colors.ink }]}>
            <View style={[styles.heroGlow, { backgroundColor: colors.brand }]} />
            <View style={styles.proLabel}>
              <FontAwesome name="star" size={11} color={colors.brand100} />
              <Text style={[styles.proLabelText, { color: colors.brand100 }]}>SEMORA PRO</Text>
            </View>
            {isPostScan ? (
              <>
                <Text style={styles.heroTitle}>
                  {importedCount > 0
                    ? `You just imported ${importedCount} deadline${importedCount !== 1 ? 's' : ''} 🎉`
                    : 'Your first scan is done 🎉'}
                </Text>
                <Text style={styles.heroSubtitle}>
                  Keep the momentum — go unlimited and put every class on autopilot.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.heroTitle}>Unlimited scans, smart plans, grade forecasts.</Text>
                <Text style={styles.heroSubtitle}>
                  Everything you need to ace your semester.
                </Text>
              </>
            )}
          </View>

          {/* Features */}
          <Text style={[styles.sectionLabel, { color: colors.ink3 }]}>WHAT YOU GET</Text>
          <View style={[styles.featureList, { backgroundColor: colors.card, borderColor: colors.line }]}>
            {FEATURES.map((f, i) => (
              <View key={i} style={[styles.featureRow, i < FEATURES.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.line }]}>
                <View style={[styles.featureIcon, { backgroundColor: colors.brand50 }]}>
                  <FontAwesome name={f.icon} size={15} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.featureTitle, { color: colors.ink }]}>{f.title}</Text>
                  <Text style={[styles.featureDesc, { color: colors.ink3 }]}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Plan Selection */}
          <Text style={[styles.sectionLabel, { color: colors.ink3 }]}>CHOOSE YOUR PLAN</Text>

          {/* On a big iPad the two plan cards sit side-by-side; everywhere
              else they stack (iPhone unchanged). */}
          <View style={isXWide && styles.planRow}>
          {/* Annual — first and pre-selected to steer users toward the
              better-value plan. */}
          <TouchableOpacity
            style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.line }, isXWide && styles.planCardWide, selectedPlan === 'annual' && { backgroundColor: colors.brand50, borderColor: colors.brand }]}
            onPress={() => setSelectedPlan('annual')}
            activeOpacity={0.8}
          >
            <View style={styles.planRadio}>
              <View style={[styles.radioOuter, { borderColor: colors.ink3 }, selectedPlan === 'annual' && { borderColor: colors.brand }]}>
                {selectedPlan === 'annual' && <View style={[styles.radioInner, { backgroundColor: colors.brand }]} />}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.planName, { color: colors.ink }]}>Annual</Text>
              <Text style={[styles.planPrice, { color: colors.ink }]}>{annualPrice}<Text style={[styles.planPeriod, { color: colors.ink2 }]}>/year</Text></Text>
              {/* Rendered empty (not removed) when live prices are missing so
                  the card keeps its height (planSub has minHeight). */}
              <Text style={[styles.planSub, { color: colors.ink3 }]}>{annualPerMonth ? `Just ${annualPerMonth}/month` : ''}</Text>
            </View>
            {savingsPct !== null && (
              <View style={[styles.saveBadge, { backgroundColor: colors.teal }]}>
                <Text style={styles.saveBadgeText}>SAVE {savingsPct}%</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Monthly */}
          <TouchableOpacity
            style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.line }, isXWide && styles.planCardWide, selectedPlan === 'monthly' && { backgroundColor: colors.brand50, borderColor: colors.brand }]}
            onPress={() => setSelectedPlan('monthly')}
            activeOpacity={0.8}
          >
            <View style={styles.planRadio}>
              <View style={[styles.radioOuter, { borderColor: colors.ink3 }, selectedPlan === 'monthly' && { borderColor: colors.brand }]}>
                {selectedPlan === 'monthly' && <View style={[styles.radioInner, { backgroundColor: colors.brand }]} />}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.planName, { color: colors.ink }]}>Monthly</Text>
              <Text style={[styles.planPrice, { color: colors.ink }]}>{monthlyPrice}<Text style={[styles.planPeriod, { color: colors.ink2 }]}>/month</Text></Text>
              <Text style={[styles.planSub, { color: colors.ink3 }]}>{trialEligible ? '7-day free trial included' : 'Auto-renews monthly'}</Text>
            </View>
            {selectedPlan === 'monthly' && (
              <View style={[styles.trialBadge, { backgroundColor: colors.brand }]}>
                <Text style={styles.trialBadgeText}>{trialEligible ? 'FREE TRIAL' : 'FLEXIBLE'}</Text>
              </View>
            )}
          </TouchableOpacity>
          </View>

          {/* CTA */}
          <TouchableOpacity onPress={handlePurchase} disabled={loading} activeOpacity={0.85} style={{ marginTop: 20 }}>
            <LinearGradient
              colors={['#6B46C1', '#553C9A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.ctaBtn}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>
                  {selectedPlan === 'monthly' && trialEligible ? 'Try 7 Days Free' : 'Subscribe Now'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <Text style={[styles.finePrint, { color: colors.ink3 }]}>
            {selectedPlan === 'monthly'
              ? trialEligible
                ? `7-day free trial, then ${monthlyPrice}/month. Cancel anytime.`
                : `${monthlyPrice}/month. Cancel anytime.`
              : `${annualPrice} billed annually. Cancel anytime.`}
          </Text>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={handleRestore} disabled={restoring}>
              <Text style={[styles.footerLink, { color: colors.ink3 }]}>{restoring ? 'Restoring...' : 'Restore'}</Text>
            </TouchableOpacity>
            <Text style={[styles.footerDot, { color: colors.ink3 }]}> · </Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://rajeshpanta.github.io/semora/terms.html')}>
              <Text style={[styles.footerLink, { color: colors.ink3 }]}>Terms</Text>
            </TouchableOpacity>
            <Text style={[styles.footerDot, { color: colors.ink3 }]}> · </Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://rajeshpanta.github.io/semora/privacy.html')}>
              <Text style={[styles.footerLink, { color: colors.ink3 }]}>Privacy</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.paper },
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },

  // Close — fixed at top right, outside scroll
  closeBtn: {
    // `top` is applied inline from useSafeAreaInsets().top + 8 so the button
    // clears the notch / Dynamic Island in portrait AND landscape.
    position: 'absolute', right: 20, zIndex: 10,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },

  // Hero — dark card matching Me tab style
  hero: {
    backgroundColor: COLORS.ink,
    borderRadius: 22, padding: 20,
    marginBottom: 24, marginTop: 8,
    overflow: 'hidden', position: 'relative',
  },
  heroGlow: {
    position: 'absolute', right: -30, top: -30,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: COLORS.brand, opacity: 0.4,
  },
  proLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8,
  },
  proLabelText: {
    fontSize: 12, fontWeight: '800', letterSpacing: 1.5, color: COLORS.brand100,
  },
  heroTitle: {
    fontFamily: FONTS.display, fontSize: 22, color: '#fff',
    lineHeight: 28, maxWidth: 260,
  },
  heroSubtitle: {
    fontSize: 14, color: 'rgba(255,255,255,0.55)',
    marginTop: 6,
  },

  // Section
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.ink3,
    letterSpacing: 1.2, marginBottom: 12,
  },

  // Features
  featureList: {
    backgroundColor: COLORS.card, borderRadius: 16,
    paddingHorizontal: 14, marginBottom: 24,
    borderWidth: 0.5, borderColor: COLORS.line,
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, gap: 12,
  },
  featureRowBorder: {
    borderBottomWidth: 0.5, borderBottomColor: COLORS.line,
  },
  featureIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: COLORS.brand50,
    alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: {
    fontSize: 14, fontWeight: '600', color: COLORS.ink,
    marginBottom: 1,
  },
  featureDesc: {
    fontSize: 12, color: COLORS.ink3, lineHeight: 16,
  },

  // Plans
  planCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 14,
    padding: 14, marginBottom: 8,
    borderWidth: 1.5, borderColor: COLORS.line,
  },
  // isXWide: two plan cards side-by-side on a big iPad.
  planRow: { flexDirection: 'row', gap: 12 },
  planCardWide: { flex: 1, marginBottom: 8 },
  planCardSelected: {
    backgroundColor: COLORS.brand50,
    borderColor: COLORS.brand,
  },
  planRadio: { marginRight: 12 },
  radioOuter: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: COLORS.ink3,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: COLORS.brand },
  radioInner: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.brand,
  },
  planName: { fontSize: 14, fontWeight: '600', color: COLORS.ink },
  planPrice: {
    fontSize: 17, fontWeight: '700', color: COLORS.ink,
    marginTop: 1,
  },
  planPeriod: { fontSize: 12, fontWeight: '400', color: COLORS.ink2 },
  planSub: { fontSize: 11, color: COLORS.ink3, marginTop: 1, minHeight: 14 },
  saveBadge: {
    backgroundColor: COLORS.teal,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  saveBadgeText: {
    fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5,
  },
  trialBadge: {
    backgroundColor: COLORS.brand,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  trialBadgeText: {
    fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 0.5,
  },

  // CTA
  ctaBtn: {
    height: 50, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: {
    fontSize: 15, fontWeight: '600', color: '#fff',
    letterSpacing: 0.3,
  },
  finePrint: {
    fontSize: 12, color: COLORS.ink3, textAlign: 'center',
    marginTop: 10, lineHeight: 16,
  },

  // Footer
  footer: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 24, paddingBottom: 20,
  },
  footerLink: { fontSize: 13, color: COLORS.ink3, fontWeight: '500' },
  footerDot: { fontSize: 13, color: COLORS.ink3 },
});
