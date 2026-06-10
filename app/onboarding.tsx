import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Platform, KeyboardAvoidingView, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeInDown, SlideInRight, SlideInLeft, SlideOutLeft, SlideOutRight,
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, Easing,
} from 'react-native-reanimated';
import { useColors } from '@/lib/theme';
import { FONTS } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';

const STEP_COUNT = 4;
const PAPER_W = 172;
const PAPER_H = 204;
const BEAM_TRAVEL = PAPER_H - 44;

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

export default function OnboardingScreen() {
  const colors = useColors();
  const router = useRouter();
  const setHasOnboarded = useAppStore((s) => s.setHasOnboarded);
  const setUserName = useAppStore((s) => s.setUserName);
  const setDefaultTerm = useAppStore((s) => s.setDefaultTerm);

  const { options: termOptions, def: defaultTerm } = useTermOptions();
  const [step, setStep] = useState(0);
  // Drives the slide direction of the step transition (forward vs Back).
  const dirRef = useRef<'fwd' | 'back'>('fwd');
  const [name, setName] = useState('');
  const [term, setTerm] = useState<string>(defaultTerm);

  const tap = () => { if (Platform.OS === 'ios') Haptics.selectionAsync(); };

  const finish = () => {
    setUserName(name.trim() || null);
    setDefaultTerm(term || null);
    setHasOnboarded(true);
    router.replace('/(auth)/sign-in');
  };

  const next = () => {
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    if (step < STEP_COUNT - 1) {
      dirRef.current = 'fwd';
      setStep(step + 1);
    } else {
      finish();
    }
  };

  const back = () => {
    tap();
    if (step > 0) {
      dirRef.current = 'back';
      setStep(step - 1);
    }
  };

  // Skip never bypasses the whole flow — it fast-forwards to the
  // personalize step so even skippers make one small commitment before
  // the account wall (best-converting pattern). Hidden on the hook step
  // and on the final step (where the CTA itself finishes).
  const skip = () => {
    tap();
    dirRef.current = 'fwd';
    setStep(STEP_COUNT - 1);
  };

  // Benefit-led CTAs: each label sells the NEXT screen; the last one
  // ("Save my semester") hands off into the account wall's "Save your
  // semester, {name}" headline so the wall reads as completion, not a gate.
  const CTA_LABELS = ['Show me how', 'See what it finds', 'Make it mine', 'Save my semester'];
  const isLast = step === STEP_COUNT - 1;

  // CTA press micro-interaction.
  const ctaScale = useSharedValue(1);
  const ctaStyle = useAnimatedStyle(() => ({ transform: [{ scale: ctaScale.value }] }));

  const entering = (dirRef.current === 'fwd' ? SlideInRight : SlideInLeft).springify().damping(19).stiffness(160);
  const exiting = dirRef.current === 'fwd' ? SlideOutLeft.duration(220) : SlideOutRight.duration(220);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['top', 'bottom']}>
      {/* Soft brand glow for depth */}
      <View pointerEvents="none" style={[styles.glow, { backgroundColor: colors.brand, opacity: 0.06 }]} />

      {/* Top bar: brand + skip */}
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <View style={[styles.brandDot, { backgroundColor: colors.brand }]} />
          <Text style={[styles.brandWord, { color: colors.ink }]}>Semora</Text>
        </View>
        {step > 0 && !isLast ? (
          <TouchableOpacity onPress={skip} hitSlop={12} activeOpacity={0.7}>
            <Text style={[styles.skip, { color: colors.ink3 }]}>Skip</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Progress */}
      <View style={styles.progress}>
        {Array.from({ length: STEP_COUNT }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              { backgroundColor: colors.brand50 },
              i <= step && { backgroundColor: colors.brand },
            ]}
          />
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.stage}>
            {/* Keyed so the transition replays on every step change. */}
            <Animated.View key={step} entering={entering} exiting={exiting} style={styles.stepWrap}>
              {step === 0 && <Welcome colors={colors} />}
              {step === 1 && <Snap colors={colors} />}
              {step === 2 && <Extract colors={colors} />}
              {step === 3 && (
                <Personalize
                  colors={colors}
                  name={name}
                  setName={setName}
                  term={term}
                  setTerm={(t) => { setTerm(t); tap(); }}
                  termOptions={termOptions}
                />
              )}
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Footer */}
      <View style={styles.footer}>
        {step === 0 && (
          <Text style={[styles.reassure, { color: colors.ink3 }]}>Free to try · takes 30 seconds</Text>
        )}
        <Animated.View style={[{ width: '100%' }, ctaStyle]}>
          <TouchableOpacity
            style={[styles.cta, { backgroundColor: colors.brand }]}
            onPress={next}
            onPressIn={() => { ctaScale.value = withTiming(0.97, { duration: 90 }); }}
            onPressOut={() => { ctaScale.value = withTiming(1, { duration: 130 }); }}
            activeOpacity={0.9}
          >
            <Text style={styles.ctaText}>{CTA_LABELS[step]}</Text>
            <FontAwesome name="arrow-right" size={15} color="#fff" style={{ marginTop: 1 }} />
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

