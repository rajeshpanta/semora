import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { processSyllabus, type ProcessResult, FREE_COURSE_LIMIT } from '@/lib/syllabus';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/appStore';
import { COLORS, COURSE_COLORS, COURSE_ICONS } from '@/lib/constants';
import { useColors } from '@/lib/theme';

async function createDuplicateCourse(result: ProcessResult, userId: string): Promise<ProcessResult> {
  // Check course limit for free users
  const isPro = useAppStore.getState().isPro;
  if (!isPro) {
    const { count } = await supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('semester_id', result.semesterId);
    if ((count ?? 0) >= FREE_COURSE_LIMIT) {
      throw new Error(`Free accounts support up to ${FREE_COURSE_LIMIT} courses per semester. Upgrade to Pro for unlimited courses.`);
    }
  }

  // Get used colors in this semester
  const { data: existing } = await supabase
    .from('courses')
    .select('color, icon')
    .eq('semester_id', result.semesterId);

  const usedColors = new Set((existing || []).map((c) => c.color));
  const usedIcons = new Set((existing || []).map((c) => c.icon));
  const color = COURSE_COLORS.find((c) => !usedColors.has(c)) || COURSE_COLORS[Math.floor(Math.random() * COURSE_COLORS.length)];
  const icon = COURSE_ICONS.find((i) => !usedIcons.has(i)) || COURSE_ICONS[0];

  const { data: newCourse, error } = await supabase
    .from('courses')
    .insert({
      user_id: userId,
      semester_id: result.semesterId,
      name: `${result.courseName} (2)`,
      color,
      icon,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create duplicate: ${error.message}`);

  return { ...result, courseId: newCourse.id, courseName: newCourse.name, isExistingCourse: false };
}

export default function SyllabusUploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fileUri?: string; fileName?: string; mimeType?: string }>();
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);
  const colors = useColors();

  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [step, setStep] = useState(0); // 0-4 progress steps
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  // Auto-start processing when screen opens
  useEffect(() => {
    if (params.fileUri && !processing) {
      handleProcess();
    }
  }, [params.fileUri]);

  const handleProcess = async () => {
    if (!params.fileUri) {
      Alert.alert('No File', 'No file was selected.');
      router.back();
      return;
    }

    setProcessing(true);
    setStep(1);
    setStatus('Reading document...');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      setStep(2);
      setStatus('Analyzing with AI...');

      const result = await processSyllabus(
        params.fileUri,
        params.fileName || 'syllabus.pdf',
        params.mimeType || 'application/pdf',
        session.user.id,
      );

      setStep(3);
      setStatus('Found deadlines!');

      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Auto-select the semester
      setSelectedSemester(result.semesterId);

      setStep(4);

      // Check if course already existed
      if (result.isExistingCourse) {
        Alert.alert(
          'Course Already Exists',
          `"${result.courseName}" already exists in ${result.semesterName}. What would you like to do?`,
          [
            {
              text: 'Add to Existing',
              onPress: () => navigateToReview(result),
            },
            {
              text: 'Create Duplicate',
              onPress: async () => {
                // Create a new course with "(2)" suffix
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) throw new Error('Not authenticated');
                  const dupResult = await createDuplicateCourse(result, session.user.id);
                  navigateToReview(dupResult);
                } catch (err: any) {
                  Alert.alert('Error', err.message);
                  navigateToReview(result); // fallback to existing
                }
              },
            },
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => {
                setProcessing(false);
                setStep(0);
                setStatus('');
                router.back();
              },
            },
          ],
        );
      } else {
        setStatus(`Created "${result.courseName}" in ${result.semesterName}`);
        timerRef.current = setTimeout(() => navigateToReview(result), 800);
      }
    } catch (error: any) {
      setProcessing(false);
      setStep(0);
      setStatus('');
      Alert.alert(
        'Scan Failed',
        error.message || 'Failed to process syllabus. Please try again.',
        [
          { text: 'Try Again', onPress: () => handleProcess() },
          { text: 'Go Back', onPress: () => router.back(), style: 'cancel' },
        ],
      );
    }
  };

  const navigateToReview = (result: any) => {
    router.replace({
      pathname: '/syllabus/review',
      params: {
        parseRunId: result.parseRunId,
        courseId: result.courseId,
        courseName: result.courseName,
        semesterName: result.semesterName,
        items: JSON.stringify(result.extraction.items),
      },
    } as any);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <View style={styles.center}>
        {/* File info */}
        <View style={[styles.fileChip, { backgroundColor: colors.brand50 }]}>
          <FontAwesome
            name={params.mimeType?.includes('image') ? 'image' : 'file-pdf-o'}
            size={14}
            color={colors.brand}
          />
          <Text style={[styles.fileName, { color: colors.brand }]} numberOfLines={1}>{params.fileName || 'Document'}</Text>
        </View>

        {/* Progress */}
        <View style={styles.progressContainer}>
          {processing ? (
            <>
              <View style={[styles.spinnerRing, { backgroundColor: colors.brand50 }]}>
                <ActivityIndicator size="large" color={colors.brand} />
              </View>
              <Text style={[styles.statusText, { color: colors.ink }]}>{status}</Text>

              {/* Progress steps */}
              <View style={styles.steps}>
                <StepDot active={step >= 1} done={step > 1} label="Upload" />
                <View style={[styles.stepLine, step >= 2 && { backgroundColor: colors.teal }]} />
                <StepDot active={step >= 2} done={step > 2} label="AI Extract" />
                <View style={[styles.stepLine, step >= 3 && { backgroundColor: colors.teal }]} />
                <StepDot active={step >= 3} done={step > 3} label="Organize" />
                <View style={[styles.stepLine, step >= 4 && { backgroundColor: colors.teal }]} />
                <StepDot active={step >= 4} done={step >= 4} label="Review" />
              </View>

              <Text style={[styles.hint, { color: colors.ink3 }]}>This may take 10-30 seconds</Text>
            </>
          ) : (
            <>
              <View style={[styles.readyIcon, { backgroundColor: colors.brand50 }]}>
                <FontAwesome name="magic" size={32} color={colors.brand} />
              </View>
              <Text style={[styles.readyTitle, { color: colors.ink }]}>Ready to scan</Text>
              <Text style={[styles.readyText, { color: colors.ink3 }]}>
                We'll extract the course name, semester,{'\n'}and all deadlines automatically.
              </Text>
              <TouchableOpacity style={[styles.startBtn, { backgroundColor: colors.brand }]} onPress={handleProcess} activeOpacity={0.8}>
                <FontAwesome name="bolt" size={16} color="#fff" />
                <Text style={styles.startBtnText}>Start Scanning</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  const colors = useColors();
  return (
    <View style={sdStyles.container}>
      <View style={[sdStyles.dot, active && { borderColor: colors.brand }, done && { backgroundColor: colors.teal, borderColor: colors.teal }]}>
        {done && <FontAwesome name="check" size={8} color="#fff" />}
      </View>
      <Text style={[sdStyles.label, { color: colors.ink3 }, active && { color: colors.brand }]}>{label}</Text>
    </View>
  );
}

const sdStyles = StyleSheet.create({
  container: { alignItems: 'center', gap: 4 },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#e5e7eb', justifyContent: 'center', alignItems: 'center' },
  dotActive: { borderColor: COLORS.brand },
  dotDone: { backgroundColor: COLORS.teal, borderColor: COLORS.teal },
  label: { fontSize: 9, color: COLORS.ink3, fontWeight: '500' },
  labelActive: { color: COLORS.brand, fontWeight: '600' },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  fileChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.brand50, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, marginBottom: 32 },
  fileName: { fontSize: 13, fontWeight: '500', color: COLORS.brand, maxWidth: 200 },
  progressContainer: { alignItems: 'center', width: '100%' },
  spinnerRing: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.brand50, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  statusText: { fontSize: 18, fontWeight: '600', color: COLORS.ink, marginBottom: 24 },
  steps: { flexDirection: 'row', alignItems: 'center', gap: 0, marginBottom: 20 },
  stepLine: { width: 24, height: 2, backgroundColor: '#e5e7eb', marginHorizontal: 4 },
  stepLineDone: { backgroundColor: COLORS.teal },
  hint: { fontSize: 12, color: COLORS.ink3 },
  readyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.brand50, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  readyTitle: { fontSize: 20, fontWeight: '600', color: COLORS.ink, marginBottom: 8 },
  readyText: { fontSize: 14, color: COLORS.ink3, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  startBtn: { flexDirection: 'row', height: 52, paddingHorizontal: 32, backgroundColor: COLORS.brand, borderRadius: 14, justifyContent: 'center', alignItems: 'center', gap: 10 },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
