import type { RecurrenceFrequency, TaskPriority } from '@/types/database';
import { format, subMinutes } from 'date-fns';

export const PRIORITY_OPTIONS: { value: TaskPriority; label: string; icon: string }[] = [
  { value: 'low', label: 'Low', icon: 'arrow-down' },
  { value: 'normal', label: 'Normal', icon: 'minus' },
  { value: 'high', label: 'High', icon: 'arrow-up' },
];

export const RECURRENCE_OPTIONS: { value: RecurrenceFrequency | null; label: string }[] = [
  { value: null, label: 'Does not repeat' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
];

export const REMINDER_OPTIONS = [
  { value: 0, label: 'At due time' },
  { value: 60, label: '1 hour before' },
  { value: 180, label: '3 hours before' },
  { value: 1440, label: '1 day before' },
  { value: 4320, label: '3 days before' },
  { value: 10080, label: '1 week before' },
];

type DateLike = Date | string | null | undefined;

export function effectiveDueDate(dueDate: DateLike, dueTime?: DateLike): Date | null {
  if (!dueDate) return null;
  const due = dueDate instanceof Date
    ? new Date(dueDate)
    : new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;

  if (dueTime instanceof Date) {
    due.setHours(dueTime.getHours(), dueTime.getMinutes(), 0, 0);
  } else if (typeof dueTime === 'string' && dueTime) {
    const [hours, minutes] = dueTime.split(':').map(Number);
    due.setHours(hours, minutes, 0, 0);
  } else {
    // This is the scheduler's real fallback. Surfacing it in the UI avoids
    // claiming "at due time" when the task has no due time at all.
    due.setHours(9, 0, 0, 0);
  }
  return due;
}

export function reminderOptionLabel(offset: number, hasDueTime: boolean) {
  if (offset === 0 && !hasDueTime) return '9:00 AM due date';
  return REMINDER_OPTIONS.find((option) => option.value === offset)?.label || formatReminderOffset(offset);
}

export function formatReminderOffset(offset: number) {
  if (offset === 0) return 'At due time';
  const days = Math.floor(offset / 1440);
  const hours = Math.floor((offset % 1440) / 60);
  const minutes = offset % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  return `${parts.join(' ')} before`;
}

export function customReminderLabel(offset: number, dueDate: DateLike, dueTime?: DateLike) {
  const due = effectiveDueDate(dueDate, dueTime);
  if (!due) return formatReminderOffset(offset);
  return format(subMinutes(due, offset), 'MMM d, h:mm a');
}

export function recurrenceLabel(value: RecurrenceFrequency | null | undefined) {
  return RECURRENCE_OPTIONS.find((option) => option.value === value)?.label || 'Does not repeat';
}

export function reminderSummary(
  offsets: number[] | null | undefined,
  dueDate?: DateLike,
  dueTime?: DateLike,
) {
  if (offsets == null) return 'Use notification defaults';
  if (offsets.length === 0) return 'No reminders';
  const hasDueTime = !!dueTime;
  return offsets
    .map((offset) => REMINDER_OPTIONS.some((option) => option.value === offset)
      ? reminderOptionLabel(offset, hasDueTime)
      : customReminderLabel(offset, dueDate, dueTime))
    .join(', ');
}
