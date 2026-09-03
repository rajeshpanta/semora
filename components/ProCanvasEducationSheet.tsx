import React, { useEffect } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { track } from '@/lib/analytics';
import { PRO_CANVAS_EDU_SOURCE } from '@/lib/proCanvasEducation';
import { canvasOfferDestination } from '@/lib/canvasFunnel';

/**
 * "You already have this" — for subscribers, not prospects.
 *
 * Deliberately NOT ProUpsellSheet. That component sells: it names a price, it
 * ranks two plans, its primary button says Continue and its whole job is to
 * move someone across a wall. Every one of those is wrong for a person who has
 * already paid. Reusing it and hiding the prices would have produced something
 * that still FELT like a paywall, and the one reaction this must not provoke is
 * "why is the app showing me another ad".
 *
 * So the shape is borrowed from LectureConsentSheet instead — a card that
 * explains something and gets out of the way. No price, no plan, no badge, no
 * countdown, no second CTA competing with "Not now", and nothing that implies
 * scarcity. The eyebrow says INCLUDED WITH PRO because that is the entire
 * message: this is not an offer, it is an inventory.
 */
export function ProCanvasEducationSheet({
  visible,
  occurrence,
  onDismiss,
  onConnect,
}: {
  visible: boolean;
  /** 1 on the first presentation, 2 on the final one. Analytics only. */
  occurrence: number;
  onDismiss: () => void;
  onConnect: () => void;
}) {
  const colors = useColors();
  const router = useRouter();

  useEffect(() => {
    if (!visible) return;
    track('pro_canvas_edu_shown', {
      screen: 'today',
      occurrence,
      source: PRO_CANVAS_EDU_SOURCE,
    });
  }, [visible, occurrence]);

  const connect = () => {
    track('pro_canvas_edu_connect_tapped', {
      screen: 'today',
      occurrence,
      source: PRO_CANVAS_EDU_SOURCE,
    });
    onConnect();
    // The SAME destination the Canvas affordances everywhere else use. A second
    // connect implementation would be a second thing to keep correct, and this
    // one already carries the Phase 1 copy, the promo-race fix and the funnel
    // events — all of which read `source` to tell this flow apart.
    // Through the shared table, so this sheet lands on the connect form like
    // every other Canvas affordance. It used to push the settings LIST, which
    // is the extra hop the rest of Phase 2 exists to remove — and this sheet is
    // shown 52 times a month, so it was one of the bigger contributors to it.
    const to = canvasOfferDestination('none', PRO_CANVAS_EDU_SOURCE);
    if (to.kind === 'route') router.push({ pathname: to.pathname, params: to.params } as any);
  };

  const dismiss = () => {
    track('pro_canvas_edu_dismissed', {
      screen: 'today',
      occurrence,
      // True when this was the last time it can ever appear, so the funnel can
      // separate "not right now" from "stop asking".
      final: occurrence >= 2,
      source: PRO_CANVAS_EDU_SOURCE,
    });
    onDismiss();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.host}>
        {/* Tapping outside dismisses, exactly like the upsell sheet. A modal a
            paying subscriber cannot wave away is the thing that turns a helpful
            note into an obstacle. */}
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

            <View style={[styles.icon, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name="refresh" size={19} color={colors.brand} />
            </View>

            {/* Not a badge and not a pill — a quiet label. A badge would read as
                promotional decoration on a screen that is trying not to sell. */}
            <Text style={[styles.eyebrow, { color: colors.brand }]}>INCLUDED WITH PRO</Text>

            <Text style={[styles.title, { color: colors.ink }]}>
              Let Semora keep Canvas updated for you
            </Text>

            {/* "the deadlines already on your Canvas calendar", not "your
                classes". Every connection in production is a calendar feed, and
                a class with no dated work never appears in one. The connect
                screen is held to the same standard. */}
            <Text style={[styles.body, { color: colors.ink2 }]}>
              Connect Canvas once and Semora imports the deadlines already on your Canvas
              calendar, then keeps them updated when an instructor moves a date.
            </Text>
            <Text style={[styles.body, { color: colors.ink2 }]}>
              Less checking Canvas. More knowing what is next.
            </Text>

            {/* Verified against supabase/functions/lms-sync/index.ts: the Canvas
                calendar path is one fetch() with no method, so a GET, carrying
                no Authorization header and no body, against a single .ics URL,
                following same-origin redirects only. There is no Canvas write
                anywhere in that function. This sentence is the strongest claim
                the implementation actually supports — and no stronger. */}
            <View style={[styles.trust, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name="lock" size={13} color={colors.brand} />
              <Text style={[styles.trustText, { color: colors.ink2 }]}>
                Semora only reads your Canvas calendar feed. It never posts, changes or removes
                anything in Canvas.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.cta, { backgroundColor: colors.brand }]}
              onPress={connect}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Connect Canvas"
            >
              <Text style={styles.ctaText}>Connect Canvas</Text>
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

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    width: '100%', maxWidth: SCREEN_MAX_WIDTH, maxHeight: '86%',
    borderRadius: 22, borderWidth: 1, paddingHorizontal: 22, paddingVertical: 24,
  },
  close: { position: 'absolute', top: 0, right: 0, padding: 6, zIndex: 2 },
  icon: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 0.9, marginBottom: 8 },
  // Serif display face, matching the onboarding and connect-screen headings
  // rather than the upsell sheet's tighter sales type.
  title: { fontFamily: FONTS.display, fontSize: 23, lineHeight: 29, marginBottom: 12, paddingRight: 22 },
  body: { fontSize: 14, lineHeight: 21, marginBottom: 10 },
  trust: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, borderRadius: 13, padding: 12, marginTop: 4, marginBottom: 18 },
  trustText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  cta: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  ctaText: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  notNow: { paddingVertical: 13, alignItems: 'center' },
  notNowText: { fontSize: 14, fontWeight: '600' },
});
