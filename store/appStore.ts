import { create } from 'zustand';
import { differenceInDays } from 'date-fns';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Semester } from '@/types/database';

export type ThemeMode = 'system' | 'light' | 'dark';
// The struggle the user picked in onboarding — used to tailor the auth
// wall and (later) paywall copy to their own words.
export type PainPoint = 'deadlines' | 'planning' | 'grades';

const THEME_KEY = 'semora_theme';
const SEMESTER_KEY = 'semora_semester';
const RESET_KEY = 'semora_reset_in_progress';
// Device-level one-time flags. Unlike the keys above these are NOT
// user-scoped — onboarding, the post-scan reverse-trial paywall, and the
// rating prompt should each happen once per device, not once per account.
const ONBOARDED_KEY = 'semora_onboarded';
const AHA_PAYWALL_KEY = 'semora_aha_paywall';
const REVIEW_REQUESTED_KEY = 'semora_review_requested';
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
  if (Platform.OS === 'web') return null;
  try { return SecureStore.getItem(key); } catch { return null; }
}

function setItem(key: string, value: string) {
  if (Platform.OS === 'web') return;
  try { SecureStore.setItem(key, value); } catch {}
}

// Load initial values synchronously so there's no flash
const initialTheme = (() => {
  const stored = getItem(THEME_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system' as ThemeMode;
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
const initialReviewRequested = getItem(REVIEW_REQUESTED_KEY) === 'true';
const initialUserName = getItem(USER_NAME_KEY);
const initialDefaultTerm = getItem(DEFAULT_TERM_KEY);
const initialPainPoint = getItem(PAIN_POINT_KEY) as PainPoint | null;

interface AppState {
  selectedSemesterId: string | null;
  setSelectedSemester: (id: string | null) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
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
  reviewRequested: boolean;
  setReviewRequested: (v: boolean) => void;
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
  if (Platform.OS === 'web') return;
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
  reviewRequested: initialReviewRequested,
  setReviewRequested: (v) => {
    set({ reviewRequested: v });
    if (v) { setItem(REVIEW_REQUESTED_KEY, 'true'); } else { deleteItem(REVIEW_REQUESTED_KEY); }
  },
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
      // or term. (hasOnboarded/ahaPaywallShown/reviewRequested stay:
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
