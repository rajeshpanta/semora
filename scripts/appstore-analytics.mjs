#!/usr/bin/env node
/**
 * App Store Connect Analytics reader — impressions, downloads and purchases.
 *
 * This is the data App Store Connect shows under Analytics → Acquisition, and it
 * is the only place that answers "is Apple showing the app to anyone, and do they
 * tap it". The app's own analytics_events table cannot see any of it: by the time
 * a device appears there it has already downloaded.
 *
 * CORRECTION TO AN OLD NOTE: a previous audit recorded that App Store Analytics is
 * NOT readable through the API. It is. The mistake was the key.
 *   - UJ7WBMA5H5  (Developer role)  -> 403 FORBIDDEN on analyticsReportRequests
 *   - 5T4AFQ7J26  (App Manager)     -> works, and is what this script uses
 * Both .p8 files live in ~/Semora-Recovery/. The issuer id must be GREPPED out of
 * issuer_id.txt — that file is a 7-line note, not a bare id, and reading it whole
 * produces a 250-char issuer that every Apple API rejects with a plain 401.
 *
 * Two report requests already exist on the app and Apple refuses duplicates
 * ("You already have such an entity"), so there is nothing to create:
 *   ONE_TIME_SNAPSHOT  frozen at 2026-09-18, carries history back to 2026-04-27
 *   ONGOING            daily instances from 2026-09-19 forward
 * Use the ONGOING one for anything recent; use the snapshot for history.
 *
 * THE TRAP THAT WILL BITE YOU: every DAILY instance of an ONGOING report contains a
 * THREE-DAY ROLLING WINDOW (download reports carry two days), so consecutive
 * instances OVERLAP. Concatenating them double- and triple-counts — it inflated a
 * day's impressions from 3,791 to 7,579 before it was caught. Always dedupe by
 * taking each calendar Date from the LATEST processingDate that covers it. That is
 * what --report does; if you write your own puller, copy that logic.
 *
 * Restatements across processing dates are tiny (0.05–0.2% on impressions, taps
 * never changed), so the most recent instance is safe to treat as final.
 *
 * Usage:
 *   node scripts/appstore-analytics.mjs requests            List report requests
 *   node scripts/appstore-analytics.mjs reports [ONGOING]   List reports in a request
 *   node scripts/appstore-analytics.mjs report r14 [out]    Download + dedupe a report
 *   node scripts/appstore-analytics.mjs impressions         Daily search funnel by territory
 *
 * Reports worth knowing:
 *   r3  App Downloads Standard          — first-time vs redownload vs auto-update, by source
 *   r12 App Store Purchases Standard    — per-transaction price, and the App Download Date,
 *                                         which is how you tell a renewal from a new sale
 *   r14 App Store Discovery and Engagement Standard — Impression / Tap / Page view,
 *                                         by Source Type and Territory. The important one.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createSign } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const APP_ID = '6762589321';
const KEY_ID = process.env.ASC_KEY_ID || '5T4AFQ7J26';
const RECOVERY = join(homedir(), 'Semora-Recovery');

function issuerId() {
  const raw = readFileSync(join(RECOVERY, 'issuer_id.txt'), 'utf8');
  const m = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  if (!m) throw new Error('no UUID in issuer_id.txt');
  return m[0];
}

function privateKey() {
  for (const p of [join(RECOVERY, `AuthKey_${KEY_ID}.p8`),
                   join(homedir(), '.appstoreconnect/private_keys', `AuthKey_${KEY_ID}.p8`)]) {
    try { return readFileSync(p, 'utf8'); } catch { /* try next */ }
  }
  throw new Error(`AuthKey_${KEY_ID}.p8 not found in ~/Semora-Recovery or ~/.appstoreconnect`);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' });
  const body = b64({ iss: issuerId(), iat: now, exp: now + 900, aud: 'appstoreconnect-v1' });
  const s = createSign('sha256');
  s.update(`${head}.${body}`);
  // ES256 needs the raw r||s pair, not DER — without ieee-p1363 Apple returns 401.
  return `${head}.${body}.${s.sign({ key: privateKey(), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

async function get(path) {
  const url = path.startsWith('http') ? path : `https://api.appstoreconnect.apple.com${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error body */ }
  if (!res.ok) throw new Error(`${res.status} ${path}\n${text.slice(0, 400)}`);
  return json;
}

async function requests() {
  const r = await get(`/v1/apps/${APP_ID}/analyticsReportRequests?limit=50`);
  return r.data.map((x) => ({ id: x.id, accessType: x.attributes.accessType,
                              stopped: x.attributes.stoppedDueToInactivity }));
}

async function requestId(accessType = 'ONGOING') {
  const found = (await requests()).find((r) => r.accessType === accessType);
  if (!found) throw new Error(`no ${accessType} request on app ${APP_ID}`);
  return found.id;
}

