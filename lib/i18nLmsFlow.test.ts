/**
 * The strings a student reads while connecting a learning platform, in Spanish.
 *
 * A missing translation is not an error. translate() returns its English input
 * and the screen renders perfectly, in the wrong language — which is how the
 * connection card's sync line stayed English for Canvas users for months, and
 * how three Moodle strings shipped untranslated.
 *
 * The sync line is the instructive one: LocalizedReactNative JOINS a Text's
 * string children and translates the result, so the catalogue key
 * ' · Canvas checks every few hours' never matched anything. What reaches
 * translate() is "Updated 2h ago · Canvas checks every few hours".
 *
 * A HALF translation is not an error either, and it is worse, because it looks
 * handled: a generic rule written for task titles turned "Finish Moodle setup"
 * into "Completar Moodle setup", and the Canvas row on the chooser read
 * "Assignments, exams and · entrega dates". Hence the second test.
 */
import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { translate } from './i18n';

/** Every name an LMS prompt can carry (lmsOfferName / lmsRepairLabel). */
const OFFER_NAMES = ['Canvas or Moodle', 'Canvas', 'Moodle'];
const PROVIDERS = ['Canvas', 'Moodle', 'Blackboard', 'Google Classroom'];

const MUST_TRANSLATE = [
  // The sync line, as it is actually rendered, for every provider and every age.
  'Updated 2h ago · Moodle checks every few hours',
  'Updated 15m ago · Canvas checks every few hours',
  'Updated just now · Blackboard checks every few hours',
  'Not synced yet · Reconnect required',
  'Updated 3d ago · Automatic sync on',
  'Updated 1h ago · Device sync only',

  // ── The chooser (Settings → Canvas or LMS Sync) ────────────────────────
  'Canvas or LMS Sync',
  'When a due date moves, you already know.',
  'Connecting takes about a minute, once. Every assignment, exam and due date from your courses arrives in Semora and stays right on its own. You choose which courses come across.',
  'Canvas and Moodle use the calendar link your school already gives you',
  'Semora cannot change anything on Canvas, Blackboard or Moodle',
  'Rechecks automatically every few hours',
  'Which one does your school use?',
  'All three are free, with no limit on the number of classes.',
  'Assignments, exams and due dates',
  'Needs an access token from your school’s IT team',
  'Deadlines, quizzes and exams from your Moodle calendar — no admin needed',
  'No token? Scan a syllabus instead',
  // The alert after "Sync now", named for the platform synced.
  ...PROVIDERS.map((p) => `${p} synced`), 'LMS synced',
  // The connection card and its status word (last_sync_status, "_" → " ").
  ...PROVIDERS.flatMap((p) => [
    `${p} sync needs attention. Reconnect below`,
    `${p} is connected — manage it below`,
  ]),
  'Action required · 1 new course', 'Action required · 3 new courses',
  '2 courses', '1 course',
  'success', 'error', 'credentials required', 'syncing', 'partial', 'never',
  'Moodle is listing a course Semora has not imported. Review and choose a semester.',
  'Canvas is listing courses Semora has not imported. Review and choose a semester.',

  // ── The connect screen, both platforms ─────────────────────────────────
  'Your school uses',
  // Blackboard's catch on the switch, and the label a screen reader reads.
  'needs school IT', 'Blackboard, needs school IT',
  'CANVAS SETUP · STEP 1 OF 2', 'CANVAS SETUP · STEP 2 OF 2',
  'MOODLE SETUP · STEP 1 OF 2', 'MOODLE SETUP · STEP 2 OF 2',
  'Nice. This takes about a minute.',
  'Connect Canvas to Semora', 'Connect Moodle to Semora',
  'Canvas keeps your calendar link behind your login, so there is one quick trip to make. Semora does the rest.',
  'Moodle keeps your calendar link behind your login, so there is one quick trip to make. Semora does the rest.',
  'Lock in free Moodle sync', 'Lock in free Canvas sync',
  'Canvas sync is free while this offer runs. Connect before it ends and it stays free on this account.',
  'Moodle sync is free while this offer runs. Connect before it ends and it stays free on this account.',
  'Create a semester before connecting so imported courses have a home.',
  'How would you like to do it?', 'Do it here on my phone', 'I have a laptop nearby',
  'Not working?', 'Show me the laptop steps', 'Ask Semora for help',
  'Scan a syllabus instead',
  // The header, built from two translated halves ('Connect' + the name).
  'Connect', 'Reconnect',
  // The Moodle token road and the way back from it.
  'My school gave me a web-service token',
  'Use my calendar link instead',
  // Nothing dated yet: the offer, what the button does, and the answer.
  'Nothing dated yet',
  'Your Moodle calendar has no due dates right now. Save your link and Semora will check it every few hours, and tell you when a course has a date.',
  'Save and keep checking', 'Moodle saved',
  'Semora will keep checking your Moodle every few hours and will tell you when a course has a date.',

  // ── The Canvas guided paste, every step of it ──────────────────────────
  // This flow was at 24 of 46 while Moodle was at 57 of 57 — the road most
  // students take was the half-English one, which is the opposite of what
  // anyone assumed.
  'My school uses Moodle',
  'Semora opens your school’s Canvas calendar, then fills the link in with one tap when you come back.',
  'Finish on the bigger screen. Nothing to copy between devices.',
  'Finish on your laptop',
  // "On your laptop, open <b>app.semoraai.com</b> and sign in." — two keys.
  'On your laptop, open', 'and sign in.',
  'Open Settings, then Canvas or LMS Sync, and choose Canvas.',
  'Your classes appear here the next time you open Semora.',
  'Actually, let me try on my phone',
  'Which school?',
  "Type your college name and pick it from the list. Semora then opens your school's own Canvas page for you, so you never need to know its web address.",
  'Your college or university',
  'Could not reach the school directory just now.',
  'No match. Your school may use its own Canvas address.',
  'I know my Canvas web address',
  'Use this address',
  'Search for my school instead',
  // "Semora will open {host}. Sign in if it asks, then find <b>Calendar
  // Feed</b> in the calendar sidebar and copy the link." — split the same way.
  'Semora will open', '. Sign in if it asks, then find', 'Calendar Feed',
  'in the calendar sidebar and copy the link.',
  'Open my Canvas calendar',
  'Different school',
  'Where to find your link',
  'Sign in to your college Canvas account on the page Semora opens.',
  'In the menu down the left side, tap Calendar.',
  'Scroll to the very bottom of the panel on the right.',
  'Tap Calendar Feed. A box opens with a long link starting webcal://',
  'Press and hold that link, then tap Copy.',
  'Copy that link.',
  'Come back to Semora and tap Paste. The link goes into the box below.',
  'Come back to this tab and paste the link into the box below.',
  'Paste your private Calendar Feed link',
  'Hide Calendar Feed URL', 'Show Calendar Feed URL',
  'Copied the link? Tap below and Semora fills it in. iOS may ask permission to paste — that is expected, and Semora only ever reads the one link.',
  'Paste my Calendar Feed link',
  'Paste from clipboard',
  'Nothing that looks like a Canvas link is on your clipboard yet. Copy it in Canvas first.',
  'Link looks right — checking Canvas…',
  'Looks right — school.instructure.com',
  'That is a Canvas page, not the Calendar Feed link.',
  'That link is from school.instructure.com — the right school, the wrong page. Semora can open its calendar for you.',
  'Open school.instructure.com calendar',
  'This step trips people up. Nothing you have done so far is lost.',
  'This step trips people up, and it is usually easier on a computer. Nothing you have done so far is lost.',

  // ── The Moodle guided paste ────────────────────────────────────────────
  'Where is your Moodle?',
  'Your school’s Moodle address',
  'moodle.yourschool.edu — or paste any link from it',
  'That isn’t a web address yet. Type it like moodle.yourschool.edu, or paste any link from your Moodle.',
  'If you are not sure, search “moodle” and your school’s name.',
  'Find my Moodle', 'Checking that address…',
  'Found: Mount Orange',
  'This doesn’t look like a Moodle site',
  'Couldn’t confirm this address — continue anyway',
  'That address answered, but not like Moodle. It may be your school’s main website — check the address, or continue if you’re sure it’s right.',
  'Change the address', 'Not your school? Change',
  'Semora opens Moodle, you copy one link and come back.',
  'Get the link there, then paste it here or on app.semoraai.com.',
  'Open your Moodle calendar',
  'Sign in if Moodle asks.', 'Tap Get calendar URL.', 'Tap Copy URL.', 'Come back to Semora.',
  'Click Get calendar URL, then Copy URL.', 'Come back to this tab and paste it below.',
  'Get the link on your laptop', 'On your laptop, open this address:',
  'Then paste it into Semora on the web', 'Open app.semoraai.com in a new tab and sign in.',
  'Open Settings, then Canvas or LMS Sync, and choose Moodle.',
  'Paste the link into the first box there.',
  'Leave the options as they are — Semora sets the date range itself.',
  'If you tapped Export and a calendar file opened, go back and tap Get calendar URL instead.',
  'If the page just says “no export”, your school turned this off. Semora will offer to read your syllabus instead.',
  'Landed somewhere else?', 'Go to Calendar → Import or export calendars → Export calendar.',
  'Open school.moodledemo.net', 'Open Moodle',
  'If your school’s sign-in refuses to open here, use the laptop steps.',
  'Back already? Paste your link', 'Paste my Moodle link',
  'Your Moodle calendar link', 'Hide the link', 'Show the link',
  'Nothing to paste yet. Copy the link in Moodle first.',
  'Link looks right — checking Moodle…',
  'Looks right — school.moodledemo.net',
  'That link is from school.instructure.com — open its calendar export instead',
  'Open it again', 'Older Moodle?',
  'If your Export page shows the link as text with no Copy button, select it and copy it by hand.',
  'Getting the link on a laptop is easier, and you can paste it here afterwards.',
  // The Canvas link pasted into the Moodle box: the switch across.
  'Is your school on Canvas?',
  'That is a Canvas calendar link, not a Moodle one. Semora can connect Canvas with it instead.',
  'Connect Canvas instead',
  // The hints under the field, and the refusals behind them.
  'Paste the whole link.', 'Sign in first, then tap Get calendar URL.',
  'Tap Get calendar URL, then Copy URL.', 'That downloaded a file. Tap Get calendar URL instead.',
  'That is a Moodle page, not the calendar link.', 'That is a different Moodle.',
  'The link must start with https.', 'Use your school’s Moodle address.', 'That is too long to be the link.',
  'This is not a Moodle calendar export link. In Moodle open Calendar → Import or export calendars → Export calendar → Get calendar URL, then copy the URL shown.',

  // ── Choosing courses, and the result ───────────────────────────────────
  'Only classes with dated work in Moodle appear here. A class with nothing scheduled, or one your teacher hasn’t released yet, shows up when its first deadline is posted.',
  'Your Moodle shares 30 days ahead.',
  'Prefilled from the dates in this coursework.',
  'Course name: Biology 101',
  'Different semester?', 'Import anyway', 'The import failed.',
  'This work runs Sep 1 – Dec 12, which is outside Spring 2027. Importing it here will file it under the wrong term.',
  'The import failed.\n\nSome classes may have been added before it stopped — check your course list.',
  'After connecting, Semora keeps watching this feed — including for next semester’s courses. You will not have to reconnect Canvas.',
  'If you change your Moodle password, Semora will ask you for a fresh link.',
  'Connect Canvas free and start syncing', 'Connect Moodle free and start syncing',
  'Connect Canvas and start syncing', 'Connect Moodle and start syncing',
  'Canvas connected', 'Moodle connected', 'See my deadlines',
  '2 courses and 5 deadlines imported. Semora will keep checking Moodle every few hours.',

  // ── A connection's own screen ──────────────────────────────────────────
  'Automatic Moodle calendar sync is on. Semora checks for dated assignment and event changes every few hours.',
  'Automatic Canvas Calendar Feed sync is on. Semora checks for dated assignment and event changes every few hours.',
  'Dismissed courses', 'Could not restore', 'Hidden assignments',
  'Courses you told Semora were not yours. Nothing was deleted — restore one and it goes back on the list of courses waiting to be imported.',
  'Your enrolment in this course has ended in Moodle.',
  'Could not restore it',
  // Wherever the hidden work actually is, for every platform and for more
  // than one.
  ...PROVIDERS.map((p) => `Assignments you have hidden from Semora. They are still in ${p} — hiding one here never changes anything there.`),
  'Assignments you have hidden from Semora. They are still in your school’s learning platform — hiding one here never changes anything there.',
  "Nothing is hidden. Anything you hide from an assignment's page shows up here.",
  // The new-courses screen, and the feed's limits under it.
  'New Moodle courses', 'new Moodle course', 'new Moodle courses',
  'Semora checks Moodle every few hours. When next semester’s courses appear, they will show up here.',
  'Moodle is now listing courses Semora has not imported. Nothing has been added to your semesters — choose what belongs and where it goes.',
  'What Canvas sends, and what it does not', 'Comes through:', 'Does not:',
  'assignments and calendar events that have a due date, with their title, date and — when Canvas includes one — the assignment description. Every item links back to Canvas.',
  'grades and scores, whether you submitted something, file attachments, and anything with no due date — an undated assignment is not in the feed at all, so Semora never sees it.',
  // Moodle's own version of that box.
  'What Moodle sends, and what it does not',
  'assignments, quizzes and calendar events that have a date, with their title, date and — when Moodle includes one — the description. Every item links to its day in your Moodle calendar.',
  'grades and scores, whether you submitted something, file attachments, and anything with no date — an activity with no due date is not in your Moodle calendar at all, so Semora never sees it.',
  'These are limits of Moodle’s calendar export itself, not of Semora, and your school decides how far ahead it reaches. Your grades stay in Moodle, and Semora never writes anything back to it.',

  // ── What the server can say back, in an alert or as the card's last error
  'This LMS connection has no enabled courses.',
  'Moodle returned an invalid calendar feed.',
  'Moodle did not respond. Try again in a few minutes.',
  "Your school's Moodle is busy right now. Try again in a few minutes.",
  'Moodle did not return a calendar. Try again in a few minutes.',
  'This Moodle calendar link no longer works. Moodle usually stops it after a password change. Copy a fresh link from Moodle and reconnect.',
  'Your Moodle calendar link stopped working — usually after a Moodle password change. Reconnect with a fresh link.',
  'Reconnect this LMS to continue automatic syncing.',
  'The LMS could not be reached.',
  'LMS synchronization failed.',
  'Canvas Calendar Feed could not be loaded.',
  'Canvas is rate limiting Semora right now. The next sync will pick this up automatically.',

  // ── Every prompt elsewhere that names the platform ─────────────────────
  // For every name the prompt can carry: "Canvas or Moodle" with nothing
  // connected, the student's own platform once they have one.
  ...OFFER_NAMES.flatMap((n) => [
    `Sync ${n} free, limited time offer`, `Sync ${n}, Pro feature`,
    `Sync ${n} free — every class imports itself`, `Or sync ${n} — every class imports itself`,
    `Connect ${n}`, `Connect ${n} (Pro)`, `Connect ${n} (Free)`,
    `Connect ${n} free, limited time offer`, `Connect ${n}, Pro feature`, `Connect ${n} instead`,
    `Connect ${n} and your classes arrive on their own — or scan a syllabus, or type it yourself.`,
    `Connect ${n} and your whole timetable lands here — free, however many classes you take.`,
    `Bring every class in from ${n}, free`, `Or connect ${n} — free`,
    `Import the deadlines already on your ${n} calendar, and Semora keeps them updated when your instructor moves them.`,
    `Takes a minute: you’ll copy your ${n} calendar link.`,
  ]),
  ...['Canvas', 'Moodle'].flatMap((n) => [
    `Limited-time offer: try ${n} Sync free`, `School uses ${n}? Try ${n} Sync free`,
  ]),
  'Limited-time offer: sync Canvas or Moodle free',
  'School uses Canvas or Moodle? Sync it free',
  // Nothing connected: the question, not "Or connect Canvas or Moodle".
  'School on Canvas or Moodle? Connect it free',
  'On Canvas or Moodle? Every class can import itself',
  // A connected student's own platform, in every repair and new-course prompt.
  ...PROVIDERS.flatMap((p) => [
    `Finish ${p} setup`, `Finish ${p} setup — your classes import themselves`,
    `New ${p} courses`, `Import new ${p} courses`, `Connect ${p} · Pro`,
    `${p} has classes Semora has not imported yet`,
    `1 new ${p} course found — its deadlines are not in Semora yet`,
    `3 new ${p} courses found — their deadlines are not in Semora yet`,
    `3 new ${p} courses found, deadlines not imported yet`,
  ]),
  // The web rail's row, which names both platforms.
  'Canvas & Moodle Sync', 'Canvas & Moodle · Pro', 'Canvas & Moodle · Free',
  'Limited time: Canvas and Moodle sync is free, no Pro needed. Every class you have arrives on its own — or scan a syllabus, or type it yourself.',
  'NO COURSE LIMIT · WITH CANVAS OR MOODLE (FREE)',
  'Never get caught by a changed deadline', 'Learn more',
  'Connect once. Every dated assignment on your Canvas or Moodle calendar lands in Semora — and when your instructor changes one, Semora changes it too.',
  'Less checking Canvas or Moodle. More knowing what is next.',
  'Semora only reads your calendar feed. It never posts, changes or removes anything in Canvas or Moodle.',
  'IF YOUR SCHOOL USES CANVAS OR MOODLE',
  'Semora re-checks Canvas or Moodle every few hours. When an instructor moves a due date, yours moves with it.',
  'Your private Canvas or Moodle calendar link, encrypted on our side. Semora can read your deadlines — never post, submit or change anything.',
  'Free on every plan, with no limit on Canvas or Moodle classes. Semora offers the setup right after you sign in.',
  'Free: one AI action (a scan or a lecture), one course you add yourself, unlimited classes from Canvas or Moodle, and same-day reminders. The tools above are part of Pro.',
  'Ask across every course — your deadlines are already here. Choose a course from the context bar to add its syllabus and notes.',
];

