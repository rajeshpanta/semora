import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { useCourses } from '@/lib/queries';

// Floating action menu opened by the "+" tab button. The tab press itself is
// intercepted in app/(tabs)/_layout.tsx (preventDefault), so this menu is the
// only thing that happens — the scan screen is reached through the menu
// instead of being the middle tab's destination.

interface PlusMenuProps {
  visible: boolean;
  onClose: () => void;
}

type MenuRow = {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  tint: 'brand' | 'coral' | 'teal' | 'blue';
  title: string;
  sub: string;
  route?: { pathname: string; params?: Record<string, string> };
  /** Swaps the sheet to the scan methods instead of navigating. */
  expands?: 'scan';
  /**
   * Ask which class this belongs to before navigating.
   *
   * A lecture or a deck created from here used to land with no course, so it
   * was filed nowhere and the student could not find it again from the class
   * it belonged to. The question is asked here — at the moment of choosing the
   * action — rather than on the destination screen, where it reads as one more
   * field to skip.
   */
  needsCourse?: boolean;
};

const ROOT_ACTIONS: MenuRow[] = [
  // Moved here from the Today tab's floating "+", which sat immediately above
  // the tab bar's "+" — same colour, same shape, same icon, different action.
  // Adding one deadline by hand is the most ordinary thing a student does
  // between scans, so it leads.
  {
    icon: 'check-square-o',
    tint: 'blue',
    title: 'New task',
    sub: 'Add a single deadline yourself',
    route: { pathname: '/task/new' },
  },
  {
    icon: 'microphone',
    tint: 'coral',
    title: 'Record lecture',
    sub: 'Transcript & notes, made for you',
    route: { pathname: '/lecture/record' },
    needsCourse: true,
  },
  {
    icon: 'camera',
    tint: 'brand',
    title: 'Scan syllabus',
    sub: 'Photo, PDF, document or file',
    expands: 'scan',
  },
];

// The four capture methods, shown IN the menu rather than on a screen behind it.
//
// These used to be a "Scan syllabus" row that opened /scan — a full screen whose
// only job was to ask the same question again — plus two shortcut rows ("Upload
// document" / "Upload image") that deep-linked into that screen and auto-fired a
// picker. That split meant the menu offered two of the four methods at random
// while burying the other two one screen down. Every method is a peer now, and
// /scan is what the picker returns to rather than a step on the way in.
const SCAN_ACTIONS: MenuRow[] = [
  {
    icon: 'camera',
    tint: 'brand',
    title: 'Take a photo',
    sub: 'Printed handout or whiteboard',
    route: { pathname: '/scan', params: { action: 'camera' } },
  },
  {
    icon: 'file-text-o',
    tint: 'coral',
    title: 'Upload a document',
    // One row, not two. "Upload a document" and "Pick from Files" ran
    // byte-identical code — the same OS document picker, which already browses
    // Files, iCloud Drive and Google Drive. Two labels for one action is a
    // choice the user cannot get right, so the subtitle covers both mental
    // models instead.
    sub: 'PDF or Word — Files, iCloud, Drive',
    route: { pathname: '/scan', params: { action: 'document' } },
  },
  {
    icon: 'image',
    tint: 'teal',
    title: 'Choose from Photos',
    sub: 'Select from your photo library',
    route: { pathname: '/scan', params: { action: 'photos' } },
  },
];

const SHORTCUTS: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  path: string;
  needsCourse?: boolean;
}[] = [
  // Flashcards is the one shortcut that CREATES something — /flashcards is both
  // the deck library and where a new deck is made — so it asks for a class the
  // same way Record lecture does. The other three only open a screen.
  { icon: 'clone', label: 'Flashcards', path: '/flashcards', needsCourse: true },
  { icon: 'graduation-cap', label: 'AI Tutor', path: '/tutor' },
  { icon: 'hourglass-half', label: 'Focus', path: '/pomodoro' },
  { icon: 'microphone', label: 'Lectures', path: '/lecture' },
];

