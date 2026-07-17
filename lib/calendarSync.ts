import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/appStore';
import type { CourseMeeting, Task } from '@/types/database';

const CALENDAR_ID_KEY = 'semora_calendar_id';
const SYNCED_ENABLED_KEY = 'semora_cal_enabled';
// taskId → calendar event id, JSON-encoded. Title-based dedup broke
// when a task got renamed or duplicated; a stable map is what we want.
const EVENT_MAP_KEY = 'semora_event_map';
// meetingId → array of calendar event ids (one weekly recurring event per
// meeting weekday — see applyMeetingEvents). Separate key from the task map
// so the two lifecycles stay independent: class-schedule sync can be toggled
// off (removing only meeting events) without touching task events.
const MEETING_MAP_KEY = 'semora_meeting_event_map';
const MEETING_SYNC_ENABLED_KEY = 'semora_meeting_sync_enabled';

// The color we create the Semora calendar with. Also used as an attribution
// signal when deciding whether an existing "Semora"-titled calendar is ours
// (see getOrCreateCalendarInner).
const SEMORA_CALENDAR_COLOR = '#6B46C1';

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

// Meeting map: meetingId → event ids. Same SecureStore pattern as the task
// map; values are arrays because one meeting row (days [Mon, Wed]) becomes
// one recurring series per weekday.
function readMeetingMap(): Record<string, string[]> {
  if (Platform.OS === 'web') return {};
  try {
    const raw = SecureStore.getItem(MEETING_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMeetingMap(map: Record<string, string[]>) {
  if (Platform.OS === 'web') return;
  try { SecureStore.setItem(MEETING_MAP_KEY, JSON.stringify(map)); } catch {}
}

// Synchronous read-modify-write of ONE meeting's entry. The meeting sync
// paths must never hold a copy of the whole map across an `await` and write
// it back later: course save fires several meeting mutations in parallel
// (Promise.allSettled in app/course/[id].tsx), and interleaved stale writes
// would silently drop other meetings' entries, orphaning their events.
// Point-writes like this (and setEventId on the task side) can't interleave
// because JS runs the whole function between awaits atomically.
function setMeetingEventIds(meetingId: string, ids: string[]) {
  const map = readMeetingMap();
  if (ids.length > 0) map[meetingId] = ids;
  else delete map[meetingId];
  writeMeetingMap(map);
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

// Single-flight: concurrent callers (bulk import syncing several tasks at
// once) share one create/adopt pass instead of racing to create duplicates.
let calendarInFlight: Promise<string | null> | null = null;

async function getOrCreateCalendar(): Promise<string | null> {
  if (calendarInFlight) return calendarInFlight;
  calendarInFlight = getOrCreateCalendarInner().finally(() => { calendarInFlight = null; });
  return calendarInFlight;
}

// EventKit round-trips (and iCloud sync) can change hex case or append an
// alpha channel, so compare the RGB portion loosely.
function isSemoraColor(color: string | null | undefined): boolean {
  if (!color) return false;
  return color.replace('#', '').toLowerCase().startsWith('6b46c1');
}

async function getOrCreateCalendarInner(): Promise<string | null> {
  const Calendar = await getCalendarModule();
  if (!Calendar) return null;

  const stored = SecureStore.getItem(CALENDAR_ID_KEY);

  // One calendar fetch serves both checks below.
  let calendars: Awaited<ReturnType<typeof Calendar.getCalendarsAsync>> = [];
  try {
    calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  } catch (e) { console.warn('[CalendarSync] Failed to list calendars:', e); }

  // Verify stored calendar still exists
  if (stored && calendars.some((c) => c.id === stored)) return stored;

  // Sign-out clears CALENDAR_ID_KEY but deliberately leaves the device
  // calendar alone — so re-enabling sync used to create a SECOND
  // "Semora" calendar every time. ADOPT the existing Semora calendar
  // instead of deleting it: with iCloud calendars, deletion would
  // propagate to the user's OTHER devices and destroy data they still
  // see there.
  //
  // But adopting alone leaves the calendar holding events our (empty) local
  // maps know nothing about — either live events another signed-in device is
  // maintaining, or leftovers from a prior session on this one. Reconcile on
  // adopt (non-destructively — see reconcileAdoptedCalendar) so subsequent
  // syncs update those events in place instead of stacking duplicates.
  //
  // Which calendars may we adopt? ONLY ones we can reasonably attribute to
  // Semora, because the two failure modes are wildly asymmetric:
  //   - false POSITIVE (adopting a calendar the USER created that merely
  //     happens to be titled "Semora") means we start writing app events into
  //     — and, when sync is turned off, DELETING — a calendar holding their
  //     personal data.
  //   - false NEGATIVE just creates a second "Semora" calendar: cosmetic
  //     clutter the user can remove.
  // Attribution signals, strongest first:
  //   1. Internal `name === 'semora'` — we set it at creation and iOS never
  //      sets an internal name like that for user-created calendars. It can
  //      come back null after an iCloud round-trip though, so it can't be
  //      the only signal.
  //   2. Exact Semora brand color — we create the calendar with #6B46C1 and
  //      EventKit preserves calendar color across devices. A user-created
  //      "Semora" calendar would additionally have to be hand-set to our
  //      exact purple to slip through, which we accept.
  // A title-only match (the old fallback) is deliberately NOT enough
  // anymore: it's exactly the case that adopts a user's own calendar.
  const existing =
    calendars.find((c) => c.title === 'Semora' && c.name === 'semora' && c.allowsModifications)
    ?? calendars.find((c) => c.title === 'Semora' && isSemoraColor(c.color) && c.allowsModifications);
  if (existing) {
    SecureStore.setItem(CALENDAR_ID_KEY, existing.id);
    await reconcileAdoptedCalendar(Calendar, existing.id);
    return existing.id;
  }

  const defaultSource =
    Platform.OS === 'ios'
      ? await getDefaultCalendarSource(Calendar)
      : { isLocalAccount: true, name: 'Semora', type: 'LOCAL' as any };

  const id = await Calendar.createCalendarAsync({
    title: 'Semora',
    color: SEMORA_CALENDAR_COLOR,
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

// ── Adoption reconcile ─────────────────────────────────────
//
// When we adopt a pre-existing Semora calendar, our local SecureStore maps
// may know nothing about the events it already holds. Two very different
// situations produce that state:
//   a) SECOND DEVICE: the calendar is iCloud-synced and another device
//      already populated it. Those events are LIVE — the other device still
//      tracks them in its own local map.
//   b) SAME DEVICE after sign-out / reinstall: the events belong to a prior
//      session (possibly a prior user) and no device tracks them anymore.
//
// The old implementation deleted every event the local map didn't track.
// That was correct-ish for (b) but catastrophic for (a): enabling sync on a
// second device WIPED the first device's events out of the shared iCloud
// calendar — and then device A's now-stale map recreated its events on the
// next sync, stacking duplicates. The two cases are indistinguishable from
// here, so the reconcile is now strictly NON-DESTRUCTIVE:
//
//   - We NEVER delete an event the local map doesn't track. Deletion stays
//     reserved for explicitly tracked events (removeTaskFromCalendar /
//     removeMeetingFromCalendar / the syncAll* prunes, all map-driven).
//   - Instead we REBUILD the maps: enumerate the adopted calendar over a
//     wide window and match its events back to the current user's live
//     tasks/meetings. The sync code controls both title and start date at
//     creation, so an exact title + same-day match re-identifies our own
//     events reliably. Matched events are adopted into the maps, after which
//     the normal sync paths update them IN PLACE (fixing any staleness)
//     instead of creating duplicates.
//   - Unmatched events are left alone. Worst case is a leftover from case
//     (b) that the user deletes by hand — strictly better than destroying
//     another device's data in case (a).
//
// On a normal launch a valid stored CALENDAR_ID_KEY short-circuits before
// adopt, so none of this runs.
async function reconcileAdoptedCalendar(Calendar: any, calendarId: string): Promise<void> {
  try {
    // Wide window around "now" — academic tasks never fall outside it, and
    // getEventsAsync requires an explicit range.
    const now = new Date();
    const start = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear() + 3, now.getMonth(), now.getDate());
    const events = await Calendar.getEventsAsync([calendarId], start, end);

    // getEventsAsync expands recurring series into per-occurrence entries
    // that share the master event id — dedupe so each series is one entry.
    const seen = new Set<string>();
    const unique: any[] = [];
    for (const ev of events) {
      if (!seen.has(ev.id)) {
        seen.add(ev.id);
        unique.push(ev);
      }
    }

    await adoptTaskEvents(unique);
    await adoptMeetingEvents(unique);
  } catch (e) {
    console.warn('[CalendarSync] Failed to reconcile adopted calendar:', e);
  }
}

/** Local YYYY-MM-DD candidates for an event's start. iOS returns startDate
 *  as an ISO string; ALL-DAY events in particular round-trip in ways that
 *  depend on the calendar's timezone (midnight local vs midnight UTC), so
 *  offer both the local-converted date and the raw ISO date portion and let
 *  the caller match either. A miss here is safe — the event is simply left
 *  unadopted (never deleted). */
function eventDateCandidates(ev: any): Set<string> {
  const out = new Set<string>();
  const raw = ev.startDate;
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}/.test(raw)) out.add(raw.slice(0, 10));
  const d = new Date(raw);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, '0');
    out.add(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  return out;
}

// Match untracked NON-recurring events to the user's incomplete tasks by
// exact title ("<task> — <course>", set by syncTaskToCalendar) + due date,
// and adopt matches into the task→event map.
async function adoptTaskEvents(events: any[]): Promise<void> {
  // All incomplete tasks across semesters (RLS scopes to the signed-in
  // user) — an adopted calendar can hold events from a semester other than
  // the currently selected one.
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title, due_date, courses!inner(name)')
    .eq('is_completed', false);
  if (error || !tasks || tasks.length === 0) return;

  const map = readEventMap();
  const mappedEventIds = new Set(Object.values(map));

  // Candidate pool grouped by title. Recurring events can only be class
  // meetings (task events never recur), and anything already claimed by the
  // local map keeps its existing owner.
  const byTitle = new Map<string, any[]>();
  for (const ev of events) {
    if (ev.recurrenceRule || mappedEventIds.has(ev.id)) continue;
    const list = byTitle.get(ev.title) ?? [];
    list.push(ev);
    byTitle.set(ev.title, list);
  }

  let changed = false;
  for (const task of tasks as any[]) {
    if (map[task.id]) continue; // this device already tracks it
    const candidates = byTitle.get(`${task.title} — ${task.courses.name}`);
    if (!candidates || candidates.length === 0) continue;
    const idx = candidates.findIndex((ev) => eventDateCandidates(ev).has(task.due_date));
    if (idx === -1) continue;
    // splice: each event can be claimed by at most one task (duplicate
    // titles on the same day claim distinct events).
    const [ev] = candidates.splice(idx, 1);
    map[task.id] = ev.id;
    changed = true;
  }
  if (changed) writeEventMap(map);
}

// Match untracked RECURRING events to the user's course meetings by exact
// title (see meetingEventTitle) + start weekday, and adopt matches into the
// meeting→events map. Weekday (not date) is the discriminator because we
// create one weekly series per meeting weekday.
async function adoptMeetingEvents(events: any[]): Promise<void> {
  const { data: meetings, error } = await supabase
    .from('course_meetings')
    .select('id, days_of_week, start_time, kind, courses!inner(name)');
  if (error || !meetings || meetings.length === 0) return;

  const map = readMeetingMap();
  const mappedEventIds = new Set(Object.values(map).flat());

  const byTitle = new Map<string, any[]>();
  for (const ev of events) {
    if (!ev.recurrenceRule || mappedEventIds.has(ev.id)) continue;
    const list = byTitle.get(ev.title) ?? [];
    list.push(ev);
    byTitle.set(ev.title, list);
  }

  let changed = false;
  for (const meeting of meetings as any[]) {
    // Meetings without a start time are never synced (see applyMeetingEvents).
    if (!meeting.start_time) continue;
    const candidates = byTitle.get(meetingEventTitle(meeting.courses.name, meeting.kind));
    if (!candidates || candidates.length === 0) continue;
    const wanted = new Set<number>(meeting.days_of_week ?? []);
    const claimed = new Set<string>(map[meeting.id] ?? []);
    for (let i = candidates.length - 1; i >= 0; i--) {
      const d = new Date(candidates[i].startDate);
      if (isNaN(d.getTime()) || !wanted.has(d.getDay())) continue;
      // Claiming ALL weekday matches (even several on the same weekday) is
      // deliberate: duplicates left behind by the old destructive reconcile
      // get absorbed into the map here; the resync's idempotence check
      // (existingSeriesMatches) treats duplicate weekdays as a mismatch, so
      // its delete-and-recreate fallback heals them.
      claimed.add(candidates[i].id);
      candidates.splice(i, 1);
      changed = true;
    }
    if (claimed.size > 0) map[meeting.id] = [...claimed];
  }
  if (changed) writeMeetingMap(map);
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
    clearEventId(taskId);
  } catch (e: any) {
    // Only drop the mapping when the event is genuinely gone. A transient
    // failure (permission revoked, etc.) must keep the mapping so a retry
    // can still find the event — dropping it orphaned the event forever.
    if (/not found|does not exist|doesn'?t exist|no event/i.test(e?.message ?? '')) {
      clearEventId(taskId);
    } else {
      console.warn('[CalendarSync] Failed to remove event (mapping kept):', e);
    }
  }
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

  // A failed task query must not report success — the settings toggle
  // would show "Synced!" while nothing happened and the flag stayed unset.
  if (error) {
    throw new Error('Could not load your tasks — check your connection and try again.');
  }
  if (!tasks) return 0;

  let count = 0;
  for (const task of tasks) {
    const course = (task as any).courses;
    try {
      await syncTaskToCalendar(task as Task, course.name);
      count++;
    } catch (e) { console.warn('[CalendarSync] Failed to sync task:', e); }
  }

  // Every single event failed (permission revoked, calendar unavailable):
  // reporting success and flipping the enabled flag would show a working
  // toggle over a dead sync. Surface it instead.
  if (tasks.length > 0 && count === 0) {
    throw new Error('Could not add events to your calendar. Check Semora\'s calendar permission in iOS Settings and try again.');
  }

  // Prune events for tasks no longer in this semester's incomplete set
  // (semester switch, completed/deleted elsewhere) so the device calendar
  // mirrors the active semester instead of accumulating stale events.
  const liveIds = new Set(tasks.map((t: any) => t.id));
  for (const taskId of Object.keys(readEventMap())) {
    if (!liveIds.has(taskId)) {
      try { await removeTaskFromCalendar(taskId); } catch {}
    }
  }

  // Mark sync as enabled
  SecureStore.setItem(SYNCED_ENABLED_KEY, 'true');

  return count;
}

// ── Class-schedule (course meeting) sync ───────────────────

/** Display title for a class-schedule event. Lecture (the default kind) and
 *  "other" are just the course name — "CS 101 — Lecture" repeated on every
 *  MWF grid cell reads as noise; labs and discussions get a suffix so a
 *  course's second meeting block is distinguishable (wording mirrors the
 *  Today tab's KIND_LABEL). Deterministic on purpose: multi-device adoption
 *  (adoptMeetingEvents) and the .ics export re-derive this exact string. */
export function meetingEventTitle(courseName: string, kind: string): string {
  if (kind === 'lab') return `${courseName} — Lab`;
  if (kind === 'discussion') return `${courseName} — Discussion`;
  return courseName;
}

/** Recurrence bound for class-schedule events. `semesters.end_date` is
 *  nullable; when missing, bound the series to ~16 weeks out (a typical
 *  semester length) instead of repeating forever. End-of-day so classes ON
 *  the end date are still included. */
export function semesterEndOrDefault(endDate: string | null | undefined): Date {
  if (endDate) {
    const [y, m, d] = endDate.split('-').map(Number);
    return new Date(y, m - 1, d, 23, 59, 59);
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 7 * 16);
  fallback.setHours(23, 59, 59, 0);
  return fallback;
}

/** Parse "HH:MM[:SS]" into [hour, minute]. Shared by event creation
 *  (withTime) and the idempotence comparison (existingSeriesMatches) — the
 *  two MUST agree on parsing, or the comparison would false-negative against
 *  events this very file created and churn them. */
function parseClock(time: string): [number, number] {
  const [h = 0, m = 0] = time.split(':').map((s) => parseInt(s, 10) || 0);
  return [h, m];
}

/** `day` at `time` ("HH:MM[:SS]") as a local Date. */
function withTime(day: Date, time: string): Date {
  const [h, m] = parseClock(time);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}

/** First date on/after `from` that falls on `weekday` (JS getDay()), at
 *  `startTime`. Series start from "today", not the semester start — filling
 *  months of already-past classes into the calendar helps no one. */
function firstOccurrence(weekday: number, startTime: string, from: Date): Date {
  const d = withTime(from, startTime);
  d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
  return d;
}

// EventKit round-trips an unset location as null or '' depending on OS
// version, and we create meeting events with `location || undefined` —
// normalize both sides so "no location" never reads as an edit and churns
// the series.
function normalizedLocation(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Do the calendar events the meeting map already tracks exactly realize the
 * desired series parameters? Compares ONLY what we control at creation —
 * title, weekday, wall-clock start/end, location, weekly recurrence bound —
 * never alarms or other fields the user may have customized in Calendar.app.
 * Any read failure, missing event, or ambiguity reports a mismatch so the
 * caller falls back to delete-and-recreate (never worse than the old
 * always-recreate behavior).
 */
async function existingSeriesMatches(
  Calendar: any,
  eventIds: string[],
  meeting: Pick<CourseMeeting, 'days_of_week' | 'start_time' | 'end_time' | 'location'>,
  title: string,
  desiredWeekdays: Set<number>,
  semesterEndDay: string | null,
): Promise<boolean> {
  if (!meeting.start_time) return false;
  const [startHour, startMinute] = parseClock(meeting.start_time);
  const allowedWeekdays = new Set<number>(meeting.days_of_week ?? []);
  const covered = new Set<number>();

  for (const eventId of eventIds) {
    let ev: any;
    try {
      ev = await Calendar.getEventAsync(eventId);
    } catch {
      return false; // deleted by hand / calendar unavailable — recreate heals it
    }
    if (!ev || ev.allDay || ev.title !== title) return false;

    const start = new Date(ev.startDate);
    if (isNaN(start.getTime())) return false;

    // Weekday, not date: each device starts a series from ITS sync-day's
    // first occurrence, so start DATES legitimately differ across devices —
    // exact-date comparison would churn shared series. Duplicate weekdays
    // are a mismatch on purpose: that's how leftovers absorbed by
    // adoptMeetingEvents get healed by the recreate pass.
    const weekday = start.getDay();
    if (!allowedWeekdays.has(weekday) || covered.has(weekday)) return false;
    covered.add(weekday);

    // Wall-clock comparison, same policy as creation (which builds local
    // Dates): minute granularity so sub-minute EventKit round-trip jitter
    // can't read as an edit.
    if (start.getHours() !== startHour || start.getMinutes() !== startMinute) return false;

    const end = new Date(ev.endDate);
    if (isNaN(end.getTime())) return false;
    if (meeting.end_time) {
      // Same derivation as creation: end_time on the START's calendar day.
      const expectedEnd = withTime(start, meeting.end_time);
      if (
        end.getFullYear() !== expectedEnd.getFullYear() ||
        end.getMonth() !== expectedEnd.getMonth() ||
        end.getDate() !== expectedEnd.getDate() ||
        end.getHours() !== expectedEnd.getHours() ||
        end.getMinutes() !== expectedEnd.getMinutes()
      ) return false;
    } else if (end.getTime() - start.getTime() !== 60 * 60 * 1000) {
      return false; // creation's "no end time — assume ~1h block" default
    }

    if (normalizedLocation(ev.location) !== normalizedLocation(meeting.location)) return false;

    const rule = ev.recurrenceRule;
    if (!rule || String(rule.frequency).toLowerCase() !== 'weekly') return false;
    if ((rule.interval ?? 1) !== 1) return false;
    if (!rule.endDate) return false; // we always bound the series
    if (semesterEndDay) {
      // Real semester end: we create the bound at LOCAL 23:59:59 on
      // end_date, so the raw ISO round-trip can land on the neighboring UTC
      // day. eventDateCandidates encodes exactly this local-vs-raw ambiguity
      // for event starts — reuse it (it only reads .startDate).
      if (!eventDateCandidates({ startDate: rule.endDate }).has(semesterEndDay)) return false;
    } else {
      // No semesters.end_date: semesterEnd is the moving "~16 weeks from
      // now" fallback, so an exact comparison would mismatch on EVERY sync
      // and reintroduce the cross-device churn this check exists to prevent.
      // Any still-in-the-future bound serves the fallback's purpose (don't
      // repeat forever); an already-expired bound means the series went dark
      // on the calendar — recreate to extend it.
      const ruleEnd = new Date(rule.endDate);
      if (isNaN(ruleEnd.getTime()) || ruleEnd.getTime() < Date.now()) return false;
    }
  }

  // Every weekday the create pass would produce must already exist. covered
  // may be a strict SUPERSET of desired: near semester end a weekday drops
  // out of the desired set once its next occurrence falls past the bound,
  // but the existing series self-terminates at that same bound — recreating
  // over that would churn shared-calendar maps for zero visible change.
  for (const weekday of desiredWeekdays) {
    if (!covered.has(weekday)) return false;
  }
  return true;
}

/**
 * Sync the device-calendar events for one meeting row, IDEMPOTENTLY. When
 * the events the map already tracks exactly realize the desired series
 * (existingSeriesMatches), keep them and the map entry — no delete, no
 * create. This is what makes multi-device sync converge: with an
 * iCloud-shared Semora calendar, device B adopts device A's series into its
 * own map (adoptMeetingEvents); if B then blindly replaced them, A's map
 * would point at deleted events and A's next sync would recreate its own
 * copies — duplicates ping-ponging between devices forever. With the match
 * check, B's post-adoption sync is a no-op and both maps keep pointing at
 * the same shared series.
 *
 * Only when the meeting genuinely changed (days/time/location edited,
 * semester end moved) do we fall back to delete-and-recreate of THAT
 * meeting's events: recurring series are cheap to recreate, and the
 * delete+create pair sidesteps per-weekday reconciliation when the user
 * changes days (Mon/Wed → Tue).
 *
 * Returns true when at least one event now exists for the meeting.
 */
async function applyMeetingEvents(
  Calendar: any,
  calendarId: string,
  meeting: Pick<CourseMeeting, 'id' | 'days_of_week' | 'start_time' | 'end_time' | 'location' | 'kind'>,
  courseName: string,
  semesterEnd: Date,
  // Raw semesters.end_date (YYYY-MM-DD) when the semester has one, else null
  // (semesterEnd is then the moving ~16-week fallback — the recurrence-bound
  // comparison in existingSeriesMatches needs to know which it is).
  semesterEndDay: string | null,
): Promise<boolean> {
  const title = meetingEventTitle(courseName, meeting.kind);

  // The series the create pass below would produce, computed ONCE so the
  // idempotence check and the create loop can never disagree (e.g. across a
  // midnight boundary). Meetings without a start time have no clock position
  // — nothing to place on the calendar — and weekdays whose first future
  // occurrence already falls past semester end are skipped.
  const desired: { startDate: Date; endDate: Date }[] = [];
  const desiredWeekdays = new Set<number>();
  if (meeting.start_time) {
    for (const weekday of meeting.days_of_week ?? []) {
      const startDate = firstOccurrence(weekday, meeting.start_time, new Date());
      if (startDate > semesterEnd) continue; // this weekday never occurs again before semester end
      const endDate = meeting.end_time
        ? withTime(startDate, meeting.end_time)
        : new Date(startDate.getTime() + 60 * 60 * 1000); // no end time — assume the common ~1h block
      desired.push({ startDate, endDate });
      desiredWeekdays.add(weekday);
    }
  }

  const previous = readMeetingMap()[meeting.id] ?? [];

  // Idempotence gate: if the tracked events already match, this sync is a
  // no-op and the map keeps pointing at the SAME (possibly iCloud-shared)
  // series other devices track too.
  if (
    previous.length > 0 &&
    meeting.start_time &&
    (await existingSeriesMatches(Calendar, previous, meeting, title, desiredWeekdays, semesterEndDay))
  ) {
    return true;
  }

  // Drop the meeting's previous series (only ids WE track — never other
  // events). futureEvents:true targets the whole series via the master id.
  // (This still runs for a meeting edited from "timed" to "days only", so
  // its old events get cleaned up.)
  for (const eventId of previous) {
    try { await Calendar.deleteEventAsync(eventId, { futureEvents: true }); } catch {}
  }
  setMeetingEventIds(meeting.id, []);

  const ids: string[] = [];
  if (meeting.start_time) {
    for (const { startDate, endDate } of desired) {
      try {
        const id = await Calendar.createEventAsync(calendarId, {
          title,
          startDate,
          endDate,
          allDay: false,
          location: meeting.location || undefined,
          // One weekly series per weekday instead of a single multi-day
          // rule: expo-calendar's daysOfTheWeek is iOS-only and EventKit's
          // update semantics for multi-day series are murky, while N
          // independent weekly events are portable and trivially replaceable.
          recurrenceRule: {
            frequency: Calendar.Frequency.WEEKLY,
            interval: 1,
            endDate: semesterEnd,
          },
          // No alarms: an alert before every single class is noise. Deadline
          // alarms stay on task events.
        });
        ids.push(id);
      } catch (e) { console.warn('[CalendarSync] Failed to create meeting event:', e); }
    }
  }

  setMeetingEventIds(meeting.id, ids);
  return ids.length > 0;
}

/**
 * Sync one meeting row to the device calendar. Used by the meeting mutations
 * (create/update) in lib/queries.ts as a fire-and-forget side effect —
 * mirrors syncTaskToCalendar. Resolves the course name (event title) and the
 * parent semester's end date (recurrence bound) itself so callers only need
 * the row they already have.
 */
export async function syncMeetingToCalendar(meeting: CourseMeeting): Promise<void> {
  if (Platform.OS === 'web') return;
  const Calendar = await getCalendarModule();
  if (!Calendar) return;

  const calendarId = await getOrCreateCalendar();
  if (!calendarId) return;

  const { data: course, error } = await supabase
    .from('courses')
    .select('name, semesters(end_date)')
    .eq('id', meeting.course_id)
    .single();
  if (error || !course) return;

  const semesterEndDay: string | null = (course as any).semesters?.end_date ?? null;
  const semesterEnd = semesterEndOrDefault(semesterEndDay);
  await applyMeetingEvents(Calendar, calendarId, meeting, (course as any).name, semesterEnd, semesterEndDay);
}

/**
 * Remove all device-calendar events for one meeting row. Same
 * keep-mapping-on-transient-failure rule as removeTaskFromCalendar.
 */
export async function removeMeetingFromCalendar(meetingId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const Calendar = await getCalendarModule();
  if (!Calendar) return;

  const ids = readMeetingMap()[meetingId];
  if (!ids || ids.length === 0) return;

  const failed: string[] = [];
  for (const eventId of ids) {
    try {
      await Calendar.deleteEventAsync(eventId, { futureEvents: true });
    } catch (e: any) {
      if (!/not found|does not exist|doesn'?t exist|no event/i.test(e?.message ?? '')) {
        failed.push(eventId);
        console.warn('[CalendarSync] Failed to remove meeting event (mapping kept):', e);
      }
    }
  }
  // Keep only the ids that transiently failed so a retry can still find
  // them; a point-write (not a stale whole-map write) — see setMeetingEventIds.
  setMeetingEventIds(meetingId, failed);
}

/**
 * Full class-schedule sync: push every meeting of the semester's courses to
 * the device calendar as weekly recurring events, prune events for meetings
 * that no longer exist, and mark class-schedule sync enabled. Returns the
 * number of meetings synced. Mirrors syncAllTasks' error contract so the
 * settings toggle can surface real failures.
 */
export async function syncAllMeetings(semesterId: string | null): Promise<number> {
  if (Platform.OS === 'web' || !semesterId) return 0;

  const Calendar = await getCalendarModule();
  if (!Calendar) return 0;

  const calendarId = await getOrCreateCalendar();
  if (!calendarId) {
    throw new Error('Could not access your calendar. Check Semora\'s calendar permission in iOS Settings and try again.');
  }

  const [semRes, meetRes] = await Promise.all([
    supabase.from('semesters').select('end_date').eq('id', semesterId).single(),
    supabase
      .from('course_meetings')
      .select('*, courses!inner(name, semester_id)')
      .eq('courses.semester_id', semesterId),
  ]);
  if (semRes.error || meetRes.error) {
    throw new Error('Could not load your class schedule — check your connection and try again.');
  }
  const meetings = meetRes.data ?? [];
  const semesterEndDay: string | null = semRes.data?.end_date ?? null;
  const semesterEnd = semesterEndOrDefault(semesterEndDay);
  // A semester whose end date is already behind us produces zero events by
  // construction (series start from today) — that's emptiness, not failure.
  const semesterOver = semesterEnd.getTime() < Date.now();

  let count = 0;
  let attempted = 0; // meetings that COULD produce events (have a start time)
  for (const meeting of meetings) {
    try {
      const created = await applyMeetingEvents(
        Calendar,
        calendarId,
        meeting as CourseMeeting,
        (meeting as any).courses.name,
        semesterEnd,
        semesterEndDay,
      );
      if (meeting.start_time) {
        attempted++;
        if (created) count++;
      }
    } catch (e) { console.warn('[CalendarSync] Failed to sync meeting:', e); }
  }

  // Every single event failed (permission revoked, calendar unavailable):
  // same honesty contract as syncAllTasks — don't show a working toggle
  // over a dead sync.
  if (!semesterOver && attempted > 0 && count === 0) {
    throw new Error('Could not add class events to your calendar. Check Semora\'s calendar permission in iOS Settings and try again.');
  }

  // Prune events for meetings that no longer exist in this semester (course
  // deleted, meeting removed elsewhere) — mirrors syncAllTasks' prune. Only
  // ever touches events the local map explicitly tracks.
  const liveIds = new Set(meetings.map((m: any) => m.id));
  for (const meetingId of Object.keys(readMeetingMap())) {
    if (!liveIds.has(meetingId)) {
      try { await removeMeetingFromCalendar(meetingId); } catch {}
    }
  }

  // Mark class-schedule sync as enabled even when the semester simply has no
  // meetings yet — future meeting edits then auto-sync (same contract as
  // task sync).
  SecureStore.setItem(MEETING_SYNC_ENABLED_KEY, 'true');

  return count;
}

/**
 * Remove ONLY the class-schedule events (the ones the meeting map tracks)
 * and turn class-schedule sync off. Task events stay untouched.
 */
export async function unsyncAllMeetings(): Promise<void> {
  if (Platform.OS === 'web') return;
  const Calendar = await getCalendarModule();
  if (Calendar) {
    for (const meetingId of Object.keys(readMeetingMap())) {
      try { await removeMeetingFromCalendar(meetingId); } catch {}
    }
  }
  // Clear flag + map even if some deletes failed — the user asked for it
  // off; any stragglers die with the calendar when main sync is removed.
  try { await SecureStore.deleteItemAsync(MEETING_MAP_KEY); } catch {}
  try { await SecureStore.deleteItemAsync(MEETING_SYNC_ENABLED_KEY); } catch {}
}

/**
 * Quick sync check for meeting mutations (create/update side effects).
 * Class-schedule sync piggybacks on the main sync — its toggle is only
 * reachable while the main sync is on — and is equally Pro-gated (same
 * lapsed-subscriber reasoning as isSyncEnabled).
 */
export function isMeetingSyncEnabled(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return (
      SecureStore.getItem(MEETING_SYNC_ENABLED_KEY) === 'true' &&
      SecureStore.getItem(SYNCED_ENABLED_KEY) === 'true' &&
      useAppStore.getState().isPro
    );
  } catch {
    return false;
  }
}

/**
 * Whether class-schedule TRACKING is on, independent of Pro — removals must
 * keep working after a subscription lapses (see isSyncTrackingActive). Also
 * what the settings screen reads to render the toggle state.
 */
export function isMeetingSyncTrackingActive(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return SecureStore.getItem(MEETING_SYNC_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
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
  // Meeting events died with the calendar above; clear their local state too
  // so a later re-enable starts from a clean slate.
  try { await SecureStore.deleteItemAsync(MEETING_MAP_KEY); } catch (e) { console.warn('[CalendarSync] Failed to clear meeting map:', e); }
  try { await SecureStore.deleteItemAsync(MEETING_SYNC_ENABLED_KEY); } catch (e) { console.warn('[CalendarSync] Failed to clear meeting sync flag:', e); }
}

/**
 * Check if calendar sync is currently active.
 */
export async function isSynced(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
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
  if (Platform.OS === 'web') return false;
  try {
    // Gate ongoing auto-sync on BOTH the user's choice AND an active Pro sub.
    // Calendar sync is Pro-only, but it was previously gated only at ENABLE time
    // (settings/calendar.tsx) — so a monthly subscriber who turned it on, then
    // cancelled, kept auto-syncing every new/edited task for the whole semester.
    // Checking isPro here stops a lapsed user immediately, and resumes
    // automatically if they re-subscribe (the enabled flag persists).
    return SecureStore.getItem(SYNCED_ENABLED_KEY) === 'true' && useAppStore.getState().isPro;
  } catch {
    return false;
  }
}

/**
 * Whether calendar-sync TRACKING is on, independent of Pro. Cleanup — removing
 * events for completed/deleted tasks — must keep working even after a Pro
 * subscription lapses, otherwise a cancelled subscriber's iPhone calendar
 * accumulates orphaned Semora events forever. Creating NEW events stays gated
 * on isSyncEnabled() (Pro), since adding to the calendar is the paid feature;
 * removing stale events is just hygiene.
 */
export function isSyncTrackingActive(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return SecureStore.getItem(SYNCED_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
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
  try { await SecureStore.deleteItemAsync(MEETING_MAP_KEY); } catch {}
  try { await SecureStore.deleteItemAsync(MEETING_SYNC_ENABLED_KEY); } catch {}
}
