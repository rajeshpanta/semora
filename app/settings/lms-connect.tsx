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
  useState, useRef } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/app/_layout';
import { SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useQuery } from '@tanstack/react-query';
import {
  canvasCalendarOrigin,
  canvasFreeFor,
  canvasSourceOf,
  canvasFreePromoQuery,
  connectLms,
  discoverLmsCourses,
  DiscoveredLmsCourse,
  LMS_PROVIDER_LABELS,
  normalizeCanvasCalendarFeedUrl,
  describeCanvasFeedInput,
  reconnectLmsConnection,
  lmsConnectionsQuery,
  lmsFailureCode,
  requestGoogleClassroomCredential,
  syncLmsConnection,
  type LmsCredential,
} from '@/lib/lms';
import { track } from '@/lib/analytics';
import { CanvasGuidedPaste } from '@/components/CanvasGuidedPaste';
import { CanvasFeedLimits } from '@/components/CanvasFeedLimits';
import { getDeviceItem, setDeviceItem } from '@/lib/deviceStore';
import {
  canvasSetupStorageKey,
  parseCanvasSetupProgress,
  serializeCanvasSetupProgress,
  EMPTY_PROGRESS,
  type CanvasSetupProgress,
} from '@/lib/canvasSetupProgress';
import { useCourses, useSemesters } from '@/lib/queries';
import { useResponsive } from '@/lib/responsive';
import { useColors } from '@/lib/theme';
import { useI18n } from '@/lib/i18n';
import { findOrCreateSemester } from '@/lib/syllabus';
import { supabase } from '@/lib/supabase';
import { useProUpsell } from '@/components/ProUpsellHost';
import { CanvasCourseReview, confirmSemesterConflict } from '@/components/CanvasCourseReview';
import {
  CourseLinkChoiceSheet,
  pendingCourseChoices,
  type CourseLinkDecision,
  type PendingCourseChoice,
} from '@/components/CourseLinkChoiceSheet';
import { courseFactsOf } from '@/lib/lms';
import { formatSpan, matchSemester, spanOf } from '@/lib/termMatch';
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
  const { t, locale } = useI18n();
  const showProUpsell = useProUpsell();
  const { contentMaxWidth } = useResponsive();
  const { session } = useSession();
  const params = useLocalSearchParams<{
    provider?: string;
    connectionId?: string;
    baseUrl?: string;
    source?: string;
  }>();
  // Which CTA started this attempt — 'scan_upsell' from the syllabus paywall's
  // limited-time Canvas card, 'settings' for anyone who came here themselves.
  // Stamped on every funnel event below so the experiment reads as one journey
  // rather than as two unrelated piles of Canvas events.
  const source = canvasSourceOf(params.source);
  const provider = (Object.keys(LMS_PROVIDER_LABELS).includes(params.provider ?? '')
    ? params.provider
    : 'canvas') as LmsProvider;
  const reconnecting = !!params.connectionId;
  const isCanvasCalendar = provider === 'canvas';
  const { data: semesters = [], refetch: refetchSemesters } = useSemesters();
  const isPro = useAppStore((state) => state.isPro);
  const selectedSemesterId = useAppStore((state) => state.selectedSemesterId);
  const setSelectedSemester = useAppStore((state) => state.setSelectedSemester);

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

  // Defense in depth: the LMS list screen already gates entry, but this screen
  // is directly routable (deep link / reconnect). Bounce an account the server
  // will refuse rather than let it start a connect flow that cannot finish.
  //
  // WAIT FOR THE ANSWER before bouncing. `isPro` is in the local store and
  // resolves instantly; whether the canvas_free offer is live is a network
  // read, and both of these start out undefined. Gating on them while they load
  // would throw a paywall in front of every free student for the first few
  // hundred milliseconds of the screen they were just invited onto — the exact
  // dead end this offer exists to remove. Until the gate resolves, the blank
  // paper screen below is what shows.
  const { data: lmsConnections, isPending: connectionsPending } = useQuery(lmsConnectionsQuery);
  const { data: canvasFreePromo, isPending: promoPending } = useQuery(canvasFreePromoQuery);
  const lmsFree = canvasFreeFor(lmsConnections, isPro, canvasFreePromo);
  const lmsAllowed = isPro || lmsFree;
  const gateResolved = isPro || (!promoPending && !connectionsPending);
  useEffect(() => {
    if (gateResolved && !lmsAllowed) openPaywall();
  }, [gateResolved, lmsAllowed, openPaywall]);
  // Deliberately NOT seeded from selectedSemesterId.
  //
  // That is what the app happened to be showing, which is not evidence about
  // the coursework — and it is exactly how a student's Fall term ended up
  // inside their Summer semester. This is filled in after discovery, from what
  // Canvas actually returned. See the effect below.
  const [semesterId, setSemesterId] = useState('');
  const [displayName, setDisplayName] = useState(LMS_PROVIDER_LABELS[provider]);
  const [baseUrl, setBaseUrl] = useState(params.baseUrl ?? '');
  const [token, setToken] = useState('');
  const [credential, setCredential] = useState<LmsCredential | null>(null);
  const [courses, setCourses] = useState<DiscoveredLmsCourse[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [working, setWorking] = useState(false);

  // ── Progress that survives leaving the app (Phase 3) ──────────────────────
  //
  // Fetching a Canvas feed link REQUIRES going to a browser, and that round
  // trip can evict Semora from memory. Everything the student had worked out —
  // which school, which lane, how many tries — used to live in React state and
  // died with it, so they came back holding the link and were asked "which
  // school?" again. The feed URL itself is deliberately never stored: it is a
  // bearer credential, and it is the one value they are arriving WITH.
  const setupKey = session?.user?.id ? canvasSetupStorageKey(session.user.id) : null;
  const [setupProgress, setSetupProgress] = useState<CanvasSetupProgress>(EMPTY_PROGRESS);
  useEffect(() => {
    if (!setupKey) return;
    setSetupProgress(parseCanvasSetupProgress(getDeviceItem(setupKey)));
  }, [setupKey]);
  const saveProgress = useCallback((next: CanvasSetupProgress) => {
    setSetupProgress(next);
    if (setupKey) setDeviceItem(setupKey, serializeCanvasSetupProgress(next));
  }, [setupKey]);

  // Existing courses in the semester the import is going into — the only place
  // a duplicate can appear. Scoped to that semester on purpose: last term's
  // "PHYS 212" is not the class being imported now, and offering it would be
  // the wrong suggestion at the worst moment.
  const { data: semesterCourses = [] } = useCourses(semesterId || null);
  const [linkChoices, setLinkChoices] = useState<PendingCourseChoice[]>([]);
  const [pendingImport, setPendingImport] = useState<DiscoveredLmsCourse[] | null>(null);

  // Propose from the data, or propose nothing.
  //
  // A strong match — the semester's window holds this coursework, or Canvas
  // named the term outright — is pre-selected, because making someone pick the
  // obviously-correct option is friction dressed as safety. A weak or absent
  // match selects NOTHING and the Connect button stays disabled, because a
  // coin-flip default is the bug being fixed.
  //
  // One exception: a single semester on the account has nothing to get wrong.
  useEffect(() => {
    if (semesterId || !courses.length || !semesters.length) return;
    if (semesters.length === 1) {
      setSemesterId(semesters[0].id);
      return;
    }
    const match = matchSemester(courses.map(courseFactsOf), semesters);
    if (match.confidence === 'strong' && match.semesterId) setSemesterId(match.semesterId);
  }, [courses, semesters, semesterId]);

  const normalizedBase = useMemo(() => {
    if (isCanvasCalendar) {
      try { return canvasCalendarOrigin(token); } catch { return ''; }
    }
    return baseUrl.trim().replace(/\/+$/, '');
  }, [baseUrl, isCanvasCalendar, token]);
  const connectionMethod = isCanvasCalendar ? 'calendar_feed' as const : 'legacy_token' as const;

  // Say what is wrong WHILE they are looking at the field, not after Connect.
  // The box is a masked credential field, so a student rejected on submit is
  // sent back to text they cannot read; four of seven who reached this step on
  // 2026-09-01 never got past it. When the paste is right this shows the
  // hostname — the school's Canvas address is not the secret, the user_ token
  // is, and seeing "canvas.school.edu" is how a masked field confirms itself.
  const feedVerdict = useMemo(
    () => (isCanvasCalendar ? describeCanvasFeedInput(token) : null),
    [isCanvasCalendar, token],
  );

  // ── The Canvas connect funnel starts here ────────────────────────────────
  //
  // Everything before this point was already measurable: the CTA fires
  // canvas_offer_tapped, and a finished connection leaves a row in
  // lms_connections. Between those two the flow was dark, which is why "59
  // devices tapped, 29 users connected" could be counted but not explained.
  //
  // Four events close that gap, and no more than four: reaching this screen,
  // whether the feed could be read, what was chosen, and whether it landed.
  // Everything downstream — courses imported, deadlines imported, whether the
  // account came back, whether it later bought Pro — is already answerable by
  // joining lms_connections / lms_course_links / tasks / entitlements on
  // user_id, so re-recording it here would be a second copy of the truth that
  // can disagree with the first.
  //
  // AFTER THE GATE, NOT ON MOUNT.
  //
  // This used to fire in an effect with empty deps, which meant it fired for
  // every arrival — including the ones the gate immediately bounced to the
  // paywall. The event's whole job is to say "a student reached a connect
  // screen they can use", and counting the bounced ones made it say something
  // else while looking identical. It is the denominator for discover/choose/
  // connect, so every rate computed from it was quietly too low.
  //
  // Now it waits for `gateResolved` and reports which side the student landed
  // on. Fired at most once either way — a ref rather than empty deps, because
  // the condition genuinely changes after mount and the guard has to survive
  // that.
  const funnelFired = useRef(false);
  useEffect(() => {
    if (!gateResolved || funnelFired.current) return;
    funnelFired.current = true;
    const facts = {
      screen: 'lms_connect',
      provider,
      method: connectionMethod,
      source,
      reconnecting,
      lane: reconnecting ? 'repair' : 'connect',
    };
    if (lmsAllowed) {
      track('lms_connect_opened', { ...facts, funnel_step: 'opened' });
    } else {
      // The arrival still happened and is still worth counting — it is just
      // not the same thing. Kept as a separate name so no existing query
      // silently changes meaning.
      track('lms_connect_blocked', { ...facts, funnel_step: 'opened', blocked: 'not_entitled' });
    }
  }, [gateResolved, lmsAllowed, provider, connectionMethod, source, reconnecting]);

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
    // No semester is created here any more.
    //
    // This used to call findOrCreateSemester() BEFORE discovery, naming a
    // semester from the onboarding term or today's date — so a student
    // connecting a Fall feed in a summer session got a "Summer 2026" container
    // manufactured for them, and the import went into it. The review step now
    // creates the semester AFTER the feed has been read, prefilled with the
    // term those deadlines actually fall in.
    setWorking(true);
    try {
      const nextCredential = await obtainCredential();
      const found = await discoverLmsCourses({
        provider,
        connectionMethod,
        baseUrl: normalizedBase || null,
        credential: nextCredential,
      });
      // The feed was reachable and readable. `courses` is the number offered,
      // which is what separates "Canvas said no" from "Canvas said nothing" —
      // a feed that opens and returns zero dated courses is a real and
      // different outcome, and the one the alert below explains.
      track('lms_discover_succeeded', {
        lane: reconnecting ? 'repair' : 'connect',
        funnel_step: 'discovered',
        screen: 'lms_connect',
        provider,
        method: connectionMethod,
        source,
        reconnecting,
        courses: found.length,
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
      // CLASSIFIED, never echoed. A connect error can quote the pasted string,
      // and that string is the student's private Canvas feed URL — a bearer
      // credential. Sending it to analytics would put a live secret in a table
      // several people can read. A bounded code answers the only question the
      // experiment asks ("where does this flow lose people") and carries
      // nothing that could authenticate as anyone.
      track('lms_discover_failed', {
        lane: reconnecting ? 'repair' : 'connect',
        funnel_step: 'discovered',
        screen: 'lms_connect',
        provider,
        method: connectionMethod,
        source,
        reconnecting,
        reason: lmsFailureCode(message),
      });
      // Escalation is keyed on this. Counted here rather than in the component
      // so it survives the screen being torn down while the student is away in
      // a browser — which is exactly when a second attempt happens.
      if (isCanvasCalendar) {
        saveProgress({ ...setupProgress, attempts: setupProgress.attempts + 1 });
      }
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

  // ── Auto-validate and advance (Phase 3) ───────────────────────────────────
  //
  // The moment the pasted link is a valid Canvas feed, there is nothing left to
  // ask. Requiring a button tap after that added one more thing to find at the
  // end of a flow whose whole problem is people not getting to the end — and
  // the button sits below a long form, so on a phone it is often off-screen at
  // the moment it becomes relevant.
  //
  // Runs once per distinct valid URL: keyed on the verdict's normalised URL
  // rather than on the raw field, so re-typing the same link does not re-fire
  // and a keystroke inside an already-valid URL does not either.
  const autoAdvancedFor = useRef<string | null>(null);
  const [autoAdvancing, setAutoAdvancing] = useState(false);
  useEffect(() => {
    if (!isCanvasCalendar) return;
    if (!feedVerdict || feedVerdict.state !== 'ok') return;
    if (working || courses.length > 0) return;
    if (autoAdvancedFor.current === feedVerdict.url) return;
    autoAdvancedFor.current = feedVerdict.url;
    setAutoAdvancing(true);
    // A beat, so a student watching the field sees "looks right" register
    // before the screen starts working. Instant would read as a glitch.
    const timer = setTimeout(() => {
      track('canvas_setup_auto_advanced', { screen: 'lms_connect', source, lane: reconnecting ? 'repair' : 'connect' });
      void discover().finally(() => setAutoAdvancing(false));
    }, 450);
    return () => { clearTimeout(timer); setAutoAdvancing(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCanvasCalendar, feedVerdict, working, courses.length]);

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
    // BLOCK. The one action this flow must not let someone take by accident is
    // filing a term's work into a semester that cannot contain it — the exact
    // thing that happened before any of this existed. Only raised when both
    // windows are known and they do not touch at all, so it never fires on a
    // guess.
    const target = semesters.find((semester) => semester.id === semesterId) ?? null;
    const range = formatSpan(spanOf(chosen.map(courseFactsOf)), locale === 'es' ? 'es' : 'en');
    if (!confirmSemesterConflict(chosen, target, range, () => { void beginImport(chosen); })) return;
    await beginImport(chosen);
  };

  /**
   * Between choosing courses and importing them: does any of this already exist?
   *
   * Only interrupts when there is a real question. Measured against production,
   * 77 of 86 Canvas courses match nothing their student already has, so for the
   * overwhelming majority this is a straight pass-through to commit() and the
   * flow is exactly as it was.
   */
  const beginImport = async (chosen: DiscoveredLmsCourse[]) => {
    const candidates = (semesterCourses ?? []).map((course: any) => ({
      id: course.id as string,
      name: String(course.name ?? ''),
    }));
    const choices = pendingCourseChoices(
      chosen.map((course) => ({ id: course.id, name: course.name })),
      candidates,
    );
    if (!choices.length) {
      await commit(chosen);
      return;
    }
    setPendingImport(chosen);
    setLinkChoices(choices);
  };

  const resolveLinkChoices = async (decisions: CourseLinkDecision[]) => {
    const chosen = pendingImport;
    setLinkChoices([]);
    setPendingImport(null);
    if (!chosen) return;
    const linkTo: Record<string, string> = {};
    for (const decision of decisions) {
      if (decision.linkToCourseId) linkTo[decision.externalId] = decision.linkToCourseId;
    }
    track('lms_course_link_decided', {
      screen: 'lms_connect',
      provider,
      source,
      offered: decisions.length,
      linked: Object.keys(linkTo).length,
    });
    await commit(chosen, linkTo);
  };

  const commit = async (chosen: DiscoveredLmsCourse[], linkTo?: Record<string, string>) => {
    if (!credential || !session) return;
    // What they actually chose, against what they were offered. The gap between
    // the two is the answer to "did the review step help or get in the way" —
    // everyone importing everything and everyone importing one class are very
    // different products, and the counts alone tell them apart.
    track('lms_courses_selected', {
      lane: reconnecting ? 'repair' : 'connect',
      funnel_step: 'chosen',
      screen: 'lms_connect',
      provider,
      method: connectionMethod,
      source,
      selected: chosen.length,
      offered: courses.length,
    });
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
        // Absent unless the student explicitly chose to link. See connectLms:
        // a linked course is never inserted, updated or renamed.
        linkTo,
        // Everything shown and left unticked. Remembered as a decision, so the
        // first sync does not offer them straight back.
        declined: courses.filter((course) => !selected.has(course.id)),
      });
      // The end of the funnel. `deadlines` is the number that makes activation
      // measurable on its own — a connection that imports three courses and one
      // deadline is not the same success as one that imports 74, and the
      // difference decides whether this experiment actually helped anybody.
      track('lms_connect_completed', {
        lane: reconnecting ? 'repair' : 'connect',
        funnel_step: 'connected',
        screen: 'lms_connect',
        provider,
        method: connectionMethod,
        source,
        courses: chosen.length,
        deadlines: result.processed,
      });
      Alert.alert(
        isCanvasCalendar ? 'Canvas connected' : 'Connected',
        `${chosen.length} ${chosen.length === 1 ? 'course' : 'courses'} and ${result.processed} deadlines imported.${isCanvasCalendar ? ' Semora will keep checking Canvas every few hours.' : ''}`,
        // Deliberately NOT a paywall. This is the moment the promotion promised
        // something and delivered it; charging straight into an upsell here is
        // how a kept promise starts to feel like a setup. Pro is offered again
        // by the walls that were already there.
        //
        // AND NOT A SETTINGS LIST EITHER (Phase 3). "Done" used to return to
        // /settings/lms — a page of connection plumbing. The student just
        // imported a term of deadlines and was shown a row saying "Canvas ·
        // syncing", which is a receipt, not the thing they came for. They land
        // on Today instead, looking at the work that just arrived.
        //
        // Selecting the semester first matters: Today renders the SELECTED
        // term, and the import may have gone into a different one — the review
        // step creates it from the dates Canvas actually returned. Without
        // this, the payoff screen would be empty for exactly the students whose
        // Canvas term is not the one the app happened to be showing.
        [{
          text: 'See my deadlines',
          onPress: () => {
            if (semesterId) setSelectedSemester(semesterId);
            if (setupKey) setDeviceItem(setupKey, serializeCanvasSetupProgress(EMPTY_PROGRESS));
            track('canvas_setup_payoff_opened', {
              screen: 'lms_connect', source, lane: 'connect',
              courses: chosen.length, deadlines: result.processed,
            });
            router.replace('/(tabs)' as any);
          },
        }],
      );
    } catch (error) {
      track('lms_connect_failed', {
        lane: reconnecting ? 'repair' : 'connect',
        funnel_step: 'connected',
        screen: 'lms_connect',
        provider,
        method: connectionMethod,
        source,
        courses: chosen.length,
        reason: lmsFailureCode(error instanceof Error ? error.message : ''),
      });
      // "Nothing was saved" is a claim about the rollback, so only make it when
      // the rollback confirmed it. connectLms flags a rollback that did not
      // fully succeed; in that case the student's course list HAS changed and
      // sending them away believing otherwise is worse than saying so.
      Alert.alert(
        'Import failed',
        (error as any)?.partialImport
          ? `${error instanceof Error ? error.message : 'The import failed.'}\n\nSome classes may have been added before it stopped — check your course list.`
          : error instanceof Error ? error.message : 'Nothing was saved. Please try again.',
      );
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

  // Either the gate has not resolved yet, or it resolved against this account
  // and the effect above is routing to the paywall. Both render an empty paper
  // screen, so no connect form flashes in front of someone who cannot use it.
  if (!lmsAllowed) {
    return <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']} />;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen
        options={{
          // Built from two pieces, so the whole title never matched a catalogue
          // key and the header stayed English while the screen under it was
          // Spanish. Each half is translated on its own; the provider name is a
          // proper noun and stays as it is.
          title: `${t(reconnecting ? 'Reconnect' : 'Connect')} ${LMS_PROVIDER_LABELS[provider]}`,
        }}
      />
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
                    // The heading carries the price, because the banner below
                    // is the kind of thing a student scrolls past. Someone who
                    // arrived from a card promising a limited-time free offer
                    // should not then read three screens of instructions whose
                    // every action word is silent about it — that gap is what
                    // makes a promo feel like it had a catch.
                    ? (lmsFree ? 'Connect Canvas — free' : 'Connect Canvas to Semora')
                    : `Connect your ${LMS_PROVIDER_LABELS[provider]} account`}
              </Text>
              <Text style={[styles.subtitle, { color: colors.ink3 }]}>
                {isCanvasCalendar
                  ? 'Set this up once. Semora will keep your dated Canvas assignments and events updated when an instructor changes a deadline.'
                  : 'Semora makes read-only requests to import classes, deadlines, points, and available submission status. It never changes your LMS.'}
              </Text>

              {/* The promise, on the screen where it is being made.
                  Two sentences and both of them have to be true. "No limit on
                  classes" is enforced by enforce_free_course_limit admitting
                  every source='lms' row (090). "Stays yours" is enforced by
                  free_promo_claimed_at, stamped on the connection row this
                  screen is about to create — ending the offer reads the stamp
                  and lets these accounts through forever. Saying "limited
                  time" while quietly meaning "we may switch yours off too" is
                  the version of this that would deserve the App Store review
                  it would get. */}
              {lmsFree && !reconnecting && (
                <View style={[styles.freeOffer, { backgroundColor: colors.teal50, borderColor: colors.teal }]}>
                  <FontAwesome name="gift" size={15} color={colors.teal} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.freeOfferTitle, { color: colors.ink }]}>Limited time offer · free sync</Text>
                    <Text style={[styles.freeOfferText, { color: colors.ink2 }]}>
                      No Pro needed, and no limit on how many classes come across. Connect now and it stays free on this account, even after the offer ends.
                    </Text>
                  </View>
                </View>
              )}

              {isCanvasCalendar && (
                <>
                  {/* GUIDED PASTE (Phase 3).
                      What stood here was a card of instructions: open Canvas in
                      a browser, go to Calendar, find Calendar Feed, copy the
                      URL. Correct, and measured over 60 days: 22 sessions
                      reached this screen, 13 of them never attempted a paste at
                      all, and 2 connected. Instructions cannot help a student
                      who does not know their school's Canvas address — and
                      almost nobody does, because it rarely resembles the
                      school's name.

                      The component does the parts Semora can do: find the
                      address from the school's NAME, open that calendar page in
                      one tap, read the link back off the clipboard, rescue a
                      wrong-page paste using the hostname it already contains,
                      and hand the job to a laptop rather than repeating itself.
                      The paste field, its masking and its iOS content hints are
                      carried over unchanged. */}
                  <CanvasGuidedPaste
                    token={token}
                    onTokenChange={setToken}
                    verdict={feedVerdict}
                    progress={setupProgress}
                    onProgressChange={saveProgress}
                    working={working}
                    autoAdvancing={autoAdvancing}
                    source={source}
                  />

                  <View style={styles.privateNote}>
                    <FontAwesome name="lock" size={12} color={colors.ink3} />
                    <Text style={[styles.privateNoteText, { color: colors.ink3 }]}>Treat this link like a password. Semora encrypts it and never displays it after setup.</Text>
                  </View>
                  <CanvasFeedLimits />
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

              {/* The empty submit is not a user error, it is an affordance
                  error. `feed_url_empty` is the single most common recorded
                  failure of this screen — 6 events from 4 devices — and every
                  one is someone tapping the only button on the page before
                  they had anything to submit, then being told off for it by an
                  alert. Refusing the tap costs them nothing: the guided block
                  directly above says what to do and offers to paste from the
                  clipboard, so a greyed button reads as "not yet" rather than
                  as a dead end. */}
              <TouchableOpacity
                onPress={discover}
                disabled={working || (isCanvasCalendar && (!feedVerdict || feedVerdict.state === 'empty'))}
                style={[
                  styles.primary,
                  { backgroundColor: working || (isCanvasCalendar && (!feedVerdict || feedVerdict.state === 'empty'))
                      ? colors.line
                      : colors.brand },
                ]}
              >
                {working ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <FontAwesome name={provider === 'google_classroom' ? 'google' : isCanvasCalendar ? 'calendar' : 'search'} size={14} color="#fff" />
                    <Text style={styles.primaryText}>{reconnecting ? 'Reconnect and sync' : provider === 'google_classroom' ? 'Continue with Google' : isCanvasCalendar ? (lmsFree ? 'Check link — free' : 'Check link and choose courses') : 'Find my courses'}</Text>
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

              {/* Everything below — the evidence line, the semester question,
                  the inline create, the course list — is the SAME component the
                  new-term prompt uses. A term arriving in January is this exact
                  decision asked later, so it must not get a second
                  implementation that can drift from this one. */}
              <CanvasCourseReview
                courses={courses}
                semesters={semesters}
                selected={selected}
                onToggle={toggleCourse}
                onSelectAll={(ids) => setSelected(new Set(ids))}
                semesterId={semesterId}
                onSemesterChange={setSemesterId}
                onSemesterCreated={() => { refetchSemesters(); }}
                footer={isCanvasCalendar ? (
                  <View style={[styles.afterConnect, { backgroundColor: colors.brand50 }]}>
                    <FontAwesome name="check-circle" size={14} color={colors.brand} />
                    <Text style={[styles.afterConnectText, { color: colors.ink2 }]}>After connecting, Semora keeps watching this feed — including for next semester's courses. You will not have to reconnect Canvas.</Text>
                  </View>
                ) : null}
              />

              <TouchableOpacity onPress={save} disabled={working} style={[styles.primary, { backgroundColor: colors.brand }]}>
                {working ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{isCanvasCalendar ? (lmsFree ? 'Connect Canvas free and start syncing' : 'Connect Canvas and start syncing') : 'Import and sync'}</Text>}
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <CourseLinkChoiceSheet
        visible={linkChoices.length > 0}
        choices={linkChoices}
        // Back returns to the review step with the selection intact; nothing is
        // imported, so backing out costs the student nothing.
        onCancel={() => { setLinkChoices([]); setPendingImport(null); }}
        onConfirm={(decisions) => { void resolveLinkChoices(decisions); }}
      />
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
  freeOffer: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 11,
    borderWidth: 1, borderRadius: 13,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
  },
  freeOfferTitle: { fontSize: 13.5, fontWeight: '800' },
  freeOfferText: { fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  label: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.45, marginTop: 14, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 13, borderWidth: 1.2, paddingHorizontal: 14, fontSize: 15 },
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
