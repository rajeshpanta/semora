import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useColors } from '@/lib/theme';

/**
 * Shown by detail screens when a record fails to load or no longer exists,
 * so a deleted row / RLS miss / exhausted retry lands on a clear message
 * with a way out instead of a permanent spinner.
 */
export function NotFound({
  title = 'Not found',
  message,
  onBack,
}: {
  title?: string;
  message: string;
  onBack: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.wrap, { backgroundColor: colors.paper }]}>
      <FontAwesome name="exclamation-circle" size={40} color={colors.ink3} />
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      <Text style={[styles.msg, { color: colors.ink3 }]}>{message}</Text>
      <TouchableOpacity
        style={[styles.btn, { backgroundColor: colors.brand }]}
        onPress={onBack}
        activeOpacity={0.85}
      >
        <Text style={styles.btnText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  title: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  msg: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  btn: { marginTop: 12, paddingHorizontal: 24, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
