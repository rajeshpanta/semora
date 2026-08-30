import { create } from 'zustand';
import { differenceInDays } from 'date-fns';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Semester } from '@/types/database';

export type ThemeMode = 'system' | 'light' | 'dark';
export type AppLanguagePreference = 'system' | 'en' | 'es';
// The struggle the user picked in onboarding — used to tailor the auth
// wall and (later) paywall copy to their own words.
export type PainPoint = 'deadlines' | 'planning' | 'grades';

const THEME_KEY = 'semora_theme';
const LANGUAGE_KEY = 'semora_language';
const SEMESTER_KEY = 'semora_semester';
const RESET_KEY = 'semora_reset_in_progress';
// Device-level one-time flags. Unlike the keys above these are NOT
// user-scoped — onboarding, the post-scan reverse-trial paywall, and the
// rating prompt should each happen once per device, not once per account.
const ONBOARDED_KEY = 'semora_onboarded';
const AHA_PAYWALL_KEY = 'semora_aha_paywall';
const REVIEW_REQUESTED_KEY = 'semora_review_requested';
// "This device has completed a syllabus import at least once" — the happy
// moment the review prompt's primary trigger keys off.
//
// It used to key off AHA_PAYWALL_KEY instead, which is set only inside the
// `!isPro` branch of the review screen. So a user who was already Pro when
// they first imported never set it, and the primary trigger could never fire
// for them — they could only reach the prompt through the 10-completion
// fallback. That is exactly backwards: a paying user who just watched a
// semester import correctly is the likeliest person on the device to leave a
// good rating. Separating the two means the paywall flag goes on describing
// the paywall and this one describes the import.
const IMPORTED_SYLLABUS_KEY = 'semora_imported_syllabus';
// The device-local calendar day of that import, yyyy-MM-dd.
//
// The flag above says an import happened; this says when, and the review gate
// needs the difference. Measured, 39% of rating prompts fired within ten
// minutes of first launch and 76% within the hour, because the Today tab only
// mounts AFTER onboarding and the first scan — so a mount-time check found the
// flag already true and asked immediately. A day is the smallest unit that
// distinguishes "watched a syllabus import" from "planned a week of work".
const IMPORTED_SYLLABUS_DAY_KEY = 'semora_imported_syllabus_day';
// The day the native SKStoreReviewController prompt was spent. The card ask
// waits for a later one so the two never land in the same sitting.
const REVIEW_PROMPTED_DAY_KEY = 'semora_review_prompted_day';
// The student dismissed the rating card. Once ever — this is not a nag.
const RATING_CARD_DISMISSED_KEY = 'semora_rating_card_dismissed';
const WIDGET_TIP_KEY = 'semora_widget_tip_seen';
const COURSES_VIEW_KEY = 'semora_courses_view';
const TOOLS_OPEN_KEY = 'semora_sidebar_tools_open';
// Whether the desktop web sidebar is hidden entirely. Device-level display
// preference, like COURSES_VIEW_KEY: someone on a 13" laptop can reasonably
// want the rail gone while the same account on a monitor keeps it.
const SIDEBAR_COLLAPSED_KEY = 'semora_sidebar_collapsed';
// Lifetime count of task completions on this device — the fallback trigger
// for the review prompt (10th completion). Device-level like the flags
// above: the rating prompt is once-per-device regardless of account, so
// the counter that feeds it must survive sign-out too.
const TASKS_COMPLETED_KEY = 'semora_tasks_completed';
// Captured during onboarding (before sign-in). userName personalizes the
// greeting; defaultTerm pre-fills the first semester's name. Unlike the
// one-time flags above these are USER personalization, not device state —
// resetUserState clears them on sign-out so user B never gets greeted
// with user A's name.
const USER_NAME_KEY = 'semora_user_name';
const DEFAULT_TERM_KEY = 'semora_default_term';
const PAIN_POINT_KEY = 'semora_pain_point';
// Pro entitlement — persisted so a paying user isn't shown free-tier UI on
// every cold start before the async server revalidation resolves. User-scoped:
// cleared by resetUserState on sign-out so user B never inherits user A's Pro.
const PRO_KEY = 'semora_is_pro';

