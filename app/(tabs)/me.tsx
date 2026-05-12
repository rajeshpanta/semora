import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import { useSession } from '@/app/_layout';
import { useAppStore, findCurrentSemester } from '@/store/appStore';
import { useSemesters, useCourses, useTaskStats } from '@/lib/queries';
import { signOut } from '@/lib/auth';
import { displayName } from '@/lib/user';
import { COLORS } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useEffect, useState } from 'react';

export default function MeScreen() {
  const colors = useColors();
  const { session } = useSession();
  const name = displayName(session?.user, 'User');
  const initial = (name[0] ?? '?').toUpperCase();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    if (signingOut) return;
    Alert.alert(
      'Sign out?',
      'You\'ll need to sign in again to use Semora.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setSigningOut(true);
            try {
              await signOut();
            } finally {
              // Don't reset on success — the screen unmounts when the
              // session clears and AuthGate redirects to sign-in.
              // Reset only matters if signOut throws.
              setSigningOut(false);
            }
          },
        },
      ],
    );
  };

  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);
  const isPro = useAppStore((s) => s.isPro);
  const { data: semesters = [] } = useSemesters();
  const { data: courses = [] } = useCourses(selectedSemesterId);
  const { data: stats } = useTaskStats(selectedSemesterId);

  useEffect(() => {
    if (semesters.length === 0) return;
    if (!selectedSemesterId || !semesters.some((s) => s.id === selectedSemesterId)) setSelectedSemester(findCurrentSemester(semesters));
  }, [semesters, selectedSemesterId]);

  const activeSemester = semesters.find((s) => s.id === selectedSemesterId);
  const router = useRouter();

  const handleRate = async () => {
    try {
      const StoreReview = await import('expo-store-review');
      const available = await StoreReview.isAvailableAsync();
      if (available) {
        await StoreReview.requestReview();
      } else {
        Alert.alert('Rate Us', 'In-app rating is not available on this device. You can rate us directly on the App Store.');
      }
    } catch {
      Alert.alert('Rate Us', 'Unable to open the rating dialog. You can rate us directly on the App Store.');
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile */}
        <View style={styles.profileRow}>
          <View style={[styles.avatar, { backgroundColor: colors.brand }]}><Text style={styles.avatarText}>{initial}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.profileName, { color: colors.ink }]}>{name}</Text>
            <Text style={[styles.profileSub, { color: colors.ink3 }]}>{activeSemester?.name ?? 'No semester'}</Text>
          </View>
        </View>

        {/* Premium upsell / Pro active */}
        <TouchableOpacity style={[styles.proCard, { backgroundColor: colors.ink }]} activeOpacity={isPro ? 1 : 0.85} onPress={() => !isPro && router.push('/paywall' as any)}>
          <View style={[styles.proGlow, { backgroundColor: colors.brand }]} />
          <View style={{ position: 'relative' }}>
            <View style={styles.proLabel}>
              <FontAwesome name="star" size={11} color={colors.brand100} />
              <Text style={[styles.proLabelText, { color: colors.brand100 }]}>SEMORA PRO</Text>
            </View>
            {isPro ? (
              <>
                <Text style={styles.proTitle}>You have full access to all Pro features.</Text>
                <View style={styles.proActiveBadge}>
                  <FontAwesome name="check-circle" size={14} color={colors.teal} />
                  <Text style={[styles.proActiveText, { color: colors.teal }]}>Active</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={styles.proTitle}>Unlimited scans, smart plans, grade forecasts.</Text>
                <View style={styles.proPrice}>
                  <Text style={styles.proPriceAmount}>$19.99</Text>
                  <Text style={styles.proPricePeriod}>/year · cancel any time</Text>
                </View>
                <View style={styles.proButton}>
                  <Text style={[styles.proButtonText, { color: colors.ink }]}>Upgrade to Pro</Text>
                </View>
                <Text style={styles.proAlt}>Or $3.99/month with 7-day free trial</Text>
              </>
            )}
          </View>
        </TouchableOpacity>

        {/* Stats */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.statNum, { color: colors.brand }]}>{courses.length}</Text>
            <Text style={[styles.statLabel, { color: colors.ink3 }]}>COURSES</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={[styles.statNum, { color: colors.ink }]}>{stats?.completed ?? 0}</Text>
            <Text style={[styles.statLabel, { color: colors.ink3 }]}>DONE</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={[styles.statNum, { color: colors.coral }]}>{stats?.pending ?? 0}</Text>
            </View>
            <Text style={[styles.statLabel, { color: colors.ink3 }]}>PENDING</Text>
          </View>
        </View>

        {/* Settings & Support */}
        <View style={[styles.settingsCard, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <SettingsRow icon="cog" label="Settings" onPress={() => router.push('/settings')} colors={colors} />
          <SettingsRow icon="question-circle-o" label="Help & FAQ" onPress={() => router.push('/settings/help')} colors={colors} />
          <SettingsRow icon="star-o" label="Rate Semora" last onPress={handleRate} colors={colors} />
        </View>

        {/* Sign out */}
        <TouchableOpacity
          style={[
            styles.signOutBtn,
            { backgroundColor: colors.card, borderColor: colors.line },
            signingOut && { opacity: 0.5 },
          ]}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.7}
        >
          <FontAwesome name="sign-out" size={14} color={colors.coral} />
          <Text style={[styles.signOutText, { color: colors.coral }]}>
            {signingOut ? 'Signing out...' : 'Sign Out'}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.version, { color: colors.ink3 }]}>Semora 1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function SettingsRow({ icon, label, last, onPress, colors }: { icon: string; label: string; last?: boolean; onPress?: () => void; colors?: any }) {
  const c = colors ?? COLORS;
  return (
    <TouchableOpacity style={[styles.settingsRow, !last && [styles.settingsRowBorder, { borderBottomColor: c.line }]]} activeOpacity={0.7} onPress={onPress}>
      <FontAwesome name={icon as any} size={16} color={c.ink2} />
      <Text style={[styles.settingsLabel, { color: c.ink }]}>{label}</Text>
      <FontAwesome name="chevron-right" size={11} color={c.ink3} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 120 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, marginBottom: 20 },
  avatar: { width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.brand, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '600' },
  profileName: { fontSize: 19, fontWeight: '600', color: COLORS.ink },
  profileSub: { fontSize: 14, color: COLORS.ink3, marginTop: 2 },
  // Pro card — bold premium design
  proCard: { backgroundColor: COLORS.ink, borderRadius: 22, padding: 22, marginBottom: 20, overflow: 'hidden' },
  proGlow: { position: 'absolute', right: -30, top: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: COLORS.brand, opacity: 0.4 },
  proLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  proLabelText: { fontSize: 12, fontWeight: '800', letterSpacing: 1.5, color: COLORS.brand100 },
  proTitle: { fontSize: 22, fontWeight: '700', color: '#fff', lineHeight: 28, maxWidth: 240 },
  proPrice: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 16 },
  proPriceAmount: { fontSize: 28, fontWeight: '800', color: '#fff' },
  proPricePeriod: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  proButton: { backgroundColor: '#fff', borderRadius: 14, padding: 13, alignItems: 'center', marginTop: 14 },
  proButtonText: { fontSize: 15, fontWeight: '700', color: COLORS.ink },
  proAlt: { fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 10 },
  proActiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  proActiveText: { fontSize: 15, fontWeight: '700', color: COLORS.teal },
  // Stats
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 18, padding: 12, alignItems: 'center', borderWidth: 0.5, borderColor: COLORS.line },
  statNum: { fontSize: 22, fontWeight: '600', color: COLORS.ink },
  statLabel: { fontSize: 14, color: COLORS.ink3, fontWeight: '500', letterSpacing: 0.5, marginTop: 2 },
  // Settings
  settingsCard: { backgroundColor: COLORS.card, borderRadius: 18, paddingHorizontal: 14, marginBottom: 20, borderWidth: 0.5, borderColor: COLORS.line },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  settingsRowBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.line },
  settingsLabel: { flex: 1, fontSize: 14, color: COLORS.ink },
  // Sign out
  signOutBtn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: COLORS.card, borderWidth: 0.5, borderColor: COLORS.line, marginBottom: 16 },
  signOutText: { fontSize: 14, fontWeight: '500', color: COLORS.coral },
  version: { textAlign: 'center', fontSize: 14, color: COLORS.ink3 },
});
