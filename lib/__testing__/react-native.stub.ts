/**
 * Minimal react-native stand-in, for Deno tests only.
 *
 * lib/constants.ts imports `Platform` to pick store URLs, so any Deno test
 * that reaches the grade engine has to resolve `react-native` — a module that
 * only exists inside the Metro bundle. Nothing under test reads these values;
 * they exist so the import resolves.
 *
 * Referenced only from lib/deno.test.json. Metro never sees this file.
 */
export const Platform = {
  OS: 'ios' as const,
  select: <T,>(specifics: { ios?: T; android?: T; web?: T; default?: T }): T | undefined =>
    specifics.ios ?? specifics.default,
};
