import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import type { Task } from '@/types/database';

const CALENDAR_ID_KEY = 'semora_calendar_id';
const SYNCED_ENABLED_KEY = 'semora_cal_enabled';
// taskId → calendar event id, JSON-encoded. Title-based dedup broke
// when a task got renamed or duplicated; a stable map is what we want.
const EVENT_MAP_KEY = 'semora_event_map';

function readEventMap(): Record<string, string> {
  if (Platform.OS === 'web') return {};
  try {
    const raw = SecureStore.getItem(EVENT_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeEventMap(map: Record<string, string>) {
  if (Platform.OS === 'web') return;
  try { SecureStore.setItem(EVENT_MAP_KEY, JSON.stringify(map)); } catch {}
}

function setEventId(taskId: string, eventId: string) {
  const map = readEventMap();
  map[taskId] = eventId;
  writeEventMap(map);
}

function clearEventId(taskId: string) {
  const map = readEventMap();
  if (map[taskId]) {
    delete map[taskId];
    writeEventMap(map);
  }
}

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
      // Positive offset = minutes after start; 540 = 9:00 AM the day of.
      alarms: [{ relativeOffset: 540 }],
    };
  }

  // Use the stable task→event map. If we have a known event id, update
  // it; if the user manually deleted that event in Calendar.app the
  // update throws, so fall back to creating a fresh one.
  const existingEventId = readEventMap()[task.id];
  if (existingEventId) {
    try {
      await Calendar.updateEventAsync(existingEventId, eventDetails);
      return;
    } catch (e) {
      console.warn('[CalendarSync] Stored event missing, recreating:', e);
      clearEventId(task.id);
    }
  }

  const newId = await Calendar.createEventAsync(calendarId, eventDetails);
  setEventId(task.id, newId);
}

export async function removeTaskFromCalendar(taskId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const Calendar = await getCalendarModule();
  if (!Calendar) return;

  const eventId = readEventMap()[taskId];
  if (!eventId) return;

  try {
    await Calendar.deleteEventAsync(eventId);
  } catch (e) { console.warn('[CalendarSync] Failed to remove event:', e); }
  clearEventId(taskId);
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
  try { await SecureStore.deleteItemAsync(EVENT_MAP_KEY); } catch (e) { console.warn('[CalendarSync] Failed to clear event map:', e); }
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

/**
 * Clear local calendar-sync references on sign-out so the next user
 * to sign in on the same device does NOT inherit the previous user's
 * calendar mapping. Doesn't delete the calendar itself — that belongs
 * to the iOS account, not the Semora account.
 */
export async function clearLocalSyncState(): Promise<void> {
  try { await SecureStore.deleteItemAsync(CALENDAR_ID_KEY); } catch {}
  try { await SecureStore.deleteItemAsync(SYNCED_ENABLED_KEY); } catch {}
  try { await SecureStore.deleteItemAsync(EVENT_MAP_KEY); } catch {}
}
