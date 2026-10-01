#!/usr/bin/env node
'use strict';
// Router-state regression test: every way Semora returns to the tabs, run
// against the REAL expo-router + React Navigation state machine.
//
//   node tests/navigation/router-state/run.cjs                # both modes
//   node tests/navigation/router-state/run.cjs --mode legacy  # the pre-Priority-2 calls (documents the bug)
//   node tests/navigation/router-state/run.cjs --mode helper  # returnToTabs() - the gate
//   node tests/navigation/router-state/run.cjs --case <id> --mode helper --json   (one case, used internally)
//   --trace  also print each app/+native-intent.tsx redirectSystemPath call and its answer
//
// Gate (helper mode): after the call, the app's root stack is exactly one
// '(tabs)' route, on the expected tab; where a tab navigator was already at the
// bottom, it is that same one (same route key: nothing remounted, no copy).
// Exit code 1 if any helper-mode case or control fails.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const caseId = opt('--case');
const mode = opt('--mode');
const trace = args.includes('--trace');

async function runOne(id) {
  const { CASES, LINKS, CONTROLS } = require('./cases.cjs');
  const c = [...CASES, ...LINKS, ...CONTROLS].find((x) => x.id === id);
  if (!c) throw new Error('unknown case ' + id);
  if (c.initialUrl) globalThis.__NAVSIM_INITIAL_URL__ = c.initialUrl;
  if (c.pre) c.pre();
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => { errors.push(a.map(String).join(' ').split('\n')[0].slice(0, 240)); };
  const A = require('./harness/app.cjs');
  await A.boot({ authGate: !!c.authGate, ...(c.boot || {}) });
  const start = A.appStack() ? A.info() : null;
  const startBottomTabsKey = start && start.bottom && start.bottom.name === '(tabs)' ? start.bottom.key : null;
  let threw = null;
  try { await c.run(A); } catch (e) { threw = String(e && e.stack || e).split('\n').slice(0, 3).join(' | '); }
  const end = A.info();
  console.error = origErr;
  return {
    id: c.id, site: c.site, mode: A.MODE, expect: c.expect,
    after: A.snap(), names: end.names, tabsCount: end.tabsCount,
    focusedTab: end.names.length && end.top.name === '(tabs)' ? A.focusedTab(end.top) : null,
    keptOriginal: startBottomTabsKey ? end.keys.includes(startBottomTabsKey) && end.keys[0] === startBottomTabsKey : null,
    authGate: A.authGateLog.slice(), intent: A.intentLog.slice(), errors, threw,
  };
}

function judge(r) {
  const problems = [];
  if (r.threw) problems.push('threw: ' + r.threw);
  const navErrors = r.errors.filter((e) => /not handled|Couldn't find|Could not generate|Attempted to navigate/i.test(e));
  if (navErrors.length) problems.push('navigation errors: ' + navErrors.join(' / '));
  if (r.expect.names) {
    if (JSON.stringify(r.names) !== JSON.stringify(r.expect.names)) problems.push(`stack ${JSON.stringify(r.names)} != expected ${JSON.stringify(r.expect.names)}`);
    if (r.expect.keepsOriginal && r.keptOriginal === false) problems.push('the original tab navigator was replaced (remount)');
    return problems;
  }
  if (!(r.names.length === 1 && r.names[0] === '(tabs)')) problems.push(`root stack is ${JSON.stringify(r.names)} (want exactly ["(tabs)"])`);
  if (r.focusedTab !== r.expect.tab) problems.push(`focused tab '${r.focusedTab}' (want '${r.expect.tab}')`);
  if (r.expect.keepsOriginal && r.keptOriginal === false) problems.push('the original tab navigator was replaced (remount)');
  if (r.expect.freshTabs && r.keptOriginal === true) problems.push("kept the previous session's tab navigator (its screens hold the old account's state)");
  return problems;
}

if (caseId) {
  runOne(caseId)
    .then((r) => { process.stdout.write(JSON.stringify(r)); process.exit(0); })
    .catch((e) => { process.stdout.write(JSON.stringify({ id: caseId, fatal: String(e && e.stack || e) })); process.exit(0); });
} else {
  const { CASES, LINKS, CONTROLS } = require('./cases.cjs');
  const helperPath = path.resolve(__dirname, '../../../lib/tabNavigation.ts');
  const modes = mode ? [mode] : ['legacy', 'helper'];
  let failed = 0;
  const all = [];
  for (const m of modes) {
    if (m === 'helper' && !fs.existsSync(helperPath)) {
      console.log(`\n== helper mode: SKIPPED (lib/tabNavigation.ts does not exist yet)`);
      continue;
    }
    console.log(`\n== mode: ${m} ==`);
    for (const c of [...CASES, ...LINKS, ...CONTROLS]) {
      const out = execFileSync(process.execPath, [__filename, '--case', c.id], { env: { ...process.env, NAV_MODE: m }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const r = JSON.parse(out);
      if (r.fatal) { console.log(`  FATAL ${c.id}: ${r.fatal.split('\n')[0]}`); failed++; continue; }
      const problems = judge(r);
      const isControl = c.id.startsWith('control-');
      const gate = m === 'helper' || isControl;
      const verdict = problems.length === 0 ? 'PASS' : (gate ? 'FAIL' : 'BUG ');
      if (gate && problems.length) failed++;
      all.push({ ...r, verdict, problems });
      console.log(`  ${verdict}  ${c.id.padEnd(44)} ${r.after}${r.tabsCount > 1 ? `   <- ${r.tabsCount} tab navigators` : ''}`);
      if (trace) for (const t of r.intent || []) console.log(`        redirectSystemPath(${JSON.stringify({ path: t.path, initial: t.initial })}) -> ${t.threw ? 'THREW ' + t.threw : JSON.stringify(t.returned)}`);
      for (const p of problems) console.log(`        ${p}`);
    }
  }
  const outFile = process.env.NAV_RESULTS;
  if (outFile) fs.writeFileSync(outFile, JSON.stringify(all, null, 1));
  console.log(`\n${failed === 0 ? 'OK' : 'FAILED'}: ${failed} gate failure(s)`);
  process.exit(failed === 0 ? 0 : 1);
}
