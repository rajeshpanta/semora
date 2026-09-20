/**
 * Generate the Moodle event-name table the calendar parser strips with.
 *
 * WHY THIS IS A SCRIPT AND NOT A HAND-WRITTEN TABLE
 *
 * Moodle names a calendar event with get_string() at the moment the TEACHER
 * saves the activity, so the wording is in the creating teacher's language —
 * not the site's and not the student's. A table written from the English
 * strings alone silently fails at every school whose teachers work in another
 * language: the suffix is never matched, the raw event name becomes the task
 * title, and the two events of one activity ("opens" and "closes") both import
 * as separate tasks.
 *
 * And the strings are not suffixes everywhere. Measured 2026-09-19 against the
 * real 4.5 Spanish pack:
 *
 *   en  assign calendardue      = '{$a} is due'          -> placeholder FIRST
 *   es  assign calendardue      = 'Vencimiento de {$a}'  -> placeholder LAST
 *   es  quiz   quizeventopens   = 'Se abre {$a}'         -> placeholder LAST
 *   es  choice calendarstart    = '{$a} abren'           -> placeholder FIRST
 *
 * So the table stores a prefix and a suffix per string, either of which may be
 * empty, and the parser strips both ends. That is the whole reason this file
 * exists.
 *
 * Usage:
 *   node scripts/moodle-event-names.mjs            # write the table
 *   node scripts/moodle-event-names.mjs --check    # fail if the table is stale
 *
 * Output: supabase/functions/_shared/moodle-event-names.ts
 *
 * Downloads language packs from download.moodle.org into a temp directory and
 * deletes them afterwards; nothing large lands in the repo.
 */
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BRANCH = '4.5';
const GITHUB = 'https://raw.githubusercontent.com/moodle/moodle/MOODLE_405_STABLE';
const OUT = 'supabase/functions/_shared/moodle-event-names.ts';

/**
 * The languages the table covers.
 *
 * English and Spanish because Semora ships in both. The rest are the languages
 * most likely to be a Moodle teacher's own at a university that also has
 * English- or Spanish-speaking students; a school whose language is missing
 * still works, it just keeps the raw event name as the task title until the
 * language is added here (the parser reports `unmatched_suffix` so we find out).
 */
const LANGS = ['en', 'es', 'pt_br', 'fr', 'de', 'it', 'ca', 'gl', 'eu', 'nl', 'pl', 'tr'];

/**
 * Which string in which component names which kind of calendar event.
 *
 * `kind` is what the parser does with it:
 *   due    — a deadline; becomes a task
 *   open   — an opening; skipped, it is not work due
 *   grading— "is due to be graded"; skipped, it is the teacher's deadline
 *   expect — "should be completed"; a soft target, becomes a task typed other
 *   extend — an assignment extension granted to THIS student (see below)
 *   override — a per-user or per-group date that replaces the base one
 */
const SPEC = [
  ['mod/assign', 'assign', 'calendardue', 'due'],
  ['mod/assign', 'assign', 'calendargradingdue', 'grading'],
  ['mod/assign', 'assign', 'calendarextension', 'extend'],
  ['mod/assign', 'assign', 'overrideusereventname', 'override'],
  ['mod/assign', 'assign', 'overridegroupeventname', 'override'],
  ['mod/quiz', 'quiz', 'quizeventopens', 'open'],
  ['mod/quiz', 'quiz', 'quizeventcloses', 'due'],
  ['mod/quiz', 'quiz', 'overrideusereventname', 'override'],
  ['mod/quiz', 'quiz', 'overridegroupeventname', 'override'],
  ['mod/forum', 'forum', 'calendardue', 'due'],
  ['mod/workshop', 'workshop', 'submissionstartevent', 'open'],
  ['mod/workshop', 'workshop', 'submissionendevent', 'due'],
  ['mod/workshop', 'workshop', 'assessmentstartevent', 'open'],
  ['mod/workshop', 'workshop', 'assessmentendevent', 'due'],
  ['mod/lesson', 'lesson', 'lessoneventopens', 'open'],
  ['mod/lesson', 'lesson', 'lessoneventcloses', 'due'],
  ['mod/choice', 'choice', 'calendarstart', 'open'],
  ['mod/choice', 'choice', 'calendarend', 'due'],
  ['mod/feedback', 'feedback', 'calendarstart', 'open'],
  ['mod/feedback', 'feedback', 'calendarend', 'due'],
  ['mod/data', 'data', 'calendarstart', 'open'],
  ['mod/data', 'data', 'calendarend', 'due'],
  ['mod/scorm', 'scorm', 'calendarstart', 'open'],
  ['mod/scorm', 'scorm', 'calendarend', 'due'],
  [null, 'completion', 'completionexpectedfor', 'expect'],
];

/** Strings the setup card and the parser need that are not event names. */
const EXTRA = [
  [null, 'calendar', 'siteevents'],        // the synthetic pseudo-course under preset_what=all
  [null, 'calendar', 'generateurlbutton'], // "Get calendar URL"
  [null, 'calendar', 'exportcalendar'],    // "Export calendar"
  [null, 'calendar', 'managesubscriptions'],
  [null, 'calendar', 'exportbutton'],      // "Export" — the one that downloads a file
];

function parsePhp(text) {
  const out = {};
  const re = /\$string\['([A-Za-z0-9_]+)'\]\s*=\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*;/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out[m.group ? m.group(1) : m[1]] = m[2].slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return out;
}

/**
 * Split a Moodle string into the text before and after its placeholder.
 *
 * `{$a}` and `{$a->instancename}` / `{$a->assign}` all mark where the activity
 * name goes. A group-override string has TWO placeholders ("{$a->assign} -
 * {$a->group}"); only the first is the activity, so the tail after the second
 * is treated as part of the suffix and matched loosely by the parser.
 */
