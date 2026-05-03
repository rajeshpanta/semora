import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { useCreateSemester, useSemesters } from '@/lib/queries';
import { COLORS } from '@/lib/constants';
import { useAppStore } from '@/store/appStore';
import { DatePicker } from '@/components/DatePicker';
import { useColors } from '@/lib/theme';
import { FREE_SEMESTER_LIMIT } from '@/lib/syllabus';
import { formatLocalDate } from '@/lib/dates';
import { suggestSemesters } from '@/lib/semesters';

export default function NewSemesterScreen() {
  const router = useRouter();
  const createSemester = useCreateSemester();
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);
  const isPro = useAppStore((s) => s.isPro);
  const { data: existingSemesters = [] } = useSemesters();
  const colors = useColors();

  const [name, setName] = useState('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  // Computed once per mount; the suggestions don't change while the
  // screen is open. Used by the preset chip row above the name input.
  const presets = useMemo(() => suggestSemesters(), []);

  const applyPreset = (p: { name: string; start: Date; end: Date }) => {
    setName(p.name);
    setStartDate(p.start);
    setEndDate(p.end);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a semester name.');
      return;
    }

    if (!isPro && existingSemesters.length >= FREE_SEMESTER_LIMIT) {
      Alert.alert(
        'Semester Limit Reached',
        `Free accounts support up to ${FREE_SEMESTER_LIMIT} semester. Upgrade to Pro for unlimited semesters.`,
        [
          { text: 'Upgrade', onPress: () => router.push('/paywall' as any) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    try {
      const result = await createSemester.mutateAsync({
        name: name.trim(),
        start_date: startDate ? formatLocalDate(startDate) : null,
        end_date: endDate ? formatLocalDate(endDate) : null,
      });
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Keyboard.dismiss();
      setSelectedSemester(result.id);
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create semester.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={styles.iconRow}>
            <View style={[styles.iconCircle, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name="graduation-cap" size={22} color={colors.brand} />
            </View>
          </View>

          <Text style={[styles.label, { color: colors.ink2 }]}>Quick pick</Text>
          <View style={styles.presetRow}>
            {presets.map((p) => {
              // Selected = name string matches; date fields are
              // user-editable so don't gate selection on those.
              const selected = name === p.name;
              return (
                <TouchableOpacity
                  key={p.name}
                  style={[
                    styles.presetChip,
                    { borderColor: colors.line, backgroundColor: colors.card },
                    selected && { backgroundColor: colors.brand, borderColor: colors.brand },
                  ]}
                  onPress={() => applyPreset(p)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.presetChipText,
                      { color: colors.ink2 },
                      selected && { color: '#fff' },
                    ]}
                  >
                    {p.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.ink2 }]}>Semester Name *</Text>
          <TextInput
            style={[styles.input, { borderColor: colors.line, backgroundColor: colors.card, color: colors.ink }]}
            placeholder="e.g. Fall 2026"
            placeholderTextColor={colors.ink3}
            value={name}
            onChangeText={setName}
          />

          <Text style={[styles.label, { color: colors.ink2 }]}>Start Date</Text>
          <DatePicker value={startDate} onChange={setStartDate} placeholder="Optional" />

          <Text style={[styles.label, { color: colors.ink2 }]}>End Date</Text>
          <DatePicker value={endDate} onChange={setEndDate} placeholder="Optional" />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.brand }, createSemester.isPending && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={createSemester.isPending}
            activeOpacity={0.8}
          >
            {createSemester.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <FontAwesome name="plus" size={14} color="#fff" />
                <Text style={styles.buttonText}>Create Semester</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#edf0f7' },
  iconRow: { alignItems: 'center', marginBottom: 20 },
  iconCircle: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#eef2ff', justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  presetRow: { flexDirection: 'row', gap: 8 },
  presetChip: {
    flex: 1, height: 38, borderRadius: 10, borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  presetChipText: { fontSize: 13, fontWeight: '600' },
  input: { height: 48, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#fafafa', paddingHorizontal: 16, fontSize: 15, color: '#111' },
  button: { flexDirection: 'row', height: 50, backgroundColor: COLORS.brand, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 24, gap: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
