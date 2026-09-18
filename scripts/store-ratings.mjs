#!/usr/bin/env node
/**
 * What the stores actually show for Semora, per country.
 *
 * The app can record who it asked and what they tapped, but not whether a
 * rating was left — Apple's review sheet reports nothing and the write-review
 * composer is a link out of the app. The only ground truth is Apple's public
 * rating count, and it is only useful as a series: "+2 in Canada this week" is
 * the answer to "is the rating card working", and a single snapshot is not.
 *
 * Usage:
 *   node scripts/store-ratings.mjs             # print today's counts
 *   node scripts/store-ratings.mjs --record    # also append to the history file
 *   node scripts/store-ratings.mjs --history   # show what has been recorded
 *
 * Reads two public endpoints, no credentials:
 *   - the iTunes lookup API for the rating count and average per storefront
 *   - the customer-review RSS feed for written reviews
 *
 * History lives in docs/metrics/app-store-ratings.jsonl, one line per run, so
 * a diff shows what changed rather than rewriting a table.
 */
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const APP_ID = '6762589321';
/** Where students actually are, plus the big English storefronts. */
const COUNTRIES = ['us', 'ca', 'gb', 'au', 'in', 'ie', 'nz', 'de', 'fr', 'es', 'mx', 'br', 'ng', 'ph', 'pk', 'ae', 'sa', 'za', 'sg', 'my'];
const HISTORY = join(dirname(new URL(import.meta.url).pathname), '..', 'docs', 'metrics', 'app-store-ratings.jsonl');

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'semora-store-ratings/1' } });
  if (!res.ok) return null;
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function ratingsFor(country) {
  const data = await getJson(`https://itunes.apple.com/lookup?id=${APP_ID}&country=${country}`);
  const app = data?.results?.[0];
  if (!app) return null;
  return {
    country,
    count: app.userRatingCount ?? 0,
    average: app.averageUserRating ?? 0,
    countThisVersion: app.userRatingCountForCurrentVersion ?? 0,
    version: app.version ?? null,
  };
}

async function reviewsFor(country) {
  const data = await getJson(
    `https://itunes.apple.com/${country}/rss/customerreviews/id=${APP_ID}/sortby=mostrecent/json`,
  );
  const entries = data?.feed?.entry;
  if (!Array.isArray(entries)) return [];
  // The first entry of the feed is the app itself, not a review.
  return entries
    .filter((e) => e?.['im:rating']?.label)
    .map((e) => ({
      country,
      rating: Number(e['im:rating'].label),
      title: e.title?.label ?? '',
      body: (e.content?.label ?? '').replace(/\s+/g, ' ').slice(0, 300),
      version: e['im:version']?.label ?? null,
      author: e.author?.name?.label ?? '',
      updated: e.updated?.label ?? null,
    }));
}

async function showHistory() {
  let lines = [];
  try {
    lines = (await readFile(HISTORY, 'utf8')).trim().split('\n').filter(Boolean);
  } catch {
    console.log('No history yet. Run with --record to start one.');
    return;
  }
  let prevTotal = null;
  for (const line of lines) {
    const row = JSON.parse(line);
    const change = prevTotal === null ? '' : ` (${row.total - prevTotal >= 0 ? '+' : ''}${row.total - prevTotal})`;
    prevTotal = row.total;
    console.log(`${row.at.slice(0, 10)}  ${String(row.total).padStart(4)} ratings${change}  avg ${row.averageUs ?? '-'}  ${row.perCountry}`);
  }
}

async function main() {
  if (process.argv.includes('--history')) return showHistory();

  const rows = (await Promise.all(COUNTRIES.map(ratingsFor))).filter(Boolean);
  const withRatings = rows.filter((r) => r.count > 0);
  const total = withRatings.reduce((n, r) => n + r.count, 0);

  console.log(`Semora ratings — ${new Date().toISOString().slice(0, 10)}`);
  console.log(`${'country'.padEnd(9)}${'ratings'.padStart(8)}${'average'.padStart(9)}${'this version'.padStart(14)}`);
  for (const r of withRatings.sort((a, b) => b.count - a.count)) {
    console.log(
      r.country.toUpperCase().padEnd(9) +
        String(r.count).padStart(8) +
        r.average.toFixed(1).padStart(9) +
        String(r.countThisVersion).padStart(14),
    );
  }
  console.log(`${'TOTAL'.padEnd(9)}${String(total).padStart(8)}`);
  const silent = rows.filter((r) => r.count === 0).map((r) => r.country.toUpperCase());
  if (silent.length) console.log(`\nNo ratings yet in: ${silent.join(', ')}`);

  const reviews = (await Promise.all(withRatings.map((r) => reviewsFor(r.country)))).flat();
  console.log(`\nWritten reviews: ${reviews.length}`);
  for (const r of reviews) {
    console.log(`  ${r.country.toUpperCase()} ${'★'.repeat(r.rating)} "${r.title}" — ${r.body}`);
    console.log(`     v${r.version ?? '?'}  ${r.updated?.slice(0, 10) ?? ''}  by ${r.author}`);
  }

  if (process.argv.includes('--record')) {
    const row = {
      at: new Date().toISOString(),
      total,
      averageUs: withRatings.find((r) => r.country === 'us')?.average ?? null,
      version: rows[0]?.version ?? null,
      writtenReviews: reviews.length,
      perCountry: withRatings.map((r) => `${r.country}:${r.count}`).join(' '),
    };
    await mkdir(dirname(HISTORY), { recursive: true });
    await appendFile(HISTORY, `${JSON.stringify(row)}\n`);
    console.log(`\nRecorded to ${HISTORY}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
