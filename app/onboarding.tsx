import { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Platform, KeyboardAvoidingView, Keyboard, TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useColors } from '@/lib/theme';
import { FONTS } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';

const STEP_COUNT = 4;

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
    tap();
    Keyboard.dismiss();
    if (step < STEP_COUNT - 1) setStep(step + 1);
    else finish();
  };

  const back = () => { tap(); if (step > 0) setStep(step - 1); };

  const isLast = step === STEP_COUNT - 1;
  const ctaLabel = isLast ? 'Get started' : step === 0 ? 'Get started' : 'Continue';

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['top', 'bottom']}>
      {/* Soft brand glow for depth */}
      <View pointerEvents="none" style={[styles.glow, { backgroundColor: colors.brand, opacity: 0.06 }]} />

      {/* Top bar: brand + skip */}
      <View style={styles.topBar}>
        <Animated.View entering={FadeIn.duration(500)} style={styles.brandRow}>
          <View style={[styles.brandDot, { backgroundColor: colors.brand }]} />
          <Text style={[styles.brandWord, { color: colors.ink }]}>Semora</Text>
        </Animated.View>
        <TouchableOpacity onPress={finish} hitSlop={12} activeOpacity={0.7}>
          <Text style={[styles.skip, { color: colors.ink3 }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* Progress */}
      <View style={styles.progress}>
        {Array.from({ length: STEP_COUNT }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              { backgroundColor: colors.line },
              i <= step && { backgroundColor: colors.brand },
            ]}
          />
        ))}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.stage}>
            {/* Keyed so the entrance animation replays on every step change. */}
            <Animated.View key={step} entering={FadeInDown.duration(480)} style={{ flex: 1, justifyContent: 'center' }}>
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
        <TouchableOpacity
          style={[styles.cta, { backgroundColor: colors.brand }]}
          onPress={next}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>{ctaLabel}</Text>
          <FontAwesome name="arrow-right" size={14} color="#fff" />
        </TouchableOpacity>
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

function Welcome({ colors }: { colors: C }) {
  return (
    <View style={styles.stepPad}>
      <Text style={[styles.kicker, { color: colors.brand }]}>WELCOME TO SEMORA</Text>
      <Text style={[styles.display, { color: colors.ink }]}>
        Your semester,{'\n'}organized in{'\n'}one snap.
      </Text>
      <Text style={[styles.lead, { color: colors.ink2 }]}>
        Turn any syllabus into a calendar of every deadline — in seconds, without typing a thing.
      </Text>
    </View>
  );
}

function Snap({ colors }: { colors: C }) {
  return (
    <View style={styles.stepPad}>
      <View style={styles.artWrap}>
        {/* A tilted "syllabus" page, scanned. */}
        <View style={[styles.paperBack, { backgroundColor: colors.brand50 }]} />
        <View style={[styles.paper, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={[styles.pLine, { backgroundColor: colors.ink, width: '55%', height: 9 }]} />
          <View style={[styles.pLine, { backgroundColor: colors.line, width: '85%' }]} />
          <View style={[styles.pLine, { backgroundColor: colors.line, width: '70%' }]} />
          <View style={[styles.pLine, { backgroundColor: colors.line, width: '80%' }]} />
          <View style={[styles.pLine, { backgroundColor: colors.line, width: '40%' }]} />
          <View style={[styles.scanBeam, { backgroundColor: colors.brand }]} />
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
  const rows = [
    { c: colors.coral, t: 'Midterm Exam', d: 'Oct 14' },
    { c: colors.brand, t: 'Problem Set 3', d: 'Oct 21' },
    { c: colors.teal, t: 'Final Project', d: 'Dec 9' },
  ];
  return (
    <View style={styles.stepPad}>
      <View style={styles.artWrap}>
        <View style={[styles.extractCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={styles.extractHead}>
            <FontAwesome name="magic" size={13} color={colors.brand} />
            <Text style={[styles.extractHeadText, { color: colors.brand }]}>EXTRACTED FOR YOU</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={[styles.row, i < rows.length - 1 && { borderBottomColor: colors.line, borderBottomWidth: 0.5 }]}>
              <View style={[styles.rowDot, { backgroundColor: r.c }]} />
              <Text style={[styles.rowTitle, { color: colors.ink }]}>{r.t}</Text>
              <Text style={[styles.rowDate, { color: colors.ink3 }]}>{r.d}</Text>
            </View>
          ))}
        </View>
      </View>
      <Text style={[styles.display2, { color: colors.ink }]}>Every date, found for you</Text>
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
      <Text style={[styles.display2, { color: colors.ink }]}>Let's make it yours</Text>
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
  bar: { flex: 1, height: 3, borderRadius: 2 },
  stage: { flex: 1, paddingHorizontal: 28 },
  stepPad: { paddingVertical: 8 },

  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 2, marginBottom: 18 },
  display: { fontFamily: FONTS.display, fontSize: 44, lineHeight: 48, letterSpacing: -1 },
  display2: { fontFamily: FONTS.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.6, marginTop: 8 },
  lead: { fontSize: 16.5, lineHeight: 25, marginTop: 18, maxWidth: 360 },

  // Art
  artWrap: { height: 230, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  paperBack: { position: 'absolute', width: 168, height: 200, borderRadius: 18, transform: [{ rotate: '-8deg' }] },
  paper: {
    width: 172, height: 204, borderRadius: 18, borderWidth: 0.5, padding: 20, gap: 12,
    transform: [{ rotate: '4deg' }], overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 6,
  },
  pLine: { height: 7, borderRadius: 4 },
  scanBeam: { position: 'absolute', left: 0, right: 0, top: '52%', height: 2, opacity: 0.7 },

  extractCard: {
    width: 290, borderRadius: 20, borderWidth: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 20, elevation: 6,
  },
  extractHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  extractHeadText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
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
  cta: { flexDirection: 'row', height: 56, width: '100%', borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 9 },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  backBtn: { height: 38, justifyContent: 'center' },
  backText: { fontSize: 15, fontWeight: '600' },
});
