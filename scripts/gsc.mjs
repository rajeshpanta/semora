#!/usr/bin/env node
/**
 * Google Search Console reader for semoraai.com.
 *
 * Answers the questions the GSC web UI answers, from the terminal: is the
 * sitemap actually submitted, which URLs are actually indexed, and what is
 * the site actually ranking for. The UI's "Pages" chart has no API, so
 * coverage here is built the honest way — URL Inspection on every URL in the
 * sitemap. That is slower than reading a number off a chart, but it is a real
 * per-URL verdict rather than a rounded total.
 *
 * Zero dependencies: Node stdlib only, so it runs without touching the
 * repo's package tree.
 *
 * Setup (once):
 *   1. Enable the Search Console API on the `semora` GCP project.
 *   2. Create an OAuth client of type "Desktop app".
 *   3. Save it as scripts/client_secret.gsc.json  (matches the repo's
 *      existing client_secret*.json ignore rule — this repo is public).
 *   4. node scripts/gsc.mjs auth
 *
 * Usage:
 *   node scripts/gsc.mjs auth              Sign in, cache a refresh token
 *   node scripts/gsc.mjs status            Sitemaps + full sitemap coverage
 *   node scripts/gsc.mjs queries [days]    Top search queries (default 28)
 *   node scripts/gsc.mjs inspect <url>     One URL's index verdict
 */

import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CREDS_PATH = join(HERE, 'client_secret.gsc.json');
const TOKEN_PATH = join(HERE, '.gsc-token.json');

const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const SITE_HOST = 'semoraai.com';
const SITEMAP_URL = `https://${SITE_HOST}/sitemap.xml`;

// URL Inspection allows 600 queries/minute. Six at a time with no added delay
// stays comfortably inside that for a sitemap of this size.
const INSPECT_CONCURRENCY = 6;

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function die(msg) {
  console.error(`\n${red('✗')} ${msg}\n`);
  process.exit(1);
}

function loadCreds() {
  if (!existsSync(CREDS_PATH)) {
    die(
      `No OAuth client at ${CREDS_PATH}\n\n` +
        `  1. https://console.cloud.google.com/apis/library/searchconsole.googleapis.com\n` +
        `     → Enable, on the "semora" project\n` +
        `  2. https://console.cloud.google.com/apis/credentials\n` +
        `     → Create credentials → OAuth client ID → Desktop app\n` +
        `  3. Download the JSON, save it to scripts/client_secret.gsc.json\n` +
        `  4. node scripts/gsc.mjs auth`,
    );
  }
  const raw = JSON.parse(readFileSync(CREDS_PATH, 'utf8'));
  // Desktop clients nest under "installed"; accept "web" too so a mis-picked
  // client type fails on the redirect with a clear Google error rather than
  // on an undefined property here.
  const c = raw.installed ?? raw.web;
  if (!c?.client_id) die(`${CREDS_PATH} is not a Google OAuth client file.`);
  return c;
}

async function tokenRequest(body) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = await res.json();
  if (!res.ok) die(`Token exchange failed: ${json.error_description ?? JSON.stringify(json)}`);
  return json;
}

async function authorize() {
  const creds = loadCreds();

  const { server, port } = await new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => resolve({ server: s, port: s.address().port }));
  });
  const redirectUri = `http://localhost:${port}`;

  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: creds.client_id,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPE,
      access_type: 'offline',
      // Without this a returning user gets no refresh_token, and the cached
      // token would silently expire in an hour.
      prompt: 'consent',
    });

  console.log(`\n${bold('Opening your browser to sign in…')}`);
  console.log(dim(`If it doesn't open, paste this:\n${authUrl}\n`));
  spawn('open', [authUrl], { stdio: 'ignore', detached: true }).unref();

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out after 5 minutes')), 5 * 60_000);
    server.on('request', (req, res) => {
      const url = new URL(req.url, redirectUri);
      const err = url.searchParams.get('error');
      const got = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        `<body style="font:16px system-ui;padding:3rem;max-width:32rem">` +
          (got
            ? `<h2>✓ Connected</h2><p>Search Console is linked. Close this tab and return to the terminal.</p>`
            : `<h2>✗ ${err ?? 'No code returned'}</h2>`) +
          `</body>`,
      );
      clearTimeout(timer);
      if (got) resolve(got);
      else reject(new Error(err ?? 'no code'));
    });
  }).finally(() => server.close());

  const tok = await tokenRequest({
    code,
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  writeFileSync(TOKEN_PATH, JSON.stringify({ refresh_token: tok.refresh_token }, null, 2), {
    mode: 0o600,
  });
  console.log(`${green('✓')} Signed in. Refresh token cached at ${dim('scripts/.gsc-token.json')}`);
  return tok.access_token;
}

async function accessToken() {
  if (!existsSync(TOKEN_PATH)) return authorize();
  const creds = loadCreds();
  const { refresh_token } = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'));
  const tok = await tokenRequest({
    refresh_token,
    client_id: creds.client_id,
    client_secret: creds.client_secret,
    grant_type: 'refresh_token',
  });
  return tok.access_token;
}

async function api(url, token, body) {
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.error?.message ?? res.statusText;
    throw new Error(`${res.status} ${msg}`);
  }
  return json;
}

