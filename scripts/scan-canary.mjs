#!/usr/bin/env node
/**
 * Syllabus-scan canary.
 *
 * Semora's entire value proposition is one flow: point it at a syllabus, get a
 * semester back. On 2026-08-06 that flow returned 502 on EVERY request for an
 * unknown length of time — OpenAI had started rejecting the request shape
 * (`text.format: json_object` requires the word "json" in the INPUT messages,
 * not just in `instructions`). Nothing surfaced it. It was found by accident.
 *
 * This exercises the real thing end to end — sign-in, RLS, quota accounting,
 * the live model call, server-side validation, response shape — against the
 * deployed edge function. No mocks, no stubs: if this passes, a student can
 * scan a syllabus right now.
 *
 * Failure taxonomy matters more than coverage here. A canary that cries wolf
 * gets muted, and a muted canary is worse than none, so:
 *
 *   HARD (exit 1, wakes someone) — the flow is DOWN. Auth rejected, non-200,
 *     unparseable body, or zero items returned. These cannot happen while
 *     scanning works.
 *   SOFT (exit 0, logged)        — the flow WORKS but drifted. Fewer items
 *     than the fixture contains, a missing known date, unusual latency. Model
 *     output varies run to run; treating that as an outage would train you to
 *     ignore the alert that matters.
 *
 * Usage:  node scripts/scan-canary.mjs
 * Env:    SEMORA_SUPABASE_URL, SEMORA_SUPABASE_ANON_KEY,
 *         SEMORA_CANARY_EMAIL, SEMORA_CANARY_PASSWORD
 */

const URL_BASE = process.env.SEMORA_SUPABASE_URL?.replace(/\/$/, '');
const ANON = process.env.SEMORA_SUPABASE_ANON_KEY;
const EMAIL = process.env.SEMORA_CANARY_EMAIL;
const PASSWORD = process.env.SEMORA_CANARY_PASSWORD;

const SLOW_SCAN_MS = 45_000;

/**
 * A syllabus the model has never seen, with deadlines stated in three
 * different formats. Pasted text rather than an image: it is the cheapest
 * shape that still crosses every boundary that broke last time, and it keeps
 * the canary deterministic enough to run unattended.
 */
const FIXTURE = `
ASTR 214 — Observational Astrophysics
Fall 2026 | Tue/Thu 9:30-10:45 AM, Kepler Hall 118
Instructor: Dr. R. Okonkwo — office hours Wed 2:00-4:00 PM, Kepler 402

GRADING
  Problem Sets (5)      30%
  Midterm Exam          25%
  Observing Project     20%
  Final Exam            25%

SCHEDULE
  Problem Set 1 due September 11, 2026
  Problem Set 2 due 09/25/2026
  Midterm Exam — Thursday, October 15, 2026, in class
  Observing Project proposal due Oct 30, 2026
  Problem Set 3 due November 6, 2026
  Final Exam: December 14, 2026, 8:00 AM
`.trim();

// Dates the fixture states unambiguously. Extraction quality is a soft signal,
// so a miss here reports rather than fails.
const EXPECTED_DATES = ['2026-09-11', '2026-10-15', '2026-12-14'];

const hard = [];
const soft = [];

function fail(msg) { hard.push(msg); }
function warn(msg) { soft.push(msg); }

