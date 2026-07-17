#!/usr/bin/env node
/* Renders the three synthetic golden-syllabus fixtures to PDF via headless
   Chrome — same technique as store-screenshots/gen.js (write plain HTML files,
   render with the locally installed Chrome; no puppeteer, no npm deps).

   The three fixtures are deliberately different SHAPES, because extraction
   failures cluster by document structure, not by course subject:
     1. cs-table          — table-heavy: grading-weight table + week-by-week
                            schedule table. Tests table parsing + per-item weights.
     2. humanities-prose  — dates buried in prose sentences ("due Friday,
                            September 18") + a "Final essay: date TBA" DATELESS
                            item. Tests prose date extraction + null due_date.
     3. recycled-fall2025 — a syllabus whose dates are all from Fall 2025 (in
                            the past). Tests that the extractor returns the
                            literal document dates and (new behavior) flags
                            them date_suspect rather than silently "fixing"
                            the year.

   Each NAME.pdf pairs with a handwritten fixtures/NAME.expected.json.
   Usage:  node scripts/eval-syllabi/gen-fixture.js [--only name1,name2]

   IMPORTANT: every date printed in the HTML below has had its weekday name
   verified (e.g. 2026-09-18 really is a Friday). If you edit a date, re-check
   the weekday — an inconsistent "Friday, September 17" would make the eval
   ambiguous instead of golden. */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const FIXTURES = path.join(HERE, 'fixtures');
const HTML_DIR = path.join(FIXTURES, 'html');
fs.mkdirSync(HTML_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Chrome discovery — env override first, then the usual install locations.
// ---------------------------------------------------------------------------
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    console.error(
      'Could not find a Chrome/Chromium binary. Install Google Chrome or set CHROME_PATH.',
    );
    process.exit(1);
  }
  return found;
}

// Shared "looks like a real syllabus" document styling — serif, plain tables.
// Deliberately NOT the app's design system: these must read as documents a
// professor exported from Word, not as marketing material.
const DOC_CSS = `
  @page { margin: 1.6cm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11.5pt; color: #111; line-height: 1.45; }
  h1 { font-size: 17pt; margin-bottom: 2pt; }
  h2 { font-size: 12.5pt; margin: 14pt 0 5pt; border-bottom: 1px solid #999; padding-bottom: 2pt; }
  p { margin: 6pt 0; }
  .meta { color: #333; margin: 1pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0; font-size: 10.5pt; }
  th, td { border: 1px solid #777; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #eee; }
  ul { margin: 6pt 0 6pt 18pt; }
  li { margin: 3pt 0; }
  .small { font-size: 9.5pt; color: #444; }
`;

