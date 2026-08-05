import fs from 'node:fs';
import path from 'node:path';

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(full) : /\.[jt]sx$/.test(entry.name) ? [full] : [];
  });
}

for (const file of filesUnder('app')) {
  if (file === 'app/_layout.tsx') continue;
  let source = fs.readFileSync(file, 'utf8');
  let changed = false;
  source = source.replace(/<Stack\.Screen\b[\s\S]*?\/>/g, (screen) => screen.replace(
    /title:\s*(['"])([^'"\n]+)\1/g,
    (_whole, quote, title) => {
      changed = true;
      return `title: translate(${quote}${title}${quote})`;
    },
  ));
  if (!changed) continue;
  if (!source.includes("from '@/lib/i18n'")) source = `import { translate } from '@/lib/i18n';\n${source}`;
  fs.writeFileSync(file, source);
}