Deno.test('every string on the connect path reaches Spanish', () => {
  const missing = MUST_TRANSLATE.filter((s) => translate(s, 'es') === s);
  assert(missing.length === 0, `untranslated:\n  ${missing.join('\n  ')}`);
});

// English words that have no business in a Spanish sentence. Web addresses
// are removed first: they stay as they are, and "moodle.yourschool.edu" is not
// a leftover.
const ENGLISH_LEFT = /\b(the|your|and|setup|with|from|you|this|that|free|sync|link|course|courses|due|found|instead|reconnect|school|page|tap|copy|paste|imported)\b/i;

Deno.test('no half-translated sentence on the connect path', () => {
  const mixed = MUST_TRANSLATE
    .map((s) => [s, translate(s, 'es')] as const)
    .filter(([, es]) => ENGLISH_LEFT.test(es.replace(/\S*[./]\S*/g, '')));
  assert(mixed.length === 0, `English left in the Spanish:\n  ${mixed.map(([s, es]) => `${s}\n    → ${es}`).join('\n  ')}`);
});

// Several of these are passed through t() and then rendered in a localized
// Text, which translates them again. The Spanish has to come through that
// second pass as it went in.
Deno.test('the Spanish survives being translated a second time', () => {
  const moved = MUST_TRANSLATE
    .map((s) => translate(s, 'es'))
    .filter((es) => translate(es, 'es') !== es);
  assert(moved.length === 0, `changed on a second pass:\n  ${moved.join('\n  ')}`);
});

