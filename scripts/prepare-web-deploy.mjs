/**
 * Post-processes `expo export --platform web` output into something Vercel
 * can actually serve. Run automatically by `npm run build:web`.
 *
 * `expo export --clear` empties dist/ on every run, so everything here has to
 * be reapplied each time. Doing it by hand is how a deploy ends up shipping
 * without robots.txt, or with 404ing fonts that worked fine locally.
 *
 * Two jobs:
 *
 * 1. Write dist/ config that Expo doesn't know about — the SPA rewrite,
 *    noindex headers, and robots.txt. This file is their source of truth.
 *
 * 2. Move assets out of `assets/node_modules/`. Expo names bundled font and
 *    icon files after their original node_modules path, and Vercel's uploader
 *    applies the repo's `node_modules/` ignore rule to them by path — so they
 *    silently never upload and every icon renders as a blank box in
 *    production while working perfectly in dev. dist/.vercelignore is meant
 *    to override that and does not reliably, so the files are renamed out of
 *    the way instead and the bundle is repointed at the new path.
 */
import { mkdir, readFile, writeFile, readdir, rename, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const dist = resolve(process.cwd(), 'dist');

if (!existsSync(dist)) {
  console.error('prepare-web-deploy: no dist/ — run `expo export --platform web` first.');
  process.exit(1);
}

// ── 1. Config files ─────────────────────────────────────────────────────────

const VERCEL_JSON = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  // Expo Router exports a single-page app: every unknown route has to boot the
  // same document so the client router can resolve it (OAuth callbacks and
  // shared deep links included). robots.txt is excluded so it stays a real
  // file rather than being rewritten into the SPA shell.
  rewrites: [{ source: '/((?!robots\\.txt).*)', destination: '/index.html' }],
  headers: [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ],
};

const ROBOTS_TXT = `# app.semoraai.com is the signed-in application, not content.
#
# Every path here resolves to the same SPA shell, so without this file the
# host is an unbounded soft-404 farm: any URL returns HTTP 200 with an
# identical page titled "Semora". That competes with semoraai.com for the
# brand term and wastes crawl budget on infinite non-pages.
#
# The marketing site at https://semoraai.com is the indexable surface.
User-agent: *
Disallow: /
`;

const VERCELIGNORE = `# Deploy everything in this static export as-is — do not inherit the
# monorepo root .gitignore's \`node_modules/\` rule. See the asset relocation
# in scripts/prepare-web-deploy.mjs for why that rule is dangerous here.
`;

const DIST_GITIGNORE = `.vercel\n.env*\n`;

// app.semoraai.com is served by semora1/semora-app. The repository also
// contains the separate marketing site (semora1/semora-website), so the app
// export carries its own non-secret project link to make the deployment target
// unambiguous after Expo recreates dist/.
const VERCEL_APP_PROJECT = {
  projectId: 'prj_LoKf1ZrtrGfNfjwQ3oUD4obBjGtn',
  orgId: 'team_UizlaRnMnqrelwFIXn26T0cg',
  projectName: 'semora-app',
};

await writeFile(join(dist, 'vercel.json'), JSON.stringify(VERCEL_JSON, null, 2) + '\n');
await writeFile(join(dist, 'robots.txt'), ROBOTS_TXT);
await writeFile(join(dist, '.vercelignore'), VERCELIGNORE);
await writeFile(join(dist, '.gitignore'), DIST_GITIGNORE);
await mkdir(join(dist, '.vercel'), { recursive: true });
await writeFile(
  join(dist, '.vercel', 'project.json'),
  JSON.stringify(VERCEL_APP_PROJECT) + '\n',
);
console.log('prepare-web-deploy: wrote Vercel app config, robots.txt, and deployment guards');

// ── 2. Relocate assets out of assets/node_modules/ ──────────────────────────

const FROM = 'assets/node_modules';
const TO = 'assets/vendor-assets';
const fromDir = join(dist, FROM);

if (existsSync(fromDir)) {
  await rename(fromDir, join(dist, TO));

  // Repoint every reference. The paths appear in the JS bundles (asset
  // registry entries) and can appear in the HTML shell (preloads).
  const targets = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(js|html|json)$/.test(entry.name)) targets.push(full);
    }
  };
  await walk(dist);

  let filesChanged = 0;
  let refsChanged = 0;
  for (const file of targets) {
    const source = await readFile(file, 'utf8');
    if (!source.includes(FROM)) continue;
    refsChanged += source.split(FROM).length - 1;
    await writeFile(file, source.replaceAll(FROM, TO));
    filesChanged += 1;
  }

  const count = (await readdir(join(dist, TO), { recursive: true })).length;
  console.log(
    `prepare-web-deploy: relocated ${FROM}/ -> ${TO}/ ` +
      `(${count} entries, ${refsChanged} refs across ${filesChanged} files)`,
  );
} else {
  console.log(`prepare-web-deploy: no ${FROM}/ to relocate`);
}

// ── 3. Sanity check ─────────────────────────────────────────────────────────

const leftovers = [];
const scan = async (dir) => {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') leftovers.push(join(dir, entry.name));
      else await scan(join(dir, entry.name));
    }
  }
};
await scan(dist);
if (leftovers.length) {
  console.error(
    'prepare-web-deploy: node_modules/ directories remain in dist — these will ' +
      'not upload to Vercel:\n  ' + leftovers.join('\n  '),
  );
  process.exit(1);
}

for (const required of ['index.html', 'robots.txt', 'vercel.json', '.vercel/project.json']) {
  await stat(join(dist, required));
}
console.log('prepare-web-deploy: ok');
