import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/app/_layout';
import { SCREEN_MAX_WIDTH } from '@/lib/constants';
import {
  connectLms,
  discoverLmsCourses,
  DiscoveredLmsCourse,
  LMS_PROVIDER_LABELS,
  reconnectLmsConnection,
  requestGoogleClassroomCredential,
  syncLmsConnection,
  type LmsCredential,
} from '@/lib/lms';
import { track } from '@/lib/analytics';
import { useSemesters } from '@/lib/queries';
import { useResponsive } from '@/lib/responsive';
import { useColors } from '@/lib/theme';
import { useAppStore } from '@/store/appStore';
import type { LmsProvider } from '@/types/database';

const HELP: Record<Exclude<LmsProvider, 'google_classroom'>, { url: string; token: string; note: string }> = {
  canvas: {
    url: 'https://school.instructure.com',
    token: 'Canvas access token',
    note: 'In Canvas, open Account → Settings → Approved Integrations → New Access Token.',
  },
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
  const { data: semesters = [] } = useSemesters();
  const isPro = useAppStore((state) => state.isPro);
  const selectedSemesterId = useAppStore((state) => state.selectedSemesterId);

  // Route to the paywall (teaser → upsell). The lms-sync edge function enforces
  // PRO_REQUIRED server-side; this is the client teaser so free users see the
  // upsell instead of a failed connect. Matches the calendar.tsx pattern.
  const openPaywall = useCallback(() => {
    track('paywall_open', { screen: 'settings_lms_connect', context: 'lms' });
    router.replace({ pathname: '/paywall', params: { context: 'lms' } } as any);
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

  useEffect(() => {
    if (!semesterId && semesters.length) {
      setSemesterId(semesters.find((row) => row.is_active)?.id ?? semesters[0].id);
    }
  }, [semesterId, semesters]);

  const normalizedBase = useMemo(() => baseUrl.trim().replace(/\/+$/, ''), [baseUrl]);
  const manualCredential = (): LmsCredential => ({ accessToken: token.trim() });

  const obtainCredential = async () => {
    if (provider === 'google_classroom') return requestGoogleClassroomCredential();
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
    setWorking(true);
    try {
      const nextCredential = await obtainCredential();
      if (reconnecting) {
        await reconnectLmsConnection(
          params.connectionId!,
          nextCredential,
          provider === 'google_classroom' ? null : normalizedBase,
        );
        const result = await syncLmsConnection(params.connectionId!);
        Alert.alert('Reconnected', `${result.processed} assignments updated.`);
        router.back();
        return;
      }
      const found = await discoverLmsCourses({
        provider,
        baseUrl: normalizedBase || null,
        credential: nextCredential,
      });
      setCredential(nextCredential);
      setCourses(found);
      setSelected(new Set(found.map((course) => course.id)));
      if (!found.length) Alert.alert('No active courses found', 'This account returned no courses Semora can import.');
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
        displayName,
        baseUrl: normalizedBase || null,
        credential,
        courses: chosen,
      });
      Alert.alert(
        'Connected',
        `${chosen.length} ${chosen.length === 1 ? 'course' : 'courses'} and ${result.processed} assignments imported.`,
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
                <FontAwesome name={provider === 'google_classroom' ? 'google' : 'university'} size={22} color={colors.brand} />
              </View>
              <Text style={[styles.title, { color: colors.ink }]}>
                {provider === 'google_classroom' ? 'Sign in to Google Classroom' : `Connect your ${LMS_PROVIDER_LABELS[provider]} account`}
              </Text>
              <Text style={[styles.subtitle, { color: colors.ink3 }]}>
                Read-only access imports classes, deadlines, points, and available submission status. Semora never changes your LMS.
              </Text>

              {provider !== 'google_classroom' && (
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

              <TouchableOpacity
                onPress={discover}
                disabled={working}
                style={[styles.primary, { backgroundColor: colors.brand }]}
              >
                {working ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <FontAwesome name={provider === 'google_classroom' ? 'google' : 'search'} size={14} color="#fff" />
                    <Text style={styles.primaryText}>{reconnecting ? 'Reconnect and sync' : provider === 'google_classroom' ? 'Continue with Google' : 'Find my courses'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.title, { color: colors.ink }]}>Choose courses</Text>
              <Text style={[styles.subtitle, { color: colors.ink3 }]}>
                Semora creates a local course for each selection and keeps its assignments refreshed.
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
              <TouchableOpacity onPress={save} disabled={working} style={[styles.primary, { backgroundColor: colors.brand }]}>
                {working ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Import and sync</Text>}
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
  subtitle: { fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 15 },
  label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.45, marginTop: 14, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 13, borderWidth: 1.2, paddingHorizontal: 14, fontSize: 15 },
  help: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, padding: 12, flexDirection: 'row', gap: 9, marginTop: 12 },
  helpText: { flex: 1, fontSize: 12, lineHeight: 18 },
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
});
