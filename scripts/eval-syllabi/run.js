#!/usr/bin/env node
/* Golden-syllabus extraction eval harness.

   For every fixtures/NAME.(pdf|png|jpg|jpeg|webp|heic) with a sibling
   fixtures/NAME.expected.json, POSTs the file to the DEPLOYED parse-syllabus
   edge function exactly the way the app does (see lib/gemini.ts: JSON body
   { base64, mimeType }, Authorization: Bearer <user JWT>), then scores the
   extraction against the handwritten expectations and prints per-fixture
   tables + an aggregate summary. Exits non-zero when aggregate item recall
   or due-date accuracy falls below the thresholds (default 0.9 each).

   ⚠ EVERY FIXTURE BURNS A REAL GEMINI CALL, counted against the signed-in
   account's rolling 24h server cap (20/day) — a 20-fixture run consumes the
   entire day's quota. Use a dedicated Pro test account (see README.md).

   Usage:
     SUPABASE_URL=... EVAL_JWT=... node scripts/eval-syllabi/run.js [flags]
   Flags:
     --fixtures-dir <dir>     default: <this dir>/fixtures
     --only a,b               run only these fixture names
     --delay <ms>             pause between fixtures (default 2500)
     --min-recall <0..1>      aggregate item-recall threshold (default 0.9)
     --min-date-acc <0..1>    aggregate due-date accuracy threshold (default 0.9)
     --date-tolerance <days>  due-date slack when scoring (default 0 = exact)
     --json <path>            also write machine-readable results
     --self-test              run the scorer against canned responses (NO
                              network, NO quota) and exit

   Plain Node (>=18 for global fetch), zero npm deps — the fuzzy-matching
   helpers below are vendored on purpose so this script never touches the
   app's package.json.

   Response-shape tolerance: the scorer accepts BOTH the current edge-function
   shape (items always have a valid due_date) and the upcoming one (items may
   have due_date: null and a date_suspect flag; unknown extra fields are
   ignored everywhere). A dateless expected item (due_date: null) only matches
   an extracted item that ALSO has a null due_date — under the old server it
   simply scores as a recall miss, which is the honest reading. */
'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const HERE = __dirname;

const MIME_BY_EXT = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.heic': 'image/heic',
};

function parseArgs(argv) {
  const args = {
    fixturesDir: path.join(HERE, 'fixtures'),
    only: null,
    delay: 2500,
    minRecall: 0.9,
    minDateAcc: 0.9,
    dateTolerance: 0,
    json: null,
    selfTest: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      i++;
      if (i >= argv.length) fail(`Missing value for ${a}`);
      return argv[i];
    };
    if (a === '--fixtures-dir') args.fixturesDir = path.resolve(next());
    else if (a === '--only') args.only = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--delay') args.delay = Number(next());
    else if (a === '--min-recall') args.minRecall = Number(next());
    else if (a === '--min-date-acc') args.minDateAcc = Number(next());
    else if (a === '--date-tolerance') args.dateTolerance = Number(next());
    else if (a === '--json') args.json = path.resolve(next());
    else if (a === '--self-test') args.selfTest = true;
    else fail(`Unknown flag: ${a}`);
  }
  return args;
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(2);
}

// SUPABASE_URL can come from the env or fall back to the repo's .env.local
// (EXPO_PUBLIC_SUPABASE_URL) so a plain `EVAL_JWT=... node run.js` works.
function resolveSupabaseUrl() {
  if (process.env.SUPABASE_URL) return process.env.SUPABASE_URL.replace(/\/$/, '');
  try {
    const envLocal = fs.readFileSync(path.join(HERE, '..', '..', '.env.local'), 'utf8');
    const m = envLocal.match(/^EXPO_PUBLIC_SUPABASE_URL=(.+)$/m);
    if (m) return m[1].trim().replace(/\/$/, '');
  } catch {
    /* no .env.local — fall through to the error below */
  }
  return null;
}

