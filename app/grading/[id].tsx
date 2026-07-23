import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  useCourse, useCreateGradeCategory, useDeleteGradeCategory,
  useGradeCategories, useUpdateCourse, useUpdateGradeCategory,
} from '@/lib/queries';
import type { ExtraCreditPolicy, GradeCategory } from '@/types/database';
import { COLORS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';

type Draft = Pick<GradeCategory, 'id' | 'name' | 'weight_percent' | 'drop_lowest_count' | 'position'>;

const POLICY_COPY: Record<ExtraCreditPolicy, { label: string; detail: string }> = {
  bonus: { label: 'Bonus points', detail: 'A weighted extra-credit task adds points without increasing the total.' },
  category: { label: 'Inside category', detail: 'Extra credit is included in its category average and may lift it above 100%.' },
  ignore: { label: 'Ignore', detail: 'Keep extra-credit work visible, but exclude it from calculations.' },
};

export default function GradingSetupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const { data: course, isLoading: courseLoading } = useCourse(id!);
  const { data: categories = [], isLoading } = useGradeCategories(id);
  const createCategory = useCreateGradeCategory();
  const updateCategory = useUpdateGradeCategory();
  const deleteCategory = useDeleteGradeCategory();
  const updateCourse = useUpdateCourse();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [policy, setPolicy] = useState<ExtraCreditPolicy>('bonus');

  useEffect(() => {
    setDrafts(categories.map((category) => ({
      id: category.id,
      name: category.name,
      weight_percent: category.weight_percent,
      drop_lowest_count: category.drop_lowest_count,
      position: category.position,
    })));
  }, [categories]);

  useEffect(() => {
    if (course) setPolicy(course.extra_credit_policy || 'bonus');
  }, [course]);

  const total = useMemo(
    () => drafts.reduce((sum, category) => sum + (Number(category.weight_percent) || 0), 0),
    [drafts],
  );

  const addCategory = () => {
    setDrafts((current) => [
      ...current,
      {
        id: `new-${Date.now()}`,
        name: '',
        weight_percent: Math.max(1, 100 - total),
        drop_lowest_count: 0,
        position: current.length,
      },
    ]);
  };

  const save = async () => {
    if (!course) return;
    if (!drafts.length) {
      Alert.alert('Add categories', 'Add at least one category, or leave this page to keep per-task weights.');
      return;
    }
    if (drafts.some((draft) => !draft.name.trim())) {
      Alert.alert('Name required', 'Every category needs a name.');
      return;
    }
    if (drafts.some((draft) => draft.weight_percent <= 0 || draft.weight_percent > 100)) {
      Alert.alert('Invalid weight', 'Each category weight must be between 1% and 100%.');
      return;
    }
    if (Math.abs(total - 100) > 0.01) {
      Alert.alert('Weights must total 100%', `Your categories currently total ${total.toFixed(1)}%.`);
      return;
    }
    try {
      for (const draft of drafts) {
        const input = {
          course_id: course.id,
          name: draft.name.trim(),
          weight_percent: Number(draft.weight_percent),
          drop_lowest_count: Math.max(0, Math.round(draft.drop_lowest_count)),
          position: draft.position,
        };
        if (draft.id.startsWith('new-')) await createCategory.mutateAsync(input);
        else await updateCategory.mutateAsync({ id: draft.id, ...input });
      }
      for (const categoryId of deletedIds) {
        await deleteCategory.mutateAsync({ id: categoryId, courseId: course.id });
      }
      await updateCourse.mutateAsync({ id: course.id, extra_credit_policy: policy });
      setDeletedIds([]);
      Alert.alert('Grade setup saved', 'Semora will now use these rules for current grades and forecasts.');
    } catch (error: any) {
      Alert.alert('Couldn’t save', error?.message || 'Please try again.');
    }
  };

  const remove = (draft: Draft) => {
    const finish = () => {
      if (!draft.id.startsWith('new-')) {
        setDeletedIds((current) => current.includes(draft.id) ? current : [...current, draft.id]);
      }
      setDrafts((current) => current.filter((item) => item.id !== draft.id));
    };
    Alert.alert(
      `Remove ${draft.name || 'category'}?`,
      'When you save, tasks in it will become uncategorized; their grades are not deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: finish },
      ],
    );
  };

  if (isLoading || courseLoading) {
    return <View style={[styles.loading, { backgroundColor: colors.paper }]}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Grade Setup' }} />
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.ink }]}>Match the syllabus rules</Text>
        <Text style={[styles.subtitle, { color: colors.ink3 }]}>
          Categories produce a truer grade than assigning a percentage to every task. Existing courses stay unchanged until you save.
        </Text>

        <View style={[styles.totalCard, { backgroundColor: total === 100 ? colors.teal50 : colors.amber50 }]}>
          <Text style={[styles.totalLabel, { color: total === 100 ? colors.teal : colors.amber }]}>CATEGORY TOTAL</Text>
          <Text style={[styles.totalValue, { color: total === 100 ? colors.teal : colors.amber }]}>{total.toFixed(1)}%</Text>
        </View>

        {drafts.map((draft, index) => (
          <View key={draft.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={styles.row}>
              <TextInput
                style={[styles.nameInput, { color: colors.ink, borderColor: colors.line }]}
                value={draft.name}
                placeholder="Category name"
                placeholderTextColor={colors.ink3}
                onChangeText={(name) => setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, name } : item))}
              />
              <TouchableOpacity onPress={() => remove(draft)} hitSlop={8}>
                <FontAwesome name="trash-o" size={16} color={colors.coral} />
              </TouchableOpacity>
            </View>
            <View style={styles.fields}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.ink3 }]}>WEIGHT %</Text>
                <TextInput
                  style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
                  value={String(draft.weight_percent)}
                  keyboardType="decimal-pad"
                  onChangeText={(value) => setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, weight_percent: Number(value) || 0 } : item))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.ink3 }]}>DROP LOWEST</Text>
                <View style={[styles.stepper, { borderColor: colors.line }]}>
                  <TouchableOpacity onPress={() => setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, drop_lowest_count: Math.max(0, item.drop_lowest_count - 1) } : item))}>
                    <FontAwesome name="minus" size={12} color={colors.ink2} />
                  </TouchableOpacity>
                  <Text style={[styles.stepValue, { color: colors.ink }]}>{draft.drop_lowest_count}</Text>
                  <TouchableOpacity onPress={() => setDrafts((current) => current.map((item) => item.id === draft.id ? { ...item, drop_lowest_count: Math.min(20, item.drop_lowest_count + 1) } : item))}>
                    <FontAwesome name="plus" size={12} color={colors.ink2} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            {draft.drop_lowest_count > 0 && (
              <Text style={[styles.hint, { color: colors.ink3 }]}>Semora excludes the {draft.drop_lowest_count} lowest graded item{draft.drop_lowest_count === 1 ? '' : 's'} once enough grades exist.</Text>
            )}
          </View>
        ))}

        <TouchableOpacity style={[styles.addButton, { borderColor: colors.brand }]} onPress={addCategory}>
          <FontAwesome name="plus" size={12} color={colors.brand} />
          <Text style={[styles.addText, { color: colors.brand }]}>Add category</Text>
        </TouchableOpacity>

        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Extra credit rule</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {(Object.keys(POLICY_COPY) as ExtraCreditPolicy[]).map((value, index) => (
            <TouchableOpacity
              key={value}
              style={[styles.policyRow, index < 2 && { borderBottomWidth: 0.5, borderBottomColor: colors.line }]}
              onPress={() => setPolicy(value)}
            >
              <FontAwesome name={policy === value ? 'check-circle' : 'circle-o'} size={18} color={policy === value ? colors.brand : colors.ink3} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.policyLabel, { color: colors.ink }]}>{POLICY_COPY[value].label}</Text>
                <Text style={[styles.policyDetail, { color: colors.ink3 }]}>{POLICY_COPY[value].detail}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[styles.saveButton, { backgroundColor: colors.brand }]} onPress={save}>
          {(createCategory.isPending || updateCategory.isPending || deleteCategory.isPending || updateCourse.isPending)
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveText}>Save grade rules</Text>}
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
  totalCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderRadius: 13, padding: 13, marginBottom: 12 },
  totalLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  totalValue: { fontSize: 18, fontWeight: '800' },
  card: { borderRadius: 16, borderWidth: 0.5, padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameInput: { flex: 1, minHeight: 42, borderBottomWidth: 1, fontSize: 16, fontWeight: '700' },
  fields: { flexDirection: 'row', gap: 12, marginTop: 13 },
  label: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, marginBottom: 5 },
  input: { height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, fontWeight: '700' },
  stepper: { height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepValue: { fontSize: 15, fontWeight: '800' },
  hint: { fontSize: 11.5, lineHeight: 16, marginTop: 9 },
  addButton: { height: 44, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 24 },
  addText: { fontSize: 13.5, fontWeight: '700' },
  sectionTitle: { fontSize: 17, fontWeight: '800', marginBottom: 9 },
  policyRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 11 },
  policyLabel: { fontSize: 14, fontWeight: '700' },
  policyDetail: { fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  saveButton: { height: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
