import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const distDirectory = resolve(process.cwd(), 'dist');
const outputDirectory = resolve(distDirectory, 'server');
const outputFile = resolve(outputDirectory, 'index.js');
const clientDirectory = resolve(distDirectory, 'client');

const worker = `const SECURITY_HEADERS = {
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()"
};

function withHeaders(response, isDocument = false) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  if (isDocument) {
    headers.set("Cache-Control", "no-cache");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function withDocumentHeaders(response, origin, isHead) {
  if (isHead) return withHeaders(response, true);
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  headers.set("Cache-Control", "no-cache");
  headers.delete("Content-Length");
  headers.delete("ETag");
  const html = (await response.text()).replaceAll(
    'content="/og.png"',
    \`content="\${origin}/og.png"\`
  );
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" }
      });
    }

    const url = new URL(request.url);
    const lastSegment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    const isSpaDocument = url.pathname === "/" || !lastSegment.includes(".");

    // Cloudflare's asset binding redirects extensionless paths before it
    // reports a miss. Resolve SPA routes directly to index.html so a refresh
    // on /settings, /paywall, or an OAuth callback preserves the route instead
    // of redirecting the browser back to /.
    if (isSpaDocument) {
      // Request the root document rather than /index.html. Cloudflare Assets'
      // HTML normalization redirects /index.html back to /, whereas fetching
      // / returns the document body directly.
      const indexUrl = new URL("/", url);
      const indexRequest = new Request(indexUrl, request);
      const indexResponse = await env.ASSETS.fetch(indexRequest);
      return withDocumentHeaders(indexResponse, url.origin, request.method === "HEAD");
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      if (url.pathname.endsWith(".html")) {
        return withDocumentHeaders(assetResponse, url.origin, request.method === "HEAD");
      }
      return withHeaders(assetResponse);
    }

    return withHeaders(assetResponse);
  }
};
`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, worker, 'utf8');

// Sites' Cloudflare deployment binds static files from dist/client to
// env.ASSETS. Expo exports them at the dist root for Vercel, so mirror the
// browser assets into the directory Sites expects while preserving the
// existing root export. Without this step the worker deploys successfully but
// every request (including /index.html) resolves to 404.
await rm(clientDirectory, { recursive: true, force: true });
await mkdir(clientDirectory, { recursive: true });

const siteOnlyEntries = new Set([
  '.gitignore',
  '.openai',
  '.vercelignore',
  'client',
  'server',
  'vercel.json',
]);

for (const entry of await readdir(distDirectory, { withFileTypes: true })) {
  if (siteOnlyEntries.has(entry.name)) continue;
  await cp(
    resolve(distDirectory, entry.name),
    resolve(clientDirectory, entry.name),
    { recursive: entry.isDirectory() },
  );
}

console.log('prepare-web-worker: wrote worker and staged Expo assets in dist/client');
