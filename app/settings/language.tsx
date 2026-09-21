import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  StyleSheet,
  View,
} from 'react-native';
import { Alert, Text } from '@/components/LocalizedReactNative';
import { useSession } from '@/app/_layout';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useAppStore, type AppLanguagePreference } from '@/store/appStore';
import { getAppLocale, translate, useI18n, resolveLocale } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { registerForPushNotificationsAsync } from '@/lib/push';
import { registerTaskNotificationActions, rescheduleAllTaskReminders } from '@/lib/notifications';
import { COLORS, SCREEN_MAX_WIDTH } from '@/lib/constants';

/**
 * "Use device language" has to be on this screen, not just in the store.
 *
 * The app already DEFAULTS to following the phone, and that is the right
 * default. But the screen only offered English and Español, so the first tap a
 * student ever made here was a one-way door: nothing could put them back on
 * the device setting, on any device, ever. Someone who taps to peek at their
 * options should not lose a behaviour by looking.
 *
 * It sits first because it is the default and the recommendation.
 */
const OPTIONS: { value: AppLanguagePreference; label: string; description: string; mark: string }[] = [
  { value: 'system', label: 'Use device language', description: 'Follow your phone, and switch when it does', mark: '⌘' },
  { value: 'en', label: 'English', description: 'Use Semora in English', mark: 'EN' },
  { value: 'es', label: 'Español', description: 'Usa Semora en español', mark: 'ES' },
];

export default function LanguageSettings() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const { session } = useSession();
  const { locale, t } = useI18n();
  const preference = useAppStore((state) => state.languagePreference);
  const setPreference = useAppStore((state) => state.setLanguagePreference);
  const [saving, setSaving] = useState<AppLanguagePreference | null>(null);

  const choose = async (value: AppLanguagePreference) => {
    if (saving || preference === value) return;
    const previous = preference;
    setPreference(value);
    setSaving(value);
    try {
      if (session?.user.id) {
        const [profileResult, authResult] = await Promise.all([
          // The account column drives the language of PUSH notifications, which
          // are composed on a server that cannot see this phone's settings — and
          // its check constraint only allows 'en' or 'es'. So "follow the device"
          // is stored locally and RESOLVED before it is sent, which also keeps a
          // push in the same language as the screen that prompted it.
          supabase.from('profiles').update({ preferred_language: resolveLocale(value) }).eq('id', session.user.id),
          supabase.auth.updateUser({ data: { preferred_language: resolveLocale(value) } }),
        ]);
        if (profileResult.error) throw profileResult.error;
        if (authResult.error) throw authResult.error;
        await registerForPushNotificationsAsync();
        await registerTaskNotificationActions(useAppStore.getState().isPro);
        await rescheduleAllTaskReminders(session.user.id, 'language_changed');
      }
    } catch {
      // Keep the local choice so the interface never snaps back while offline.
      // The account sync bridge retries the profile write on the next session.
      Alert.alert(
        translate('Could not save language', getAppLocale()),
        translate('Your choice is saved on this device. We’ll sync it to your account when the connection returns.', getAppLocale()),
      );
      if (!session) setPreference(previous);
    } finally {
      setSaving(null);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: t('Language') }} />
      <View style={[styles.content, { maxWidth: contentMaxWidth }]}>
        <Text style={[styles.title, { color: colors.ink }]}>{t('App language')}</Text>
        <Text style={[styles.subtitle, { color: colors.ink3 }]}>
          {t('Semora will use this language on every device signed in to your account.')}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {OPTIONS.map((option, index) => {
            // Only one row is ticked, and on the default it is this one — not
            // the language it happens to resolve to, which would read as though
            // the student had chosen it.
            const selected = preference === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                activeOpacity={0.7}
                disabled={!!saving}
                onPress={() => choose(option.value)}
                style={[
                  styles.row,
                  index < OPTIONS.length - 1 && styles.rowBorder,
                  index < OPTIONS.length - 1 && { borderBottomColor: colors.line },
                ]}
              >
                <View style={[styles.languageMark, { backgroundColor: colors.brand50 }]}>
                  <Text style={[styles.languageCode, { color: colors.brand }]}>{option.mark}</Text>
                </View>
                <View style={styles.copy}>
                  <Text style={[styles.label, { color: colors.ink }]}>{option.label}</Text>
                  <Text style={[styles.description, { color: colors.ink3 }]}>{option.description}</Text>
                </View>
                {selected && <FontAwesome name="check" size={17} color={colors.brand} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', padding: 20 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { fontSize: 14, lineHeight: 20, marginTop: 6, marginBottom: 18, maxWidth: 520 },
  card: { borderWidth: 0.5, borderRadius: 18, paddingHorizontal: 16, overflow: 'hidden' },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 0.5 },
  languageMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  languageCode: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  copy: { flex: 1, marginLeft: 12 },
  label: { fontSize: 16, fontWeight: '600' },
  description: { fontSize: 13, marginTop: 3 },
});
