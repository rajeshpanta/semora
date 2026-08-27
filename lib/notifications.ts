import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { differenceInDays } from 'date-fns';
import { useAppStore } from '@/store/appStore';
import { registerForPushNotificationsAsync } from '@/lib/push';
import * as SecureStore from 'expo-secure-store';
import { getAppLocale, translate, type AppLocale } from '@/lib/i18n';
import {
  groupRemindersByTask,
  planReminderReconciliation,
  type ScheduledLike,
} from '@/lib/reminderReconcile';
// Call-time only, on both sides: offlineSync imports rescheduleAllTaskReminders
// from here and calls it inside functions, and this module only ever reads the
// snapshot inside reconcileTaskReminders. Neither touches the other during
// module evaluation, so the cycle never resolves to undefined at init.
import { getOfflineSyncSnapshot } from '@/lib/offlineSync';

// iOS silently drops new notifications once a single app has 64 pending.
// Stay a few under to leave headroom for re-schedules that race with prune.
const MAX_SCHEDULED_NOTIFICATIONS = 60;
export const TASK_NOTIFICATION_CATEGORY = 'semora-task-reminder';
export const COMPLETE_TASK_ACTION = 'complete-task';
export const REVIEW_TASK_ACTION = 'review-task';
export const SNOOZE_TASK_ACTION = 'snooze-task';
const NOTIFICATION_HEALTH_KEY = 'semora.notification-health.v2';

/**
 * Android notification channels.
 *
 * Android 8+ takes importance, sound, vibration and the name the user sees in
 * Settings from the CHANNEL, not from the notification — and an app that never
 * creates one gets a single system-made fallback called "Miscellaneous" at
 * default importance. Two consequences we were shipping: a due-date reminder
 * could not post as a heads-up alert, and the only switch a student had was one
 * that silences everything Semora ever sends.
 *
 * A channel's settings are frozen at creation — re-creating with new values is
 * a no-op once the user has the app, and the user's own overrides always win.
 * So the split has to be right the first time, which is why there are exactly
 * two and not one per reminder offset: deadlines, which are the product, and
 * everything else.
 */
export const TASK_REMINDER_CHANNEL = 'task-reminders';
export const GENERAL_CHANNEL = 'general';

let channelsReady: Promise<void> | null = null;

/**
 * Idempotent and memoised, so the scheduling paths below can await it on every
 * call without paying for it more than once. After the first invocation this is
 * an already-resolved promise.
 */
export function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return Promise.resolve();
  if (!channelsReady) channelsReady = createAndroidChannels();
  return channelsReady;
}

async function createAndroidChannels(): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(TASK_REMINDER_CHANNEL, {
      name: translate('Task reminders'),
      description: translate('Due dates, exams, and same-day nudges.'),
      // HIGH, not MAX: heads-up when the screen is on, without the full-screen
      // intent MAX implies. A deadline is urgent, not an incoming call.
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6B46C1',
      // lightColor alone does nothing — the channel has to have lights turned
      // on for the colour to ever be used.
      enableLights: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      enableVibrate: true,
    });
    await Notifications.setNotificationChannelAsync(GENERAL_CHANNEL, {
      name: translate('Updates'),
      description: translate('Course space activity and occasional product news.'),
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  } catch {
    // A channel we could not create costs us the heads-up presentation, not
    // the notification: Android falls back to its own default channel.
  }
}

export interface QuietHoursPreferences {
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
}

