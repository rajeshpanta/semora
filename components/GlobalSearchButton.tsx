import { TouchableOpacity } from '@/components/LocalizedReactNative';
import {
  StyleSheet,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useColors } from '@/lib/theme';

/** Persistent search entry used by every main tab. */
export function GlobalSearchButton() {
  const router = useRouter();
  const colors = useColors();
  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: colors.card, borderColor: colors.line }]}
      onPress={() => router.push('/search' as any)}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel="Search all tasks"
    >
      <FontAwesome name="search" size={16} color={colors.ink2} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
