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

export type ColorPalette = typeof COLORS;

// ── Context ─────────────────────────────────────────────────

const ThemeColorsContext = createContext<ColorPalette>(COLORS);

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
    () => (scheme === 'dark' ? DARK_COLORS : COLORS) as ColorPalette,
    [scheme],
  );

  return (
    <ThemeColorsContext.Provider value={colors}>
      {children}
    </ThemeColorsContext.Provider>
  );
}
