import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Text } from '@/components/LocalizedReactNative';
import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { COLORS, FONTS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { calculateCourseGrade, type GradeTask } from '@/lib/grades';
import type { ExtraCreditPolicy, GradeCategory, GradeThreshold } from '@/types/database';

interface GradeCardProps {
  percentage: number | null;
  letter: string | null;
  gradedCount: number;
  totalCount: number;
  weightAttempted: number;
  weightTotal: number;
  categoryMode?: boolean;
  /** Graded work outside every category, in a course that uses categories. */
  uncategorized?: { gradedCount: number; counted: boolean; weight: number };
  /** Graded tasks whose weight the engine had to impute (weight-based mode). */
  unweightedGradedCount?: number;
}

function getGradeColor(letter: string | null): [string, string] {
  if (!letter) return ['#94a3b8', '#64748b'];
  if (letter.startsWith('A')) return ['#22c55e', '#16a34a'];
  if (letter.startsWith('B')) return ['#3b82f6', '#2563eb'];
  if (letter.startsWith('C')) return ['#f59e0b', '#d97706'];
  if (letter.startsWith('D')) return ['#f97316', '#ea580c'];
  return ['#ef4444', '#dc2626'];
}

export function GradeCard({
  percentage, letter, gradedCount, totalCount, weightAttempted, weightTotal,
  categoryMode = false, uncategorized, unweightedGradedCount = 0,
}: GradeCardProps) {
  const colors = useColors();
  const [color1, color2] = getGradeColor(letter);
  const barWidth = percentage != null ? Math.min(percentage, 100) : 0;
  const hasGrades = percentage != null;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View>
          <Text style={[styles.label, { color: colors.ink3 }]}>CURRENT GRADE</Text>
          {hasGrades ? (
            <Text style={[styles.percentage, { color: colors.ink }]}>{percentage!.toFixed(2)}%</Text>
          ) : (
            <Text style={[styles.noGrade, { color: colors.ink3 }]}>No grades yet</Text>
          )}
        </View>
        {letter && (
          <LinearGradient colors={[color1, color2]} style={styles.letterBadge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
            <Text style={styles.letterText}>{letter}</Text>
          </LinearGradient>
        )}
      </View>

      {/* Progress bar */}
      <View style={[styles.barBg, { backgroundColor: colors.line }]}>
        <LinearGradient
          colors={[color1, color2]}
          style={[styles.barFill, { width: `${barWidth}%` }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        />
      </View>

      {/* Context info */}
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: colors.ink3 }]}>
          {gradedCount} of {totalCount} graded
        </Text>
        {hasGrades && weightTotal > 0 && (
          <Text style={[styles.metaRight, { color: colors.ink2 }]}>
            {categoryMode
              ? `${weightAttempted}% of category mix reporting`
              : `${weightAttempted}% of ${weightTotal}% attempted`}
          </Text>
        )}
      </View>

      {/* Incomplete grading setup.
          A course grade is only as honest as the weights behind it, and both
          of these used to be invisible: graded work with no category was
          dropped from a category course, and graded work with no weight was
          dropped from a weighted one. The arithmetic now includes them where
          it defensibly can, but the student still has to know their setup is
          unfinished — the number moves when they finish it. */}
      {uncategorized != null && uncategorized.gradedCount > 0 && (
        <View style={[styles.contextBox, { backgroundColor: colors.amber50 }]}>
          <Text style={[styles.contextText, { color: colors.amber }]}>
            {uncategorized.counted
              ? `${uncategorized.gradedCount} graded item${uncategorized.gradedCount === 1 ? '' : 's'} ${uncategorized.gradedCount === 1 ? 'is' : 'are'} not in a category — counted as the remaining ${uncategorized.weight}%. Assign ${uncategorized.gradedCount === 1 ? 'it' : 'them'} for an exact grade.`
              : `${uncategorized.gradedCount} graded item${uncategorized.gradedCount === 1 ? '' : 's'} ${uncategorized.gradedCount === 1 ? 'is' : 'are'} not in a category, and your categories already total ${weightTotal}% — so ${uncategorized.gradedCount === 1 ? 'it is' : 'they are'} not in this grade. Assign ${uncategorized.gradedCount === 1 ? 'it' : 'them'} to a category to include ${uncategorized.gradedCount === 1 ? 'it' : 'them'}.`}
          </Text>
        </View>
      )}
      {!categoryMode && unweightedGradedCount > 0 && (
        <View style={[styles.contextBox, { backgroundColor: colors.amber50 }]}>
          <Text style={[styles.contextText, { color: colors.amber }]}>
            {unweightedGradedCount} graded item{unweightedGradedCount === 1 ? '' : 's'} {unweightedGradedCount === 1 ? 'has' : 'have'} no weight set. {unweightedGradedCount === 1 ? 'It is' : 'They are'} counted using an even share of the weight your syllabus has not assigned — add weights for an exact grade.
          </Text>
        </View>
      )}

      {/* Helpful context when early in semester */}
      {hasGrades && !categoryMode && weightAttempted < weightTotal && weightAttempted > 0 && (
        <View style={[styles.contextBox, { backgroundColor: colors.brand50 }]}>
          <Text style={[styles.contextText, { color: colors.brand }]}>
            Based on {weightAttempted}% of coursework completed.{' '}
            {percentage! >= 90 ? 'Great start!' : percentage! >= 80 ? 'Looking good!' : percentage! >= 70 ? 'Keep working!' : 'Room to improve.'}
          </Text>
        </View>
      )}
    </View>
  );
}