const doc = (title, body) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${DOC_CSS}</style></head><body>${body}</body></html>`;

// ---------------------------------------------------------------------------
// Fixture 1: table-heavy CS syllabus (Fall 2026 — current upcoming term)
// ---------------------------------------------------------------------------
const csTable = doc('CS 3450 Syllabus', `
  <h1>CS 3450 &mdash; Operating Systems</h1>
  <p class="meta">Department of Computer Science, Ridgeline State University &mdash; Fall 2026</p>
  <p class="meta"><b>Instructor:</b> Dr. Maya Ellison &nbsp;(ellison@ridgeline.edu)</p>
  <p class="meta"><b>Lecture:</b> Mon/Wed/Fri 10:00&ndash;10:50 AM, Hobbs Hall 214</p>
  <p class="meta"><b>Lab:</b> Thursdays 2:00&ndash;3:50 PM, Hobbs Hall 120</p>
  <p class="meta"><b>Office hours:</b> Tuesday &amp; Thursday 11:00 AM&ndash;12:00 PM, Hobbs Hall 318</p>
  <p class="meta"><b>Term:</b> Classes run Monday, August 24 through Friday, December 11, 2026.</p>

  <h2>Course Description</h2>
  <p>An introduction to the design and implementation of modern operating systems:
  processes and threads, CPU scheduling, synchronization, deadlock, memory
  management, file systems, I/O, and virtualization. Prerequisite: CS 2420.</p>

  <h2>Grading</h2>
  <table>
    <tr><th>Component</th><th>Weight</th></tr>
    <tr><td>Homework (5 assignments, 6% each)</td><td>30%</td></tr>
    <tr><td>Quizzes (3 quizzes, 4% each)</td><td>12%</td></tr>
    <tr><td>Midterm Exam</td><td>20%</td></tr>
    <tr><td>Final Project</td><td>13%</td></tr>
    <tr><td>Final Exam</td><td>25%</td></tr>
  </table>
  <p class="small">All homework is submitted on Gradescope and is due at 11:59 PM on the date listed.</p>

  <h2>Grade Scale</h2>
  <table>
    <tr><th>A</th><th>A&minus;</th><th>B+</th><th>B</th><th>B&minus;</th><th>C+</th><th>C</th><th>D</th><th>F</th></tr>
    <tr><td>93&ndash;100</td><td>90&ndash;92</td><td>87&ndash;89</td><td>83&ndash;86</td><td>80&ndash;82</td><td>77&ndash;79</td><td>73&ndash;76</td><td>60&ndash;72</td><td>&lt;60</td></tr>
  </table>

  <h2>Weekly Schedule</h2>
  <table>
    <tr><th>Week</th><th>Dates</th><th>Topics</th><th>Due / In Class</th></tr>
    <tr><td>1</td><td>Aug 24&ndash;28</td><td>Introduction; processes</td><td>&mdash;</td></tr>
    <tr><td>2</td><td>Aug 31&ndash;Sep 4</td><td>Threads and concurrency</td><td>Homework 1 due Fri, Sep 4</td></tr>
    <tr><td>3</td><td>Sep 7&ndash;11</td><td>CPU scheduling (no class Mon &mdash; Labor Day)</td><td>&mdash;</td></tr>
    <tr><td>4</td><td>Sep 14&ndash;18</td><td>Synchronization</td><td>Quiz 1 in class Wed, Sep 16</td></tr>
    <tr><td>5</td><td>Sep 21&ndash;25</td><td>Deadlock</td><td>Homework 2 due Fri, Sep 25</td></tr>
    <tr><td>6</td><td>Sep 28&ndash;Oct 2</td><td>Memory management</td><td>&mdash;</td></tr>
    <tr><td>7</td><td>Oct 5&ndash;9</td><td>Virtual memory</td><td>Homework 3 due Fri, Oct 9</td></tr>
    <tr><td>8</td><td>Oct 12&ndash;16</td><td>Review; <b>Midterm Exam in class Wed, Oct 14</b></td><td>Midterm Exam Wed, Oct 14</td></tr>
    <tr><td>9</td><td>Oct 19&ndash;23</td><td>File systems</td><td>&mdash;</td></tr>
    <tr><td>10</td><td>Oct 26&ndash;30</td><td>File system implementation</td><td>Quiz 2 in class Wed, Oct 28</td></tr>
    <tr><td>11</td><td>Nov 2&ndash;6</td><td>I/O systems</td><td>Homework 4 due Fri, Nov 6</td></tr>
    <tr><td>12</td><td>Nov 9&ndash;13</td><td>Virtualization</td><td>&mdash;</td></tr>
    <tr><td>13</td><td>Nov 16&ndash;20</td><td>Distributed systems</td><td>Quiz 3 in class Wed, Nov 18</td></tr>
    <tr><td>14</td><td>Nov 23&ndash;27</td><td>Thanksgiving break &mdash; no class</td><td>&mdash;</td></tr>
    <tr><td>15</td><td>Nov 30&ndash;Dec 4</td><td>Security</td><td>Homework 5 due Fri, Dec 4</td></tr>
    <tr><td>16</td><td>Dec 7&ndash;11</td><td>Wrap-up and review</td><td>Final Project due Mon, Dec 7;
        <b>Final Exam Fri, Dec 11 at 10:00 AM</b></td></tr>
  </table>

  <h2>Policies</h2>
  <p>Late homework loses 10% per day, up to three days. Quizzes and exams cannot
  be made up without a documented excuse. Collaboration is encouraged on
  concepts, but all submitted code must be your own.</p>