export interface NotificationDeliveryHealth {
  permission: string;
  pendingCount: number;
  lastScheduledAt: string | null;
  lastError: string | null;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerTaskNotificationActions(isPro: boolean = false) {
  if (Platform.OS === 'web') return;
  // Everyone can act on a reminder from the notification: "Mark Complete" checks
  // it off in place, and "Review" opens the task so the user can look before
  // marking (avoids accidental completion). "Snooze" — rescheduling the reminder
  // — is the Pro convenience, so it's added only for Pro. Re-registered whenever
  // Pro status flips (NotificationActionBridge) so Snooze appears on upgrade and
  // disappears on lapse.
  const actions = [
    {
      identifier: COMPLETE_TASK_ACTION,
      buttonTitle: translate('Mark Complete'),
      options: { opensAppToForeground: false },
    },
    {
      identifier: REVIEW_TASK_ACTION,
      buttonTitle: translate('Review'),
      options: { opensAppToForeground: true },
    },
    ...(isPro
      ? [{
          identifier: SNOOZE_TASK_ACTION,
          buttonTitle: translate('Snooze 1 Hour'),
          options: { opensAppToForeground: false },
        }]
      : []),
  ];
  await Notifications.setNotificationCategoryAsync(TASK_NOTIFICATION_CATEGORY, actions);
}

function readHealthState(): Pick<NotificationDeliveryHealth, 'lastScheduledAt' | 'lastError'> {
  try {
    const raw = SecureStore.getItem(NOTIFICATION_HEALTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { lastScheduledAt: null, lastError: null };
}

function writeHealthState(value: Pick<NotificationDeliveryHealth, 'lastScheduledAt' | 'lastError'>) {
  try { SecureStore.setItem(NOTIFICATION_HEALTH_KEY, JSON.stringify(value)); } catch {}
}

export async function getNotificationDeliveryHealth(): Promise<NotificationDeliveryHealth> {
  const stored = readHealthState();
  if (Platform.OS === 'web') return { permission: 'unsupported', pendingCount: 0, ...stored };
  try {
    const [permission, pending] = await Promise.all([
      Notifications.getPermissionsAsync(),
      Notifications.getAllScheduledNotificationsAsync(),
    ]);
    return { permission: permission.status, pendingCount: pending.length, ...stored };
  } catch (error: any) {
    return { permission: 'unknown', pendingCount: 0, ...stored, lastError: error?.message || 'Delivery check failed' };
  }
}

function clockMinutes(value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  const [hours, minutes] = value.split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : fallback;
}

export function moveOutsideQuietHours(date: Date, quiet?: QuietHoursPreferences | null): Date {
  if (!quiet?.quiet_hours_enabled) return date;
  const result = new Date(date);
  const minute = result.getHours() * 60 + result.getMinutes();
  const start = clockMinutes(quiet.quiet_hours_start, 22 * 60);
  const end = clockMinutes(quiet.quiet_hours_end, 8 * 60);
  // Matching endpoints represent an empty window, not a 24-hour mute.
  // This also keeps an accidental same-time selection from delaying every
  // reminder by a full day.
  if (start === end) return result;
  const inside = start < end
    ? minute >= start && minute < end
    : minute >= start || minute < end;
  if (!inside) return result;
  if (start < end || minute < end) {
    result.setHours(Math.floor(end / 60), end % 60, 0, 0);
  } else {
    result.setDate(result.getDate() + 1);
    result.setHours(Math.floor(end / 60), end % 60, 0, 0);
  }
  return result;
}

export async function snoozeNotification(response: Notifications.NotificationResponse, minutes = 60) {
  await ensureAndroidChannels();
  const content = response.notification.request.content;
  const data = content.data || {};
  const userId = typeof data.userId === 'string' ? data.userId : undefined;
  let quiet: QuietHoursPreferences | null = null;
  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
      .eq('id', userId)
      .maybeSingle();
    quiet = profile as QuietHoursPreferences | null;
  }
  const triggerDate = moveOutsideQuietHours(new Date(Date.now() + minutes * 60_000), quiet);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: content.title || translate('Task reminder'),
      body: content.body || translate('This task still needs your attention.'),
      data: { ...data, fireAt: triggerDate.getTime(), snoozed: true },
      sound: true,
      categoryIdentifier: TASK_NOTIFICATION_CATEGORY,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
      channelId: TASK_REMINDER_CHANNEL,
    },
  });
  writeHealthState({ lastScheduledAt: new Date().toISOString(), lastError: null });
}

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

/**
 * Ask, in our own words, before letting iOS ask.
 *
 * The OS dialog is one-shot: decline it and the app can never raise it again,
 * only send the student into Settings. So it must never be spent on a moment
 * where the answer is obviously "no" — an empty app at launch converts at
 * roughly half the rate of an app that has just done something useful.
 *
 * WHY THIS IS A HELPER and not left inline in the import flow: the ask used to
 * live only inside a successful syllabus import, and 35 of 54 accounts have
 * never completed one — so most students were never asked at all, and the app
 * had no way to reach them for the rest of the term. Any moment that proves
 * intent (a first course added, by any route) should be able to raise it.
 *
 * No-ops on web, and stays silent unless the permission is still
 * `undetermined`, so a student who already answered is never nagged.
 *
 * @returns whether notifications are usable when this resolves.
 */
