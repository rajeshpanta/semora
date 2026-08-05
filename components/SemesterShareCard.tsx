import { Text } from '@/components/LocalizedReactNative';
import React, { forwardRef } from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { COLORS, FONTS } from '@/lib/constants';

/**
 * A branded, screenshot-worthy "my semester" card — this is marketing
 * collateral (the organic-growth lever for the back-to-school moment), so it
 * is INTENTIONALLY light/branded and does NOT honor dark mode: the exported
 * share image must look identical regardless of the sharer's theme, and a
 * dark card reads as "broken" against Instagram/iMessage light chrome. Every
 * color here is a fixed COLORS light-mode value on purpose — do not swap to
 * useColors().
 *
 * Renders from plain props (no hooks that touch device state) so it is
 * trivially captured off-screen by react-native-view-shot's captureRef. The
 * card is a fixed CARD_WIDTH × CARD_HEIGHT (~4:5) box; the share screen sizes
 * it to fit and captures it at that resolution.
 */

// 4:5 portrait — the aspect ratio Instagram/iMessage previews crop least.
export const SHARE_CARD_WIDTH = 400;
export const SHARE_CARD_HEIGHT = 500;

export interface SemesterShareCardCourse {
  name: string;
  color: string;
}

interface SemesterShareCardProps {
  semesterName: string;
  courses: SemesterShareCardCourse[];
  deadlineCount: number;
}

// Pluralize the tiny stat labels without pulling in a helper.
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const SemesterShareCard = forwardRef<View, SemesterShareCardProps>(
  function SemesterShareCard({ semesterName, courses, deadlineCount }, ref) {
    const courseCount = courses.length;
    // Show at most a handful of chips so the card stays calm; the count stat
    // already carries the "how many" — chips are for texture/color.
    const shownCourses = courses.slice(0, 8);
    const overflow = courseCount - shownCourses.length;

    return (
      <View
        ref={ref}
        collapsable={false}
        style={styles.card}
        // Non-interactive marketing surface — hidden from assistive tech and
        // captured as a flat image.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* Soft brand wash in the corners for depth without noise. */}
        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />

        <View style={styles.inner}>
          {/* Wordmark */}
          <View style={styles.brandRow}>
            <View style={styles.brandDot}>
              <FontAwesome name="star" size={12} color="#fff" />
            </View>
            <Text style={styles.brandName}>Semora</Text>
          </View>

          {/* Headline */}
          <View style={styles.headlineBlock}>
            <Text style={styles.kicker}>MY SEMESTER</Text>
            <Text style={styles.semesterName} numberOfLines={2}>
              {semesterName}
            </Text>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statNum}>{courseCount}</Text>
              <Text style={styles.statLabel}>{plural(courseCount, 'CLASS', 'CLASSES')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statNum}>{deadlineCount}</Text>
              <Text style={styles.statLabel}>
                {plural(deadlineCount, 'DEADLINE', 'DEADLINES')}
              </Text>
            </View>
          </View>

          {/* Course chips */}
          {shownCourses.length > 0 ? (
            <View style={styles.chips}>
              {shownCourses.map((c, i) => (
                <View key={`${c.name}-${i}`} style={styles.chip}>
                  <View style={[styles.chipDot, { backgroundColor: c.color }]} />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {c.name}
                  </Text>
                </View>
              ))}
              {overflow > 0 && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>+{overflow} more</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.chips}>
              <Text style={styles.emptyText}>Every class, one calm place.</Text>
            </View>
          )}

          <View style={{ flex: 1 }} />

          {/* Footer tagline / call-out */}
          <View style={styles.footer}>
            <LinearGradient
              colors={['#6B46C1', '#553C9A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.footerBadge}
            >
              <Text style={styles.footerBadgeText}>Set up in 30 seconds</Text>
            </LinearGradient>
            <Text style={styles.footerSub}>Scan a syllabus. See your whole term.</Text>
          </View>
        </View>
      </View>
    );
  },
);

// All fixed light-mode values — see the file-level comment on why this card
// intentionally ignores dark mode.
const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    height: SHARE_CARD_HEIGHT,
    borderRadius: 28,
    backgroundColor: COLORS.paper,
    overflow: 'hidden',
    position: 'relative',
  },
  glowTop: {
    position: 'absolute',
    right: -70,
    top: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: COLORS.brand,
    opacity: 0.14,
  },
  glowBottom: {
    position: 'absolute',
    left: -80,
    bottom: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.coral,
    opacity: 0.08,
  },
  inner: {
    flex: 1,
    padding: 28,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandDot: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontFamily: FONTS.displaySemibold,
    fontSize: 18,
    color: COLORS.ink,
    letterSpacing: 0.2,
  },
  headlineBlock: {
    marginTop: 26,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    color: COLORS.brand,
    marginBottom: 8,
  },
  semesterName: {
    fontFamily: FONTS.display,
    fontSize: 34,
    lineHeight: 38,
    color: COLORS.ink,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 26,
    gap: 20,
  },
  stat: {},
  statNum: {
    fontFamily: FONTS.display,
    fontSize: 32,
    color: COLORS.ink,
    lineHeight: 34,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: COLORS.ink3,
    marginTop: 3,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: COLORS.line,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 24,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.card,
    borderRadius: 20,
    paddingLeft: 10,
    paddingRight: 12,
    paddingVertical: 7,
    borderWidth: 0.5,
    borderColor: COLORS.line,
    maxWidth: SHARE_CARD_WIDTH - 56,
  },
  chipDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  chipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: COLORS.ink2,
    flexShrink: 1,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.ink3,
    fontStyle: 'italic',
  },
  footer: {
    marginTop: 20,
  },
  footerBadge: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  footerBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.2,
  },
  footerSub: {
    fontSize: 12.5,
    color: COLORS.ink3,
    marginTop: 10,
  },
});
