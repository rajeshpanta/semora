import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Alert, Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { listHiddenLmsTasks, setLmsTaskHidden } from '@/lib/lms';
import { SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { track } from '@/lib/analytics';

/**
 * The way back.
 *
 * Hiding a synced assignment takes it out of every list, count, reminder and
 * calendar export — which is exactly what the student asked for, and also means
 * the task screen they hid it from is no longer reachable. Without somewhere
 * that still lists them, "Hide" would be a one-way door dressed up as a
 * reversible one, which is the same broken promise "Delete" used to make in the
 * opposite direction.
 *
 * Deliberately a plain list with one action. Nothing is grouped by course or
 * sorted by due date: this screen is visited to undo one specific mistake,
 * usually within a minute of making it, so newest-hidden-first is the only
 * order that matters.
 */
export default function HiddenLmsAssignments() {
  const colors = useColors();
  const queryClient = useQueryClient();
  const [restoring, setRestoring] = useState<string | null>(null);

  const { data: hidden, isLoading, refetch } = useQuery({
    queryKey: ['lms', 'hidden-tasks'],
    queryFn: listHiddenLmsTasks,
  });

  const restore = async (taskId: string) => {
    setRestoring(taskId);
    try {
      await setLmsTaskHidden(taskId, false);
      track('lms_task_restored', { screen: 'lms_hidden' });
      await refetch();
      // The task is going back into every list this screen took it out of.
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err: any) {
      Alert.alert('Could not restore it', err?.message ?? 'Something went wrong. Please try again.');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Hidden assignments' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.inner}>
          <Text style={[styles.intro, { color: colors.ink2 }]}>
            Assignments you have hidden from Semora. They are still in Canvas — hiding one here
            never changes anything there.
          </Text>

          {isLoading ? (
            <ActivityIndicator style={{ marginTop: 24 }} />
          ) : !hidden?.length ? (
            <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <FontAwesome name="eye" size={18} color={colors.ink3} />
              <Text style={[styles.emptyText, { color: colors.ink2 }]}>
                Nothing is hidden. Anything you hide from an assignment's page shows up here.
              </Text>
            </View>
          ) : (
            hidden.map((task) => (
              <View
                key={task.id}
                style={[styles.row, { backgroundColor: colors.card, borderColor: colors.line }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.title, { color: colors.ink }]} numberOfLines={2}>
                    {task.title}
                  </Text>
                  <Text style={[styles.meta, { color: colors.ink3 }]} numberOfLines={1}>
                    {task.courseName} · due {task.due_date}
                  </Text>
                </View>
                <TouchableOpacity
                  disabled={restoring === task.id}
                  onPress={() => restore(task.id)}
                  style={[styles.restore, { backgroundColor: colors.brand50 }]}
                >
                  {restoring === task.id ? (
                    <ActivityIndicator size="small" color={colors.brand} />
                  ) : (
                    <Text style={[styles.restoreText, { color: colors.brand }]}>Restore</Text>
                  )}
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  inner: { width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  intro: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  empty: { borderWidth: 1, borderRadius: 12, padding: 20, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10,
  },
  title: { fontSize: 14, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 3 },
  restore: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, minWidth: 78, alignItems: 'center' },
  restoreText: { fontSize: 13, fontWeight: '700' },
});
