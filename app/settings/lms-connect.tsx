import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text, TextInput } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  Stack,
  router,
  useLocalSearchParams } from 'expo-router';
import { useCallback,
  useEffect,
  useMemo,
  useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/app/_layout';
import { SCREEN_MAX_WIDTH } from '@/lib/constants';
import {
  canvasCalendarOrigin,
  connectLms,
  discoverLmsCourses,
  DiscoveredLmsCourse,
  LMS_PROVIDER_LABELS,
  normalizeCanvasCalendarFeedUrl,
  reconnectLmsConnection,
  requestGoogleClassroomCredential,
  syncLmsConnection,
  type LmsCredential,
} from '@/lib/lms';
import { track } from '@/lib/analytics';
import { useSemesters } from '@/lib/queries';
import { useResponsive } from '@/lib/responsive';
import { useColors } from '@/lib/theme';
import { findOrCreateSemester } from '@/lib/syllabus';
import { supabase } from '@/lib/supabase';
import { useProUpsell } from '@/components/ProUpsellHost';
import { useAppStore } from '@/store/appStore';
import type { LmsProvider } from '@/types/database';

const HELP: Record<Exclude<LmsProvider, 'google_classroom' | 'canvas'>, { url: string; token: string; note: string }> = {
  blackboard: {
    url: 'https://learn.school.edu',
    token: 'School-issued OAuth access token',
    note: 'Blackboard usually requires your school administrator to approve Semora’s read access.',
  },
  moodle: {
    url: 'https://moodle.school.edu',
    token: 'Moodle web-service token',
    note: 'Your Moodle administrator must enable mobile/web services and issue a token with course and assignment read access.',
  },
};

export default function LmsConnectScreen() {
  const colors = useColors();
  const showProUpsell = useProUpsell();
  const { contentMaxWidth } = useResponsive();
  const { session } = useSession();
  const params = useLocalSearchParams<{
    provider?: string;
    connectionId?: string;
    baseUrl?: string;
  }>();
  const provider = (Object.keys(LMS_PROVIDER_LABELS).includes(params.provider ?? '')
    ? params.provider
    : 'canvas') as LmsProvider;
  const reconnecting = !!params.connectionId;
  const isCanvasCalendar = provider === 'canvas';
  const { data: semesters = [], refetch: refetchSemesters } = useSemesters();
  const isPro = useAppStore((state) => state.isPro);
  const selectedSemesterId = useAppStore((state) => state.selectedSemesterId);

  // Route to the paywall (teaser → upsell). The lms-sync edge function enforces
  // PRO_REQUIRED server-side; this is the client teaser so free users see the
  // upsell instead of a failed connect. Matches the calendar.tsx pattern.
  const openPaywall = useCallback(() => {
    track('paywall_open', { screen: 'settings_lms_connect', context: 'lms' });
    // Sheet, then back. Replacing this screen with a full paywall stranded a
    // free student on a screen they never chose; going back leaves them where
    // they were with the offer on top.
    showProUpsell('canvas');
    router.back();
  }, []);

  // Defense in depth: the LMS list screen already gates entry behind Pro, but
  // this screen is directly routable (deep link / reconnect). Bounce a non-Pro
  // user straight to the paywall rather than let them start a connect flow the
  // server will reject anyway.
  useEffect(() => {
    if (!isPro) openPaywall();
  }, [isPro, openPaywall]);
  const [semesterId, setSemesterId] = useState(selectedSemesterId ?? '');
  const [displayName, setDisplayName] = useState(LMS_PROVIDER_LABELS[provider]);
  const [baseUrl, setBaseUrl] = useState(params.baseUrl ?? '');
  const [token, setToken] = useState('');
  const [credential, setCredential] = useState<LmsCredential | null>(null);
  const [courses, setCourses] = useState<DiscoveredLmsCourse[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);
  const [showPrivateUrl, setShowPrivateUrl] = useState(false);

  useEffect(() => {
    if (!semesterId && semesters.length) {
      setSemesterId(semesters.find((row) => row.is_active)?.id ?? semesters[0].id);
    }
  }, [semesterId, semesters]);

  const normalizedBase = useMemo(() => {
    if (isCanvasCalendar) {
      try { return canvasCalendarOrigin(token); } catch { return ''; }
    }
    return baseUrl.trim().replace(/\/+$/, '');
  }, [baseUrl, isCanvasCalendar, token]);
  const connectionMethod = isCanvasCalendar ? 'calendar_feed' as const : 'legacy_token' as const;
  const manualCredential = (): LmsCredential => ({
    accessToken: isCanvasCalendar ? normalizeCanvasCalendarFeedUrl(token) : token.trim(),
  });

  const obtainCredential = async () => {
    if (provider === 'google_classroom') return requestGoogleClassroomCredential();
    if (isCanvasCalendar) return manualCredential();
    if (!normalizedBase) throw new Error('Enter your school LMS URL.');
    try {
      const parsed = new URL(normalizedBase);
      if (parsed.protocol !== 'https:') throw new Error();
    } catch {
      throw new Error('Enter a full HTTPS school LMS URL.');
    }
    if (!token.trim()) throw new Error('Enter the access token supplied by your LMS or school.');
    return manualCredential();
  };

  const discover = async () => {
    if (working) return;
    // No semester yet? Make one, do not refuse.
    //
    // This used to alert "Create a semester before connecting Canvas" and
    // stop, with no button to do it — a dead end for exactly the student
    // this flow is now advertised to, since nothing creates a semester at
    // signup and Canvas is offered on the empty course list. Scanning a
    // syllabus has always created one silently; the same resolver runs here,
    // so both paths agree on what "this term" means.
    //
    // Named from the term picked during onboarding, falling back to one
    // derived from today's date. A student connecting Canvas wants their
    // current term; asking them to name a container first is a question our
    // schema needs, not one they have an opinion about.
    if (!reconnecting && semesters.length === 0) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const uid = session?.user?.id;
        if (!uid) throw new Error('Not signed in');
        const created = await findOrCreateSemester(uid, null, null, null);
        setSemesterId(created.semesterId);
        await refetchSemesters();
      } catch (error) {
        // The free-semester cap raises here for a lapsed-Pro account with a
        // semester already archived. Its message already says what to do.
        Alert.alert(
          'Could not start a semester',
          error instanceof Error ? error.message : 'Please try again.',
        );
        return;
      }
    }
    setWorking(true);
    try {
      const nextCredential = await obtainCredential();
      const found = await discoverLmsCourses({
        provider,
        connectionMethod,
        baseUrl: normalizedBase || null,
        credential: nextCredential,
      });
      if (reconnecting) {
        await reconnectLmsConnection(
          params.connectionId!,
          nextCredential,
          provider === 'google_classroom' ? null : normalizedBase,
          connectionMethod,
        );
        const result = await syncLmsConnection(params.connectionId!);
        Alert.alert('Reconnected', `${result.processed} assignments updated.`);
        router.back();
        return;
      }
      setCredential(nextCredential);
      setCourses(found);
      setSelected(new Set(found.map((course) => course.id)));
      if (!found.length) {
        Alert.alert(
          isCanvasCalendar ? 'No dated Canvas work found' : 'No active courses found',
          isCanvasCalendar
            ? 'Semora could open the feed, but Canvas did not list any dated course assignments or events yet. Check that your course calendars are available in Canvas, then try again.'
            : 'This account returned no courses Semora can import.',
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The learning platform could not be connected.';
      // Pro lapsed mid-session (or a patched client hit the server gate): the
      // lms-sync function replies with the PRO_REQUIRED copy. Route to the
      // paywall instead of showing it as a raw connect error. invokeLms surfaces
      // the server's `error` string, so match on that phrasing.
      if (/pro feature/i.test(message)) {
        openPaywall();
      } else if (!/cancel/i.test(message)) {
        Alert.alert('Couldn’t connect', message);
      }
    } finally {
      setWorking(false);
    }
  };

  const save = async () => {
    if (!credential || !session || working) return;
    if (!semesterId) {
      Alert.alert('Semester needed', 'Create or select a semester before importing LMS courses.');
      return;
    }
    const chosen = courses.filter((course) => selected.has(course.id));
    if (!chosen.length) {
      Alert.alert('Select courses', 'Choose at least one course to import.');
      return;
    }
    setWorking(true);
    try {
      const result = await connectLms({
        userId: session.user.id,
        semesterId,
        provider,
        connectionMethod,
        displayName,
        baseUrl: normalizedBase || null,
        credential,
        courses: chosen,
      });
      Alert.alert(
        isCanvasCalendar ? 'Canvas connected' : 'Connected',
        `${chosen.length} ${chosen.length === 1 ? 'course' : 'courses'} and ${result.processed} deadlines imported.${isCanvasCalendar ? ' Semora will keep checking Canvas about hourly.' : ''}`,
        [{ text: 'Done', onPress: () => router.replace('/settings/lms' as any) }],
      );
    } catch (error) {
      Alert.alert('Import failed', error instanceof Error ? error.message : 'Nothing was saved. Please try again.');
    } finally {
      setWorking(false);
    }
  };

  const toggleCourse = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Non-Pro: the effect above is routing to the paywall. Render an empty paper
  // screen (no connect form flash) until the replace lands.
  if (!isPro) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']} />;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: `${reconnecting ? 'Reconnect' : 'Connect'} ${LMS_PROVIDER_LABELS[provider]}` }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} keyboardShouldPersistTaps="handled">
          {courses.length === 0 ? (
            <>
              <View style={[styles.heroIcon, { backgroundColor: colors.brand50 }]}>
                <FontAwesome name={provider === 'google_classroom' ? 'google' : isCanvasCalendar ? 'refresh' : 'university'} size={22} color={colors.brand} />
              </View>
              {isCanvasCalendar && <Text style={[styles.eyebrow, { color: colors.brand }]}>CANVAS SETUP · STEP 1 OF 2</Text>}
              <Text style={[styles.title, { color: colors.ink }]}>
                {provider === 'google_classroom'
                  ? 'Sign in to Google Classroom'
                  : isCanvasCalendar
                    ? 'Connect Canvas to Semora'
                    : `Connect your ${LMS_PROVIDER_LABELS[provider]} account`}
              </Text>
              <Text style={[styles.subtitle, { color: colors.ink3 }]}>
                {isCanvasCalendar
                  ? 'Set this up once. Semora will keep your dated Canvas assignments and events updated when an instructor changes a deadline.'
                  : 'Semora makes read-only requests to import classes, deadlines, points, and available submission status. It never changes your LMS.'}
              </Text>

              {isCanvasCalendar && (
                <>
                  <View style={[styles.guideCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
                    <View style={styles.guideHeading}>
                      <FontAwesome name="desktop" size={15} color={colors.brand} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.guideTitle, { color: colors.ink }]}>First, open Canvas in a web browser</Text>
                        <Text style={[styles.guideIntro, { color: colors.ink3 }]}>Use your school’s Canvas website—the place where you normally see courses and assignments. The Canvas Student app does not show this private feed link.</Text>
                      </View>
                    </View>
                    <View style={[styles.guideDivider, { backgroundColor: colors.line }]} />
                    <View style={styles.setupStep}>
                      <View style={[styles.stepNumber, { backgroundColor: colors.brand50 }]}><Text style={[styles.stepNumberText, { color: colors.brand }]}>1</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.stepTitle, { color: colors.ink }]}>Open Calendar</Text>
                        <Text style={[styles.stepText, { color: colors.ink3 }]}>In Canvas, choose Calendar from the main navigation.</Text>
                      </View>
                    </View>
                    <View style={styles.setupStep}>
                      <View style={[styles.stepNumber, { backgroundColor: colors.brand50 }]}><Text style={[styles.stepNumberText, { color: colors.brand }]}>2</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.stepTitle, { color: colors.ink }]}>Choose Calendar Feed</Text>
                        <Text style={[styles.stepText, { color: colors.ink3 }]}>Find Calendar Feed in the Calendar sidebar and open it.</Text>
                      </View>
                    </View>
                    <View style={styles.setupStep}>
                      <View style={[styles.stepNumber, { backgroundColor: colors.brand50 }]}><Text style={[styles.stepNumberText, { color: colors.brand }]}>3</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.stepTitle, { color: colors.ink }]}>Copy the complete link</Text>
                        <Text style={[styles.stepText, { color: colors.ink3 }]}>Copy the URL Canvas displays. It usually starts with webcal:// and contains /feeds/calendars/user_.</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => Linking.openURL('https://community.instructure.com/en/kb/articles/662804-unknown').catch(() => {})}
                      style={styles.officialHelp}
                    >
                      <FontAwesome name="external-link" size={11} color={colors.brand} />
                      <Text style={[styles.link, { color: colors.brand }]}>See Canvas’s illustrated instructions</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={[styles.syncExplainer, { backgroundColor: colors.brand50 }]}>
                    <FontAwesome name="refresh" size={15} color={colors.brand} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.syncTitle, { color: colors.ink }]}>How automatic sync works</Text>
                      <Text style={[styles.syncText, { color: colors.ink2 }]}>Semora securely checks your private Canvas link about hourly—even when the app is closed. If a dated assignment or event changes, Semora updates the same task instead of creating a duplicate. Semora never changes anything in Canvas.</Text>
                    </View>
                  </View>

                  <Text style={[styles.label, { color: colors.ink2 }]}>Paste your private Calendar Feed link</Text>
                  <View style={styles.secretField}>
                    <TextInput
                      value={token}
                      onChangeText={setToken}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      secureTextEntry={!showPrivateUrl}
                      placeholder="webcal://…/feeds/calendars/user_….ics"
                      placeholderTextColor={colors.ink3}
                      style={[styles.input, styles.secretInput, { color: colors.ink, backgroundColor: colors.card, borderColor: colors.line }]}
                    />
                    <TouchableOpacity
                      accessibilityLabel={showPrivateUrl ? 'Hide Calendar Feed URL' : 'Show Calendar Feed URL'}
                      onPress={() => setShowPrivateUrl((current) => !current)}
                      style={styles.secretToggle}
                    >
                      <FontAwesome name={showPrivateUrl ? 'eye-slash' : 'eye'} size={15} color={colors.ink3} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.privateNote}>
                    <FontAwesome name="lock" size={12} color={colors.ink3} />
                    <Text style={[styles.privateNoteText, { color: colors.ink3 }]}>Treat this link like a password. Semora encrypts it and never displays it after setup.</Text>
                  </View>
                  <View style={[styles.limitNote, { borderColor: colors.line }]}>
                    <Text style={[styles.limitTitle, { color: colors.ink2 }]}>What Canvas includes</Text>
                    <Text style={[styles.limitText, { color: colors.ink3 }]}>Dated assignments and calendar events. It does not import grades, whether work was submitted, or To-Do items without dates.</Text>
                  </View>
                </>
              )}

              {provider !== 'google_classroom' && !isCanvasCalendar && (
                <>
                  <Text style={[styles.label, { color: colors.ink2 }]}>School LMS URL</Text>
                  <TextInput
                    value={baseUrl}
                    onChangeText={setBaseUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="url"
                    placeholder={HELP[provider].url}
                    placeholderTextColor={colors.ink3}
                    style={[styles.input, { color: colors.ink, backgroundColor: colors.card, borderColor: colors.line }]}
                  />
                  <Text style={[styles.label, { color: colors.ink2 }]}>{HELP[provider].token}</Text>
                  <TextInput
                    value={token}
                    onChangeText={setToken}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                    placeholder="Paste token"
                    placeholderTextColor={colors.ink3}
                    style={[styles.input, { color: colors.ink, backgroundColor: colors.card, borderColor: colors.line }]}
                  />
                  <View style={[styles.help, { backgroundColor: colors.card, borderColor: colors.line }]}>
                    <FontAwesome name="info-circle" size={14} color={colors.brand} />
                    <Text style={[styles.helpText, { color: colors.ink3 }]}>{HELP[provider].note}</Text>
                  </View>
                </>
              )}

              {!reconnecting && semesters.length === 0 && (
                <View style={[styles.help, { backgroundColor: colors.brand50, borderColor: colors.line }]}>
                  <FontAwesome name="info-circle" size={14} color={colors.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.helpText, { color: colors.ink2 }]}>Create a semester before connecting so imported courses have a home.</Text>
                    <TouchableOpacity onPress={() => router.push('/semester/new')} style={styles.helpLinkButton}>
                      <Text style={[styles.link, { color: colors.brand }]}>Create semester →</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <TouchableOpacity
                onPress={discover}
                disabled={working}
                style={[styles.primary, { backgroundColor: colors.brand }]}
              >
                {working ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <FontAwesome name={provider === 'google_classroom' ? 'google' : isCanvasCalendar ? 'calendar' : 'search'} size={14} color="#fff" />
                    <Text style={styles.primaryText}>{reconnecting ? 'Reconnect and sync' : provider === 'google_classroom' ? 'Continue with Google' : isCanvasCalendar ? 'Check link and choose courses' : 'Find my courses'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              {isCanvasCalendar && <Text style={[styles.eyebrow, { color: colors.brand }]}>CANVAS SETUP · STEP 2 OF 2</Text>}
              <Text style={[styles.title, { color: colors.ink }]}>{isCanvasCalendar ? 'Choose courses to sync' : 'Choose courses'}</Text>
              <Text style={[styles.subtitle, { color: colors.ink3 }]}>
                {isCanvasCalendar
                  ? 'Select the courses you want in Semora and choose the semester where they belong. Semora creates each course and imports its current deadlines.'
                  : 'Semora creates a local course for each selection and keeps its assignments refreshed.'}
              </Text>
              <Text style={[styles.label, { color: colors.ink2 }]}>Connection name</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                style={[styles.input, { color: colors.ink, backgroundColor: colors.card, borderColor: colors.line }]}
              />
              <Text style={[styles.label, { color: colors.ink2 }]}>Semester</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {semesters.map((semester) => (
                  <TouchableOpacity
                    key={semester.id}
                    onPress={() => setSemesterId(semester.id)}
                    style={[styles.chip, { borderColor: semesterId === semester.id ? colors.brand : colors.line, backgroundColor: semesterId === semester.id ? colors.brand50 : colors.card }]}
                  >
                    <Text style={[styles.chipText, { color: semesterId === semester.id ? colors.brand : colors.ink2 }]}>{semester.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {semesters.length === 0 && (
                <TouchableOpacity onPress={() => router.push('/semester/new')}>
                  <Text style={[styles.link, { color: colors.brand }]}>Create a semester first →</Text>
                </TouchableOpacity>
              )}

              <View style={styles.selectHead}>
                <Text style={[styles.label, { color: colors.ink2, marginTop: 0 }]}>Courses ({selected.size} selected)</Text>
                <TouchableOpacity onPress={() => setSelected(selected.size === courses.length ? new Set() : new Set(courses.map((row) => row.id)))}>
                  <Text style={[styles.link, { color: colors.brand }]}>{selected.size === courses.length ? 'Clear' : 'Select all'}</Text>
                </TouchableOpacity>
              </View>
              {courses.map((course) => (
                <TouchableOpacity
                  key={course.id}
                  onPress={() => toggleCourse(course.id)}
                  style={[styles.course, { backgroundColor: colors.card, borderColor: selected.has(course.id) ? colors.brand : colors.line }]}
                >
                  <View style={[styles.checkbox, { backgroundColor: selected.has(course.id) ? colors.brand : 'transparent', borderColor: selected.has(course.id) ? colors.brand : colors.line }]}>
                    {selected.has(course.id) && <FontAwesome name="check" size={11} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.courseName, { color: colors.ink }]}>{course.name}</Text>
                    {!!course.code && <Text style={[styles.courseCode, { color: colors.ink3 }]}>{course.code}</Text>}
                  </View>
                </TouchableOpacity>
              ))}
              {isCanvasCalendar && (
                <View style={[styles.afterConnect, { backgroundColor: colors.brand50 }]}>
                  <FontAwesome name="check-circle" size={14} color={colors.brand} />
                  <Text style={[styles.afterConnectText, { color: colors.ink2 }]}>After connecting, you can see the last update time or run Sync now from Settings → Connect Canvas.</Text>
                </View>
              )}
              <TouchableOpacity onPress={save} disabled={working} style={[styles.primary, { backgroundColor: colors.brand }]}>
                {working ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{isCanvasCalendar ? 'Connect Canvas and start syncing' : 'Import and sync'}</Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', padding: 22, paddingBottom: 45 },
  heroIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 25, fontFamily: 'Fraunces_700Bold' },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8, marginBottom: 7 },
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 15 },
  label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.45, marginTop: 14, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 13, borderWidth: 1.2, paddingHorizontal: 14, fontSize: 15 },
  secretField: { position: 'relative' },
  secretInput: { paddingRight: 48 },
  secretToggle: { position: 'absolute', right: 4, top: 4, width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  guideCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 14, marginBottom: 14 },
  guideHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  guideTitle: { fontSize: 14, fontWeight: '800' },
  guideIntro: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  guideDivider: { height: StyleSheet.hairlineWidth, marginVertical: 13 },
  setupStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  stepNumber: { width: 25, height: 25, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 12, fontWeight: '900' },
  stepTitle: { fontSize: 13, fontWeight: '800' },
  stepText: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  officialHelp: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  syncExplainer: { borderRadius: 15, padding: 13, flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 5 },
  syncTitle: { fontSize: 13, fontWeight: '800' },
  syncText: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  privateNote: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, paddingHorizontal: 2 },
  privateNoteText: { flex: 1, fontSize: 11, lineHeight: 16 },
  limitNote: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 14, paddingTop: 12 },
  limitTitle: { fontSize: 12, fontWeight: '800' },
  limitText: { fontSize: 11, lineHeight: 17, marginTop: 3 },
  help: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, padding: 12, flexDirection: 'row', gap: 9, marginTop: 12 },
  helpText: { flex: 1, fontSize: 12, lineHeight: 18 },
  helpLinkButton: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 9, minHeight: 24 },
  primary: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9, marginTop: 22 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { minHeight: 38, borderRadius: 12, borderWidth: 1, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 12, fontWeight: '700' },
  link: { fontSize: 12, fontWeight: '800' },
  selectHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 7 },
  course: { minHeight: 61, borderRadius: 14, borderWidth: 1.2, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 8 },
  checkbox: { width: 23, height: 23, borderRadius: 7, borderWidth: 1.3, alignItems: 'center', justifyContent: 'center' },
  courseName: { fontSize: 14, fontWeight: '700' },
  courseCode: { fontSize: 11, marginTop: 3 },
  afterConnect: { borderRadius: 13, padding: 12, flexDirection: 'row', gap: 8, alignItems: 'flex-start', marginTop: 14 },
  afterConnectText: { flex: 1, fontSize: 12, lineHeight: 18 },
});
