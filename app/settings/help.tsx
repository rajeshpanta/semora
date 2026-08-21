import { translate } from '@/lib/i18n';
import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Text } from '@/components/LocalizedReactNative';
import {
  View,
  StyleSheet,
  ScrollView,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import { COLORS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';

const FAQS: { q: string; a: string }[] = [
  {
    q: 'How do I scan a syllabus?',
    a: 'Tap the Scan tab, then choose to take a photo or pick a file. Semora uses AI to extract assignments, exams, and deadlines automatically.',
  },
  {
    q: 'Can I edit tasks after scanning?',
    a: 'Yes! After scanning, you can review and edit every extracted item before saving. You can also edit tasks anytime from the course detail screen.',
  },
  {
    q: 'How do reminders work?',
    a: 'Go to Me > Settings > Notifications to choose when you want reminders. Same-day reminders are free; 1-day and 3-day advance reminders are a Pro feature. Reminders are scheduled when tasks are created.',
  },
  {
    q: 'What are the free plan limits?',
    a: 'The free plan includes one AI action for the account — a syllabus scan or a lecture recording, whichever you use first — plus one course per semester that you add yourself. Classes imported from Canvas do not count towards that: while the current offer runs, Canvas sync is free and brings across every class you have, with no limit. Tasks and deadlines are unlimited. Upgrade to Pro for unlimited scans, lectures, courses and semesters.',
  },
  {
    q: 'How is my grade calculated?',
    a: 'Semora uses assignment weights when you add them. If a course has no weights, it uses a simple average of posted grades. Your semester GPA estimate converts each course grade to grade points and weights it by that course\'s credit hours.',
  },
  {
    q: 'Can I have multiple semesters?',
    a: 'Yes. Tap the semester name on the Today or Courses screen to switch between semesters or create a new one.',
  },
  {
    q: 'Is my data private?',
    a: 'Your data is stored securely in your personal account. We do not share or sell your information.',
  },
];

export default function HelpScreen() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: translate('Help & FAQ') }} />
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Frequently Asked Questions</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {FAQS.map((faq, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.faqRow, i < FAQS.length - 1 && styles.faqBorder, i < FAQS.length - 1 && { borderBottomColor: colors.line }]}
              activeOpacity={0.7}
              onPress={() => setExpanded(expanded === i ? null : i)}
            >
              <View style={styles.faqHeader}>
                <Text style={[styles.faqQ, { color: colors.ink }]}>{faq.q}</Text>
                <FontAwesome
                  name={expanded === i ? 'chevron-up' : 'chevron-down'}
                  size={11}
                  color={colors.ink3}
                />
              </View>
              {expanded === i && <Text style={[styles.faqA, { color: colors.ink2 }]}>{faq.a}</Text>}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 28, color: colors.ink2 }]}>Contact Support</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <TouchableOpacity
            style={styles.contactRow}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('mailto:semora365@gmail.com')}
          >
            <FontAwesome name="envelope-o" size={16} color={colors.ink2} />
            <Text style={[styles.contactText, { color: colors.ink }]}>semora365@gmail.com</Text>
            <FontAwesome name="chevron-right" size={11} color={colors.ink3} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 40, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.ink2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 16, borderWidth: 0.5, borderColor: COLORS.line },
  faqRow: { paddingVertical: 14 },
  faqBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  faqQ: { fontSize: 15, fontWeight: '500', color: COLORS.ink, flex: 1, marginRight: 12 },
  faqA: { fontSize: 14, color: COLORS.ink2, lineHeight: 20, marginTop: 8 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  contactText: { flex: 1, fontSize: 15, color: COLORS.ink },
});
