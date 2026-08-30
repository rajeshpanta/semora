import React, { useEffect } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { APP_STORE_REVIEW_URL, FONTS, PLAY_STORE_REVIEW_URL, WEB_CARD_SHADOW } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { track } from '@/lib/analytics';

/**
 * The second, quieter ask for a rating.
 *
 * Semora already asks once through SKStoreReviewController, and that ask has a
 * problem nothing in the app can see: Apple caps it at roughly three prompts
 * per user per year and, past that or at its own discretion, does nothing at
 * all. `requestReview()` resolves either way. So a student can be "asked"
 * without ever having been shown anything, and the app records a prompt that
 * never happened — 82 of them, against one written review.
 *
 * This card is the path that cannot be silently swallowed. It opens the App
 * Store review composer as a normal link, which has no quota because the
 * student chose to tap it.
 *
 * It is deliberately small, dismissible, and shown once ever, a day after the
 * native prompt at the earliest (lib/reviewGate). Two asks in one sitting is
 * asking twice however politely the second one is worded, and a rating card
 * that reappears is the kind of thing students rate one star.
 */
export default function RatingNudgeCard({ onDismiss }: { onDismiss: () => void }) {
  const colors = useColors();

  useEffect(() => { track('rating_card_shown', { screen: 'today' }); }, []);

  const rate = async () => {
    track('rating_card_tapped', { screen: 'today' });
    try {
      await Linking.openURL(Platform.OS === 'android' ? PLAY_STORE_REVIEW_URL : APP_STORE_REVIEW_URL);
    } catch {
      // Nothing to recover: the composer either opens or it does not, and an
      // apology alert here would be a second interruption for the student who
      // just did us a favour.
    }
    // Dismissed on tap, not on return. There is no callback telling us whether
    // they actually wrote anything, and asking again would be the one outcome
    // worse than not asking.
    onDismiss();
  };

  return (
    <View
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }, WEB_CARD_SHADOW as any]}
    >
      <View style={styles.row}>
        <View style={[styles.badge, { backgroundColor: colors.brand100 }]}>
          <FontAwesome name="star" size={13} color={colors.brand} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.ink }]}>Enjoying Semora?</Text>
          <Text style={[styles.sub, { color: colors.ink3 }]}>
            A quick rating helps other students find it.
          </Text>
        </View>
        <TouchableOpacity
          onPress={onDismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <FontAwesome name="times" size={14} color={colors.ink3} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.cta, { backgroundColor: colors.brand }]}
        onPress={rate}
        accessibilityRole="button"
        accessibilityLabel="Rate Semora on the App Store"
      >
        <Text style={styles.ctaText}>Rate Semora</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: FONTS.display, fontSize: 15 },
  sub: { fontSize: 11.5, marginTop: 1 },
  cta: { borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  // The button's own colour is the brand fill, so its label is white in both
  // themes by design — this is a filled control, not a surface that inverts.
  ctaText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
