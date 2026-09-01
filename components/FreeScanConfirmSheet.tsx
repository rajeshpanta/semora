import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';

/**
 * How would you like to add your course?
 *
 * This replaces an Alert.alert, and the reason is the one that moved the Pro
 * wall off Alerts too: a system dialog has a single shape, so the only place to
 * put anything is another sentence in the body. That is how this grew into five
 * lines describing the free tier to somebody who is already living in it, on the
 * screen where they were trying to do one thing.
 *
 * A sheet can put each fact beside the choice it belongs to, so the question
 * goes back to being a question. The one thing a student must not learn
 * afterwards — that scanning spends an action they only get once — still gets
 * said, but on the row that spends it rather than as a preamble to everything.
 *
 * What did NOT change is that the question is asked at all. The action is
 * lifetime rather than monthly and is shared with lecture recording, so
 * spending it silently is how a limit turns into a trick.
 */

export type FreeScanChoice = 'canvas' | 'scan' | 'pro' | 'cancel';

export function FreeScanConfirmSheet({
  visible,
  canvasAvailable,
  canvasIsFree,
  atCourseLimit,
  onChoose,
  onDismissed,
}: {
  visible: boolean;
  /** Show the Canvas row at all. */
  canvasAvailable: boolean;
  /** Is Canvas genuinely free for this account right now? */
  canvasIsFree: boolean;
  /** The free semester already holds its one self-added course. */
  atCourseLimit: boolean;
  onChoose: (choice: FreeScanChoice) => void;
  /**
   * Fired once UIKit has ACTUALLY finished dismissing this modal — it comes
   * from the completion block of dismissViewControllerAnimated:, so it is a
   * real lifecycle signal rather than a guess at an animation duration.
   *
   * It exists because acting on the choice too early is the bug this whole
   * screen has a 40-line comment about: presenting a picker onto a controller
   * that is still `isBeingDismissed` makes UIKit refuse SILENTLY and strands
   * expo-document-picker's native pickingContext until the app is restarted.
   * iOS only; see the caller for the cross-platform backstop.
   */
  onDismissed?: () => void;
}) {
  const colors = useColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onDismiss={onDismissed}
      onRequestClose={() => onChoose('cancel')}
    >
      <View style={styles.host}>
        <Pressable style={styles.backdrop} onPress={() => onChoose('cancel')} accessible={false} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
            <Text style={[styles.title, { color: colors.ink }]}>How would you like to add your course?</Text>

            {atCourseLimit && (
              // The only line worth keeping above the choices, because it changes
              // what a scan can ACHIEVE rather than what it costs: at the cap the
              // action is charged when the syllabus is parsed and the new course
              // is then refused. Learning that afterwards is the version of this
              // that loses the action outright.
              <Text style={[styles.note, { color: colors.ink2 }]}>
                Your free semester is already full, so a scan can update a class you have but not
                add a new one.
              </Text>
            )}

            {canvasAvailable && (
              <TouchableOpacity
                style={[styles.row, { borderColor: colors.teal, backgroundColor: colors.teal50 }]}
                onPress={() => onChoose('canvas')}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={canvasIsFree ? 'Connect Canvas, free' : 'Connect Canvas'}
              >
                <View style={[styles.badge, { backgroundColor: colors.teal }]}>
                  <FontAwesome name="university" size={15} color={colors.card} />
                </View>
                <View style={{ flex: 1 }}>
                  {/* "(Free)" only when it is true — this row also appears at the
                      course cap, where the promo may not be running. */}
                  <Text style={[styles.rowTitle, { color: colors.ink }]}>
                    {canvasIsFree ? 'Connect Canvas (Free)' : 'Connect Canvas'}
                  </Text>
                  <Text style={[styles.rowNote, { color: colors.ink2 }]}>
                    Every class imports itself, with no scan needed.
                  </Text>
                </View>
                <FontAwesome name="chevron-right" size={12} color={colors.teal} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.row, { borderColor: colors.line }]}
              onPress={() => onChoose('scan')}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <View style={[styles.badge, { backgroundColor: colors.brand50 }]}>
                <FontAwesome name="camera" size={15} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.ink }]}>Use Free Scan</Text>
                {/* The warning, moved onto the choice that triggers it. */}
                <Text style={[styles.rowNote, { color: colors.ink2 }]}>
                  Reads this syllabus now, and uses your one free AI action.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.row, { borderColor: colors.line }]}
              onPress={() => onChoose('pro')}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <View style={[styles.badge, { backgroundColor: colors.brand50 }]}>
                <FontAwesome name="star" size={15} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, { color: colors.ink }]}>Become Pro</Text>
                <Text style={[styles.rowNote, { color: colors.ink2 }]}>
                  Unlimited scans and lectures, all semester.
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={12} color={colors.ink3} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancel} onPress={() => onChoose('cancel')} accessibilityRole="button">
              <Text style={[styles.cancelText, { color: colors.ink3 }]}>Cancel</Text>
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
    borderRadius: 22, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 22,
  },
  title: { fontFamily: FONTS.display, fontSize: 21, lineHeight: 27, marginBottom: 16 },
  note: { fontSize: 13, lineHeight: 18, marginTop: -6, marginBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 15,
    paddingHorizontal: 13, paddingVertical: 13, marginBottom: 10,
  },
  badge: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '800' },
  rowNote: { fontSize: 12.5, lineHeight: 17, marginTop: 2 },
  cancel: { paddingVertical: 13, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600' },
});