/**
 * Android reports "never asked" as DENIED.
 *
 * expo-notifications derives Android's status from
 * `NotificationManagerCompat.areNotificationsEnabled()`, which is false both
 * for a fresh install that has never seen the POST_NOTIFICATIONS dialog and
 * for someone who turned notifications off on purpose. iOS distinguishes the
 * two; Android does not, so every caller that keyed off 'undetermined' — the
 * primed ask, and the Today banner — treated a brand-new Android user as
 * somebody who had already said no. The OS prompt was never requested at all,
 * and reminders (the free tier's headline promise) could only be switched on
 * by finding the Settings toggle unaided.
 *
 * `canAskAgain` is the signal Android actually has: true while the system will
 * still show the dialog (never asked, or denied once), false once it is
 * permanently refused. iOS is untouched — there `canAskAgain` is already false
 * on a real denial, so this never rewrites its answer.
 */
export type NotificationPermissionStatus = 'granted' | 'undetermined' | 'denied';

export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  if (Platform.OS === 'android' && canAskAgain) return 'undetermined';
  return status === 'undetermined' ? 'undetermined' : 'denied';
}

export async function primeNotificationPermission(copy: {
  title: string;
  message: string;
  confirm: string;
  decline: string;
}): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const status = await getNotificationPermissionStatus();
    if (status === 'granted') return true;
    if (status !== 'undetermined') return false;

    // Imported lazily: lib/ is loaded by non-UI paths (background reschedules,
    // sign-out cleanup) that must not pull the React Native UI layer in.
    const { Alert } = await import('@/components/LocalizedReactNative');
    const wants = await new Promise<boolean>((resolve) => {
      Alert.alert(
        copy.title,
        copy.message,
        [
          { text: copy.decline, style: 'cancel', onPress: () => resolve(false) },
          { text: copy.confirm, onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
    if (!wants) return false;
    return await requestNotificationPermission().catch(() => false);
  } catch {
    // Never let a permission prompt break the flow that triggered it.
    return false;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    // expo-notifications has no web implementation for permissions (or for
    // scheduling — see startWebDueSoonReminders below), so this talks to the
    // plain browser Notification API directly instead of Notifications.*.
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
      const result = await Notification.requestPermission();
      return result === 'granted';
    } catch {
      return false;
    }
  }
  const existing = await getNotificationPermissionStatus();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  const granted = status === 'granted';
  if (granted) {
    // Permission JUST transitioned to granted (e.g. the priming prompt on the
    // review screen after the first import). Enroll this device for server
    // push now so a newly-onboarded user is reachable immediately, instead of
    // only after the next cold launch / sign-in. Fires only on the transition
    // (the already-granted case returns above), so it never spams. No-op
    // unless a user is signed in; fire-and-forget.
    registerForPushNotificationsAsync().catch(() => {});
  }
  return granted;
}

function getDueLabel(daysUntilDue: number, locale: AppLocale): string {
  if (locale === 'es') {
    if (daysUntilDue === 0) return 'vence hoy';
    if (daysUntilDue === 1) return 'vence mañana';
    if (daysUntilDue > 1) return `vence en ${daysUntilDue} días`;
    if (daysUntilDue === -1) return 'lleva 1 día atrasada';
    return `lleva ${Math.abs(daysUntilDue)} días atrasada`;
  }
  if (daysUntilDue === 0) return 'due today';
  if (daysUntilDue === 1) return 'due tomorrow';
  if (daysUntilDue > 1) return `due in ${daysUntilDue} days`;
  if (daysUntilDue === -1) return 'overdue by 1 day';
  return `overdue by ${Math.abs(daysUntilDue)} days`;
}

function formatLeadTime(totalMinutes: number, locale: AppLocale): string {
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${locale === 'es' ? (days === 1 ? 'día' : 'días') : (days === 1 ? 'day' : 'days')}`);
  if (hours) parts.push(`${hours} ${locale === 'es' ? (hours === 1 ? 'hora' : 'horas') : (hours === 1 ? 'hour' : 'hours')}`);
  if (minutes) parts.push(`${minutes} ${locale === 'es' ? (minutes === 1 ? 'minuto' : 'minutos') : (minutes === 1 ? 'minute' : 'minutes')}`);
  return parts.join(' ');
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
  prefetched?: {
    reminder_same_day: boolean; reminder_1day: boolean; reminder_3day: boolean; isPro: boolean;
    quiet_hours_enabled?: boolean; quiet_hours_start?: string; quiet_hours_end?: string;
  },
  // null/undefined follows profile defaults; [] explicitly disables reminders.
  customOffsetsMinutes?: number[] | null,
) {
  if (Platform.OS === 'web') return;
  // Before the first scheduleNotificationAsync below, always. Android 8+ drops
  // a notification posted to a channel id that does not exist yet, silently —
  // nothing throws and nothing is logged, the reminder simply never arrives.
  // Relying on the mount-time call in _layout winning that race would make
  // every reminder depend on effect ordering.
  await ensureAndroidChannels();
  const locale = getAppLocale();
  // Schema marks tasks.due_date NOT NULL, but a malformed row coming
  // from direct DB manipulation would crash split('-') below. Bail
  // quietly rather than throw out of the toggle-complete flow.
  if (!dueDate) return;

  // Custom reminders (None / presets / exact times) are a Pro feature. For free
  // users, ignore any task-level custom selection and fall back to the default
  // reminder scheme below — mirroring the UI gate in TaskPlanningFields, so a
  // patched client that saved custom offsets still gets only defaults. isPro
  // comes from prefetched (batch reschedule) or the store (single task).
  const proForReminders = prefetched ? prefetched.isPro : useAppStore.getState().isPro;
  const effectiveOffsets = proForReminders ? customOffsetsMinutes : null;

  // An explicit empty task-level selection means "never notify" and should
  // not trigger the OS permission prompt just because the task was saved.
  if (effectiveOffsets?.length === 0) return;

  const hasPermission = await requestNotificationPermission();
  if (!hasPermission) return;

  const [year, month, day] = dueDate.split('-').map(Number);
  let hour = 9, minute = 0;
  if (dueTime) {
    const [h, m] = dueTime.split(':').map(Number);
    hour = h;
    minute = m;
  }
  const now = new Date();
  let quiet: QuietHoursPreferences = {
    quiet_hours_enabled: prefetched?.quiet_hours_enabled ?? false,
    quiet_hours_start: prefetched?.quiet_hours_start ?? '22:00:00',
    quiet_hours_end: prefetched?.quiet_hours_end ?? '08:00:00',
  };
  if (!prefetched && userId) {
    const { data: quietProfile } = await supabase
      .from('profiles')
      .select('quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
      .eq('id', userId)
      .maybeSingle();
    if (quietProfile) quiet = quietProfile as QuietHoursPreferences;
  }
  // Quiet hours is a Pro feature (same as the 1-/3-day advance reminders
  // forced off below). Force it off for free users even if a stale profile
  // row still has quiet_hours_enabled=true from a lapsed subscription, so a
  // downgraded user's reminders aren't silently shifted out of their window.
  // proForReminders was resolved from prefetched.isPro / the store above.
  if (!proForReminders) quiet.quiet_hours_enabled = false;

  // A task-level selection replaces the profile defaults. This includes an
  // empty array, which deliberately means "do not remind me for this task."
  if (effectiveOffsets != null) {
    for (const offsetMinutes of [...new Set(effectiveOffsets)]) {
      const triggerDate = moveOutsideQuietHours(
        new Date(year, month - 1, day, hour, minute - offsetMinutes, 0),
        quiet,
      );
      if (triggerDate <= now) continue;
      const body = locale === 'es'
        ? offsetMinutes === 0
          ? `${taskTitle} vence ahora`
          : `${taskTitle} vence en ${formatLeadTime(offsetMinutes, locale)}`
        : offsetMinutes === 0
          ? `${taskTitle} is due now`
          : `${taskTitle} is due in ${formatLeadTime(offsetMinutes, locale)}`;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `📚 ${courseName}`,
          body,
          data: { taskId, taskTitle, courseName, dueDate, dueTime, userId, fireAt: triggerDate.getTime() },
          sound: true,
          categoryIdentifier: TASK_NOTIFICATION_CATEGORY,
        },
        trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: TASK_REMINDER_CHANNEL,
      },
      });
    }
    await pruneToCapIfNeeded();
    writeHealthState({ lastScheduledAt: new Date().toISOString(), lastError: null });
    return;
  }

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
        .select('reminder_same_day, reminder_1day, reminder_3day, quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
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

  const dueDateObj = new Date(year, month - 1, day);

  // The actual moment the work is due: the stated time, or end of day when the
  // task has no time. Quiet hours can defer a reminder PAST this — a 10pm
  // "due today" nudge pushed to 8am arrives the morning after the deadline —
  // so every trigger below is checked against it.
  const dueMoment = (() => {
    if (dueTime) {
      const [dh, dm] = dueTime.split(':').map(Number);
      if (Number.isFinite(dh) && Number.isFinite(dm)) {
        return new Date(year, month - 1, day, dh, dm, 0);
      }
    }
    return new Date(year, month - 1, day, 23, 59, 59);
  })();

  const offsets = [
    { days: 0, enabled: preferences.reminder_same_day },
    { days: 1, enabled: preferences.reminder_1day },
    { days: 3, enabled: preferences.reminder_3day },
  ];

  for (const offset of offsets) {
    if (!offset.enabled) continue;

    const triggerDate = moveOutsideQuietHours(
      new Date(year, month - 1, day - offset.days, hour, minute, 0),
      quiet,
    );

    // Don't schedule if in the past
    if (triggerDate <= now) continue;

    // A reminder that lands AFTER the deadline is not a reminder — quiet hours
    // can defer a 10pm "due today" nudge to 8am the next morning. Drop those.
    //
    // Strictly after, not at: for a task WITH a due time the same-day trigger is
    // built from that very time (hour/minute above), so it equals dueMoment
    // exactly. A >= comparison silently cancelled the same-day reminder for
    // every timed task in the app — the common case — while leaving untimed
    // ones (which default to 09:00 against a 23:59 dueMoment) working, so it
    // looked fine in casual testing.
    if (triggerDate > dueMoment) continue;

    // Derive the label from when the notification will ACTUALLY fire, not from
    // the unshifted date: quiet hours can move a trigger across midnight, and
    // the label was still describing the original day.
    const daysUntilDue = differenceInDays(
      dueDateObj,
      new Date(triggerDate.getFullYear(), triggerDate.getMonth(), triggerDate.getDate()),
    );
    const label = getDueLabel(daysUntilDue, locale);

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📚 ${courseName}`,
        body: locale === 'es' ? `${taskTitle} ${label}` : `${taskTitle} is ${label}`,
        data: { taskId, taskTitle, courseName, dueDate, dueTime, userId, fireAt: triggerDate.getTime() },
        sound: true,
        categoryIdentifier: TASK_NOTIFICATION_CATEGORY,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
        channelId: TASK_REMINDER_CHANNEL,
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
    const rawLastCall = dueTime
      ? new Date(year, month - 1, day, hour, minute - 120, 0)
      : new Date(year, month - 1, day, 19, 0, 0);
    const lastCall = moveOutsideQuietHours(rawLastCall, quiet);
    const lastCallBody = locale === 'es'
      ? dueTime ? `${taskTitle} vence en 2 horas` : `${taskTitle} vence esta noche`
      : dueTime ? `${taskTitle} is due in 2 hours` : `${taskTitle} is due tonight`;
    if (lastCall > now) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `⏰ ${courseName}`,
          body: lastCallBody,
          data: { taskId, taskTitle, courseName, dueDate, dueTime, userId, fireAt: lastCall.getTime() },
          sound: true,
          categoryIdentifier: TASK_NOTIFICATION_CATEGORY,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: lastCall,
          channelId: TASK_REMINDER_CHANNEL,
        },
      });
    }
  }

  await pruneToCapIfNeeded();
  writeHealthState({ lastScheduledAt: new Date().toISOString(), lastError: null });
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
 * Remove reminders for tasks that are no longer open.
 *
 * cancelTaskReminders above only ever runs on the device that performed the
 * completion. When a task is completed somewhere else — Canvas marking it
 * submitted server-side, the web app, a second phone — this device still holds
 * a scheduled local notification for finished work, and every other mechanism
 * misses it: rescheduleAllTaskReminders iterates INCOMPLETE tasks, so a task
 * that just became complete is not in its list to be cancelled, and the
 * notification handler shows whatever the OS delivers without consulting the
 * database. Display-time suppression cannot cover this either — the handler
 * runs only while the app is in the foreground, and a due reminder's whole
 * purpose is to arrive when it is not.
 *
 * So the reminder has to be withdrawn ahead of time, which is what this does.
 * It cancels ONLY notifications carrying a data.taskId (see
 * lib/reminderReconcile.ts for why that is exactly the set of task reminders)
 * whose task is no longer an incomplete task of this user. Anything else the
 * app or another feature has scheduled is left untouched.
 *
 * Fails closed: if the tasks read fails or the device is offline, nothing is
 * cancelled. Losing a stale reminder is a small win; silently deleting a valid
 * one because a query timed out would be a real regression.
 *
 * @returns how many notifications were cancelled.
 */
