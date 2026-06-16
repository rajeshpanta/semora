import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { differenceInDays } from 'date-fns';
import { useAppStore } from '@/store/appStore';

// iOS silently drops new notifications once a single app has 64 pending.
// Stay a few under to leave headroom for re-schedules that race with prune.
const MAX_SCHEDULED_NOTIFICATIONS = 60;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getTriggerTime(notif: Notifications.NotificationRequest): number {
  // Authoritative source: we stamp the fire time into data at schedule
  // time. The native trigger read back by getAllScheduledNotificationsAsync
  // is shape-unstable across platforms/SDKs (iOS returns dateComponents,
  // not timestamp/date/value), which made every notification score
  // Infinity and the "drop furthest-out" prune evict arbitrary reminders.
  const fireAt = (notif.content.data as any)?.fireAt;
  if (typeof fireAt === 'number' && Number.isFinite(fireAt)) return fireAt;

  const trig: any = notif.trigger;
  if (!trig) return Number.POSITIVE_INFINITY;
  if (typeof trig.timestamp === 'number') return trig.timestamp;
  if (trig.date) {
    const t = trig.date instanceof Date ? trig.date.getTime() : new Date(trig.date).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (trig.value) {
    const t = new Date(trig.value).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return Number.POSITIVE_INFINITY;
}

/**
 * If we're at/over the iOS 64-pending cap, drop the furthest-out reminders.
 * Same-day reminders matter most; 3-day-ahead reminders for tasks weeks
 * out are the cheapest to lose.
 */
async function pruneToCapIfNeeded() {
  if (Platform.OS === 'web') return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    if (scheduled.length <= MAX_SCHEDULED_NOTIFICATIONS) return;

    const sorted = [...scheduled].sort((a, b) => getTriggerTime(b) - getTriggerTime(a));
    const overflow = scheduled.length - MAX_SCHEDULED_NOTIFICATIONS;
    for (let i = 0; i < overflow; i++) {
      await Notifications.cancelScheduledNotificationAsync(sorted[i].identifier);
    }
  } catch {}
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

function getDueLabel(daysUntilDue: number): string {
  if (daysUntilDue === 0) return 'due today';
  if (daysUntilDue === 1) return 'due tomorrow';
  if (daysUntilDue > 1) return `due in ${daysUntilDue} days`;
  if (daysUntilDue === -1) return 'overdue by 1 day';
  return `overdue by ${Math.abs(daysUntilDue)} days`;
}

export async function scheduleTaskReminders(
  taskId: string,
  taskTitle: string,
  courseName: string,
  dueDate: string | null | undefined,
  dueTime?: string | null,
  userId?: string,
  // Batch path (rescheduleAllTaskReminders) passes prefs + isPro fetched ONCE
  // for the whole run, so we don't repeat an identical profiles read per task.
  prefetched?: { reminder_same_day: boolean; reminder_1day: boolean; reminder_3day: boolean; isPro: boolean },
) {
  if (Platform.OS === 'web') return;
  // Schema marks tasks.due_date NOT NULL, but a malformed row coming
  // from direct DB manipulation would crash split('-') below. Bail
  // quietly rather than throw out of the toggle-complete flow.
  if (!dueDate) return;

  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  // Get user preferences and pro status. Use maybeSingle so a brand-new
  // OAuth user whose profile row hasn't propagated yet falls cleanly to
  // defaults rather than throwing.
  let preferences = { reminder_same_day: true, reminder_1day: true, reminder_3day: true };
  let isPro: boolean;
  if (prefetched) {
    preferences = {
      reminder_same_day: prefetched.reminder_same_day,
      reminder_1day: prefetched.reminder_1day,
      reminder_3day: prefetched.reminder_3day,
    };
    isPro = prefetched.isPro;
  } else {
    if (userId) {
      const { data } = await supabase
        .from('profiles')
        .select('reminder_same_day, reminder_1day, reminder_3day')
        .eq('id', userId)
        .maybeSingle();
      if (data) preferences = data;
    }
    isPro = useAppStore.getState().isPro;
  }

  // Free users only get same-day reminders
  if (!isPro) {
    preferences.reminder_1day = false;
    preferences.reminder_3day = false;
  }

  const [year, month, day] = dueDate.split('-').map(Number);
  let hour = 9, minute = 0;
  if (dueTime) {
    const [h, m] = dueTime.split(':').map(Number);
    hour = h;
    minute = m;
  }

  const dueDateObj = new Date(year, month - 1, day);
  const now = new Date();

  const offsets = [
    { days: 0, enabled: preferences.reminder_same_day },
    { days: 1, enabled: preferences.reminder_1day },
    { days: 3, enabled: preferences.reminder_3day },
  ];

  for (const offset of offsets) {
    if (!offset.enabled) continue;

    const triggerDate = new Date(year, month - 1, day - offset.days, hour, minute, 0);

    // Don't schedule if in the past
    if (triggerDate <= now) continue;

    // Calculate actual days until due at notification time
    const daysUntilDue = differenceInDays(dueDateObj, new Date(year, month - 1, day - offset.days));
    const label = getDueLabel(daysUntilDue);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📚 ${courseName}`,
        body: `${taskTitle} is ${label}`,
        data: { taskId, fireAt: triggerDate.getTime() },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
  }

  // "Last call" — a second same-day nudge so a single alert isn't the only
  // line of defense (the most-requested reminder feature in this category:
  // "keep nudging me until it's done"). Free tier: it's same-day-scoped,
  // matching the free promise. cancelTaskReminders matches on data.taskId,
  // so these are cleaned up with the rest.
  //   - timed tasks:    2 hours before the deadline ("due in 2 hours")
  //   - end-of-day:     7 PM ("due tonight"), complementing the 9 AM one
  if (preferences.reminder_same_day) {
    const lastCall = dueTime
      ? new Date(year, month - 1, day, hour, minute - 120, 0)
      : new Date(year, month - 1, day, 19, 0, 0);
    const lastCallBody = dueTime
      ? `${taskTitle} is due in 2 hours`
      : `${taskTitle} is due tonight`;
    if (lastCall > now) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏰ ${courseName}`,
          body: lastCallBody,
          data: { taskId, fireAt: lastCall.getTime() },
          sound: true,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: lastCall,
        },
      });
    }
  }

  await pruneToCapIfNeeded();
}

