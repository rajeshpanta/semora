'use strict';
// Resolution hooks for the headless router harness:
//   1. swap native/view-only packages for stubs (no native views exist in node),
//   2. emulate Metro's .ios.js/.native.js platform resolution,
//   3. compile the JSX left in expo-router/build,
//   4. load the app's own TypeScript from lib/ (so the REAL helper is tested),
//      resolving the '@/' alias the way tsconfig/Metro do.
// Everything else - expo-router's store, linkTo, routers, React Navigation core -
// is the installed code, unmodified.
const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL, fileURLToPath } = require('node:url');

const HERE = __dirname;
const REPO = path.resolve(HERE, '../../../..');
const NM = path.join(REPO, 'node_modules');
const S = (f) => pathToFileURL(path.join(HERE, 'stubs', f)).href;

process.env.NODE_ENV = process.env.NODE_ENV || 'development';
globalThis.__DEV__ = true;
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const repoReq = Module.createRequire(path.join(REPO, 'package.json'));
const sucrase = repoReq('sucrase');

const BARE = {
  'react-native': S('react-native.cjs'),
  'react-native-safe-area-context': S('safe-area.cjs'),
  '@react-navigation/native-stack': S('native-stack.cjs'),
  // The REAL createBottomTabNavigator (it runs TabRouter); only its view is swapped below.
  '@react-navigation/bottom-tabs': pathToFileURL(path.join(NM, '@react-navigation/bottom-tabs/lib/module/navigators/createBottomTabNavigator.js')).href,
  'expo-constants': S('expo-constants.cjs'),
  'expo-linking': S('expo-linking.cjs'),
  'expo-modules-core': S('expo-modules-core.cjs'),
  'expo/dom': S('expo-dom.cjs'),
  'react-native-screens': S('generic.cjs'),
  'expo-splash-screen': S('generic.cjs'),
  'expo-status-bar': S('generic.cjs'),
  'react-native-is-edge-to-edge': S('generic.cjs'),
};
const ER = path.join(NM, 'expo-router/build') + '/';
const PATH_STUBS = new Set([
  'views/Sitemap.js', 'views/Unmatched.js', 'utils/statusbar.js', 'views/Splash.js',
  'domComponents/useDomComponentNavigation.js', 'native-tabs/NativeBottomTabs/NativeTabTrigger.js',
  'views/Toast.js', 'link/Link.js', 'onboard/Tutorial.js',
].map((p) => ER + p));
const APP_SRC = [path.join(REPO, 'lib') + '/', path.join(REPO, 'components') + '/'];
const isAppSource = (p) => APP_SRC.some((d) => p.startsWith(d));

function tryFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function resolveAlias(spec) {
  const base = path.join(REPO, spec.slice(2));
  for (const c of [base, base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) if (tryFile(c)) return c;
  return null;
}

Module.registerHooks({
  resolve(specifier, context, nextResolve) {
    const parent = context.parentURL && context.parentURL.startsWith('file:') ? fileURLToPath(context.parentURL) : null;
    if (specifier === 'expo-router' && parent && isAppSource(parent)) {
      return { url: S('expo-router-shim.cjs'), shortCircuit: true };
    }
    if (specifier.startsWith('@/')) {
      const p = resolveAlias(specifier);
      if (p) return { url: pathToFileURL(p).href, shortCircuit: true };
    }
    if (Object.prototype.hasOwnProperty.call(BARE, specifier)) {
      return { url: BARE[specifier], shortCircuit: true };
    }
    if (parent && parent.endsWith('/bottom-tabs/lib/module/navigators/createBottomTabNavigator.js') && specifier === '../views/BottomTabView.js') {
      return { url: S('BottomTabView.mjs'), shortCircuit: true };
    }
    // Bare imports from harness files and from app source resolve against the repo.
    if (parent && (parent.startsWith(path.dirname(HERE)) || isAppSource(parent)) && !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:') && !specifier.startsWith('file:') && !Module.builtinModules.includes(specifier)) {
      const abs = repoReq.resolve(specifier);
      try { return nextResolve(abs, context); } catch { return nextResolve(pathToFileURL(abs).href, context); }
    }
    if (parent && specifier.startsWith('.')) {
      // Metro-style platform resolution for relative imports.
      const resolvedBase = path.resolve(path.dirname(parent), specifier);
      const stem = resolvedBase.replace(/\.js$/, '');
      for (const cand of [stem + '.ios.js', stem + '.native.js', stem + '.js', stem + '.ts', path.join(stem, 'index.ios.js'), path.join(stem, 'index.native.js'), path.join(stem, 'index.js')]) {
        if (tryFile(cand)) {
          if (PATH_STUBS.has(cand)) return { url: S('er-views.cjs'), shortCircuit: true };
          try { return nextResolve(cand, context); } catch { return nextResolve(pathToFileURL(cand).href, context); }
        }
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (!url.startsWith('file:')) return nextLoad(url, context);
    const file = fileURLToPath(url);
    if (file.includes('/node_modules/expo-router/build/') && file.endsWith('.js')) {
      const src = fs.readFileSync(file, 'utf8');
      let code = src;
      try { code = sucrase.transform(src, { transforms: ['jsx'], jsxRuntime: 'classic', production: true, filePath: file }).code; } catch { code = src; }
      return { format: 'commonjs', source: code, shortCircuit: true };
    }
    if (isAppSource(file) && /\.tsx?$/.test(file)) {
      const src = fs.readFileSync(file, 'utf8');
      const code = sucrase.transform(src, { transforms: ['typescript', 'imports', 'jsx'], jsxRuntime: 'classic', production: true, filePath: file }).code;
      return { format: 'commonjs', source: code, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

globalThis.React = repoReq('react');
module.exports = { REPO, NM, ER, repoRequire: repoReq };
