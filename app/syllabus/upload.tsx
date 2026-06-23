import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Haptics from 'expo-haptics';
import { processSyllabus, type ProcessResult, FREE_COURSE_LIMIT, isFreeLimitError } from '@/lib/syllabus';
import { supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/appStore';
import { track } from '@/lib/analytics';
import { COLORS, FONTS, COURSE_COLORS, COURSE_ICONS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';

const TYPE_SINGULAR: Record<string, string> = {
  assignment: 'assignment', quiz: 'quiz', exam: 'exam',
  project: 'project', reading: 'reading', other: 'item',
};
const TYPE_PLURAL: Record<string, string> = {
  assignment: 'assignments', quiz: 'quizzes', exam: 'exams',
  project: 'projects', reading: 'readings', other: 'items',
};
// Exams first — they're what students care about most — then the rest.
const TYPE_ORDER = ['exam', 'assignment', 'quiz', 'project', 'reading', 'other'];

function summarizeItems(items: { type: string }[]): { type: string; count: number; label: string }[] {
  const counts: Record<string, number> = {};
  for (const it of items) counts[it.type] = (counts[it.type] || 0) + 1;
  return TYPE_ORDER.filter((t) => counts[t]).map((t) => ({
    type: t,
    count: counts[t],
    label: `${counts[t]} ${counts[t] === 1 ? TYPE_SINGULAR[t] : TYPE_PLURAL[t]}`,
  }));
}

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
      throw new Error(`Free accounts support up to ${FREE_COURSE_LIMIT} courses per semester (this is separate from your scans). Upgrade to Pro for unlimited courses, or re-scan a course you already have.`);
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

  // Preserve original error so callers can detect P0001 (free-tier
  // trigger) and surface the Upgrade prompt instead of a generic alert.
  if (error) throw error;

  return { ...result, courseId: newCourse.id, courseName: newCourse.name, isExistingCourse: false };
}

export default function SyllabusUploadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ fileUri?: string; fileName?: string; mimeType?: string }>();
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);
  const colors = useColors();
  const { isWide } = useResponsive();
  const qc = useQueryClient();

  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [step, setStep] = useState(0); // 0-4 progress steps
  // The "aha" payload — set once extraction succeeds for a new course so we
  // can show a celebratory summary instead of silently jumping to review.
  const [summary, setSummary] = useState<ProcessResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rotateRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build anticipation while Gemini works (10-30s) — specific, sequential
  // lines read as "real work happening" far better than one static spinner.
  const ANTICIPATION = [
    'Reading your syllabus…',
    'Finding exam dates…',
    'Extracting assignment due dates…',
    'Reading the grading breakdown…',
    'Building your calendar…',
  ];

  const stopRotation = () => {
    if (rotateRef.current) { clearInterval(rotateRef.current); rotateRef.current = null; }
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      stopRotation();
    };
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
      setStatus(ANTICIPATION[0]);
      // Cycle the anticipation copy while the (slow) extraction runs.
      let ai = 0;
      stopRotation();
      rotateRef.current = setInterval(() => {
        ai = (ai + 1) % ANTICIPATION.length;
        setStatus(ANTICIPATION[ai]);
      }, 2200);

      // Hard ceiling so the locked modal can never strand the user if the
      // pipeline hangs (network black hole, edge function stall). On
      // timeout the existing Scan Failed alert offers Try Again / Go Back.
      // Hard ceiling via AbortController so a hung pipeline can't strand the
      // locked modal. Critically, abort() CANCELS the in-flight Gemini fetch
      // so processSyllabus bails before any DB writes — no orphan course /
      // double-burned scan that the old Promise.race timeout left behind.
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 120_000);
      const result = await processSyllabus(
        params.fileUri,
        params.fileName || 'syllabus.pdf',
        params.mimeType || 'application/pdf',
        session.user.id,
        controller.signal,
      ).catch((err) => {
        if (timedOut) throw new Error('This is taking longer than expected. Please try again.');
        throw err;
      }).finally(() => clearTimeout(timeout));

      stopRotation();
      track('scan_completed', { screen: 'scan', count: result.extraction.items.length });
      // processSyllabus just inserted the syllabus_uploads row, so the
      // free-scan count changed. Refresh it now so the scan tab shows the new
      // usage immediately instead of a stale "N free scans left".
      qc.invalidateQueries({ queryKey: ['scanCount'] });
      setStep(3);
      setStatus('Found deadlines!');

      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Auto-select the semester
      setSelectedSemester(result.semesterId);

      setStep(4);

      // Re-upload of an already-imported syllabus. Two outcomes the user
      // actually wants:
      //   1. "I scanned the wrong file / forgot I already added it"
      //      → Open Existing, drop the extracted tasks on the floor
      //        (the upload row is kept for the View Syllabus link).
      //   2. "I genuinely want a separate course with the same syllabus"
      //      → Create Duplicate, get a "(2)" course + review screen.
      // We deliberately don't offer "merge into existing" here: the
      // review screen has no per-item dedup against current tasks, so
      // re-importing the same syllabus would silently duplicate every
      // task. Better to remove the foot-gun than to ship a fix later.
      if (result.isExistingCourse) {
        Alert.alert(
          'This Course Already Exists',
          `"${result.courseName}" was already added to ${result.semesterName}. Re-importing the same syllabus would duplicate every task.\n\nOpen the existing course, or create a separate duplicate?`,
          [
            {
              text: 'Create Duplicate',
              onPress: async () => {
                try {
                  const { data: { session } } = await supabase.auth.getSession();
                  if (!session) throw new Error('Not authenticated');
                  const dupResult = await createDuplicateCourse(result, session.user.id);
                  navigateToReview(dupResult);
                } catch (err: any) {
                  // No fallback to "add to existing" anymore (would
                  // duplicate tasks). Send the user back to the scan
                  // tab so the spinner resolves.
                  setProcessing(false);
                  setStep(0);
                  setStatus('');
                  if (isFreeLimitError(err)) {
                    Alert.alert('Course Limit Reached', err.message, [
                      { text: 'Upgrade', onPress: () => router.push('/paywall' as any) },
                      { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
                    ]);
                  } else {
                    Alert.alert('Error', err.message);
                    router.back();
                  }
                }
              },
            },
            {
              text: 'Open Existing',
              style: 'cancel',
              onPress: () => router.replace(`/course/${result.courseId}` as any),
            },
          ],
        );
      } else if (result.extraction.items.length === 0) {
        // Nothing to celebrate — let the review screen show its "no
        // deadlines found" empty state with the try-again guidance.
        navigateToReview(result);
      } else {
        // The aha moment: stop here and celebrate what we found instead of
        // silently skipping to the review list. Let the user *feel* the magic.
        setProcessing(false);
        setSummary(result);
      }
    } catch (error: any) {
      stopRotation();
      setProcessing(false);
      setStep(0);
      setStatus('');
      // Free-tier limit (scan or course) — surface the Upgrade prompt
      // even when the client thought the user was Pro (stale isPro).
      if (isFreeLimitError(error)) {
        // Hit the free limit -> upsell. Expected, not a failure.
        track('scan_limit_hit', { screen: 'scan' });
        Alert.alert(
          'Pro feature',
          error.message,
          [
            { text: 'Upgrade', onPress: () => router.push('/paywall' as any) },
            { text: 'Go Back', onPress: () => router.back(), style: 'cancel' },
          ],
        );
        return;
      }
      // A real failure (network, Gemini, parse, timeout) — capture why.
      track('scan_failed', { screen: 'scan', reason: String(error?.message ?? error).slice(0, 200) });
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
      {/* While the pipeline is running, dismissing this modal (swipe-down /
          header back) would burn a free scan and orphan the extraction —
          the work finishes headless and the user never sees the results.
          Lock the sheet until processing settles. */}
      <Stack.Screen options={{ gestureEnabled: !processing, headerBackVisible: !processing }} />
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
        <View style={[styles.progressContainer, { maxWidth: isWide ? 700 : 500, alignSelf: 'center' }]}>
          {summary ? (
            <>
              <View style={[styles.celebrateIcon, { backgroundColor: colors.teal50 }]}>
                <Text style={styles.celebrateEmoji}>🎉</Text>
              </View>
              <Text style={[styles.celebrateTitle, { color: colors.ink }]}>
                Found {summary.extraction.items.length} deadline{summary.extraction.items.length !== 1 ? 's' : ''}!
              </Text>
              <Text style={[styles.celebrateSub, { color: colors.ink3 }]}>
                in {summary.courseName} · {summary.semesterName}
              </Text>

              <View style={styles.chipWrap}>
                {summarizeItems(summary.extraction.items).map((b) => (
                  <View key={b.type} style={[styles.chip, { backgroundColor: colors.brand50 }]}>
                    <Text style={[styles.chipText, { color: colors.brand }]}>{b.label}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.startBtn, { backgroundColor: colors.brand }]}
                onPress={() => navigateToReview(summary)}
                activeOpacity={0.85}
              >
                <Text style={styles.startBtnText}>
                  Review {summary.extraction.items.length} deadline{summary.extraction.items.length !== 1 ? 's' : ''}
                </Text>
                <FontAwesome name="arrow-right" size={15} color="#fff" />
              </TouchableOpacity>
            </>
          ) : processing ? (
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
  // Celebration / aha
  celebrateIcon: { width: 84, height: 84, borderRadius: 42, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  celebrateEmoji: { fontSize: 42 },
  celebrateTitle: { fontFamily: FONTS.display, fontSize: 26, letterSpacing: -0.5, textAlign: 'center' },
  celebrateSub: { fontSize: 14, textAlign: 'center', marginTop: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 20, marginBottom: 28, paddingHorizontal: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  chipText: { fontSize: 13, fontWeight: '600' },
  readyTitle: { fontFamily: FONTS.displaySemibold, fontSize: 21, color: COLORS.ink, marginBottom: 8 },
  readyText: { fontSize: 14, color: COLORS.ink3, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  startBtn: { flexDirection: 'row', height: 52, paddingHorizontal: 32, backgroundColor: COLORS.brand, borderRadius: 14, justifyContent: 'center', alignItems: 'center', gap: 10 },
  startBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
