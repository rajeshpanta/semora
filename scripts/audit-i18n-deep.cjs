#!/usr/bin/env node
/**
 * Deep i18n coverage scanner — the companion to scripts/audit-i18n.mjs.
 *
 * The original audit only sees JsxText and a fixed attribute list, which is
 * how 400+ strings in JSX ternaries, data-array props, Alert arguments and
 * template literals shipped untranslated (2026-08 audit). This walks EVERY
 * string literal and template with the TS compiler and judges each against
 * the REAL translate() — transpiled on the fly with the RN deps stubbed — so
 * a "miss" here is exactly a string a Spanish user would see in English.
 *
 * Known permanent residue (not failures): date-fns format tokens, facsimile
 * demo content (onboarding sample syllabus, widget previews), brand names,
 * words identical in Spanish (Total, Error, Normal), CSS/SVG strings.
 *
 * Usage: node scripts/audit-i18n-deep.cjs
 */
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..');

// ── Build the real runtime with stubs ───────────────────────────────────────
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-audit-'));
fs.writeFileSync(path.join(work, 'expo-localization.js'),
  'exports.getLocales = () => [{ languageCode: "en" }];');
fs.writeFileSync(path.join(work, 'appStore.js'),
  'exports.useAppStore = { getState: () => ({ languagePreference: "es", setLanguagePreference() {} }) };');
const opts = { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } };
fs.writeFileSync(path.join(work, 'es.cjs'),
  ts.transpileModule(fs.readFileSync(path.join(ROOT, 'lib/i18n/es.ts'), 'utf8'), opts).outputText);
const src = fs.readFileSync(path.join(ROOT, 'lib/i18n.ts'), 'utf8')
  .replace("from 'expo-localization'", `from '${path.join(work, 'expo-localization.js')}'`)
  .replace("from '@/lib/i18n/es'", `from '${path.join(work, 'es.cjs')}'`)
  .replace("from '@/store/appStore'", `from '${path.join(work, 'appStore.js')}'`);
fs.writeFileSync(path.join(work, 'runtime.cjs'), ts.transpileModule(src, opts).outputText);
const { translate } = require(path.join(work, 'runtime.cjs'));

// ── Collect files ───────────────────────────────────────────────────────────
const files = [];
function walk(d, exts) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, exts);
    else if (exts.test(e.name) && !/\.web\.ts$/.test(e.name)) files.push(p);
  }
}
walk(path.join(ROOT, 'app'), /\.(tsx|ts)$/);
walk(path.join(ROOT, 'components'), /\.tsx$/);

// ── Heuristics ──────────────────────────────────────────────────────────────
function isCandidate(s) {
  if (!s || s.length < 3 || s.length > 400) return false;
  if (!/[a-zA-Z]/.test(s)) return false;
  if (/^[a-z0-9_./:@#-]+$/.test(s)) return false;
  if (/^https?:|^mailto:|^semora:|^itms|^\/|^@|^#|^\$\{/.test(s)) return false;
  if (/^[A-Z0-9_]+$/.test(s) && !/ /.test(s)) return false;
  if (!/ /.test(s) && !/^[A-Z][a-z]/.test(s)) return false;
  if (/^[a-z-]+(\s[a-z-]+)?$/.test(s) && s.length < 12) return false;
  return true;
}
const SKIP_PROPS = new Set(['testID','fontFamily','fontWeight','name','source','uri','key','id','href',
  'accessibilityRole','keyboardType','autoComplete','autoCapitalize','textContentType',
  'resizeMode','justifyContent','alignItems','flexDirection','color','backgroundColor']);
const SKIP_CALLS = new Set(['require','import','console.log','console.warn','console.error','StyleSheet.create',
  'from','select','eq','neq','in','order','rpc','channel','on','storage','getItem','setItem',
  'deleteItem','match','replace','split','startsWith','endsWith','includes','indexOf',
  'track','logEvent','setItemAsync','getItemAsync','createURL','openURL','canOpenURL',
  'Haptics','impactAsync','registerTaskAsync','padStart','padEnd','join']);

function callName(node) {
  const e = node.expression;
  if (!e) return '';
  if (ts.isIdentifier(e)) return e.text;
  // Compound form ("console.log") so console.* is skippable while Alert.alert
  // (user-facing) is not.
  if (ts.isPropertyAccessExpression(e)) {
    const obj = ts.isIdentifier(e.expression) ? e.expression.text : '';
    return obj ? `${obj}.${e.name.text}` : e.name.text;
  }
  return '';
}

const misses = new Map();
const templates = new Map();
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rel = path.relative(ROOT, file);
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  function inSkipped(node) {
    let cur = node.parent;
    while (cur) {
      if (ts.isImportDeclaration(cur) || ts.isExportDeclaration(cur)) return true;
      if (ts.isCallExpression(cur)) {
        const n = callName(cur);
        if (SKIP_CALLS.has(n) || SKIP_CALLS.has(n.split('.').pop())) return true;
      }
      if (ts.isJsxAttribute(cur)) {
        const prop = cur.name.getText();
        if (SKIP_PROPS.has(prop) || prop.startsWith('on')) return true;
      }
      if (ts.isPropertyAssignment(cur) && SKIP_PROPS.has(cur.name.getText().replace(/['"]/g, ''))) return true;
      cur = cur.parent;
    }
    return false;
  }
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const v = node.text;
      const isKey = node.parent && ts.isPropertyAssignment(node.parent) && node.parent.name === node;
      if (!isKey && isCandidate(v) && !inSkipped(node) && translate(v, 'es') === v) {
        if (!misses.has(v)) misses.set(v, `${rel}:${lineOf(node)}`);
      }
    } else if (ts.isTemplateExpression(node) && !inSkipped(node)) {
      let out = node.head.text;
      for (const span of node.templateSpans) out += '${x}' + span.literal.text;
      const englishy = /[a-zA-Z]{3,}.*\s/.test(node.head.text + node.templateSpans.map(s => s.literal.text).join(''));
      if (englishy && isCandidate(out.replace(/\$\{x\}/g, 'X'))) {
        const probe = out.replace(/\$\{x\}/g, '3');
        if (translate(probe, 'es') === probe && !templates.has(out)) {
          templates.set(out, `${rel}:${lineOf(node)}`);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
}

console.log(`files scanned: ${files.length}`);
console.log(`untranslated literals: ${misses.size}`);
for (const [s, loc] of [...misses].sort((a, b) => a[1].localeCompare(b[1]))) console.log(`  ${JSON.stringify(s)}  @ ${loc}`);
console.log(`\nuntranslated templates (probe-based — verify flagged ones with REALISTIC renders before treating as gaps): ${templates.size}`);
for (const [s, loc] of templates) console.log(`  ${JSON.stringify(s)}  @ ${loc}`);
