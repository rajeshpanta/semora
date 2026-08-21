import { TouchableOpacity } from '@/components/LocalizedReactNative';
import {
  StyleSheet,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';

/**
 * Search entry for every main tab — on the surfaces that have no sidebar.
 *
 * The desktop shell already carries "Search everything ⌘K" permanently at the
 * top of the rail, so on a browser this icon was a second search button on
 * every screen, four rows below the first one and without the shortcut hint.
 * Two controls for one action is not redundancy the user reads as thorough; it
 * is a screen that has not decided where search lives.
 *
 * The rail wins because it is always in the same place and teaches the
 * keyboard shortcut. Below the desktop breakpoint there is no rail, so this is
 * the only way in and it renders as before.
 */
export function GlobalSearchButton() {
  const router = useRouter();
  const colors = useColors();
  const { isDesktop } = useResponsive();
  if (isDesktop) return null;
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
