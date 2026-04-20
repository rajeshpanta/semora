import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import { COLORS } from '@/lib/constants';

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
    a: 'Go to Me > Notifications to choose when you want reminders — same day, 1 day before, or 3 days before a due date. Reminders are scheduled when tasks are created.',
  },
  {
    q: 'How is my grade calculated?',
    a: 'Grades are based on weighted scores you enter for each task. The percentage shown is your current average across all graded work.',
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
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Help & FAQ' }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
        <View style={styles.card}>
          {FAQS.map((faq, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.faqRow, i < FAQS.length - 1 && styles.faqBorder]}
              activeOpacity={0.7}
              onPress={() => setExpanded(expanded === i ? null : i)}
            >
              <View style={styles.faqHeader}>
                <Text style={styles.faqQ}>{faq.q}</Text>
                <FontAwesome
                  name={expanded === i ? 'chevron-up' : 'chevron-down'}
                  size={11}
                  color={COLORS.ink3}
                />
              </View>
              {expanded === i && <Text style={styles.faqA}>{faq.a}</Text>}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Contact Support</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={styles.contactRow}
            activeOpacity={0.7}
            onPress={() => Linking.openURL('mailto:rajesh.panta08@gmail.com')}
          >
            <FontAwesome name="envelope-o" size={16} color={COLORS.ink2} />
            <Text style={styles.contactText}>rajesh.panta08@gmail.com</Text>
            <FontAwesome name="chevron-right" size={11} color={COLORS.ink3} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 40 },
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
