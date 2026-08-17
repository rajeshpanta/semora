import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { getDeviceItem, setDeviceItem } from '@/lib/deviceStore';
import { supabase } from '@/lib/supabase';

// Blocking consent gate, shown BEFORE the microphone permission prompt and
// before any capture.
//
// This is not decoration. Recording a lecture captures a third party — the
// instructor, and anyone sitting nearby — who never opened this app. App Review
// treats an app that records other people without an affirmative in-app
// acknowledgement as a rejection, and a passive line of small print under the
// Stop button (which is what this screen had) satisfies neither the guideline
// nor the student, who is the one carrying the legal risk in a two-party-consent
// state.
//
// Shown once per install and then remembered: a gate the user dismisses before
// every lecture stops being read after the second time. The one-line reminder
// on the record screen itself is permanent.

// Scoped to the ACCOUNT, not the device. The acknowledgement is a specific
// person accepting responsibility for recording other people; a second student
// signing into the same phone has not made that promise, and must be asked.
const consentKey = (userId: string) => `semora_lecture_consent_v1:${userId}`;

async function currentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export async function hasAcceptedLectureConsent(): Promise<boolean> {
  try {
    const userId = await currentUserId();
    if (!userId) return false;
    return getDeviceItem(consentKey(userId)) === 'true';
  } catch {
    // Fail toward showing the gate again — the safe direction.
    return false;
  }
}

export async function rememberLectureConsent(): Promise<void> {
  try {
    const userId = await currentUserId();
    if (!userId) return;
    setDeviceItem(consentKey(userId), 'true');
  } catch {
    // Storage unavailable — the gate simply shows again next time.
  }
}

interface Props {
  visible: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export function LectureConsentSheet({ visible, onAccept, onCancel }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const POINTS: { icon: React.ComponentProps<typeof FontAwesome>['name']; text: string }[] = [
    {
      icon: 'university',
      text: "Check your instructor's rules and your school's policy. Many courses require permission before you record.",
    },
    {
      icon: 'balance-scale',
      text: 'Some states and countries require everyone being recorded to agree to it.',
    },
    {
      icon: 'lock',
      text: 'Your recording goes to your private Semora account and to our transcription provider to create your notes. It is never made public or shared with other students, and the audio is deleted as soon as your transcript is ready.',
    },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Cancel" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: colors.line }]} />
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={[styles.icon, { backgroundColor: colors.coral50 }]}>
              <FontAwesome name="microphone" size={22} color={colors.coral} />
            </View>
            <Text style={[styles.title, { color: colors.ink }]}>Before you record</Text>
            <Text style={[styles.lede, { color: colors.ink2 }]}>
              Semora will record the sound around you, including your instructor’s voice and
              anything people near you say.
            </Text>

            <View style={styles.points}>
              {POINTS.map((p) => (
                <View key={p.text} style={styles.point}>
                  <View style={[styles.pointIcon, { backgroundColor: colors.brand50 }]}>
                    <FontAwesome name={p.icon} size={12} color={colors.brand} />
                  </View>
                  <Text style={[styles.pointText, { color: colors.ink2 }]}>{p.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.primary, { backgroundColor: colors.brand }]}
              onPress={onAccept}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="I have permission to record"
            >
              <Text style={styles.primaryText}>I have permission to record</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondary}
              onPress={onCancel}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={[styles.secondaryText, { color: colors.ink2 }]}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,10,14,0.5)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: '88%',
    width: '100%',
    maxWidth: SCREEN_MAX_WIDTH,
    alignSelf: 'center',
  },
  grabber: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 10 },
  content: { padding: 22, paddingTop: 16 },
  icon: { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  title: { fontFamily: FONTS.displaySemibold, fontSize: 23, marginTop: 14, letterSpacing: -0.3 },
  lede: { fontSize: 14.5, lineHeight: 21, marginTop: 8 },
  points: { gap: 14, marginTop: 20 },
  point: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  pointIcon: {
    width: 24, height: 24, borderRadius: 8, justifyContent: 'center', alignItems: 'center',
    marginTop: 1,
  },
  pointText: { flex: 1, fontSize: 13.5, lineHeight: 19.5 },
  primary: {
    borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 24,
  },
  primaryText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  secondary: { alignItems: 'center', paddingVertical: 14, marginTop: 2 },
  secondaryText: { fontSize: 14.5, fontWeight: '600' },
});
