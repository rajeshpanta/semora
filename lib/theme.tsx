import { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useAppStore, type ThemeMode } from '@/store/appStore';
import { COLORS } from '@/lib/constants';

// ── Dark palette ────────────────────────────────────────────
// Mirrors COLORS structure so they're interchangeable
const DARK_COLORS = {
  brand: '#9B7AE8',
  brand50: '#1E1A2E',
  brand100: '#3D3566',
  paper: '#121214',
  card: '#1C1C1E',
  ink: '#E8E6E3',
  ink2: '#A0A0A7',
  ink3: '#6C6C74',
  line: 'rgba(255,255,255,0.1)',
  coral: '#E8734D',
  coral50: '#2D1A14',
  teal: '#34D399',
  teal50: '#0D2A20',
  blue: '#5B9FE4',
  blue50: '#152030',
  amber: '#E09B3E',
  amber50: '#2A2010',
} as const;

// ── Text-on-tint and white-text-fill tokens ─────────────────
// The tone colours (coral, amber) are 3.2–3.4:1 on their own 50-tints and on
// paper in light mode, and white on them is 2.4–3.9:1 — under WCAG AA's 4.5:1
// for the 11–15px text the lecture screens set in them. These are the same
// hues, pushed far enough to clear AA (measured: every pair here is ≥ 5.3:1
// on paper, card and the matching 50-tint in its theme; the fills are ≥ 6.2:1
// with white in both themes). Use `coralText`/`amberText` for text on a tint
// or on paper, and `coralFill`/`amberFill`/`pausedFill` behind white text.
// The tone colours themselves stay for icons, dots and borders.
const LIGHT_TEXT_TOKENS = {
  coralText: '#A83F1B',
  amberText: '#875410',
  coralFill: '#A83F1B',
  amberFill: '#875410',
  pausedFill: '#4E4E56',
} as const;
const DARK_TEXT_TOKENS = {
  coralText: '#EE8A63',
  amberText: '#EDAD4C',
  coralFill: '#A83F1B',
  amberFill: '#875410',
  pausedFill: '#4E4E56',
} as const;

const LIGHT_PALETTE = { ...COLORS, ...LIGHT_TEXT_TOKENS } as const;
const DARK_PALETTE = { ...DARK_COLORS, ...DARK_TEXT_TOKENS } as const;

export type ColorPalette = typeof LIGHT_PALETTE;

// ── Context ─────────────────────────────────────────────────

const ThemeColorsContext = createContext<ColorPalette>(LIGHT_PALETTE);

/**
 * Returns the current color palette (light or dark).
 * Must be used inside ThemeColorsProvider.
 */
export function useColors(): ColorPalette {
  return useContext(ThemeColorsContext);
}

/**
 * Resolves the effective color scheme from themeMode + system preference.
 */
export function useResolvedScheme(): 'light' | 'dark' {
  const themeMode = useAppStore((s) => s.themeMode);
  const systemScheme = useColorScheme();

  if (themeMode === 'light') return 'light';
  if (themeMode === 'dark') return 'dark';
  return systemScheme ?? 'light'; // system
}

/**
 * Wraps children with the resolved color palette.
 */
export function ThemeColorsProvider({ children }: { children: React.ReactNode }) {
  const scheme = useResolvedScheme();
  const colors = useMemo(
    () => (scheme === 'dark' ? DARK_PALETTE : LIGHT_PALETTE) as ColorPalette,
    [scheme],
  );

  return (
    <ThemeColorsContext.Provider value={colors}>
      {children}
    </ThemeColorsContext.Provider>
  );
}
