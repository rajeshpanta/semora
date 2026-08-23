import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Text } from '@/components/LocalizedReactNative';
import React, { useState } from 'react';
import { View, StyleSheet, Platform, LayoutAnimation, UIManager } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { WEB_CARD_SHADOW } from '@/lib/constants';
import { useColors } from '@/lib/theme';

// A collapsed section that states what it contains before you open it.
//
// Built for the course screen, where six stacked panels — grades, study tools,
// schedule, sharing, appearance — pushed the assignment list off the bottom of
// the phone. The student opened the course to see what was due and had to
// scroll past everything else to reach it.
//
// The `summary` prop is the point, not the chevron. A row reading "Grades" is
// a door with no label on it, so the only way to learn whether opening it is
// worth the tap is to open it — which is exactly the cost collapsing was
// supposed to remove. A row reading "Grades · 92% (A)" answers the common
// question outright and is opened only by someone who wants the breakdown.
// Same for "Mon/Wed 10:00 AM" on the schedule and "Flashcards · Tutor" on the
// tools. Collapsing without summaries trades scrolling for guessing.
//
// Deliberately NOT animated height. Measuring children to animate them means
// either a fixed maxHeight that clips long content or an onLayout pass that
// flickers on first open; LayoutAnimation gets the same easing for free on
// native and degrades to an instant toggle on web, where it is a no-op.

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface DisclosureProps {
  /** Section name. Short — this is the noun, not the sentence. */
  title: string;
  /**
   * What is inside, in a few words: the current grade, the next class time,
   * the tool names. Shown next to the title while collapsed. Omit only when
   * the title alone genuinely says everything.
   */
  summary?: string | null;
  icon?: React.ComponentProps<typeof FontAwesome>['name'];
  /** Tint for the icon — the course color, so sections read as belonging to it. */
  accent?: string;
  /** Open on mount. For the one section a screen wants visible by default. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function Disclosure({
  title,
  summary,
  icon,
  accent,
  defaultOpen = false,
  children,
}: DisclosureProps) {
  const colors = useColors();
  const [open, setOpen] = useState(defaultOpen);
  const tint = accent ?? colors.brand;

  const toggle = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync();
    // Native gets a spring; web treats this as a no-op and simply swaps.
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.line }, WEB_CARD_SHADOW]}>
      <TouchableOpacity
        onPress={toggle}
        activeOpacity={0.7}
        style={styles.headerRow}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        // Without this a screen reader announces only "Grades", losing the
        // summary that makes the row worth reading in the first place.
        accessibilityLabel={summary ? `${title}, ${summary}` : title}
      >
        {icon ? (
          <View style={[styles.iconWrap, { backgroundColor: tint + '1A' }]}>
            <FontAwesome name={icon} size={13} color={tint} />
          </View>
        ) : null}
        <View style={styles.labelWrap}>
          <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
          {summary && !open ? (
            <Text style={[styles.summary, { color: colors.ink3 }]} numberOfLines={1}>
              {summary}
            </Text>
          ) : null}
        </View>
        <FontAwesome
          name={open ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={colors.ink3}
        />
      </TouchableOpacity>
      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrap: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '700' },
  summary: { fontSize: 13 },
  // Content keeps its own cards' padding, so this only insets the edges the
  // wrapper introduced.
  body: { paddingHorizontal: 14, paddingBottom: 14 },
});