function getItem(key: string): string | null {
  if (Platform.OS === 'web') {
    try { return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null; } catch { return null; }
  }
  try { return SecureStore.getItem(key); } catch { return null; }
}

/** Device-local yyyy-MM-dd. Deliberately local rather than UTC: "did the
 *  student come back the next day" is a question about their calendar, and a
 *  UTC day boundary would answer it wrongly for most of the Americas every
 *  evening. Hand-formatted so this file stays free of a date library. */
export function localDayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function setItem(key: string, value: string) {
  if (Platform.OS === 'web') {
    try { if (typeof window !== 'undefined') window.localStorage.setItem(key, value); } catch {}
    return;
  }
  try { SecureStore.setItem(key, value); } catch {}
}

// Load initial values synchronously so there's no flash
const initialTheme = (() => {
  const stored = getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system' as ThemeMode;
})();

/**
 * The language the visitor was reading semoraai.com in, if they came from it.
 *
 * The marketing site sets `semora_locale` on `.semoraai.com` (website/proxy.ts),
 * which app.semoraai.com can therefore read — the same trick semora_device_id
 * uses in lib/analytics.ts, and the only one available across two origins.
 *
 * Without it, someone reading the Spanish site on an English laptop tapped
 * "Get started" and landed in an English app, because the device language was
 * all the app had to go on. They had chosen Spanish a moment earlier; nothing
 * carried it.
 *
 * Only ever READ, and only ever a hint. It loses to any preference the student
 * has actually set — see below.
 */
function siteLocaleHint(): AppLanguagePreference | null {
  try {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|; )semora_locale=([^;]*)/);
    const value = match ? decodeURIComponent(match[1]) : '';
    return value === 'es' || value === 'en' ? value : null;
  } catch {
    return null;
  }
}

const initialLanguagePreference = (() => {
  const stored = getItem(LANGUAGE_KEY);
  if (stored === 'en' || stored === 'es' || stored === 'system') return stored;
  // Nothing stored means this account has never touched the language setting,
  // which is the ONLY moment the site's hint may speak. A student who has been
  // through Settings — even to pick "Use device language" — has said what they
  // want, and a cookie from a marketing page must never overrule that.
  return siteLocaleHint() ?? ('system' as AppLanguagePreference);
})();

const initialSemester = getItem(SEMESTER_KEY);
const initialIsPro = getItem(PRO_KEY) === 'true';

// Recovery sessions survive app-kill: the Supabase session is real
// in SecureStore, but the in-memory inPasswordReset flag is gone, so
// AuthGate would route the user straight to (tabs) without forcing
// them to set a new password. Persist this flag so it can re-arm
// AuthGate after a cold start.
const initialInPasswordReset = getItem(RESET_KEY) === 'true';

// Read synchronously at module load so AuthGate / Today can branch on the
// first render without a flash (same approach as theme/semester above).
const initialOnboarded = getItem(ONBOARDED_KEY) === 'true';
const initialAhaPaywallShown = getItem(AHA_PAYWALL_KEY) === 'true';
const initialWidgetTipSeen = getItem(WIDGET_TIP_KEY) === 'true';
const initialCoursesView: 'list' | 'grid' =
  getItem(COURSES_VIEW_KEY) === 'grid' ? 'grid' : 'list';
// Open unless explicitly collapsed, so an existing user's sidebar looks the
// same the first time they load a build that can collapse it.
const initialToolsOpen = getItem(TOOLS_OPEN_KEY) !== 'false';
const initialSidebarCollapsed = getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
const initialReviewRequested = getItem(REVIEW_REQUESTED_KEY) === 'true';
// Backfill: a device that already has AHA_PAYWALL_KEY set completed an import
// before IMPORTED_SYLLABUS_KEY existed. Without this, upgrading would read the
// new key as false and silently re-arm a once-ever prompt for people who have
// already been through it.
const initialImportedSyllabus =
  getItem(IMPORTED_SYLLABUS_KEY) === 'true' || initialAhaPaywallShown;
