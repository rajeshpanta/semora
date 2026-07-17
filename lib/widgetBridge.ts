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
// The second widget (Due This Week) reads the SAME payload key — one
// write feeds both. We still reload both kinds so each refreshes.
const DUE_THIS_WEEK_KIND = 'SemoraDueThisWeekWidget';

function dueLabelFor(dueDate: string, todayStr: string, tomorrowStr: string): string {
  if (dueDate <= todayStr) return 'Today';
  if (dueDate === tomorrowStr) return 'Tomorrow';
  const due = new Date(dueDate + 'T00:00:00');
  const today = new Date(todayStr + 'T00:00:00');
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  return `In ${days} days`;
}

/** A single "due this week" row for the second widget. Deliberately the
 *  minimal glanceable shape — title + a short due label + course color. */
export interface DueThisWeekItem {
  title: string;
  dueLabel: string;
  colorHex: string;
  // Raw date so the Swift side can recompute labels at render time, same
  // as the Up Next items.
  dueDate: string;
}

/** Extra data the caller supplies for the new widget + streak chip. All
 *  optional so the single call site can adopt it incrementally and older
 *  callers keep compiling. */
export interface TodayWidgetExtras {
  /** Current streak length (days). Rendered on the Due-This-Week widget. */
  streak?: number;
  /** Tasks due in the next ~7 days, already sorted soonest-first. Capped
   *  internally to a widget-friendly length. */
  dueThisWeek?: DueThisWeekItem[];
}

export function updateTodayWidget(
  upcoming: TaskWithCourse[],
  todayStr: string,
  tomorrowStr: string,
  extras: TodayWidgetExtras = {},
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

    // New fields are ADDITIVE — the existing today/items keys are
    // untouched so an old widget binary still decodes the payload, and a
    // new widget binary treats missing new fields as nil (Swift optionals).
    const streak = typeof extras.streak === 'number' && extras.streak > 0
      ? Math.round(extras.streak)
      : 0;
    // Cap ~8 rows: enough for a systemMedium grouped list without
    // ballooning the shared-defaults payload.
    const dueThisWeek = (extras.dueThisWeek ?? []).slice(0, 8);

    storage.set(
      PAYLOAD_KEY,
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        dueTodayCount,
        items,
        streak,
        dueThisWeek,
      }),
    );
    ExtensionStorage.reloadWidget(WIDGET_KIND);
    // Reload the second widget too. Wrapped defensively: on an older
    // native binary this kind doesn't exist, and reloadWidget must not
    // throw past the outer catch and skip the first reload.
    try {
      ExtensionStorage.reloadWidget(DUE_THIS_WEEK_KIND);
    } catch {
      // Second widget not installed on this build — fine.
    }
  } catch {
    // Widget data is a nice-to-have; never let it surface as an app error.
  }
}
