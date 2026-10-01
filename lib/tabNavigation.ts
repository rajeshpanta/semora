/**
 * The one way back to the tabs from anywhere outside them.
 *
 * WHY: `router.replace('/(tabs)')` (and `router.push('/scan')`) from a pushed
 * screen does not return to the tab navigator the student came from. expo-router
 * turns it into a REPLACE/PUSH on the root stack, and React Navigation adds a
 * brand-new '(tabs)' route on top of the old one. Finishing a syllabus import,
 * a Canvas connect, an invite or a sign-in each left another full tab navigator
 * stacked on the first — every copy mounted and live, an edge swipe on Today
 * revealing an older Today, and the stack growing by one per import.
 *
 * On iOS 26+ that shape is also what kills the native Back button: in
 * react-native-screens 4.16.0 a header-less screen that is not the bottom of the
 * stack (a second '(tabs)') leaves the Back button of the next pushed screen
 * disabled. Reproduced in Semora on simulators, 2026-10-01; see
 * tests/navigation/README.md.
 *
 * WHAT IT DOES (native): if the tab navigator is at the bottom of the root
 * stack — the normal case — everything above it is popped and the requested tab
 * is selected in THAT navigator, so nothing remounts and no copy is made. If it
 * is not (a cold sign-in, a screen opened with nothing beneath it), the root
 * stack is reset to a single '(tabs)' route. After a sign-in (`resetToTabs`)
 * the reset is always used, so the new account never inherits the previous
 * account's mounted tabs.
 *
 * WEB is deliberately untouched: the browser's history is its own, and the web
 * app never showed this bug. `web` names the call the site made before this
 * helper existed, so the web build keeps doing exactly that.
 *
 * tests/navigation/router-state runs every call site through this against the
 * real expo-router; tests/navigation/router-state/callsites.cjs lists them.
 */
import {
  CommonActions,
  StackActions,
  TabActions,
  type NavigationAction,
  type NavigationState,
} from '@react-navigation/native';
import { router, type Href } from 'expo-router';
import { Platform } from 'react-native';

/** The tabs in app/(tabs)/_layout.tsx, by route name. */
export type TabRoute = 'index' | 'calendar' | 'scan' | 'courses' | 'me';

const TABS = '(tabs)';

type ContainerRef = {
  isReady(): boolean;
  getRootState(): NavigationState;
  dispatch(action: NavigationAction): void;
};

let container: ContainerRef | null = null;

/**
 * Hands the helper expo-router's navigation container. Called by the root
 * layout on every render with `useNavigationContainerRef()`, which is the same
 * stable object each time.
 */
export function bindTabNavigation(ref: ContainerRef): void {
  container = ref;
}

/** The app's root Stack (app/_layout.tsx), or undefined before it has mounted. */
function rootStack(): NavigationState | undefined {
  if (!container || !container.isReady()) return undefined;
  const root = container.getRootState();
  // expo-router wraps the app in an internal '__root' route; the app's own
  // Stack is the state one level down.
  const stack = root?.routes?.[root.index ?? 0]?.state as NavigationState | undefined;
  return stack && stack.type === 'stack' && stack.key ? stack : undefined;
}

/**
 * Back to the tabs from a screen outside them, keeping the tab navigator that
 * is already there (its screens keep their state; nothing remounts).
 *
 * Use it on its own: it acts on the navigator immediately, while other
 * `router.*` calls are queued and resolved later, so a router call in the same
 * handler can run in the wrong order or target a stack that no longer exists.
 * No call site does that today.
 */
export function returnToTabs(tab: TabRoute = 'index', web: 'replace' | 'push' = 'replace'): void {
  if (Platform.OS === 'web' || !returnNatively(tab, false)) previousCall(tab, web);
}

/**
 * Back to the tabs after a sign-in: still exactly one tab navigator, but always
 * a fresh one. The tabs that were underneath belong to whoever was signed in
 * before (screens such as Me load their data once, on mount), so they must not
 * be reused for the account that has just signed in.
 */
export function resetToTabs(tab: TabRoute = 'index'): void {
  if (Platform.OS === 'web' || !returnNatively(tab, true)) previousCall(tab, 'replace');
}

/** What the call sites did before this helper existed (and still do on web). */
function previousCall(tab: TabRoute, web: 'replace' | 'push'): void {
  if (web === 'push') router.push((tab === 'index' ? '/' : `/${tab}`) as Href);
  else router.replace((tab === 'index' ? '/(tabs)' : `/(tabs)/${tab}`) as Href);
}

/** false when the navigator has not mounted yet (nothing to return to or duplicate). */
function returnNatively(tab: TabRoute, fresh: boolean): boolean {
  const stack = rootStack();
  if (!container || !stack) return false;

  const bottom = stack.routes[0];
  const tabsKey = bottom?.name === TABS ? (bottom.state as NavigationState | undefined)?.key : undefined;
  if (tabsKey && !fresh) {
    if (stack.routes.length > 1) {
      container.dispatch({ ...StackActions.popToTop(), target: stack.key });
    }
    container.dispatch({ ...TabActions.jumpTo(tab), target: tabsKey });
    return true;
  }

  container.dispatch({
    ...CommonActions.reset({ index: 0, routes: [{ name: TABS, params: { screen: tab } }] }),
    target: stack.key,
  });
  return true;
}
