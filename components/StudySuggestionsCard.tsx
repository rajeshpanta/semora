import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Text } from '@/components/LocalizedReactNative';
import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { COLORS, FONTS, WEB_CARD_SHADOW } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { translate } from '@/lib/i18n';
import { useAppStore } from '@/store/appStore';
import { useSemesterGradeCategories, useTasks } from '@/lib/queries';
import { getStudySuggestions, type Suggestion, type UrgencyTier } from '@/lib/studySuggestions';
import { stakesByTask } from '@/lib/taskStake';
import { track } from '@/lib/analytics';

// The "Up next" card. Fetches its OWN data (tasks scoped to the selected
// semester) so it can be dropped into the Today tab with no required props
// beyond `limit`. Deterministic — no AI, and no Pro gate.
//
// Ranking comes from lib/taskPriority, shared with the timed planner so the two
// surfaces cannot disagree about what matters most. The stake clause ("exams
// are 30%") comes from lib/taskStake, inferred at read time from the grade
// breakdown the syllabus scan already extracted.

const TIER_META: Record<UrgencyTier, { label: string; icon: 'exclamation-circle' | 'clock-o' | 'calendar-o' }> = {
  now: { label: 'Do now', icon: 'exclamation-circle' },
  soon: { label: 'Coming up', icon: 'clock-o' },
  ahead: { label: 'Plan ahead', icon: 'calendar-o' },
};

/**
 * "exams are 30%" — the kind, never the single task. A category is split across
 * every sibling in it, so "this quiz is 30% of your grade" would be false.
 */
const STAKE_NOUN: Record<string, string> = {
  exam: 'exams', quiz: 'quizzes', assignment: 'assignments',
  project: 'projects', reading: 'readings', lab: 'labs',
};

/** Atomic phrases, so each is a whole string lib/i18n can look up or pattern-match. */
function duePhrase(s: Suggestion): string {
  if (s.daysUntilDue <= 0) return 'due today';
  if (s.daysUntilDue === 1) return 'due tomorrow';
  return `due in ${s.daysUntilDue} days`;
}
function stakePhrase(stake: { bucket: string; weightPercent: number }): string {
  return `${STAKE_NOUN[stake.bucket]} are ${stake.weightPercent}%`;
}

export default function StudySuggestionsCard({ limit }: { limit?: number }) {
  const max = limit ?? 3;
  const colors = useColors();
  const router = useRouter();
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);

  // Fetch its own tasks — matches the semesterId-scoped useTasks call the rest
  // of the app makes; the hook no-ops (returns []) until a semester is set.
  const { data: tasks = [] } = useTasks(
    selectedSemesterId ? { semesterId: selectedSemesterId } : { semesterId: null },
  );

  // Recompute only when the task set changes. `now` is read once per render via
  // Date() inside the memo dep-free branch — fine here since suggestions only
  // need day-granularity and the Today tab already re-renders each minute.
  // The grade breakdown the syllabus scan already extracted. Only 25 of 8,441
  // tasks carry a category link, so without this the ranker sees a weight on
  // fewer than one task in ten and orders nine of them on type alone.
  const { data: categories = [] } = useSemesterGradeCategories(selectedSemesterId);

  const suggestions = useMemo(
    () => getStudySuggestions(tasks as any, undefined, new Date(), max, {
      stakes: stakesByTask(tasks as any, categories as any),
    }),
    [tasks, categories, max],
  );


  // Fire once per mount that actually shows something. Without a denominator
  // the tap count is unreadable — lib/canvasLanes.ts:12 records the same
  // mistake being made before ("0 events — never written at all").
  const shownRef = useRef(false);
  useEffect(() => {
    if (shownRef.current || suggestions.length === 0) return;
    shownRef.current = true;
    track('study_suggestion_shown', {
      screen: 'today',
      count: suggestions.length,
      top_tier: suggestions[0].tier,
      with_stake: suggestions.filter((s) => s.reason.stake).length,
    });
  }, [suggestions]);

  // Deliberately NOT gated. Knowing what deserves attention next is the core
  // organisational promise of the app and should be visible before anyone pays.
  // What stays Pro is the advanced conductor — the timed, adapting plan on
  // /planner that the website sells as "Smart Plan". This card is the
  // deterministic basic version, named "Up next" so the two are never confused.

  // Nothing to suggest (no future incomplete dated tasks). Stay quiet and
  // compact rather than showing an empty shell on the Today tab.
  if (suggestions.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <View style={styles.headRow}>
          <Text style={[styles.title, { color: colors.ink }]}>Up next</Text>
          <TouchableOpacity style={styles.openLink} onPress={() => router.push('/planner' as any)}>
            <Text style={[styles.openLinkText, { color: colors.brand }]}>Open plan</Text>
            <FontAwesome name="chevron-right" size={9} color={colors.brand} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.emptyLine, { color: colors.ink3 }]}>
          Nothing pressing — you{'’'}re all caught up. Nice.
        </Text>
      </View>
    );
  }

  const onTapSuggestion = (s: Suggestion) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    track('study_suggestion_tapped', {
      screen: 'today', tier: s.tier,
      rank: suggestions.findIndex((x) => x.taskId === s.taskId),
      has_stake: !!s.reason.stake,
    });
    router.push(`/task/${s.taskId}` as any);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: colors.ink }]}>Up next</Text>
        <TouchableOpacity style={styles.openLink} onPress={() => router.push('/planner' as any)}>
          <Text style={[styles.openLinkText, { color: colors.brand }]}>Open plan</Text>
          <FontAwesome name="chevron-right" size={9} color={colors.brand} />
        </TouchableOpacity>
      </View>
      {suggestions.map((s) => {
        const meta = TIER_META[s.tier];
        const accent = s.tier === 'now' ? colors.coral : s.tier === 'soon' ? colors.amber : colors.ink3;
        return (
          <TouchableOpacity
            key={s.taskId}
            style={styles.row}
            onPress={() => onTapSuggestion(s)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={s.line}
          >
            <View style={[styles.tierDot, { backgroundColor: s.courseColor || accent }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.ink }]} numberOfLines={1}>
                {s.title}
              </Text>
              {/* Two lines, because the stake clause sits at the END of this
                  string and a single line truncates it away — Spanish runs to
                  60 characters against English's 49, and a real course name
                  ("AGSC 100.1001 Elements of Livestock Production") is longer
                  than both. The new information must not be the first thing
                  cut. Short subtitles still render on one line. */}
              <Text style={[styles.rowSub, { color: colors.ink3 }]} numberOfLines={2}>
                {s.courseName} · {translate(duePhrase(s))}
                {s.reason.stake ? ` · ${translate(stakePhrase(s.reason.stake))}` : ''}
              </Text>
            </View>
            <View style={styles.tierBadge}>
              <FontAwesome name={meta.icon} size={11} color={accent} />
              <Text style={[styles.tierText, { color: accent }]}>{meta.label}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 0.5,
    borderColor: COLORS.line,
    ...WEB_CARD_SHADOW,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontFamily: FONTS.displaySemibold, fontSize: 16, color: COLORS.ink },
  subtle: { fontSize: 11.5, fontWeight: '600' },
  openLink: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  openLinkText: { fontSize: 11.5, fontWeight: '700' },
  emptyLine: { fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  tierDot: { width: 8, height: 8, borderRadius: 4 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 1 },
  tierBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tierText: { fontSize: 11, fontWeight: '700' },
});