// Devices that imported before IMPORTED_SYLLABUS_DAY_KEY existed have no day
// recorded. Backfilling to TODAY rather than to a past date is the
// conservative choice: it costs a long-standing user at most one more day
// before they are asked, where the alternative risks asking someone who
// imported twenty minutes ago on the very launch this code first runs.
const initialImportedSyllabusDay = (() => {
  const stored = getItem(IMPORTED_SYLLABUS_DAY_KEY);
  if (stored) return stored;
  if (!initialImportedSyllabus) return null;
  const today = localDayKey();
  setItem(IMPORTED_SYLLABUS_DAY_KEY, today);
  return today;
})();
// Same backfill reasoning as the import day, aimed at a specific population:
// the 82 devices that already spent their native prompt under the old build
// have `reviewRequested` set and no day recorded. Those are precisely the
// users the card exists for — their one shot was fired, and iOS may well have
// swallowed it without showing anything. Left null they could never be offered
// the card at all, which would exclude the best audience for it. Stamped today
// so the card becomes available tomorrow, never in this session.
const initialReviewPromptedDay = (() => {
  const stored = getItem(REVIEW_PROMPTED_DAY_KEY);
  if (stored) return stored;
  if (!initialReviewRequested) return null;
  const today = localDayKey();
  setItem(REVIEW_PROMPTED_DAY_KEY, today);
  return today;
})();
const initialRatingCardDismissed = getItem(RATING_CARD_DISMISSED_KEY) === 'true';
const initialTasksCompleted = (() => {
  const n = parseInt(getItem(TASKS_COMPLETED_KEY) ?? '', 10);
  // Corrupt/missing value degrades to 0 — worst case the milestone prompt
  // just needs a few more completions; never NaN-poisons the comparison.
  return Number.isFinite(n) && n > 0 ? n : 0;
})();
const initialUserName = getItem(USER_NAME_KEY);
const initialDefaultTerm = getItem(DEFAULT_TERM_KEY);
const initialPainPoint = getItem(PAIN_POINT_KEY) as PainPoint | null;

interface AppState {
  selectedSemesterId: string | null;
  setSelectedSemester: (id: string | null) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  languagePreference: AppLanguagePreference;
  setLanguagePreference: (language: AppLanguagePreference) => void;
  isPro: boolean;
  setIsPro: (value: boolean) => void;
  subscriptionPlan: 'annual' | 'monthly' | null;
  setSubscriptionPlan: (plan: 'annual' | 'monthly' | null) => void;
  postSignupBanner: { email: string; needsConfirm: boolean } | null;
  setPostSignupBanner: (banner: { email: string; needsConfirm: boolean } | null) => void;
  inPasswordReset: boolean;
  setInPasswordReset: (v: boolean) => void;
  // Device-level one-time flags (see *_KEY notes above). Persisted so they
  // survive relaunch but intentionally left out of resetUserState().
  hasOnboarded: boolean;
  setHasOnboarded: (v: boolean) => void;
  ahaPaywallShown: boolean;
  setAhaPaywallShown: (v: boolean) => void;
  /** Set on the first fully successful syllabus import, Pro or free. */
  hasImportedSyllabus: boolean;
  setHasImportedSyllabus: (v: boolean) => void;
  /** Device-local yyyy-MM-dd of that import; null if it never happened.
   *  Read by lib/reviewGate to keep the rating ask off the import day. */
  importedSyllabusDay: string | null;
  reviewRequested: boolean;
  setReviewRequested: (v: boolean) => void;
  /** Device-local yyyy-MM-dd the native rating prompt was spent. */
  reviewPromptedDay: string | null;
  setReviewPromptedDay: (v: string) => void;
  /** The rating card was dismissed. Once ever. */
  ratingCardDismissed: boolean;
  setRatingCardDismissed: () => void;
  /**
   * The home-screen widget tip has been shown once. The app ships a widget
   * (targets/widget) that nothing in the UI has ever mentioned, so nobody
   * installs it — and it is the only surface that keeps working for a student
   * who has stopped opening the app.
   */
  widgetTipSeen: boolean;
  setWidgetTipSeen: (v: boolean) => void;
  /**
   * How the Courses tab lays out course cards. 'list' is the original
   * information-dense row; 'grid' is the two-column tile students recognise
   * from Canvas. A display preference, so it lives on the device rather than
   * the account — someone using a phone and a laptop can reasonably want a
   * different density on each.
   */
  coursesView: 'list' | 'grid';
  setCoursesView: (v: 'list' | 'grid') => void;
  /** Whether the desktop sidebar's Study tools group is expanded. */
  sidebarToolsOpen: boolean;
  setSidebarToolsOpen: (v: boolean) => void;
  /**
   * Whether the desktop web sidebar is hidden, giving the screen the full
   * window. Remembered across sessions — a student who hid it to write is
   * not asking to hide it again every time they come back.
   */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  /**
   * Lifetime task completions on this device (see TASKS_COMPLETED_KEY).
   * Counts completion ACTIONS across ALL screens — incremented centrally in
   * useToggleTaskComplete's success path (lib/queries.ts), which Today,
   * Calendar, course detail, and task detail all share. Un-completing
   * doesn't decrement, because it's an engagement signal for the review
   * prompt, not a task tally.
   * Device-level: intentionally NOT cleared by resetUserState.
   */
  tasksCompletedCount: number;
  incrementTasksCompleted: () => void;
  userName: string | null;
  setUserName: (v: string | null) => void;
  defaultTerm: string | null;
  setDefaultTerm: (v: string | null) => void;
  painPoint: PainPoint | null;
  setPainPoint: (v: PainPoint | null) => void;
  /**
   * Reset every user-scoped field to its initial value. Called from
   * signOut so user B doesn't inherit user A's selected semester,
   * Pro state, plan, banners, or recovery-flow flags. Theme is left
   * alone — it's a device preference, not a user preference.
   */
  resetUserState: () => void;
}

