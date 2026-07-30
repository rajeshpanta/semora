import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const outputDirectory = resolve(process.cwd(), 'dist/server');
const outputFile = resolve(outputDirectory, 'index.js');

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
    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      if (url.pathname === "/" || url.pathname.endsWith(".html")) {
        return withDocumentHeaders(assetResponse, url.origin, request.method === "HEAD");
      }
      return withHeaders(assetResponse);
    }

    // Expo Router is exported as a single-page app. Unknown document routes
    // (including OAuth/reset callbacks and shared deep links) must boot the
    // same index document so the client router can resolve them.
    const indexUrl = new URL("/index.html", url);
    const indexRequest = new Request(indexUrl, request);
    const indexResponse = await env.ASSETS.fetch(indexRequest);
    return withDocumentHeaders(indexResponse, url.origin, request.method === "HEAD");
  }
};
`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputFile, worker, 'utf8');
