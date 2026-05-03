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
  dueDate: string,
  dueTime?: string | null,
  userId?: string,
) {
  if (Platform.OS === 'web') return;

  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  // Get user preferences and pro status. Use maybeSingle so a brand-new
  // OAuth user whose profile row hasn't propagated yet falls cleanly to
  // defaults rather than throwing.
  let preferences = { reminder_same_day: true, reminder_1day: true, reminder_3day: true };
  if (userId) {
    const { data } = await supabase
      .from('profiles')
      .select('reminder_same_day, reminder_1day, reminder_3day')
      .eq('id', userId)
      .maybeSingle();
    if (data) preferences = data;
  }

  // Free users only get same-day reminders
  const isPro = useAppStore.getState().isPro;
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
        data: { taskId },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
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
