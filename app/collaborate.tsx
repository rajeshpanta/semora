import { translate } from '@/lib/i18n';
import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text } from '@/components/LocalizedReactNative';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import {
  Stack,
  router,
  useLocalSearchParams } from 'expo-router';
import { useEffect,
  useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from '@/app/_layout';
import {
  joinCourseCollaboration,
  readPendingCollaborationToken,
  savePendingCollaborationToken,
  syncCollaborationToPlanner,
} from '@/lib/collaboration';
import { SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useAppStore } from '@/store/appStore';

export default function JoinCollaborationScreen() {
  const colors = useColors();
  const { session, loading } = useSession();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = (params.token || readPendingCollaborationToken() || '').trim();
  const semesterId = useAppStore((state) => state.selectedSemesterId);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (token && !session && !loading) {
      savePendingCollaborationToken(token).catch(() => {});
      router.replace('/(auth)/sign-in');
    }
  }, [token, session, loading]);

  const join = async () => {
    if (!token || joining) return;
    setJoining(true);
    try {
      const collaboration = await joinCourseCollaboration(token);
      if (semesterId) {
        await syncCollaborationToPlanner(collaboration.id, semesterId).catch(() => {});
      }
      router.replace(`/collaboration/${collaboration.id}` as any);
    } catch (error) {
      Alert.alert('Couldn’t join course', error instanceof Error ? error.message : 'This invite may have expired.');
    } finally {
      setJoining(false);
    }
  };

  if (loading || !session) return null;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]}>
      <Stack.Screen options={{ title: translate('Join Course Space') }} />
      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <View style={[styles.icon, { backgroundColor: colors.brand50 }]}>
            <FontAwesome name="users" size={25} color={colors.brand} />
          </View>
          <Text style={[styles.title, { color: colors.ink }]}>Join your classmates</Text>
          <Text style={[styles.text, { color: colors.ink3 }]}>
            You’ll see shared deadlines and group assignments. Your personal grades, reminders, and planner stay private.
          </Text>
          {!token ? (
            <Text style={[styles.error, { color: colors.coral }]}>This invite link is incomplete.</Text>
          ) : (
            <TouchableOpacity
              onPress={join}
              disabled={joining}
              style={[styles.button, { backgroundColor: colors.brand }]}
            >
              {joining ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Join course space</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center', justifyContent: 'center', padding: 22 },
  card: { borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, padding: 24, alignItems: 'center' },
  icon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 24, fontFamily: 'Fraunces_700Bold', marginTop: 16 },
  text: { textAlign: 'center', fontSize: 14, lineHeight: 21, marginTop: 8 },
  error: { fontSize: 14, fontWeight: '700', marginTop: 18 },
  button: { minHeight: 50, alignSelf: 'stretch', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
