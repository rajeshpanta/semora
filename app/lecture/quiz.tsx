import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useLecture } from '@/lib/lectures';

// Interactive multiple-choice quiz for one lecture. Pick an answer → instant
// correct/incorrect feedback with the explanation → next question → score.

export default function LectureQuizScreen() {
  const colors = useColors();
  const router = useRouter();
  const { contentMaxWidth } = useResponsive();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: lecture } = useLecture(id);

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);

  const quiz = lecture?.quiz ?? [];

  if (!lecture || quiz.length === 0) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <View style={styles.missing}>
          <Text style={[styles.missingText, { color: colors.ink2 }]}>This quiz is no longer available.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const question = quiz[index];

  const handlePick = (choiceIndex: number) => {
    if (picked !== null) return;
    setPicked(choiceIndex);
    const correct = choiceIndex === question.answerIndex;
    if (correct) setCorrectCount((c) => c + 1);
    if (Platform.OS === 'ios') {
      Haptics.notificationAsync(
        correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
      );
    }
  };

  const handleNext = () => {
    if (index + 1 >= quiz.length) {
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
      setPicked(null);
    }
  };

  const handleRetry = () => {
    setIndex(0);
    setPicked(null);
    setCorrectCount(0);
    setFinished(false);
  };

  if (finished) {
    const pct = Math.round((correctCount / quiz.length) * 100);
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
        <View style={[styles.resultWrap, { maxWidth: contentMaxWidth }]}>
          <View style={[styles.scoreCircle, { borderColor: pct >= 70 ? colors.teal : colors.amber }]}>
            <Text style={[styles.scorePct, { color: colors.ink }]}>{pct}%</Text>
          </View>
          <Text style={[styles.resultTitle, { color: colors.ink }]}>
            {pct >= 70 ? 'Nice work!' : 'Keep at it'}
          </Text>
          <Text style={[styles.resultText, { color: colors.ink2 }]}>
            {`${correctCount} of ${quiz.length} correct`}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
            onPress={handleRetry}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Retry quiz"
          >
            <FontAwesome name="refresh" size={15} color="#fff" />
            <Text style={styles.primaryBtnText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back to lecture"
          >
            <Text style={[styles.secondaryBtnText, { color: colors.ink2 }]}>Back to lecture</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} showsVerticalScrollIndicator={false}>
        {/* Progress */}
        <View style={styles.progressRow}>
          <Text style={[styles.progressText, { color: colors.ink3 }]}>{`${index + 1} / ${quiz.length}`}</Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.line }]}>
            <View
              style={[
                styles.progressFill,
                { backgroundColor: colors.brand, width: `${((index + (picked !== null ? 1 : 0)) / quiz.length) * 100}%` },
              ]}
            />
          </View>
        </View>

        <Text style={[styles.question, { color: colors.ink }]}>{question.question}</Text>

        <View style={styles.choices}>
          {question.choices.map((choice, ci) => {
            const isAnswer = ci === question.answerIndex;
            const isPicked = ci === picked;
            const revealed = picked !== null;
            const bg = !revealed
              ? colors.card
              : isAnswer
                ? colors.teal50
                : isPicked
                  ? colors.coral50
                  : colors.card;
            const border = !revealed ? colors.line : isAnswer ? colors.teal : isPicked ? colors.coral : colors.line;
            return (
              <TouchableOpacity
                key={ci}
                style={[styles.choice, { backgroundColor: bg, borderColor: border }]}
                onPress={() => handlePick(ci)}
                activeOpacity={0.75}
                disabled={revealed}
                accessibilityRole="button"
                accessibilityLabel={choice}
              >
                <Text style={[styles.choiceText, { color: colors.ink }]}>{choice}</Text>
                {revealed && isAnswer && <FontAwesome name="check-circle" size={17} color={colors.teal} />}
                {revealed && isPicked && !isAnswer && <FontAwesome name="times-circle" size={17} color={colors.coral} />}
              </TouchableOpacity>
            );
          })}
        </View>

        {picked !== null && (
          <>
            <View style={[styles.explainCard, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name="lightbulb-o" size={15} color={colors.brand} style={{ marginTop: 1 }} />
              <Text style={[styles.explainText, { color: colors.ink2 }]}>{question.explanation}</Text>
            </View>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.brand }]}
              onPress={handleNext}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={index + 1 >= quiz.length ? 'See results' : 'Next question'}
            >
              <Text style={styles.primaryBtnText}>{index + 1 >= quiz.length ? 'See results' : 'Next question'}</Text>
              <FontAwesome name="arrow-right" size={14} color="#fff" />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 20, paddingBottom: 40, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 },
  missingText: { fontSize: 15, textAlign: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
  progressText: { fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
  progressTrack: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  question: { fontFamily: FONTS.displaySemibold, fontSize: 20, lineHeight: 27, marginTop: 22 },
  choices: { gap: 9, marginTop: 20 },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, padding: 15 },
  choiceText: { flex: 1, fontSize: 14.5, lineHeight: 20 },
  explainCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 14, padding: 14, marginTop: 16 },
  explainText: { flex: 1, fontSize: 13.5, lineHeight: 19 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: 16, paddingVertical: 15, marginTop: 16 },
  primaryBtnText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  secondaryBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  secondaryBtnText: { fontSize: 14, fontWeight: '600' },
  resultWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, width: '100%', alignSelf: 'center' },
  scoreCircle: { width: 120, height: 120, borderRadius: 60, borderWidth: 6, alignItems: 'center', justifyContent: 'center' },
  scorePct: { fontFamily: FONTS.displaySemibold, fontSize: 32 },
  resultTitle: { fontFamily: FONTS.displaySemibold, fontSize: 22, marginTop: 18 },
  resultText: { fontSize: 14.5, marginTop: 6, marginBottom: 18 },
});
