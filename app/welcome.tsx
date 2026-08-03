import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { COLORS, FONTS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import {
  AUTH_INK_DEEP as INK_DEEP,
  AUTH_GLOW_LIGHT as GLOW_LIGHT,
  AUTH_GLOW_MID as GLOW_MID,
  GrainOverlay,
  CursorSpotlight,
} from '@/components/WebAuthChrome';

type C = ReturnType<typeof useColors>;

const RESULT_ROWS = [
  { color: 'coral' as const, title: 'Midterm Exam', date: 'Oct 14' },
  { color: 'brand' as const, title: 'Problem Set 3', date: 'Oct 21' },
  { color: 'blue' as const, title: 'Group Presentation', date: 'Nov 4' },
];

function rowColor(colors: C, k: 'coral' | 'brand' | 'blue') {
  return k === 'coral' ? colors.coral : k === 'blue' ? colors.blue : colors.brand;
}

const FACT_CHIPS = [
  { icon: 'refresh', text: 'Synced with your iPhone in real time' },
  { icon: 'unlock-alt', text: '5 free syllabus scans a month' },
  { icon: 'graduation-cap', text: 'Works with Canvas' },
];

const STEPS = [
  { icon: 'camera', title: 'Scan or paste your syllabus', body: 'Snap a photo, upload a PDF, drag one in, or paste the text straight from a PDF or your LMS page.' },
  { icon: 'magic', title: 'Semora builds your semester', body: 'Every deadline, exam, grading weight, and class meeting — pulled out and organized automatically.' },
  { icon: 'check-circle', title: 'Stay on top of it', body: 'Reminders before things are due, a study planner, and a real-time grade forecast as the semester goes.' },
] as const;

const SPOTLIGHT_FEATURES = [
  { icon: 'line-chart', title: 'Grades that update themselves', body: 'Enter a score and your grade, GPA, and semester forecast recalculate instantly — across every course.' },
  { icon: 'bolt', title: 'A study plan that adapts to you', body: 'Semora turns your deadlines into a realistic, timed schedule — and reshuffles it the moment something changes.' },
] as const;

const GRID_FEATURES = [
  { icon: 'calendar', title: 'Deadlines & calendar', body: 'Every assignment and exam, synced to your device calendar.' },
  { icon: 'clone', title: 'Flashcards', body: 'Spaced-repetition cards built from your own material.' },
  { icon: 'clock-o', title: 'Focus timer', body: 'A Pomodoro timer built into your task list.' },
  { icon: 'comments-o', title: 'AI tutor', body: 'Ask questions and get help that knows your syllabus.' },
  { icon: 'users', title: 'Course collaboration', body: 'Share a course with classmates, kept in sync.' },
  { icon: 'graduation-cap', title: 'Canvas sync', body: 'Connect Canvas and pull in assignments automatically.' },
] as const;

const FAQ = [
  {
    q: 'Is Semora free?',
    a: 'Yes. The core app — scanning syllabi, tracking deadlines, grades, and your calendar — is free. Pro adds unlimited scans and courses, the smart study planner, flashcards, focus timer, AI tutor, and advanced reminders.',
  },
  {
    q: 'What does Pro cost?',
    a: '$3.99/month or $19.99/year, purchased in the iPhone app. Once you\'re Pro, it applies to your account everywhere — including here on the web.',
  },
  {
    q: 'Can I subscribe from the browser?',
    a: 'Not yet — Pro is purchased in the iPhone app. On the web you can sign in, use every free feature, and your Pro status (if you have it) applies automatically.',
  },
  {
    q: 'Does it sync with my phone?',
    a: 'Yes. Web and the iPhone app share the same account — a task, course, or grade you add on one shows up on the other in real time.',
  },
  {
    q: 'Does it work with Canvas?',
    a: 'Yes — connect your Canvas account with a personal access token and Semora pulls in your assignments. You can also just scan or paste a syllabus with no LMS at all.',
  },
  {
    q: 'Is my data private?',
    a: 'Your course and task data is yours and isn\'t shared. See the full privacy policy for details.',
  },
] as const;

// Scroll-reveal: fades + slides a section up once it enters the viewport.
// Web-only (IntersectionObserver) — this route is never reached on native.
function Reveal({ children, style, delayMs = 0 }: { children: ReactNode; style?: any; delayMs?: number }) {
  const ref = useRef<View>(null);
  const [visible, setVisible] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <View
      ref={ref}
      style={[
        style,
        Platform.OS === 'web' && ({
          opacity: visible ? 1 : 0,
          transform: [{ translateY: visible ? 0 : 22 }],
          transitionProperty: 'opacity, transform',
          transitionDuration: '700ms',
          transitionDelay: `${delayMs}ms`,
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
        } as any),
      ]}
    >
      {children}
    </View>
  );
}

