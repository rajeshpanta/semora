import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const clientDirectory = resolve(process.cwd(), 'dist/client');
const workerSource = await readFile(resolve(process.cwd(), 'dist/server/index.js'), 'utf8');
const workerModuleUrl = `data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`;
const { default: worker } = await import(workerModuleUrl);
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
};

const env = {
  ASSETS: {
    async fetch(request) {
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      let relativePath = pathname.replace(/^\/+/, '');
      if (!relativePath) relativePath = 'index.html';

      // Cloudflare Assets may normalize extensionless paths with a redirect.
      // The application worker must never ask it to resolve SPA routes.
      if (!relativePath.split('/').at(-1)?.includes('.')) {
        return new Response(null, { status: 307, headers: { Location: '/' } });
      }

      const file = resolve(clientDirectory, relativePath);
      if (file !== clientDirectory && !file.startsWith(`${clientDirectory}${sep}`)) {
        return new Response(null, { status: 404 });
      }

      try {
        if (!(await stat(file)).isFile()) return new Response(null, { status: 404 });
        const body = request.method === 'HEAD' ? null : await readFile(file);
        return new Response(body, {
          status: 200,
          headers: { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream' },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    },
  },
};

for (const route of ['/', '/settings']) {
  const response = await worker.fetch(new Request(`https://semora.example${route}`), env);
  if (response.status !== 200) {
    throw new Error(`Sites worker returned ${response.status} for ${route}`);
  }
}

const indexHtml = await readFile(resolve(clientDirectory, 'index.html'), 'utf8');
const entryPath = indexHtml.match(/src="(\/_expo\/static\/js\/web\/entry-[^"]+\.js)"/)?.[1];
if (!entryPath) throw new Error('Could not find the Expo entry bundle in dist/client/index.html');

const entryBundle = await readFile(resolve(clientDirectory, entryPath.replace(/^\//, '')), 'utf8');
for (const expectedText of ['App language', 'Monthly plan', 'Yearly plan', 'Manage Semora Plan']) {
  if (!entryBundle.includes(expectedText)) {
    throw new Error(`Published web bundle is missing Settings text: ${expectedText}`);
  }
}

console.log('verify-web-worker: routes and current Settings bundle are ready for Sites');
