import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Platform, Linking, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import type { ProductOrSubscription } from 'react-native-iap';
import { COLORS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useAppStore } from '@/store/appStore';
import { getProducts, purchaseProduct, restorePurchases, validateProEntitlement, PRODUCT_IDS, setupPurchaseListeners } from '@/lib/purchases';
import { supabase } from '@/lib/supabase';

const { width: SCREEN_W } = Dimensions.get('window');

const FEATURES = [
  {
    icon: 'camera' as const,
    title: 'Unlimited Scans & Courses',
    desc: 'Scan unlimited syllabi and add as many courses as you need.',
  },
  {
    icon: 'line-chart' as const,
    title: 'Grade Scale & Forecasting',
    desc: 'Customize grading scales and forecast your final GPA.',
  },
  {
    icon: 'bell' as const,
    title: 'Advance Reminders & Sync',
    desc: 'Get 1-day and 3-day advance reminders. Sync to calendar.',
  },
];

export default function PaywallScreen() {
  const router = useRouter();
  const setIsPro = useAppStore((s) => s.setIsPro);
  const setSubscriptionPlan = useAppStore((s) => s.setSubscriptionPlan);
  const colors = useColors();

  // Annual is the recommended path — surfaced first in the UI and
  // pre-selected so the Subscribe button reflects the better-value
  // option without the user having to tap.
  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly'>('annual');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [monthlySub, setMonthlySub] = useState<ProductOrSubscription | null>(null);
  const [annualSub, setAnnualSub] = useState<ProductOrSubscription | null>(null);

  useEffect(() => {
    getProducts().then((products) => {
      if (products) {
        setMonthlySub(products.monthly);
        setAnnualSub(products.annual);
      }
    });

    const removeSubs = setupPurchaseListeners(
      async () => {
        // StoreKit reports purchase complete — but we don't grant Pro
        // until our edge function has verified the receipt with Apple
        // and written the entitlement row tied to this Semora account.
        const { data: { session: startSession } } = await supabase.auth.getSession();
        const expectedUserId = startSession?.user.id;
        const entitlement = await validateProEntitlement();
        // Race guard: if the session changed mid-validation (signed out,
        // switched accounts), don't write a stale entitlement to the store.
        const { data: { session: endSession } } = await supabase.auth.getSession();
        if (endSession?.user.id !== expectedUserId) {
          setLoading(false);
          return;
        }
        setIsPro(entitlement.is_pro);
        setSubscriptionPlan(entitlement.plan);
        setLoading(false);
        if (entitlement.is_pro) {
          if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          handleClose();
        } else {
          Alert.alert(
            'Verification Pending',
            'Your purchase went through but we couldn\'t verify it with the App Store yet. Tap Restore in a moment to retry.',
          );
        }
      },
      () => { setLoading(false); },
    );

    return removeSubs;
  }, []);

  const annualPrice = annualSub?.displayPrice ?? '$19.99';
  const monthlyPrice = monthlySub?.displayPrice ?? '$3.99';

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)' as any);
    }
  };

  const handlePurchase = async () => {
    const productId = selectedPlan === 'annual' ? PRODUCT_IDS.annual : PRODUCT_IDS.monthly;
    setLoading(true);
    try {
      const didPurchase = await purchaseProduct(productId);
      if (!didPurchase) setLoading(false);
    } catch (err: any) {
      setLoading(false);
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
      setIsPro(entitlement.is_pro);
      setSubscriptionPlan(entitlement.plan);
      if (entitlement.is_pro) {
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
        <TouchableOpacity style={[styles.closeBtn, { backgroundColor: colors.card }]} onPress={handleClose} hitSlop={16}>
          <FontAwesome name="times" size={20} color={colors.ink2} />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} bounces={false}>

          {/* Hero */}
          <View style={[styles.hero, { backgroundColor: colors.ink }]}>
            <View style={[styles.heroGlow, { backgroundColor: colors.brand }]} />
            <View style={styles.proLabel}>
              <FontAwesome name="star" size={11} color={colors.brand100} />
              <Text style={[styles.proLabelText, { color: colors.brand100 }]}>SEMORA PRO</Text>
            </View>
            <Text style={styles.heroTitle}>Unlimited scans, smart plans, grade forecasts.</Text>
            <Text style={styles.heroSubtitle}>
              Everything you need to ace your semester.
            </Text>
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

          {/* Annual — first and pre-selected to steer users toward the
              better-value plan. */}
          <TouchableOpacity
            style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.line }, selectedPlan === 'annual' && { backgroundColor: colors.brand50, borderColor: colors.brand }]}
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
              <Text style={[styles.planSub, { color: colors.ink3 }]}>Just $1.67/month</Text>
            </View>
            <View style={[styles.saveBadge, { backgroundColor: colors.teal }]}>
              <Text style={styles.saveBadgeText}>SAVE 58%</Text>
            </View>
          </TouchableOpacity>

          {/* Monthly */}
          <TouchableOpacity
            style={[styles.planCard, { backgroundColor: colors.card, borderColor: colors.line }, selectedPlan === 'monthly' && { backgroundColor: colors.brand50, borderColor: colors.brand }]}
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
              <Text style={[styles.planSub, { color: colors.ink3 }]}>7-day free trial included</Text>
            </View>
            {selectedPlan === 'monthly' && (
              <View style={[styles.trialBadge, { backgroundColor: colors.brand }]}>
                <Text style={styles.trialBadgeText}>FREE TRIAL</Text>
              </View>
            )}
          </TouchableOpacity>

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
                  {selectedPlan === 'monthly' ? 'Try 7 Days Free' : 'Subscribe Now'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <Text style={[styles.finePrint, { color: colors.ink3 }]}>
            {selectedPlan === 'monthly'
              ? `7-day free trial, then ${monthlyPrice}/month. Cancel anytime.`
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
  content: { paddingHorizontal: 20, paddingBottom: 40 },

  // Close — fixed at top right, outside scroll
  closeBtn: {
    position: 'absolute', top: 56, right: 20, zIndex: 10,
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
    fontSize: 20, fontWeight: '700', color: '#fff',
    lineHeight: 26, maxWidth: 240,
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
