import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Text, TextInput } from '@/components/LocalizedReactNative';
import {
  useEffect,
  useMemo,
  useRef,
  useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Keyboard,
  Text as RawText,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn, FadeInDown, SlideInRight, SlideInLeft, SlideOutLeft, SlideOutRight,
  useSharedValue, useAnimatedStyle, withTiming, Easing, interpolateColor, runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useAppStore, type PainPoint } from '@/store/appStore';
import { useI18n } from '@/lib/i18n';
import { track } from '@/lib/analytics';

const STEP_COUNT = 5; // hook · live demo · outcome · toolkit · personalize

/** Current + adjacent academic terms, with a sensible default for today. */
function useTermOptions() {
  return useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-11
    const options = [`Spring ${year}`, `Summer ${year}`, `Fall ${year}`];
    // In the fall, the next term students plan for is spring of next year.
    if (month >= 7) options.push(`Spring ${year + 1}`);
    const def = month >= 7 ? `Fall ${year}` : month >= 4 ? `Summer ${year}` : `Spring ${year}`;
    return { options, def };
  }, []);
}

type DemoPhase = 'idle' | 'scanning' | 'done';

export default function OnboardingScreen() {
  const colors = useColors();
  const { contentMaxWidth, isWide, isLandscape } = useResponsive();
  // Onboarding is prose and a short form, not a dashboard. contentMaxWidth
  // opens to 786pt on an iPad because its `isWide` tier was sized for the
  // desktop web canvas, where a 256pt sidebar is subtracted first; used raw
  // here it ran the headline and body nearly edge to edge on a tablet. Cap it
  // at a readable measure. Phones are unaffected — min() leaves 390 alone.
  const stageMaxWidth = Math.min(contentMaxWidth, 640);
  const router = useRouter();
  const setHasOnboarded = useAppStore((s) => s.setHasOnboarded);
  const setUserName = useAppStore((s) => s.setUserName);
  const setDefaultTerm = useAppStore((s) => s.setDefaultTerm);
  const setPainPoint = useAppStore((s) => s.setPainPoint);

  // Locale drives which pill reads as selected; setPreference persists the
  // choice and, because the localized Text wrapper subscribes to the same store
  // field, re-renders the rest of onboarding in that language immediately.
  const { locale, setPreference } = useI18n();

  const { options: termOptions, def: defaultTerm } = useTermOptions();
  const [step, setStep] = useState(0);
  const dirRef = useRef<'fwd' | 'back'>('fwd');
  const [name, setName] = useState('');
  const [term, setTerm] = useState<string>(defaultTerm);
  const [pain, setPain] = useState<PainPoint | null>(null);
  // The live-demo state machine lives up here so the footer CTA can drive it.
  const [demoPhase, setDemoPhase] = useState<DemoPhase>('idle');
  const scrollRef = useRef<ScrollView>(null);

  const tap = () => { if (Platform.OS === 'ios') Haptics.selectionAsync(); };

  // Funnel entry point — without a step-0 event the per-step drop-off has
  // no denominator. Fired once per mount, not per revisit of step 0.
  useEffect(() => {
    track('onboarding_step', { screen: 'onboarding', step: 0, via: 'start' });
  }, []);

  const finish = () => {
    setUserName(name.trim() || null);
    setDefaultTerm(term || null);
    setPainPoint(pain);
    setHasOnboarded(true);
    // Completion event carries the pain-point choice (already captured
    // above) so paywall/auth copy experiments can segment on it. The typed
    // name is PII-adjacent — intentionally not sent.
    track('onboarding_step', {
      screen: 'onboarding',
      step: 'complete',
      ...(pain ? { choice: pain } : {}),
    });
    router.replace('/(auth)/sign-in');
  };

  // Single choke point for step changes — every transition (next/back/skip)
  // logs one onboarding_step event with the step being ENTERED.
  const goTo = (target: number, dir: 'fwd' | 'back', via: 'next' | 'back' | 'skip' = dir === 'fwd' ? 'next' : 'back') => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    dirRef.current = dir;
    // Re-arm the demo only on FORWARD entry: going back to look at the result
    // again used to wipe it and show the un-scanned page instead.
    if (target === 1 && dir === 'fwd') setDemoPhase('idle');
    setStep(target);
    track('onboarding_step', { screen: 'onboarding', step: target, via });
  };

  const next = () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    // On the demo step the CTA first RUNS the demo, then advances.
    if (step === 1 && demoPhase === 'idle') {
      setDemoPhase('scanning');
      return;
    }
    if (step < STEP_COUNT - 1) goTo(step + 1, 'fwd');
    else finish();
  };

  const back = () => { tap(); if (step > 0) goTo(step - 1, 'back'); };

  // Skip never bypasses the whole flow — it fast-forwards to the
  // personalize step so even skippers make one small commitment before
  // the account wall. Hidden on the hook and final steps.
  const skip = () => { tap(); goTo(STEP_COUNT - 1, 'fwd', 'skip'); };

  const CTA_LABELS: Record<number, string> = {
    0: 'Try it on a real syllabus',
    1: demoPhase === 'idle' ? 'Scan the sample syllabus'
      : demoPhase === 'scanning' ? 'Scanning…'
      : 'See what I get',
    2: 'See the whole toolkit',
    3: 'Make it mine',
    4: 'Save my semester',
  };
  const ctaDisabled = step === 1 && demoPhase === 'scanning';
  const isLast = step === STEP_COUNT - 1;

  const ctaScale = useSharedValue(1);
  const ctaStyle = useAnimatedStyle(() => ({ transform: [{ scale: ctaScale.value }] }));

  const entering = (dirRef.current === 'fwd' ? SlideInRight : SlideInLeft).springify().damping(19).stiffness(160);
  const exiting = dirRef.current === 'fwd' ? SlideOutLeft.duration(220) : SlideOutRight.duration(220);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['top', 'bottom']}>
      <View pointerEvents="none" style={[styles.glow, { backgroundColor: colors.brand, opacity: 0.06 }]} />

      {/* Top bar */}
      <View style={[styles.topBar, { maxWidth: stageMaxWidth }]}>
        <View style={styles.brandRow}>
          <View style={[styles.brandDot, { backgroundColor: colors.brand }]} />
          <Text style={[styles.brandWord, { color: colors.ink }]}>Semora</Text>
        </View>
        {step === 0 ? (
          /* Language first, before any copy has to be understood. Each label is
             written in its OWN language and rendered with react-native's raw
             Text: routed through the localizing wrapper, "English" would come
             out as "Inglés" for a Spanish reader, which is precisely the person
             who needs to recognise it. */
          <View style={[styles.langRow, { borderColor: colors.line, backgroundColor: colors.card }]}>
            {(['en', 'es'] as const).map((code) => {
              const active = locale === code;
              return (
                <TouchableOpacity
                  key={code}
                  onPress={() => {
                    if (Platform.OS === 'ios') Haptics.selectionAsync();
                    setPreference(code);
                    track('onboarding_language_selected', { locale: code });
                  }}
                  hitSlop={6}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.langPill, active && { backgroundColor: colors.brand }]}
                >
                  <RawText style={[styles.langPillText, { color: active ? '#fff' : colors.ink2 }]}>
                    {code === 'en' ? 'English' : 'Español'}
                  </RawText>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : !isLast ? (
          <TouchableOpacity onPress={skip} hitSlop={12} activeOpacity={0.7}>
            <Text style={[styles.skip, { color: colors.ink3 }]}>Skip</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Progress */}
      <View style={[styles.progress, { maxWidth: stageMaxWidth }]}>
        {Array.from({ length: STEP_COUNT }).map((_, i) => (
          <View key={i} style={[styles.bar, { backgroundColor: colors.brand50 }, i <= step && { backgroundColor: colors.brand }]} />
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[styles.stageScroll, { maxWidth: stageMaxWidth }, isWide && styles.stageScrollCentered]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          // Was false. When a step overflowed there was nothing to say so, which
          // is how seven of twelve tools read as the whole list.
          showsVerticalScrollIndicator
        >
          <Animated.View key={step} entering={entering} exiting={exiting}>
            {step === 0 && <Hook colors={colors} isWide={isWide} />}
            {step === 1 && <LiveDemo colors={colors} phase={demoPhase} onDone={() => setDemoPhase('done')} isWide={isWide} isLandscape={isLandscape} />}
            {step === 2 && <Outcome colors={colors} isWide={isWide} />}
            {step === 3 && <Toolkit colors={colors} isWide={isWide} isLandscape={isLandscape} />}
            {step === 4 && (
              <Personalize
                colors={colors}
                isWide={isWide}
                name={name} setName={setName}
                term={term} setTerm={(t) => { setTerm(t); tap(); }}
                termOptions={termOptions}
                pain={pain} setPain={(p) => { setPain(p); tap(); }}
              />
            )}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={[styles.footer, { maxWidth: stageMaxWidth }, isLandscape && { paddingBottom: 8 }]}>
        {step === 0 && (
          <Text style={[styles.reassure, { color: colors.ink3 }]}>A quick tour first — you{'’'}ll see it read a real syllabus.</Text>
        )}
        <Animated.View style={[{ width: '100%' }, ctaStyle]}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.brand }, isLandscape && { height: 44 }, ctaDisabled && { opacity: 0.55 }]}
            onPress={next}
            disabled={ctaDisabled}
            onPressIn={() => { ctaScale.value = withTiming(0.97, { duration: 90 }); }}
            onPressOut={() => { ctaScale.value = withTiming(1, { duration: 130 }); }}
            activeOpacity={0.9}
          >
            <Text style={styles.ctaText}>{CTA_LABELS[step]}</Text>
            {!ctaDisabled && <FontAwesome name="arrow-right" size={15} color="#fff" style={{ marginTop: 1 }} />}
          </TouchableOpacity>
        </Animated.View>
        {step > 0 ? (
          <TouchableOpacity onPress={back} hitSlop={10} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={[styles.backText, { color: colors.ink3 }]}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
      </View>
    </SafeAreaView>
  );
}

/* ---------------------------------------------------------------- steps */

type C = ReturnType<typeof useColors>;

const RESULT_ROWS = [
  { color: 'coral' as const, title: 'Midterm Exam', date: 'Oct 14', kind: 'EXAM' },
  { color: 'brand' as const, title: 'Problem Set 3', date: 'Oct 21', kind: 'HW' },
  { color: 'blue' as const, title: 'Group Presentation', date: 'Nov 4', kind: 'PROJ' },
  { color: 'teal' as const, title: 'Final Project', date: 'Dec 9', kind: 'PROJ' },
];

function rowColor(colors: C, k: 'coral' | 'brand' | 'teal' | 'blue') {
  return k === 'coral' ? colors.coral : k === 'teal' ? colors.teal : k === 'blue' ? colors.blue : colors.brand;
}

/* ------------------------------------------------ step 0: hook */

function Hook({ colors, isWide }: { colors: C; isWide: boolean }) {
  // Animated.Text wraps react-native's raw Text, not the localized wrapper, so
  // its children bypass runtime translation entirely — this hero rendered in
  // English for Spanish users even though every piece below has a dictionary
  // entry. Translate explicitly; useI18n() keeps it reactive to the setting.
  const { t } = useI18n();
  return (
    <View style={styles.stepPad}>
      <Animated.Text entering={FadeInDown.duration(420)} style={[styles.kicker, { color: colors.brand }]}>
        {t('WELCOME TO SEMORA')}
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(80).duration(420)} style={[styles.display, { color: colors.ink }]}>
        {t('Your semester,')}{'\n'}{t('organized in')}{'\n'}{t('one snap.')}
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(160).duration(420)} style={[styles.lead, { color: colors.ink2 }, isWide && { maxWidth: 700 }]}>
        {t('Turn any syllabus — a photo or a PDF — into a calendar of every deadline. In seconds, without typing a thing.')}
      </Animated.Text>
      <Animated.View entering={FadeInDown.delay(280).duration(480)} style={styles.heroCardWrap}>
        <View pointerEvents="none" style={[styles.miniResultCard, { backgroundColor: colors.card, borderColor: colors.line, transform: [{ scale: 0.92 }, { rotate: '-3deg' }] }]}>
          <View style={styles.extractHead}>
            <FontAwesome name="magic" size={13} color={colors.brand} />
            <Text style={[styles.extractHeadText, { color: colors.brand }]}>EXTRACTED FOR YOU</Text>
          </View>
          {RESULT_ROWS.slice(0, 3).map((r, i) => (
            <View key={i} style={[styles.row, i < 2 && { borderBottomColor: colors.line, borderBottomWidth: 0.5 }]}>
              <View style={[styles.rowDot, { backgroundColor: rowColor(colors, r.color) }]} />
              <Text style={[styles.rowTitle, { color: colors.ink }]}>{r.title}</Text>
              <Text style={[styles.rowDate, { color: colors.ink3 }]}>{r.date}</Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------ step 1: LIVE DEMO */

// One line of the sample syllabus. `at` is the line's vertical position as
// a fraction of the document — used to flash it as the beam passes.
// `deadline` lines flash brand as the beam passes; `meta` lines (class
// schedule, office hours) flash too — the scanner extracts those as well,
// and the demo should show it understands more than due dates.
const DOC_LINES: { text: string; at: number; deadline?: boolean; meta?: boolean; faint?: boolean }[] = [
  { text: 'PSYCH 201 · Cognitive Psychology', at: 0.06 },
  { text: 'Fall — Dr. Reyes · MWF 10:00', at: 0.13, meta: true, faint: true },
  { text: 'Weekly readings: chapters 1–14', at: 0.26, faint: true },
  { text: 'Quizzes every other Friday', at: 0.35, faint: true },
  { text: 'Midterm Exam — Oct 14, in class', at: 0.46, deadline: true },
  { text: 'Problem Set 3 — due Oct 21, 11:59 PM', at: 0.57, deadline: true },
  { text: 'Late work: −10% per day', at: 0.66, faint: true },
  { text: 'Group Presentation — Nov 4', at: 0.76, deadline: true },
  { text: 'Final Project — due Dec 9', at: 0.87, deadline: true },
  { text: 'Office hours: Tue 2–4, Rm 114', at: 0.95, meta: true, faint: true },
];

const DOC_H = 300;
const SCAN_MS = 2400;

function DocLine({ colors, line, beam }: { colors: C; line: typeof DOC_LINES[number]; beam: SharedValue<number> }) {
  // Deadline lines flash brand; schedule/office-hours (`meta`) flash a
  // softer teal so the demo shows the scanner reads MORE than due dates.
  const aStyle = useAnimatedStyle(() => {
    if (line.deadline) {
      return {
        backgroundColor: interpolateColor(
          beam.value,
          [line.at - 0.04, line.at, line.at + 0.18],
          ['rgba(238,237,254,0)', 'rgba(107,70,193,0.22)', 'rgba(238,237,254,0.9)'],
        ),
      };
    }
    if (line.meta) {
      return {
        backgroundColor: interpolateColor(
          beam.value,
          [line.at - 0.04, line.at, line.at + 0.18],
          ['rgba(225,245,238,0)', 'rgba(15,110,86,0.18)', 'rgba(225,245,238,0.8)'],
        ),
      };
    }
    return {};
  });
  return (
    <Animated.View style={[styles.docLineWrap, aStyle]}>
      <Text
        numberOfLines={1}
        style={[
          styles.docLine,
          { color: line.faint ? colors.ink3 : colors.ink },
          line.deadline && { fontWeight: '700' },
        ]}
      >
        {line.text}
      </Text>
    </Animated.View>
  );
}

function LiveDemo({ colors, phase, onDone, isWide, isLandscape }: { colors: C; phase: DemoPhase; onDone: () => void; isWide: boolean; isLandscape: boolean }) {
  const beam = useSharedValue(0);
  const [count, setCount] = useState(0);
  // Shorten the scanned-document mockup in landscape (iPhone AND iPad) so the
  // step doesn't clip vertically behind the pinned footer CTA.
  const docH = isLandscape ? 240 : DOC_H;

  // Run the sweep when the footer CTA flips us to 'scanning'.
  useEffect(() => {
    if (phase !== 'scanning') return;
    beam.value = 0;
    beam.value = withTiming(1, { duration: SCAN_MS, easing: Easing.inOut(Easing.ease) }, (finished) => {
      if (finished) runOnJS(onDone)();
    });
    // Haptic tick as each deadline line is crossed.
    if (Platform.OS === 'ios') {
      const ticks = DOC_LINES.filter((l) => l.deadline).map((l) =>
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}), l.at * SCAN_MS),
      );
      return () => ticks.forEach(clearTimeout);
    }
  }, [phase]);

  // Count up the found-deadlines number once the scan completes.
  useEffect(() => {
    if (phase !== 'done') { setCount(0); return; }
    if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    let n = 0;
    const iv = setInterval(() => {
      n += 1;
      setCount(n);
      if (n >= RESULT_ROWS.length) clearInterval(iv);
    }, 55);
    return () => clearInterval(iv);
  }, [phase]);

  const beamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: beam.value * (docH - 36) }],
    opacity: phase === 'scanning' ? 1 : 0,
  }));
  const washStyle = useAnimatedStyle(() => ({ height: beam.value * docH }));

  return (
    <View style={styles.stepPad}>
      {phase !== 'done' ? (
        <>
          <Text style={[styles.display2, { color: colors.ink }]}>
            {phase === 'scanning' ? 'Reading it…' : 'A real syllabus.\nWatch this.'}
          </Text>
          <Text style={[styles.lead, { color: colors.ink2, marginBottom: 18 }, isWide && { maxWidth: 700 }]}>
            {phase === 'scanning'
              ? 'Finding every date that matters.'
              : 'This is a page from an intro psych syllabus. Tap the button to scan it.'}
          </Text>
          {/* The sample document */}
          <View style={styles.docWrap}>
            <View style={[styles.docBack, { backgroundColor: colors.brand50 }, isLandscape && { height: docH - 6 }]} />
            <View style={[styles.doc, { backgroundColor: colors.card, borderColor: colors.line }, isLandscape && { height: docH, paddingVertical: 6 }]}>
              {DOC_LINES.map((l, i) => (
                <DocLine key={i} colors={colors} line={l} beam={beam} />
              ))}
              <Animated.View pointerEvents="none" style={[styles.docWash, { backgroundColor: colors.brand }, washStyle]} />
              <Animated.View pointerEvents="none" style={[styles.beamWrap, beamStyle]}>
                <LinearGradient
                  colors={['rgba(107,70,193,0)', 'rgba(107,70,193,0.30)', '#6B46C1', 'rgba(107,70,193,0.30)', 'rgba(107,70,193,0)']}
                  style={styles.beam}
                />
              </Animated.View>
            </View>
          </View>
        </>
      ) : (
        <Animated.View entering={FadeIn.duration(260)}>
          <Text style={[styles.kicker, { color: colors.teal }]}>STRAIGHT FROM THE PAGE</Text>
          <Text style={[styles.display2, { color: colors.ink }]}>
            <Text style={{ color: colors.brand }}>{count}</Text> deadlines,{'\n'}zero typing
          </Text>
          <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            {RESULT_ROWS.map((r, i) => (
              <Animated.View key={i} entering={FadeInDown.delay(150 + i * 170).springify().damping(16)}>
                <View style={[styles.row, { borderBottomColor: colors.line, borderBottomWidth: 0.5 }]}>
                  <View style={[styles.rowDot, { backgroundColor: rowColor(colors, r.color) }]} />
                  <Text style={[styles.rowTitle, { color: colors.ink }]}>{r.title}</Text>
                  <Text style={[styles.rowDate, { color: colors.ink3 }]}>{r.date}</Text>
                </View>
              </Animated.View>
            ))}
            <Animated.View entering={FadeInDown.delay(150 + RESULT_ROWS.length * 170).springify().damping(16)}>
              <View style={styles.row}>
                <Text numberOfLines={2} style={[styles.moreRow, { color: colors.brand }]}>Plus class times and office hours</Text>
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

/* ------------------------------------------------ step 2: outcome */

function Outcome({ colors, isWide }: { colors: C; isWide: boolean }) {
  return (
    <View style={styles.stepPad}>
      <Text style={[styles.display2, { color: colors.ink }]}>Then it runs{'\n'}your semester</Text>
      <Text style={[styles.lead, { color: colors.ink2, marginBottom: 22 }, isWide && { maxWidth: 700 }]}>
        Reminders before every due date. Deadlines synced to your phone{'’'}s calendar. Your grade in every class — and what you need on the final.
      </Text>

      {/* Reminder notification mockup */}
      <Animated.View entering={FadeInDown.delay(120).springify().damping(17)} style={[styles.mockNotif, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <View style={[styles.mockNotifIcon, { backgroundColor: colors.brand }]}>
          <FontAwesome name="bell" size={12} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.mockNotifTitle, { color: colors.ink }]}>Semora · Reminder</Text>
          {/* Same-day copy — every tier actually receives this one
              (1-day-before reminders are Pro). Don't demo a Pro feature
              as the default experience. */}
          <Text style={[styles.mockNotifBody, { color: colors.ink2 }]}>Problem Set 3 is due tonight, 11:59 PM</Text>
        </View>
        <Text style={[styles.mockNotifTime, { color: colors.ink3 }]}>now</Text>
      </Animated.View>

      {/* Next Up mockup */}
      <Animated.View entering={FadeInDown.delay(260).springify().damping(17)} style={[styles.mockNextUp, { backgroundColor: colors.brand }]}>
        <View style={styles.mockNextUpHead}>
          <Text style={styles.mockNextUpLabel}>NEXT UP</Text>
          <View style={styles.mockTodayBadge}><Text style={styles.mockTodayBadgeText}>TODAY</Text></View>
        </View>
        <Text style={styles.mockNextUpTitle}>PSYCH 201 · Midterm Exam</Text>
        <Text style={styles.mockNextUpSub}>Tuesday, Oct 14 · in class</Text>
      </Animated.View>

      {/* Grade mockup */}
      <Animated.View entering={FadeInDown.delay(400).springify().damping(17)} style={[styles.mockGrade, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.mockGradeLabel, { color: colors.ink3 }]}>CURRENT GRADE · PSYCH 201</Text>
          <Text style={[styles.mockGradeValue, { color: colors.ink }]}>86.7%</Text>
          <View style={[styles.mockGradeTrack, { backgroundColor: colors.brand50 }]}>
            <View style={[styles.mockGradeFill, { backgroundColor: colors.teal, width: '86%' }]} />
          </View>
        </View>
        <View style={[styles.mockGradeBadge, { backgroundColor: colors.teal }]}>
          <Text style={styles.mockGradeBadgeText}>B+</Text>
        </View>
      </Animated.View>

      {/* Reminders, Calendar and Widgets used to be three more rows on step 3,
          below the fold — restating what the two mockups above already show.
          Named here instead, in the dead space this step had to spare. */}
      <Animated.View entering={FadeInDown.delay(540).springify().damping(17)}>
        <Text style={[styles.plugsCaption, { color: colors.ink2 }]}>
          And it plugs into the phone you already use.
        </Text>
        <View style={styles.plugsRow}>
          {([
            { icon: 'bell', label: 'Reminders' },
            { icon: 'calendar', label: 'Calendar' },
            { icon: 'th-large', label: 'Widgets' },
          ] as { icon: React.ComponentProps<typeof FontAwesome>['name']; label: string }[]).map((p) => (
            <View key={p.label} style={styles.plug}>
              <FontAwesome name={p.icon} size={20} color={colors.brand} accessible={false} />
              <Text numberOfLines={1} style={[styles.plugLabel, { color: colors.ink }]}>{p.label}</Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------ step 3: the toolkit */

/**
 * What the app actually contains.
 *
 * The first three steps prove the scan and the deadlines that follow, which is
 * the hook — but they never mention the study tools, so a student finished
 * onboarding without knowing the tutor, flashcards, focus timer, insights or
 * course spaces existed at all. Those are most of what they are paying for.
 *
 * This used to be twelve identical bordered rows. Every one rendered through
 * the same recipe, so nothing said the AI Tutor is a headline capability and
 * Widgets is a convenience — the eye read one ruled block, not twelve items,
 * and only seven fit before the CTA cut the list off with no scroll indicator.
 *
 * Now: three named groups, each led by one anchor tool that carries a sentence,
 * with two companions named underneath. The group headers are the same three
 * nouns the lead used to spell out in prose, so the copy and the structure say
 * it once instead of twice. Reminders, Calendar sync and Widgets moved to
 * step 2, which already demonstrates all three with mockups.
 */
type Tool = { icon: React.ComponentProps<typeof FontAwesome>['name']; label: string };
const TOOLKIT_GROUPS: { header: string; anchor: Tool & { note: string }; also: Tool[] }[] = [
  {
    header: 'PLANNING',
    anchor: { icon: 'bolt', label: 'Smart Plan', note: 'Study time, scheduled around your classes' },
    // 'tachometer', not 'bar-chart': stacked under line-chart and compass, three
    // chart glyphs at this size are indistinguishable in a vertical scan.
    also: [{ icon: 'tachometer', label: 'Workload' }, { icon: 'compass', label: 'Progress insights' }],
  },
  {
    header: 'STUDYING',
    anchor: { icon: 'comments', label: 'AI Tutor', note: 'Answers from your syllabus and your notes' },
    also: [{ icon: 'clone', label: 'Flashcards' }, { icon: 'clock-o', label: 'Focus timer' }],
  },
  {
    header: 'GRADES & COURSES',
    anchor: { icon: 'line-chart', label: 'Grades & GPA', note: 'Your own scale, and what you need on the final' },
    also: [{ icon: 'graduation-cap', label: 'Canvas import' }, { icon: 'users', label: 'Course spaces' }],
  },
];

function ToolGroup({
  colors, group, delay, columns,
}: { colors: C; group: typeof TOOLKIT_GROUPS[number]; delay: number; columns: boolean }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().damping(18)} style={{ flex: 1 }}>
      <View style={styles.toolGroupHead}>
        <Text style={[styles.toolGroupLabel, { color: colors.ink3 }]}>{group.header}</Text>
        <View style={[styles.toolGroupRule, { backgroundColor: colors.line }]} />
      </View>

      <View
        accessible
        accessibilityLabel={`${group.anchor.label}. ${group.anchor.note}`}
        style={[styles.toolCard, { backgroundColor: colors.card, borderColor: colors.line }]}
      >
        <View style={[styles.toolIcon, { backgroundColor: colors.brand50 }]}>
          <FontAwesome name={group.anchor.icon} size={15} color={colors.brand} accessible={false} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[styles.toolLabel, { color: colors.ink }]}>{group.anchor.label}</Text>
          <Text numberOfLines={columns ? 3 : 2} style={[styles.toolNote, { color: colors.ink2 }]}>{group.anchor.note}</Text>
        </View>
      </View>

      {/* Side by side, each group is only ~190pt wide; splitting that again into
          two cells left ~85pt, which broke "Workload" and "Flashcards"
          mid-word. Stack the companions when the groups are already columns. */}
      <View style={columns ? styles.toolAlsoCol : styles.toolAlsoRow}>
        {group.also.map((t) => (
          <View key={t.label} style={styles.toolAlso}>
            <FontAwesome name={t.icon} size={20} color={colors.brand} accessible={false} />
            <Text numberOfLines={2} style={[styles.toolAlsoLabel, { color: colors.ink2 }]}>{t.label}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

function Toolkit({ colors, isWide, isLandscape }: { colors: C; isWide: boolean; isLandscape: boolean }) {
  // Side by side on a tablet or in landscape: all three headers land on screen
  // at once, which is the clearest possible statement of "planning, studying,
  // grades". Stacked on a phone, where three columns would be ~100pt wide.
  const columns = isWide || isLandscape;
  return (
    <View style={styles.stepPad}>
      <Text style={[styles.display2, { color: colors.ink }]}>
        {columns ? 'One app for the whole semester' : 'One app for\nthe whole semester'}
      </Text>
      <Text style={[styles.lead, { color: colors.ink2, marginBottom: 18 }, isWide && { maxWidth: 700 }]}>
        Planning, studying and grades — all in here.
      </Text>

      <View style={columns ? styles.toolColumns : undefined}>
        {TOOLKIT_GROUPS.map((g, i) => (
          <ToolGroup key={g.header} colors={colors} group={g} delay={60 + i * 90} columns={columns} />
        ))}
      </View>

      {/* Below the tools, not above them. This used to be the first thing on
          the step — a price fence read before a single feature name, which is
          the opposite of introducing the app. It stays honest, and now it fits
          on screen, which was the original reason for hoisting it. All nine
          tools above are Pro, so it can say exactly that. */}
      <Text style={[styles.toolFootnote, { color: colors.ink2, borderColor: colors.line }]}>
        Free: one AI action (a scan or a lecture), 4 courses and same-day reminders. The tools above are part of Pro.
      </Text>
    </View>
  );
}

/* ------------------------------------------------ step 4: personalize */

const PAIN_OPTIONS: { key: PainPoint; label: string }[] = [
  { key: 'deadlines', label: 'Missing deadlines' },
  { key: 'planning', label: 'Messy planning' },
  { key: 'grades', label: 'Grade anxiety' },
];

function Personalize({
  colors, isWide, name, setName, term, setTerm, termOptions, pain, setPain,
}: {
  colors: C; isWide: boolean; name: string; setName: (v: string) => void;
  term: string; setTerm: (v: string) => void; termOptions: string[];
  pain: PainPoint | null; setPain: (v: PainPoint) => void;
}) {
  return (
    <View style={styles.stepPad}>
      <Text style={[styles.display2, { color: colors.ink }]}>Let{'’'}s make it yours</Text>
      <Text style={[styles.lead, { color: colors.ink2, marginBottom: 24 }, isWide && { maxWidth: 700 }]}>
        Thirty seconds of setup, a whole semester of calm.
      </Text>

      <Text style={[styles.fieldLabel, { color: colors.ink3 }]}>WHAT SHOULD WE CALL YOU?</Text>
      <TextInput
        style={[styles.input, { color: colors.ink, borderBottomColor: colors.line }]}
        value={name}
        onChangeText={setName}
        placeholder="Your first name"
        placeholderTextColor={colors.ink3}
        autoCapitalize="words"
        returnKeyType="done"
        maxLength={40}
      />

      <Text style={[styles.fieldLabel, { color: colors.ink3, marginTop: 26 }]}>WHICH TERM ARE YOU STARTING?</Text>
      <View style={styles.chipWrap}>
        {termOptions.map((t) => {
          const active = t === term;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setTerm(t)}
              activeOpacity={0.8}
              style={[styles.chip, { borderColor: colors.line, backgroundColor: colors.card }, active && { backgroundColor: colors.brand, borderColor: colors.brand }]}
            >
              <Text style={[styles.chipText, { color: active ? '#fff' : colors.ink2 }]}>{t}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[styles.fieldLabel, { color: colors.ink3, marginTop: 26 }]}>WHAT SHOULD SEMORA FIX FIRST?</Text>
      <View style={styles.chipWrap}>
        {PAIN_OPTIONS.map((p) => {
          const active = p.key === pain;
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => setPain(p.key)}
              activeOpacity={0.8}
              style={[styles.chip, { borderColor: colors.line, backgroundColor: colors.card }, active && { backgroundColor: colors.brand, borderColor: colors.brand }]}
            >
              <Text style={[styles.chipText, { color: active ? '#fff' : colors.ink2 }]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  glow: { position: 'absolute', top: -120, right: -100, width: 340, height: 340, borderRadius: 170 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 4, height: 40, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 10, height: 10, borderRadius: 3 },
  brandWord: { fontFamily: FONTS.displaySemibold, fontSize: 18 },
  skip: { fontSize: 15, fontWeight: '600' },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 24, marginTop: 14, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  bar: { flex: 1, height: 4, borderRadius: 999 },
  stage: { flex: 1, paddingHorizontal: 28, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  stepWrap: { flex: 1, paddingTop: 26 },
  // Scrollable step area: fills the stage when content is short (portrait /
  // tall), and scrolls when content exceeds the viewport (iPad landscape /
  // short height) so no step clips behind the pinned footer CTA.
  stageScroll: { flexGrow: 1, paddingHorizontal: 28, paddingTop: 26, paddingBottom: 24, width: '100%', alignSelf: 'center' },
  stageScrollCentered: { justifyContent: 'center' },
  stepPad: { paddingVertical: 8 },
  langRow: { flexDirection: 'row', gap: 2, borderWidth: 1, borderRadius: 999, padding: 2 },
  langPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  langPillText: { fontSize: 12, fontWeight: '700' },
  toolColumns: { flexDirection: 'row', gap: 16 },
  toolGroupHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, marginBottom: 7 },
  toolGroupLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1.4 },
  toolGroupRule: { flex: 1, height: 1 },
  toolCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 9 },
  toolIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  toolLabel: { fontSize: 14.5, fontWeight: '700' },
  toolNote: { fontSize: 12.5, lineHeight: 17, marginTop: 1 },
  toolAlsoRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  toolAlsoCol: { flexDirection: 'column', gap: 0, marginTop: 4 },
  toolAlso: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 4 },
  toolAlsoLabel: { flex: 1, fontSize: 14, fontWeight: '600' },
  // borderTopWidth was 0 while a borderColor was passed, so the rule meant to
  // separate this from the tools never drew and it read as more body copy.
  toolFootnote: { fontSize: 12.5, lineHeight: 18, marginTop: 14, paddingTop: 12, borderTopWidth: 1 },

  plugsCaption: { fontSize: 12.5, lineHeight: 18, marginTop: 18, marginBottom: 10 },
  plugsRow: { flexDirection: 'row', gap: 8 },
  plug: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 4 },
  plugLabel: { fontSize: 13, fontWeight: '700' },

  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 14 },
  display: { fontFamily: FONTS.display, fontSize: 42, lineHeight: 46, letterSpacing: -1 },
  display2: { fontFamily: FONTS.display, fontSize: 33, lineHeight: 38, letterSpacing: -0.6 },
  lead: { fontSize: 16.5, lineHeight: 25, marginTop: 14, maxWidth: 360 },
  heroCardWrap: { alignItems: 'center', marginTop: 28 },

  // Hook mini card
  miniResultCard: {
    width: 290, borderRadius: 20, borderWidth: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 6,
  },
  extractHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  extractHeadText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowDot: { width: 9, height: 9, borderRadius: 5 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '500' },
  rowDate: { fontSize: 13, fontWeight: '600' },
  moreRow: { fontSize: 13.5, fontWeight: '700' },

  // Live demo document
  docWrap: { alignItems: 'center', marginTop: 4 },
  docBack: { position: 'absolute', width: 296, height: DOC_H - 6, borderRadius: 18, transform: [{ rotate: '-4deg' }], top: 8 },
  doc: {
    width: 304, height: DOC_H, borderRadius: 18, borderWidth: 0.5, paddingHorizontal: 18, paddingVertical: 16,
    justifyContent: 'space-between', overflow: 'hidden', transform: [{ rotate: '1.5deg' }],
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 6,
  },
  docLineWrap: { borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1.5, marginHorizontal: -4 },
  docLine: { fontSize: 12.5, lineHeight: 17 },
  docWash: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0.05 },
  beamWrap: { position: 'absolute', left: 0, right: 0, top: 0 },
  beam: { height: 36 },

  // Demo result
  resultCard: {
    borderRadius: 20, borderWidth: 0.5, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6, marginTop: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 6,
  },

  // Outcome mockups
  mockNotif: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 0.5, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 4,
  },
  mockNotifIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  mockNotifTitle: { fontSize: 13, fontWeight: '700' },
  mockNotifBody: { fontSize: 13, marginTop: 1 },
  mockNotifTime: { fontSize: 11.5, alignSelf: 'flex-start' },
  mockNextUp: { borderRadius: 18, padding: 16, marginTop: 12 },
  mockNextUpHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mockNextUpLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  mockTodayBadge: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  mockTodayBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  mockNextUpTitle: { color: '#fff', fontSize: 16.5, fontWeight: '700' },
  mockNextUpSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 3 },
  mockGrade: {
    flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 0.5, padding: 16, marginTop: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.07, shadowRadius: 14, elevation: 4,
  },
  mockGradeLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 1 },
  mockGradeValue: { fontFamily: FONTS.display, fontSize: 26, marginTop: 2 },
  mockGradeTrack: { height: 6, borderRadius: 999, marginTop: 8, overflow: 'hidden' },
  mockGradeFill: { height: 6, borderRadius: 999 },
  mockGradeBadge: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mockGradeBadgeText: { color: '#fff', fontSize: 18, fontWeight: '800' },

  // Personalize
  fieldLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1.4, marginBottom: 10 },
  input: { fontSize: 22, fontFamily: FONTS.displaySemibold, paddingVertical: 8, borderBottomWidth: 1.5 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, borderWidth: 1 },
  chipText: { fontSize: 15, fontWeight: '600' },

  // Footer
  footer: { paddingHorizontal: 24, paddingBottom: 10, alignItems: 'center', gap: 4, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  reassure: { fontSize: 12.5, fontWeight: '500', marginBottom: 8 },
  cta: { flexDirection: 'row', height: 56, width: '100%', borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 9 },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  backBtn: { height: 38, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600' },
});
