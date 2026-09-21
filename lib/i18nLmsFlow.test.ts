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
 */
import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { translate } from './i18n';

const MUST_TRANSLATE = [
  // The sync line, as it is actually rendered, for every provider and every age.
  'Updated 2h ago · Moodle checks every few hours',
  'Updated 15m ago · Canvas checks every few hours',
  'Updated just now · Blackboard checks every few hours',
  'Not synced yet · Reconnect required',
  'Updated 3d ago · Automatic sync on',
  'Updated 1h ago · Device sync only',
  // The Moodle flow.
  'Hide the link', 'Show the link',
  'Which one does your school use?',
  'All three are free, with no limit on the number of classes.',
  'Uses the calendar link your school already gives you',
  'Rechecks automatically every few hours',
  'Connect Moodle to Semora',
  'Create a semester before connecting so imported courses have a home.',
  'Ask across every course — your deadlines are already here. Choose a course from the context bar to add its syllabus and notes.',
  // Shared review and failure surfaces the Moodle path reaches.
  'Different semester?', 'Import anyway', 'The import failed.',
  // The hero every student sees, and the free-sync cards for both platforms.
  'When a due date moves, you already know.',
  'Lock in free Moodle sync', 'Lock in free Canvas sync',
  // The Canvas guided paste, every step of it. This flow was at 24 of 46 while
  // Moodle was at 57 of 57 — the road most students take was the half-English
  // one, which is the opposite of what anyone assumed.
  'Your college or university',
  'Could not reach the school directory just now.',
  'No match. Your school may use its own Canvas address.',
  'Sign in to your college Canvas account on the page Semora opens.',
  'In the menu down the left side, tap Calendar.',
  'Scroll to the very bottom of the panel on the right.',
  'Tap Calendar Feed. A box opens with a long link starting webcal://',
  'Press and hold that link, then tap Copy.',
  'Come back to Semora. The link drops into the box below by itself.',
  'On your laptop, open',
  'Open Settings, then Canvas or LMS Sync, and choose Canvas.',
  'Actually, let me try on my phone',
  'I know my Canvas web address',
  'Use this address',
  'Search for my school instead',
  'Calendar Feed',
  'Open my Canvas calendar',
  'Different school',
  'Where to find your link',
  'Nothing that looks like a Canvas link is on your clipboard yet. Copy it in Canvas first.',
  'Link looks right — checking Canvas…',
  'That is a Canvas page, not the Calendar Feed link.',
];

Deno.test('every string on the connect path reaches Spanish', () => {
  const missing = MUST_TRANSLATE.filter((s) => translate(s, 'es') === s);
  assert(missing.length === 0, `untranslated:\n  ${missing.join('\n  ')}`);
});