export function PlusMenu({ visible, onClose }: PlusMenuProps) {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const slide = useRef(new Animated.Value(0)).current;
  const [page, setPage] = useState<'root' | 'scan' | 'course'>('root');
  // Where to go once a class is chosen. Held rather than passed through the
  // page state so the course list stays a dumb list, whatever asked for it.
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const selectedSemesterId = useAppStore((st) => st.selectedSemesterId);
  const { data: courses = [], isLoading: coursesLoading } = useCourses(selectedSemesterId);

  useEffect(() => {
    if (visible) {
      // Always reopen at the top level. Reopening on the scan sub-page would
      // leave someone who wanted the recorder staring at file pickers.
      setPage('root');
      setPendingPath(null);
      slide.setValue(0);
      Animated.spring(slide, { toValue: 1, useNativeDriver: true, damping: 18, stiffness: 220 }).start();
    }
  }, [visible]);

  const go = (pathname: string, params?: Record<string, string>) => {
    onClose();
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname, params } as any);
  };

  const openScanPage = () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPage('scan');
  };

  /**
   * Route to `path`, asking which class it belongs to first — but only when
   * that question has more than one possible answer.
   *
   * With no courses there is nothing to choose. With exactly one, the answer is
   * already known, and making someone confirm their only class is the kind of
   * step that makes an app feel like paperwork. Two or more is the only case
   * where asking earns its tap.
   */
  const goWithCourse = (path: string) => {
    // "Still loading" is not "no courses". Reading data alone, a cold start
    // plus a fast tap routed with no class at all — the exact filing problem
    // this picker exists to prevent — because an unresolved query and an empty
    // semester look identical from here. When in doubt, ask.
    if (coursesLoading) {
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPendingPath(path);
      setPage('course');
      return;
    }
    if (courses.length === 0) return go(path);
    if (courses.length === 1) return go(path, { courseId: courses[0].id });
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingPath(path);
    setPage('course');
  };

  const pickCourse = (courseId?: string) => {
    if (!pendingPath) return;
    go(pendingPath, courseId ? { courseId } : undefined);
  };

  // Recording is native-only (see lib/lectureRecorder.ts), so the browser must
  // not offer a row that can only apologise.
  const rootRows = Platform.OS === 'web'
    ? ROOT_ACTIONS.filter((a) => a.title !== 'Record lecture')
    : ROOT_ACTIONS;
  // Same reason the scan screen hides its camera card on desktop: there is no
  // camera behind it, only a file dialog wearing a camera label.
  const scanRows = isDesktop
    ? SCAN_ACTIONS.filter((a) => a.title !== 'Take a photo')
    : SCAN_ACTIONS;
  const rows = page === 'scan' ? scanRows : page === 'course' ? [] : rootRows;

  const tints: Record<MenuRow['tint'], { bg: string; fg: string }> = {
    brand: { bg: colors.brand50, fg: colors.brand },
    coral: { bg: colors.coral50, fg: colors.coral },
    teal: { bg: colors.teal50, fg: colors.teal },
    blue: { bg: colors.blue50, fg: colors.blue },
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Backdrop and sheet are SIBLINGS, not parent/child: a pressable
          backdrop wrapping the sheet swallowed every row press under the new
          architecture (rows never fired while the backdrop always did). */}
      <View style={styles.host}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" />
        <Animated.View
          style={[
            styles.sheetWrap,
            { paddingBottom: insets.bottom + 84 },
            {
              opacity: slide,
              transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
            },
          ]}
        >
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
            {rows.map((a) => (
              <TouchableOpacity
                key={a.title}
                style={styles.row}
                activeOpacity={0.7}
                onPress={() => {
                  if (a.expands) return openScanPage();
                  if (a.needsCourse) return goWithCourse(a.route!.pathname);
                  return go(a.route!.pathname, a.route!.params);
                }}
                accessibilityRole="button"
                accessibilityLabel={a.title}
              >
                <View style={[styles.rowIcon, { backgroundColor: tints[a.tint].bg }]}>
                  <FontAwesome name={a.icon} size={17} color={tints[a.tint].fg} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: colors.ink }]}>{a.title}</Text>
                  <Text style={[styles.rowSub, { color: colors.ink3 }]}>{a.sub}</Text>
                </View>
                <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
              </TouchableOpacity>
            ))}

            {/* Which class? Rendered in the sheet rather than as another modal —
                the same one-step-deeper move the scan methods already make, so
                there is one interaction to learn instead of two. */}
            {page === 'course' && (
              <>
                <Text style={[styles.courseHeading, { color: colors.ink3 }]}>Which class is this for?</Text>
                {/* The guard above opens this page while the query is still in
                    flight — asking is right, but without this the sheet showed
                    a heading over nothing for a beat, which reads as "you have
                    no classes" rather than "still loading". */}
                {coursesLoading && courses.length === 0 && (
                  <View style={styles.courseLoading}>
                    <ActivityIndicator size="small" color={colors.brand} />
                    <Text style={[styles.rowSub, { color: colors.ink3 }]}>Loading your classes…</Text>
                  </View>
                )}
                {courses.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={styles.row}
                    activeOpacity={0.7}
                    onPress={() => pickCourse(c.id)}
                    accessibilityRole="button"
                    accessibilityLabel={c.name}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: (c.color || colors.brand) + '22' }]}>
                      <FontAwesome name="book" size={16} color={c.color || colors.brand} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowTitle, { color: colors.ink }]} numberOfLines={1}>{c.name}</Text>
                      {c.instructor ? (
                        <Text style={[styles.rowSub, { color: colors.ink3 }]} numberOfLines={1}>{c.instructor}</Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                ))}
                {/* Both course_id columns are nullable by design — a lecture for
                    a class that isn't in Semora, a deck that spans subjects. */}
                <TouchableOpacity
                  style={styles.row}
                  activeOpacity={0.7}
                  onPress={() => pickCourse()}
                  accessibilityRole="button"
                  accessibilityLabel="Not for a specific class"
                >
                  <View style={[styles.rowIcon, { backgroundColor: colors.line }]}>
                    <FontAwesome name="minus" size={14} color={colors.ink3} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowTitle, { color: colors.ink2 }]}>Not for a specific class</Text>
                  </View>
                </TouchableOpacity>
              </>
            )}

            <View style={[styles.divider, { backgroundColor: colors.line }]} />

            {page !== 'root' ? (
              <TouchableOpacity
                style={styles.backRow}
                activeOpacity={0.7}
                onPress={() => { setPendingPath(null); setPage('root'); }}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <FontAwesome name="chevron-left" size={12} color={colors.ink3} />
                <Text style={[styles.backText, { color: colors.ink2 }]}>Back</Text>
              </TouchableOpacity>
            ) : (
            <View style={styles.shortcutRow}>
              {SHORTCUTS.map((s) => (
                <TouchableOpacity
                  key={s.label}
                  style={styles.shortcut}
                  activeOpacity={0.7}
                  onPress={() => (s.needsCourse ? goWithCourse(s.path) : go(s.path))}
                  accessibilityRole="button"
                  accessibilityLabel={s.label}
                >
                  <View style={[styles.shortcutIcon, { backgroundColor: colors.brand50 }]}>
                    <FontAwesome name={s.icon} size={15} color={colors.brand} />
                  </View>
                  <Text style={[styles.shortcutLabel, { color: colors.ink2 }]}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(10,10,14,0.45)' },
  sheetWrap: { paddingHorizontal: 14, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  sheet: { borderRadius: 24, borderWidth: 0.5, padding: 10, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 14 },
  rowIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  courseLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 10 },
  courseHeading: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.3, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 2 },
  rowTitle: { fontSize: 15, fontWeight: '600', fontFamily: FONTS.displaySemibold },
  rowSub: { fontSize: 12.5, marginTop: 1 },
  divider: { height: 0.5, marginVertical: 8, marginHorizontal: 6 },
  shortcutRow: { flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 6, paddingTop: 2 },
  shortcut: { alignItems: 'center', gap: 5, minWidth: 62 },
  shortcutIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  shortcutLabel: { fontSize: 11, fontWeight: '500' },
  backRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 10 },
  backText: { fontSize: 14, fontWeight: '600' },
});
