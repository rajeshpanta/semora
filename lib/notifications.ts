import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { differenceInDays } from 'date-fns';
import { useAppStore } from '@/store/appStore';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

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

  // Get user preferences and pro status
  let preferences = { reminder_same_day: true, reminder_1day: true, reminder_3day: true };
  if (userId) {
    const { data } = await supabase
      .from('profiles')
      .select('reminder_same_day, reminder_1day, reminder_3day')
      .eq('id', userId)
      .single();
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
