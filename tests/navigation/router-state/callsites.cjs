#!/usr/bin/env node
'use strict';
// Call-site inventory for "return to the tabs" (Priority 2 verification).
//
//   node tests/navigation/router-state/callsites.cjs            # report
//   node tests/navigation/router-state/callsites.cjs --strict   # exit 1 unless every site uses the helper
//
// Part A: every audited call site, and how many returnToTabs(<tab>) /
//         resetToTabs(<tab>) calls its file must contain once converted.
// Part B: a scan of app/, components/ and lib/ for any navigation that still
//         targets a tab path directly, outside the places where that is a plain
//         tab switch (inside the tab navigator) or desktop-web-only UI.
const fs = require('node:fs');
const path = require('node:path');
const REPO = path.resolve(__dirname, '../../..');
const strict = process.argv.includes('--strict');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

// Part A ----------------------------------------------------------------------
const SITES = [
  { file: 'app/syllabus/added.tsx', helper: { index: 2, scan: 1 }, what: "goScan 'Add another class', goCourse fallback, goHome 'Done for now'" },
  { file: 'app/syllabus/review.tsx', helper: { index: 1 }, what: "partial-save alert 'Go Home'" },
  { file: 'app/settings/lms-connect.tsx', helper: { index: 1, scan: 2 }, what: "'See my deadlines', dead-end alert 'Scan a syllabus', Blackboard 'Scan a syllabus instead'" },
  { file: 'app/settings/lms.tsx', helper: { scan: 1 }, what: "Blackboard 'No token? Scan a syllabus instead'" },
  { file: 'components/MoodleGuidedPaste.tsx', helper: { scan: 1 }, what: "'Scan a syllabus instead'" },
  { file: 'app/paywall.tsx', helper: { index: 2 }, what: 'post-scan close without a course; close with nothing to go back to' },
  { file: 'app/invite.tsx', helper: { index: 3 }, what: "'Start using Pro'; two closes with nothing to go back to" },
  { file: 'app/join.tsx', helper: { index: 2 }, what: 'signed-out redirect; close with nothing to go back to' },
  { file: 'app/share-semester.tsx', helper: { index: 1 }, what: 'close with nothing to go back to' },
  { file: 'app/_layout.tsx', helper: { index: 3 }, what: 'AuthGate after sign-in (resetToTabs: fresh tabs for the new account); unknown-notification fallback; home handler for +native-intent', also: [/bindTabNavigation\(/, /resetToTabs\(\)/, /setHomeHandler\(\(\) => \{ returnToTabs\(\); return true; \}\)/] },
  { file: 'app/+native-intent.tsx', helper: {}, what: "a semoraai.com link that is not a share link, while the app runs: home in place", also: [/if \(to === '\/' && !initial && goHomeInPlace\(\)\) return '';/] },
  { file: 'app/+not-found.tsx', helper: { index: 1 }, what: "'Go to home screen!'" },
];

// Part B ----------------------------------------------------------------------
const TAB_PATH = String.raw`\/(?:\(tabs\)(?:\/(?:index|calendar|scan|courses|me))?|scan|calendar|courses|me)?`;
const RAW = [
  new RegExp(String.raw`\b(?:router|globalRouter|r)\.(?:replace|push|navigate|dismissTo)\(\s*(['"\`])${TAB_PATH}\1`),
  new RegExp(String.raw`pathname:\s*(['"\`])${TAB_PATH}\1`),
  /<Link\s+href=["']\/["'](?![^>]*onPress)/, // a Link to '/' that does not hand native presses to the helper
  /globalRouter\.replace\(route\.path/,
];
const ALLOW = [
  /^app\/\(tabs\)\//,               // inside the tab navigator: a tab switch, not a new route
  /^components\/PlusMenu\.tsx$/,     // opened from the tab bar: a tab switch
  /^components\/WebAppFrame\.tsx$/,  // desktop web only
  /^components\/CommandPalette\.tsx$/, // desktop web only
  /^lib\/tabNavigation\.ts$/,        // the helpers themselves
  /\.test\.tsx?$/,
];
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(tsx?|jsx?)$/.test(e.name)) out.push(rel);
  }
  return out;
}

let bad = 0;
console.log('Part A - audited call sites');
for (const s of SITES) {
  const src = read(s.file);
  const got = {};
  for (const m of src.matchAll(/(?:returnToTabs|resetToTabs)\(\s*(?:'([a-z]+)')?\s*(?:,\s*'(?:replace|push)'\s*)?\)/g)) { const t = m[1] || 'index'; got[t] = (got[t] || 0) + 1; }
  const want = s.helper;
  const ok = Object.keys(want).every((t) => got[t] === want[t]) && Object.keys(got).every((t) => want[t]) && (s.also || []).every((re) => re.test(src));
  if (!ok) bad++;
  console.log(`  ${ok ? 'CONVERTED' : 'NOT YET  '}  ${s.file.padEnd(36)} want ${JSON.stringify(want)} got ${JSON.stringify(got)}  (${s.what})`);
}
console.log('\nPart B - direct navigation to a tab path outside the allowlist');
let raw = 0;
for (const f of [...walk('app'), ...walk('components'), ...walk('lib')]) {
  if (ALLOW.some((re) => re.test(f))) continue;
  read(f).split('\n').forEach((line, i) => {
    if (RAW.some((re) => re.test(line))) { raw++; console.log(`  ${f}:${i + 1}  ${line.trim().slice(0, 110)}`); }
  });
}
if (!raw) console.log('  none');
console.log(`\n${bad === 0 && raw === 0 ? 'OK' : 'NOT CLEAN'}: ${bad} site file(s) not converted, ${raw} direct tab navigation(s) left`);
process.exit(strict && (bad || raw) ? 1 : 0);
