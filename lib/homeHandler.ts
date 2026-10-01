/**
 * "Go home" for app/+native-intent.tsx while the app is running.
 *
 * A semoraai.com link that is not a share link goes to Today. Returning '/'
 * from redirectSystemPath lets expo-router navigate there itself, which pops
 * to the tab navigator when one is at the bottom of the stack, but pushes a
 * new one on top when there is none (a resumed /join after sign-in gives
 * [join, (tabs)]; the sign-in screen gives [(auth), (auth)] once AuthGate
 * sends the student back). lib/tabNavigation.ts returnToTabs handles both.
 *
 * +native-intent cannot import lib/tabNavigation.ts: lib/shareLinks.test.ts
 * loads it in Deno, whose import map has no expo-router or React Navigation.
 * So this file has no imports. app/_layout.tsx registers returnToTabs here
 * once the navigator exists; until then nothing is registered and the
 * redirect keeps returning '/'.
 */
let handler: (() => boolean) | null = null;

export function setHomeHandler(fn: (() => boolean) | null): void {
  handler = fn;
}

/** True when Today was shown; false when nothing is registered or it threw. */
export function goHomeInPlace(): boolean {
  try {
    return handler ? handler() === true : false;
  } catch {
    return false;
  }
}
