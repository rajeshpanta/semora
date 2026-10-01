'use strict';
// Mounts the REAL expo-router ExpoRoot (real store, real linkTo, real Stack/Tabs
// layouts with their router overrides, real @react-navigation/core state machine)
// over the app's REAL route tree (file list read from app/), headless, with the
// REAL app/+native-intent.tsx handed to expo-router the way it is in the app.
//
// NAV_MODE selects what a "return to the tabs" call site does:
//   legacy - the raw expo-router call the call site made before Priority 2
//            (documents the duplicate-tabs behaviour),
//   helper - lib/tabNavigation.ts returnToTabs(), the real app helper, and the
//            home handler app/_layout.tsx registers for +native-intent.
const H = require('./hooks.cjs');
const dom = require('./fakedom.cjs');
const fs = require('node:fs');
const path = require('node:path');
const React = H.repoRequire('react');
const ReactDOM = H.repoRequire('react-dom/client');
const h = React.createElement;

const { ExpoRoot } = require(H.ER + 'ExpoRoot.js');
const { Stack } = require(H.ER + 'layouts/Stack.js');
const { Tabs } = require(H.ER + 'layouts/Tabs.js');
const { router } = require(H.ER + 'imperative-api.js');
const routing = require(H.ER + 'global-state/routing.js');
const { store } = require(H.ER + 'global-state/router-store.js');
const hooks = require(H.ER + 'hooks.js');
const core = H.repoRequire('@react-navigation/core');

const MODE = process.env.NAV_MODE === 'helper' ? 'helper' : 'legacy';
const tabNav = MODE === 'helper' ? require(path.join(H.REPO, 'lib/tabNavigation.ts')) : null;
const homeHandler = MODE === 'helper' ? require(path.join(H.REPO, 'lib/homeHandler.ts')) : null;
const APP = path.join(H.REPO, 'app');

// ---- real file list --------------------------------------------------------
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|js|jsx)$/.test(e.name)) out.push('./' + path.relative(APP, p));
  }
  return out.sort();
}
const files = walk(APP);

