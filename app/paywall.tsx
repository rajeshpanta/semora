import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import type { ProductOrSubscription } from 'react-native-iap';
import { COLORS } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';
import { getProducts, purchaseProduct, restorePurchases, PRODUCT_IDS, setupPurchaseListeners } from '@/lib/purchases';

const FEATURES = [
  {
    icon: 'camera' as const,
    title: 'Unlimited Scans & Courses',
    desc: 'Scan unlimited syllabi and add as many courses as you need. No limits.',
  },
  {
    icon: 'line-chart' as const,
    title: 'Grade Scale & Forecasting',
    desc: 'Customize grading scales, forecast your GPA, and track grade trends.',
  },
  {
    icon: 'bell' as const,
    title: 'Advance Reminders & Sync',
    desc: 'Get 1-day and 3-day advance reminders. Sync tasks to your device calendar.',
  },
];

export default function PaywallScreen() {
  const router = useRouter();
  const setIsPro = useAppStore((s) => s.setIsPro);

  const [selectedPlan, setSelectedPlan] = useState<'annual' | 'monthly'>('monthly');
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
      () => {
        // Purchase succeeded
        setIsPro(true);
        setLoading(false);
        if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      },
      () => {
        // Purchase error (user cancel handled in purchase())
        setLoading(false);
      },
    );

    return removeSubs;
  }, []);

  const annualPrice = annualSub?.displayPrice ?? '$19.99';
  const monthlyPrice = monthlySub?.displayPrice ?? '$3.99';

  const handlePurchase = async () => {
    const productId = selectedPlan === 'annual' ? PRODUCT_IDS.annual : PRODUCT_IDS.monthly;

    setLoading(true);
    try {
      const didPurchase = await purchaseProduct(productId);
      if (!didPurchase) {
        // User cancelled
        setLoading(false);
      }
      // Success handled by purchaseUpdatedListener above
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Purchase Failed', err.message ?? 'Something went wrong. Please try again.');
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const restored = await restorePurchases();
      if (restored) {
        setIsPro(true);
        if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Restored', 'Your Pro subscription has been restored.', [
          { text: 'OK', onPress: () => router.back() },
        ]);
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
    <View style={styles.screen}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

          {/* Close button */}
          <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()} hitSlop={12}>
            <FontAwesome name="times" size={18} color={COLORS.ink2} />
          </TouchableOpacity>

          {/* Hero */}
          <LinearGradient
            colors={['#6B46C1', '#9F7AEA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroGlow} />
            <FontAwesome name="star" size={20} color="rgba(255,255,255,0.9)" />
            <Text style={styles.heroTitle}>
              SyllabusSnap{'\n'}
              <Text style={styles.heroTitleAccent}>Pro</Text>
            </Text>
            <Text style={styles.heroSubtitle}>
              Everything you need to ace your semester.
            </Text>
          </LinearGradient>

          {/* Features */}
          <Text style={styles.sectionLabel}>WHAT YOU GET</Text>
          <View style={styles.featureList}>
            {FEATURES.map((f, i) => (
              <View key={i} style={[styles.featureRow, i < FEATURES.length - 1 && styles.featureRowBorder]}>
                <View style={styles.featureIcon}>
                  <FontAwesome name={f.icon} size={18} color={COLORS.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.featureTitle}>{f.title}</Text>
                  <Text style={styles.featureDesc}>{f.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Plan Selection */}
          <Text style={styles.sectionLabel}>CHOOSE YOUR PLAN</Text>

          {/* Monthly — with free trial */}
          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'monthly' && styles.planCardSelected]}
            onPress={() => setSelectedPlan('monthly')}
            activeOpacity={0.8}
          >
            <View style={styles.planRadio}>
              <View style={[styles.radioOuter, selectedPlan === 'monthly' && styles.radioOuterSelected]}>
                {selectedPlan === 'monthly' && <View style={styles.radioInner} />}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planName}>Monthly</Text>
              <Text style={styles.planPrice}>{monthlyPrice}<Text style={styles.planPeriod}>/month</Text></Text>
              <Text style={styles.planSub}>7-day free trial included</Text>
            </View>
            {selectedPlan === 'monthly' && (
              <View style={styles.trialBadge}>
                <Text style={styles.trialBadgeText}>FREE TRIAL</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Annual — best value */}
          <TouchableOpacity
            style={[styles.planCard, selectedPlan === 'annual' && styles.planCardSelected]}
            onPress={() => setSelectedPlan('annual')}
            activeOpacity={0.8}
          >
            <View style={styles.planRadio}>
              <View style={[styles.radioOuter, selectedPlan === 'annual' && styles.radioOuterSelected]}>
                {selectedPlan === 'annual' && <View style={styles.radioInner} />}
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.planName}>Annual</Text>
              <Text style={styles.planPrice}>{annualPrice}<Text style={styles.planPeriod}>/year</Text></Text>
              <Text style={styles.planSub}>Just $1.67/month</Text>
            </View>
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>SAVE 58%</Text>
            </View>
          </TouchableOpacity>

          {/* CTA Button */}
          <TouchableOpacity onPress={handlePurchase} disabled={loading} activeOpacity={0.85} style={{ marginTop: 24 }}>
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

          <Text style={styles.finePrint}>
            {selectedPlan === 'monthly'
              ? `7-day free trial, then ${monthlyPrice}/month. Cancel anytime.`
              : `${annualPrice} billed annually. Cancel anytime.`}
          </Text>

          {/* Footer Links */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={handleRestore} disabled={restoring}>
              <Text style={styles.footerLink}>{restoring ? 'Restoring...' : 'Restore'}</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}> · </Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://rajeshpanta.github.io/sylabus-snap/terms.html')}>
              <Text style={styles.footerLink}>Terms</Text>
            </TouchableOpacity>
            <Text style={styles.footerDot}> · </Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://rajeshpanta.github.io/sylabus-snap/privacy.html')}>
              <Text style={styles.footerLink}>Privacy</Text>
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
  content: { padding: 20, paddingBottom: 40 },

  // Close
  closeBtn: {
    alignSelf: 'flex-end',
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(28,27,31,0.08)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 8,
  },

  // Hero
  hero: {
    borderRadius: 22, padding: 24, marginBottom: 28,
    overflow: 'hidden', position: 'relative',
  },
  heroGlow: {
    position: 'absolute', right: -30, bottom: -30,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heroTitle: {
    fontSize: 32, fontWeight: '700', color: '#fff',
    marginTop: 14, lineHeight: 38, letterSpacing: -0.5,
  },
  heroTitleAccent: {
    fontSize: 32, fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
  },
  heroSubtitle: {
    fontSize: 15, color: 'rgba(255,255,255,0.8)',
    marginTop: 8, lineHeight: 20,
  },

  // Section Label
  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.ink3,
    letterSpacing: 1, marginBottom: 12,
  },

  // Features
  featureList: {
    backgroundColor: COLORS.card, borderRadius: 18,
    paddingHorizontal: 16, marginBottom: 28,
    borderWidth: 0.5, borderColor: COLORS.line,
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 16, gap: 14,
  },
  featureRowBorder: {
    borderBottomWidth: 0.5, borderBottomColor: COLORS.line,
  },
  featureIcon: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: COLORS.brand50,
    alignItems: 'center', justifyContent: 'center',
  },
  featureTitle: {
    fontSize: 15, fontWeight: '600', color: COLORS.ink,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13, color: COLORS.ink3, lineHeight: 17,
  },

  // Plan Cards
  planCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 18,
    padding: 16, marginBottom: 10,
    borderWidth: 1.5, borderColor: COLORS.line,
  },
  planCardSelected: {
    backgroundColor: COLORS.brand50,
    borderColor: COLORS.brand,
  },
  planRadio: { marginRight: 14 },
  radioOuter: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: COLORS.ink3,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: COLORS.brand,
  },
  radioInner: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: COLORS.brand,
  },
  planName: {
    fontSize: 16, fontWeight: '600', color: COLORS.ink,
  },
  planPrice: {
    fontSize: 20, fontWeight: '700', color: COLORS.ink,
    marginTop: 2,
  },
  planPeriod: {
    fontSize: 14, fontWeight: '400', color: COLORS.ink2,
  },
  planSub: {
    fontSize: 12, color: COLORS.ink3, marginTop: 2, minHeight: 16,
  },
  saveBadge: {
    backgroundColor: COLORS.teal,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6,
  },
  saveBadgeText: {
    fontSize: 11, fontWeight: '700', color: '#fff',
    letterSpacing: 0.5,
  },
  trialBadge: {
    backgroundColor: COLORS.brand,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 6,
  },
  trialBadgeText: {
    fontSize: 10, fontWeight: '700', color: '#fff',
    letterSpacing: 0.5,
  },

  // CTA
  ctaBtn: {
    height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: {
    fontSize: 17, fontWeight: '600', color: '#fff',
    letterSpacing: 0.3,
  },
  finePrint: {
    fontSize: 12, color: COLORS.ink3, textAlign: 'center',
    marginTop: 10, lineHeight: 16,
  },

  // Footer
  footer: {
    flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', marginTop: 24,
  },
  footerLink: {
    fontSize: 13, color: COLORS.ink3, fontWeight: '500',
  },
  footerDot: {
    fontSize: 13, color: COLORS.ink3,
  },
});
