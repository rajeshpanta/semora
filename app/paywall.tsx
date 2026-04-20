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
import { useAppStore } from '@/store/appStore';
import { getProducts, purchaseProduct, restorePurchases, PRODUCT_IDS, setupPurchaseListeners } from '@/lib/purchases';

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
        setIsPro(true);
        setLoading(false);
        if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        handleClose();
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
      const restored = await restorePurchases();
      if (restored) {
        setIsPro(true);
        if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Restored', 'Your Pro subscription has been restored.', [
          { text: 'OK', onPress: handleClose },
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
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Fixed close button outside ScrollView */}
        <TouchableOpacity style={styles.closeBtn} onPress={handleClose} hitSlop={16}>
          <FontAwesome name="times" size={20} color={COLORS.ink2} />
        </TouchableOpacity>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} bounces={false}>

          {/* Hero */}
          <LinearGradient
            colors={['#6B46C1', '#8B5CF6', '#A78BFA']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroGlow} />
            <View style={styles.heroGlow2} />
            <FontAwesome name="star" size={24} color="rgba(255,255,255,0.85)" />
            <Text style={styles.heroTitle}>SyllabusSnap</Text>
            <Text style={styles.heroTitleBold}>Pro</Text>
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

          {/* Monthly */}
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

          {/* Annual */}
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

          <Text style={styles.finePrint}>
            {selectedPlan === 'monthly'
              ? `7-day free trial, then ${monthlyPrice}/month. Cancel anytime.`
              : `${annualPrice} billed annually. Cancel anytime.`}
          </Text>

          {/* Footer */}
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

  // Hero
  hero: {
    borderRadius: 22, paddingVertical: 28, paddingHorizontal: 24,
    marginBottom: 28, marginTop: 8,
    overflow: 'hidden', position: 'relative',
  },
  heroGlow: {
    position: 'absolute', right: -30, top: -30,
    width: 140, height: 140, borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  heroGlow2: {
    position: 'absolute', right: 20, bottom: -50,
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroTitle: {
    fontSize: 28, fontWeight: '800', color: '#fff',
    marginTop: 12, letterSpacing: -0.5,
  },
  heroTitleBold: {
    fontSize: 28, fontWeight: '800',
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: -0.5, marginTop: -2,
  },
  heroSubtitle: {
    fontSize: 15, color: 'rgba(255,255,255,0.8)',
    marginTop: 8, lineHeight: 20,
  },

  // Section
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: COLORS.ink3,
    letterSpacing: 1.2, marginBottom: 12,
  },

  // Features
  featureList: {
    backgroundColor: COLORS.card, borderRadius: 18,
    paddingHorizontal: 16, marginBottom: 28,
    borderWidth: 0.5, borderColor: COLORS.line,
  },
  featureRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 15, gap: 14,
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
    fontSize: 15, fontWeight: '700', color: COLORS.ink,
    marginBottom: 2,
  },
  featureDesc: {
    fontSize: 13, color: COLORS.ink3, lineHeight: 17,
  },

  // Plans
  planCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: 18,
    padding: 18, marginBottom: 10,
    borderWidth: 2, borderColor: COLORS.line,
  },
  planCardSelected: {
    backgroundColor: COLORS.brand50,
    borderColor: COLORS.brand,
  },
  planRadio: { marginRight: 14 },
  radioOuter: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2.5, borderColor: COLORS.ink3,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOuterSelected: { borderColor: COLORS.brand },
  radioInner: {
    width: 13, height: 13, borderRadius: 6.5,
    backgroundColor: COLORS.brand,
  },
  planName: { fontSize: 16, fontWeight: '700', color: COLORS.ink },
  planPrice: {
    fontSize: 20, fontWeight: '800', color: COLORS.ink,
    marginTop: 2,
  },
  planPeriod: { fontSize: 14, fontWeight: '400', color: COLORS.ink2 },
  planSub: { fontSize: 13, color: COLORS.ink3, marginTop: 2, minHeight: 16 },
  saveBadge: {
    backgroundColor: COLORS.teal,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  saveBadgeText: {
    fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 0.5,
  },
  trialBadge: {
    backgroundColor: COLORS.brand,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  trialBadgeText: {
    fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 0.5,
  },

  // CTA
  ctaBtn: {
    height: 58, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaText: {
    fontSize: 18, fontWeight: '700', color: '#fff',
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
