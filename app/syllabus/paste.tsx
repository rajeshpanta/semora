import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Text, TextInput } from '@/components/LocalizedReactNative';
import {
  useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { COLORS, FONTS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { setPendingScanText } from '@/lib/pendingScanText';

// Mirrors MIN_TEXT_CHARS/MAX_TEXT_CHARS in the parse-syllabus Edge Function —
// keep the two in sync.
const MIN_TEXT_CHARS = 20;
const MAX_TEXT_CHARS = 60_000;

export default function PasteSyllabusScreen() {
  const colors = useColors();
  const router = useRouter();
  const [text, setText] = useState('');

  const trimmed = text.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_TEXT_CHARS;
  const tooLong = trimmed.length > MAX_TEXT_CHARS;
  const canSubmit = trimmed.length >= MIN_TEXT_CHARS && !tooLong;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setPendingScanText(trimmed);
    router.push({
      pathname: '/syllabus/upload',
      params: { fileName: 'Pasted syllabus text.txt', mimeType: 'text/plain' },
    } as any);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.ink }]}>Paste syllabus text</Text>
        <Text style={[styles.subtitle, { color: colors.ink2 }]}>
          Copy the text from a PDF or your LMS page and paste it below — we'll pull every deadline, same as a file scan.
        </Text>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Paste your syllabus text here…"
          placeholderTextColor={colors.ink3}
          multiline
          autoFocus
          textAlignVertical="top"
          style={[
            styles.input,
            { backgroundColor: colors.card, borderColor: tooLong ? colors.coral : colors.line, color: colors.ink },
          ]}
        />

        <View style={styles.footerRow}>
          <Text style={[styles.counter, { color: tooLong ? colors.coral : colors.ink3 }]}>
            {tooShort
              ? `At least ${MIN_TEXT_CHARS} characters`
              : tooLong
                ? `${trimmed.length.toLocaleString()} / ${MAX_TEXT_CHARS.toLocaleString()} characters — trim it down a bit`
                : `${trimmed.length.toLocaleString()} characters`}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, { backgroundColor: colors.brand, opacity: canSubmit ? 1 : 0.5 }]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Extract deadlines from pasted text"
        >
          <FontAwesome name="magic" size={16} color="#fff" />
          <Text style={styles.submitBtnText}>Extract deadlines</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' },
  title: { fontFamily: FONTS.displaySemibold, fontSize: 24, color: COLORS.ink, letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: 14, color: COLORS.ink2, lineHeight: 19, marginBottom: 18 },
  input: {
    minHeight: 320, borderRadius: 16, borderWidth: 1, padding: 16,
    fontSize: 14, lineHeight: 20, color: COLORS.ink,
  },
  footerRow: { marginTop: 8, marginBottom: 18 },
  counter: { fontSize: 12 },
  submitBtn: {
    flexDirection: 'row', height: 52, borderRadius: 14, gap: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