export async function cancelTaskReminders(taskId: string) {
  if (Platform.OS === 'web') return;
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.taskId === taskId) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

/**
 * Re-schedule reminders for every incomplete task. Call this the moment Pro
 * is newly activated: scheduleTaskReminders reads isPro at schedule time, so
 * tasks created while free only ever got the same-day reminder. Without this,
 * the 1-/3-day advance reminders (a headline Pro feature) never appear for
 * existing tasks until each one is edited. Idempotent (cancel + reschedule).
 */
let rescheduleInFlight = false;
// Bumped on every sign-out (via cancelAllRemindersOnSignOut). An in-flight
// reschedule captures this at start and bails the moment it changes, so a
// sign-out that races the per-task loop can't re-create the signed-out user's
// reminders AFTER the cancel-all — which would leak A's task titles to user B
// on the same device.
let rescheduleGeneration = 0;

/**
 * Cancel all scheduled reminders on sign-out AND invalidate any in-flight
 * reschedule. Use this on EVERY sign-out path instead of calling
 * Notifications.cancelAllScheduledNotificationsAsync() directly, so a
 * concurrent rescheduleAllTaskReminders stops instead of re-creating the
 * signed-out user's reminders after the cancel.
 */
export async function cancelAllRemindersOnSignOut(): Promise<void> {
  // Bump first (synchronously, before any await) so an in-flight reschedule
  // sees the new generation even if the cancel below hasn't resolved yet.
  rescheduleGeneration += 1;
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // Best-effort.
  }
}

export async function rescheduleAllTaskReminders(userId: string): Promise<void> {
  // Guard against the dual purchase listeners (paywall + _layout) both firing
  // a full reschedule concurrently, which would double-schedule every task.
  if (Platform.OS === 'web' || !userId || rescheduleInFlight) return;
  // Set the flag BEFORE any await so a second concurrent call (the dual
  // purchase listeners fire together) sees it — the event loop can't
  // interleave before the first await.
  rescheduleInFlight = true;
  // Snapshot the generation. If a sign-out lands mid-loop it bumps this, and
  // we abort instead of re-creating the signed-out user's reminders.
  const gen = rescheduleGeneration;
  try {
    // Permission CHECK, not request — never pop the OS prompt during a
    // background Pro-activation reschedule.
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;
    // Read prefs + isPro ONCE for the whole batch — scheduleTaskReminders would
    // otherwise issue an identical per-task profiles read for every task.
    const { data: profile } = await supabase
      .from('profiles')
      .select('reminder_same_day, reminder_1day, reminder_3day')
      .eq('id', userId)
      .maybeSingle();
    const prefetched = {
      reminder_same_day: profile ? profile.reminder_same_day : true,
      reminder_1day: profile ? profile.reminder_1day : true,
      reminder_3day: profile ? profile.reminder_3day : true,
      isPro: useAppStore.getState().isPro,
    };
    const { data } = await supabase
      .from('tasks')
      .select('id, title, due_date, due_time, courses(name)')
      .eq('user_id', userId)
      .eq('is_completed', false);
    if (!data) return;
    for (const t of data as any[]) {
      // A sign-out fired cancelAllRemindersOnSignOut() during the loop — stop
      // now, or the remaining iterations would re-create this user's reminders
      // for whoever signs in next on this device.
      if (rescheduleGeneration !== gen) return;
      const courseName =
        (Array.isArray(t.courses) ? t.courses[0]?.name : t.courses?.name) || 'Course';
      await cancelTaskReminders(t.id);
      // Re-check after the await — the sign-out could have landed in between.
      if (rescheduleGeneration !== gen) return;
      await scheduleTaskReminders(t.id, t.title, courseName, t.due_date, t.due_time, userId, prefetched);
    }
  } catch {
    // Best-effort — a failed reschedule must never break the purchase flow.
  } finally {
    rescheduleInFlight = false;
  }
}
