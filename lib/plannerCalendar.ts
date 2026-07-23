import { addDays, format } from 'date-fns';
import { Platform } from 'react-native';
import type { PlannerBusyInterval } from '@/lib/studyPlanner';

/**
 * Read-only EventKit lookup for Smart Planner. It never creates or edits an
 * event. Automatic plan refreshes do not prompt; the settings save path may.
 */
export async function getPlannerCalendarConflicts(
  from: Date,
  days: number,
  requestIfNeeded = false,
): Promise<{ intervals: PlannerBusyInterval[]; permission: 'granted' | 'denied' | 'undetermined' }> {
  if (Platform.OS === 'web') return { intervals: [], permission: 'denied' };
  try {
    const Calendar = await import('expo-calendar');
    let permission = await Calendar.getCalendarPermissionsAsync();
    if (permission.status === 'undetermined' && requestIfNeeded) {
      permission = await Calendar.requestCalendarPermissionsAsync();
    }
    if (permission.status !== 'granted') {
      return { intervals: [], permission: permission.status as 'denied' | 'undetermined' };
    }

    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const readable = calendars.filter((calendar) => calendar.allowsModifications !== false || calendar.source != null);
    const end = addDays(from, Math.max(1, days));
    const events = await Calendar.getEventsAsync(readable.map((calendar) => calendar.id), from, end);
    const intervals: PlannerBusyInterval[] = [];

    for (const event of events) {
      if (event.allDay) continue;
      const start = new Date(event.startDate);
      const finish = new Date(event.endDate);
      if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime()) || finish <= start) continue;

      // EventKit may return an event crossing midnight. Split it so the pure
      // planner can compare each calendar day independently.
      let cursor = new Date(start);
      while (format(cursor, 'yyyy-MM-dd') <= format(finish, 'yyyy-MM-dd')) {
        const key = format(cursor, 'yyyy-MM-dd');
        const sameStartDay = key === format(start, 'yyyy-MM-dd');
        const sameEndDay = key === format(finish, 'yyyy-MM-dd');
        intervals.push({
          date: key,
          start_time: sameStartDay ? format(start, 'HH:mm:ss') : '00:00:00',
          end_time: sameEndDay ? format(finish, 'HH:mm:ss') : '23:59:00',
          title: event.title || 'Calendar event',
        });
        cursor = addDays(new Date(`${key}T00:00:00`), 1);
      }
    }
    return { intervals, permission: 'granted' };
  } catch {
    return { intervals: [], permission: 'denied' };
  }
}