async function main() {
  const missing = [
    ['SEMORA_SUPABASE_URL', URL_BASE], ['SEMORA_SUPABASE_ANON_KEY', ANON],
    ['SEMORA_CANARY_EMAIL', EMAIL], ['SEMORA_CANARY_PASSWORD', PASSWORD],
  ].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`config error: missing ${missing.join(', ')}`);
    process.exit(2); // 2 = cannot run, distinct from 1 = product is down
  }

  // ── 1. Sign in ────────────────────────────────────────────────────────────
  let token;
  try {
    const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.access_token) {
      fail(`sign-in failed (HTTP ${res.status}): ${body.error_description || body.msg || 'no access_token'}`);
      return;
    }
    token = body.access_token;
  } catch (err) {
    fail(`sign-in threw: ${err.message}`);
    return;
  }

  // ── 2. Scan ───────────────────────────────────────────────────────────────
  const started = Date.now();
  let res, body;
  try {
    res = await fetch(`${URL_BASE}/functions/v1/parse-syllabus`, {
      method: 'POST',
      headers: {
        apikey: ANON,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // apiVersion 2 = this client renders dateless items, so the server
      // returns them instead of silently dropping them.
      body: JSON.stringify({ text: FIXTURE, apiVersion: 2 }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    fail(`scan request threw after ${Date.now() - started}ms: ${err.message}`);
    return;
  }
  const elapsed = Date.now() - started;

  const raw = await res.text();
  try {
    body = JSON.parse(raw);
  } catch {
    fail(`scan returned unparseable body (HTTP ${res.status}): ${raw.slice(0, 300)}`);
    return;
  }

  if (!res.ok) {
    // Not every non-200 means the product is down, and getting this wrong in
    // the loud direction is how a canary earns a mail filter.
    //
    //   429 — THIS ACCOUNT hit its own 20/24h cap. Scanning works fine for
    //         everyone else. Common when the canary shares an account with a
    //         human (see the workflow note about a dedicated account).
    //   402 — the canary account is no longer Pro, so it can't reach the model
    //         at all. Nothing is proven either way: that's a broken canary,
    //         not a broken product.
    //   503 — the global circuit breaker or an infra dependency. Everyone is
    //         down. This is exactly what we want to be woken for.
    if (res.status === 429) {
      warn(`canary account rate-limited (429): ${body.error || ''} — flow not exercised this run`);
      return;
    }
    if (res.status === 402) {
      console.error(`config error: canary account lacks Pro (402): ${body.error || ''}`);
      process.exit(2);
    }
    // The 2026-08-06 outage landed here: HTTP 502 on every single scan.
    fail(`scan failed HTTP ${res.status}: ${body.error || raw.slice(0, 300)}`);
    return;
  }

  // ── 3. Assert the response is actually usable ─────────────────────────────
  if (!Array.isArray(body.items)) {
    fail(`response has no items array (keys: ${Object.keys(body).join(', ') || 'none'})`);
    return;
  }
  if (body.items.length === 0) {
    // A 200 carrying nothing is a silent outage — the user sees "no deadlines
    // found" and assumes their syllabus is the problem.
    fail('scan returned 200 with zero items — silent extraction failure');
    return;
  }

  console.log(`✓ scan OK — ${body.items.length} items in ${(elapsed / 1000).toFixed(1)}s` +
    `, course=${JSON.stringify(body.course_name ?? null)}, model=${body.gemini_model ?? 'unknown'}`);

  // ── 4. Quality signals (soft) ─────────────────────────────────────────────
  if (body.items.length < 4) {
    warn(`only ${body.items.length} items extracted; fixture states 6`);
  }
  const found = new Set(body.items.map((i) => i.due_date).filter(Boolean));
  const missed = EXPECTED_DATES.filter((d) => !found.has(d));
  if (missed.length) warn(`expected dates not extracted: ${missed.join(', ')}`);
  if (!body.course_name) warn('no course_name extracted');
  if (elapsed > SLOW_SCAN_MS) warn(`scan took ${(elapsed / 1000).toFixed(1)}s (> ${SLOW_SCAN_MS / 1000}s)`);

  // A date the fixture never mentions means dates are being invented, which is
  // worse than missing them — students would put a wrong deadline in a calendar.
  const stated = new Set([...EXPECTED_DATES, '2026-09-25', '2026-10-30', '2026-11-06']);
  const invented = [...found].filter((d) => !stated.has(d));
  if (invented.length) warn(`dates not present in the fixture: ${invented.join(', ')}`);
}

await main();

for (const w of soft) console.warn(`⚠ ${w}`);

if (hard.length) {
  console.error('\n✗ SYLLABUS SCANNING IS DOWN');
  for (const h of hard) console.error(`  ${h}`);
  process.exit(1);
}
console.log(soft.length ? `\n✓ flow healthy (${soft.length} quality warning(s))` : '\n✓ flow healthy');