function deleteItem(key: string) {
  if (Platform.OS === 'web') {
    try { if (typeof window !== 'undefined') window.localStorage.removeItem(key); } catch {}
    return;
  }
  SecureStore.deleteItemAsync(key).catch(() => {});
}

export const useAppStore = create<AppState>((set) => ({
  selectedSemesterId: initialSemester,
  setSelectedSemester: (id) => {
    set({ selectedSemesterId: id });
    if (id) {
      setItem(SEMESTER_KEY, id);
    } else {
      deleteItem(SEMESTER_KEY);
    }
  },
  themeMode: initialTheme,
  setThemeMode: (mode) => {
    set({ themeMode: mode });
    setItem(THEME_KEY, mode);
  },
  languagePreference: initialLanguagePreference,
  setLanguagePreference: (language) => {
    set({ languagePreference: language });
    setItem(LANGUAGE_KEY, language);
  },
  isPro: initialIsPro,
  setIsPro: (value) => {
    set({ isPro: value });
    if (value) { setItem(PRO_KEY, 'true'); } else { deleteItem(PRO_KEY); }
  },
  subscriptionPlan: null,
  setSubscriptionPlan: (plan) => set({ subscriptionPlan: plan }),
  postSignupBanner: null,
  setPostSignupBanner: (banner) => set({ postSignupBanner: banner }),
  inPasswordReset: initialInPasswordReset,
  setInPasswordReset: (v) => {
    set({ inPasswordReset: v });
    if (v) {
      setItem(RESET_KEY, 'true');
    } else {
      deleteItem(RESET_KEY);
    }
  },
  hasOnboarded: initialOnboarded,
  setHasOnboarded: (v) => {
    set({ hasOnboarded: v });
    if (v) { setItem(ONBOARDED_KEY, 'true'); } else { deleteItem(ONBOARDED_KEY); }
  },
  ahaPaywallShown: initialAhaPaywallShown,
  setAhaPaywallShown: (v) => {
    set({ ahaPaywallShown: v });
    if (v) { setItem(AHA_PAYWALL_KEY, 'true'); } else { deleteItem(AHA_PAYWALL_KEY); }
  },
  hasImportedSyllabus: initialImportedSyllabus,
  importedSyllabusDay: initialImportedSyllabusDay,
  setHasImportedSyllabus: (v) => {
    if (!v) {
      deleteItem(IMPORTED_SYLLABUS_KEY);
      set({ hasImportedSyllabus: false });
      return;
    }
    setItem(IMPORTED_SYLLABUS_KEY, 'true');
    set((s) => {
      // Stamped only on the FIRST import. A student importing a second
      // syllabus in week six has not reset their relationship with the app,
      // and re-stamping would push the rating ask a day further out every
      // time they added a course.
      if (s.importedSyllabusDay) return { hasImportedSyllabus: true };
      const day = localDayKey();
      setItem(IMPORTED_SYLLABUS_DAY_KEY, day);
      return { hasImportedSyllabus: true, importedSyllabusDay: day };
    });
  },
  reviewRequested: initialReviewRequested,
  setReviewRequested: (v) => {
    set({ reviewRequested: v });
    if (v) { setItem(REVIEW_REQUESTED_KEY, 'true'); } else { deleteItem(REVIEW_REQUESTED_KEY); }
  },
  reviewPromptedDay: initialReviewPromptedDay,
  setReviewPromptedDay: (v) => {
    set({ reviewPromptedDay: v });
    setItem(REVIEW_PROMPTED_DAY_KEY, v);
  },
  ratingCardDismissed: initialRatingCardDismissed,
  setRatingCardDismissed: () => {
    set({ ratingCardDismissed: true });
    setItem(RATING_CARD_DISMISSED_KEY, 'true');
  },
  widgetTipSeen: initialWidgetTipSeen,
  setWidgetTipSeen: (v) => {
    set({ widgetTipSeen: v });
    if (v) { setItem(WIDGET_TIP_KEY, 'true'); } else { deleteItem(WIDGET_TIP_KEY); }
  },
  coursesView: initialCoursesView,
  setCoursesView: (v) => {
    set({ coursesView: v });
    setItem(COURSES_VIEW_KEY, v);
  },
  sidebarToolsOpen: initialToolsOpen,
  setSidebarToolsOpen: (v) => {
    set({ sidebarToolsOpen: v });
    setItem(TOOLS_OPEN_KEY, v ? 'true' : 'false');
  },
  sidebarCollapsed: initialSidebarCollapsed,
  setSidebarCollapsed: (v) => {
    set({ sidebarCollapsed: v });
    setItem(SIDEBAR_COLLAPSED_KEY, v ? 'true' : 'false');
  },
  tasksCompletedCount: initialTasksCompleted,
  incrementTasksCompleted: () => set((s) => {
    const next = s.tasksCompletedCount + 1;
    setItem(TASKS_COMPLETED_KEY, String(next));
    return { tasksCompletedCount: next };
  }),
  userName: initialUserName,
  setUserName: (v) => {
    set({ userName: v });
    if (v) { setItem(USER_NAME_KEY, v); } else { deleteItem(USER_NAME_KEY); }
  },
  defaultTerm: initialDefaultTerm,
  setDefaultTerm: (v) => {
    set({ defaultTerm: v });
    if (v) { setItem(DEFAULT_TERM_KEY, v); } else { deleteItem(DEFAULT_TERM_KEY); }
  },
  painPoint: initialPainPoint,
  setPainPoint: (v) => {
    set({ painPoint: v });
    if (v) { setItem(PAIN_POINT_KEY, v); } else { deleteItem(PAIN_POINT_KEY); }
  },
  resetUserState: () => {
    set({
      selectedSemesterId: null,
      isPro: false,
      subscriptionPlan: null,
      postSignupBanner: null,
      inPasswordReset: false,
      // Onboarding personalization is user-scoped — clear it so the next
      // account on this device isn't greeted with the previous user's name
      // or term. (hasOnboarded/ahaPaywallShown/hasImportedSyllabus/
      // reviewRequested stay:
      // those are genuinely device-level one-time flags.)
      userName: null,
      defaultTerm: null,
      painPoint: null,
    });
    deleteItem(SEMESTER_KEY);
    deleteItem(PRO_KEY);
    deleteItem(RESET_KEY);
    deleteItem(USER_NAME_KEY);
    deleteItem(DEFAULT_TERM_KEY);
    deleteItem(PAIN_POINT_KEY);
  },
}));

