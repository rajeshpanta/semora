import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import type { Task } from '@/types/database';

const CALENDAR_ID_KEY = 'syllabussnap_calendar_id';
const SYNCED_ENABLED_KEY = 'syllabussnap_cal_enabled';

// Lazy-load expo-calendar to avoid crash in Expo Go
async function getCalendarModule() {
  try {
    return await import('expo-calendar');
  } catch {
    return null;
  }
}

// ── Permissions ────────────────────────────────────────────

export async function requestCalendarPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const Calendar = await getCalendarModule();
  if (!Calendar) return false;
  const { status: existing } = await Calendar.getCalendarPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === 'granted';
}

// ── Calendar CRUD ──────────────────────────────────────────

async function getOrCreateCalendar(): Promise<string | null> {
  const Calendar = await getCalendarModule();
  if (!Calendar) return null;

  const stored = SecureStore.getItem(CALENDAR_ID_KEY);

  // Verify stored calendar still exists
  if (stored) {
    try {
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      if (calendars.some((c) => c.id === stored)) return stored;
    } catch (e) { console.warn('[CalendarSync] Failed to verify stored calendar:', e); }
  }

  const defaultSource =
    Platform.OS === 'ios'
      ? await getDefaultCalendarSource(Calendar)
      : { isLocalAccount: true, name: 'Semora', type: 'LOCAL' as any };

  const id = await Calendar.createCalendarAsync({
    title: 'Semora',
    color: '#6B46C1',
    entityType: Calendar.EntityTypes.EVENT,
    source: defaultSource as any,
    name: 'semora',
    ownerAccount: 'personal',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });

  SecureStore.setItem(CALENDAR_ID_KEY, id);
  return id;
}

async function getDefaultCalendarSource(Calendar: any) {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const defaultCal = calendars.find(
    (c: any) => c.source?.name === 'iCloud' || c.source?.name === 'Default',
  );
  return defaultCal?.source ?? calendars[0]?.source ?? { name: 'Semora', isLocalAccount: true };
}

// ── Sync logic ─────────────────────────────────────────────

export async function syncTaskToCalendar(
  task: Task,
  courseName: string,
): Promise<void> {
  if (Platform.OS === 'web') return;
  const Calendar = await getCalendarModule();
  if (!Calendar) return;

  const calendarId = await getOrCreateCalendar();
  if (!calendarId) return;

  const [year, month, day] = task.due_date.split('-').map(Number);

  let eventDetails: Record<string, any>;

  if (task.due_time) {
    const [h, m] = task.due_time.split(':').map(Number);
    const startDate = new Date(year, month - 1, day, h, m);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    eventDetails = {
      title: `${task.title} — ${courseName}`,
      startDate,
      endDate,
      allDay: false,
      notes: task.description || undefined,
      alarms: [{ relativeOffset: -60 }],
    };
  } else {
    // All-day event: start = due date, end = next day (iOS requirement)
    const startDate = new Date(year, month - 1, day, 0, 0, 0);
    const endDate = new Date(year, month - 1, day + 1, 0, 0, 0);
    eventDetails = {
      title: `${task.title} — ${courseName}`,
      startDate,
      endDate,
      allDay: true,
      notes: task.description || undefined,
      alarms: [{ relativeOffset: -480 }], // 8 hours before (morning of)
    };
  }

  // Search for existing event by title in this calendar to handle dedup
  // without needing a large persistent map
  try {
    const rangeStart = new Date(year, month - 1, day - 1);
    const rangeEnd = new Date(year, month - 1, day + 2);
    const existing = await Calendar.getEventsAsync([calendarId], rangeStart, rangeEnd);
    const match = existing.find((e) => e.title === eventDetails.title);

    if (match) {
      await Calendar.updateEventAsync(match.id, eventDetails);
      return;
    }
  } catch (e) { console.warn('[CalendarSync] Failed to search/update existing event:', e); }

  await Calendar.createEventAsync(calendarId, eventDetails);
}

export async function removeTaskFromCalendar(
  taskTitle: string,
  courseName: string,
  dueDate: string,
): Promise<void> {
  if (Platform.OS === 'web') return;
  const Calendar = await getCalendarModule();
  if (!Calendar) return;

  const calId = SecureStore.getItem(CALENDAR_ID_KEY);
  if (!calId) return;

  const eventTitle = `${taskTitle} — ${courseName}`;
  const [year, month, day] = dueDate.split('-').map(Number);

  try {
    const rangeStart = new Date(year, month - 1, day - 1);
    const rangeEnd = new Date(year, month - 1, day + 2);
    const events = await Calendar.getEventsAsync([calId], rangeStart, rangeEnd);
    const match = events.find((e) => e.title === eventTitle);
    if (match) {
      await Calendar.deleteEventAsync(match.id);
    }
  } catch (e) { console.warn('[CalendarSync] Failed to remove event:', e); }
}

/**
 * Full sync: push all incomplete tasks from the selected semester to the device calendar.
 * Returns the number of events synced.
 */
export async function syncAllTasks(semesterId: string | null): Promise<number> {
  if (Platform.OS === 'web' || !semesterId) return 0;

  const Calendar = await getCalendarModule();
  if (!Calendar) return 0;

  // Fetch all incomplete tasks with course info
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*, courses!inner(name, color, semester_id)')
    .eq('courses.semester_id', semesterId)
    .eq('is_completed', false)
    .order('due_date');

  if (error || !tasks) return 0;

  let count = 0;
  for (const task of tasks) {
    const course = (task as any).courses;
    try {
      await syncTaskToCalendar(task as Task, course.name);
      count++;
    } catch (e) { console.warn('[CalendarSync] Failed to sync task:', e); }
  }

  // Mark sync as enabled
  SecureStore.setItem(SYNCED_ENABLED_KEY, 'true');

  return count;
}

/**
 * Remove the Semora calendar and all synced events.
 */
export async function unsyncAll(): Promise<void> {
  if (Platform.OS === 'web') return;
  const Calendar = await getCalendarModule();

  const calendarId = SecureStore.getItem(CALENDAR_ID_KEY);
  if (calendarId && Calendar) {
    try {
      await Calendar.deleteCalendarAsync(calendarId);
    } catch (e) { console.warn('[CalendarSync] Failed to delete calendar:', e); }
  }

  try { await SecureStore.deleteItemAsync(CALENDAR_ID_KEY); } catch (e) { console.warn('[CalendarSync] Failed to clear calendar ID:', e); }
  try { await SecureStore.deleteItemAsync(SYNCED_ENABLED_KEY); } catch (e) { console.warn('[CalendarSync] Failed to clear sync flag:', e); }
}

/**
 * Check if calendar sync is currently active.
 */
export async function isSynced(): Promise<boolean> {
  const enabled = SecureStore.getItem(SYNCED_ENABLED_KEY);
  if (enabled !== 'true') return false;

  const calendarId = SecureStore.getItem(CALENDAR_ID_KEY);
  if (!calendarId) return false;

  const Calendar = await getCalendarModule();
  if (!Calendar) return false;

  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    return calendars.some((c) => c.id === calendarId);
  } catch {
    return false;
  }
}

/**
 * Quick check if sync is enabled (sync, no native calls).
 * Used by task mutations to decide whether to auto-sync.
 */
export function isSyncEnabled(): boolean {
  return SecureStore.getItem(SYNCED_ENABLED_KEY) === 'true';
}
