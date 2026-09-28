import { translate } from '@/lib/i18n';
import { Text, TextInput, TouchableOpacity } from '@/components/LocalizedReactNative';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { COLORS, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { parseShareInput, shareTargetHref } from '@/lib/shareLinks';
import { track } from '@/lib/analytics';

// "Have an invite code?" — the way back for a student who installed from the
// App Store.
//
// A share link carries its code in the URL, and the App Store throws the URL
// away: the friend taps semoraai.com/invite/<code>, installs, opens Semora, and
// nothing knows they were invited. This screen is where they carry it across by
// hand, as a typed referral code or a pasted link / share message.
//
// It redeems nothing itself. It works out WHICH share this is and hands off to
// the screen that already handles it (app/invite.tsx, app/join.tsx,
// app/collaborate.tsx), so every decline message, the free-plan course limit
// and the success states stay in one place each.
export default function RedeemScreen() {
  const router = useRouter();
  const colors = useColors();
  const [input, setInput] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = () => {
    const target = parseShareInput(input);
    if (!target) {
      setInvalid(true);
      track('share_code_rejected', { screen: 'redeem' });
      return;
    }
    track('share_code_entered', { screen: 'redeem', kind: target.kind });
    // replace, not push: Back from the invite should return to Me, not to a
    // form that already did its job.
    router.replace(shareTargetHref(target) as any);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: translate('Invite code') }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>
          <View style={[styles.icon, { backgroundColor: colors.brand50 }]}>
            <FontAwesome name="gift" size={24} color={colors.brand} />
          </View>
          <Text style={[styles.title, { color: colors.ink }]}>Have an invite code?</Text>
          <Text style={[styles.body, { color: colors.ink3 }]}>
            Enter the code a friend gave you, or paste a Semora link a classmate sent you.
          </Text>

          <TextInput
            value={input}
            onChangeText={(text) => {
              setInput(text);
              if (invalid) setInvalid(false);
            }}
            onSubmitEditing={submit}
            placeholder="Code or link"
            placeholderTextColor={colors.ink3}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
            returnKeyType="go"
            maxLength={2000}
            accessibilityLabel="Invite code or link"
            style={[
              styles.input,
              { backgroundColor: colors.card, borderColor: invalid ? colors.coral : colors.line, color: colors.ink },
            ]}
          />
          {invalid ? (
            <Text style={[styles.error, { color: colors.coral }]}>
              That doesn't look like a Semora code or link. Check it and try again.
            </Text>
          ) : null}

          <TouchableOpacity
            onPress={submit}
            disabled={!input.trim()}
            activeOpacity={0.85}
            style={[styles.button, { backgroundColor: colors.brand }, !input.trim() && { opacity: 0.5 }]}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flex: 1, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center',
    paddingHorizontal: 24, paddingTop: 40, alignItems: 'center',
  },
  icon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink, textAlign: 'center' },
  body: { fontSize: 14.5, lineHeight: 21, textAlign: 'center', marginTop: 8, marginBottom: 22, maxWidth: 320 },
  input: {
    alignSelf: 'stretch', height: 52, borderRadius: 14, borderWidth: 1,
    paddingHorizontal: 16, fontSize: 17, fontWeight: '600', letterSpacing: 1,
  },
  error: { alignSelf: 'stretch', fontSize: 13.5, fontWeight: '600', marginTop: 8 },
  button: {
    alignSelf: 'stretch', height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginTop: 18,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
