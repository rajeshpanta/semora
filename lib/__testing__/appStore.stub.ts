/**
 * Zustand store stand-in, for Deno tests only.
 *
 * lib/i18n.ts reads the language preference from the store at module scope, so
 * any Deno test that touches translate() has to resolve '@/store/appStore'.
 * Nothing under test reads these values — translate() takes an explicit locale.
 *
 * Referenced only from lib/deno.test.json. Metro never sees this file.
 */
export type AppLanguagePreference = 'system' | 'en' | 'es';

const state = { languagePreference: 'system' as AppLanguagePreference, setLanguagePreference: () => {} };

export const useAppStore = Object.assign(
  <T,>(selector: (s: typeof state) => T): T => selector(state),
  { getState: () => state },
);
