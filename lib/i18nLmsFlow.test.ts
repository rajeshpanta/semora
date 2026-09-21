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
];

Deno.test('every string on the connect path reaches Spanish', () => {
  const missing = MUST_TRANSLATE.filter((s) => translate(s, 'es') === s);
  assert(missing.length === 0, `untranslated:\n  ${missing.join('\n  ')}`);
});
