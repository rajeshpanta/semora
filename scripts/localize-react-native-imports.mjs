import fs from 'node:fs';
import path from 'node:path';

const roots = ['app', 'components', 'lib'];
const localizedModule = '@/components/LocalizedReactNative';
const targets = new Set(['Alert', 'Pressable', 'Switch', 'Text', 'TextInput', 'TouchableOpacity']);

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(full) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [full] : [];
  });
}

for (const file of roots.flatMap(filesUnder)) {
  if (file.endsWith('components/LocalizedReactNative.tsx')) continue;
  if (file.endsWith('components/WebAlertHost.tsx')) continue;
  let source = fs.readFileSync(file, 'utf8');
  const moved = new Set();

  source = source.replace(
    /import\s*{([^}]*)}\s*from\s*(['"])react-native\2;?/g,
    (whole, body, quote) => {
      const kept = [];
      for (const raw of body.split(',')) {
        const specifier = raw.trim();
        if (!specifier) continue;
        const withoutType = specifier.replace(/^type\s+/, '');
        const [imported, alias] = withoutType.split(/\s+as\s+/);
        if (!alias && !specifier.startsWith('type ') && targets.has(imported)) moved.add(imported);
        else kept.push(specifier);
      }
      return kept.length ? `import {\n  ${kept.join(',\n  ')},\n} from ${quote}react-native${quote};` : '';
    },
  );

  if (moved.size === 0) continue;
  const names = [...moved].sort().join(', ');
  const localizedImport = `import { ${names} } from '${localizedModule}';\n`;
  const directiveMatch = source.match(/^(?:['"][^'"\n]+['"];\s*)+/);
  const insertAt = directiveMatch?.[0].length ?? 0;
  source = source.slice(0, insertAt) + localizedImport + source.slice(insertAt);
  fs.writeFileSync(file, source);
}
