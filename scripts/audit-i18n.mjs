import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const roots = ['app', 'components'];
const interestingProperties = new Set([
  'title', 'label', 'description', 'subtitle', 'placeholder', 'accessibilityLabel',
  'buttonTitle', 'emptyText', 'helperText', 'message', 'valueLabel', 'cta', 'hint',
]);

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(full) : /\.[jt]sx$/.test(entry.name) ? [full] : [];
  });
}

function normalized(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function isCopy(value) {
  return /[A-Za-z]/.test(value) && !/^(https?:|mailto:|semora:|[a-z0-9_./-]+\.(png|jpg|pdf))/.test(value);
}

const sourceKeys = new Map();
function add(value, file, line) {
  const key = normalized(value);
  if (!key || !isCopy(key)) return;
  if (!sourceKeys.has(key)) sourceKeys.set(key, []);
  sourceKeys.get(key).push(`${file}:${line}`);
}

for (const file of roots.flatMap(filesUnder)) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
    if (ts.isJsxText(node)) add(node.text, file, line);
    if (ts.isJsxAttribute(node) && interestingProperties.has(node.name.getText(source))) {
      if (node.initializer && ts.isStringLiteral(node.initializer)) add(node.initializer.text, file, line);
      if (node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression && ts.isStringLiteralLike(node.initializer.expression)) {
        add(node.initializer.expression.text, file, line);
      }
    }
    if (ts.isPropertyAssignment(node) && interestingProperties.has(node.name.getText(source).replace(/["']/g, ''))) {
      if (ts.isStringLiteralLike(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer)) add(node.initializer.text, file, line);
    }
    if (ts.isCallExpression(node) && node.expression.getText(source).endsWith('Alert.alert')) {
      node.arguments.slice(0, 2).forEach((arg) => {
        if (ts.isStringLiteralLike(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) add(arg.text, file, line);
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

const esSourceText = fs.readFileSync('lib/i18n/es.ts', 'utf8');
const esSource = ts.createSourceFile('lib/i18n/es.ts', esSourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const translated = new Set();
function lookupKey(value) {
  return value.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').toLocaleLowerCase('en-US');
}
function readTranslations(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(esSource) === 'ES' && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
    for (const property of node.initializer.properties) {
      if (ts.isPropertyAssignment(property)) {
        translated.add(ts.isStringLiteralLike(property.name)
          ? property.name.text
          : property.name.getText(esSource).replace(/^['"]|['"]$/g, ''));
      }
    }
  }
  ts.forEachChild(node, readTranslations);
}
readTranslations(esSource);
const translatedLookup = new Set([...translated].map(lookupKey));

const uncovered = [...sourceKeys.entries()]
  .filter(([key]) => {
    const bare = key.replace(/\s*[:*]$/, '');
    return !translatedLookup.has(lookupKey(key)) && !translatedLookup.has(lookupKey(bare));
  })
  .sort((a, b) => a[0].localeCompare(b[0]));

for (const [key, locations] of uncovered) {
  process.stdout.write(`${JSON.stringify(key)}\t${locations[0]}\n`);
}
process.stderr.write(`UI strings: ${sourceKeys.size}; exact Spanish entries: ${translated.size}; uncovered: ${uncovered.length}\n`);
