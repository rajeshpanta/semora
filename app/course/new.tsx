import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, Platform, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { useCreateCourse, useSemesters, useCourses } from '@/lib/queries';
import { useAppStore } from '@/store/appStore';
import { COURSE_COLORS, COURSE_ICONS, COLORS, type CourseIcon } from '@/lib/constants';
import { SemesterPicker } from '@/components/SemesterPicker';

const FREE_COURSE_LIMIT = 3;

export default function NewCourseScreen() {
  const router = useRouter();
  const createCourse = useCreateCourse();
  const { data: semesters = [] } = useSemesters();
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const isPro = useAppStore((s) => s.isPro);
  const { data: existingCourses = [] } = useCourses(selectedSemesterId);

  const [semesterId, setSemesterId] = useState(selectedSemesterId || '');
  const [name, setName] = useState('');
  const [instructor, setInstructor] = useState('');
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [icon, setIcon] = useState<string>(COURSE_ICONS[0]);
  const [meetingTime, setMeetingTime] = useState('');
  const [officeHours, setOfficeHours] = useState('');

  const handleSubmit = async () => {
    if (!semesterId) {
      Alert.alert('Required', 'Please select a semester.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter a course name.');
      return;
    }
    if (!isPro && existingCourses.length >= FREE_COURSE_LIMIT) {
      Alert.alert(
        'Course Limit Reached',
        `Free accounts support up to ${FREE_COURSE_LIMIT} courses. Upgrade to Pro for unlimited courses.`,
        [
          { text: 'Upgrade', onPress: () => router.push('/paywall' as any) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    try {
      await createCourse.mutateAsync({
        semester_id: semesterId,
        name: name.trim(),
        instructor: instructor.trim() || undefined,
        meeting_time: meetingTime.trim() || undefined,
        office_hours: officeHours.trim() || undefined,
        color,
        icon,
      });
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      Keyboard.dismiss();
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to create course.');
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="always">
        <View style={styles.card}>
          {/* Preview */}
          <View style={styles.previewRow}>
            <View style={[styles.previewIcon, { backgroundColor: color + '20' }]}>
              <FontAwesome name={icon as any} size={22} color={color} />
            </View>
            <Text style={styles.previewName}>{name || 'Course Name'}</Text>
          </View>

          {/* Semester */}
          <Text style={styles.label}>Semester *</Text>
          {semesters.length > 0 ? (
            <SemesterPicker semesters={semesters} selectedId={semesterId} onSelect={setSemesterId} />
          ) : (
            <Text style={styles.hint}>Create a semester first</Text>
          )}

          {/* Name */}
          <Text style={styles.label}>Course Name *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. CS 101"
            placeholderTextColor="#c0c0cc"
            value={name}
            onChangeText={setName}
          />

          {/* Instructor */}
          <Text style={styles.label}>Instructor</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Prof. Smith"
            placeholderTextColor="#c0c0cc"
            value={instructor}
            onChangeText={setInstructor}
          />

          {/* Meeting Time */}
          <Text style={styles.label}>Meeting Time</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. MWF 10:00-10:50 AM, Room 320"
            placeholderTextColor="#c0c0cc"
            value={meetingTime}
            onChangeText={setMeetingTime}
          />

          {/* Office Hours */}
          <Text style={styles.label}>Office Hours</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Tue/Thu 2:00-3:30 PM"
            placeholderTextColor="#c0c0cc"
            value={officeHours}
            onChangeText={setOfficeHours}
          />

          {/* Color */}
          <Text style={styles.label}>Color</Text>
          <View style={styles.colorGrid}>
            {COURSE_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.colorCircle, { backgroundColor: c }, color === c && styles.colorSelected]}
                onPress={() => setColor(c)}
                activeOpacity={0.7}
              >
                {color === c && <FontAwesome name="check" size={12} color="#fff" />}
              </TouchableOpacity>
            ))}
          </View>

          {/* Icon */}
          <Text style={styles.label}>Icon</Text>
          <View style={styles.iconGrid}>
            {COURSE_ICONS.map((ic) => (
              <TouchableOpacity
                key={ic}
                style={[styles.iconButton, icon === ic && { borderColor: color, backgroundColor: color + '15' }]}
                onPress={() => setIcon(ic)}
                activeOpacity={0.7}
              >
                <FontAwesome name={ic as any} size={18} color={icon === ic ? color : '#94a3b8'} />
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: color }, createCourse.isPending && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={createCourse.isPending}
            activeOpacity={0.8}
          >
            {createCourse.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <FontAwesome name="plus" size={14} color="#fff" />
                <Text style={styles.buttonText}>Add Course</Text>
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
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  previewIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  previewName: { fontSize: 18, fontWeight: '700', color: '#0f172a', flex: 1 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  hint: { fontSize: 13, color: '#94a3b8', fontStyle: 'italic' },
  input: { height: 48, borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12, backgroundColor: '#fafafa', paddingHorizontal: 16, fontSize: 15, color: '#111' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorCircle: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  colorSelected: { borderWidth: 3, borderColor: 'rgba(255,255,255,0.8)', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconButton: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  button: { flexDirection: 'row', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 24, gap: 8 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
