import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';

// Clamp so the mock widget previews stay phone-sized on iPad instead of
// ballooning to the full screen width. Orientation is locked + full screen,
// so a module-load read is stable (no rotation/Split View to react to).
const WIDGET_W = Math.min(Dimensions.get('window').width - 80, 320);

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

// ── Widget Showcase Cards ──────────────────────────────────

// Only widgets that actually ship as WidgetKit targets (targets/widget) are
// showcased with a live preview. Anything still on the roadmap is summarized in
// the "more coming soon" line below instead of faking a full preview.
const WIDGETS = [
  {
    // Shipped as the "Up Next" WidgetKit widget (targets/widget).
    name: 'Up Next',
    subtitle: 'Your next deadlines at a glance',
    sizes: 'Small \u00b7 Medium',
    gradient: ['#6B46C1', '#9F7AEA'] as [string, string],
    Preview: TodayWidgetPreview,
    live: true,
  },
  {
    // Shipped as the "Due This Week" WidgetKit widget (targets/widget) \u2014
    // a grouped 7-day deadline list plus the current study streak.
    name: 'Due This Week',
    subtitle: 'Everything due in the next 7 days, plus your streak',
    sizes: 'Small \u00b7 Medium',
    gradient: ['#D85A30', '#F6A06B'] as [string, string],
    Preview: WeekWidgetPreview,
    live: true,
  },
];

export default function WidgetsSettings() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Widgets' }} />
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} showsVerticalScrollIndicator={false}>

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
              <FontAwesome name="check-circle" size={11} color="#fff" />
              <Text style={styles.comingSoonText}>2 widgets live</Text>
            </View>
            <Text style={styles.heroSub}>
              Long-press your Home Screen → tap + → search "Semora" to add the Up Next or Due This Week widget. More widgets are on the way.
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

        {/* Honest placeholder for roadmap widgets — no faked preview until they ship. */}
        <View style={styles.comingSoonRow}>
          <FontAwesome name="ellipsis-h" size={13} color={colors.ink3} />
          <Text style={[styles.comingSoonRowText, { color: colors.ink3 }]}>More widgets coming soon</Text>
        </View>

        {/* Footer info */}
        <View style={styles.footerInfo}>
          <View style={styles.footerRow}>
            <FontAwesome name="star" size={11} color={colors.brand} />
            <Text style={[styles.footerText, { color: colors.ink3 }]}>Up Next and Due This Week (small & medium) are available now — more widget types coming</Text>
          </View>
          <View style={styles.footerRow}>
            <FontAwesome name="wifi" size={11} color={colors.ink3} />
            <Text style={[styles.footerText, { color: colors.ink3 }]}>Works offline with your most recent data</Text>
          </View>
          <View style={styles.footerRow}>
            <FontAwesome name="lock" size={11} color={colors.ink3} />
            <Text style={[styles.footerText, { color: colors.ink3 }]}>The widget reads only the schedule already on your device</Text>
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
});

// ── Screen Styles ──────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { paddingBottom: 50, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
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
  // Roadmap placeholder
  comingSoonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 20, marginTop: 4, marginBottom: 20 },
  comingSoonRowText: { fontSize: 13, fontWeight: '600', color: COLORS.ink3 },
  // Footer
  footerInfo: { marginHorizontal: 20, gap: 10, paddingVertical: 8, marginBottom: 20 },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerText: { fontSize: 13, color: COLORS.ink3, flex: 1 },
});
