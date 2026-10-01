import { translate } from '@/lib/i18n';
import { Text } from '@/components/LocalizedReactNative';
import {
  Link,
  Stack } from 'expo-router';
import { Platform,
  View,
  StyleSheet,
} from 'react-native';
import { returnToTabs } from '@/lib/tabNavigation';

// On a phone the link returns to the tabs already underneath instead of
// pushing a second tab navigator (lib/tabNavigation.ts). On the web the Link
// navigates exactly as it always has.
const goHome = (e: { preventDefault(): void }) => {
  if (Platform.OS === 'web') return;
  e.preventDefault();
  returnToTabs();
};

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: translate('Oops!') }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen doesn't exist.</Text>
        <Link href="/" style={styles.link} onPress={goHome}>
          <Text style={styles.linkText}>Go to home screen!</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
    // Keep the content from floating in a vast empty iPad frame; a no-op on
    // phones (< 600pt wide).
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: '#2e78b7',
  },
});
