import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { FONTS, WEB_CARD_SHADOW } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { track } from '@/lib/analytics';
import { bumpCardImpression, cardDaysShown, openReviewComposer } from '@/lib/reviewOutcomeRuntime';

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
 * It is deliberately small, dismissible, and shown on at most MAX_CARD_DAYS
 * separate days, a day after the native prompt at the earliest
 * (lib/reviewGate). This comment used to claim "once ever" and the code did not
 * enforce it: the card came back every launch until the X was pressed, and one
 * student saw it 32 times across 14 days. Two asks in one sitting is asking
 * twice however politely the second one is worded, and a rating card that
 * reappears forever is the kind of thing students rate one star.
 *
 * Every outcome is now recorded (lib/reviewOutcome): the impression carries its
 * number on this device, the X is an event of its own rather than silence, and
 * the tap is followed by how long the student spent in the store. Without the
 * dismissal we could not tell "asked and refused" from "never asked", which is
 * the difference between a card students don't want and a card they never see.
 */
export default function RatingNudgeCard({ onDismiss }: { onDismiss: () => void }) {
  const colors = useColors();
  const impression = useRef(0);

  useEffect(() => {
    impression.current = bumpCardImpression();
    // `impression` counts renders (an over-the-air reload remounts the card),
    // `day` counts the separate days it has been shown — the number the cap in
    // lib/reviewGate reads, and the honest denominator for a tap rate.
    track('rating_card_shown', { screen: 'today', impression: impression.current, day: cardDaysShown() });
  }, []);

  const rate = async () => {
    track('rating_card_tapped', { screen: 'today', impression: impression.current });
    // The composer link, the storefront it resolved to and the return trip are
    // all handled there; a failure to open is reported rather than apologised
    // for, since an alert would interrupt the student who just did us a favour.
    await openReviewComposer('today', { impression: impression.current });
    // Dismissed on tap, not on return. There is no callback telling us whether
    // they actually wrote anything, and asking again would be the one outcome
    // worse than not asking.
    onDismiss();
  };

  const dismiss = () => {
    track('rating_card_dismissed', { screen: 'today', impression: impression.current, day: cardDaysShown() });
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
          onPress={dismiss}
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
