import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS } from '@/lib/constants';
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
      <View style={styles.barBg}>
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

const styles = StyleSheet.create({
  container: { marginBottom: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.ink3, letterSpacing: 0.5 },
  percentage: { fontSize: 28, fontWeight: '800', color: COLORS.ink, marginTop: 2 },
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