function split(value) {
  const first = value.indexOf('{$a');
  if (first < 0) return null;
  const close = value.indexOf('}', first);
  if (close < 0) return null;
  return { prefix: value.slice(0, first), suffix: value.slice(close + 1) };
}

function fetchText(url) {
  return execFileSync('curl', ['-sSL', '--max-time', '60', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function loadLang(lang, work) {
  if (lang === 'en') {
    const files = {};
    for (const [dir, comp] of [...SPEC, ...EXTRA].map((r) => [r[0], r[1]])) {
      if (files[comp]) continue;
      const path = dir ? `${dir}/lang/en/${comp}.php` : `lang/en/${comp}.php`;
      try { files[comp] = parsePhp(fetchText(`${GITHUB}/${path}`)); } catch { files[comp] = {}; }
    }
    return files;
  }
  const zip = join(work, `${lang}.zip`);
  execFileSync('curl', ['-sSL', '--max-time', '180', '-o', zip,
    `https://download.moodle.org/download.php/direct/langpack/${BRANCH}/${lang}.zip`]);
  execFileSync('unzip', ['-o', '-q', zip, '-d', work]);
  const files = {};
  for (const [, comp] of [...SPEC, ...EXTRA].map((r) => [r[0], r[1]])) {
    if (files[comp]) continue;
    const p = join(work, lang, `${comp}.php`);
    files[comp] = existsSync(p) ? parsePhp(readFileSync(p, 'utf8')) : {};
  }
  return files;
}

const work = mkdtempSync(join(tmpdir(), 'moodle-lang-'));
const patterns = [];
const labels = {};
const missing = [];
try {
  for (const lang of LANGS) {
    process.stderr.write(`  ${lang}…`);
    let files;
    try { files = loadLang(lang, work); } catch (err) { process.stderr.write(` FAILED (${err.message.slice(0, 60)})\n`); missing.push(lang); continue; }
    let n = 0;
    for (const [, comp, key, kind] of SPEC) {
      const value = files[comp]?.[key];
      if (!value) continue;
      const parts = split(value);
      if (!parts) continue;
      if (!parts.prefix && !parts.suffix) continue; // nothing to strip
      patterns.push({ lang, comp, key, kind, prefix: parts.prefix, suffix: parts.suffix });
      n += 1;
    }
    labels[lang] = {};
    for (const [, comp, key] of EXTRA) {
      const value = files[comp]?.[key];
      if (value) labels[lang][key] = value;
    }
    process.stderr.write(` ${n} patterns, ${Object.keys(labels[lang]).length} labels\n`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

// Longest first: "{$a} is due to be graded" must beat "{$a} is due".
patterns.sort((a, b) => (b.prefix.length + b.suffix.length) - (a.prefix.length + a.suffix.length));

const body = `/**
 * Moodle calendar event names, per language.
 *
 * GENERATED by scripts/moodle-event-names.mjs from the Moodle ${BRANCH} language
 * packs. Do not edit by hand — re-run the script.
 *
 * Moodle writes an event's name when the TEACHER saves the activity, in the
 * teacher's own language, so a school with Spanish-speaking staff and
 * English-speaking students produces Spanish event names. The placeholder is
 * not always at the start: English is '{\$a} is due' but Spanish is
 * 'Vencimiento de {\$a}', so each entry carries a prefix AND a suffix and the
 * parser strips both ends.
 *
 * Languages covered: ${LANGS.filter((l) => !missing.includes(l)).join(', ')}.
 * A school whose language is missing still works; the raw event name becomes
 * the task title and the parser reports it so the language can be added.
 */

/** What the parser does with an event carrying this name shape. */
export type MoodleEventKind = 'due' | 'open' | 'grading' | 'expect' | 'extend' | 'override';

export interface MoodleEventPattern {
  lang: string;
  /** The Moodle component the string belongs to, for tracing only. */
  comp: string;
  /** The language-pack key, for tracing only. */
  key: string;
  kind: MoodleEventKind;
  /** Text before the activity name. May be empty. */
  prefix: string;
  /** Text after the activity name. May be empty. */
  suffix: string;
}

/** Sorted longest-first, so 'is due to be graded' matches before 'is due'. */
export const MOODLE_EVENT_PATTERNS: readonly MoodleEventPattern[] = ${JSON.stringify(patterns, null, 2)};

/**
 * Moodle's own UI labels, per language.
 *
 * \`siteevents\` is the shortname of the synthetic pseudo-course the export adds
 * under preset_what=all; the parser uses it to tell a real course from that.
 * The rest are the button names the setup card quotes, so the card says what
 * the student's Moodle actually says.
 */
export const MOODLE_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = ${JSON.stringify(labels, null, 2)};

/** Every localisation of the site-events pseudo-course shortname. */
export const MOODLE_SITE_EVENT_NAMES: readonly string[] = ${JSON.stringify(
  [...new Set(Object.values(labels).map((l) => l.siteevents).filter(Boolean))].sort(), null, 2)};
`;

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== body) {
    console.error(`STALE: ${OUT} does not match the language packs. Re-run: node scripts/moodle-event-names.mjs`);
    process.exit(1);
  }
  console.log(`${OUT} is current (${patterns.length} patterns, ${Object.keys(labels).length} languages).`);
} else {
  writeFileSync(OUT, body);
  console.log(`Wrote ${OUT}: ${patterns.length} patterns across ${Object.keys(labels).length} languages.`);
  if (missing.length) console.log(`Languages that failed to download: ${missing.join(', ')}`);
}
