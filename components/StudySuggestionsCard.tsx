import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Text } from '@/components/LocalizedReactNative';
import React, { useMemo } from 'react';
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
import { useAppStore } from '@/store/appStore';
import { useTasks } from '@/lib/queries';
import { getStudySuggestions, type Suggestion, type UrgencyTier } from '@/lib/studySuggestions';
import { track } from '@/lib/analytics';

// Self-contained "Study Plan" card. Fetches its OWN data (tasks scoped to the
// selected semester) so it can be dropped into the Today tab with no required
// props beyond `limit`. Deterministic study-suggestion engine — no AI.
//
// Pro-gated with the same locked-teaser pattern the grade features use: free
// users see a single blurred/locked line that routes to the paywall
// (context: 'study_suggestions'); Pro users see the ranked list.

const TIER_META: Record<UrgencyTier, { label: string; icon: 'exclamation-circle' | 'clock-o' | 'calendar-o' }> = {
  now: { label: 'Do now', icon: 'exclamation-circle' },
  soon: { label: 'Coming up', icon: 'clock-o' },
  ahead: { label: 'Plan ahead', icon: 'calendar-o' },
};

export default function StudySuggestionsCard({ limit }: { limit?: number }) {
  const max = limit ?? 3;
  const colors = useColors();
  const router = useRouter();
  const isPro = useAppStore((s) => s.isPro);
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);

  // Fetch its own tasks — matches the semesterId-scoped useTasks call the rest
  // of the app makes; the hook no-ops (returns []) until a semester is set.
  const { data: tasks = [] } = useTasks(
    selectedSemesterId ? { semesterId: selectedSemesterId } : { semesterId: null },
  );

  // Recompute only when the task set changes. `now` is read once per render via
  // Date() inside the memo dep-free branch — fine here since suggestions only
  // need day-granularity and the Today tab already re-renders each minute.
  const suggestions = useMemo(
    () => getStudySuggestions(tasks as any, undefined, new Date(), max),
    [tasks, max],
  );

  // Free accounts see nothing here. The card used to render a locked teaser
  // routing to the paywall, which put an upsell above the reader's own
  // deadlines on the first screen they open. Pro users still get the real
  // ranked list below — this removes the advertisement, not the feature.
  if (!isPro) return null;

  // Pro but nothing to suggest (no future incomplete dated tasks). Stay quiet
  // and compact rather than showing an empty shell on the Today tab.
  if (suggestions.length === 0) {
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <View style={styles.headRow}>
          <Text style={[styles.title, { color: colors.ink }]}>Smart Plan</Text>
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
    track('study_suggestion_tapped', { screen: 'today', tier: s.tier });
    router.push(`/task/${s.taskId}` as any);
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: colors.ink }]}>Smart Plan</Text>
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
              <Text style={[styles.rowSub, { color: colors.ink3 }]} numberOfLines={1}>
                {s.courseName} · {s.daysUntilDue <= 0 ? 'due today' : s.daysUntilDue === 1 ? 'due tomorrow' : `due in ${s.daysUntilDue} days`}
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