const GRADE_CHECK_WINDOW = 60; // days after semester ends where student may still check grades

/**
 * Infer the current academic period from today's date.
 * Returns a term name and year that can be matched against semester names.
 *
 * Standard US academic calendar:
 *  - Spring: January – April
 *  - Summer: May – July
 *  - Fall: August – December
 */
function getCurrentAcademicPeriod(): { terms: string[]; year: number } {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const year = now.getFullYear();

  if (month >= 7) return { terms: ['fall', 'autumn'], year };      // Aug-Dec
  if (month >= 4) return { terms: ['summer'], year };               // May-Jul
  return { terms: ['spring'], year };                                // Jan-Apr
}

/**
 * Score how well a semester name matches the current academic period.
 * Higher score = better match. 0 = no match.
 */
function scoreSemesterName(name: string, period: { terms: string[]; year: number }): number {
  const lower = name.toLowerCase();
  let score = 0;

  // Check if the name contains the current year
  if (lower.includes(String(period.year))) score += 10;

  // Check if the name contains the current term
  for (const term of period.terms) {
    if (lower.includes(term)) { score += 20; break; }
  }

  return score;
}

/**
 * Find the best semester to auto-select based on today's date.
 *
 * Priority:
 * 1. Exact match — today is between start_date and end_date
 * 2. Nearest by date proximity — with preference for recently-ended
 *    semester over distant future semester (grade checking window)
 * 3. Name-based inference — match semester name against current
 *    academic period (e.g., "Fall 2026" when it's fall)
 * 4. Last resort — most recently created
 */