function HoverCard({ children, style }: { children: ReactNode; style?: any }) {
  const [hovered, setHovered] = useState(false);
  return (
    <View
      // @ts-ignore — web-only pointer events, harmless no-op elsewhere
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={[
        style,
        Platform.OS === 'web' && ({
          transitionProperty: 'transform, box-shadow, border-color',
          transitionDuration: '220ms',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          transform: hovered ? [{ translateY: -4 }] : [{ translateY: 0 }],
        } as any),
        hovered && Platform.OS === 'web' && ({
          boxShadow: '0 1px 2px rgba(17,17,17,0.04), 0 24px 48px rgba(107,70,193,0.16)',
        } as any),
      ]}
    >
      {children}
    </View>
  );
}

function FaqRow({ item, colors }: { item: (typeof FAQ)[number]; colors: C }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity
      style={[styles.faqRow, { borderBottomColor: colors.line }]}
      onPress={() => setOpen((v) => !v)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
    >
      <View style={styles.faqQRow}>
        <Text style={[styles.faqQ, { color: colors.ink }]}>{item.q}</Text>
        <FontAwesome name={open ? 'minus' : 'plus'} size={13} color={colors.brand} />
      </View>
      {open && <Text style={[styles.faqA, { color: colors.ink3 }]}>{item.a}</Text>}
    </TouchableOpacity>
  );
}