`);

// ---------------------------------------------------------------------------
// Fixture 2: prose-style humanities syllabus with inline dates + a dateless
// "Final essay: date TBA" item (must come back with due_date: null under the
// new edge-function behavior).
// ---------------------------------------------------------------------------
const humanitiesProse = doc('HIST 214 Syllabus', `
  <h1>HIST 214: The Atlantic World, 1450&ndash;1850</h1>
  <p class="meta">Fall 2026 &mdash; Prof. Daniel Okafor &mdash; okafor@ridgeline.edu</p>

  <p>We meet Tuesdays and Thursdays from 1:00 to 2:15 PM in Merrill Hall 12.
  My office hours are Wednesdays 2:00&ndash;4:00 PM in Merrill 305, or by
  appointment. The semester runs from Tuesday, August 25 through Thursday,
  December 10, 2026.</p>

  <h2>About the Course</h2>
  <p>This seminar traces the movement of people, goods, and ideas across the
  Atlantic basin from first contact through the age of revolutions. We will read
  primary sources alongside recent scholarship, and much of our class time will
  be devoted to discussion, so come prepared to talk.</p>

  <h2>Assignments and Grading</h2>
  <p>Your grade rests on three response papers (10% each), a midterm essay worth
  20%, one in-class presentation worth 10%, class participation (10%), and a
  final essay worth 30%. There are no exams in this course.</p>

  <p>The first response paper is due Friday, September 18. The second is due
  Friday, October 9, and the third is due Friday, November 13. Response papers
  should be submitted by email before midnight on the day they are due, and
  should engage closely with that week's primary sources.</p>

  <p>The midterm essay (five to seven pages) is due at the start of class on
  Thursday, October 22. I will circulate a list of prompts two weeks
  beforehand; you are also welcome to propose your own topic in office hours.</p>

  <p>Presentations will take place in class on Tuesday, December 1. Each student
  will present one week's readings to the seminar and lead the opening fifteen
  minutes of discussion. A sign-up sheet will circulate in September.</p>

  <p><b>Final essay: date TBA.</b> The final-essay deadline will be announced
  once the registrar releases the December exam schedule; it will fall during
  finals week. The essay should be ten to twelve pages and may build on your
  midterm essay with my permission.</p>

  <h2>Policies</h2>
  <p>Extensions are granted freely if requested at least 48 hours in advance,
  and almost never afterwards. Please bring the assigned reading to every
  meeting; laptops are welcome for notes and sources only.</p>
