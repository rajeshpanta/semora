import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Alert } from '@/components/LocalizedReactNative';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { getProducts, purchaseProduct, PRODUCT_IDS } from '@/lib/purchases';
import { track } from '@/lib/analytics';
import { FREE_COURSE_LIMIT } from '@/lib/syllabus';

// The upgrade moment, as a sheet rather than a screen.
//
// Hitting the free limit used to fire a plain Alert whose "Upgrade" button
// pushed a full paywall screen. That is two taps and a context switch at the
// exact instant the student is trying to do something — and the alert had no
// room to say what Pro actually gives, so the decision was made on nothing.
// This puts the offer where the refusal happens.
//
// NOTE ON HONESTY: no social-proof count appears here. Semora has ~47 accounts;
// a "join 20,000+ students" line would be fabricated, and in a purchase flow
// that is false advertising (App Store 2.3), not marketing. The trust line
// below says only things that are true.

export type ProUpsellReason = 'scan' | 'notes' | 'lecture' | 'course' | 'canvas';

const COPY: Record<ProUpsellReason, { title: string; subtitle: string }> = {
  scan: {
    title: 'Scan every syllabus',
    subtitle: 'You have used your one free AI action. Pro reads every syllabus you have.',
  },
  notes: {
    title: 'Turn every file into notes',
    subtitle: 'You have used your one free AI action. Pro has no limit on files or lectures.',
  },
  lecture: {
    title: 'Record every lecture',
    subtitle: 'You have used your one free AI action. Pro records and transcribes all term.',
  },
  // Deliberately NOT the "one free AI action" line the other three share. A
  // student who hits the course cap may still have their free action unspent —
  // they are blocked by how many classes a free semester holds, not by AI use.
  // Telling them they have used something they have not is the kind of wrong
  // that makes a paywall feel like a trick.
  // Canvas is the strongest reason to upgrade Semora has, so it says what it
  // does rather than what it costs. Deliberately NOT the "one free AI action"
  // line: nobody hits this by running out of anything — Canvas sync simply
  // requires Pro, and pretending otherwise would be a different lie.
  canvas: {
    title: 'Let Canvas fill in your semester',
    subtitle: 'Pro connects Canvas: every class imports itself, and deadlines stay right when your instructor moves them.',
  },
  course: {
    title: 'Add every class',
    subtitle: `Free semesters hold ${FREE_COURSE_LIMIT} courses. Pro has no limit on classes or semesters.`,
  },
};

const BENEFITS = [
  'Unlimited scans, lectures and file uploads',
  'Notes, flashcards and practice quizzes',
  'AI tutor, Smart Plan and grade forecasting',
];

