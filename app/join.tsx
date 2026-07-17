import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import {
  resolveShare, importSharedCourse,
  stashPendingShareToken, readPendingShareToken, clearPendingShareToken,
  type SharedCourseSnapshot, type ShareResolveStatus,
} from '@/lib/shareCourse';
import { isFreeLimitError } from '@/lib/syllabus';
import { COLORS, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { useSession } from '@/app/_layout';
import { track } from '@/lib/analytics';

// A friend who doesn't have an account yet can tap a share link. We stash the
// token here, then send them through onboarding/auth. AuthGate (app/_layout)
// reads readPendingShareToken() the moment it routes a freshly-authenticated
// user out of the auth/onboarding group and, if a token is pending, redirects
// to /join instead of the tabs — which re-enters this screen, reads the stash,
// and resumes the import. Device-level, single pending token — a newer link
// overwrites an older one (import the last link you tapped).
// The pending-token stash helpers (stash/read/clear) live in lib/shareCourse so
// app/_layout can read the pending token without importing this route screen
// (which would create an import cycle — this screen imports useSession from
// _layout). AuthGate reopens /join here after sign-in when a token is pending.

type LoadState =
  | { phase: 'loading' }
  | { phase: 'ready'; snapshot: SharedCourseSnapshot }
  | { phase: 'invalid'; status: Exclude<ShareResolveStatus, 'ok'> }
  | { phase: 'error'; message: string };

export default function JoinScreen() {
  const { token: tokenParam } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const qc = useQueryClient();
  const { session, loading: sessionLoading } = useSession();
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);

  const [state, setState] = useState<LoadState>({ phase: 'loading' });
  const [importing, setImporting] = useState(false);

  // The token can come from the deep-link param OR, for a friend who just
  // signed in, from the stash we saved before sending them to auth.
  const token = (typeof tokenParam === 'string' && tokenParam) ? tokenParam : readPendingShareToken();

  // Signed-out friend: stash the token and send them through onboarding/auth.
  // AuthGate owns the actual routing (onboarding vs sign-in). We stash + step
  // back out of this screen; when the friend finishes signing in, AuthGate sees
  // the pending token and redirects back here (see readPendingShareToken usage
  // in app/_layout), which resumes the import from the stash below.
  useEffect(() => {
    if (sessionLoading) return;
    if (!token) {
      setState({ phase: 'error', message: 'This link is missing its share code.' });
      return;
    }
    if (!session) {
      stashPendingShareToken(token);
      track('share_course_join_signed_out', { screen: 'join' });
      // Leave this screen so AuthGate's redirect (onboarding / sign-in) takes
      // over cleanly. Replacing to (tabs) lets AuthGate bounce a signed-out
      // user to the right place without this modal lingering on the stack.
      router.replace('/(tabs)' as any);
      return;
    }
  }, [session, sessionLoading, token]);

  // Resolve the preview once we have a session + token.
  const load = useCallback(async () => {
    if (!token) return;
    setState({ phase: 'loading' });
    try {
      const { status, snapshot } = await resolveShare(token);
      if (status !== 'ok' || !snapshot) {
        setState({ phase: 'invalid', status: status as Exclude<ShareResolveStatus, 'ok'> });
        return;
      }
      setState({ phase: 'ready', snapshot });
      track('share_course_join_opened', { screen: 'join', tasks: snapshot.tasks?.length ?? 0 });
    } catch (err: any) {
      setState({ phase: 'error', message: err?.message ?? 'Could not load this shared course.' });
    }
  }, [token]);

  useEffect(() => {
    if (sessionLoading || !session || !token) return;
    load();
  }, [session, sessionLoading, token, load]);

  const handleImport = async () => {
    if (importing || !token) return;
    setImporting(true);
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    try {
      const result = await importSharedCourse(token);
      // Consumed — don't re-import on a later cold start.
      clearPendingShareToken();
      // Point the app at the semester the course landed in so the user sees it
      // immediately when they land on the tabs.
      setSelectedSemester(result.semesterId);
      // Refresh the lists the new course/tasks belong to (we don't touch
      // lib/queries.ts, so invalidate by the same key prefixes it uses).
      qc.invalidateQueries({ queryKey: ['courses'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['taskStats'] });
      qc.invalidateQueries({ queryKey: ['semesters'] });

      track('share_course_imported', {
        screen: 'join',
        tasks: result.taskCount,
      });
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }

      // Land the user on their new course.
      router.replace(`/course/${result.courseId}` as any);
    } catch (err: any) {
      // Free-tier course cap tripped on the recipient (DB trigger P0001) —
      // route to the paywall instead of a dead-end error, matching the
      // isFreeLimitError handling across the app.
      if (isFreeLimitError(err)) {
        if (Platform.OS === 'ios') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }
        Alert.alert(
          'Course limit reached',
          `${err.message}\n\nUpgrade to Pro to add this shared course.`,
          [
            { text: 'Not now', style: 'cancel' },
            {
              text: 'See Pro',
              onPress: () =>
                router.push({ pathname: '/paywall', params: { context: 'share_course' } } as any),
            },
          ],
        );
        return;
      }
      // A resolve-time invalid/expired/revoked (link changed between preview
      // and import) reflows into the invalid state so the copy stays honest.
      const code = err?.code as string | undefined;
      if (code === 'SHARE_EXPIRED' || code === 'SHARE_REVOKED' || code === 'SHARE_NOT_FOUND') {
        clearPendingShareToken();
        setState({
          phase: 'invalid',
          status: code === 'SHARE_EXPIRED' ? 'expired' : code === 'SHARE_REVOKED' ? 'revoked' : 'not_found',
        });
        return;
      }
      Alert.alert('Couldn\'t add course', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as any);
  };

  // ── Render ────────────────────────────────────────────────
  const headerOptions = (
    <Stack.Screen options={{ title: 'Shared Course', presentation: 'modal', headerShown: false }} />
  );

  // While a session is resolving, or we're bouncing a signed-out user out.
  if (sessionLoading || !session || state.phase === 'loading') {
    return (
      <View style={[styles.screen, { backgroundColor: colors.paper }]}>
        {headerOptions}
        <ActivityIndicator size="large" color={colors.brand} style={{ flex: 1 }} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.paper }]}>
      {headerOptions}
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <TouchableOpacity
          style={[styles.closeBtn, { backgroundColor: colors.card }]}
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
          {state.phase === 'ready' && (() => {
            const s = state.snapshot;
            const taskCount = s.tasks?.length ?? 0;
            const owner = s.owner_name?.trim();
            return (
              <>
                <View style={[styles.iconWrap, { backgroundColor: s.course.color + '22' }]}>
                  <FontAwesome name={(s.course.icon as any) || 'book'} size={34} color={s.course.color} />
                </View>
                <Text style={[styles.eyebrow, { color: colors.ink3 }]}>
                  {owner ? `${owner} shared a course` : 'A classmate shared a course'}
                </Text>
                <Text style={[styles.title, { color: colors.ink }]}>{s.course.name}</Text>
                {s.course.instructor ? (
                  <Text style={[styles.subtitle, { color: colors.ink2 }]}>{s.course.instructor}</Text>
                ) : null}

                <View style={[styles.statsCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
                  <View style={styles.statBlock}>
                    <Text style={[styles.statNum, { color: colors.ink }]}>{taskCount}</Text>
                    <Text style={[styles.statLabel, { color: colors.ink3 }]}>
                      {taskCount === 1 ? 'deadline' : 'deadlines'}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.blurb, { color: colors.ink3 }]}>
                  This adds a private copy to your semester — every deadline, ready to
                  track. You can edit or delete anything after.
                </Text>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.brand }, importing && { opacity: 0.6 }]}
                  onPress={handleImport}
                  disabled={importing}
                  activeOpacity={0.85}
                >
                  {importing ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <FontAwesome name="plus" size={14} color="#fff" />
                      <Text style={styles.primaryBtnText}>Add to my semester</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            );
          })()}

          {state.phase === 'invalid' && (
            <>
              <View style={[styles.iconWrap, { backgroundColor: colors.line }]}>
                <FontAwesome
                  name={state.status === 'expired' ? 'clock-o' : state.status === 'revoked' ? 'ban' : 'unlink'}
                  size={30}
                  color={colors.ink3}
                />
              </View>
              <Text style={[styles.title, { color: colors.ink }]}>
                {state.status === 'expired'
                  ? 'Link expired'
                  : state.status === 'revoked'
                    ? 'Link turned off'
                    : 'Link not found'}
              </Text>
              <Text style={[styles.blurb, { color: colors.ink3, textAlign: 'center' }]}>
                {state.status === 'expired'
                  ? 'This share link has expired. Ask your classmate to send a fresh one.'
                  : state.status === 'revoked'
                    ? 'The owner turned this share link off. Ask them to share the course again.'
                    : 'This share link is invalid or was already removed. Double-check the link and try again.'}
              </Text>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.line }]}
                onPress={handleClose}
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.ink2 }]}>Back to Semora</Text>
              </TouchableOpacity>
            </>
          )}

          {state.phase === 'error' && (
            <>
              <View style={[styles.iconWrap, { backgroundColor: colors.line }]}>
                <FontAwesome name="exclamation-triangle" size={28} color={colors.ink3} />
              </View>
              <Text style={[styles.title, { color: colors.ink }]}>Something went wrong</Text>
              <Text style={[styles.blurb, { color: colors.ink3, textAlign: 'center' }]}>
                {state.message}
              </Text>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.line }]}
                onPress={load}
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.brand }]}>Try again</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.paper },
  safe: { flex: 1 },
  closeBtn: {
    position: 'absolute', right: 20, top: 12, zIndex: 10,
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  content: {
    paddingHorizontal: 24, paddingTop: 64, paddingBottom: 48,
    width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: 76, height: 76, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  eyebrow: {
    fontSize: 13, fontWeight: '600', letterSpacing: 0.3,
    textAlign: 'center', marginBottom: 6,
  },
  title: {
    fontFamily: FONTS.display, fontSize: 26, color: COLORS.ink,
    textAlign: 'center', letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 15, color: COLORS.ink2, textAlign: 'center', marginTop: 4,
  },
  statsCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 24, borderRadius: 18, borderWidth: 0.5, borderColor: COLORS.line,
    paddingVertical: 18, paddingHorizontal: 28, marginTop: 24, marginBottom: 20,
    minWidth: 160,
  },
  statBlock: { alignItems: 'center' },
  statNum: { fontSize: 30, fontWeight: '800', color: COLORS.ink },
  statLabel: { fontSize: 12, fontWeight: '600', color: COLORS.ink3, marginTop: 2 },
  blurb: {
    fontSize: 14, color: COLORS.ink3, lineHeight: 20,
    textAlign: 'center', maxWidth: 320, marginBottom: 26,
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, height: 54, borderRadius: 16, paddingHorizontal: 28,
    backgroundColor: COLORS.brand, minWidth: 260,
  },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondaryBtn: {
    height: 48, borderRadius: 14, borderWidth: 1, borderColor: COLORS.line,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28,
    marginTop: 20, minWidth: 200,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.ink2 },
});
