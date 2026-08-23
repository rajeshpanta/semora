import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { useCourses, useSemesters } from '@/lib/queries';
import { track } from '@/lib/analytics';

/**
 * What happens immediately after a syllabus import succeeds.
 *
 * This screen exists because of a measured problem: the median account has
 * exactly ONE course in it, and only four accounts have ever set up three or
 * more. Semora's promise — every deadline from every class in one place — does
 * not exist at one class. A student with one course has a to-do list, which
 * their phone already had.
 *
 * The import used to end in an Alert offering "View Course" or "Go Home".
 * Both are exits. Neither asks the one question that decides whether this
 * account becomes a semester or a single scan, so it is asked here, at the
 * moment the product has just proved it works and the student still has the
 * rest of their syllabi in front of them.
 *
 * The count is deliberately framed as progress-in-progress rather than as a
 * congratulation: "1 class" reads as unfinished, which is the honest state.
 * No invented benchmark about how many classes people "should" have — the
 * student knows their own timetable, and a made-up average would be noise.
 */
export default function SyllabusAddedScreen() {
  const router = useRouter();
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const params = useLocalSearchParams<{ courseId?: string; courseName?: string; count?: string }>();

  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const { data: courses = [], isLoading: coursesLoading } = useCourses(selectedSemesterId);
  const { data: semesters = [] } = useSemesters();

  const savedCount = Number(params.count) || 0;
  const courseCount = courses.length;
  const semesterName = semesters.find((s) => s.id === selectedSemesterId)?.name ?? 'this semester';

  // Reported once per import, and only once the course list has actually
  // loaded. Firing at mount would stamp course_count: 0 on every event — the
  // number this prompt exists to move would be unreadable from day one.
  const reported = useRef(false);
  useEffect(() => {
    if (coursesLoading || reported.current) return;
    reported.current = true;
    track('next_class_prompt_shown', { screen: 'syllabus_added', course_count: courseCount });
  }, [coursesLoading, courseCount]);

  // iOS-only and once per device. Held in local state as well as the store so
  // dismissing it animates away immediately rather than waiting on storage.
  const widgetTipSeen = useAppStore((s) => s.widgetTipSeen);
  const setWidgetTipSeen = useAppStore((s) => s.setWidgetTipSeen);
  const [widgetTipDismissed, setWidgetTipDismissed] = useState(false);
  const showWidgetTip = Platform.OS === 'ios' && !widgetTipSeen && !widgetTipDismissed;

  const dismissWidgetTip = () => {
    setWidgetTipDismissed(true);
    setWidgetTipSeen(true);
    track('widget_tip_dismissed', { screen: 'syllabus_added' });
  };

  useEffect(() => {
    if (showWidgetTip) track('widget_tip_shown', { screen: 'syllabus_added' });
    // Once per mount, when it first becomes visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goScan = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    track('next_class_started', { screen: 'syllabus_added', course_count: courseCount });
    router.replace('/(tabs)/scan' as any);
  };

  const goCourse = () => {
    if (params.courseId) router.replace(`/course/${params.courseId}` as any);
    else router.replace('/(tabs)' as any);
  };

  const goHome = () => {
    track('next_class_declined', { screen: 'syllabus_added', course_count: courseCount });
    router.replace('/(tabs)' as any);
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.paper }]}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth || SCREEN_MAX_WIDTH }]}>
        <View style={[styles.check, { backgroundColor: colors.brand50 }]}>
          <FontAwesome name="check" size={26} color={colors.brand} />
        </View>

        <Text style={[styles.heading, { color: colors.ink }]}>
          {params.courseName ? `${params.courseName} is in` : 'Course added'}
        </Text>
        <Text style={[styles.sub, { color: colors.ink3 }]}>
          {savedCount > 0
            ? `${savedCount} deadline${savedCount === 1 ? '' : 's'} pulled from your syllabus.`
            : 'Your syllabus has been imported.'}
        </Text>

        {/* Progress, stated plainly. One class reads as unfinished on its own —
            it needs no prodding copy to make the point. */}
        <View style={[styles.progress, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.progressCount, { color: colors.ink }]}>
            {`${courseCount} class${courseCount === 1 ? '' : 'es'}`}
          </Text>
          <Text style={[styles.progressLabel, { color: colors.ink3 }]}>{`in ${semesterName}`}</Text>
          {courses.length > 0 && (
            <View style={styles.chips}>
              {courses.slice(0, 6).map((course) => (
                <View
                  key={course.id}
                  style={[styles.chip, { borderColor: colors.line, backgroundColor: colors.paper }]}
                >
                  <View style={[styles.dot, { backgroundColor: course.color || colors.brand }]} />
                  <Text style={[styles.chipText, { color: colors.ink2 }]} numberOfLines={1}>
                    {course.name}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* The widget has shipped since launch and nothing has ever mentioned
            it, so essentially nobody has one. It is the only part of Semora
            that keeps working for a student who has stopped opening the app —
            which, going by the numbers, is most of them. Shown once, here,
            because this is the first moment there is anything worth putting on
            a home screen. iOS only: there is no such thing on the web. */}
        {showWidgetTip && (
          <View style={[styles.widgetTip, { backgroundColor: colors.brand50, borderColor: colors.line }]}>
            <View style={styles.widgetTipHead}>
              <FontAwesome name="th-large" size={14} color={colors.brand} />
              <Text style={[styles.widgetTipTitle, { color: colors.ink }]}>Put it on your home screen</Text>
            </View>
            <Text style={[styles.widgetTipBody, { color: colors.ink2 }]}>
              Semora has a widget that shows what’s due next, so you see it without opening anything.
              Touch and hold your home screen, tap Edit → Add Widget, then search Semora.
            </Text>
            <TouchableOpacity onPress={dismissWidgetTip} style={styles.widgetTipDismiss}>
              <Text style={[styles.widgetTipDismissText, { color: colors.brand }]}>Got it</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={[styles.ask, { color: colors.ink }]}>What else are you taking?</Text>
        <Text style={[styles.askSub, { color: colors.ink3 }]}>
          Semora can only watch the classes it knows about. Add the rest and every deadline lands in one week view.
        </Text>

        <TouchableOpacity style={[styles.primary, { backgroundColor: colors.brand }]} onPress={goScan}>
          <FontAwesome name="plus" size={15} color="#fff" />
          <Text style={styles.primaryText}>Add another class</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.secondary, { borderColor: colors.line }]} onPress={goCourse}>
          <Text style={[styles.secondaryText, { color: colors.ink }]}>
            {params.courseName ? `View ${params.courseName}` : 'View course'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.tertiary} onPress={goHome}>
          <Text style={[styles.tertiaryText, { color: colors.ink3 }]}>Done for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.paper },
  content: {
    paddingHorizontal: 22,
    paddingTop: 36,
    paddingBottom: 48,
    width: '100%',
    alignSelf: 'center',
    alignItems: 'center',
  },
  check: {
    width: 62, height: 62, borderRadius: 31,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },
  heading: {
    fontFamily: FONTS.display, fontSize: 25, textAlign: 'center', lineHeight: 32,
  },
  sub: { fontSize: 15, textAlign: 'center', marginTop: 7, maxWidth: 320 },

  progress: {
    width: '100%', borderRadius: 16, borderWidth: 1,
    paddingVertical: 18, paddingHorizontal: 18,
    marginTop: 26, alignItems: 'center',
  },
  progressCount: { fontFamily: FONTS.display, fontSize: 21 },
  progressLabel: { fontSize: 13.5, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center', marginTop: 14 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11,
    maxWidth: 190,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 12.5, flexShrink: 1 },

  widgetTip: {
    width: '100%', borderRadius: 14, borderWidth: 1,
    paddingVertical: 14, paddingHorizontal: 16, marginTop: 22,
  },
  widgetTipHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  widgetTipTitle: { fontSize: 15, fontWeight: '700' },
  widgetTipBody: { fontSize: 13.5, lineHeight: 19, marginTop: 6 },
  widgetTipDismiss: { alignSelf: 'flex-start', paddingVertical: 8, marginTop: 2 },
  widgetTipDismissText: { fontSize: 14, fontWeight: '600' },

  ask: { fontFamily: FONTS.display, fontSize: 20, textAlign: 'center', marginTop: 30 },
  askSub: { fontSize: 14.5, textAlign: 'center', marginTop: 7, maxWidth: 330, lineHeight: 21 },

  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9,
    width: '100%', borderRadius: 999, paddingVertical: 15, marginTop: 22,
  },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondary: {
    width: '100%', borderRadius: 999, borderWidth: 1,
    paddingVertical: 14, alignItems: 'center', marginTop: 10,
  },
  secondaryText: { fontSize: 15.5, fontWeight: '600' },
  tertiary: { paddingVertical: 14, marginTop: 4 },
  tertiaryText: { fontSize: 14.5 },
});