// ---- screen lists and options read from the real layout files --------------
const rootLayoutSrc = fs.readFileSync(path.join(APP, '_layout.tsx'), 'utf8');
const rootScreens = [];
{
  const stackBlock = rootLayoutSrc.slice(rootLayoutSrc.indexOf('<Stack\n'), rootLayoutSrc.indexOf('</Stack>'));
  // settings/lms-connect's options are a function that only builds the title: read as {}.
  const re = /<Stack\.Screen\s+name="([^"]+)"\s*(?:\n\s*)?(?:options=\{\{([^}]*)\}\}|options=\{\()/g;
  let m;
  while ((m = re.exec(stackBlock))) {
    const o = m[2] || '';
    rootScreens.push({
      name: m[1],
      options: {
        headerShown: /headerShown:\s*false/.test(o) ? false : undefined,
        presentation: (o.match(/presentation:\s*'([^']+)'/) || [])[1],
        gestureEnabled: /gestureEnabled:\s*false/.test(o) ? false : undefined,
      },
    });
  }
}
const tabsLayoutSrc = fs.readFileSync(path.join(APP, '(tabs)/_layout.tsx'), 'utf8');
const tabScreens = [...tabsLayoutSrc.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
const authLayoutSrc = fs.readFileSync(path.join(APP, '(auth)/_layout.tsx'), 'utf8');
const authScreens = [...authLayoutSrc.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map((m) => m[1]);
const unstable = (rootLayoutSrc.match(/export const unstable_settings = \{\s*initialRouteName:\s*'([^']+)'/) || [])[1];

// ---- controllable app state (stands in for the session and the zustand store) ----
const ext = {
  s: { locale: 'en', authGate: false, loading: false, session: true, hasOnboarded: true, inPasswordReset: false, pendingCollaboration: null, pendingShare: null, recordingPhase: 'idle' },
  subs: new Set(),
  set(patch) { ext.s = { ...ext.s, ...patch }; ext.subs.forEach((f) => f()); },
  subscribe(f) { ext.subs.add(f); return () => ext.subs.delete(f); },
  get() { return ext.s; },
};
const useExt = () => React.useSyncExternalStore(ext.subscribe, ext.get, ext.get);

// ---- "return to the tabs": legacy call vs the real helper -------------------
function toTabs(tab, legacy, opts = {}) {
  if (MODE === 'helper') return opts.fresh ? tabNav.resetToTabs(tab) : tabNav.returnToTabs(tab);
  return legacy();
}

// ---- leaf screens record mounts --------------------------------------------
const mounted = new Map();
function Leaf(label) {
  return function LeafScreen() {
    const route = core.useRoute();
    React.useEffect(() => {
      mounted.set(route.key, label);
      return () => { mounted.delete(route.key); };
    }, [route.key]);
    return null;
  };
}

// ---- AuthGate: decision logic transcribed from app/_layout.tsx AuthGate (native branch) ----
// Keep in step with the real component; callsites.cjs checks the post-sign-in
// line uses the helper so the transcription and the app cannot silently diverge there.
const authGateLog = [];
function AuthGate({ children }) {
  const st = useExt();
  const segments = hooks.useSegments();
  const r = hooks.useRouter();
  const { session, loading, inPasswordReset, hasOnboarded, recordingPhase } = st;
  React.useEffect(() => {
    if (!st.authGate) return;
    if (loading) return;
    if (!session && recordingPhase !== 'idle') return;
    if (inPasswordReset) {
      if (!session) { ext.set({ inPasswordReset: false }); return; }
      const onResetScreen = segments[0] === '(auth)' && segments[1] === 'reset-password';
      if (!onResetScreen) { authGateLog.push("replace('/(auth)/reset-password')"); r.replace('/(auth)/reset-password'); }
      return;
    }
    const inAuthGroup = segments[0] === '(auth)';
    const onOnboarding = segments[0] === 'onboarding';
    const onWelcome = segments[0] === 'welcome';
    if (!session) {
      if (!hasOnboarded) {
        if (!onOnboarding) { authGateLog.push("replace('/onboarding')"); r.replace('/onboarding'); }
      } else if (!inAuthGroup) {
        authGateLog.push("replace('/(auth)/sign-in')"); r.replace('/(auth)/sign-in');
      }
    } else if (session && (inAuthGroup || onOnboarding || onWelcome)) {
      const pc = ext.s.pendingCollaboration, ps = ext.s.pendingShare;
      if (pc) { authGateLog.push("replace('/collaborate')"); r.replace({ pathname: '/collaborate', params: { token: pc } }); }
      else if (ps) { authGateLog.push("replace('/join')"); r.replace({ pathname: '/join', params: { token: ps } }); }
      else { authGateLog.push('to tabs (post sign-in)'); toTabs('index', () => r.replace('/(tabs)'), { fresh: true }); }
    }
  }, [session, loading, segments, inPasswordReset, hasOnboarded, recordingPhase, st.authGate]);
  if (st.authGate && loading) return null;
  return children;
}

function RootLayout() {
  const st = useExt();
  // Mirrors RootLayoutNav in app/_layout.tsx: the helper is bound to expo-router's container ref.
  const ref = hooks.useNavigationContainerRef();
  if (tabNav) tabNav.bindTabNavigation(ref);
  if (homeHandler) homeHandler.setHomeHandler(() => { tabNav.returnToTabs(); return true; });
  return h(AuthGate, null,
    h(Stack, { key: st.locale, screenOptions: { headerBackTitle: 'Back' } },
      ...rootScreens.map((s) => h(Stack.Screen, { key: s.name, name: s.name, options: s.options }))));
}
function TabLayout() {
  return h(Tabs, { screenOptions: { headerShown: false } },
    ...tabScreens.map((n) => h(Tabs.Screen, { key: n, name: n, options: { title: n } })));
}
function AuthLayout() {
  return h(Stack, { screenOptions: { headerShown: false } }, ...authScreens.map((n) => h(Stack.Screen, { key: n, name: n })));
}

// expo-router never mounts +native-intent as a route; getLinkingConfig takes the
// module from the same require.context and calls its redirectSystemPath for the
// launch URL and every URL after it. Hand it the real module, recording each call.
const intentLog = [];
function nativeIntent(file) {
  const mod = require(path.join(APP, file));
  return { ...mod, redirectSystemPath: (a) => {
    try { const r = mod.redirectSystemPath(a); intentLog.push({ ...a, returned: r }); return r; }
    catch (e) { intentLog.push({ ...a, threw: String(e) }); throw e; }
  } };
}
const modules = {};
for (const f of files) {
  if (f === './_layout.tsx') modules[f] = { default: RootLayout, unstable_settings: unstable ? { initialRouteName: unstable } : undefined };
  else if (f === './(tabs)/_layout.tsx') modules[f] = { default: TabLayout };
  else if (f === './(auth)/_layout.tsx') modules[f] = { default: AuthLayout };
  else if (/^\.\/\+native-intent\.[tj]sx?$/.test(f)) modules[f] = nativeIntent(f);
  else modules[f] = { default: Leaf(f) };
}
const context = Object.assign((id) => modules[id], { keys: () => files, resolve: (k) => k, id: '0' });

let root;
async function boot(patch = {}) {
  ext.s = { ...ext.s, ...patch };
  root = ReactDOM.createRoot(dom.makeContainer());
  await React.act(async () => { root.render(h(ExpoRoot, { context })); });
  await React.act(async () => { await new Promise((r) => setTimeout(r, 5)); });
}
async function act(fn) {
  await React.act(async () => { await fn(); });
  await React.act(async () => { await new Promise((r) => setTimeout(r, 5)); });
}
const emitUrl = async (url) => { for (const cb of globalThis.__NAVSIM_URL_LISTENERS__ || []) await cb({ url }); };

function rootState() { return store.navigationRef.current.getRootState(); }
// expo-router wraps the app in an internal '__root' route; the app's Stack is one level down.
function appStack() { const s = rootState(); return s.routes[s.index].state; }
function focusedTab(route) {
  const st = route && route.state;
  if (st && st.type === 'tab') return st.routes[st.index].name;
  if (route && route.params && route.params.screen) return route.params.screen;
  return 'index';
}
function describeRoute(r) {
  let s = r.name;
  if (r.state && r.state.type === 'tab') s += `<tab:${r.state.routes[r.state.index]?.name}>`;
  else if (r.state && r.state.routes) s += `<${r.state.routes.map((x) => x.name).join('>')}>`;
  return s;
}
function snap() {
  const s = appStack();
  if (!s) return '(app stack not mounted)';
  return '[' + s.routes.map(describeRoute).join(', ') + ']';
}
function info() {
  const s = appStack();
  return {
    names: s.routes.map((r) => r.name),
    keys: s.routes.map((r) => r.key),
    index: s.index,
    tabsCount: s.routes.filter((r) => r.name === '(tabs)').length,
    top: s.routes[s.index],
    bottom: s.routes[0],
  };
}

module.exports = { MODE, H, React, router, routing, store, hooks, core, ext, boot, act, emitUrl, rootState, appStack, snap, info, focusedTab, toTabs, mounted, authGateLog, intentLog, rootScreens, tabScreens, authScreens, unstable, files };