export function findCurrentSemester(semesters: Semester[]): string | null {
  if (semesters.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Exact match: today is within a semester's date range
  for (const s of semesters) {
    if (s.start_date && s.end_date) {
      const start = new Date(s.start_date + 'T00:00:00');
      const end = new Date(s.end_date + 'T00:00:00');
      if (today >= start && today <= end) return s.id;
    }
    if (s.start_date && !s.end_date) {
      const start = new Date(s.start_date + 'T00:00:00');
      if (today >= start) return s.id;
    }
  }

  // 2. No exact match — find nearest by date proximity
  const withDates = semesters.filter((s) => s.start_date || s.end_date);

  if (withDates.length > 0) {
    const past: { semester: Semester; daysAgo: number }[] = [];
    const future: { semester: Semester; daysUntil: number }[] = [];

    for (const s of withDates) {
      if (s.end_date) {
        const end = new Date(s.end_date + 'T00:00:00');
        if (end < today) {
          past.push({ semester: s, daysAgo: differenceInDays(today, end) });
        }
      }
      if (s.start_date) {
        const start = new Date(s.start_date + 'T00:00:00');
        if (start > today) {
          future.push({ semester: s, daysUntil: differenceInDays(start, today) });
        }
      }
    }

    past.sort((a, b) => a.daysAgo - b.daysAgo);
    future.sort((a, b) => a.daysUntil - b.daysUntil);

    const nearestPast = past[0] || null;
    const nearestFuture = future[0] || null;

    if (!nearestFuture && nearestPast) return nearestPast.semester.id;
    if (!nearestPast && nearestFuture) return nearestFuture.semester.id;

    if (nearestPast && nearestFuture) {
      if (nearestPast.daysAgo <= GRADE_CHECK_WINDOW && nearestPast.daysAgo <= nearestFuture.daysUntil) {
        return nearestPast.semester.id;
      }
      if (nearestPast.daysAgo <= nearestFuture.daysUntil) {
        return nearestPast.semester.id;
      }
      return nearestFuture.semester.id;
    }
  }

  // 3. Name-based inference — match "Fall 2026", "Spring 2027" etc.
  const period = getCurrentAcademicPeriod();
  const scored = semesters
    .map((s) => ({ semester: s, score: scoreSemesterName(s.name, period) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) return scored[0].semester.id;

  // 4. Last resort — most recently created
  const sorted = [...semesters].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sorted[0].id;
}
