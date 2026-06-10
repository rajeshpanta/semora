import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { COLORS, FONTS } from '@/lib/constants';
import { useColors } from '@/lib/theme';

interface GradeCardProps {
  percentage: number | null;
  letter: string | null;
  gradedCount: number;
  totalCount: number;
  weightAttempted: number;
  weightTotal: number;
}

function getGradeColor(letter: string | null): [string, string] {
  if (!letter) return ['#94a3b8', '#64748b'];
  if (letter.startsWith('A')) return ['#22c55e', '#16a34a'];
  if (letter.startsWith('B')) return ['#3b82f6', '#2563eb'];
  if (letter.startsWith('C')) return ['#f59e0b', '#d97706'];
  if (letter.startsWith('D')) return ['#f97316', '#ea580c'];
  return ['#ef4444', '#dc2626'];
}

export function GradeCard({ percentage, letter, gradedCount, totalCount, weightAttempted, weightTotal }: GradeCardProps) {
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
            {weightAttempted}% of {weightTotal}% attempted
          </Text>
        )}
      </View>

      {/* Helpful context when early in semester */}
      {hasGrades && weightAttempted < weightTotal && weightAttempted > 0 && (
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
  earnedPoints, weightAttempted, weightTotal, scale, isPro, onUpgrade,
}: {
  earnedPoints: number;
  weightAttempted: number;
  weightTotal: number;
  scale: { letter: string; min: number }[];
  isPro: boolean;
  onUpgrade: () => void;
}) {
  const colors = useColors();

  // Meaningless until at least one grade exists; hidden when weights
  // were never set up.
  if (weightTotal <= 0 || weightAttempted <= 0) return null;
  const remaining = Math.max(0, weightTotal - weightAttempted);
  const targets = [...scale].sort((a, b) => b.min - a.min).filter((g) => g.min > 0);
  if (targets.length === 0) return null;

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

  return (
    <View style={[wiStyles.wrap, { borderTopColor: colors.line }]}>
      <View style={wiStyles.headRow}>
        <Text style={[wiStyles.title, { color: colors.ink }]}>What do I need?</Text>
        <Text style={[wiStyles.remainingNote, { color: colors.ink3 }]}>{Math.round(remaining)}% still to play for</Text>
      </View>
      {targets.map((g) => {
        const required = ((g.min / 100) * weightTotal - earnedPoints) / remaining * 100;
        let label: string;
        let tone: string;
        if (required <= 0) {
          label = 'Locked in';
          tone = colors.teal;
        } else if (required <= 100) {
          label = `avg ${Math.ceil(required)}% on the rest`;
          tone = required > 90 ? colors.coral : colors.ink2;
        } else {
          label = 'Out of reach';
          tone = colors.ink3;
        }
        return (
          <View key={g.letter} style={wiStyles.row}>
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
