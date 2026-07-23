import { useState } from 'react';
import { Alert, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DatePicker } from '@/components/DatePicker';
import { useColors } from '@/lib/theme';
import {
  PRIORITY_OPTIONS, RECURRENCE_OPTIONS, REMINDER_OPTIONS,
  customReminderLabel, effectiveDueDate, reminderOptionLabel,
} from '@/lib/taskPlanning';
import type { RecurrenceFrequency, TaskPriority } from '@/types/database';

type Props = {
  priority: TaskPriority;
  onPriorityChange: (value: TaskPriority) => void;
  estimatedMinutes: number | null;
  onEstimatedMinutesChange: (value: number | null) => void;
  startDate: Date | null;
  onStartDateChange: (value: Date | null) => void;
  recurrence: RecurrenceFrequency | null;
  onRecurrenceChange: (value: RecurrenceFrequency | null) => void;
  recurrenceEndDate: Date | null;
  onRecurrenceEndDateChange: (value: Date | null) => void;
  dueDate: Date | null;
  dueTime: Date | null;
  reminderOffsets: number[] | null;
  onReminderOffsetsChange: (value: number[] | null) => void;
};

export function TaskPlanningFields(props: Props) {
  const colors = useColors();
  const [showCustomReminder, setShowCustomReminder] = useState(false);
  const [customDate, setCustomDate] = useState<Date | null>(null);
  const [customTime, setCustomTime] = useState<Date | null>(null);

  const toggleReminder = (offset: number) => {
    const current = props.reminderOffsets || [];
    const next = current.includes(offset)
      ? current.filter((value) => value !== offset)
      : [...current, offset].sort((a, b) => a - b);
    props.onReminderOffsetsChange(next);
  };

  const openCustomReminder = () => {
    const due = effectiveDueDate(props.dueDate, props.dueTime);
    if (!due) {
      Alert.alert('Choose a due date', 'Set the task due date before adding a custom reminder.');
      return;
    }
    const suggested = new Date(due.getTime() - 2 * 60 * 60 * 1000);
    setCustomDate(suggested);
    setCustomTime(suggested);
    setShowCustomReminder(true);
  };

  const addCustomReminder = () => {
    const due = effectiveDueDate(props.dueDate, props.dueTime);
    if (!due || !customDate || !customTime) return;
    const reminder = new Date(customDate);
    reminder.setHours(customTime.getHours(), customTime.getMinutes(), 0, 0);
    const offset = Math.round((due.getTime() - reminder.getTime()) / 60_000);
    if (offset < 0) {
      Alert.alert('Reminder is too late', 'Choose a reminder on or before the task due time.');
      return;
    }
    if (offset > 525_600) {
      Alert.alert('Reminder is too early', 'Custom reminders can be up to one year before the due date.');
      return;
    }
    const current = props.reminderOffsets || [];
    const next = [...new Set([...current, offset])].sort((a, b) => a - b);
    if (next.length > 8) {
      Alert.alert('Reminder limit', 'Choose up to 8 reminders for one task.');
      return;
    }
    props.onReminderOffsetsChange(next);
    setShowCustomReminder(false);
  };

  const customOffsets = (props.reminderOffsets || [])
    .filter((offset) => !REMINDER_OPTIONS.some((option) => option.value === offset));

  return (
    <>
      <Text style={[styles.label, { color: colors.ink2 }]}>Priority</Text>
      <View style={styles.wrap}>
        {PRIORITY_OPTIONS.map((option) => {
          const selected = props.priority === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, { borderColor: colors.line }, selected && { backgroundColor: colors.brand, borderColor: colors.brand }]}
              onPress={() => props.onPriorityChange(option.value)}
            >
              <FontAwesome name={option.icon as any} size={11} color={selected ? '#fff' : colors.ink2} />
              <Text style={[styles.chipText, { color: selected ? '#fff' : colors.ink2 }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.label, { color: colors.ink2 }]}>Estimated Effort</Text>
      <Text style={[styles.help, { color: colors.ink3 }]}>Used by Smart Plan to split the work into realistic sessions.</Text>
      <View style={styles.wrap}>
        {[
          { value: null, label: 'Smart estimate' },
          { value: 30, label: '30m' },
          { value: 60, label: '1h' },
          { value: 120, label: '2h' },
          { value: 180, label: '3h' },
          { value: 240, label: '4h' },
          { value: 480, label: '8h' },
        ].map((option) => {
          const selected = props.estimatedMinutes === option.value;
          return (
            <TouchableOpacity
              key={option.label}
              style={[styles.chip, { borderColor: colors.line }, selected && { backgroundColor: colors.brand, borderColor: colors.brand }]}
              onPress={() => props.onEstimatedMinutesChange(option.value)}
            >
              <Text style={[styles.chipText, { color: selected ? '#fff' : colors.ink2 }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.label, { color: colors.ink2 }]}>Start Date</Text>
      <DatePicker value={props.startDate} onChange={props.onStartDateChange} onClear={() => props.onStartDateChange(null)} mode="date" placeholder="Optional" />

      <Text style={[styles.label, { color: colors.ink2 }]}>Repeat</Text>
      <View style={styles.wrap}>
        {RECURRENCE_OPTIONS.map((option) => {
          const selected = props.recurrence === option.value;
          return (
            <TouchableOpacity
              key={option.value || 'none'}
              style={[styles.chip, { borderColor: colors.line }, selected && { backgroundColor: colors.brand, borderColor: colors.brand }]}
              onPress={() => props.onRecurrenceChange(option.value)}
            >
              <Text style={[styles.chipText, { color: selected ? '#fff' : colors.ink2 }]}>{option.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {props.recurrence && (
        <>
          <Text style={[styles.label, { color: colors.ink2 }]}>Repeat Until</Text>
          <DatePicker
            value={props.recurrenceEndDate}
            onChange={props.onRecurrenceEndDateChange}
            onClear={() => props.onRecurrenceEndDateChange(null)}
            mode="date"
            placeholder="No end date"
          />
        </>
      )}

      <Text style={[styles.label, { color: colors.ink2 }]}>Reminders</Text>
      <Text style={[styles.help, { color: colors.ink3 }]}>
        {props.dueTime
          ? 'Choose presets or add an exact reminder date and time.'
          : 'No due time set — due-date reminders use 9:00 AM.'}
      </Text>
      <View style={styles.wrap}>
        <TouchableOpacity
          style={[styles.chip, { borderColor: colors.line }, props.reminderOffsets === null && { backgroundColor: colors.brand, borderColor: colors.brand }]}
          onPress={() => props.onReminderOffsetsChange(null)}
        >
          <Text style={[styles.chipText, { color: props.reminderOffsets === null ? '#fff' : colors.ink2 }]}>Defaults</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chip, { borderColor: colors.line }, props.reminderOffsets?.length === 0 && { backgroundColor: colors.brand, borderColor: colors.brand }]}
          onPress={() => props.onReminderOffsetsChange([])}
        >
          <Text style={[styles.chipText, { color: props.reminderOffsets?.length === 0 ? '#fff' : colors.ink2 }]}>None</Text>
        </TouchableOpacity>
        {REMINDER_OPTIONS.map((option) => {
          const selected = props.reminderOffsets?.includes(option.value) || false;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.chip, { borderColor: colors.line }, selected && { backgroundColor: colors.brand, borderColor: colors.brand }]}
              onPress={() => toggleReminder(option.value)}
            >
              <Text style={[styles.chipText, { color: selected ? '#fff' : colors.ink2 }]}>
                {reminderOptionLabel(option.value, !!props.dueTime)}
              </Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={[styles.chip, { borderColor: colors.brand, backgroundColor: colors.brand50 }]}
          onPress={openCustomReminder}
        >
          <FontAwesome name="plus" size={11} color={colors.brand} />
          <Text style={[styles.chipText, { color: colors.brand }]}>Exact date & time</Text>
        </TouchableOpacity>
      </View>

      {customOffsets.length > 0 && (
        <View style={styles.customList}>
          {customOffsets.map((offset) => (
            <TouchableOpacity
              key={offset}
              style={[styles.customChip, { backgroundColor: colors.brand50 }]}
              onPress={() => toggleReminder(offset)}
              accessibilityLabel={`Remove reminder ${customReminderLabel(offset, props.dueDate, props.dueTime)}`}
            >
              <FontAwesome name="clock-o" size={11} color={colors.brand} />
              <Text style={[styles.customChipText, { color: colors.brand }]}>
                {customReminderLabel(offset, props.dueDate, props.dueTime)}
              </Text>
              <FontAwesome name="times" size={11} color={colors.brand} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {showCustomReminder && (
        <View style={[styles.customEditor, { borderColor: colors.line, backgroundColor: colors.paper }]}> 
          <Text style={[styles.customTitle, { color: colors.ink }]}>Custom reminder</Text>
          <View style={styles.customDateRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.customLabel, { color: colors.ink3 }]}>Date</Text>
              <DatePicker value={customDate} onChange={setCustomDate} mode="date" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.customLabel, { color: colors.ink3 }]}>Time</Text>
              <DatePicker value={customTime} onChange={setCustomTime} mode="time" />
            </View>
          </View>
          <View style={styles.customActions}>
            <TouchableOpacity onPress={() => setShowCustomReminder(false)} hitSlop={8}>
              <Text style={[styles.customCancel, { color: colors.ink3 }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.customAdd, { backgroundColor: colors.brand }]} onPress={addCustomReminder}>
              <Text style={styles.customAddText}>Add reminder</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', marginTop: 20, marginBottom: 8 },
  help: { fontSize: 12, marginTop: -3, marginBottom: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 38, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1,
    flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center',
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  customList: { gap: 7, marginTop: 10 },
  customChip: {
    minHeight: 36, paddingHorizontal: 11, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 7,
  },
  customChipText: { fontSize: 12, fontWeight: '700' },
  customEditor: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  customTitle: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  customDateRow: { flexDirection: 'row', gap: 10 },
  customLabel: { fontSize: 11, fontWeight: '600', marginBottom: 5 },
  customActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginTop: 12 },
  customCancel: { fontSize: 13, fontWeight: '600' },
  customAdd: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 9 },
  customAddText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
