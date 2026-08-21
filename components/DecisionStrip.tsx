import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { FONTS, WEB_CARD_SHADOW } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import type { Task } from '@/types/database';

/**
 * The four numbers a student reads in the first two seconds on a desktop.
 *
 * The web dashboard was the phone dashboard centred in a browser: a single
 * column of cards, in the order a thumb would scroll them, using about a
 * third of a 1600px window. Nothing quantitative was visible until you
 * navigated somewhere. This band puts the four decisions above everything
 * else, using data the screen already had in memory.
 *
 * DELIBERATELY NO GRADES. A laptop in a lecture hall is a public screen and
 * a projected letter grade is the most exposing thing in the product — the
 * person behind you can read it, and unlike a deadline it says something
 * about you rather than about the course. The fourth tile names the course
 * that needs work and stays silent about how well it is going; the letter
 * lives on Courses and Progress, where a student chose to look.
 */

export type DecisionTone = 'brand' | 'coral' | 'amber' | 'teal';

type Tile = {
  key: string;
  label: string;
  value: string;
  /** Rendered smaller and muted, immediately after `value`. */
  valueSuffix?: string;
  detail: string;
  tone: DecisionTone;
  action?: { label: string; onPress: () => void; ghost?: boolean };
  /** Value uses the reading typeface at body size rather than as a figure. */
  asName?: boolean;
};

function minutesFor(task: Pick<Task, 'estimated_minutes' | 'type'>): number {
  if (typeof task.estimated_minutes === 'number' && task.estimated_minutes > 0) {
    return task.estimated_minutes;
  }
  // Mirrors the smart planner's fallbacks so the strip and the planner never
  // disagree about how heavy a week is.
  switch (task.type) {
    case 'exam': return 180;
    case 'quiz': return 45;
    case 'project': return 150;
    case 'reading': return 40;
    default: return 60;
  }
}

function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = minutes / 60;
  return hours >= 10 ? `${Math.round(hours)}` : `${Math.round(hours * 10) / 10}`;
}

export default function DecisionStrip({
  overdue,
  dueToday,
  dueTomorrow,
  weekTasks,
  attentionCourse,
  attentionReason,
}: {
  overdue: any[];
  dueToday: any[];
  dueTomorrow: any[];
  weekTasks: any[];
  attentionCourse: string | null;
  attentionReason: string | null;
}) {
  const colors = useColors();
  const router = useRouter();

  const weekMinutes = useMemo(
    () => weekTasks.reduce((total, task) => total + minutesFor(task), 0),
    [weekTasks],
  );

  const tiles: Tile[] = [];

  if (overdue.length > 0) {
    // useTasks sorts by due_date ascending, so [0] is the most overdue.
    const oldest = overdue[0];
    tiles.push({
      key: 'overdue',
      label: 'Overdue',
      value: String(overdue.length),
      detail: oldest?.title ? `Oldest: ${oldest.title}` : 'Needs triage',
      tone: 'coral',
    });
  } else {
    tiles.push({
      key: 'overdue',
      label: 'Overdue',
      value: '0',
      detail: 'Nothing is past due',
      tone: 'teal',
    });
  }

  tiles.push({
    key: 'due',
    label: 'Due today & tomorrow',
    value: String(dueToday.length),
    valueSuffix: dueTomorrow.length > 0 ? `+${dueTomorrow.length}` : undefined,
    detail:
      dueToday.length === 0 && dueTomorrow.length === 0
        ? 'Nothing new due'
        : `${dueToday.length} today, ${dueTomorrow.length} tomorrow`,
    tone: dueToday.length > 0 ? 'brand' : 'teal',
  });

  tiles.push({
    key: 'load',
    label: "This week's work",
    value: formatHours(weekMinutes),
    valueSuffix: weekMinutes >= 60 ? 'h' : undefined,
    detail: weekTasks.length === 1 ? 'across 1 task' : `across ${weekTasks.length} tasks`,
    tone: weekMinutes > 900 ? 'amber' : 'brand',
    action: { label: 'Plan my week', onPress: () => router.push('/planner' as any) },
  });

  tiles.push({
    key: 'attention',
    label: 'Needs attention',
    value: attentionCourse ?? 'All steady',
    asName: true,
    detail: attentionReason ?? 'No course is falling behind',
    tone: attentionCourse ? 'amber' : 'teal',
    action: attentionCourse
      ? { label: 'Open workload', onPress: () => router.push('/dashboard' as any), ghost: true }
      : undefined,
  });

  const toneColor: Record<DecisionTone, string> = {
    brand: colors.brand,
    coral: colors.coral,
    amber: colors.amber,
    teal: colors.teal,
  };

  return (
    <View style={styles.row}>
      {tiles.map((tile) => (
        <View
          key={tile.key}
          style={[
            styles.tile,
            { backgroundColor: colors.card, borderColor: colors.line },
            WEB_CARD_SHADOW as any,
          ]}
        >
          <View style={[styles.rail, { backgroundColor: toneColor[tile.tone] }]} />
          <Text style={[styles.label, { color: colors.ink3 }]}>{tile.label}</Text>
          <View style={styles.valueRow}>
            <Text
              style={[
                tile.asName ? styles.valueName : styles.value,
                { color: tile.tone === 'brand' ? colors.ink : toneColor[tile.tone] },
              ]}
              numberOfLines={1}
            >
              {tile.value}
            </Text>
            {!!tile.valueSuffix && (
              <Text style={[styles.suffix, { color: colors.ink3 }]}>{tile.valueSuffix}</Text>
            )}
          </View>
          <Text style={[styles.detail, { color: colors.ink2 }]} numberOfLines={2}>
            {tile.detail}
          </Text>
          {!!tile.action && (
            <TouchableOpacity
              onPress={tile.action.onPress}
              style={[
                styles.action,
                tile.action.ghost
                  ? { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.brand100 }
                  : { backgroundColor: colors.brand },
              ]}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.actionText,
                  { color: tile.action.ghost ? colors.brand : '#FFFFFF' },
                ]}
              >
                {tile.action.label}
              </Text>
              <FontAwesome
                name="angle-right"
                size={12}
                color={tile.action.ghost ? colors.brand : '#FFFFFF'}
              />
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, marginBottom: 18 },
  tile: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 13,
    paddingLeft: 17,
    paddingRight: 14,
    overflow: 'hidden',
  },
  rail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  value: { fontFamily: FONTS.display, fontSize: 27, lineHeight: 30 },
  valueName: { fontFamily: FONTS.display, fontSize: 18, lineHeight: 24 },
  suffix: { fontSize: 13, fontWeight: '700' },
  detail: { fontSize: 11.5, marginTop: 6, lineHeight: 16 },
  action: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  actionText: { fontSize: 11.5, fontWeight: '700' },
});
