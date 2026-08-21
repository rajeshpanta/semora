import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { addDays, format, isSameDay } from 'date-fns';
import { FONTS, WEB_CARD_SHADOW } from '@/lib/constants';
import { useColors } from '@/lib/theme';

/**
 * The seven days ahead, as a shape rather than a list.
 *
 * The dashboard could already tell a student what was due; it could not tell
 * them which day was going to hurt. That is the question the sidebar's
 * Workload screen answers, and nobody visits a screen to ask a question they
 * have not been prompted to ask — so the answer belongs on the surface they
 * already open.
 *
 * Deliberately NOT a planner. Bars, not draggable blocks: tasks carry a due
 * date and no start time, so any grid pretending you can move work to Saturday
 * would be lying about where it ended up. This shows load per day and marks the
 * worst one; scheduling waits until there is a field to schedule into.
 */

function minutesFor(task: { estimated_minutes?: number | null; type?: string }): number {
  if (typeof task.estimated_minutes === 'number' && task.estimated_minutes > 0) {
    return task.estimated_minutes;
  }
  switch (task.type) {
    case 'exam': return 180;
    case 'quiz': return 45;
    case 'project': return 150;
    case 'reading': return 40;
    default: return 60;
  }
}

export default function WeekGlance({ tasks, today }: { tasks: any[]; today: Date }) {
  const colors = useColors();
  const router = useRouter();

  const days = useMemo(() => {
    const out = [];
    for (let offset = 0; offset < 7; offset++) {
      const date = addDays(today, offset);
      const key = format(date, 'yyyy-MM-dd');
      const forDay = tasks.filter((t) => t.due_date === key && !t.is_completed);
      out.push({
        date,
        key,
        label: format(date, 'EEE'),
        dayNum: format(date, 'd'),
        minutes: forDay.reduce((sum, t) => sum + minutesFor(t), 0),
        count: forDay.length,
        hasExam: forDay.some((t) => t.type === 'exam'),
        isToday: isSameDay(date, today),
      });
    }
    return out;
  }, [tasks, today]);

  const peak = Math.max(...days.map((d) => d.minutes), 60);
  const heaviest = days.reduce((worst, day) => (day.minutes > worst.minutes ? day : worst), days[0]);
  const total = days.reduce((sum, d) => sum + d.minutes, 0);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.line },
        WEB_CARD_SHADOW as any,
      ]}
    >
      <TouchableOpacity
        style={[styles.head, { borderBottomColor: colors.line }]}
        onPress={() => router.push('/dashboard' as any)}
        accessibilityRole="button"
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.ink }]}>Next 7 days</Text>
          <Text style={[styles.sub, { color: colors.ink3 }]}>
            {total === 0
              ? 'Nothing scheduled'
              : `${Math.round((total / 60) * 10) / 10}h of work ahead`}
          </Text>
        </View>
        <FontAwesome name="angle-right" size={16} color={colors.ink3} />
      </TouchableOpacity>

      <View style={styles.bars}>
        {days.map((day) => {
          const height = day.minutes === 0 ? 3 : Math.max(6, (day.minutes / peak) * 68);
          const isPeak = day.minutes > 0 && day.minutes === heaviest.minutes;
          const fill = day.hasExam || isPeak ? colors.coral : day.isToday ? colors.brand : colors.brand100;
          return (
            <View key={day.key} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { height, backgroundColor: fill }]} />
              </View>
              <Text
                style={[
                  styles.dayLabel,
                  { color: day.isToday ? colors.brand : colors.ink3 },
                  day.isToday && { fontWeight: '700' },
                ]}
              >
                {day.label}
              </Text>
              <Text style={[styles.dayNum, { color: colors.ink3 }]}>{day.dayNum}</Text>
            </View>
          );
        })}
      </View>

      {heaviest.minutes > 0 && (
        <Text style={[styles.note, { color: colors.ink2, borderTopColor: colors.line }]}>
          {`Heaviest is ${format(heaviest.date, 'EEEE')} — ${Math.round((heaviest.minutes / 60) * 10) / 10}h across ${heaviest.count} ${heaviest.count === 1 ? 'task' : 'tasks'}${heaviest.hasExam ? ', including an exam' : ''}.`}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  title: { fontFamily: FONTS.display, fontSize: 15 },
  sub: { fontSize: 11.5, marginTop: 1 },
  bars: { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 14, paddingBottom: 10 },
  barCol: { flex: 1, alignItems: 'center' },
  barTrack: { height: 72, justifyContent: 'flex-end' },
  barFill: { width: 16, borderRadius: 4 },
  dayLabel: { fontSize: 10.5, marginTop: 7 },
  dayNum: { fontSize: 10, marginTop: 1 },
  note: { fontSize: 11, lineHeight: 16, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1 },
});