// ---------------------------------------------------------------------------
// Vendored fuzzy-matching helpers (no deps)
// ---------------------------------------------------------------------------
function normText(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Classic two-row Levenshtein; strings here are short titles so O(n*m) is fine.
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

// Similarity in [0,1]: max of normalized Levenshtein and token-set Dice.
// Both are needed — Levenshtein handles "HW 1" vs "HW1", token overlap
// handles reordering/expansion like "Midterm Exam" vs "Exam: Midterm".
function titleSimilarity(a, b) {
  const na = normText(a);
  const nb = normText(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  const lev = 1 - levenshtein(na, nb) / Math.max(na.length, nb.length);
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const dice = (2 * inter) / (ta.size + tb.size);
  return Math.max(lev, dice);
}

function isDateStr(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function daysBetween(a, b) {
  const toUtc = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.abs(toUtc(a) - toUtc(b)) / 86400000;
}

// Proximity in [0,1] used ONLY for pairing candidates (field scoring is
// stricter). null-vs-null is a perfect signal match: a dateless expected item
// should pair with the extracted dateless item, not with a dated one.
function dateProximity(expected, actual) {
  const e = expected ?? null;
  const a = actual ?? null;
  if (e === null && a === null) return 1;
  if (e === null || a === null) return 0;
  if (!isDateStr(e) || !isDateStr(a)) return 0;
  const d = daysBetween(e, a);
  if (d === 0) return 1;
  if (d <= 3) return 0.7;
  if (d <= 10) return 0.4;
  return 0;
}

// Strip the ":00" seconds the edge function pads onto meeting times so
// expected files can use plain "HH:MM" regardless of server version.
function normTime(t) {
  if (typeof t !== 'string') return null;
  const m = t.match(/^(\d{2}:\d{2})(:\d{2})?$/);
  return m ? m[1] : null;
}

function sameDaySet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  const sa = [...new Set(a)].sort().join(',');
  const sb = [...new Set(b)].sort().join(',');
  return sa === sb;
}

// ---------------------------------------------------------------------------
// Item matching: greedy assignment on combined title+date score
// ---------------------------------------------------------------------------
const MATCH_MIN_TITLE_SIM = 0.35;
const MATCH_MIN_SCORE = 0.5;
const TITLE_OK_SIM = 0.8;

function matchItems(expectedItems, extractedItems) {
  const candidates = [];
  expectedItems.forEach((e, i) => {
    extractedItems.forEach((x, j) => {
      const sim = titleSimilarity(e.title, x.title);
      const prox = dateProximity(e.due_date, x.due_date);
      const score = 0.75 * sim + 0.25 * prox;
      if (sim >= MATCH_MIN_TITLE_SIM && score >= MATCH_MIN_SCORE) {
        candidates.push({ i, j, sim, prox, score });
      }
    });
  });
  candidates.sort((a, b) => b.score - a.score);
  const usedE = new Set();
  const usedX = new Set();
  const pairs = [];
  for (const c of candidates) {
    if (usedE.has(c.i) || usedX.has(c.j)) continue;
    usedE.add(c.i);
    usedX.add(c.j);
    pairs.push(c);
  }
  return { pairs, usedE, usedX };
}

// ---------------------------------------------------------------------------
// Scoring one fixture
// ---------------------------------------------------------------------------
function scoreFixture(expected, extraction, opts) {
  const dateTolerance = opts?.dateTolerance ?? 0;
  const expectedItems = Array.isArray(expected.items) ? expected.items : [];
  const extractedItems = Array.isArray(extraction.items) ? extraction.items : [];

  const { pairs, usedE, usedX } = matchItems(expectedItems, extractedItems);

  // Per-field tallies over matched pairs. Fields absent from the expected
  // item are skipped, not counted — expectations are opt-in per field.
  const fields = {
    title: { ok: 0, total: 0 },
    due_date: { ok: 0, total: 0 },
    type: { ok: 0, total: 0 },
    weight: { ok: 0, total: 0 },
    due_time: { ok: 0, total: 0 },
    date_suspect: { ok: 0, total: 0, skipped: 0 },
  };
  let titleSimSum = 0;

  const rows = [];
  const pairByExpected = new Map(pairs.map((p) => [p.i, p]));

  expectedItems.forEach((e, i) => {
    const p = pairByExpected.get(i);
    if (!p) {
      rows.push({ expected: e, matched: null });
      return;
    }
    const x = extractedItems[p.j];
    const row = { expected: e, matched: x, sim: p.sim, checks: {} };

    fields.title.total++;
    titleSimSum += p.sim;
    row.checks.title = p.sim >= TITLE_OK_SIM;
    if (row.checks.title) fields.title.ok++;

    // due_date: exact (or within tolerance); null must match null. An
    // extracted date where none exists in the document (or vice versa) is
    // a real error, not a near-miss.
    fields.due_date.total++;
    const eDate = e.due_date ?? null;
    const xDate = x.due_date ?? null;
    row.checks.due_date =
      eDate === null || xDate === null
        ? eDate === xDate
        : isDateStr(eDate) && isDateStr(xDate) && daysBetween(eDate, xDate) <= dateTolerance;
    if (row.checks.due_date) fields.due_date.ok++;

    // type: expected may be a string or an array of acceptable values (for
    // genuinely ambiguous items like a "midterm essay").
    if (e.type !== undefined) {
      fields.type.total++;
      const accepted = Array.isArray(e.type) ? e.type : [e.type];
      row.checks.type = accepted.includes(x.type);
      if (row.checks.type) fields.type.ok++;
    }

    if ('weight' in e) {
      fields.weight.total++;
      const ew = e.weight ?? null;
      const xw = typeof x.weight === 'number' ? x.weight : null;
      row.checks.weight =
        ew === null ? xw === null : xw !== null && Math.abs(ew - xw) <= 0.011;
      if (row.checks.weight) fields.weight.ok++;
    }

    if ('due_time' in e) {
      fields.due_time.total++;
      const et = e.due_time === null ? null : normTime(e.due_time);
      const xt = x.due_time == null ? null : normTime(x.due_time);
      row.checks.due_time = et === xt;
      if (row.checks.due_time) fields.due_time.ok++;
    }

    // date_suspect: only meaningful under the NEW edge function. When the
    // matched item doesn't carry the field at all (old deployment), record a
    // skip instead of a failure so old/new servers score identically on
    // everything else.
    if (e.date_suspect === true) {
      if (Object.prototype.hasOwnProperty.call(x, 'date_suspect')) {
        fields.date_suspect.total++;
        row.checks.date_suspect = x.date_suspect === true;
        if (row.checks.date_suspect) fields.date_suspect.ok++;
      } else {
        fields.date_suspect.skipped++;
        row.checks.date_suspect = 'skip';
      }
    }

    rows.push(row);
  });

  const unmatchedExtracted = extractedItems
    .map((x, j) => ({ x, j }))
    .filter(({ j }) => !usedX.has(j))
    .map(({ x }) => x);

  // -------------------------------------------------------------------------
  // Course / semester / meeting checks — opt-in via keys in expected.json
  // -------------------------------------------------------------------------
  const courseChecks = [];
  const check = (label, ok, detail) => courseChecks.push({ label, ok, detail });

  if (expected.course_name !== undefined) {
    const sim = titleSimilarity(expected.course_name, extraction.course_name);
    check('course_name', sim >= 0.7, `sim ${sim.toFixed(2)} — got "${extraction.course_name ?? ''}"`);
  }
  if (expected.course_code !== undefined) {
    const norm = (s) => String(s ?? '').toUpperCase().replace(/\s+/g, '');
    check('course_code', norm(expected.course_code) === norm(extraction.course_code), `got "${extraction.course_code ?? ''}"`);
  }
  if (expected.instructor !== undefined) {
    // Honorifics vary freely ("Dr." vs "Professor") — strip them before comparing.
    const strip = (s) => normText(s).replace(/\b(dr|prof|professor|mr|ms|mrs)\b/g, '').trim();
    const sim = titleSimilarity(strip(expected.instructor), strip(extraction.instructor));
    check('instructor', sim >= 0.6, `got "${extraction.instructor ?? ''}"`);
  }
  if (expected.semester_name !== undefined) {
    check(
      'semester_name',
      normText(expected.semester_name) === normText(extraction.semester_name),
      `got "${extraction.semester_name ?? ''}"`,
    );
  }
  for (const key of ['semester_start', 'semester_end']) {
    if (expected[key] !== undefined) {
      check(key, (expected[key] ?? null) === (extraction[key] ?? null), `got "${extraction[key] ?? ''}"`);
    }
  }
  if (Array.isArray(expected.meetings)) {
    const got = Array.isArray(extraction.meetings) ? extraction.meetings : [];
    let matched = 0;
    for (const em of expected.meetings) {
      const hit = got.some(
        (gm) =>
          sameDaySet(em.days_of_week, gm.days_of_week) &&
          (em.start_time === undefined || normTime(em.start_time) === normTime(gm.start_time)) &&
          (em.end_time === undefined || normTime(em.end_time) === normTime(gm.end_time)) &&
          (em.kind === undefined || em.kind === gm.kind),
      );
      if (hit) matched++;
    }
    check('meetings', matched === expected.meetings.length, `${matched}/${expected.meetings.length} matched (extracted ${got.length})`);
  }
  if (Array.isArray(expected.office_hours_blocks)) {
    const got = Array.isArray(extraction.office_hours_blocks) ? extraction.office_hours_blocks : [];
    let matched = 0;
    for (const eo of expected.office_hours_blocks) {
      const hit = got.some(
        (go) =>
          (eo.days_of_week == null ? go.days_of_week == null : sameDaySet(eo.days_of_week, go.days_of_week)) &&
          (eo.start_time === undefined || normTime(eo.start_time) === normTime(go.start_time)) &&
          (eo.end_time === undefined || normTime(eo.end_time) === normTime(go.end_time)),
      );
      if (hit) matched++;
    }
    check('office_hours', matched === expected.office_hours_blocks.length, `${matched}/${expected.office_hours_blocks.length} matched (extracted ${got.length})`);
  }
  if (Array.isArray(expected.grade_scale)) {
    const got = Array.isArray(extraction.grade_scale) ? extraction.grade_scale : [];
    const gotSet = new Set(got.map((g) => `${String(g.letter).toUpperCase()}:${g.min}`));
    const missing = expected.grade_scale.filter(
      (g) => !gotSet.has(`${String(g.letter).toUpperCase()}:${g.min}`),
    );
    check(
      'grade_scale',
      missing.length === 0,
      missing.length === 0
        ? `all ${expected.grade_scale.length} cutoffs present`
        : `missing ${missing.map((g) => g.letter).join(', ')}`,
    );
  }

  return {
    rows,
    fields,
    titleSimAvg: fields.title.total ? titleSimSum / fields.title.total : 0,
    expectedCount: expectedItems.length,
    extractedCount: extractedItems.length,
    matchedCount: pairs.length,
    unmatchedExtracted,
    courseChecks,
  };
}

// ---------------------------------------------------------------------------
// Network: call the deployed edge function exactly like lib/gemini.ts does
// ---------------------------------------------------------------------------
async function callParseSyllabus(supabaseUrl, jwt, filePath, mimeType) {
  const base64 = fs.readFileSync(filePath).toString('base64');
  const response = await fetch(`${supabaseUrl}/functions/v1/parse-syllabus`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    // Node's fetch sets Content-Length for string bodies, which the edge
    // function requires (it 411s chunked requests).
    body: JSON.stringify({ base64, mimeType }),
  });
  const body = await response.json().catch(() => ({ error: response.statusText }));
  return { status: response.status, ok: response.ok, body };
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------
const pct = (n, d) => (d === 0 ? '  n/a' : `${((n / d) * 100).toFixed(0).padStart(3)}%`);
const ratio = (n, d) => (d === 0 ? 'n/a' : (n / d).toFixed(2));
const mark = (v) => (v === true ? 'Y' : v === false ? 'X' : v === 'skip' ? '~' : '-');
const trunc = (s, n) => {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

function renderTable(headers, rows) {
  const all = [headers, ...rows.map((r) => r.map((c) => String(c ?? '')))];
  const widths = headers.map((_, c) => Math.max(...all.map((r) => r[c].length)));
  const line = (cells) => '  ' + cells.map((v, c) => v.padEnd(widths[c])).join('  ');
  const out = [line(headers), line(widths.map((w) => '-'.repeat(w)))];
  for (const r of all.slice(1)) out.push(line(r));
  return out.join('\n');
}

function printFixtureResult(name, result) {
  console.log(`\n━━ ${name} ${'━'.repeat(Math.max(2, 58 - name.length))}`);
  if (result.error) {
    console.log(`  FAILED: ${result.error}`);
    if (result.expectedCount) {
      console.log(`  (all ${result.expectedCount} expected items scored as misses)`);
    }
    return;
  }
  if (result.negativePass) {
    console.log('  PASS: correctly rejected as NOT_SYLLABUS (negative fixture)');
    return;
  }
  const s = result.score;
  console.log(
    `  items: expected ${s.expectedCount} · extracted ${s.extractedCount} · matched ${s.matchedCount}` +
      `  →  precision ${ratio(s.matchedCount, s.extractedCount)} · recall ${ratio(s.matchedCount, s.expectedCount)}`,
  );
  const rows = s.rows.map((r) => [
    trunc(r.expected.title, 30),
    r.matched ? trunc(r.matched.title, 30) : '— UNMATCHED —',
    r.matched ? mark(r.checks.due_date) : '-',
    r.matched ? mark(r.checks.type) : '-',
    r.matched ? mark(r.checks.weight) : '-',
    r.matched && 'due_time' in r.checks ? mark(r.checks.due_time) : '·',
    r.matched && 'date_suspect' in r.checks ? mark(r.checks.date_suspect) : '·',
  ]);
  console.log(renderTable(['EXPECTED', 'MATCHED', 'DATE', 'TYPE', 'WT', 'TIME', 'SUS'], rows));
  if (s.unmatchedExtracted.length) {
    console.log(
      `  extra extracted (not in expected): ${s.unmatchedExtracted.map((x) => `"${trunc(x.title, 30)}"`).join(', ')}`,
    );
  }
  if (s.courseChecks.length) {
    const failing = s.courseChecks.filter((c) => !c.ok);
    const passing = s.courseChecks.filter((c) => c.ok).map((c) => c.label);
    console.log(`  course fields ok: ${passing.length ? passing.join(', ') : '(none)'}`);
    for (const f of failing) console.log(`  course field FAIL: ${f.label} — ${f.detail}`);
  }
  if (s.fields.date_suspect.skipped) {
    console.log(
      `  note: ${s.fields.date_suspect.skipped} date_suspect expectation(s) skipped — server response has no date_suspect field (old deployment)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Aggregate + thresholds
// ---------------------------------------------------------------------------
function aggregate(results) {
  const agg = {
    fixtures: results.length,
    errored: 0,
    expected: 0,
    extracted: 0,
    matched: 0,
    fields: {
      title: { ok: 0, total: 0 },
      due_date: { ok: 0, total: 0 },
      type: { ok: 0, total: 0 },
      weight: { ok: 0, total: 0 },
      due_time: { ok: 0, total: 0 },
      date_suspect: { ok: 0, total: 0, skipped: 0 },
    },
    courseOk: 0,
    courseTotal: 0,
  };
  for (const r of results) {
    if (r.error) {
      // Errored fixture (NOT_SYLLABUS, HTTP failure): its expected items count
      // toward the recall denominator with zero matches — an eval run must not
      // look better because a fixture failed outright. Unmatched expected
      // items also count as due-date misses for the same reason.
      agg.errored++;
      agg.expected += r.expectedCount ?? 0;
      agg.fields.due_date.total += r.expectedCount ?? 0;
      continue;
    }
    const s = r.score;
    agg.expected += s.expectedCount;
    agg.extracted += s.extractedCount;
    agg.matched += s.matchedCount;
    for (const key of Object.keys(agg.fields)) {
      agg.fields[key].ok += s.fields[key].ok;
      agg.fields[key].total += s.fields[key].total;
      if (key === 'date_suspect') agg.fields[key].skipped += s.fields[key].skipped;
    }
    // Unmatched expected items are due-date misses in the aggregate metric
    // (matched-only accuracy would reward dropping hard items entirely).
    agg.fields.due_date.total += s.expectedCount - s.matchedCount;
    agg.courseOk += s.courseChecks.filter((c) => c.ok).length;
    agg.courseTotal += s.courseChecks.length;
  }
  // null = vacuous (no denominator, e.g. a run of only negative fixtures) —
  // treated as passing, printed as n/a. Zero would fail a run that in fact
  // checked nothing it could have failed.
  agg.precision = agg.extracted ? agg.matched / agg.extracted : null;
  agg.recall = agg.expected ? agg.matched / agg.expected : null;
  agg.dateAcc = agg.fields.due_date.total ? agg.fields.due_date.ok / agg.fields.due_date.total : null;
  return agg;
}

function printAggregate(agg, args) {
  console.log(`\n${'═'.repeat(64)}`);
  console.log('AGGREGATE SUMMARY');
  console.log(`${'═'.repeat(64)}`);
  console.log(`  fixtures: ${agg.fixtures} (${agg.errored} errored)`);
  console.log(`  items:    expected ${agg.expected} · extracted ${agg.extracted} · matched ${agg.matched}`);
  const fmt = (v) => (v === null ? 'n/a  ' : v.toFixed(3));
  console.log(`  item precision:      ${fmt(agg.precision)}`);
  console.log(`  item recall:         ${fmt(agg.recall)}   (threshold ${args.minRecall})`);
  console.log(`  due-date accuracy:   ${fmt(agg.dateAcc)}   (threshold ${args.minDateAcc}; over ALL expected items)`);
  console.log(`  title accuracy:      ${pct(agg.fields.title.ok, agg.fields.title.total)}  (sim ≥ ${TITLE_OK_SIM} on matched)`);
  console.log(`  type accuracy:       ${pct(agg.fields.type.ok, agg.fields.type.total)}  (matched pairs)`);
  console.log(`  weight accuracy:     ${pct(agg.fields.weight.ok, agg.fields.weight.total)}  (matched pairs)`);
  console.log(`  due_time accuracy:   ${pct(agg.fields.due_time.ok, agg.fields.due_time.total)}  (matched pairs)`);
  const ds = agg.fields.date_suspect;
  console.log(
    `  date_suspect flags:  ${ds.total ? pct(ds.ok, ds.total) : '  n/a'}  (${ds.ok}/${ds.total} checked, ${ds.skipped} skipped on old server)`,
  );
  console.log(`  course/semester/meeting checks: ${agg.courseOk}/${agg.courseTotal} passed`);
}

// ---------------------------------------------------------------------------
// Fixture discovery
// ---------------------------------------------------------------------------
function discoverFixtures(dir, only) {
  if (!fs.existsSync(dir)) fail(`Fixtures dir not found: ${dir}`);
  const names = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.expected.json'))
    .map((f) => f.slice(0, -'.expected.json'.length))
    .sort();
  const fixtures = [];
  for (const name of names) {
    if (only && !only.includes(name)) continue;
    const ext = Object.keys(MIME_BY_EXT).find((e) => fs.existsSync(path.join(dir, name + e)));
    if (!ext) {
      console.warn(`  ⚠ skipping "${name}": no ${name}.(pdf|png|jpg|jpeg|webp|heic) next to its expected.json — run gen-fixture.js?`);
      continue;
    }
    fixtures.push({
      name,
      file: path.join(dir, name + ext),
      mimeType: MIME_BY_EXT[ext],
      expected: JSON.parse(fs.readFileSync(path.join(dir, `${name}.expected.json`), 'utf8')),
    });
  }
  return fixtures;
}

// ---------------------------------------------------------------------------
// Self-test: exercises the scorer against canned OLD- and NEW-shape responses
// with zero network calls. Run after touching any scoring code.
// ---------------------------------------------------------------------------
function selfTest(args) {
  let failures = 0;
  const assert = (cond, label) => {
    console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`);
    if (!cond) failures++;
  };

  const expected = {
    course_name: 'CS 101 - Intro',
    course_code: 'CS 101',
    semester_name: 'Fall 2026',
    meetings: [{ days_of_week: [1, 3], start_time: '10:00', end_time: '10:50', kind: 'lecture' }],
    items: [
      { title: 'Homework 1', type: 'assignment', due_date: '2026-09-04', due_time: '23:59', weight: 6 },
      { title: 'Midterm Exam', type: 'exam', due_date: '2026-10-14', weight: 20 },
      { title: 'Final Essay', type: 'assignment', due_date: null, weight: 30 },
      { title: 'Quiz 1', type: 'quiz', due_date: '2026-09-16', weight: 4, date_suspect: true },
    ],
  };

  // OLD shape: no dateless items, no date_suspect field, seconds-padded times.
  const oldResp = {
    course_name: 'CS 101 - Intro to CS',
    course_code: 'CS101',
    instructor: null,
    semester_name: 'Fall 2026',
    semester_start: null,
    semester_end: null,
    grade_scale: null,
    meetings: [{ days_of_week: [3, 1], start_time: '10:00:00', end_time: '10:50:00', kind: 'lecture', location: null }],
    office_hours_blocks: [],
    items: [
      { title: 'HW 1', type: 'assignment', due_date: '2026-09-04', due_time: '23:59', weight: 6, description: null, confidence: 0.9 },
      { title: 'Exam: Midterm', type: 'exam', due_date: '2026-10-14', due_time: null, weight: 20, description: null, confidence: 0.9 },
      { title: 'Quiz 1', type: 'quiz', due_date: '2026-09-16', due_time: null, weight: 4, description: null, confidence: 0.9 },
    ],
  };
  console.log('\nself-test: OLD response shape');
  const so = scoreFixture(expected, oldResp, { dateTolerance: args.dateTolerance });
  assert(so.matchedCount === 3, 'matches 3 of 4 (dateless item unmatchable on old server)');
  assert(so.rows.find((r) => r.expected.title === 'Final Essay').matched === null, 'dateless expected item is a recall miss');
  assert(so.fields.due_date.ok === 3 && so.fields.due_date.total === 3, 'matched dates all correct');
  assert(so.fields.date_suspect.skipped === 1 && so.fields.date_suspect.total === 0, 'date_suspect skipped (field absent), not failed');
  assert(so.courseChecks.find((c) => c.label === 'meetings').ok, 'meetings match despite :00 seconds + day order');
  assert(so.courseChecks.find((c) => c.label === 'course_code').ok, 'course_code matches despite spacing');

  // NEW shape: dateless item present, date_suspect flags, extra unknown fields.
  const newResp = {
    ...oldResp,
    items: [
      ...oldResp.items.map((it) => ({ ...it, date_suspect: it.title === 'Quiz 1', page_index: 0 })),
      { title: 'Final Essay', type: 'assignment', due_date: null, due_time: null, weight: 30, description: 'TBA', confidence: 0.8, date_suspect: false },
      { title: 'Hallucinated Reading', type: 'reading', due_date: '2026-11-01', due_time: null, weight: null, confidence: 0.4, date_suspect: false },
    ],
    date_suspect_count: 1, // unknown top-level extras must be ignored
  };
  console.log('\nself-test: NEW response shape (dateless + date_suspect + extras)');
  const sn = scoreFixture(expected, newResp, { dateTolerance: args.dateTolerance });
  assert(sn.matchedCount === 4, 'all 4 expected items matched');
  const fe = sn.rows.find((r) => r.expected.title === 'Final Essay');
  assert(fe.matched && fe.checks.due_date === true, 'dateless item matched with null==null date correct');
  assert(sn.fields.date_suspect.total === 1 && sn.fields.date_suspect.ok === 1, 'date_suspect flag checked and correct');
  assert(sn.unmatchedExtracted.length === 1 && sn.unmatchedExtracted[0].title === 'Hallucinated Reading', 'hallucinated extra hurts precision only');
  assert(sn.fields.weight.ok === 4, 'weights all correct');

  // Aggregate math incl. an errored fixture.
  const agg = aggregate([
    { score: sn },
    { error: 'NOT_SYLLABUS', expectedCount: 2 },
  ]);
  console.log('\nself-test: aggregate with one errored fixture');
  assert(agg.expected === 6 && agg.matched === 4, 'errored fixture inflates denominator');
  assert(Math.abs(agg.recall - 4 / 6) < 1e-9, 'recall = 4/6');
  assert(agg.fields.due_date.total === 6, 'errored + unmatched items count as date misses');

  console.log(`\nself-test ${failures === 0 ? 'PASSED' : `FAILED (${failures})`}`);
  process.exit(failures === 0 ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = parseArgs(process.argv);
  if (args.selfTest) return selfTest(args);

  const supabaseUrl = resolveSupabaseUrl();
  if (!supabaseUrl) fail('Set SUPABASE_URL (or keep EXPO_PUBLIC_SUPABASE_URL in .env.local).');
  const jwt = process.env.EVAL_JWT;
  if (!jwt) fail('Set EVAL_JWT to a Supabase user access token — see scripts/eval-syllabi/README.md.');

  const fixtures = discoverFixtures(args.fixturesDir, args.only);
  if (fixtures.length === 0) fail(`No runnable fixtures in ${args.fixturesDir}. Run gen-fixture.js first.`);

  console.log(`Target: ${supabaseUrl}/functions/v1/parse-syllabus`);
  console.log(`Fixtures: ${fixtures.map((f) => f.name).join(', ')}`);
  console.log(
    `\n⚠ Each fixture burns ONE real Gemini call against this account's rolling` +
      `\n  24h server cap (20/day). This run will consume ${fixtures.length} of them.\n`,
  );

  const results = [];
  for (let i = 0; i < fixtures.length; i++) {
    const fx = fixtures[i];
    process.stdout.write(`[${i + 1}/${fixtures.length}] ${fx.name} … `);
    let res;
    try {
      res = await callParseSyllabus(supabaseUrl, jwt, fx.file, fx.mimeType);
    } catch (err) {
      console.log('network error');
      results.push({ name: fx.name, error: `network: ${err.message}`, expectedCount: (fx.expected.items || []).length });
      continue;
    }

    if (res.ok) {
      console.log('ok');
      if (fx.expected.expect_not_syllabus === true) {
        // Negative fixture: the server extracting a "course" from a receipt IS
        // the failure mode being tested.
        results.push({ name: fx.name, error: 'expected NOT_SYLLABUS but got an extraction', expectedCount: 0 });
      } else {
        results.push({
          name: fx.name,
          score: scoreFixture(fx.expected, res.body, { dateTolerance: args.dateTolerance }),
        });
      }
    } else if (res.status === 401) {
      // Every subsequent call would fail identically — stop before burning quota.
      console.log('auth failed');
      fail('401 from edge function — EVAL_JWT is invalid or expired (tokens last ~1h; mint a fresh one).');
    } else if (res.status === 429 || res.status === 402) {
      console.log(`quota (${res.status})`);
      fail(`${res.status}: ${res.body.error || 'quota exhausted'} — aborting run so remaining fixtures aren't wasted.`);
    } else {
      // NOT_SYLLABUS (422) and other server errors: per-fixture failure.
      const detail = res.body.code === 'NOT_SYLLABUS' ? 'NOT_SYLLABUS' : `HTTP ${res.status}: ${res.body.error || 'unknown error'}`;
      console.log(detail);
      if (fx.expected.expect_not_syllabus === true && res.body.code === 'NOT_SYLLABUS') {
        results.push({ name: fx.name, score: scoreFixture({ items: [] }, { items: [] }, args), negativePass: true });
      } else {
        results.push({ name: fx.name, error: detail, expectedCount: (fx.expected.items || []).length });
      }
    }

    // Sequential + delay on purpose: the edge function retries Gemini itself,
    // and parallel eval traffic competes with real users on the shared key.
    if (i < fixtures.length - 1) await sleep(args.delay);
  }

  for (const r of results) printFixtureResult(r.name, r);
  const agg = aggregate(results);
  printAggregate(agg, args);

  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify({ args: { ...args }, results, aggregate: agg }, null, 2));
    console.log(`\nWrote JSON results to ${args.json}`);
  }

  // null metrics are vacuous passes (nothing to measure); errored fixtures
  // fail the run outright — a golden eval where a fixture couldn't even be
  // scored is not a pass, even when the recall denominator happens to be 0
  // (e.g. a misbehaving negative fixture has no expected items).
  const recallOk = agg.recall === null || agg.recall >= args.minRecall;
  const dateOk = agg.dateAcc === null || agg.dateAcc >= args.minDateAcc;
  const erroredOk = agg.errored === 0;
  if (!recallOk || !dateOk || !erroredOk) {
    console.log(
      `\nRESULT: FAIL — ${[
        !recallOk ? `recall ${agg.recall.toFixed(3)} < ${args.minRecall}` : null,
        !dateOk ? `date accuracy ${agg.dateAcc.toFixed(3)} < ${args.minDateAcc}` : null,
        !erroredOk ? `${agg.errored} fixture(s) errored` : null,
      ]
        .filter(Boolean)
        .join('; ')}`,
    );
    process.exit(1);
  }
  console.log('\nRESULT: PASS');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(2);
});