/* ─────────────────────────────────────────────────────────────────────
 * What-if calculator: "what average do I need on the REMAINING work to
 * land each letter grade?" Built entirely from data the syllabus scan
 * already extracted (weights + grade scale) — Power Planner's most-loved
 * feature, and our paywall already promises "Grade Forecasting".
 *
 * Math (consistent with calculateGrade):
 *   earnedPoints = Σ(weight × score / 100)   — points banked so far
 *   remaining    = weightTotal − weightAttempted
 *   final% if remaining averages r:  (earnedPoints + r/100 × remaining) / weightTotal × 100
 *   required r for target T:         (T/100 × weightTotal − earnedPoints) / remaining × 100
 * ──────────────────────────────────────────────────────────────────── */

export function WhatIfCard({
  earnedPoints, weightAttempted, weightTotal, scale, isPro, onUpgrade, pendingEcWeight = 0,
}: {
  earnedPoints: number;
  weightAttempted: number;
  weightTotal: number;
  scale: { letter: string; min: number }[];
  isPro: boolean;
  onUpgrade: () => void;
  /** Total weight of NOT-yet-graded extra-credit tasks — extra achievable
   *  points beyond the remaining regular work (matches calculateGrade's
   *  EC-as-bonus semantics). */
  pendingEcWeight?: number;
}) {
  const colors = useColors();

  // Meaningless until at least one grade exists; hidden when weights
  // were never set up.
  if (weightTotal <= 0 || weightAttempted <= 0) return null;
  const remaining = Math.max(0, weightTotal - weightAttempted);
  const targets = [...scale].sort((a, b) => b.min - a.min).filter((g) => g.min > 0);
  if (targets.length === 0) return null;

  // All regular work graded — same terminal copy for BOTH tiers (the free
  // teaser used to promise "your remaining 0% of coursework").
  if (remaining < 0.5) {
    return (
      <View style={[wiStyles.wrap, { borderTopColor: colors.line }]}>
        <Text style={[wiStyles.title, { color: colors.ink }]}>What do I need?</Text>
        <Text style={[wiStyles.teaser, { color: colors.ink3 }]}>
          All weighted work is graded — your final grade is locked in.
        </Text>
      </View>
    );
  }

  // Pro gate — teaser that sells the exact value, taps to paywall.
  if (!isPro) {
    return (
      <TouchableOpacity style={[wiStyles.wrap, { borderTopColor: colors.line }]} onPress={onUpgrade} activeOpacity={0.75}>
        <View style={wiStyles.headRow}>
          <Text style={[wiStyles.title, { color: colors.ink }]}>What do I need?</Text>
          <View style={[wiStyles.proPill, { backgroundColor: colors.brand }]}>
            <Text style={wiStyles.proPillText}>PRO</Text>
          </View>
        </View>
        <Text style={[wiStyles.teaser, { color: colors.ink3 }]}>
          See the exact average you need on your remaining {Math.round(remaining)}% of coursework to land an
          {' '}{targets[0].letter} — or any grade. Computed from this course{'’'}s real weights.
        </Text>
      </TouchableOpacity>
    );
  }

  // Max achievable average counting pending extra credit as bonus points
  // (same numerator-only treatment calculateGrade gives graded EC).
  const maxReachable = ((remaining + pendingEcWeight) / remaining) * 100;

  return (
    <View style={[wiStyles.wrap, { borderTopColor: colors.line }]}>
      <View style={wiStyles.headRow}>
        <Text style={[wiStyles.title, { color: colors.ink }]}>What do I need?</Text>
        <Text style={[wiStyles.remainingNote, { color: colors.ink3 }]}>{Math.round(remaining)}% still to play for</Text>
      </View>
      {targets.map((g, idx) => {
        const required = ((g.min / 100) * weightTotal - earnedPoints) / remaining * 100;
        let label: string;
        let tone: string;
        if (required <= 0) {
          label = 'Locked in';
          tone = colors.teal;
        } else if (required <= 100) {
          label = `avg ${Math.ceil(required)}% on the rest`;
          tone = required > 90 ? colors.coral : colors.ink2;
        } else if (required <= maxReachable) {
          // Only reachable by also banking the ungraded extra credit.
          label = 'Needs extra credit';
          tone = colors.amber;
        } else {
          label = 'Out of reach';
          tone = colors.ink3;
        }
        return (
          // Composite key: the user-editable scale can contain duplicate
          // or empty letters; letter alone collides.
          <View key={`${g.letter}-${g.min}-${idx}`} style={wiStyles.row}>
            <Text style={[wiStyles.rowLetter, { color: colors.ink }]}>{g.letter}</Text>
            <Text style={[wiStyles.rowMin, { color: colors.ink3 }]}>{g.min}%+</Text>
            <View style={{ flex: 1 }} />
            {required <= 0 && <FontAwesome name="check" size={11} color={colors.teal} style={{ marginRight: 5 }} />}
            <Text style={[wiStyles.rowReq, { color: tone }]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function FinalExamWhatIfCard({
  tasks, categories, scale, extraCreditPolicy, isPro, onUpgrade,
}: {
  tasks: Array<GradeTask & { id: string; title: string; type?: string }>;
  categories: GradeCategory[];
  scale: GradeThreshold[];
  extraCreditPolicy: ExtraCreditPolicy;
  isPro: boolean;
  onUpgrade: () => void;
}) {
  const colors = useColors();
  const candidates = useMemo(() => {
    const ungraded = tasks.filter((task) => task.score == null && !task.is_extra_credit);
    const finals = ungraded.filter((task) =>
      task.type === 'exam' || /\b(final|midterm|exam)\b/i.test(task.title),
    );
    return (finals.length ? finals : ungraded)
      .filter((task) => task.weight != null || task.grade_category_id != null)
      .slice(0, 6);
  }, [tasks]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [score, setScore] = useState(85);
  const selected = candidates.find((task) => task.id === selectedId) || candidates[0];

  if (!selected) return null;
  if (!isPro) {
    return (
      <TouchableOpacity style={[wiStyles.wrap, { borderTopColor: colors.line }]} onPress={onUpgrade}>
        <View style={wiStyles.headRow}>
          <Text style={[wiStyles.title, { color: colors.ink }]}>Final exam what-if</Text>
          <View style={[wiStyles.proPill, { backgroundColor: colors.brand }]}><Text style={wiStyles.proPillText}>PRO</Text></View>
        </View>
        <Text style={[wiStyles.teaser, { color: colors.ink3 }]}>Try possible exam scores and see the projected course grade instantly.</Text>
      </TouchableOpacity>
    );
  }

  const projectedTasks = tasks.map((task) => task.id === selected.id ? { ...task, score } : task);
  const projected = calculateCourseGrade(projectedTasks, categories, scale, extraCreditPolicy);

  return (
    <View style={[wiStyles.wrap, { borderTopColor: colors.line }]}>
      <View style={wiStyles.headRow}>
        <Text style={[wiStyles.title, { color: colors.ink }]}>Final exam what-if</Text>
        <Text style={[wiStyles.remainingNote, { color: colors.ink3 }]}>Projected, not saved</Text>
      </View>
      {candidates.length > 1 && (
        <View style={wiStyles.taskChips}>
          {candidates.map((task) => (
            <TouchableOpacity
              key={task.id}
              style={[
                wiStyles.taskChip,
                { borderColor: colors.line },
                selected.id === task.id && { backgroundColor: colors.brand50, borderColor: colors.brand },
              ]}
              onPress={() => setSelectedId(task.id)}
            >
              <Text style={[wiStyles.taskChipText, { color: selected.id === task.id ? colors.brand : colors.ink2 }]} numberOfLines={1}>{task.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <Text style={[wiStyles.examTitle, { color: colors.ink2 }]} numberOfLines={1}>If you earn {score}% on {selected.title}</Text>
      <View style={wiStyles.scoreRow}>
        {[70, 80, 85, 90, 100].map((value) => (
          <TouchableOpacity
            key={value}
            style={[wiStyles.scoreChip, { borderColor: colors.line }, score === value && { backgroundColor: colors.brand, borderColor: colors.brand }]}
            onPress={() => setScore(value)}
          >
            <Text style={[wiStyles.scoreChipText, { color: score === value ? '#fff' : colors.ink2 }]}>{value}%</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[wiStyles.projection, { backgroundColor: colors.brand50 }]}>
        <Text style={[wiStyles.projectionLabel, { color: colors.brand }]}>PROJECTED COURSE GRADE</Text>
        <Text style={[wiStyles.projectionValue, { color: colors.brand }]}>
          {projected.percentage != null ? `${projected.percentage.toFixed(2)}% · ${projected.letter}` : 'Not enough grading data'}
        </Text>
      </View>
    </View>
  );
}

const wiStyles = StyleSheet.create({
  wrap: { borderTopWidth: 0.5, marginTop: 14, paddingTop: 12 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontFamily: FONTS.displaySemibold, fontSize: 16 },
  remainingNote: { fontSize: 11.5, fontWeight: '600' },
  proPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 },
  proPillText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.6 },
  teaser: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rowLetter: { fontSize: 14.5, fontWeight: '800', width: 30 },
  rowMin: { fontSize: 12, fontWeight: '500' },
  rowReq: { fontSize: 13.5, fontWeight: '700' },
  taskChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 7 },
  taskChip: { maxWidth: '48%', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  taskChipText: { fontSize: 11.5, fontWeight: '700' },
  examTitle: { fontSize: 12.5, fontWeight: '600', marginTop: 6 },
  scoreRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  scoreChip: { flex: 1, height: 34, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  scoreChipText: { fontSize: 11.5, fontWeight: '800' },
  projection: { borderRadius: 10, padding: 10, marginTop: 9 },
  projectionLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.6 },
  projectionValue: { fontSize: 16, fontWeight: '800', marginTop: 2 },
});

const styles = StyleSheet.create({
  container: { marginBottom: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.ink3, letterSpacing: 0.5 },
  percentage: { fontFamily: FONTS.display, fontSize: 30, color: COLORS.ink, marginTop: 2 },
  noGrade: { fontSize: 16, color: COLORS.ink3, marginTop: 4 },
  letterBadge: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  letterText: { fontSize: 24, fontWeight: '800', color: '#fff' },
  barBg: { height: 8, backgroundColor: '#f1f5f9', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  meta: { fontSize: 14, color: COLORS.ink3, fontWeight: '500' },
  metaRight: { fontSize: 14, color: COLORS.ink2, fontWeight: '500' },
  contextBox: { backgroundColor: COLORS.brand50, borderRadius: 8, padding: 8, marginTop: 8 },
  contextText: { fontSize: 14, color: COLORS.brand, fontWeight: '500', lineHeight: 16 },
});
