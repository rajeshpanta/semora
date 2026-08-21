import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { FONTS, WEB_CARD_SHADOW } from '@/lib/constants';
import { useColors } from '@/lib/theme';

/**
 * One course, as something you can act on rather than a label.
 *
 * The card used to carry a name, a count, one deadline, and — repeated on
 * every card that lacked class times — a full-width amber warning saying the
 * course would not appear on Today. Four courses meant the same warning four
 * times, which made a setup reminder the loudest thing on the screen and left
 * the cards themselves nearly empty.
 *
 * What a student actually scans a course list for is which class is in trouble
 * and what is next in it. So the card leads with a status pill that says
 * "2 overdue" in the alarm colour when that is true and falls back to what is
 * pending when it is not; then the class times, which are useful information
 * rather than a scolding when they exist; then the next deadline; then how far
 * through the coursework they are.
 */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon Wed Fri · 9:00" from the structured meeting rows. */
export function formatMeetings(meetings: any[] | null | undefined): string | null {
  if (!meetings || meetings.length === 0) return null;
  const days = new Set<number>();
  let earliest: string | null = null;
  for (const meeting of meetings) {
    for (const day of meeting.days_of_week ?? []) days.add(day);
    const start = meeting.start_time;
    if (start && (!earliest || start < earliest)) earliest = start;
  }
  if (days.size === 0) return null;
  const label = [...days].sort().map((d) => DAY_NAMES[d]).join(' ');
  return earliest ? `${label} · ${earliest.slice(0, 5)}` : label;
}

export type CourseCardData = {
  id: string;
  name: string;
  color: string;
  instructor?: string | null;
  meetingLabel: string | null;
  overdueCount: number;
  pendingCount: number;
  completedCount: number;
  totalCount: number;
  nextTitle: string | null;
  nextDue: string | null;
  nextUrgent: boolean;
  nextIsExam: boolean;
};

export default function CourseCard({
  course,
  width,
  onPress,
  onAddSchedule,
}: {
  course: CourseCardData;
  width?: number | string;
  onPress: () => void;
  onAddSchedule: () => void;
}) {
  const colors = useColors();
  const {
    name, color, instructor, meetingLabel,
    overdueCount, pendingCount, completedCount, totalCount,
    nextTitle, nextDue, nextUrgent, nextIsExam,
  } = course;

  const done = totalCount > 0 ? completedCount / totalCount : 0;
  const pillCoral = overdueCount > 0;

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.line },
        width ? ({ width } as any) : null,
        WEB_CARD_SHADOW as any,
      ]}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${overdueCount > 0 ? `${overdueCount} overdue, ` : ''}${pendingCount} pending`}
    >
      <View style={[styles.strip, { backgroundColor: color }]} />

      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>{name}</Text>
          <View style={styles.subRow}>
            {!!instructor && (
              <Text style={[styles.sub, { color: colors.ink3 }]} numberOfLines={1}>{instructor}</Text>
            )}
            {/* The separator follows the INSTRUCTOR, not the meeting label —
                it was conditioned on both, so a course with a teacher and no
                class times rendered "Dra. R. OkonkwoAdd class times" with the
                two run together. Something always follows the instructor here;
                the only question is which of the two it is. */}
            {!!instructor && (
              <Text style={[styles.sub, { color: colors.ink3 }]}> · </Text>
            )}
            {meetingLabel ? (
              <Text style={[styles.sub, { color: colors.ink3 }]} numberOfLines={1}>{meetingLabel}</Text>
            ) : (
              <TouchableOpacity onPress={onAddSchedule} accessibilityRole="button">
                <Text style={[styles.addTimes, { color: colors.brand }]}>Add class times</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View
          style={[
            styles.pill,
            { backgroundColor: pillCoral ? colors.coral50 : color + '18' },
          ]}
        >
          <Text style={[styles.pillText, { color: pillCoral ? colors.coral : color }]}>
            {pillCoral
              ? `${overdueCount} overdue`
              : pendingCount === 0
                ? 'All clear'
                : `${pendingCount} up next`}
          </Text>
        </View>
      </View>

      {!!nextTitle && (
        <View style={[styles.next, { borderTopColor: colors.line }]}>
          <FontAwesome
            name={nextIsExam ? 'exclamation-circle' : 'clock-o'}
            size={12}
            color={nextUrgent ? colors.coral : colors.ink3}
          />
          <Text style={[styles.nextTitle, { color: colors.ink2 }]} numberOfLines={1}>
            {nextTitle}
          </Text>
          <Text
            style={[
              styles.nextDue,
              { color: nextUrgent ? colors.coral : colors.ink3 },
              nextUrgent && { fontWeight: '700' },
            ]}
          >
            {nextDue}
          </Text>
        </View>
      )}

      {totalCount > 0 && (
        <View style={[styles.progress, { borderTopColor: colors.line }]}>
          <View style={[styles.track, { backgroundColor: colors.line }]}>
            <View
              style={[
                styles.fill,
                { width: `${Math.round(done * 100)}%`, backgroundColor: color },
              ]}
            />
          </View>
          <Text style={[styles.progressText, { color: colors.ink3 }]}>
            {`${completedCount} of ${totalCount} done`}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', paddingLeft: 3 },
  strip: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 12,
  },
  name: { fontFamily: FONTS.display, fontSize: 16 },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, flexWrap: 'wrap' },
  sub: { fontSize: 11.5 },
  addTimes: { fontSize: 11.5, fontWeight: '600' },
  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700' },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  nextTitle: { flex: 1, fontSize: 12.5 },
  nextDue: { fontSize: 11.5 },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  track: { flex: 1, height: 5, borderRadius: 999, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  progressText: { fontSize: 11, fontVariant: ['tabular-nums'] },
});
