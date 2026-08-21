import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { FONTS, WEB_CARD_SHADOW } from '@/lib/constants';
import { useColors } from '@/lib/theme';

/**
 * The courses rail, with the grades switched off.
 *
 * A laptop open in a lecture hall is a public screen. Every other number on
 * this dashboard describes the COURSE — when work is due, how much of it there
 * is — and is printed on a syllabus the whole room already has. A projected
 * grade is the one number that describes the STUDENT, and the person sitting
 * behind them can read it without trying.
 *
 * So it is masked until asked for. Not blurred, not small: absent, replaced by
 * two dots, and revealed only by a deliberate press that reverts as soon as
 * the screen is left. The outstanding-work count carries the same signal a
 * glance actually needs — which class is slipping — without the letter.
 */
export default function CoursesGlance({
  courses,
  outstandingByCourse,
}: {
  courses: { id: string; name: string; color: string }[];
  /** Course id → how many items are still owed. */
  outstandingByCourse: Record<string, number>;
}) {
  const colors = useColors();
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);

  if (courses.length === 0) return null;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.line },
        WEB_CARD_SHADOW as any,
      ]}
    >
      <View style={[styles.head, { borderBottomColor: colors.line }]}>
        <Text style={[styles.title, { color: colors.ink }]}>Courses</Text>
        <TouchableOpacity
          onPress={() => setRevealed((value) => !value)}
          style={styles.revealBtn}
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'Hide grades' : 'Show grades'}
        >
          <FontAwesome
            name={revealed ? 'eye-slash' : 'eye'}
            size={11}
            color={colors.ink3}
          />
          <Text style={[styles.revealText, { color: colors.ink3 }]}>
            {revealed ? 'Hide grades' : 'Show grades'}
          </Text>
        </TouchableOpacity>
      </View>

      {courses.map((course) => {
        const outstanding = outstandingByCourse[course.id] ?? 0;
        return (
          <TouchableOpacity
            key={course.id}
            style={[styles.row, { borderBottomColor: colors.line }]}
            onPress={() => router.push(`/course/${course.id}` as any)}
            accessibilityRole="button"
          >
            <View style={[styles.dot, { backgroundColor: course.color }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
                {course.name}
              </Text>
              <Text style={[styles.meta, { color: outstanding > 0 ? colors.coral : colors.ink3 }]}>
                {outstanding === 0
                  ? 'Nothing outstanding'
                  : outstanding === 1
                    ? '1 item outstanding'
                    : `${outstanding} items outstanding`}
              </Text>
            </View>
            {revealed ? (
              <Text style={[styles.grade, { color: colors.ink3 }]}>—</Text>
            ) : (
              <View style={styles.mask}>
                <View style={[styles.maskDot, { backgroundColor: colors.ink3 }]} />
                <View style={[styles.maskDot, { backgroundColor: colors.ink3 }]} />
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      <Text style={[styles.footnote, { color: colors.ink3 }]}>
        Grades stay hidden on this screen so a glance over your shoulder shows deadlines, not results.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  title: { fontFamily: FONTS.display, fontSize: 15 },
  revealBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  revealText: { fontSize: 11, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontSize: 13, fontWeight: '600' },
  meta: { fontSize: 11, marginTop: 1 },
  grade: { fontFamily: FONTS.display, fontSize: 16 },
  mask: { flexDirection: 'row', gap: 3, alignItems: 'center', paddingRight: 2 },
  maskDot: { width: 6, height: 6, borderRadius: 3, opacity: 0.42 },
  footnote: { fontSize: 10.5, lineHeight: 15, paddingHorizontal: 14, paddingVertical: 10 },
});