// Bumped on every sign-out (via cancelAllRemindersOnSignOut). An in-flight
// reschedule or reconciliation captures this at start and bails the moment it
// changes, so a sign-out that races either loop can't keep mutating the
// signed-out user's reminders AFTER the cancel-all — which would leak A's task
// titles to user B on the same device.
let rescheduleGeneration = 0;

let reconcileInFlight = false;

export async function reconcileTaskReminders(userId: string): Promise<number> {
  if (Platform.OS === 'web' || !userId || reconcileInFlight) return 0;
  reconcileInFlight = true;
  // Same sign-out guard as rescheduleAllTaskReminders: if the user signs out
  // mid-run we stop rather than keep mutating the next user's notifications.
  const gen = rescheduleGeneration;
  try {
    // A task created while offline has a reminder on this device and NO row in
    // the database yet, so it would read as deleted and lose its reminder. Wait
    // for the queue to drain before trusting the database to be the whole
    // truth. Deliberately fail-safe: any trouble reading the queue is treated
    // as "there is pending work", which can only make this a no-op.
    let pending = 1;
    try {
      const snapshot = getOfflineSyncSnapshot();
      pending = (snapshot?.pendingCount ?? 0) + (snapshot?.failedCount ?? 0);
    } catch {
      pending = 1;
    }
    if (pending > 0) return 0;

    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const byTask = groupRemindersByTask(scheduled as unknown as ScheduledLike[]);
    if (byTask.size === 0) return 0;

    const scheduledIds = [...byTask.keys()];
    const { data, error } = await supabase
      .from('tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('is_completed', false)
      .in('id', scheduledIds);
    // An unreachable or erroring database is NOT evidence that every task is
    // finished. Treating it as such would cancel every pending reminder on the
    // phone the first time the network dropped.
    if (error || !data) return 0;

    const { cancel } = planReminderReconciliation(
      scheduled as unknown as ScheduledLike[],
      data.map((row: { id: string }) => row.id),
    );

    let cancelled = 0;
    for (const identifier of cancel) {
      if (rescheduleGeneration !== gen) break;
      try {
        await Notifications.cancelScheduledNotificationAsync(identifier);
        cancelled += 1;
      } catch {
        // One bad identifier must not abandon the rest of the sweep.
      }
    }
    return cancelled;
  } catch {
    // Best-effort: reconciliation runs on app resume and must never be able to
    // break the resume path.
    return 0;
  } finally {
    reconcileInFlight = false;
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
      .select('reminder_same_day, reminder_1day, reminder_3day, quiet_hours_enabled, quiet_hours_start, quiet_hours_end')
      .eq('id', userId)
      .maybeSingle();
    const prefetched = {
      reminder_same_day: profile ? profile.reminder_same_day : true,
      reminder_1day: profile ? profile.reminder_1day : true,
      reminder_3day: profile ? profile.reminder_3day : true,
      quiet_hours_enabled: profile ? profile.quiet_hours_enabled : false,
      quiet_hours_start: profile ? profile.quiet_hours_start : '22:00:00',
      quiet_hours_end: profile ? profile.quiet_hours_end : '08:00:00',
      isPro: useAppStore.getState().isPro,
    };
    const { data } = await supabase
      .from('tasks')
      .select('id, title, due_date, due_time, reminder_offsets_minutes, courses(name)')
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
      await scheduleTaskReminders(
        t.id, t.title, courseName, t.due_date, t.due_time, userId,
        prefetched, t.reminder_offsets_minutes,
      );
    }
    writeHealthState({ lastScheduledAt: new Date().toISOString(), lastError: null });
  } catch (error: any) {
    writeHealthState({
      lastScheduledAt: readHealthState().lastScheduledAt,
      lastError: error?.message || 'Reminder scheduling failed',
    });
    // Best-effort — a failed reschedule must never break the purchase flow.
  } finally {
    rescheduleInFlight = false;
  }
}