Deno.test('Moodle reads the way Canvas always has, and Canvas is unchanged', () => {
  // The Canvas sentences are catalogue keys, so they are what they were.
  assertEquals(translate('Finish Canvas setup', 'es'), 'Termina de configurar Canvas');
  assertEquals(translate('Connect Canvas', 'es'), 'Conectar Canvas');
  assertEquals(translate('Sync Canvas free, limited time offer', 'es'), 'Sincronizar Canvas gratis, oferta por tiempo limitado');
  // Every other name gets the same words.
  assertEquals(translate('Finish Moodle setup', 'es'), 'Termina de configurar Moodle');
  assertEquals(
    translate('Finish Moodle setup — your classes import themselves', 'es'),
    'Termina de configurar Moodle: tus clases se importan solas',
  );
  assertEquals(translate('Connect Canvas or Moodle', 'es'), 'Conectar Canvas o Moodle');
  assertEquals(
    translate('Sync Canvas or Moodle free, limited time offer', 'es'),
    'Sincronizar Canvas o Moodle gratis, oferta por tiempo limitado',
  );
  // The laptop steps name the settings row by the Spanish the row itself
  // shows, for both platforms.
  const row = translate('Canvas or LMS Sync', 'es');
  for (const step of [
    'Open Settings, then Canvas or LMS Sync, and choose Canvas.',
    'Open Settings, then Canvas or LMS Sync, and choose Moodle.',
  ]) assert(translate(step, 'es').includes(row), `${step} does not name "${row}"`);
});

Deno.test('the LMS prompts do not take over sentences that are not theirs', () => {
  // The generic rule is for a task title, and still is.
  assertEquals(translate('Finish Lab 3 report', 'es'), 'Completar Lab 3 report');
  // A platform that is not one of ours is not dressed up as one.
  assertEquals(translate('Connect Sakai', 'es'), 'Connect Sakai');
  // The screen-reader banner agrees with its count, though its English does not.
  assertEquals(
    translate('1 new Moodle courses found, deadlines not imported yet', 'es'),
    '1 curso nuevo de Moodle encontrado, sus entregas aún no se importan',
  );
});
