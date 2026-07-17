import { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useSession } from '@/app/_layout';
import { redeem, stashPendingReferral, type RedeemStatus } from '@/lib/referral';
import { track } from '@/lib/analytics';

// Deep-link handler for semora://invite?code=... — a friend's referral link.
// expo-router maps the scheme + this route file automatically, so no manual
// Linking code in _layout is needed.
//
// Two paths:
//   * Signed OUT (a friend without an account): stash the code in SecureStore
//     and let AuthGate bounce them to onboarding/sign-in. applyPendingReferral()
//     (Me-tab mount) redeems it once they've created an account.
//   * Signed IN: redeem immediately with an explicit Accept action.
//
// Self-referral / already-redeemed / invalid codes are handled gracefully with
// a friendly message rather than a scary error.

type ViewState =
  | 'intro'      // signed in, ready to accept
  | 'redeeming'  // redeem in flight
  | 'success'    // redeemed — free month granted
  | 'stashed'    // signed out — code saved, routing to auth
  | 'declined';  // a non-'ok' terminal status (with a friendly reason)

export default function InviteScreen() {
  const router = useRouter();
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const insets = useSafeAreaInsets();
  const { session, loading } = useSession();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = typeof params.code === 'string' ? params.code.trim() : '';

  const [state, setState] = useState<ViewState>('intro');
  const [declineMsg, setDeclineMsg] = useState<string>('');

  useEffect(() => {
    track('referral_invite_opened', { screen: 'invite', signedIn: !!session });
  }, []);

  // Signed-out attribution: stash the code the instant we know there's no
  // session, BEFORE AuthGate redirects this screen away — the stash must
  // survive the bounce to onboarding/sign-in. Guarded so it runs once.
  const stashedRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (session) return;
    if (stashedRef.current) return;
    stashedRef.current = true;
    if (code) {
      stashPendingReferral(code).catch(() => {});
      setState('stashed');
    }
    // AuthGate handles the actual navigation to onboarding/sign-in; we just
    // render a brief "saved" state until it does.
  }, [loading, session, code]);

  // Missing/blank code — nothing to redeem. Bounce home.
  useEffect(() => {
    if (loading) return;
    if (!code) {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)' as any);
    }
  }, [loading, code]);

  const friendlyDecline = (status: RedeemStatus, message?: string): string => {
    switch (status) {
      case 'self_referral':
        return "This is your own invite link — share it with a friend to both get a free month.";
      case 'already_redeemed':
        return "You've already redeemed a referral code. Enjoy your Pro month!";
      case 'invalid_code':
        return "This invite link is no longer valid.";
      case 'referrer_capped':
        return "This code has reached its limit right now. Ask your friend for a fresh one.";
      default:
        return message ?? 'Something went wrong. Please try again.';
    }
  };

  const handleAccept = async () => {
    if (state === 'redeeming') return;
    setState('redeeming');
    const result = await redeem(code);
    if (result.status === 'ok') {
      track('referral_redeemed', { screen: 'invite' });
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      setState('success');
    } else {
      setDeclineMsg(friendlyDecline(result.status, result.message));
      setState('declined');
    }
  };

  const handleClose = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as any);
  };

  // While the session is resolving, or a blank code is being bounced, show a
  // neutral spinner rather than flashing the intro.
  if (loading || !code) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.paper }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.paper }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.card, top: insets.top + 8 }]}
          onPress={handleClose}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <FontAwesome name="times" size={20} color={colors.ink2} />
        </TouchableOpacity>

        <View style={[styles.content, { maxWidth: contentMaxWidth }]}>
          {/* Gift hero — dark card matching the paywall / Me Pro card. */}
          <View style={[styles.hero, { backgroundColor: colors.ink }]}>
            <View style={[styles.heroGlow, { backgroundColor: colors.brand }]} />
            <View style={[styles.giftBadge, { backgroundColor: colors.brand }]}>
              <FontAwesome name="gift" size={26} color="#fff" />
            </View>
          </View>

          {state === 'success' ? (
            <>
              <Text style={[styles.title, { color: colors.ink }]}>You're in! 🎉</Text>
              <Text style={[styles.subtitle, { color: colors.ink3 }]}>
                Your free month of Semora Pro is now active — unlimited scans,
                grade forecasts, and more. Your friend got one too.
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
                activeOpacity={0.85}
                onPress={() => router.replace('/(tabs)' as any)}
              >
                <Text style={styles.primaryBtnText}>Start using Pro</Text>
              </TouchableOpacity>
            </>
          ) : state === 'declined' ? (
            <>
              <Text style={[styles.title, { color: colors.ink }]}>You've been invited</Text>
              <Text style={[styles.subtitle, { color: colors.ink3 }]}>{declineMsg}</Text>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
                activeOpacity={0.85}
                onPress={handleClose}
              >
                <Text style={styles.primaryBtnText}>Continue</Text>
              </TouchableOpacity>
            </>
          ) : state === 'stashed' ? (
            <>
              <Text style={[styles.title, { color: colors.ink }]}>You've been invited</Text>
              <Text style={[styles.subtitle, { color: colors.ink3 }]}>
                Get a free month of Semora Pro. Create your account to claim it —
                we'll apply your invite automatically.
              </Text>
              <ActivityIndicator color={colors.brand} style={{ marginTop: 8 }} />
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.ink }]}>
                You've been invited
              </Text>
              <Text style={[styles.subtitle, { color: colors.ink3 }]}>
                Get a free month of Semora Pro — unlimited syllabus scans, grade
                forecasts, and smart reminders. Your friend gets a free month too.
              </Text>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.brand }, state === 'redeeming' && { opacity: 0.6 }]}
                activeOpacity={0.85}
                onPress={handleAccept}
                disabled={state === 'redeeming'}
              >
                {state === 'redeeming' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <FontAwesome name="star" size={14} color="#fff" />
                    <Text style={styles.primaryBtnText}>Accept free month</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.paper, justifyContent: 'center' },
  safe: { flex: 1 },
  closeBtn: {
    position: 'absolute', right: 20, zIndex: 10,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  content: {
    flex: 1, justifyContent: 'center',
    paddingHorizontal: 24, paddingBottom: 40,
    width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center',
    alignItems: 'center',
  },
  hero: {
    width: 96, height: 96, borderRadius: 28,
    backgroundColor: COLORS.ink,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28, overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute', right: -20, top: -20,
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: COLORS.brand, opacity: 0.4,
  },
  giftBadge: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: COLORS.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontFamily: FONTS.display, fontSize: 28, color: COLORS.ink,
    textAlign: 'center', marginBottom: 10,
  },
  subtitle: {
    fontSize: 15, color: COLORS.ink3, textAlign: 'center',
    lineHeight: 22, marginBottom: 28, maxWidth: 320,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 52, borderRadius: 16, paddingHorizontal: 32,
    backgroundColor: COLORS.brand, minWidth: 240,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
