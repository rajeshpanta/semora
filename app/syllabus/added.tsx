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
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '@/store/appStore';
import { useCourses, useSemesters } from '@/lib/queries';
import { track } from '@/lib/analytics';
import { canvasFreePromoQuery, canvasOfferFor, lmsConnectionsQuery } from '@/lib/lms';
import { canvasOfferDestination, trackCanvasOfferTapped } from '@/lib/canvasFunnel';
import { CanvasOfferImpression } from '@/components/CanvasOfferImpression';

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
  const params = useLocalSearchParams<{ courseId?: string; courseName?: string; count?: string; offerPro?: string }>();

  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const { data: courses = [], isLoading: coursesLoading } = useCourses(selectedSemesterId);
  const { data: semesters = [] } = useSemesters();

  // The post-scan Pro offer, handed over by app/syllabus/review.tsx instead of
  // being taken there. It fires on the way OUT of this screen (see goHome), so
  // a student who leaves without adding another class still hears the offer,
  // and one who keeps going is not interrupted mid-momentum.
  const offerPro = params.offerPro === '1';
  const isPro = useAppStore((s) => s.isPro);
  const setAhaPaywallShown = useAppStore((s) => s.setAhaPaywallShown);

  // Canvas belongs on this screen more than anywhere else in the app: the
  // question above the buttons is "what else are you taking?", and for a free
  // student Canvas is the ONLY answer that is not capped — they get one course
  // they add themselves, and unlimited ones through a connection. Until today
  // this screen did not contain the word Canvas.
  const { data: lmsConnections } = useQuery(lmsConnectionsQuery);
  const { data: canvasFreePromo } = useQuery(canvasFreePromoQuery);
  const { offer: canvasOffer, free: canvasFree } = canvasOfferFor(lmsConnections, isPro, canvasFreePromo);
  const showCanvas = canvasOffer !== 'healthy';

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
    // "Done for now" is where the Pro offer lives now. The student has seen
    // their semester, been told Canvas is free, and chosen to stop — which is
    // the first honest moment to name a price. The flag burns HERE, when the
    // paywall is actually shown, rather than on the way past it.
    if (offerPro) {
      setAhaPaywallShown(true);
      router.replace({
        pathname: '/paywall',
        params: { context: 'postScan', count: String(savedCount), courseId: params.courseId },
      } as any);
      return;
    }
    router.replace('/(tabs)' as any);
  };

  const goCanvas = () => {
    trackCanvasOfferTapped({ screen: 'syllabus_added', offer: canvasOffer, free: canvasFree, source: 'syllabus_added' });
    const to = canvasOfferDestination(canvasOffer, 'syllabus_added');
    // A locked offer would send a free student to the upgrade sheet; this
    // screen has no sheet, and the paywall is already what "Done for now"
    // leads to, so the row is only rendered when Canvas is genuinely
    // available to them (see showCanvas).
    if (to.kind === 'upsell') {
      setAhaPaywallShown(true);
      router.replace({ pathname: '/paywall', params: { context: 'canvas' } } as any);
      return;
    }
    router.push({ pathname: to.pathname, params: to.params } as any);
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

        {/* The free route to the same place, named on the screen that asks the
            question. A free account is capped at one course it adds itself but
            not at Canvas courses, so for most students standing here this row
            is the only way to answer "what else are you taking?" without
            paying — and it brings every class at once rather than one syllabus
            at a time. */}
        {showCanvas && (
          <>
            <CanvasOfferImpression screen="syllabus_added" offer={canvasOffer} free={canvasFree} source="syllabus_added" />
            <TouchableOpacity
              style={[styles.canvasRow, { backgroundColor: colors.teal50, borderColor: colors.teal }]}
              onPress={goCanvas}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={canvasOffer === 'needs_attention' ? 'Finish Canvas setup' : 'Bring every class in from Canvas, free'}
            >
              <View style={[styles.canvasIcon, { backgroundColor: colors.teal + '22' }]}>
                <FontAwesome name={canvasOffer === 'needs_attention' ? 'refresh' : 'university'} size={15} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.canvasTitle, { color: colors.ink }]}>
                  {canvasOffer === 'needs_attention' ? 'Finish Canvas setup' : 'Bring every class in at once'}
                </Text>
                <Text style={[styles.canvasSub, { color: colors.ink3 }]}>
                  Connect Canvas and your whole timetable lands here — free, however many classes you take.
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={12} color={colors.ink3} />
            </TouchableOpacity>
          </>
        )}

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
  canvasRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    width: '100%', borderWidth: 1, borderRadius: 14,
    paddingVertical: 13, paddingHorizontal: 14, marginTop: 10,
  },
  canvasIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  canvasTitle: { fontSize: 14.5, fontWeight: '700' },
  canvasSub: { fontSize: 12.5, marginTop: 2, lineHeight: 17 },

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
