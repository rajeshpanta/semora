import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { format, isPast, isToday, isTomorrow, differenceInDays, differenceInHours, differenceInMinutes } from 'date-fns';
import { TASK_TYPE_LABELS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import type { TaskWithCourse } from '@/lib/queries';

interface TaskItemProps {
  task: TaskWithCourse;
  onToggle: (opts?: { submitted_late?: boolean }) => void;
  onPress: () => void;
}

function getDueLabel(dueDate: Date, dueTime: string | null): string {
  const now = new Date();

  // Build full due datetime
  let dueMoment = new Date(dueDate);
  if (dueTime) {
    const [h, m] = dueTime.split(':').map(Number);
    dueMoment.setHours(h, m, 0, 0);
  } else {
    dueMoment.setHours(23, 59, 59, 0);
  }

  if (isPast(dueMoment) && !isToday(dueDate)) {
    const daysLate = differenceInDays(now, dueDate);
    if (daysLate === 1) return '1 day late';
    return `${daysLate} days late`;
  }

  if (isToday(dueDate)) {
    if (dueTime) {
      const hoursLeft = differenceInHours(dueMoment, now);
      if (hoursLeft <= 0) {
        const minsLeft = differenceInMinutes(dueMoment, now);
        if (minsLeft <= 0) return 'Past due';
        return `${minsLeft}m left`;
      }
      if (hoursLeft < 6) return `${hoursLeft}h left`;
    }
    return 'Due today';
  }

  if (isTomorrow(dueDate)) return 'Tomorrow';

  const daysUntil = differenceInDays(dueDate, now);
  if (daysUntil <= 7) return `In ${daysUntil} days`;

  return format(dueDate, 'MMM d');
}

export function TaskItem({ task, onToggle, onPress }: TaskItemProps) {
  const colors = useColors();
  // Schema requires due_date but a malformed row would render
  // "Invalid Date" without this guard. Skip the date calculations and
  // show "No due date" — the rest of the row is still useful.
  const dueDate = task.due_date ? new Date(task.due_date + 'T00:00:00') : null;
  const overdue = !task.is_completed && !!dueDate && isPast(dueDate) && !isToday(dueDate);
  const dueToday = !!dueDate && isToday(dueDate);
  const dueLabel = dueDate ? getDueLabel(dueDate, task.due_time) : 'No due date';
  const isUrgent = dueLabel.includes('left') || dueLabel === 'Due today' || dueLabel === 'Tomorrow';

  const handleToggle = () => {
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // If completing a past-due task, ask about late submission
    if (!task.is_completed && overdue) {
      Alert.alert(
        'Past Due Date',
        `This assignment was due ${dueLabel.replace('late', 'ago')}. Was it submitted late?`,
        [
          {
            text: 'Yes, late',
            onPress: () => onToggle({ submitted_late: true }),
          },
          {
            text: 'No, on time',
            onPress: () => onToggle({ submitted_late: false }),
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    onToggle();
  };

  return (
    <TouchableOpacity style={[styles.container, { backgroundColor: colors.card, borderColor: colors.line }]} onPress={onPress} activeOpacity={0.7}>
      <TouchableOpacity onPress={handleToggle} hitSlop={8} style={styles.checkArea}>
        <View
          style={[
            styles.checkbox,
            { borderColor: task.courses.color },
            task.is_completed && { backgroundColor: task.courses.color, borderColor: task.courses.color },
          ]}
        >
          {task.is_completed && (
            <FontAwesome name="check" size={10} color="#fff" />
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.content}>
        <Text style={[styles.title, { color: colors.ink }, task.is_completed && styles.titleDone]} numberOfLines={1}>
          {task.title}
        </Text>
        <View style={styles.metaRow}>
          <View style={[styles.courseDot, { backgroundColor: task.courses.color }]} />
          <Text style={[styles.courseName, { color: colors.ink2 }]} numberOfLines={1}>{task.courses.name}</Text>
          <View style={styles.typeBadge}>
            <Text style={[styles.typeText, { color: colors.ink2 }]}>{TASK_TYPE_LABELS[task.type]}</Text>
          </View>
        </View>
      </View>

      <View style={styles.dateCol}>
        {task.submitted_late && (
          <View style={styles.lateBadge}><Text style={styles.lateBadgeText}>LATE</Text></View>
        )}
        {overdue && !task.submitted_late && (
          <View style={styles.overdueBadge}><Text style={styles.overdueBadgeText}>OVERDUE</Text></View>
        )}
        <Text style={[
          styles.dateText,
          { color: colors.ink2 },
          overdue && styles.dateOverdue,
          dueToday && { color: colors.brand },
          isUrgent && !overdue && styles.dateUrgent,
        ]}>
          {dueLabel}
        </Text>
        {task.due_time && !dueLabel.includes('left') && (
          <Text style={[styles.timeText, { color: colors.ink3 }]}>{task.due_time.slice(0, 5)}</Text>
        )}
        {task.score != null && (
          <Text style={styles.scoreText}>{task.score}%</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#edf0f7',
    gap: 12,
  },
  checkArea: { padding: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  titleDone: { textDecorationLine: 'line-through', color: '#94a3b8' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  courseDot: { width: 8, height: 8, borderRadius: 4 },
  courseName: { fontSize: 14, color: '#64748b', fontWeight: '500', maxWidth: 120 },
  typeBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  dateCol: { alignItems: 'flex-end' },
  dateText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  dateOverdue: { color: '#ef4444' },
  dateToday: { color: '#6B46C1' },
  dateUrgent: { color: '#f59e0b' },
  timeText: { fontSize: 14, color: '#94a3b8', marginTop: 2 },
  lateBadge: { backgroundColor: '#fef2f2', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, marginBottom: 2 },
  lateBadgeText: { fontSize: 10, fontWeight: '700', color: '#ef4444' },
  overdueBadge: { backgroundColor: '#fff7ed', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, marginBottom: 2 },
  overdueBadgeText: { fontSize: 10, fontWeight: '700', color: '#f97316' },
  scoreText: { fontSize: 14, fontWeight: '700', color: '#22c55e', marginTop: 2 },
});