export default function WelcomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { contentMaxWidth, isWide } = useResponsive();

  const getStarted = () => router.push('/(auth)/sign-in' as any);
  const goToSignIn = () => router.push({ pathname: '/(auth)/sign-in', params: { mode: 'signin' } } as any);
  const glowStyle = Platform.select({
    web: { animationName: 'semoraGlowPulse', animationDuration: '6s', animationIterationCount: 'infinite', animationTimingFunction: 'ease-in-out' },
    default: {},
  }) as any;
  // Continuous float, applied to a plain View wrapping the mock card (not the
  // same node as its Animated.View entrance) so the one-time entrance
  // transform and this looping CSS animation never fight over the same
  // element's transform property.
  const floatStyle = Platform.select({
    web: { animationName: 'semoraFloat', animationDuration: '5s', animationIterationCount: 'infinite', animationTimingFunction: 'ease-in-out' },
    default: {},
  }) as any;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* ── Hero (dark, cinematic) ─────────────────────────────── */}
        <View style={styles.heroBand}>
          <View
            style={[styles.glowOrb, styles.glowOrbA, glowStyle, { backgroundColor: GLOW_MID }]}
            pointerEvents="none"
          />
          <View
            style={[styles.glowOrb, styles.glowOrbB, glowStyle, { backgroundColor: GLOW_LIGHT, animationDelay: Platform.OS === 'web' ? '-3s' : undefined } as any]}
            pointerEvents="none"
          />
          <View
            style={[styles.glowOrb, styles.glowOrbD, glowStyle, { backgroundColor: GLOW_LIGHT, animationDelay: Platform.OS === 'web' ? '-1.5s' : undefined } as any]}
            pointerEvents="none"
          />
          <CursorSpotlight />
          <GrainOverlay />

          {/* Nav */}
          <View style={[styles.navRow, { maxWidth: 1100, alignSelf: 'center', width: '100%' }]}>
            <View style={styles.navBrand}>
              <View style={[styles.navMark, { backgroundColor: colors.brand }]}>
                <Text style={styles.navMarkText}>S</Text>
              </View>
              <Text style={styles.navName}>Semora</Text>
            </View>
            <TouchableOpacity onPress={goToSignIn} accessibilityRole="link" accessibilityLabel="Sign in">
              <Text style={styles.navSignIn}>Sign in</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.hero, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
            <Animated.Text entering={FadeInDown.duration(500)} style={styles.kicker}>
              WELCOME TO SEMORA
            </Animated.Text>
            <Animated.Text
              entering={FadeInDown.delay(90).duration(550)}
              style={[styles.display, isWide && styles.displayWide]}
            >
              Your semester,{'\n'}
              <Text style={[styles.gradientWord, isWide && styles.displayWide]}>organized</Text> in one snap.
            </Animated.Text>
            <Animated.Text
              entering={FadeInDown.delay(200).duration(550)}
              style={[styles.lead, isWide && { maxWidth: 640 }]}
            >
              Turn any syllabus — a photo, a PDF, or pasted text — into a calendar of every deadline. In seconds, without typing a thing.
            </Animated.Text>
            <Animated.View entering={FadeInDown.delay(320).duration(550)}>
              <TouchableOpacity
                style={styles.ctaBtn}
                onPress={getStarted}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Get started free"
              >
                <Text style={styles.ctaBtnText}>Get started free</Text>
                <FontAwesome name="arrow-right" size={15} color={INK_DEEP} />
              </TouchableOpacity>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(420).duration(550)} style={styles.chipRow}>
              {FACT_CHIPS.map((c) => (
                <View key={c.text} style={styles.factChip}>
                  <FontAwesome name={c.icon as any} size={11} color={GLOW_LIGHT} />
                  <Text style={styles.factChipText}>{c.text}</Text>
                </View>
              ))}
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(520).duration(600)} style={{ width: '100%', maxWidth: 360 }}>
              <View style={[styles.mockCard, floatStyle]}>
                <View style={styles.mockHead}>
                  <FontAwesome name="magic" size={13} color={GLOW_LIGHT} />
                  <Text style={styles.mockHeadText}>EXTRACTED FOR YOU</Text>
                </View>
                {RESULT_ROWS.map((r, i) => (
                  <View key={i} style={[styles.mockRow, i < RESULT_ROWS.length - 1 && styles.mockRowBorder]}>
                    <View style={[styles.mockDot, { backgroundColor: rowColor(colors, r.color) }]} />
                    <Text style={styles.mockRowTitle}>{r.title}</Text>
                    <Text style={styles.mockRowDate}>{r.date}</Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          </View>
        </View>

        {/* ── How it works ───────────────────────────────────────── */}
        <View style={[styles.section, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
          <Reveal><Text style={[styles.sectionTitle, { color: colors.ink }]}>How it works</Text></Reveal>
          <View style={[styles.stepsRow, isWide && styles.stepsRowWide]}>
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delayMs={i * 90} style={[styles.stepCard, isWide && { flexBasis: '31%' }]}>
                <View style={[styles.stepNum, { backgroundColor: colors.brand50 }]}>
                  <Text style={[styles.stepNumText, { color: colors.brand }]}>{i + 1}</Text>
                </View>
                <FontAwesome name={s.icon as any} size={18} color={colors.brand} style={{ marginBottom: 8 }} />
                <Text style={[styles.stepTitle, { color: colors.ink }]}>{s.title}</Text>
                <Text style={[styles.stepBody, { color: colors.ink3 }]}>{s.body}</Text>
              </Reveal>
            ))}
          </View>
        </View>

        {/* ── Feature spotlight + grid (bento) ───────────────────── */}
        <View style={[styles.section, { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>
          <Reveal><Text style={[styles.sectionTitle, { color: colors.ink }]}>Everything you need this semester</Text></Reveal>

          <View style={[styles.spotlightRow, isWide && styles.spotlightRowWide]}>
            {SPOTLIGHT_FEATURES.map((f, i) => (
              <Reveal key={f.title} delayMs={i * 100} style={[styles.spotlightCard, isWide && { flexBasis: '48%' }]}>
                <HoverCard style={[styles.spotlightInner, { backgroundColor: colors.card, borderColor: colors.line }]}>
                  <View style={[styles.spotlightIcon, { backgroundColor: colors.brand50 }]}>
                    <FontAwesome name={f.icon as any} size={20} color={colors.brand} />
                  </View>
                  <Text style={[styles.spotlightTitle, { color: colors.ink }]}>{f.title}</Text>
                  <Text style={[styles.spotlightBody, { color: colors.ink3 }]}>{f.body}</Text>
                </HoverCard>
              </Reveal>
            ))}
          </View>

          <View style={styles.featureGrid}>
            {GRID_FEATURES.map((f, i) => (
              <Reveal
                key={f.title}
                delayMs={i * 60}
                style={[styles.featureCardWrap, isWide && { flexBasis: '31%' }]}
              >
                <HoverCard style={[styles.featureCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
                  <View style={[styles.featureIcon, { backgroundColor: colors.brand50 }]}>
                    <FontAwesome name={f.icon as any} size={16} color={colors.brand} />
                  </View>
                  <Text style={[styles.featureTitle, { color: colors.ink }]}>{f.title}</Text>
                  <Text style={[styles.featureBody, { color: colors.ink3 }]}>{f.body}</Text>
                </HoverCard>
              </Reveal>
            ))}
          </View>
        </View>

        {/* ── FAQ ─────────────────────────────────────────────────── */}
        <View style={[styles.section, { maxWidth: 760, alignSelf: 'center', width: '100%' }]}>
          <Reveal><Text style={[styles.sectionTitle, { color: colors.ink }]}>Questions</Text></Reveal>
          <Reveal delayMs={80} style={{ gap: 0 }}>
            {FAQ.map((item) => <FaqRow key={item.q} item={item} colors={colors} />)}
          </Reveal>
        </View>

        {/* ── Final CTA (dark, bookends the hero) ────────────────── */}
        <View style={styles.finalCta}>
          <View style={[styles.glowOrb, styles.glowOrbC, glowStyle, { backgroundColor: GLOW_MID }]} pointerEvents="none" />
          <GrainOverlay />
          <Reveal style={{ alignItems: 'center', width: '100%' }}>
            <Text style={styles.finalCtaTitle}>Ready to get your semester together?</Text>
            <TouchableOpacity
              style={styles.ctaBtn}
              onPress={getStarted}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Get started free"
            >
              <Text style={styles.ctaBtnText}>Get started free</Text>
              <FontAwesome name="arrow-right" size={15} color={INK_DEEP} />
            </TouchableOpacity>
          </Reveal>
        </View>

        {/* ── Footer ──────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.ink3 }]}>© {new Date().getFullYear()} Semora</Text>
          <View style={styles.footerLinks}>
            <Text
              style={[styles.footerLink, { color: colors.ink3 }]}
              onPress={() => { if (Platform.OS === 'web') window.open('https://semoraai.com/terms', '_blank'); }}
            >
              Terms
            </Text>
            <Text
              style={[styles.footerLink, { color: colors.ink3 }]}
              onPress={() => { if (Platform.OS === 'web') window.open('https://semoraai.com/privacy', '_blank'); }}
            >
              Privacy
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const glassCard = Platform.select({
  web: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
  },
  default: { backgroundColor: 'rgba(255,255,255,0.08)' },
}) as any;

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },

  heroBand: {
    backgroundColor: INK_DEEP,
    paddingBottom: 56,
    overflow: 'hidden',
    position: 'relative',
  },
  glowOrb: {
    position: 'absolute',
    borderRadius: 999,
    ...Platform.select({ web: { filter: 'blur(70px)' }, default: {} }),
  } as any,
  glowOrbA: { width: 380, height: 380, top: -140, right: -80, opacity: 0.6 },
  glowOrbB: { width: 260, height: 260, top: 120, left: -100, opacity: 0.4 },
  glowOrbC: { width: 340, height: 340, top: -120, left: '50%', marginLeft: -170, opacity: 0.5 },
  glowOrbD: { width: 160, height: 160, bottom: -40, right: '18%', opacity: 0.35 },

  navRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 18,
  },
  navBrand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  navMark: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  navMarkText: { color: '#fff', fontFamily: FONTS.display, fontSize: 16 },
  navName: { fontFamily: FONTS.displaySemibold, fontSize: 17, color: '#fff' },
  navSignIn: { fontSize: 14, fontWeight: '700', color: GLOW_LIGHT },

  hero: { paddingHorizontal: 20, paddingTop: 28, alignItems: 'flex-start' },
  kicker: { fontSize: 13, fontWeight: '700', letterSpacing: 1.4, color: GLOW_LIGHT },
  display: {
    fontFamily: FONTS.displayItalic, fontSize: 40, lineHeight: 46,
    letterSpacing: -0.5, marginTop: 12, color: '#fff',
  },
  displayWide: { fontSize: 68, lineHeight: 74 },
  gradientWord: Platform.select({
    web: {
      backgroundImage: `linear-gradient(90deg, ${GLOW_LIGHT}, ${GLOW_MID})`,
      backgroundClip: 'text',
      WebkitBackgroundClip: 'text',
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
    },
    default: { color: GLOW_LIGHT },
  }) as any,
  lead: { fontSize: 16, lineHeight: 24, marginTop: 16, color: 'rgba(255,255,255,0.72)' },

  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, height: 52,
    paddingHorizontal: 26, borderRadius: 14, marginTop: 26,
    backgroundColor: '#fff',
    ...Platform.select({ web: { boxShadow: `0 12px 32px rgba(155,122,232,0.35)` }, default: {} }),
  } as any,
  ctaBtnText: { color: INK_DEEP, fontSize: 16, fontWeight: '700' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 22 },
  factChip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    ...glassCard,
  },
  factChipText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.82)' },

  mockCard: {
    borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', padding: 14, marginTop: 36,
    width: '100%', maxWidth: 360,
    ...glassCard,
    ...Platform.select({ web: { boxShadow: '0 30px 60px rgba(0,0,0,0.35)' }, default: {} }),
  } as any,
  mockHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  mockHeadText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: GLOW_LIGHT },
  mockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  mockRowBorder: { borderBottomColor: 'rgba(255,255,255,0.1)', borderBottomWidth: 0.5 },
  mockDot: { width: 7, height: 7, borderRadius: 3.5 },
  mockRowTitle: { flex: 1, fontSize: 14, fontWeight: '500', color: '#fff' },
  mockRowDate: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.6)' },

  section: { paddingHorizontal: 20, paddingVertical: 40 },
  sectionTitle: { fontFamily: FONTS.displaySemibold, fontSize: 28, letterSpacing: -0.3, marginBottom: 26 },

  stepsRow: { gap: 16 },
  stepsRowWide: { flexDirection: 'row', gap: 20 },
  stepCard: { flex: 1 },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  stepNumText: { fontSize: 12, fontWeight: '800' },
  stepTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  stepBody: { fontSize: 14, lineHeight: 20 },

  spotlightRow: { gap: 16, marginBottom: 16 },
  spotlightRowWide: { flexDirection: 'row' },
  spotlightCard: { flex: 1 },
  spotlightInner: { borderRadius: 20, borderWidth: 0.5, padding: 22 },
  spotlightIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  spotlightTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  spotlightBody: { fontSize: 14.5, lineHeight: 21 },

  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  featureCardWrap: { flexBasis: '100%' },
  featureCard: { borderRadius: 16, borderWidth: 0.5, padding: 16, height: '100%' },
  featureIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  featureTitle: { fontSize: 14.5, fontWeight: '700', marginBottom: 4 },
  featureBody: { fontSize: 13, lineHeight: 18 },

  faqRow: { paddingVertical: 18, borderBottomWidth: 0.5 },
  faqQRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  faqQ: { flex: 1, fontSize: 15, fontWeight: '700' },
  faqA: { fontSize: 14, lineHeight: 20, marginTop: 10 },

  finalCta: {
    backgroundColor: INK_DEEP, paddingHorizontal: 20, paddingVertical: 64,
    alignItems: 'center', overflow: 'hidden', position: 'relative',
  },
  finalCtaTitle: {
    fontFamily: FONTS.displaySemibold, fontSize: 26, color: '#fff',
    textAlign: 'center', marginBottom: 22, maxWidth: 480,
  },

  footer: { paddingHorizontal: 20, paddingVertical: 28, alignItems: 'center', gap: 10 },
  footerText: { fontSize: 12.5 },
  footerLinks: { flexDirection: 'row', gap: 18 },
  footerLink: { fontSize: 12.5, fontWeight: '600', textDecorationLine: 'underline' },
});
