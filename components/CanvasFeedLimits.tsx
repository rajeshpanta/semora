import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useColors } from '@/lib/theme';

/**
 * What a Canvas Calendar Feed can and cannot tell Semora.
 *
 * ─── WHY THIS IS ONE COMPONENT ──────────────────────────────
 * The same limits apply on the connect screen and again every time a student
 * imports a new term, and they were stated in one place and not the other. Two
 * copies of a promise drift; one of them then becomes wrong, and the wrong one
 * is the reason someone believes Semora lost their grades.
 *
 * ─── WHY IT SAYS WHAT IT SAYS ───────────────────────────────
 * These are properties of the FEED, not of Semora. A Canvas Calendar Feed is
 * an .ics file: it carries dated items with a title, a date and sometimes a
 * description, and it carries nothing else. Semora cannot retrieve a grade
 * through it however hard it tries, because the grade is not in there.
 *
 * That distinction is the whole point of naming the limits up front. A student
 * who expects grades to appear and finds none concludes the sync is broken and
 * disconnects it. A student who was told beforehand knows their deadlines are
 * right and their grades live in Canvas, which is true and is the deal they
 * actually agreed to.
 *
 * The undated case is the one that surprises people most: an assignment with
 * no due date in Canvas is simply absent from the feed, not skipped by Semora.
 *
 * ─── MOODLE ─────────────────────────────────────────────────
 * A Moodle calendar export is the same kind of file with its own differences,
 * and every Canvas sentence here was a claim about Canvas. Two are false for
 * Moodle: its events carry no link to the item (Semora links the day in the
 * Moodle calendar instead), and how far ahead it reaches is the SCHOOL's
 * setting, not a property of the format. So Moodle gets its own sentences,
 * each true of what moodle-calendar.ts actually reads, rather than Canvas's
 * with the name swapped.
 */
export function CanvasFeedLimits({
  compact = false,
  provider = 'canvas',
}: {
  compact?: boolean;
  /** 'moodle' for a Moodle calendar link; anything else reads as Canvas. */
  provider?: string;
}) {
  const colors = useColors();
  if (provider === 'moodle') return <MoodleFeedLimits compact={compact} />;
  return (
    <View style={[styles.box, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={styles.head}>
        <FontAwesome name="info-circle" size={13} color={colors.ink3} />
        <Text style={[styles.title, { color: colors.ink2 }]}>What Canvas sends, and what it does not</Text>
      </View>

      <Text style={[styles.line, { color: colors.ink2 }]}>
        <Text style={styles.strong}>Comes through: </Text>
        assignments and calendar events that have a due date, with their title, date and — when
        Canvas includes one — the assignment description. Every item links back to Canvas.
      </Text>

      <Text style={[styles.line, { color: colors.ink2 }]}>
        <Text style={styles.strong}>Does not: </Text>
        grades and scores, whether you submitted something, file attachments, and anything with
        no due date — an undated assignment is not in the feed at all, so Semora never sees it.
      </Text>

      {!compact && (
        <Text style={[styles.line, { color: colors.ink2 }]}>
          These are limits of the Calendar Feed itself, not of Semora. A very long description is
          shortened with a link to the full text in Canvas. Your grades stay in Canvas, and Semora
          never writes anything back to it.
        </Text>
      )}
    </View>
  );
}

function MoodleFeedLimits({ compact }: { compact: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.box, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={styles.head}>
        <FontAwesome name="info-circle" size={13} color={colors.ink3} />
        <Text style={[styles.title, { color: colors.ink2 }]}>What Moodle sends, and what it does not</Text>
      </View>

      <Text style={[styles.line, { color: colors.ink2 }]}>
        <Text style={styles.strong}>Comes through: </Text>
        {'assignments, quizzes and calendar events that have a date, with their title, date and — when Moodle includes one — the description. Every item links to its day in your Moodle calendar.'}
      </Text>

      <Text style={[styles.line, { color: colors.ink2 }]}>
        <Text style={styles.strong}>Does not: </Text>
        {'grades and scores, whether you submitted something, file attachments, and anything with no date — an activity with no due date is not in your Moodle calendar at all, so Semora never sees it.'}
      </Text>

      {!compact && (
        <Text style={[styles.line, { color: colors.ink2 }]}>
          {'These are limits of Moodle’s calendar export itself, not of Semora, and your school decides how far ahead it reaches. Your grades stay in Moodle, and Semora never writes anything back to it.'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { fontSize: 14, fontWeight: '700' },
  line: { fontSize: 13, lineHeight: 19 },
  strong: { fontWeight: '700' },
});
