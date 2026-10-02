import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Text, TouchableOpacity } from '@/components/LocalizedReactNative';
import { translate, useI18n } from '@/lib/i18n';
import { track } from '@/lib/analytics';
import { useColors } from '@/lib/theme';

/**
 * The doubts that stop a student halfway through connecting Canvas or Moodle.
 *
 * Not a pitch: anyone on this screen has already decided to connect. These
 * answer what makes them hesitate at the paste box — a link that looks like a
 * password — and each answer is held to what the app actually does (the paste
 * box's "encrypts it and never displays it", the Connected card's "checks every
 * few hours", the Disconnect alert's "imported courses … stay in Semora", and
 * new-term course detection). Collapsed, so it never pushes the steps down,
 * and each question is counted when opened: one nobody opens can go, one many
 * open belongs higher on the page.
 */
type FaqItem = { id: string; q: string; a: string };

const FAQ: Record<'canvas' | 'moodle', FaqItem[]> = {
  canvas: [
  {
    id: 'what_is_feed',
    q: 'What is the Calendar Feed link?',
    a: Platform.OS === 'web'
      ? 'It\'s a private link Canvas makes for your calendar. It\'s how your due dates can appear in other apps. You\'ll find it in Canvas under **Calendar → Calendar Feed** (the steps above show exactly where). Once it\'s in Semora, every assignment, quiz and exam from your courses comes in automatically.'
      // On a phone: the Canvas app has no Calendar Feed, only the website.
      : 'It\'s a private link Canvas makes for your calendar. It\'s how your due dates can appear in other apps. It\'s on the Canvas **website**, not the Canvas app, under **Calendar → Calendar Feed** (the steps above show exactly where). Once it\'s in Semora, every assignment, quiz and exam from your courses comes in automatically.',
  },
  {
    id: 'is_it_safe',
    q: 'Is it safe to paste it here?',
    a: 'Yes. Semora encrypts your link as soon as you add it and never displays it again, so it stays private to your account. It\'s the same kind of link students already use to put their Canvas deadlines into Google Calendar or Apple Calendar. Just don\'t post it anywhere public, like a group chat.',
  },
  {
    id: 'can_it_change_lms',
    q: 'Can Semora change anything in my Canvas?',
    a: 'No. Semora can only read your due dates. It can\'t submit assignments, edit anything or see your grades or messages. You still turn in your work in Canvas, and Semora keeps track of what\'s due and when.',
  },
  {
    id: 'stays_up_to_date',
    q: 'Will my classes stay up to date?',
    a: 'Yes, on their own. Semora rechecks Canvas every few hours, so a new assignment or a moved due date shows up without you doing anything. When the next semester starts, Semora spots your new classes and asks if you want to add them.',
  },
  {
    id: 'disconnect_later',
    q: 'Can I disconnect later?',
    a: 'Yes, anytime, right on this page. Once you disconnect, updates stop, and everything you\'ve already imported stays in Semora, including your assignments, what you\'ve completed and your grades.',
  },
],
  // Same five doubts, with Moodle's own path to the link. Moodle's export page
  // names match its Spanish pack too: Importar o exportar calendarios →
  // Exportar calendario → Obtener URL del calendario.
  moodle: [
  {
    id: 'what_is_feed',
    q: 'What is the Moodle calendar link?',
    a: 'It\'s a private link Moodle makes for your calendar. It\'s how your due dates can appear in other apps. You\'ll find it in Moodle under **Calendar → Import or export calendars → Export calendar → Get calendar URL** (the steps above show exactly where). Once it\'s in Semora, every assignment, quiz and exam from your courses comes in automatically.',
  },
  {
    id: 'is_it_safe',
    q: 'Is it safe to paste it here?',
    a: 'Yes. Semora encrypts your link as soon as you add it and never displays it again, so it stays private to your account. It\'s the same kind of link students already use to put their Moodle deadlines into Google Calendar or Apple Calendar. Just don\'t post it anywhere public, like a group chat.',
  },
  {
    id: 'can_it_change_lms',
    q: 'Can Semora change anything in my Moodle?',
    a: 'No. Semora can only read your due dates. It can\'t submit assignments, edit anything or see your grades or messages. You still turn in your work in Moodle, and Semora keeps track of what\'s due and when.',
  },
  {
    id: 'stays_up_to_date',
    q: 'Will my classes stay up to date?',
    a: 'Yes, on their own. Semora rechecks Moodle every few hours, so a new assignment or a moved due date shows up without you doing anything. When the next semester starts, Semora spots your new classes and asks if you want to add them.',
  },
  {
    id: 'disconnect_later',
    q: 'Can I disconnect later?',
    a: 'Yes, anytime, right on this page. Once you disconnect, updates stop, and everything you\'ve already imported stays in Semora, including your assignments, what you\'ve completed and your grades.',
  },
],
};

export function LmsConnectFaq({ provider, source }: { provider: 'canvas' | 'moodle'; source: string }) {
  const colors = useColors();
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <View style={[s.wrap, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <TouchableOpacity
        onPress={() => {
          if (!open) track('lms_faq_opened', { screen: 'lms_connect', provider, source });
          setOpen(!open);
        }}
        style={s.header}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <FontAwesome name="question-circle" size={15} color={colors.brand} />
        {/* Says it opens: "Questions about connecting?" alone read as a
            heading, and students did not know there was anything under it. */}
        <Text style={[s.headerText, { color: colors.ink }]}>Questions about connecting? See the answers</Text>
        <FontAwesome name={open ? 'chevron-up' : 'chevron-down'} size={12} color={colors.ink3} />
      </TouchableOpacity>
      {open && FAQ[provider].map((item) => {
        const isOpen = expanded === item.id;
        return (
          <View key={item.id} style={[s.item, { borderTopColor: colors.line }]}>
            <TouchableOpacity
              onPress={() => {
                if (!isOpen) track('lms_faq_question_opened', { screen: 'lms_connect', provider, question: item.id, source });
                setExpanded(isOpen ? null : item.id);
              }}
              style={s.question}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
            >
              <Text style={[s.questionText, { color: colors.ink }]}>{item.q}</Text>
              <FontAwesome name={isOpen ? 'minus' : 'plus'} size={11} color={colors.brand} />
            </TouchableOpacity>
            {isOpen && (
              <Text style={[s.answer, { color: colors.ink2 }]}>
                {translate(item.a, locale).split('**').map((part, j) => (j % 2 === 1
                  ? <Text key={j} style={{ fontWeight: '700', color: colors.ink }}>{part}</Text>
                  : part))}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, marginTop: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 14 },
  headerText: { flex: 1, fontSize: 15, fontWeight: '700' },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16 },
  question: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13 },
  questionText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  answer: { fontSize: 14, lineHeight: 21, paddingBottom: 14 },
});
