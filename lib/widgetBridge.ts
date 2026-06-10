import { Platform } from 'react-native';
import type { TaskWithCourse } from '@/lib/queries';

/**
 * Pushes the "Up Next" payload into the App Group so the home-screen
 * widget (targets/widget) can render it. Called from the Today screen
 * whenever its task data settles — the widget therefore refreshes on
 * every app open and after every import/complete/delete that returns
 * the user to Today.
 *
 * Best-effort by design: any failure (module unavailable in Expo Go,
 * simulator without app-group, etc.) is swallowed — widgets must never
 * break the app.
 */

const APP_GROUP = 'group.com.rajeshpanta.syllabussnap';
const PAYLOAD_KEY = 'widget_payload';
const WIDGET_KIND = 'SemoraTodayWidget';

function dueLabelFor(dueDate: string, todayStr: string, tomorrowStr: string): string {
  if (dueDate <= todayStr) return 'Today';
  if (dueDate === tomorrowStr) return 'Tomorrow';
  const due = new Date(dueDate + 'T00:00:00');
  const today = new Date(todayStr + 'T00:00:00');
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  return `In ${days} days`;
}

export function updateTodayWidget(
  upcoming: TaskWithCourse[],
  todayStr: string,
  tomorrowStr: string,
): void {
  if (Platform.OS !== 'ios') return;
  try {
    // Lazy require so non-dev-client environments (Expo Go, tests)
    // never touch the native module at import time.
    const { ExtensionStorage } = require('@bacons/apple-targets');
    const storage = new ExtensionStorage(APP_GROUP);

    const items = upcoming.slice(0, 4).map((t) => ({
      id: t.id,
      title: t.title,
      course: t.courses?.name ?? 'Course',
      colorHex: t.courses?.color ?? '#6B46C1',
      dueLabel: dueLabelFor(t.due_date, todayStr, tomorrowStr),
      // Raw date so the widget recomputes the label at render time —
      // "Tomorrow" must become "Today" after midnight without an app open.
      dueDate: t.due_date,
    }));
    const dueTodayCount = upcoming.filter((t) => t.due_date <= todayStr).length;

    storage.set(
      PAYLOAD_KEY,
      JSON.stringify({ updatedAt: new Date().toISOString(), dueTodayCount, items }),
    );
    ExtensionStorage.reloadWidget(WIDGET_KIND);
  } catch {
    // Widget data is a nice-to-have; never let it surface as an app error.
  }
}