export function ProUpsellSheet({
  visible,
  reason,
  onClose,
}: {
  visible: boolean;
  reason: ProUpsellReason;
  onClose: () => void;
}) {
  const colors = useColors();
  const router = useRouter();
  const [plan, setPlan] = useState<'annual' | 'monthly'>('annual');
  // Real store prices where StoreKit gives them; these are the fallbacks and
  // the web values. Never show a price the payment sheet will not honour.
  const [monthlyPrice, setMonthlyPrice] = useState('$3.99');
  const [annualPrice, setAnnualPrice] = useState('$19.99');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!visible) return;
    track('pro_upsell_shown', { screen: 'upsell_sheet', reason });
    getProducts().then((p) => {
      if (p?.monthly?.displayPrice) setMonthlyPrice(p.monthly.displayPrice);
      if (p?.annual?.displayPrice) setAnnualPrice(p.annual.displayPrice);
    }).catch(() => {});
  }, [visible, reason]);

  const copy = COPY[reason];

  const choose = async () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    track('pro_upsell_continue', { screen: 'upsell_sheet', reason, plan });

    // WEB: go straight to Stripe from here.
    //
    // This used to push /paywall for everyone, which made hitting the free
    // limit cost three taps across two screens — refusal, sheet, paywall, then
    // the actual buy button. On web there is no reason for the middle screen:
    // the sheet already shows both prices and what Pro includes, and
    // purchaseProduct() simply redirects the tab to Stripe Checkout. One tap.
    //
    // NATIVE still routes to /paywall on purpose. StoreKit purchases need the
    // transaction listeners, receipt validation and restore path that live on
    // that screen; running a native purchase from a modal would duplicate all
    // of it, and getting receipt validation subtly wrong is how a paying
    // customer ends up without Pro.
    if (Platform.OS !== 'web') {
      onClose();
      router.push({ pathname: '/paywall', params: { context: `upsell_${reason}`, plan } } as any);
      return;
    }

    setStarting(true);
    try {
      await purchaseProduct(plan === 'annual' ? PRODUCT_IDS.annual : PRODUCT_IDS.monthly);
      // Reached only if the redirect has not taken effect yet; the tab is on
      // its way to Stripe. Deliberately NOT tracked as a cancellation — that
      // mistake is what made every web checkout look abandoned.
      track('purchase_checkout_started', { screen: 'upsell_sheet', reason, plan });
    } catch (err: any) {
      setStarting(false);
      const title = err?.code === 'ALREADY_PRO' ? 'You already have Pro' : 'Could not start checkout';
      Alert.alert(title, err?.message ?? 'Something went wrong. Please try again.');
      return;
    }
    setStarting(false);
    onClose();
  };

  const dismiss = () => {
    track('pro_upsell_dismissed', { screen: 'upsell_sheet', reason });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.host}>
        <Pressable style={styles.backdrop} onPress={dismiss} accessible={false} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <TouchableOpacity
              style={styles.close}
              onPress={dismiss}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <FontAwesome name="times" size={17} color={colors.ink3} />
            </TouchableOpacity>

            {/* Horizontal padding keeps a long title clear of the absolutely
                positioned close button. "Turn every file into notes" ran
                under the x on a 393pt phone without it. */}
            <Text style={[styles.title, { color: colors.ink }]}>{copy.title}</Text>
            <Text style={[styles.subtitle, { color: colors.ink2 }]}>{copy.subtitle}</Text>

            <View style={styles.benefits}>
              {BENEFITS.map((b) => (
                <View key={b} style={styles.benefitRow}>
                  <FontAwesome name="check" size={13} color={colors.teal} style={styles.check} />
                  <Text style={[styles.benefitText, { color: colors.ink }]}>{b}</Text>
                </View>
              ))}
            </View>

            {/* Only claims that survive checking. */}
            <Text style={[styles.trust, { color: colors.ink3 }]}>
              Cancel anytime · Secure checkout
            </Text>

            <PlanCard
              selected={plan === 'annual'}
              onPress={() => setPlan('annual')}
              name="Yearly"
              badge="MOST POPULAR"
              // 19.99/52 ≈ 0.38. The saving is against 12 × 3.99 = 47.88,
              // which is 58% — not a rounder number invented to look better.
              headline="$0.38"
              headlineUnit="/week"
              save="Save 58%"
              strike={`${monthlyPrice}/mo`}
              footnote={`Billed ${annualPrice}/year`}
              colors={colors}
            />
            <PlanCard
              selected={plan === 'monthly'}
              onPress={() => setPlan('monthly')}
              name="Monthly"
              headline={monthlyPrice}
              headlineUnit="/month"
              footnote="Cancel anytime"
              colors={colors}
            />

            <TouchableOpacity
              style={[styles.cta, { backgroundColor: colors.brand }, starting && { opacity: 0.6 }]}
              onPress={choose}
              disabled={starting}
              activeOpacity={0.85}
              accessibilityRole="button"
              // Web goes straight to Stripe now, so the label has to say so —
              // "Continue" implied another screen, which is exactly the step
              // that was removed.
              accessibilityLabel={Platform.OS === 'web' ? 'Subscribe to Pro' : 'Continue to checkout'}
            >
              {starting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.ctaText}>
                  {Platform.OS === 'web'
                    ? `Get Pro — ${plan === 'annual' ? annualPrice + '/year' : monthlyPrice + '/month'}`
                    : 'Continue'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.notNow} onPress={dismiss} accessibilityRole="button">
              <Text style={[styles.notNowText, { color: colors.ink3 }]}>Not now</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PlanCard({
  selected, onPress, name, badge, headline, headlineUnit, save, strike, footnote, colors,
}: {
  selected: boolean; onPress: () => void; name: string; badge?: string;
  headline: string; headlineUnit: string; save?: string; strike?: string;
  footnote: string; colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.plan,
        { borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brand50 : 'transparent' },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${headline}${headlineUnit}, ${footnote}`}
    >
      {badge ? (
        <View style={[styles.badge, { backgroundColor: colors.brand }]}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
      {/* The save pill and the struck price live on the LEFT, beside the plan
          name, not stacked into the price column. Crowding all four onto one
          right-aligned row overflowed a 393pt phone: "/week" vanished and the
          "Billed $19.99/year" footnote clipped to "Billed $19.9". */}
      <View style={styles.planRow}>
        <View style={[styles.radio, { borderColor: selected ? colors.brand : colors.ink3 }]}>
          {selected ? <View style={[styles.radioDot, { backgroundColor: colors.brand }]} /> : null}
        </View>
        <View style={styles.planLeft}>
          <Text style={[styles.planName, { color: colors.ink }]}>{name}</Text>
          {save || strike ? (
            <View style={styles.saveRow}>
              {save ? (
                <View style={[styles.savePill, { backgroundColor: colors.teal }]}>
                  <Text style={styles.saveText}>{save}</Text>
                </View>
              ) : null}
              {strike ? <Text style={[styles.strike, { color: colors.ink3 }]}>{strike}</Text> : null}
            </View>
          ) : null}
        </View>
        <View style={styles.planRight}>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.ink }]}>{headline}</Text>
            <Text style={[styles.priceUnit, { color: colors.ink2 }]}>{headlineUnit}</Text>
          </View>
          <Text style={[styles.planFootnote, { color: colors.ink2 }]} numberOfLines={1}>{footnote}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,6,10,0.72)' },
  sheet: {
    width: '100%', maxWidth: 440, maxHeight: '88%',
    borderRadius: 24, borderWidth: 0.5, padding: 22,
  },
  close: { position: 'absolute', right: 0, top: 0, padding: 6, zIndex: 2 },
  title: { fontFamily: FONTS.displaySemibold, fontSize: 24, textAlign: 'center', marginTop: 6, letterSpacing: -0.3, paddingHorizontal: 30 },
  subtitle: { fontSize: 14.5, lineHeight: 20.5, textAlign: 'center', marginTop: 8 },
  benefits: { marginTop: 20, gap: 11 },
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  check: { marginTop: 2.5 },
  benefitText: { flex: 1, fontSize: 14.5, lineHeight: 20 },
  trust: { fontSize: 12.5, textAlign: 'center', marginTop: 16 },
  plan: { borderWidth: 1.5, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 14, marginTop: 12 },
  badge: {
    position: 'absolute', top: -9, alignSelf: 'center', left: 0, right: 0,
    marginHorizontal: 'auto', paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: 9, width: 118,
  },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6, textAlign: 'center' },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planLeft: { flex: 1, minWidth: 0, gap: 5 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  planRight: { alignItems: 'flex-end', flexShrink: 0 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 9, height: 9, borderRadius: 4.5 },
  planName: { fontSize: 15.5, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  savePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 7 },
  saveText: { color: '#08281C', fontSize: 10, fontWeight: '800' },
  strike: { fontSize: 12.5, textDecorationLine: 'line-through' },
  price: { fontSize: 20, fontWeight: '800' },
  priceUnit: { fontSize: 12.5 },
  planFootnote: { fontSize: 11.5, marginTop: 3 },
  cta: { borderRadius: 15, paddingVertical: 16, alignItems: 'center', marginTop: 18 },
  ctaText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  notNow: { alignItems: 'center', paddingVertical: 13 },
  notNowText: { fontSize: 14.5, fontWeight: '600' },
});
