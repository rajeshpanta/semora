import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text } from '@/components/LocalizedReactNative';
import {
  useRef,
  useState,
  useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
// JS resolves once the package is installed (it is); only the native capture
// call needs a runtime guard, since the native module ships with the next
// native build. Importing normally keeps tsc + Metro happy pre-rebuild.
import { captureRef } from 'react-native-view-shot';
import {
  SemesterShareCard,
  SHARE_CARD_WIDTH,
  SHARE_CARD_HEIGHT,
  type SemesterShareCardCourse,
} from '@/components/SemesterShareCard';
import { COLORS, FONTS, SCREEN_MAX_WIDTH, MARKETING_URL } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useProUpsell } from '@/components/ProUpsellHost';
import { useResponsive } from '@/lib/responsive';
import { getAppLocale } from '@/lib/i18n';
import { useAppStore } from '@/store/appStore';
import { useCourses, useTaskStats, useSemesters } from '@/lib/queries';
import { track } from '@/lib/analytics';
import { shareLink, shareLinkMessage } from '@/lib/shareLink';


export default function ShareSemesterScreen() {
  const router = useRouter();
  const colors = useColors();
  const showProUpsell = useProUpsell();
  const { contentMaxWidth } = useResponsive();
  const insets = useSafeAreaInsets();

  const isPro = useAppStore((s) => s.isPro);
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const { data: semesters = [] } = useSemesters();
  const { data: courses = [] } = useCourses(selectedSemesterId);
  const { data: stats } = useTaskStats(selectedSemesterId);

  const cardRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    track('share_semester_opened', { screen: 'share_semester' });
  }, []);

  const handleClose = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)' as any);
    }
  };

  const activeSemester = semesters.find((s) => s.id === selectedSemesterId);
  const semesterName = activeSemester?.name ?? 'My Semester';
  // "Upcoming deadlines" = every pending (incomplete) task in the semester.
  // useTaskStats already computes pending semester-wide, so we reuse it
  // rather than re-fetching raw rows.
  const deadlineCount = stats?.pending ?? 0;
  const cardCourses: SemesterShareCardCourse[] = courses.map((c) => ({
    name: c.name,
    color: c.color,
  }));

  const handleShare = async () => {
    if (sharing) return;
    setSharing(true);
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    try {
      // WEB TAKES A DIFFERENT PATH, deliberately.
      //
      // Image capture is not available in the browser. react-native-view-shot's
      // default entry calls findNodeHandle, which react-native-web implements
      // as a function that throws — so this screen failed in every browser and
      // blamed "update to the latest version", advice no web user can act on.
      // Going around it to html2canvas (the package's own web backend) was
      // worse: on this tree it blocks the main thread SYNCHRONOUSLY, so the
      // button span forever and no timeout could rescue it — a setTimeout
      // cannot fire while the thread is stuck. Verified in Chrome, twice.
      //
      // So the browser shares the LINK instead of the picture. The point of
      // this screen is that a classmate ends up in Semora; a link does that,
      // instantly and reliably, and the image card remains an iPhone feature.
      if (Platform.OS === 'web') {
        const link = MARKETING_URL;
        const result = await shareLink({
          url: link,
          title: getAppLocale() === 'es' ? 'Mi semestre en Semora' : 'My semester on Semora',
          message: getAppLocale() === 'es'
            ? `Mi semestre ${semesterName}, organizado con Semora. ${link}`
            : `My ${semesterName} — organized with Semora. ${link}`,
        });
        const note = shareLinkMessage(result, link);
        if (note) Alert.alert(note.title, note.body);
        track('semester_shared', {
          screen: 'share_semester',
          courses: cardCourses.length,
          deadlines: deadlineCount,
          surface: 'web_link',
        });
        return;
      }

      // GUARD: react-native-view-shot's native module may be absent until the
      // next native build ships. captureRef throws a native-missing error in
      // that window — catch it and tell the user to update rather than crash.
      let uri: string;
      try {

        uri = await captureRef(cardRef, {
          format: 'png',
          quality: 1,
          // Capture at 2x for a crisp share image on retina previews.
          result: 'tmpfile',
          width: SHARE_CARD_WIDTH * 2,
          height: SHARE_CARD_HEIGHT * 2,
        });
      } catch (err: any) {
        const msg = String(err?.message ?? err ?? '');
        // The native module not being linked yet surfaces as a "null"/
        // "undefined is not a function"/"not available" style error. Treat
        // any capture failure as "needs the latest build" — a friendly Alert
        // beats a red screen for a feature that only works post-rebuild.
        console.warn('[share-semester] captureRef failed:', msg);
        Alert.alert(
          'Almost ready',
          'Update to the latest version of Semora to share your semester.',
        );
        return;
      }

      const caption = getAppLocale() === 'es'
        ? `Mi semestre ${semesterName}, organizado con Semora.`
        : `My ${semesterName} — organized with Semora.`;

        // React Native's built-in share sheet (no new dependency). iOS accepts a
        // file:// url in `url`; the image rides along to Messages/Instagram/etc.
      await Share.share({
        url: uri,
        message: caption,
      });

      track('semester_shared', {
        screen: 'share_semester',
        courses: cardCourses.length,
        deadlines: deadlineCount,
      });
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch (err: any) {
      // Share.share rejects if the sheet fails to present; user-dismiss does
      // NOT reject on iOS, so anything here is a real failure.
      Alert.alert('Couldn\'t share', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  // ── Free-tier locked teaser ───────────────────────────────
  // Matches the existing gate pattern (course/[id].tsx, GradeCard): a locked
  // surface that routes to /paywall with this feature's context.
  if (!isPro) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.paper }]}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <TouchableOpacity
            style={[styles.closeBtn, { backgroundColor: colors.card, top: insets.top + 8 }]}
            onPress={handleClose}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <FontAwesome name="times" size={20} color={colors.ink2} />
          </TouchableOpacity>

          <ScrollView
            contentContainerStyle={[styles.lockedContent, { maxWidth: contentMaxWidth }]}
            showsVerticalScrollIndicator={false}
          >
            {/* A dimmed preview of the real card so the value is obvious. */}
            <View style={styles.previewWrap}>
              <View style={styles.lockedCardShadow} pointerEvents="none">
                <SemesterShareCard
                  semesterName={semesterName}
                  courses={cardCourses}
                  deadlineCount={deadlineCount}
                />
              </View>
              <View style={styles.lockedOverlay} pointerEvents="none">
                <View style={[styles.lockBadge, { backgroundColor: colors.ink }]}>
                  <FontAwesome name="lock" size={18} color="#fff" />
                </View>
              </View>
            </View>

            <Text style={[styles.lockedTitle, { color: colors.ink }]}>
              Share your semester
            </Text>
            <Text style={[styles.lockedDesc, { color: colors.ink3 }]}>
              Turn your classes into a beautiful card you can post or send to
              friends — your whole term, set up in 30 seconds.
            </Text>

            <TouchableOpacity
              style={[styles.upgradeBtn, { backgroundColor: colors.brand }]}
              activeOpacity={0.85}
              onPress={() =>
                showProUpsell('share')
              }
            >
              <FontAwesome name="star" size={13} color="#fff" />
              <Text style={styles.upgradeBtnText}>Unlock with Pro</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  // ── Pro: full share surface ───────────────────────────────
  return (
    <View style={[styles.screen, { backgroundColor: colors.paper }]}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.card, top: insets.top + 8 }]}
          onPress={handleClose}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <FontAwesome name="times" size={20} color={colors.ink2} />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.heading, { color: colors.ink }]}>Share your semester</Text>
          <Text style={[styles.subheading, { color: colors.ink3 }]}>
            A card of your whole term — post it, or send it to a friend.
          </Text>

          <View style={styles.previewWrap}>
            <View style={styles.lockedCardShadow}>
              <SemesterShareCard
                ref={cardRef}
                semesterName={semesterName}
                courses={cardCourses}
                deadlineCount={deadlineCount}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[styles.shareBtn, { backgroundColor: colors.brand }, sharing && { opacity: 0.6 }]}
            onPress={handleShare}
            disabled={sharing}
            activeOpacity={0.85}
          >
            {sharing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <FontAwesome name="share" size={15} color="#fff" />
                <Text style={styles.shareBtnText}>Share my semester</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.paper },
  safe: { flex: 1 },
  closeBtn: {
    position: 'absolute', right: 20, zIndex: 10,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  content: {
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 48,
    width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center',
    alignItems: 'center',
  },
  heading: {
    fontFamily: FONTS.display, fontSize: 26, color: COLORS.ink,
    textAlign: 'center', marginTop: 4,
  },
  subheading: {
    fontSize: 14, color: COLORS.ink3, textAlign: 'center',
    marginTop: 6, marginBottom: 24, maxWidth: 300,
  },
  previewWrap: {
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28, position: 'relative',
  },
  // Soft shadow around the captured card so it reads as a physical object in
  // the preview. Not part of the capture (the card clips to its own bounds).
  lockedCardShadow: {
    borderRadius: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 8,
  },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 52, borderRadius: 16, paddingHorizontal: 28,
    backgroundColor: COLORS.brand, minWidth: 240,
  },
  shareBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  // Locked teaser
  lockedContent: {
    paddingHorizontal: 20, paddingTop: 56, paddingBottom: 48,
    width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center',
    alignItems: 'center',
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'center',
  },
  lockBadge: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
  },
  lockedTitle: {
    fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink,
    textAlign: 'center', marginTop: 4,
  },
  lockedDesc: {
    fontSize: 14, color: COLORS.ink3, textAlign: 'center',
    lineHeight: 20, marginTop: 8, marginBottom: 22, maxWidth: 320,
  },
  upgradeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, height: 50, borderRadius: 16, paddingHorizontal: 28,
    backgroundColor: COLORS.brand, minWidth: 220,
  },
  upgradeBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