/** Download every DAILY instance of one report and dedupe the rolling windows. */
async function report(prefix, accessType = 'ONGOING') {
  const reqId = await requestId(accessType);
  const inst = await get(`/v1/analyticsReports/${prefix}-${reqId}/instances?limit=200`);
  const daily = (inst.data ?? []).filter((i) => i.attributes.granularity === 'DAILY')
    .sort((a, b) => a.attributes.processingDate.localeCompare(b.attributes.processingDate));
  if (!daily.length) throw new Error(`no DAILY instances for ${prefix}`);

  let header = null;
  const owner = new Map();   // calendar date -> processingDate that owns it
  const rows = new Map();    // calendar date -> raw lines

  for (const d of daily) {
    const pd = d.attributes.processingDate;
    const segs = await get(`/v1/analyticsReportInstances/${d.id}/segments?limit=50`);
    for (const s of segs.data ?? []) {
      const buf = Buffer.from(await (await fetch(s.attributes.url)).arrayBuffer());
      let text;
      try { text = gunzipSync(buf).toString('utf8'); } catch { text = buf.toString('utf8'); }
      const lines = text.trim().split('\n');
      header ??= lines[0];
      for (const line of lines.slice(1)) {
        const date = line.split('\t')[0];
        // Later processing dates win; that is the whole dedupe.
        if (!owner.has(date) || owner.get(date) < pd) { owner.set(date, pd); rows.set(date, []); }
        if (owner.get(date) === pd) rows.get(date).push(line);
      }
    }
  }
  const dates = [...rows.keys()].sort();
  return { header, dates, lines: dates.flatMap((d) => rows.get(d)) };
}

function parse({ header, lines }) {
  const cols = header.split('\t');
  return lines.map((l) => Object.fromEntries(l.split('\t').map((v, i) => [cols[i], v])));
}

async function impressions() {
  const r = parse(await report('r14'));
  const by = new Map();
  for (const row of r) {
    if (row['Source Type'] !== 'App Store search') continue;
    const k = `${row.Date}|${row.Territory}`;
    const e = by.get(k) ?? { date: row.Date, terr: row.Territory, imp: 0, tap: 0, pv: 0 };
    const n = Number(row.Counts) || 0;
    if (row.Event === 'Impression') e.imp += n;
    else if (row.Event === 'Tap') e.tap += n;
    else if (row.Event === 'Page view') e.pv += n;
    by.set(k, e);
  }
  const days = new Map();
  for (const e of by.values()) {
    const d = days.get(e.date) ?? { imp: 0, tap: 0, terr: {} };
    d.imp += e.imp; d.tap += e.tap;
    d.terr[e.terr] = e.imp;
    days.set(e.date, d);
  }
  console.log('App Store SEARCH, daily (deduped)\n');
  console.log(`${'date'.padStart(12)}${'impr'.padStart(9)}${'taps'.padStart(7)}${'rate'.padStart(8)}   top territories`);
  for (const d of [...days.keys()].sort()) {
    const v = days.get(d);
    const top = Object.entries(v.terr).sort((a, b) => b[1] - a[1]).slice(0, 4)
      .map(([t, n]) => `${t} ${n}`).join('  ');
    const rate = v.imp ? ((100 * v.tap) / v.imp).toFixed(2) : '0.00';
    console.log(`${d.padStart(12)}${String(v.imp).padStart(9)}${String(v.tap).padStart(7)}${(rate + '%').padStart(8)}   ${top}`);
  }
}

const [cmd, a1, a2] = process.argv.slice(2);
try {
  if (cmd === 'requests') {
    for (const r of await requests()) console.log(`${r.id}  ${r.accessType}  stopped=${r.stopped}`);
  } else if (cmd === 'reports') {
    const reqId = await requestId(a1 || 'ONGOING');
    const r = await get(`/v1/analyticsReportRequests/${reqId}/reports?limit=200`);
    for (const x of r.data) console.log(`${x.id.split('-')[0].padEnd(5)} ${x.attributes.category.padEnd(22)} ${x.attributes.name}`);
  } else if (cmd === 'report') {
    if (!a1) throw new Error('usage: report <r14|r3|r12> [outfile]');
    const r = await report(a1);
    const out = [r.header, ...r.lines].join('\n');
    if (a2) { mkdirSync(dirname(a2), { recursive: true }); writeFileSync(a2, out); console.log(`${r.lines.length} rows, ${r.dates[0]}..${r.dates.at(-1)} -> ${a2}`); }
    else console.log(out);
  } else if (cmd === 'impressions') {
    await impressions();
  } else {
    console.log(readFileSync(new URL(import.meta.url)).toString().split('*/')[0].replace(/^\/\*\*?/, ''));
  }
} catch (e) {
  console.error(String(e.message || e));
  process.exit(1);
}
