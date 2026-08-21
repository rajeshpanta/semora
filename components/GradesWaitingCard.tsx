import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { FONTS, WEB_CARD_SHADOW } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useUpdateTask } from '@/lib/queries';
import { track } from '@/lib/analytics';

/** How many rows before the card defers to the full screen. */
const PREVIEW_LIMIT = 5;

/**
 * Work that is done but ungraded — the queue that feeds everything else.
 *
 * This is not a list of finished chores. Semora's grade projection, the
 * academic-risk signals, the "needs attention" tile and the whole answer to
 * "where do I stand this semester" are computed from scores, and a score only
 * exists because someone typed it in after handing the work back. An ungraded
 * completed task is therefore a hole in the model, not a tidy row.
 *
 * It used to sit under the day's task list, which put the most consequential
 * queue in the app below the least consequential thing on the screen and let
 * it grow without limit. On desktop it belongs in the rail beside Courses,
 * where the other "where do I stand" surfaces already live — capped at five,
 * with the rest one tap away.
 *
 * The score is typed HERE. "Add grade" used to open the task screen, which
 * meant recording four grades cost four navigations and four returns, and the
 * dashboard you were reading was gone by the second one. A percentage is one
 * number; asking for a screen to collect it is why this queue grows. The task
 * screen still exists for points-based entry and everything else — this is the
 * fast path for the common case.
 */
export default function GradesWaitingCard({
  tasks,
}: {
  /** Completed tasks with no score recorded, most recent first. */
  tasks: any[];
}) {
  const colors = useColors();
  const router = useRouter();
  const updateTask = useUpdateTask();
  const [openId, setOpenId] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async (task: any) => {
    const score = parseFloat(value);
    if (isNaN(score) || score < 0 || score > 100) return;
    setSaving(true);
    try {
      await updateTask.mutateAsync({ id: task.id, score });
      track('grade_recorded', { screen: 'today_rail', percent: Math.round(score) });
      setOpenId(null);
      setValue('');
    } finally {
      setSaving(false);
    }
  };

  if (tasks.length === 0) return null;
  const shown = tasks.slice(0, PREVIEW_LIMIT);
  const remaining = tasks.length - shown.length;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.card, borderColor: colors.line },
        WEB_CARD_SHADOW as any,
      ]}
    >
      <View style={[styles.head, { borderBottomColor: colors.line }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.ink }]}>Waiting on a grade</Text>
          <Text style={[styles.sub, { color: colors.ink3 }]}>
            {tasks.length === 1
              ? '1 finished item has no score yet'
              : `${tasks.length} finished items have no score yet`}
          </Text>
        </View>
        <View style={[styles.count, { backgroundColor: colors.amber50 }]}>
          <Text style={[styles.countText, { color: colors.amber }]}>{tasks.length}</Text>
        </View>
      </View>

      {shown.map((task) => (
        <View key={task.id} style={[styles.row, { borderBottomColor: colors.line }]}>
          <View style={[styles.dot, { backgroundColor: task.courses?.color ?? colors.ink3 }]} />
          <TouchableOpacity
            style={{ flex: 1, minWidth: 0 }}
            onPress={() => router.push(`/task/${task.id}` as any)}
            accessibilityRole="button"
            accessibilityLabel={`Open ${task.title}`}
          >
            <Text style={[styles.name, { color: colors.ink }]} numberOfLines={1}>
              {task.title}
            </Text>
            <Text style={[styles.meta, { color: colors.ink3 }]} numberOfLines={1}>
              {task.courses?.name ?? ''}
            </Text>
          </TouchableOpacity>

          {openId === task.id ? (
            <View style={styles.entry}>
              <TextInput
                value={value}
                onChangeText={setValue}
                keyboardType="numeric"
                inputMode="numeric"
                autoFocus
                placeholder="88"
                placeholderTextColor={colors.ink3}
                onSubmitEditing={() => save(task)}
                style={[styles.input, { color: colors.ink, borderColor: colors.brand100 }]}
                accessibilityLabel={`Percentage for ${task.title}`}
              />
              <Text style={[styles.pct, { color: colors.ink3 }]}>%</Text>
              <TouchableOpacity
                onPress={() => save(task)}
                disabled={saving}
                style={[styles.save, { backgroundColor: colors.brand }]}
                accessibilityRole="button"
                accessibilityLabel="Save grade"
              >
                {saving
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <FontAwesome name="check" size={11} color="#fff" />}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.add, { borderColor: colors.brand100 }]}
              onPress={() => { setOpenId(task.id); setValue(''); }}
              accessibilityRole="button"
              accessibilityLabel={`Add a grade for ${task.title}`}
            >
              <Text style={[styles.addText, { color: colors.brand }]}>Add grade</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {remaining > 0 && (
        <TouchableOpacity
          style={styles.more}
          onPress={() => router.push('/completed-work' as any)}
          accessibilityRole="button"
        >
          <Text style={[styles.moreText, { color: colors.brand }]}>
            {`View all ${tasks.length}`}
          </Text>
          <FontAwesome name="angle-right" size={13} color={colors.brand} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  title: { fontFamily: FONTS.display, fontSize: 15 },
  sub: { fontSize: 11.5, marginTop: 1 },
  count: { minWidth: 24, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, alignItems: 'center' },
  countText: { fontSize: 12, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderBottomWidth: 1,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  name: { fontSize: 12.5, fontWeight: '500' },
  meta: { fontSize: 11, marginTop: 1 },
  add: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: {
    width: 44, borderWidth: 1, borderRadius: 7,
    paddingHorizontal: 6, paddingVertical: 3, fontSize: 12.5, textAlign: 'right',
  },
  pct: { fontSize: 11.5, marginRight: 2 },
  save: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 11, fontWeight: '700' },
  more: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 11,
  },
  moreText: { fontSize: 12, fontWeight: '700' },
});