`);

// ---------------------------------------------------------------------------
// Fixture 3: recycled syllabus — every date is Fall 2025, i.e. in the past.
// Tests date-plausibility handling: the extractor must return the literal
// document dates (not silently rewrite the year) and, under the new edge
// function, mark them date_suspect.
// ---------------------------------------------------------------------------
const recycledFall2025 = doc('BIO 201 Syllabus', `
  <h1>BIO 201: Cell Biology</h1>
  <p class="meta">Fall 2025 &mdash; Whitman Science Center, Ridgeline State University</p>
  <p class="meta"><b>Instructor:</b> Dr. Sofia Reyes &nbsp;(reyes@ridgeline.edu), Whitman 210</p>
  <p class="meta"><b>Lecture:</b> Mon/Wed/Fri 9:00&ndash;9:50 AM, Whitman 140</p>
  <p class="meta"><b>Lab:</b> Wednesdays 2:00&ndash;4:50 PM, Whitman 022</p>
  <p class="meta"><b>Office hours:</b> Mondays 10:00&ndash;11:30 AM, Whitman 210</p>
  <p class="meta"><b>Term:</b> Classes begin Monday, August 25, 2025 and end Friday, December 12, 2025.</p>

  <h2>Grading</h2>
  <table>
    <tr><th>Component</th><th>Weight</th></tr>
    <tr><td>Lab reports (4, 5% each)</td><td>20%</td></tr>
    <tr><td>Problem sets (2, 5% each)</td><td>10%</td></tr>
    <tr><td>Exam I</td><td>15%</td></tr>
    <tr><td>Exam II</td><td>15%</td></tr>
    <tr><td>Term paper</td><td>15%</td></tr>
    <tr><td>Final exam</td><td>25%</td></tr>
  </table>

  <h2>Key Dates</h2>
  <table>
    <tr><th>Item</th><th>Due</th></tr>
    <tr><td>Lab Report 1</td><td>Friday, September 19, 2025</td></tr>
    <tr><td>Problem Set 1</td><td>Monday, September 29, 2025</td></tr>
    <tr><td>Lab Report 2</td><td>Friday, October 10, 2025</td></tr>
    <tr><td>Exam I (in class)</td><td>Wednesday, October 15, 2025</td></tr>
    <tr><td>Lab Report 3</td><td>Friday, November 7, 2025</td></tr>
    <tr><td>Exam II (in class)</td><td>Friday, November 21, 2025</td></tr>
    <tr><td>Problem Set 2</td><td>Monday, November 24, 2025</td></tr>
    <tr><td>Lab Report 4</td><td>Friday, December 5, 2025</td></tr>
    <tr><td>Term Paper</td><td>Friday, December 5, 2025</td></tr>
    <tr><td>Final Exam, 9:00 AM</td><td>Monday, December 8, 2025</td></tr>
  </table>

  <h2>Course Overview</h2>
  <p>Structure and function of the eukaryotic cell: membranes, organelles, the
  cytoskeleton, cell signaling, the cell cycle, and an introduction to cancer
  biology. Weekly three-hour labs reinforce lecture material with microscopy
  and standard molecular techniques.</p>

  <h2>Policies</h2>
  <p>Lab attendance is mandatory; a missed lab cannot be made up. Problem sets
  are due at the start of lecture. The term paper (8&ndash;10 pages) may cover
  any topic in cell biology approved by the instructor before November 1.</p>
`);

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
const FIXTURE_HTML = {
  'cs-table': csTable,
  'humanities-prose': humanitiesProse,
  'recycled-fall2025': recycledFall2025,
};

const onlyArg = process.argv.indexOf('--only');
const only =
  onlyArg !== -1 && process.argv[onlyArg + 1]
    ? process.argv[onlyArg + 1].split(',').map((s) => s.trim())
    : null;

const chrome = findChrome();
console.log(`Using Chrome: ${chrome}\n`);

for (const [name, html] of Object.entries(FIXTURE_HTML)) {
  if (only && !only.includes(name)) continue;
  const htmlPath = path.join(HTML_DIR, `${name}.html`);
  const pdfPath = path.join(FIXTURES, `${name}.pdf`);
  fs.writeFileSync(htmlPath, html);
  // --no-pdf-header-footer: Chrome's default header/footer stamps today's
  // date on every page, which would contaminate the recycled-dates fixture.
  execFileSync(
    chrome,
    [
      '--headless',
      '--disable-gpu',
      '--no-pdf-header-footer',
      `--print-to-pdf=${pdfPath}`,
      htmlPath,
    ],
    { stdio: ['ignore', 'ignore', 'inherit'] },
  );
  const kb = (fs.statSync(pdfPath).size / 1024).toFixed(0);
  console.log(`  ${name}.pdf  (${kb} KB)`);
}

console.log(`\nDone. PDFs in ${FIXTURES}`);
console.log('Each NAME.pdf needs a matching NAME.expected.json (the three synthetic ones ship with this repo).');