/** Pick the property to report on, preferring a domain property. */
async function resolveSite(token) {
  const { siteEntry = [] } = await api('https://www.googleapis.com/webmasters/v3/sites', token);
  if (!siteEntry.length) {
    die('This Google account has no Search Console properties.\nSign in as the account that verified semoraai.com.');
  }
  const mine = siteEntry.filter((s) => s.siteUrl.includes(SITE_HOST));
  if (!mine.length) {
    console.log(`\n${yellow('!')} No property for ${SITE_HOST}. This account can see:`);
    for (const s of siteEntry) console.log(`    ${s.siteUrl} ${dim(`(${s.permissionLevel})`)}`);
    die('Sign in as the account that verified semoraai.com.');
  }
  const chosen = mine.find((s) => s.siteUrl.startsWith('sc-domain:')) ?? mine[0];
  return chosen.siteUrl;
}

const enc = (siteUrl) => encodeURIComponent(siteUrl);

async function fetchSitemapUrls() {
  const xml = await fetch(SITEMAP_URL).then((r) => r.text());
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

/** Run `worker` over `items`, at most `limit` in flight. */
async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i], i);
      }
    }),
  );
  return out;
}

async function inspectOne(token, siteUrl, inspectionUrl) {
  try {
    const r = await api('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', token, {
      inspectionUrl,
      siteUrl,
      languageCode: 'en-US',
    });
    const s = r.inspectionResult?.indexStatusResult ?? {};
    return {
      url: inspectionUrl,
      verdict: s.verdict ?? 'UNKNOWN',
      coverage: s.coverageState ?? '—',
      lastCrawl: s.lastCrawlTime ?? null,
      robots: s.robotsTxtState ?? '—',
      canonical: s.googleCanonical ?? null,
    };
  } catch (e) {
    return { url: inspectionUrl, verdict: 'ERROR', coverage: e.message, lastCrawl: null };
  }
}

async function cmdStatus() {
  const token = await accessToken();
  const siteUrl = await resolveSite(token);
  console.log(`\n${bold('Property')}  ${siteUrl}`);

  // ---- Sitemaps -----------------------------------------------------------
  console.log(`\n${bold('Sitemaps')}`);
  const { sitemap = [] } = await api(
    `https://www.googleapis.com/webmasters/v3/sites/${enc(siteUrl)}/sitemaps`,
    token,
  );
  if (!sitemap.length) {
    console.log(`  ${red('NONE SUBMITTED')} — this is the fix. Submit ${SITEMAP_URL} in Search Console.`);
  } else {
    for (const s of sitemap) {
      const submitted = s.lastSubmitted ? s.lastSubmitted.slice(0, 10) : 'never';
      const downloaded = s.lastDownloaded ? s.lastDownloaded.slice(0, 10) : red('never downloaded');
      const count = s.contents?.[0]?.submitted ?? '?';
      console.log(`  ${s.path}`);
      console.log(
        `    submitted ${submitted}   downloaded by Google ${downloaded}   ${count} URLs` +
          (s.errors > 0 ? `   ${red(`${s.errors} errors`)}` : '') +
          (s.warnings > 0 ? `   ${yellow(`${s.warnings} warnings`)}` : ''),
      );
    }
  }

  // ---- Per-URL coverage ---------------------------------------------------
  const urls = await fetchSitemapUrls();
  console.log(`\n${bold('Index coverage')} ${dim(`— inspecting all ${urls.length} sitemap URLs…`)}`);
  let done = 0;
  const results = await pool(urls, INSPECT_CONCURRENCY, async (u) => {
    const r = await inspectOne(token, siteUrl, u);
    process.stdout.write(`\r  ${++done}/${urls.length}`);
    return r;
  });
  process.stdout.write('\r' + ' '.repeat(24) + '\r');

  const byCoverage = new Map();
  for (const r of results) {
    const key = r.verdict === 'PASS' ? `indexed — ${r.coverage}` : `${r.verdict} — ${r.coverage}`;
    if (!byCoverage.has(key)) byCoverage.set(key, []);
    byCoverage.get(key).push(r);
  }

  const indexed = results.filter((r) => r.verdict === 'PASS').length;
  const crawled = results.filter((r) => r.lastCrawl).length;
  const pct = (n) => `${((n / results.length) * 100).toFixed(0)}%`;

  console.log(
    `  ${indexed > 0 ? green(`${indexed} indexed`) : red('0 indexed')}` +
      ` ${dim(`(${pct(indexed)})`)}   ` +
      `${crawled} crawled ${dim(`(${pct(crawled)})`)}   of ${results.length} submitted\n`,
  );

  for (const [state, group] of [...byCoverage].sort((a, b) => b[1].length - a[1].length)) {
    const mark = state.startsWith('indexed') ? green('✓') : yellow('•');
    console.log(`  ${mark} ${bold(String(group.length).padStart(3))}  ${state}`);
    for (const r of group.slice(0, 5)) console.log(dim(`         ${r.url}`));
    if (group.length > 5) console.log(dim(`         …and ${group.length - 5} more`));
  }

  const newest = results.filter((r) => r.lastCrawl).sort((a, b) => b.lastCrawl.localeCompare(a.lastCrawl))[0];
  console.log(
    `\n  ${newest ? `Most recent Googlebot crawl: ${newest.lastCrawl.slice(0, 10)}` : red('Googlebot has never crawled any submitted URL.')}`,
  );

  await cmdQueries(28, { token, siteUrl });
}

