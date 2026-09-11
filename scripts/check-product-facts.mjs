/**
 * Fails if the marketing site states a product fact the app does not implement.
 *
 * The website and the app share zero code — different frameworks, separate
 * package.json, separate node_modules. Every number on semoraai.com is a
 * HAND-TYPED restatement of a constant in lib/. That is exactly how the site
 * ended up advertising a 7-day free trial that does not exist, calling Canvas
 * import free when it is Pro, and saying there was no iPad app when the binary
 * is universal. Each of those was live, and each was found by a person reading
 * the site rather than by anything automated.
 *
 * This closes that gap without coupling the two builds: it reads the app's
 * constants and greps the website's copy for contradictions. Cheap, and it
 * catches the whole class.
 *
 * Run:  node scripts/check-product-facts.mjs
 * Exit: 0 = consistent, 1 = drift found.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

/** Pull `export const NAME = <number>` out of a source file. */
function constant(file, name) {
  const m = read(file).match(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`));
  if (!m) throw new Error(`could not find ${name} in ${file} — did it get renamed?`);
  return Number(m[1]);
}

const app = {
  freeCourses: constant('lib/syllabus.ts', 'FREE_COURSE_LIMIT'),
  freeSemesters: constant('lib/syllabus.ts', 'FREE_SEMESTER_LIMIT'),
  planHorizon: constant('lib/studyPlanner.ts', 'STUDY_PLAN_HORIZON_DAYS'),
  freePlanHorizon: constant('lib/studyPlanner.ts', 'FREE_STUDY_PLAN_HORIZON_DAYS'),
};

const facts = read('website/lib/semora-facts.ts');
const failures = [];

/** The site must contain this phrase — proves the number was updated in sync. */
function mustSay(phrase, why) {
  if (!facts.includes(phrase)) failures.push(`missing "${phrase}" — ${why}`);
}

/** The site must NOT contain this — a claim the product does not honour. */
function mustNotSay(pattern, why) {
  const m = facts.match(pattern);
  if (m) failures.push(`found "${m[0]}" — ${why}`);
}

// Singular-aware: at a limit of 1 the old template produced "Up to 1 courses",
// which is the sentence a limit change writes for you when the plural is
// hardcoded beside an interpolated number.
// Anchored on the NUMBER next to the thing it limits, not on a sentence
// opener. The previous assertion demanded the literal "Up to 1 course", so
// rewording the bullet to lead with the Canvas exemption tripped it even
// though the number was still right — a guard that fails on rephrasing
// teaches people to route around it.
mustSay(
  `${app.freeCourses} ${app.freeCourses === 1 ? 'course' : 'courses'} you add by hand`,
  `lib/syllabus.ts says FREE_COURSE_LIMIT = ${app.freeCourses}`,
);
// Canvas sync is free for everyone while the canvas_free promo runs (migration
// 090), so the site must not sell it as a Pro feature. This is the claim that
// costs the most when it is wrong: it tells a student the thing they can have
// for nothing costs money, and they leave.
mustNotSay(
  /Canvas[^.]{0,60}(is|part of|requires)\s+Pro|Pro[^.]{0,40}(includes|adds)[^.]{0,30}Canvas import/i,
  'Canvas sync is free while the canvas_free promo is active (migration 090)',
);
// ─── Canvas is free, and the course cap does not apply to it ─────────────
//
// The negative check above only fires on the word "Canvas". It sailed past
// "Pro adds unlimited courses and scans, LMS connections, adaptive planning"
// on both homepages, which told a free reader in the plainest possible terms
// that the thing they can have for nothing costs $3.99 — the exact claim this
// file was written to prevent, wearing a different noun.
// Scanned across the PAGES too, not just the facts file. The claim this
// catches lived in app/(en)/page.tsx and app/(es)/es/page.tsx, which
// mustNotSay never opens — the same one-file blind spot that let the
// four-course claim run for sixteen days.
const LMS_IS_PRO =
  /Pro[^.'"\n]{0,60}\b(adds|includes|a\u00f1ade|incluye)\b[^.'"\n]{0,60}\bLMS\b|\bLMS\b[^.'"\n]{0,40}(is|requires|needs)\s+Pro/i;
for (const file of [
  'website/lib/semora-facts.ts',
  'website/lib/es-facts.ts',
  'website/app/(en)/page.tsx',
  'website/app/(es)/es/page.tsx',
  'website/app/(en)/pricing/page.tsx',
]) {
  const m = read(file).match(LMS_IS_PRO);
  if (m) {
    failures.push(
      `${file} says "${m[0].trim()}" — LMS import is free on every plan. ` +
        'Naming it as something Pro adds is the costliest wrong claim on the ' +
        'site, and the word "LMS" evades the Canvas check above.',
    );
  }
}

// The POSITIVE half, which did not exist. Everything about Canvas was checked
// by asserting what the site must not say, so deleting the exemption entirely
// would have passed silently — and that sentence is the only thing standing
// between "1 free course" and a student concluding Semora is a one-class app
// until they pay. It is exact: enforce_free_course_limit returns early for
// source='lms' rows and never counts them, identically on free and on Pro.
for (const [file, phrase] of [
  ['website/lib/semora-facts.ts', 'never count toward that limit'],
  ['website/lib/es-facts.ts', 'nunca cuentan para ese límite'],
]) {
  if (!read(file).includes(phrase)) {
    failures.push(
      `missing "${phrase}" in ${file} — the free-course cap must never be ` +
        'stated without saying in the same breath that Canvas classes are exempt',
    );
  }
}

mustSay(
  'in one semester',
  `FREE_SEMESTER_LIMIT = ${app.freeSemesters}, so the free cap is a single semester`,
);

// Never re-introduce a free trial. Apple's is monthly-only and Apple-ID-gated,
// so the site cannot promise one; this was live once already.
mustNotSay(
  /\b(free trial|7-day trial|7 day trial|try free for)\b/i,
  'Semora has no free trial the site can promise — the Apple one is monthly-only and Apple-ID-gated',
);

// No invented social proof. There are zero App Store ratings.
mustNotSay(
  /\b(\d[\d,.]*\s*(students|users|universities|schools)\b|★|rated \d)/i,
  'Semora has no user counts, ratings or institutional customers to cite',
);

// The Spanish facts file is a separate canonical restatement, so it needs its
// own assertion — mustSay() above only ever reads the English one.
const esFacts = read('website/lib/es-facts.ts');
const esCoursePhrase = `${app.freeCourses} curso${app.freeCourses === 1 ? '' : 's'} que añades a mano`;
if (!esFacts.includes(esCoursePhrase)) {
  failures.push(
    `missing "${esCoursePhrase}" in website/lib/es-facts.ts — ` +
      `FREE_COURSE_LIMIT = ${app.freeCourses}`,
  );
}

// ─── The long-form registries ────────────────────────────────────────────
//
// Everything above reads ONE file. semora-facts.ts holds a few hundred words;
// the content registries below hold tens of thousands, and they are where the
// free-course claim actually drifted.
//
// The history is worth writing down, because it explains the shape of this
// check. Migration 091 dropped the free manual-course cap from 4 to 1 on
// 2026-08-21 (commit c899ae2, a deliberate product decision: Canvas is free
// and uncapped, so paying for the tedious path was subsidising the chore).
// The site was corrected 1h47m later in 8502b5b — but that pass matched on the
// canonical phrasings ("up to four courses", "4 courses within one semester")
// and rewrote every one of them. What it could not see were the narrative
// restatements: "Four courses is a ceiling", "it is the fifth course that gets
// blocked", "enter the other three by hand". Twenty-two of those survived for
// sixteen days on the homepage and the pricing page.
//
// So this does not grep for a number. It greps for CAP-SHAPED SENTENCES and
// checks the quantity in them against the app constant. Prose that merely
// mentions a typical course load ("about twenty minutes for four courses",
// "when four courses' assignments collide") names no cap and is left alone —
// which is the whole reason the naive check was never written.
//
// It is a heuristic, not a parser. It is aimed squarely at the class of
// sentence that actually drifted, and it is expected to grow a pattern the
// first time a new phrasing gets past it.
const WORD_NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
};
const ORDINAL = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
  primer: 1, segundo: 2, tercer: 3, cuarto: 4, quinto: 5, sexto: 6,
};
const quantity = (t) => {
  const s = String(t).toLowerCase();
  return /^\d+$/.test(s) ? Number(s) : (WORD_NUM[s] ?? null);
};

const REGISTRIES = [
  'website/lib/page-content.ts',
  'website/lib/new-page-content.ts',
  'website/lib/compare-content.ts',
  'website/lib/feature-content.ts',
  'website/lib/competitors.ts',
  'website/lib/es-content.ts',
  'website/lib/es-feature-content.ts',
];

/**
 * Sentences that state the cap. Each yields the quantity it claims; anything
 * that is not FREE_COURSE_LIMIT is drift.
 */
const CAP_CLAIMS = [
  // "4 courses per semester", "up to four courses a semester"
  /(?:up to )?([a-z]+|\d+)[- ]cours(?:e|es)\s+(?:per|a|each)\s+(?:semester|term)/gi,
  // "the course limit is four", "course cap is 4"
  /course (?:limit|cap) is (?:up to )?([a-z]+|\d+)/gi,
  // "free accounts support up to 4 courses"
  /free accounts? supports?\s+(?:up to\s+)?([a-z]+|\d+)\s+courses?/gi,
  // "up to four courses within one semester"
  /up to ([a-z]+|\d+) courses? (?:within|inside|in)\b/gi,
  // Spanish: "hasta 4 cursos", "4 cursos por semestre"
  /hasta ([a-z]+|\d+) cursos?/gi,
  /([a-z]+|\d+) cursos? (?:por|al) (?:semestre|periodo)/gi,
];

/**
 * The ordinal that gets refused. At a limit of N it is always N+1, so
 * "the fifth course is where free stops" is drift the moment the cap moves.
 */
const CAP_ORDINALS = [
  /\b(first|second|third|fourth|fifth|sixth)\s+(?:[a-z-]+\s+){0,2}course\b(?=[^.]{0,70}(?:blocked|stops|refus|is where|needs Pro|requires Pro|gets you|hits? the (?:wall|cap|limit)))/gi,
  /\b(primer|segundo|tercer|cuarto|quinto|sexto)\s+curso\b(?=[^.]{0,70}(?:topa|bloquea|Pro|l[ií]mite))/gi,
];

for (const file of REGISTRIES) {
  let text;
  try {
    text = read(file);
  } catch {
    failures.push(`missing registry ${file} — was it renamed? update REGISTRIES`);
    continue;
  }
  // Not every "N courses" is an entitlement claim. Blackboard and Moodle
  // paginate at 50 courses per sync and the Calendar Feed stops at 1,000
  // items — real, correct numbers that have nothing to do with the free tier.
  // A quantity only counts as a cap claim when the sentence around it is
  // talking about the plan, and is not talking about a provider's sync.
  const isEntitlementContext = (i) => {
    const w = text.slice(Math.max(0, i - 140), i + 140);
    if (/blackboard|moodle|token|sincroniz|per sync|at a time|a la vez|por vez|calendar feed/i.test(w)) {
      return false;
    }
    return /\bfree\b|gratis|gratuit|plan|\bPro\b|limit|l[ií]mite|cap\b/i.test(w);
  };

  const flag = (m, claimed, kind) => {
    const at = text.slice(0, m.index).split('\n').length;
    failures.push(
      `${file}:${at} claims ${kind} of ${claimed} — FREE_COURSE_LIMIT is ${app.freeCourses}\n` +
        `      …${text.slice(Math.max(0, m.index - 60), m.index + 110).replace(/\s+/g, ' ').trim()}…`,
    );
  };
  for (const re of CAP_CLAIMS) {
    for (const m of text.matchAll(re)) {
      const n = quantity(m[1]);
      if (n !== null && n !== app.freeCourses && isEntitlementContext(m.index)) {
        flag(m, n, 'a free course cap');
      }
    }
  }
  for (const re of CAP_ORDINALS) {
    for (const m of text.matchAll(re)) {
      const n = ORDINAL[m[1].toLowerCase()];
      if (n != null && n !== app.freeCourses + 1) {
        flag(m, `the ${m[1]} course`, 'the refused course');
      }
    }
  }
}


// ─── Prices: the site may not quote a price the constant does not hold ───
//
// WHY. semora-facts.ts is the single source of truth for price, and exactly
// eight files read it. The other ~296 price mentions are typed out by hand
// across the long-form registries and the blog. Change PRICING and the
// pricing cards update instantly while three hundred sentences keep quoting
// the old number — a split the site cannot see and nobody proofreads.
//
// THE TRAP THIS AVOIDS. A blind find-and-replace is not safe here: Shovel's
// own pricing page displays $19.99 next to $9.79, and the comparison pages
// and two blog posts quote that faithfully. Rewriting it would turn honest
// competitor research into a false claim, on the pages whose whole value is
// being trustworthy about competitors. So a price pair is only checked when
// no competitor is named near it.
const COMPETITORS = /DormWay|Shovel|StudyFetch|Mindgrasp|Taskade|Studley|myHomework/i;

// A competitor's own prices, as a PAIR. The name-window above catches most
// quotes, but comparison tables put the brand in one cell and the price in
// another, further apart than any sane window. Individual numbers are useless
// as an allowlist — Shovel lists $19.99 and myHomework $4.99, which collide
// with Semora's own prices past and future — so these are matched as pairs,
// which are unambiguous. Add a row when a competitor's quoted pair changes.
const COMPETITOR_PAIRS = new Set([
  '12.88|97.76', // Studley AI, monthly and its yearly equivalent
  '9.79|39.00', // Shovel, its own pricing page
  '33.00|16.00', // Shovel, its buy page, which disagrees with the above
]);

function priceFromFacts(planName) {
  const m = facts.match(new RegExp(`${planName}: \\{ price: ([\\d.]+)`));
  if (!m) throw new Error(`could not read PRICING.pro.${planName}.price from semora-facts.ts`);
  return Number(m[1]);
}

const priceMonthly = priceFromFacts('monthly');
const priceAnnual = priceFromFacts('annual');
const money = (n) => n.toFixed(2);
// What the annual plan works out to per month. Stated by hand in the
// registries ("about $1.67 a month on the annual plan") and equally stale
// after a price change.
const annualPerMonth = money(priceAnnual / 12);

// "$3.99/month or $19.99/year", "$3.99 a month or $19.99 a year",
// "$3.99 al mes o $19.99 al año", and the comma decimals used in Spanish.
const PRICE_PAIR =
  /\$?(\d+[.,]\d{2})\s*\$?\s*(?:\/|\s+(?:a|per|al)\s+)\s*(?:month|mes)[a-z]*\s*(?:or|o|,)\s*\$?(\d+[.,]\d{2})\s*\$?\s*(?:\/|\s+(?:a|per|al)\s+)\s*(?:year|año)/gi;

// EVERY source file under the site, found by walking rather than listed by
// hand. A hand-kept list is precisely how this file's earlier blind spots
// happened — see the note above about the four-course claim surviving sixteen
// days because mustNotSay only ever opened one file. Prices live in the blog
// posts and the keyword landers too, and a list would have missed nine of
// them on the day it was written.
function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...sourceFiles(rel));
    } else if (/\.(ts|tsx|mdx)$/.test(entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

const PRICED_FILES = [...sourceFiles('website/app'), ...sourceFiles('website/lib')];

for (const file of PRICED_FILES) {
  const text = read(file);
  for (const m of text.matchAll(PRICE_PAIR)) {
    const window = text.slice(Math.max(0, m.index - 220), m.index + 220);
    if (COMPETITORS.test(window)) continue; // somebody else's price, quoted honestly
    const got = [m[1], m[2]].map((v) => v.replace(',', '.'));
    if (COMPETITOR_PAIRS.has(got.join('|'))) continue;
    if (got[0] === money(priceMonthly) && got[1] === money(priceAnnual)) continue;
    failures.push(
      `${file} quotes $${got[0]}/month or $${got[1]}/year — PRICING says ` +
        `$${money(priceMonthly)} and $${money(priceAnnual)}. ` +
        'Update the copy, or the constant, so the site and the checkout agree.',
    );
  }
}

// The per-month figure for the annual plan, wherever it is written by hand.
const PER_MONTH_CLAIM = /\$(\d+[.,]\d{2})\s*(?:a|per|al)\s*(?:month|mes)[^.]{0,40}annual|annual[^.]{0,40}\$(\d+[.,]\d{2})\s*(?:a|per)\s*month/gi;
for (const file of PRICED_FILES) {
  const text = read(file);
  for (const m of text.matchAll(PER_MONTH_CLAIM)) {
    const window = text.slice(Math.max(0, m.index - 220), m.index + 220);
    if (COMPETITORS.test(window)) continue;
    const got = (m[1] ?? m[2]).replace(',', '.');
    if (got === annualPerMonth) continue;
    failures.push(
      `${file} says the annual plan is $${got} a month — $${priceAnnual} over 12 is ` +
        `$${annualPerMonth}. Recompute it rather than retyping it.`,
    );
  }
}


if (failures.length) {
  console.error('product-facts drift — the site claims something the app does not do:\n');
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(
    '\nFix the file named above, or update the app constant it mirrors.' +
      '\nsemora-facts.ts / es-facts.ts are the canonical restatement; the registries must agree with them.',
  );
  process.exit(1);
}

console.log('product facts consistent:');
console.log(`  free courses    ${app.freeCourses}  (in ${app.freeSemesters} semester)`);
console.log(`  study plan      ${app.freePlanHorizon}d free / ${app.planHorizon}d Pro`);
console.log(`  registries      ${REGISTRIES.length} long-form files carry no contradicting course cap`);
console.log(`  prices         $${money(priceMonthly)}/mo, $${money(priceAnnual)}/yr (= $${annualPerMonth}/mo) quoted consistently`);
console.log('  no free-trial or invented-social-proof claims on the site');