// ── Web reminders (foreground MVP, not full parity) ────────────────────────
// Native local-scheduled notifications fire at a future date even if the app
// is closed — there is no browser equivalent (no web implementation of
// expo-notifications' NotificationScheduler, and browsers can't schedule a
// future notification for an arbitrary date even with a service worker). This
// is the honest substitute: while a student has the Semora tab open (or open
// in a background tab), poll for anything due imminently and fire a plain
// browser Notification. It does not cover the closed-tab/closed-browser case
// native local + push notifications do — see WEB_APP_PLAN.md.

const WEB_DUE_SOON_WINDOW_MS = 5 * 60 * 1000; // fire once due time is within 5 minutes
const WEB_DUE_SOON_POLL_MS = 60 * 1000;
// Session-only, per taskId — avoids re-notifying every poll tick once fired.
// Intentionally not persisted: a fresh page load re-checking once is fine.
const webNotifiedTaskIds = new Set<string>();

async function checkWebDueSoonReminders(userId: string) {
  if (
    Platform.OS !== 'web' ||
    typeof Notification === 'undefined' ||
    Notification.permission !== 'granted'
  ) return;
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from('tasks')
    .select('id, title, due_date, due_time, courses(name)')
    .eq('user_id', userId)
    .eq('is_completed', false)
    .eq('due_date', today);
  if (!data) return;
  const now = Date.now();
  for (const t of data as any[]) {
    // All-day tasks (no due_time) have no specific moment to fire "soon"
    // against — same-day awareness for those is covered by just having the
    // tab open on the Today screen, not a push-style nudge.
    if (webNotifiedTaskIds.has(t.id) || !t.due_time) continue;
    const [hour, minute] = t.due_time.split(':').map(Number);
    const dueAt = new Date(`${t.due_date}T00:00:00`);
    dueAt.setHours(hour, minute, 0, 0);
    const diff = dueAt.getTime() - now;
    if (diff > -WEB_DUE_SOON_WINDOW_MS && diff <= WEB_DUE_SOON_WINDOW_MS) {
      const courseName = (Array.isArray(t.courses) ? t.courses[0]?.name : t.courses?.name) || 'Course';
      try {
        new Notification(`📚 ${courseName}`, {
          body: getAppLocale() === 'es' ? `${t.title} vence pronto` : `${t.title} is due soon`,
          tag: t.id,
        });
      } catch {
        // Some browsers (notably iOS Safari) restrict the Notification
        // constructor outside a service worker — fail silently rather than
        // throw inside a background poll.
      }
      webNotifiedTaskIds.add(t.id);
    }
  }
}

/**
 * Starts the web foreground due-soon check (polls every 60s while mounted).
 * No-op on native, where scheduleTaskReminders/rescheduleAllTaskReminders
 * already cover this via the OS's own scheduler. Returns a stop function.
 */
export function startWebDueSoonReminders(userId: string): () => void {
  if (Platform.OS !== 'web') return () => {};
  checkWebDueSoonReminders(userId).catch(() => {});
  const interval = setInterval(() => {
    checkWebDueSoonReminders(userId).catch(() => {});
  }, WEB_DUE_SOON_POLL_MS);
  return () => clearInterval(interval);
}
