import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import { COLORS, TASK_TYPE_LABELS } from '@/lib/constants';
import { scheduleTaskReminders } from '@/lib/notifications';
import type { ExtractedItem } from '@/lib/gemini';

interface ReviewItem extends ExtractedItem {
  accepted: boolean;
  editing: boolean;
}

export default function SyllabusReviewScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useLocalSearchParams<{ parseRunId?: string; courseId?: string; courseName?: string; semesterName?: string; items?: string }>();

  const [items, setItems] = useState<ReviewItem[]>(() => {
    try {
      const parsed: ExtractedItem[] = JSON.parse(params.items || '[]');
      return parsed.map((item) => ({ ...item, accepted: true, editing: false }));
    } catch {
      return [];
    }
  });
  const [saving, setSaving] = useState(false);

  const acceptedCount = items.filter((i) => i.accepted).length;

  const toggleAccept = (index: number) => {
    setItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, accepted: !item.accepted } : item
    ));
    if (Platform.OS === 'ios') Haptics.selectionAsync();
  };

  const toggleEdit = (index: number) => {
    setItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, editing: !item.editing } : item
    ));
  };

  const updateItem = (index: number, field: keyof ExtractedItem, value: any) => {
    setItems((prev) => prev.map((item, i) =>
      i === index ? { ...item, [field]: value } : item
    ));
  };

  const handleSave = async () => {
    const accepted = items.filter((i) => i.accepted);
    if (accepted.length === 0) {
      Alert.alert('No Items', 'Please accept at least one item to save.');
      return;
    }

    setSaving(true);
    Keyboard.dismiss();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Create tasks for each accepted item
      for (const item of accepted) {
        const { data: task, error } = await supabase
          .from('tasks')
          .insert({
            user_id: session.user.id,
            course_id: params.courseId,
            title: item.title,
            description: item.description,
            type: item.type,
            due_date: item.due_date,
            due_time: item.due_time ? `${item.due_time}:00` : null,
            weight: item.weight,
            source: 'gemini_parsed',
            parse_run_id: params.parseRunId,
          })
          .select()
          .single();

        if (error) {
          console.warn('Failed to create task:', error.message);
          continue;
        }

        // Schedule notifications
        if (task) {
          scheduleTaskReminders(
            task.id, task.title, params.courseName || 'Course', task.due_date, task.due_time, session.user.id,
          ).catch(() => {});
        }
      }

      // Update parse run with accept/reject counts
      if (params.parseRunId) {
        await supabase
          .from('parse_runs')
          .update({
            items_accepted: accepted.length,
            items_rejected: items.length - accepted.length,
          })
          .eq('id', params.parseRunId);
      }

      // Invalidate ALL queries so everything refreshes immediately
      await qc.invalidateQueries();

      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        'Saved!',
        `${accepted.length} tasks added to your course.`,
        [{ text: 'View Course', onPress: () => router.replace(`/course/${params.courseId}` as any) },
         { text: 'Go Home', onPress: () => router.replace('/(tabs)' as any) }],
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save tasks.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        {/* Header */}
        {/* Course info banner */}
        {params.courseName && (
          <View style={styles.courseBanner}>
            <FontAwesome name="book" size={14} color={COLORS.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.courseBannerName}>{params.courseName}</Text>
              {params.semesterName && <Text style={styles.courseBannerSem}>{params.semesterName}</Text>}
            </View>
            <View style={styles.autoCreatedBadge}><Text style={styles.autoCreatedText}>AUTO</Text></View>
          </View>
        )}

        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>{items.length} items found</Text>
            <Text style={styles.subtitle}>{acceptedCount} selected to save</Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              const allAccepted = items.every((i) => i.accepted);
              setItems((prev) => prev.map((i) => ({ ...i, accepted: !allAccepted })));
            }}
          >
            <Text style={styles.toggleAllText}>
              {items.every((i) => i.accepted) ? 'Deselect all' : 'Select all'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Items */}
        {items.map((item, index) => (
          <View key={index} style={[styles.itemCard, !item.accepted && styles.itemRejected]}>
            <View style={styles.itemTop}>
              {/* Accept toggle */}
              <TouchableOpacity onPress={() => toggleAccept(index)} hitSlop={8}>
                <View style={[styles.cbx, item.accepted && styles.cbxActive]}>
                  {item.accepted && <FontAwesome name="check" size={10} color="#fff" />}
                </View>
              </TouchableOpacity>

              <View style={{ flex: 1 }}>
                {item.editing ? (
                  <TextInput
                    style={styles.editInput}
                    value={item.title}
                    onChangeText={(t) => updateItem(index, 'title', t)}
                  />
                ) : (
                  <Text style={[styles.itemTitle, !item.accepted && styles.itemTitleRejected]}>
                    {item.title}
                  </Text>
                )}

                <View style={styles.itemMeta}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{TASK_TYPE_LABELS[item.type] || item.type}</Text>
                  </View>
                  <Text style={styles.itemDate}>
                    {item.due_date ? format(new Date(item.due_date + 'T00:00:00'), 'MMM d, yyyy') : 'No date'}
                  </Text>
                  {item.due_time && <Text style={styles.itemTime}>{item.due_time}</Text>}
                  {item.weight != null && <Text style={styles.itemWeight}>{item.weight}%</Text>}
                </View>

                {/* Confidence indicator */}
                {item.confidence < 0.8 && (
                  <View style={styles.lowConfidence}>
                    <FontAwesome name="exclamation-triangle" size={10} color={COLORS.amber} />
                    <Text style={styles.lowConfidenceText}>Low confidence — please verify</Text>
                  </View>
                )}
              </View>

              {/* Edit toggle */}
              <TouchableOpacity onPress={() => toggleEdit(index)} hitSlop={8}>
                <FontAwesome name={item.editing ? 'check-circle' : 'pencil'} size={16} color={item.editing ? COLORS.teal : COLORS.ink3} />
              </TouchableOpacity>
            </View>

            {/* Edit fields */}
            {item.editing && (
              <View style={styles.editFields}>
                {/* Type selector */}
                <Text style={styles.editFieldLabel}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.typeChipRow}>
                    {(['assignment', 'quiz', 'exam', 'project', 'reading', 'other'] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[styles.typeChip, item.type === t && styles.typeChipActive]}
                        onPress={() => updateItem(index, 'type', t)}
                      >
                        <Text style={[styles.typeChipText, item.type === t && styles.typeChipTextActive]}>
                          {TASK_TYPE_LABELS[t]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <View style={styles.editRow}>
                  <Text style={styles.editLabel}>Date:</Text>
                  <TextInput
                    style={styles.editSmallInput}
                    value={item.due_date}
                    onChangeText={(t) => updateItem(index, 'due_date', t)}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
                <View style={styles.editRow}>
                  <Text style={styles.editLabel}>Time:</Text>
                  <TextInput
                    style={styles.editSmallInput}
                    value={item.due_time || ''}
                    onChangeText={(t) => updateItem(index, 'due_time', t || null)}
                    placeholder="HH:MM"
                  />
                </View>
                <View style={styles.editRow}>
                  <Text style={styles.editLabel}>Weight:</Text>
                  <TextInput
                    style={styles.editSmallInput}
                    value={item.weight != null ? String(item.weight) : ''}
                    onChangeText={(t) => updateItem(index, 'weight', t ? parseFloat(t) : null)}
                    placeholder="%"
                    keyboardType="decimal-pad"
                  />
                </View>

                {/* Description */}
                <Text style={styles.editFieldLabel}>Description</Text>
                <TextInput
                  style={styles.editDescInput}
                  value={item.description || ''}
                  onChangeText={(t) => updateItem(index, 'description', t || null)}
                  placeholder="Add notes..."
                  placeholderTextColor={COLORS.ink3}
                  multiline
                  numberOfLines={2}
                  textAlignVertical="top"
                />
              </View>
            )}

            {item.description && !item.editing && (
              <Text style={styles.itemDesc}>{item.description}</Text>
            )}
          </View>
        ))}

        {items.length === 0 && (
          <View style={styles.emptyCard}>
            <FontAwesome name="search" size={24} color={COLORS.ink3} />
            <Text style={styles.emptyText}>No deadlines found in this document</Text>
            <Text style={styles.emptySub}>Try uploading a different syllabus</Text>
          </View>
        )}
      </ScrollView>

      {/* Save button */}
      {items.length > 0 && (
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving || acceptedCount === 0}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <FontAwesome name="check" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Save {acceptedCount} tasks</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 18, paddingBottom: 100 },
  courseBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: COLORS.brand50, padding: 12, borderRadius: 12, marginBottom: 16 },
  courseBannerName: { fontSize: 14, fontWeight: '600', color: COLORS.brand },
  courseBannerSem: { fontSize: 11, color: COLORS.ink3, marginTop: 1 },
  autoCreatedBadge: { backgroundColor: COLORS.teal50, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  autoCreatedText: { fontSize: 9, fontWeight: '700', color: COLORS.teal },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '600', color: COLORS.ink },
  subtitle: { fontSize: 13, color: COLORS.ink3, marginTop: 2 },
  toggleAllText: { fontSize: 13, fontWeight: '600', color: COLORS.brand },
  // Item card
  itemCard: { backgroundColor: COLORS.card, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 0.5, borderColor: COLORS.line },
  itemRejected: { opacity: 0.5 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cbx: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: COLORS.ink3, justifyContent: 'center', alignItems: 'center', marginTop: 2 },
  cbxActive: { backgroundColor: COLORS.teal, borderColor: COLORS.teal },
  itemTitle: { fontSize: 15, fontWeight: '500', color: COLORS.ink },
  itemTitleRejected: { textDecorationLine: 'line-through', color: COLORS.ink3 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  typeBadge: { backgroundColor: COLORS.brand50, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeText: { fontSize: 10, fontWeight: '600', color: COLORS.brand },
  itemDate: { fontSize: 12, color: COLORS.ink2 },
  itemTime: { fontSize: 12, color: COLORS.ink3 },
  itemWeight: { fontSize: 12, color: COLORS.ink3, fontWeight: '600' },
  itemDesc: { fontSize: 12, color: COLORS.ink3, marginTop: 8, marginLeft: 34 },
  lowConfidence: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, backgroundColor: COLORS.amber50, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start' },
  lowConfidenceText: { fontSize: 10, color: COLORS.amber, fontWeight: '500' },
  // Edit
  editInput: { fontSize: 15, fontWeight: '500', color: COLORS.ink, borderBottomWidth: 1, borderBottomColor: COLORS.brand, paddingBottom: 2 },
  editFields: { marginTop: 10, marginLeft: 34, gap: 6 },
  editFieldLabel: { fontSize: 11, fontWeight: '600', color: COLORS.ink3, marginTop: 4, marginBottom: 4 },
  typeChipRow: { flexDirection: 'row', gap: 6 },
  typeChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#f1f5f9' },
  typeChipActive: { backgroundColor: COLORS.brand },
  typeChipText: { fontSize: 11, fontWeight: '600', color: COLORS.ink2 },
  typeChipTextActive: { color: '#fff' },
  editDescInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: COLORS.ink, minHeight: 48, backgroundColor: '#fafafa' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editLabel: { fontSize: 12, color: COLORS.ink3, width: 50 },
  editSmallInput: { flex: 1, height: 32, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, paddingHorizontal: 8, fontSize: 13, color: COLORS.ink },
  // Empty
  emptyCard: { alignItems: 'center', paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '500', color: COLORS.ink },
  emptySub: { fontSize: 13, color: COLORS.ink3 },
  // Footer
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 18, paddingBottom: 34, backgroundColor: COLORS.paper, borderTopWidth: 0.5, borderTopColor: COLORS.line },
  saveBtn: { height: 52, backgroundColor: COLORS.brand, borderRadius: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
