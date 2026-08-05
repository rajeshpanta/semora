import { Text } from '@/components/LocalizedReactNative';
import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { COLORS, FONTS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import type { WeekBucket } from '@/lib/workload';

// Plain-RN weekly workload bar chart. NO chart library — bars are <View>s whose
// height is a fraction of the tallest week's loadScore. Crunch weeks render in
// coral, normal weeks in brand. The current week gets an accessible marker
// (label pill + dot) so the student can locate "now" at a glance.
//
// Layout: a fixed-height plot with a baseline; bars grow upward from it. When
// there are many weeks the whole row scrolls horizontally so bars never squash
// below a readable min width — the page body itself never scrolls sideways.

const PLOT_HEIGHT = 120; // px of vertical room for the tallest bar
const BAR_WIDTH = 26;
const BAR_GAP = 10;
const MIN_BAR = 4; // floor so a tiny non-zero week is still visible

interface WorkloadChartProps {
  weeks: WeekBucket[];
  /** yyyy-MM-dd (ISO Monday) of the week to mark as "current". Optional. */
  currentWeekStart?: string | null;
}

export function WorkloadChart({ weeks, currentWeekStart }: WorkloadChartProps) {
  const colors = useColors();

  if (!weeks || weeks.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.emptyText, { color: colors.ink3 }]}>
          No upcoming work to chart yet.
        </Text>
      </View>
    );
  }

  const maxLoad = Math.max(...weeks.map((w) => w.loadScore), 1);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      // Center a short chart; let a long one scroll from the left edge.
      contentContainerStyle={styles.scrollContent}
    >
      <View>
        <View style={[styles.plot, { height: PLOT_HEIGHT }]}>
          {weeks.map((w) => {
            const isCurrent = !!currentWeekStart && w.weekStart === currentWeekStart;
            // Scale to the plot height; keep a visible floor for non-zero weeks
            // so a light week isn't a sliver, and render zero-load weeks flat.
            const barHeight =
              w.loadScore <= 0
                ? 0
                : Math.max(MIN_BAR, (w.loadScore / maxLoad) * PLOT_HEIGHT);
            const barColor = w.isCrunch ? colors.coral : colors.brand;
            const a11yLabel =
              `Week of ${w.weekLabel}: ${w.items.length} ` +
              `${w.items.length === 1 ? 'task' : 'tasks'}` +
              `${w.isCrunch ? ', crunch week' : ''}` +
              `${isCurrent ? ', current week' : ''}`;
            return (
              <View
                key={w.weekStart}
                style={styles.barSlot}
                accessible
                accessibilityLabel={a11yLabel}
              >
                {/* Current-week marker: a small pill above the bar. Rendered
                    in the reserved top strip so bars keep a consistent
                    baseline regardless of the marker. */}
                <View style={styles.markerStrip}>
                  {isCurrent && (
                    <View style={[styles.nowPill, { backgroundColor: colors.ink }]}>
                      <Text style={[styles.nowPillText, { color: colors.paper }]}>NOW</Text>
                    </View>
                  )}
                </View>
                <View style={styles.barColumn}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: barHeight,
                        width: BAR_WIDTH,
                        backgroundColor: barColor,
                      },
                      isCurrent && { borderWidth: 2, borderColor: colors.ink },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* Baseline */}
        <View style={[styles.baseline, { backgroundColor: colors.line }]} />

        {/* Week labels — same slot width as the bars so they stay aligned. */}
        <View style={styles.labelRow}>
          {weeks.map((w) => {
            const isCurrent = !!currentWeekStart && w.weekStart === currentWeekStart;
            return (
              <View key={w.weekStart} style={styles.labelSlot}>
                <Text
                  style={[
                    styles.label,
                    { color: isCurrent ? colors.ink : colors.ink3 },
                    isCurrent && styles.labelCurrent,
                  ]}
                  numberOfLines={1}
                >
                  {w.weekLabel}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 2, flexGrow: 1, justifyContent: 'center' },
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: BAR_GAP,
  },
  barSlot: { width: BAR_WIDTH, alignItems: 'center', justifyContent: 'flex-end' },
  // Reserved strip above bars so the NOW pill never changes the baseline.
  markerStrip: { height: 18, justifyContent: 'flex-end', alignItems: 'center' },
  nowPill: { paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 },
  nowPillText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  barColumn: { justifyContent: 'flex-end', alignItems: 'center' },
  bar: { borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 0 },
  baseline: { height: 1.5, marginTop: 0, borderRadius: 1 },
  labelRow: { flexDirection: 'row', gap: BAR_GAP, marginTop: 6 },
  labelSlot: { width: BAR_WIDTH, alignItems: 'center' },
  label: { fontSize: 9, fontWeight: '500' },
  labelCurrent: { fontWeight: '800' },
  empty: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 13 },
});
