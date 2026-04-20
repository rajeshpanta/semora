import { create } from 'zustand';
import { differenceInDays } from 'date-fns';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { Semester } from '@/types/database';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_KEY = 'syllabussnap_theme';
const SEMESTER_KEY = 'syllabussnap_semester';

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

interface AppState {
  selectedSemesterId: string | null;
  setSelectedSemester: (id: string | null) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  isPro: boolean;
  setIsPro: (value: boolean) => void;
  subscriptionPlan: 'annual' | 'monthly' | null;
  setSubscriptionPlan: (plan: 'annual' | 'monthly' | null) => void;
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
  isPro: false,
  setIsPro: (value) => set({ isPro: value }),
  subscriptionPlan: null,
  setSubscriptionPlan: (plan) => set({ subscriptionPlan: plan }),
}));

const GRADE_CHECK_WINDOW = 60; // days after semester ends where student may still check grades

/**
 * Find the best semester to auto-select based on today's date.
 *
 * Priority:
 * 1. Exact match — today is between start_date and end_date
 * 2. Nearest by date proximity — with preference for recently-ended
 *    semester over distant future semester (grade checking window)
 * 3. Semesters without dates — most recently created (last resort)
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
    // If only start_date and no end_date, treat as possibly current
    if (s.start_date && !s.end_date) {
      const start = new Date(s.start_date + 'T00:00:00');
      if (today >= start) return s.id;
    }
  }

  // 2. No exact match — find nearest by date proximity
  const withDates = semesters.filter((s) => s.start_date || s.end_date);

  if (withDates.length > 0) {
    // Categorize semesters
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

    // Sort: most recently ended first, soonest starting first
    past.sort((a, b) => a.daysAgo - b.daysAgo);
    future.sort((a, b) => a.daysUntil - b.daysUntil);

    const nearestPast = past[0] || null;
    const nearestFuture = future[0] || null;

    // No future semester → use most recently ended (checking grades)
    if (!nearestFuture && nearestPast) {
      return nearestPast.semester.id;
    }

    // No past semester → use soonest future (prep mode)
    if (!nearestPast && nearestFuture) {
      return nearestFuture.semester.id;
    }

    // Both exist — decide based on grade checking window
    if (nearestPast && nearestFuture) {
      // If past semester ended within 60 days AND it's closer than the future one
      // → student is likely still checking grades
      if (nearestPast.daysAgo <= GRADE_CHECK_WINDOW && nearestPast.daysAgo <= nearestFuture.daysUntil) {
        return nearestPast.semester.id;
      }
      // Otherwise pick the nearest one by raw distance
      if (nearestPast.daysAgo <= nearestFuture.daysUntil) {
        return nearestPast.semester.id;
      }
      return nearestFuture.semester.id;
    }
  }

  // 3. No semesters have dates — fall back to most recently created
  const sorted = [...semesters].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sorted[0].id;
}
