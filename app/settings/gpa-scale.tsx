import { translate } from '@/lib/i18n';
import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text, TextInput } from '@/components/LocalizedReactNative';
import {
  useEffect,
  useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useGpaScale, useUpdateGpaScale } from '@/lib/queries';
import { DEFAULT_GPA_SCALE } from '@/lib/grades';
import type { GpaScaleEntry } from '@/types/database';
import { COLORS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useProUpsell } from '@/components/ProUpsellHost';
import { useResponsive } from '@/lib/responsive';
import { useAppStore } from '@/store/appStore';
import { track } from '@/lib/analytics';

export default function GpaScaleScreen() {
  const colors = useColors();
  const showProUpsell = useProUpsell();
  const { contentMaxWidth } = useResponsive();
  const router = useRouter();
  // Custom scale EDITOR is Pro (paywall advertises "Grade Scale"). Free users
  // can still SEE the scale, but the inputs/save are locked → paywall.
  const isPro = useAppStore((s) => s.isPro);
  const { data, isLoading } = useGpaScale();
  const update = useUpdateGpaScale();
  // pointsText is editor-only state: the raw keystrokes, so a half-typed
  // "0." survives until it parses. Only `points` is ever persisted.
  type EditableRow = GpaScaleEntry & { pointsText?: string };
  const [rows, setRows] = useState<EditableRow[]>(DEFAULT_GPA_SCALE);

  useEffect(() => {
    if (data?.length) setRows(data);
  }, [data]);

  const openPaywall = () => {
    Haptics.selectionAsync().catch(() => {});
    track('paywall_open', { screen: 'gpa_scale', context: 'gpa_scale' });
    showProUpsell('grades');
  };

  const save = async () => {
    // Client gate — the editor is locked for free users, but never run the save
    // mutation without Pro (no marginal server cost, matching other client-only
    // Pro gates like what-if forecasting).
    if (!isPro) {
      openPaywall();
      return;
    }
    const clean = rows
      .map((row) => ({ letter: row.letter.trim().toUpperCase(), points: Number(row.points) }))
      .filter((row) => row.letter);
    if (!clean.length || clean.some((row) => !Number.isFinite(row.points) || row.points < 0 || row.points > 10)) {
      Alert.alert('Check the scale', 'Use a letter and grade points between 0 and 10 for every row.');
      return;
    }
    if (new Set(clean.map((row) => row.letter)).size !== clean.length) {
      Alert.alert('Duplicate letter', 'Each letter grade can appear only once.');
      return;
    }
    try {
      await update.mutateAsync(clean);
      Alert.alert('GPA scale saved', 'Semester GPA estimates now use your school’s grade-point rules.');
    } catch (error: any) {
      Alert.alert('Couldn’t save', error?.message || 'Please try again.');
    }
  };

  if (isLoading) {
    return <View style={[styles.loading, { backgroundColor: colors.paper }]}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: translate('GPA Scale') }} />
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} keyboardShouldPersistTaps="handled">
        <Text style={[styles.title, { color: colors.ink }]}>Your school’s GPA scale</Text>
        <Text style={[styles.subtitle, { color: colors.ink3 }]}>
          Set the exact points your school awards for each letter. This changes GPA estimates, not course percentage cutoffs.
        </Text>

        {/* Pro teaser — free users see the scale below but can't edit it.
            Tapping routes to the paywall (context 'gpa_scale'). */}
        {!isPro && (
          <TouchableOpacity
            style={[styles.lockBanner, { backgroundColor: colors.brand50 }]}
            onPress={openPaywall}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel="Upgrade to Pro to customize your GPA scale"
          >
            <FontAwesome name="lock" size={14} color={colors.brand} />
            <Text style={[styles.lockBannerText, { color: colors.brand }]}>
              Customizing your grade scale is a Pro feature. Upgrade to edit the points your school awards.
            </Text>
            <View style={[styles.proBadge, { backgroundColor: colors.brand }]}>
              <FontAwesome name="star" size={9} color="#fff" />
              <Text style={styles.proBadgeText}>PRO</Text>
            </View>
          </TouchableOpacity>
        )}

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {rows.map((row, index) => (
            <View key={index} style={[styles.row, index < rows.length - 1 && { borderBottomWidth: 0.5, borderBottomColor: colors.line }]}>
              <TextInput
                style={[styles.letterInput, { color: colors.ink, borderColor: colors.line }]}
                value={row.letter}
                placeholder="A"
                placeholderTextColor={colors.ink3}
                autoCapitalize="characters"
                maxLength={3}
                editable={isPro}
                onChangeText={(letter) => setRows((current) => current.map((item, i) => i === index ? { ...item, letter } : item))}
              />
              <Text style={[styles.equals, { color: colors.ink3 }]}>=</Text>
              <TextInput
                style={[styles.pointsInput, { color: colors.ink, borderColor: colors.line }]}
                // Held as typed text, not a number: `Number('0.') || 0` is 0,
                // so re-deriving the field from state erased the decimal point
                // the instant it was typed and "0.7" ended up saved as 7.
                value={row.pointsText ?? String(row.points)}
                placeholder="4.0"
                placeholderTextColor={colors.ink3}
                keyboardType="decimal-pad"
                editable={isPro}
                onChangeText={(value) => setRows((current) => current.map((item, i) => i === index
                  ? { ...item, pointsText: value, points: Number.parseFloat(value) || 0 }
                  : item))}
              />
              <Text style={[styles.pointsLabel, { color: colors.ink3 }]}>points</Text>
              {isPro && (
                <TouchableOpacity onPress={() => setRows((current) => current.filter((_, i) => i !== index))} hitSlop={8}>
                  <FontAwesome name="times" size={14} color={colors.coral} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          {isPro && (
            <TouchableOpacity style={styles.addRow} onPress={() => setRows((current) => [...current, { letter: '', points: 0 }])}>
              <FontAwesome name="plus" size={11} color={colors.brand} />
              <Text style={[styles.addText, { color: colors.brand }]}>Add grade</Text>
            </TouchableOpacity>
          )}
        </View>

        {isPro ? (
          <>
            <TouchableOpacity style={[styles.secondary, { borderColor: colors.line }]} onPress={() => setRows(DEFAULT_GPA_SCALE)}>
              <Text style={[styles.secondaryText, { color: colors.ink2 }]}>Restore standard 4.0 scale</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.save, { backgroundColor: colors.brand }]} onPress={save} disabled={update.isPending}>
              {update.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save GPA scale</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity style={[styles.save, { backgroundColor: colors.brand }]} onPress={openPaywall} activeOpacity={0.85}>
            <Text style={styles.saveText}>Upgrade to Pro to edit</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', padding: 20, paddingBottom: 60 },
  title: { fontSize: 23, fontWeight: '800' },
  subtitle: { fontSize: 13.5, lineHeight: 20, marginTop: 5, marginBottom: 16 },
  card: { borderWidth: 0.5, borderRadius: 17, paddingHorizontal: 14 },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9 },
  letterInput: { width: 56, height: 38, borderWidth: 1, borderRadius: 9, textAlign: 'center', fontSize: 15, fontWeight: '800' },
  equals: { fontSize: 15, fontWeight: '700' },
  pointsInput: { width: 70, height: 38, borderWidth: 1, borderRadius: 9, textAlign: 'center', fontSize: 15, fontWeight: '700' },
  pointsLabel: { flex: 1, fontSize: 12.5 },
  addRow: { height: 46, flexDirection: 'row', alignItems: 'center', gap: 6 },
  addText: { fontSize: 13.5, fontWeight: '700' },
  secondary: { height: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  secondaryText: { fontSize: 13.5, fontWeight: '700' },
  save: { height: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  // Pro teaser banner shown above the (read-only) scale for free users.
  lockBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, padding: 14, marginBottom: 16 },
  lockBannerText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  // Matches the PRO badge treatment used on other Pro teasers.
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  proBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
});