async function cmdQueries(days = 28, ctx) {
  const token = ctx?.token ?? (await accessToken());
  const siteUrl = ctx?.siteUrl ?? (await resolveSite(token));

  // Search Analytics lags ~2 days, and the window is expressed in whole days
  // relative to now — no fixed dates, so the report is always current.
  const day = 86_400_000;
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const end = iso(Date.now() - 2 * day);
  const start = iso(Date.now() - (days + 2) * day);

  console.log(`\n${bold(`Search performance`)} ${dim(`${start} → ${end}`)}`);

  const totals = await api(
    `https://www.googleapis.com/webmasters/v3/sites/${enc(siteUrl)}/searchAnalytics/query`,
    token,
    { startDate: start, endDate: end, dimensions: [] },
  );
  const t = totals.rows?.[0];
  if (!t || t.impressions === 0) {
    console.log(`  ${yellow('Zero impressions.')} Google has not shown this site to anyone yet.`);
    return;
  }
  console.log(
    `  ${t.clicks} clicks   ${t.impressions} impressions   ` +
      `CTR ${(t.ctr * 100).toFixed(1)}%   avg position ${t.position.toFixed(1)}`,
  );

  const q = await api(
    `https://www.googleapis.com/webmasters/v3/sites/${enc(siteUrl)}/searchAnalytics/query`,
    token,
    { startDate: start, endDate: end, dimensions: ['query'], rowLimit: 25 },
  );
  if (!q.rows?.length) return;
  console.log(`\n  ${dim('query'.padEnd(46))}${dim('impr'.padStart(6))}${dim('clicks'.padStart(7))}${dim('pos'.padStart(7))}`);
  for (const r of q.rows) {
    console.log(
      `  ${r.keys[0].slice(0, 44).padEnd(46)}` +
        `${String(r.impressions).padStart(6)}` +
        `${String(r.clicks).padStart(7)}` +
        `${r.position.toFixed(1).padStart(7)}`,
    );
  }
}

async function cmdInspect(url) {
  if (!url) die('Usage: node scripts/gsc.mjs inspect <url>');
  const token = await accessToken();
  const siteUrl = await resolveSite(token);
  const r = await inspectOne(token, siteUrl, url);
  console.log(`\n${bold(r.url)}`);
  console.log(`  verdict     ${r.verdict === 'PASS' ? green(r.verdict) : yellow(r.verdict)}`);
  console.log(`  coverage    ${r.coverage}`);
  console.log(`  last crawl  ${r.lastCrawl ?? red('never')}`);
  console.log(`  robots.txt  ${r.robots}`);
  if (r.canonical) console.log(`  canonical   ${r.canonical}`);
  console.log();
}

const [cmd, ...rest] = process.argv.slice(2);
const run = {
  auth: () => authorize().then(() => {}),
  status: cmdStatus,
  queries: () => cmdQueries(Number(rest[0]) || 28),
  inspect: () => cmdInspect(rest[0]),
}[cmd ?? 'status'];

if (!run) die(`Unknown command "${cmd}". Try: auth | status | queries [days] | inspect <url>`);
run()
  .then(() => console.log())
  .catch((e) => die(e.message));
