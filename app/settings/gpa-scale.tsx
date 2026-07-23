import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useGpaScale, useUpdateGpaScale } from '@/lib/queries';
import { DEFAULT_GPA_SCALE } from '@/lib/grades';
import type { GpaScaleEntry } from '@/types/database';
import { COLORS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';

export default function GpaScaleScreen() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const { data, isLoading } = useGpaScale();
  const update = useUpdateGpaScale();
  const [rows, setRows] = useState<GpaScaleEntry[]>(DEFAULT_GPA_SCALE);

  useEffect(() => {
    if (data?.length) setRows(data);
  }, [data]);

  const save = async () => {
    const clean = rows
      .map((row) => ({ letter: row.letter.trim().toUpperCase(), points: Number(row.points) }))
      .filter((row) => row.letter);
    if (!clean.length || clean.some((row) => !Number.isFinite(row.points) || row.points < 0 || row.points > 10)) {
      Alert.alert('Check the scale', 'Use a letter and grade points between 0 and 10 for every row.');
      return;
    }
    if (new Set(clean.map((row) => row.letter)).size !== clean.length) {
      Alert.alert('Duplicate letter', 'Each letter grade can appear only once.');
      return;
    }
    try {
      await update.mutateAsync(clean);
      Alert.alert('GPA scale saved', 'Semester GPA estimates now use your school’s grade-point rules.');
    } catch (error: any) {
      Alert.alert('Couldn’t save', error?.message || 'Please try again.');
    }
  };

  if (isLoading) {
    return <View style={[styles.loading, { backgroundColor: colors.paper }]}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'GPA Scale' }} />
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.ink }]}>Your school’s GPA scale</Text>
        <Text style={[styles.subtitle, { color: colors.ink3 }]}>
          Set the exact points your school awards for each letter. This changes GPA estimates, not course percentage cutoffs.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {rows.map((row, index) => (
            <View key={index} style={[styles.row, index < rows.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.line }]}>
              <TextInput
                style={[styles.letterInput, { color: colors.ink, borderColor: colors.line }]}
                value={row.letter}
                placeholder="A"
                placeholderTextColor={colors.ink3}
                autoCapitalize="characters"
                maxLength={3}
                onChangeText={(letter) => setRows((current) => current.map((item, i) => i === index ? { ...item, letter } : item))}
              />
              <Text style={[styles.equals, { color: colors.ink3 }]}>=</Text>
              <TextInput
                style={[styles.pointsInput, { color: colors.ink, borderColor: colors.line }]}
                value={String(row.points)}
                placeholder="4.0"
                placeholderTextColor={colors.ink3}
                keyboardType="decimal-pad"
                onChangeText={(value) => setRows((current) => current.map((item, i) => i === index ? { ...item, points: Number(value) || 0 } : item))}
              />
              <Text style={[styles.pointsLabel, { color: colors.ink3 }]}>points</Text>
              <TouchableOpacity onPress={() => setRows((current) => current.filter((_, i) => i !== index))} hitSlop={8}>
                <FontAwesome name="times" size={14} color={colors.coral} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addRow} onPress={() => setRows((current) => [...current, { letter: '', points: 0 }])}>
            <FontAwesome name="plus" size={11} color={colors.brand} />
            <Text style={[styles.addText, { color: colors.brand }]}>Add grade</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.secondary, { borderColor: colors.line }]} onPress={() => setRows(DEFAULT_GPA_SCALE)}>
          <Text style={[styles.secondaryText, { color: colors.ink2 }]}>Restore standard 4.0 scale</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.save, { backgroundColor: colors.brand }]} onPress={save} disabled={update.isPending}>
          {update.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save GPA scale</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', padding: 20, paddingBottom: 60 },
  title: { fontSize: 23, fontWeight: '800' },
  subtitle: { fontSize: 13.5, lineHeight: 20, marginTop: 5, marginBottom: 16 },
  card: { borderWidth: 0.5, borderRadius: 17, paddingHorizontal: 14 },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9 },
  letterInput: { width: 56, height: 38, borderWidth: 1, borderRadius: 9, textAlign: 'center', fontSize: 15, fontWeight: '800' },
  equals: { fontSize: 15, fontWeight: '700' },
  pointsInput: { width: 70, height: 38, borderWidth: 1, borderRadius: 9, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  pointsLabel: { flex: 1, fontSize: 12.5 },
  addRow: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 6 },
  addText: { fontSize: 13.5, fontWeight: '700' },
  secondary: { height: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  secondaryText: { fontSize: 13.5, fontWeight: '700' },
  save: { height: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
