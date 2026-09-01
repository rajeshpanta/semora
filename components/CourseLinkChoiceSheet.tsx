import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { classifyCourseMatch, type CourseCandidate } from '@/lib/courseMatch';

/**
 * "You may already have this class."
 *
 * Shown only when it has something to ask. Of 86 Canvas courses in production
 * checked against their own student's existing courses, 77 matched nothing —
 * those never reach this sheet, and their import is unchanged.
 *
 * Nothing here is pre-decided. Every row defaults to KEEP SEPARATE, which is
 * exactly today's behaviour, so a student who taps straight through gets what
 * they would have got before this existed. Linking is the deliberate act,
 * because linking is the one that touches a course they already own.
 */

export interface CourseLinkDecision {
  /** Canvas external_course_id. */
  externalId: string;
  canvasName: string;
  /** null = keep separate (create a new course, as today). */
  linkToCourseId: string | null;
}

export interface PendingCourseChoice {
  externalId: string;
  canvasName: string;
  candidates: CourseCandidate[];
}

/**
 * Which of these Canvas courses need a decision?
 *
 * Exported so the connect screen can ask the question BEFORE opening anything —
 * an empty result means the sheet never appears and the import proceeds
 * untouched.
 */
export function pendingCourseChoices(
  canvasCourses: readonly { id: string; name: string }[],
  existingCourses: readonly CourseCandidate[],
): PendingCourseChoice[] {
  const out: PendingCourseChoice[] = [];
  for (const course of canvasCourses) {
    const outcome = classifyCourseMatch(course.name, existingCourses);
    if (outcome.kind === 'none') continue;
    out.push({
      externalId: course.id,
      canvasName: course.name,
      candidates: outcome.kind === 'single' ? [outcome.candidate] : outcome.candidates,
    });
  }
  return out;
}

export function CourseLinkChoiceSheet({
  visible,
  choices,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  choices: PendingCourseChoice[];
  onCancel: () => void;
  onConfirm: (decisions: CourseLinkDecision[]) => void;
}) {
  const colors = useColors();
  // externalId -> chosen local course id. Absent means keep separate.
  const [picked, setPicked] = useState<Record<string, string>>({});

  const decisions = useMemo<CourseLinkDecision[]>(
    () => choices.map((choice) => ({
      externalId: choice.externalId,
      canvasName: choice.canvasName,
      linkToCourseId: picked[choice.externalId] ?? null,
    })),
    [choices, picked],
  );

  const linkCount = decisions.filter((d) => d.linkToCourseId).length;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.host}>
        <Pressable style={styles.backdrop} onPress={onCancel} accessible={false} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={[styles.title, { color: colors.ink }]}>
              {choices.length === 1
                ? 'We found a course that may already be in Semora'
                : 'Some of these may already be in Semora'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.ink2 }]}>
              Linking keeps everything you already added — your tasks, what you have completed,
              and your grades all stay exactly as they are. Canvas deadlines simply arrive in the
              same course instead of a second one.
            </Text>

            {choices.map((choice) => {
              const chosen = picked[choice.externalId] ?? null;
              return (
                <View
                  key={choice.externalId}
                  style={[styles.block, { borderColor: colors.line }]}
                >
                  <Text style={[styles.canvasLabel, { color: colors.ink3 }]}>FROM CANVAS</Text>
                  <Text style={[styles.canvasName, { color: colors.ink }]} numberOfLines={2}>
                    {choice.canvasName}
                  </Text>

                  {/* One row per plausible existing course. With several, this
                      is the ambiguous case and the student picks; with one it
                      is still a choice, never a default. */}
                  {choice.candidates.map((candidate) => {
                    const selected = chosen === candidate.id;
                    return (
                      <TouchableOpacity
                        key={candidate.id}
                        style={[
                          styles.option,
                          {
                            borderColor: selected ? colors.brand : colors.line,
                            backgroundColor: selected ? colors.brand50 : 'transparent',
                          },
                        ]}
                        onPress={() => setPicked((current) => ({ ...current, [choice.externalId]: candidate.id }))}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Connect Canvas to ${candidate.name}`}
                      >
                        <FontAwesome
                          name={selected ? 'dot-circle-o' : 'circle-o'}
                          size={15}
                          color={selected ? colors.brand : colors.ink3}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.optionTitle, { color: colors.ink }]}>
                            Connect Canvas to this course
                          </Text>
                          <Text style={[styles.optionName, { color: colors.ink2 }]} numberOfLines={2}>
                            {candidate.name}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  {/* Always last and always available — including in the
                      ambiguous case, where "none of these" has to be reachable. */}
                  <TouchableOpacity
                    style={[
                      styles.option,
                      {
                        borderColor: chosen === null ? colors.brand : colors.line,
                        backgroundColor: chosen === null ? colors.brand50 : 'transparent',
                      },
                    ]}
                    onPress={() => setPicked((current) => {
                      const next = { ...current };
                      delete next[choice.externalId];
                      return next;
                    })}
                    accessibilityRole="button"
                    accessibilityState={{ selected: chosen === null }}
                    accessibilityLabel="Keep as a separate course"
                  >
                    <FontAwesome
                      name={chosen === null ? 'dot-circle-o' : 'circle-o'}
                      size={15}
                      color={chosen === null ? colors.brand : colors.ink3}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionTitle, { color: colors.ink }]}>
                        Keep as a separate course
                      </Text>
                      <Text style={[styles.optionName, { color: colors.ink2 }]}>
                        Semora adds it as a new course.
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}

            <TouchableOpacity
              style={[styles.cta, { backgroundColor: colors.brand }]}
              onPress={() => onConfirm(decisions)}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>
                {linkCount > 0 ? 'Continue' : 'Continue — keep all separate'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancel} onPress={onCancel} accessibilityRole="button">
              <Text style={[styles.cancelText, { color: colors.ink3 }]}>Back</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  host: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    width: '100%', maxWidth: SCREEN_MAX_WIDTH, maxHeight: '86%',
    borderRadius: 22, borderWidth: 1, paddingHorizontal: 20, paddingVertical: 22,
  },
  title: { fontFamily: FONTS.display, fontSize: 21, lineHeight: 27, marginBottom: 10 },
  subtitle: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  block: { borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 12 },
  canvasLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.7, marginBottom: 4 },
  canvasName: { fontSize: 13.5, fontWeight: '700', marginBottom: 11 },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 10, marginTop: 8,
  },
  optionTitle: { fontSize: 13, fontWeight: '700' },
  optionName: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  cta: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 6 },
  ctaText: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  cancel: { paddingVertical: 12, alignItems: 'center' },
  cancelText: { fontSize: 14, fontWeight: '600' },
});
