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
import { readFileSync } from 'node:fs';
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
mustSay(
  `Up to ${app.freeCourses} ${app.freeCourses === 1 ? 'course' : 'courses'}`,
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

if (failures.length) {
  console.error('product-facts drift — the site claims something the app does not do:\n');
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error('\nFix website/lib/semora-facts.ts, or update the app constant it mirrors.');
  process.exit(1);
}

console.log('product facts consistent:');
console.log(`  free courses    ${app.freeCourses}  (in ${app.freeSemesters} semester)`);
console.log(`  study plan      ${app.freePlanHorizon}d free / ${app.planHorizon}d Pro`);
console.log('  no free-trial or invented-social-proof claims on the site');