const EXTRACT_ROWS = [
  { color: 'coral' as const, title: 'Midterm Exam', date: 'Oct 14' },
  { color: 'brand' as const, title: 'Problem Set 3', date: 'Oct 21' },
  { color: 'teal' as const, title: 'Final Project', date: 'Dec 9' },
];

/** The "extracted deadlines" card — the product's payoff, reused as the
 *  Welcome hero (static) and the Extract step (staggered reveal). */
function ExtractCard({ colors, animated }: { colors: C; animated: boolean }) {
  // A light haptic as each row "arrives" — the AI reveal should be felt.
  useEffect(() => {
    if (!animated || Platform.OS !== 'ios') return;
    const timers = EXTRACT_ROWS.map((_, i) =>
      setTimeout(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); }, 380 + i * 230),
    );
    return () => timers.forEach(clearTimeout);
  }, [animated]);

  const rowColor = (k: 'coral' | 'brand' | 'teal') =>
    k === 'coral' ? colors.coral : k === 'teal' ? colors.teal : colors.brand;

  return (
    <View style={[styles.extractCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.extractHead}>
        <FontAwesome name="magic" size={13} color={colors.brand} />
        <Text style={[styles.extractHeadText, { color: colors.brand }]}>EXTRACTED FOR YOU · 3 OF 14</Text>
      </View>
      {EXTRACT_ROWS.map((r, i) => {
        const row = (
          <View style={[styles.row, i < EXTRACT_ROWS.length - 1 && { borderBottomColor: colors.line, borderBottomWidth: 0.5 }]}>
            <View style={[styles.rowDot, { backgroundColor: rowColor(r.color) }]} />
            <Text style={[styles.rowTitle, { color: colors.ink }]}>{r.title}</Text>
            <Text style={[styles.rowDate, { color: colors.ink3 }]}>{r.date}</Text>
          </View>
        );
        return animated ? (
          <Animated.View key={i} entering={FadeInDown.delay(320 + i * 230).springify().damping(16)}>
            {row}
          </Animated.View>
        ) : (
          <View key={i}>{row}</View>
        );
      })}
    </View>
  );
}

function Welcome({ colors }: { colors: C }) {
  return (
    <View style={styles.stepPad}>
      <Animated.Text entering={FadeInDown.duration(420)} style={[styles.kicker, { color: colors.brand }]}>
        WELCOME TO SEMORA
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(80).duration(420)} style={[styles.display, { color: colors.ink }]}>
        Your semester,{'\n'}organized in{'\n'}one snap.
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(160).duration(420)} style={[styles.lead, { color: colors.ink2 }]}>
        Turn any syllabus into a calendar of every deadline — in seconds, without typing a thing.
      </Animated.Text>
      {/* The payoff, shown before we ask for anything. */}
      <Animated.View entering={FadeInDown.delay(280).duration(480)} style={styles.heroCardWrap}>
        <View pointerEvents="none" style={{ transform: [{ scale: 0.88 }, { rotate: '-3deg' }] }}>
          <ExtractCard colors={colors} animated={false} />
        </View>
      </Animated.View>
    </View>
  );
}

