import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/lib/constants';
import { useColors } from '@/lib/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const WIDGET_W = SCREEN_W - 80; // mimic real widget width

// ── Realistic Widget Previews ──────────────────────────────

function TodayWidgetPreview() {
  const colors = useColors();
  const tasks = [
    { color: '#6366f1', title: 'Essay Draft', course: 'ENG 201', time: '11:59 PM' },
    { color: '#ef4444', title: 'Ch. 5 Problems', course: 'MATH 301', time: '5:00 PM' },
    { color: '#10b981', title: 'Lab Report', course: 'BIO 150', time: '11:59 PM' },
  ];
  return (
    <View style={wp.container}>
      <View style={wp.glass}>
        <View style={wp.header}>
          <FontAwesome name="sun-o" size={12} color={colors.brand} />
          <Text style={[wp.headerTitle, { color: colors.ink }]}>Today</Text>
          <Text style={[wp.headerBadge, { color: colors.ink3, backgroundColor: colors.paper }]}>3 tasks</Text>
        </View>
        {tasks.map((t, i) => (
          <View key={i} style={[wp.taskRow, i < tasks.length - 1 && wp.taskBorder]}>
            <View style={[wp.dot, { backgroundColor: t.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={[wp.taskTitle, { color: colors.ink }]}>{t.title}</Text>
              <Text style={[wp.taskCourse, { color: colors.ink3 }]}>{t.course}</Text>
            </View>
            <Text style={[wp.taskTime, { color: colors.ink3 }]}>{t.time}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function WeekWidgetPreview() {
  const colors = useColors();
  const days = [
    { day: 'Mon', count: 2, items: ['Quiz 3', 'Reading'] },
    { day: 'Wed', count: 1, items: ['Midterm'] },
    { day: 'Fri', count: 3, items: ['Project', 'HW 7', 'Essay'] },
  ];
  return (
    <View style={wp.container}>
      <View style={wp.glass}>
        <View style={wp.header}>
          <FontAwesome name="calendar" size={12} color={colors.coral} />
          <Text style={[wp.headerTitle, { color: colors.ink }]}>This Week</Text>
          <Text style={[wp.headerBadge, { color: colors.ink3, backgroundColor: colors.paper }]}>6 due</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          {days.map((d, i) => (
            <View key={i} style={wp.dayCol}>
              <Text style={[wp.dayLabel, { color: colors.ink3 }]}>{d.day}</Text>
              <View style={wp.dayBar}>
                {d.items.map((item, j) => (
                  <View key={j} style={[wp.dayChip, { backgroundColor: j === 0 ? '#6366f1' : j === 1 ? '#ef4444' : '#10b981' }]}>
                    <Text style={wp.dayChipText} numberOfLines={1}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function GradeWidgetPreview() {
  const colors = useColors();
  const grades = [
    { course: 'ENG 201', pct: 94, letter: 'A', color: '#6366f1' },
    { course: 'MATH 301', pct: 87, letter: 'B+', color: '#ef4444' },
    { course: 'BIO 150', pct: 91, letter: 'A-', color: '#10b981' },
  ];
  return (
    <View style={wp.container}>
      <View style={wp.glass}>
        <View style={wp.header}>
          <FontAwesome name="bar-chart" size={12} color={colors.teal} />
          <Text style={[wp.headerTitle, { color: colors.ink }]}>Grades</Text>
        </View>
        {grades.map((g, i) => (
          <View key={i} style={[wp.gradeRow, i < grades.length - 1 && wp.taskBorder]}>
            <View style={[wp.gradeDot, { backgroundColor: g.color }]} />
            <Text style={[wp.gradeCourse, { color: colors.ink }]}>{g.course}</Text>
            <View style={wp.gradeBarTrack}>
              <View style={[wp.gradeBarFill, { width: `${g.pct}%`, backgroundColor: g.color }]} />
            </View>
            <Text style={[wp.gradeLetter, { color: colors.ink }]}>{g.letter}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function QuickAddWidgetPreview() {
  const colors = useColors();
  return (
    <View style={[wp.container, { alignSelf: 'flex-start', width: (WIDGET_W - 12) / 2 }]}>
      <View style={[wp.glass, { alignItems: 'center', paddingVertical: 20 }]}>
        <View style={[wp.quickAddCircle, { backgroundColor: colors.brand, shadowColor: colors.brand }]}>
          <FontAwesome name="plus" size={22} color="#fff" />
        </View>
        <Text style={[wp.headerTitle, { marginTop: 8, color: colors.ink }]}>Quick Add</Text>
        <Text style={[wp.taskCourse, { textAlign: 'center', color: colors.ink3 }]}>Tap to add a task</Text>
      </View>
    </View>
  );
}

// ── Widget Showcase Cards ──────────────────────────────────

const WIDGETS = [
  {
    name: 'Today Tasks',
    subtitle: 'See what\u2019s due at a glance',
    sizes: 'Small \u00b7 Medium',
    gradient: ['#6B46C1', '#9F7AEA'] as [string, string],
    Preview: TodayWidgetPreview,
  },
  {
    name: 'Due This Week',
    subtitle: 'Plan your week ahead',
    sizes: 'Medium \u00b7 Large',
    gradient: ['#D85A30', '#F6A06B'] as [string, string],
    Preview: WeekWidgetPreview,
  },
  {
    name: 'Grade Summary',
    subtitle: 'Track your performance',
    sizes: 'Small \u00b7 Medium',
    gradient: ['#0F6E56', '#34D399'] as [string, string],
    Preview: GradeWidgetPreview,
  },
  {
    name: 'Quick Add',
    subtitle: 'One tap to create',
    sizes: 'Small',
    gradient: ['#185FA5', '#60A5FA'] as [string, string],
    Preview: QuickAddWidgetPreview,
  },
];

export default function WidgetsSettings() {
  const colors = useColors();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Widgets' }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={styles.hero}>
          <LinearGradient
            colors={['#6B46C1', '#9F7AEA', '#C4B5FD']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroIconRow}>
              <View style={styles.heroIcon}><FontAwesome name="th-large" size={20} color="#fff" /></View>
            </View>
            <Text style={styles.heroTitle}>Home Screen Widgets</Text>
            <View style={styles.comingSoonBadge}>
              <FontAwesome name="clock-o" size={11} color="#fff" />
              <Text style={styles.comingSoonText}>Coming Soon</Text>
            </View>
            <Text style={styles.heroSub}>
              We're building native widgets so you can see tasks, grades, and deadlines right from your home screen.
            </Text>
          </LinearGradient>
        </View>

        {/* Widget showcase */}
        {WIDGETS.map((w, i) => (
          <View key={i} style={[styles.showcaseCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            {/* Label bar */}
            <LinearGradient
              colors={w.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.showcaseLabel}
            >
              <Text style={styles.showcaseName}>{w.name}</Text>
              <View style={styles.sizeBadge}>
                <Text style={styles.sizeText}>{w.sizes}</Text>
              </View>
            </LinearGradient>

            <Text style={[styles.showcaseSub, { color: colors.ink2 }]}>{w.subtitle}</Text>

            {/* Live-looking preview */}
            <View style={styles.previewWrap}>
              <w.Preview />
            </View>
          </View>
        ))}

        {/* Footer info */}
        <View style={styles.footerInfo}>
          <View style={styles.footerRow}>
            <FontAwesome name="star" size={11} color={colors.brand} />
            <Text style={[styles.footerText, { color: colors.ink3 }]}>Widgets will be available in a future update</Text>
          </View>
          <View style={styles.footerRow}>
            <FontAwesome name="wifi" size={11} color={colors.ink3} />
            <Text style={[styles.footerText, { color: colors.ink3 }]}>Works offline with your most recent data</Text>
          </View>
          <View style={styles.footerRow}>
            <FontAwesome name="lock" size={11} color={colors.ink3} />
            <Text style={[styles.footerText, { color: colors.ink3 }]}>Your data stays on-device and is never shared</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Widget Preview Styles ──────────────────────────────────

const wp = StyleSheet.create({
  container: { alignSelf: 'center', width: WIDGET_W },
  glass: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 20,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  headerTitle: { fontSize: 13, fontWeight: '700', color: COLORS.ink, letterSpacing: 0.2 },
  headerBadge: { marginLeft: 'auto', fontSize: 11, fontWeight: '600', color: COLORS.ink3, backgroundColor: COLORS.paper, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  // Task rows
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  taskBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  taskTitle: { fontSize: 13, fontWeight: '600', color: COLORS.ink },
  taskCourse: { fontSize: 11, color: COLORS.ink3, marginTop: 1 },
  taskTime: { fontSize: 11, fontWeight: '500', color: COLORS.ink3 },
  // Week columns
  dayCol: { flex: 1, alignItems: 'center', gap: 6 },
  dayLabel: { fontSize: 11, fontWeight: '700', color: COLORS.ink3, letterSpacing: 0.3 },
  dayBar: { gap: 3, width: '100%' },
  dayChip: { borderRadius: 6, paddingVertical: 4, paddingHorizontal: 5 },
  dayChipText: { fontSize: 9, fontWeight: '600', color: '#fff', textAlign: 'center' },
  // Grade rows
  gradeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  gradeDot: { width: 6, height: 6, borderRadius: 3 },
  gradeCourse: { fontSize: 12, fontWeight: '500', color: COLORS.ink, width: 68 },
  gradeBarTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.04)' },
  gradeBarFill: { height: 6, borderRadius: 3 },
  gradeLetter: { fontSize: 13, fontWeight: '700', color: COLORS.ink, width: 24, textAlign: 'right' },
  // Quick add
  quickAddCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.brand,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.brand,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});

// ── Screen Styles ──────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { paddingBottom: 50 },
  // Hero
  hero: { marginBottom: 24 },
  heroGradient: { paddingHorizontal: 24, paddingTop: 36, paddingBottom: 30, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  heroIconRow: { marginBottom: 14 },
  heroIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  heroTitle: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 8 },
  comingSoonBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginBottom: 8 },
  comingSoonText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  heroSub: { fontSize: 15, color: 'rgba(255,255,255,0.8)', lineHeight: 21 },
  // Showcase cards
  showcaseCard: {
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: COLORS.card,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
    borderWidth: 0.5,
    borderColor: COLORS.line,
  },
  showcaseLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  showcaseName: { fontSize: 16, fontWeight: '700', color: '#fff' },
  sizeBadge: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  sizeText: { fontSize: 11, fontWeight: '600', color: '#fff' },
  showcaseSub: { fontSize: 14, color: COLORS.ink2, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  previewWrap: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 8,
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  // Footer
  footerInfo: { marginHorizontal: 20, gap: 10, paddingVertical: 8, marginBottom: 20 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerText: { fontSize: 13, color: COLORS.ink3, flex: 1 },
});
