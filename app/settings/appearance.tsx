import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAppStore, ThemeMode } from '@/store/appStore';
import { COLORS } from '@/lib/constants';
import { useColors } from '@/lib/theme';

const OPTIONS: { mode: ThemeMode; label: string; icon: string; description: string; disabled?: boolean }[] = [
  { mode: 'system', label: 'System', icon: 'mobile-phone', description: 'Match your device setting' },
  { mode: 'light', label: 'Light', icon: 'sun-o', description: 'Always use light theme' },
  { mode: 'dark', label: 'Dark', icon: 'moon-o', description: 'Always use dark theme' },
];

export default function AppearanceSettings() {
  const colors = useColors();
  const themeMode = useAppStore((s) => s.themeMode);
  const setThemeMode = useAppStore((s) => s.setThemeMode);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['bottom']}>
      <Stack.Screen options={{ title: 'Appearance' }} />

      <View style={styles.content}>
        <Text style={[styles.sectionTitle, { color: colors.ink2 }]}>Theme</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          {OPTIONS.map((opt, i) => (
            <TouchableOpacity
              key={opt.mode}
              style={[styles.row, i < OPTIONS.length - 1 && styles.rowBorder, i < OPTIONS.length - 1 && { borderBottomColor: colors.line }, opt.disabled && styles.rowDisabled]}
              activeOpacity={opt.disabled ? 1 : 0.7}
              onPress={() => !opt.disabled && setThemeMode(opt.mode)}
            >
              <FontAwesome name={opt.icon as any} size={18} color={opt.disabled ? colors.ink3 : colors.ink2} style={{ width: 24 }} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={[styles.rowLabel, { color: colors.ink }, opt.disabled && { color: colors.ink3 }]}>{opt.label}</Text>
                <Text style={[styles.rowSub, { color: colors.ink3 }]}>{opt.description}</Text>
              </View>
              {!opt.disabled && themeMode === opt.mode && (
                <FontAwesome name="check" size={16} color={colors.brand} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.ink2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  card: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 16, borderWidth: 0.5, borderColor: COLORS.line },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  rowDisabled: { opacity: 0.5 },
  rowLabel: { fontSize: 15, fontWeight: '500', color: COLORS.ink },
  rowLabelDisabled: { color: COLORS.ink3 },
  rowSub: { fontSize: 13, color: COLORS.ink3, marginTop: 2 },
});
