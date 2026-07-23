import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/app/_layout';
import { createCourseCollaboration, listCollaborations } from '@/lib/collaboration';
import { SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useCourses } from '@/lib/queries';
import { useResponsive } from '@/lib/responsive';
import { useColors } from '@/lib/theme';
import { useAppStore } from '@/store/appStore';

export default function CollaborationHubScreen() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const { session } = useSession();
  const semesterId = useAppStore((state) => state.selectedSemesterId);
  const { data: courses = [] } = useCourses(semesterId);
  const queryClient = useQueryClient();
  const { data: collaborations = [], isLoading } = useQuery({
    queryKey: ['collaborations', session?.user.id],
    queryFn: () => listCollaborations(session!.user.id),
    enabled: !!session,
  });
  const create = useMutation({
    mutationFn: createCourseCollaboration,
    onSuccess: (collaboration) => {
      queryClient.invalidateQueries({ queryKey: ['collaborations'] });
      router.push(`/collaboration/${collaboration.id}` as any);
    },
    onError: (error: Error) => Alert.alert('Couldn’t create course space', error.message),
  });
  const sharedCourseIds = new Set(
    collaborations
      .filter((row) => row.owner_user_id === session?.user.id)
      .map((row) => row.course_id),
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Class Collaboration' }} />
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]}>
        <View style={[styles.hero, { backgroundColor: colors.brand50 }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.card }]}>
            <FontAwesome name="users" size={22} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroTitle, { color: colors.ink }]}>Plan together, stay in control</Text>
            <Text style={[styles.heroText, { color: colors.ink3 }]}>
              Share deadlines and group work while each classmate keeps a private planner and grades.
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.ink }]}>Your course spaces</Text>
        {!isLoading && collaborations.length === 0 && (
          <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.emptyTitle, { color: colors.ink }]}>No shared classes yet</Text>
            <Text style={[styles.emptyText, { color: colors.ink3 }]}>
              Start one below, then invite classmates with an expiring link.
            </Text>
          </View>
        )}
        {collaborations.map((row) => (
          <TouchableOpacity
            key={row.id}
            onPress={() => router.push(`/collaboration/${row.id}` as any)}
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <View style={[styles.courseIcon, { backgroundColor: `${row.course_color}18` }]}>
              <FontAwesome name="users" size={16} color={row.course_color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.ink }]}>{row.course_name}</Text>
              <Text style={[styles.rowSub, { color: colors.ink3 }]}>
                {row.member_count} {row.member_count === 1 ? 'member' : 'members'} · {row.membership.role}
              </Text>
            </View>
            <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
          </TouchableOpacity>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.ink, marginTop: 10 }]}>Start a course space</Text>
        {courses.filter((course) => !sharedCourseIds.has(course.id)).map((course) => (
          <TouchableOpacity
            key={course.id}
            disabled={create.isPending}
            onPress={() => create.mutate(course.id)}
            style={[styles.row, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <View style={[styles.colorDot, { backgroundColor: course.color }]} />
            <Text style={[styles.rowTitle, { flex: 1, color: colors.ink }]}>{course.name}</Text>
            <FontAwesome name="plus-circle" size={18} color={colors.brand} />
          </TouchableOpacity>
        ))}
        {courses.length === 0 && (
          <Text style={[styles.emptyText, { color: colors.ink3 }]}>
            Add a course first, then you can make it collaborative.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', padding: 20, paddingBottom: 45, gap: 10 },
  hero: { padding: 16, borderRadius: 19, flexDirection: 'row', gap: 13, marginBottom: 10 },
  heroIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 17, fontWeight: '800' },
  heroText: { fontSize: 13, lineHeight: 19, marginTop: 4 },
  sectionTitle: { fontSize: 19, fontFamily: 'Fraunces_700Bold', marginTop: 4, marginBottom: 2 },
  row: { minHeight: 66, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 },
  courseIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  colorDot: { width: 11, height: 11, borderRadius: 6 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 3, textTransform: 'capitalize' },
  empty: { padding: 17, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  emptyText: { fontSize: 13, lineHeight: 19, marginTop: 4 },
});