function Snap({ colors }: { colors: C }) {
  // The wow moment: a glowing beam sweeps the page, "reading" it.
  const beam = useSharedValue(0);
  useEffect(() => {
    beam.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: 500 }), // hold at the bottom
        withTiming(0, { duration: 0 }),   // jump back, then sweep again
        withTiming(0, { duration: 350 }),
      ),
      -1,
    );
  }, []);
  const beamStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: beam.value * BEAM_TRAVEL }],
  }));
  // Tinted "read so far" wash that follows the beam down the page.
  const readStyle = useAnimatedStyle(() => ({
    height: 24 + beam.value * BEAM_TRAVEL,
  }));

  return (
    <View style={styles.stepPad}>
      <View style={styles.artWrap}>
        <View style={[styles.paperBack, { backgroundColor: colors.brand50 }]} />
        <View style={[styles.paper, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={[styles.pLine, { backgroundColor: colors.ink, width: '55%', height: 9 }]} />
          <View style={[styles.pLine, { backgroundColor: colors.line, width: '85%' }]} />
          <View style={[styles.pLine, { backgroundColor: colors.line, width: '70%' }]} />
          <View style={[styles.pLine, { backgroundColor: colors.line, width: '80%' }]} />
          <View style={[styles.pLine, { backgroundColor: colors.line, width: '40%' }]} />
          <Animated.View pointerEvents="none" style={[styles.readWash, { backgroundColor: colors.brand }, readStyle]} />
          <Animated.View pointerEvents="none" style={[styles.beamWrap, beamStyle]}>
            <LinearGradient
              colors={['rgba(107,70,193,0)', 'rgba(107,70,193,0.30)', '#6B46C1', 'rgba(107,70,193,0.30)', 'rgba(107,70,193,0)']}
              style={styles.beam}
            />
          </Animated.View>
        </View>
      </View>
      <Text style={[styles.display2, { color: colors.ink }]}>Snap your syllabus</Text>
      <Text style={[styles.lead, { color: colors.ink2 }]}>
        A photo, a PDF, or a screenshot. Semora reads it the way you would — only faster.
      </Text>
    </View>
  );
}

function Extract({ colors }: { colors: C }) {
  return (
    <View style={styles.stepPad}>
      <View style={styles.artWrap}>
        <Animated.View entering={FadeInDown.duration(360)}>
          <ExtractCard colors={colors} animated />
        </Animated.View>
      </View>
      <Text style={[styles.display2, { color: colors.ink }]}>Every date,{'\n'}found for you</Text>
      <Text style={[styles.lead, { color: colors.ink2 }]}>
        Assignments, quizzes, and exams — sorted into your term, with reminders before each one.
      </Text>
    </View>
  );
}

function Personalize({
  colors, name, setName, term, setTerm, termOptions,
}: {
  colors: C; name: string; setName: (v: string) => void;
  term: string; setTerm: (v: string) => void; termOptions: string[];
}) {
  return (
    <View style={styles.stepPad}>
      <Text style={[styles.display2, { color: colors.ink }]}>Let{'’'}s make it yours</Text>
      <Text style={[styles.lead, { color: colors.ink2, marginBottom: 28 }]}>
        A couple of details so Semora feels like home.
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

      <Text style={[styles.fieldLabel, { color: colors.ink3, marginTop: 30 }]}>WHICH TERM ARE YOU STARTING?</Text>
      <View style={styles.chipWrap}>
        {termOptions.map((t) => {
          const active = t === term;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => setTerm(t)}
              activeOpacity={0.8}
              style={[
                styles.chip,
                { borderColor: colors.line, backgroundColor: colors.card },
                active && { backgroundColor: colors.brand, borderColor: colors.brand },
              ]}
            >
              <Text style={[styles.chipText, { color: active ? '#fff' : colors.ink2 }]}>{t}</Text>
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
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 4, height: 40 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandDot: { width: 10, height: 10, borderRadius: 3 },
  brandWord: { fontFamily: FONTS.displaySemibold, fontSize: 18 },
  skip: { fontSize: 15, fontWeight: '600' },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 24, marginTop: 14 },
  bar: { flex: 1, height: 4, borderRadius: 999 },
  // Top-anchored (not centered) so steps share an optical top line and the
  // composition doesn't float in Pro-Max-sized voids.
  stage: { flex: 1, paddingHorizontal: 28 },
  stepWrap: { flex: 1, paddingTop: 30 },
  stepPad: { paddingVertical: 8 },

  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 18 },
  display: { fontFamily: FONTS.display, fontSize: 42, lineHeight: 46, letterSpacing: -1 },
  display2: { fontFamily: FONTS.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.6, marginTop: 8 },
  lead: { fontSize: 16.5, lineHeight: 25, marginTop: 18, maxWidth: 360 },
  heroCardWrap: { alignItems: 'center', marginTop: 30 },

  // Art
  artWrap: { height: 244, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  paperBack: { position: 'absolute', width: PAPER_W - 4, height: PAPER_H - 4, borderRadius: 18, transform: [{ rotate: '-8deg' }] },
  paper: {
    width: PAPER_W, height: PAPER_H, borderRadius: 18, borderWidth: 0.5, padding: 20, gap: 12,
    transform: [{ rotate: '4deg' }], overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 6,
  },
  pLine: { height: 7, borderRadius: 4 },
  readWash: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0.05 },
  beamWrap: { position: 'absolute', left: 0, right: 0, top: 0 },
  beam: { height: 36 },

  extractCard: {
    width: 290, borderRadius: 20, borderWidth: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 6,
  },
  extractHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  extractHeadText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowDot: { width: 9, height: 9, borderRadius: 5 },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: '500' },
  rowDate: { fontSize: 13, fontWeight: '600' },

  // Personalize
  fieldLabel: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1.4, marginBottom: 10 },
  input: { fontSize: 22, fontFamily: FONTS.displaySemibold, paddingVertical: 8, borderBottomWidth: 1.5 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: 14, borderWidth: 1 },
  chipText: { fontSize: 15, fontWeight: '600' },

  // Footer
  footer: { paddingHorizontal: 24, paddingBottom: 10, alignItems: 'center', gap: 4 },
  reassure: { fontSize: 12.5, fontWeight: '500', marginBottom: 8 },
  cta: { flexDirection: 'row', height: 56, width: '100%', borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 9 },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  backBtn: { height: 38, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600' },
});
