import { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { COLORS } from '@/lib/constants';
import { useAppStore, findCurrentSemester } from '@/store/appStore';
import { useSemesters, useScanCount, FREE_SCAN_LIMIT } from '@/lib/queries';

export default function ScanScreen() {
  const router = useRouter();
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);
  const isPro = useAppStore((s) => s.isPro);
  const { data: semesters = [] } = useSemesters();
  const { data: scanCount = 0 } = useScanCount();

  const checkScanLimit = (): boolean => {
    if (isPro) return true;
    if (scanCount >= FREE_SCAN_LIMIT) {
      Alert.alert(
        'Scan Limit Reached',
        `You've used your ${FREE_SCAN_LIMIT} free scans. Upgrade to Pro for unlimited syllabus scanning.`,
        [
          { text: 'Upgrade', onPress: () => router.push('/paywall' as any) },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (semesters.length === 0) return;
    if (!selectedSemesterId || !semesters.some((s) => s.id === selectedSemesterId)) setSelectedSemester(findCurrentSemester(semesters));
  }, [semesters, selectedSemesterId]);

  const navigateToUpload = (fileUri: string, fileName: string, mimeType: string) => {
    router.push({
      pathname: '/syllabus/upload',
      params: { fileUri, fileName, mimeType },
    } as any);
  };

  const handleTakePhoto = async () => {
    if (!checkScanLimit()) return;
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed to scan syllabi.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      navigateToUpload(
        asset.uri,
        asset.fileName || 'syllabus_photo.jpg',
        asset.mimeType || 'image/jpeg',
      );
    }
  };

  const handleUploadPDF = async () => {
    if (!checkScanLimit()) return;
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf'],
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      navigateToUpload(
        asset.uri,
        asset.name || 'syllabus.pdf',
        asset.mimeType || 'application/pdf',
      );
    }
  };

  const handleChooseFromPhotos = async () => {
    if (!checkScanLimit()) return;
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Photo library access is needed to select syllabus images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsMultipleSelection: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      // For multiple images, process the first one (multi-page support later)
      const asset = result.assets[0];
      navigateToUpload(
        asset.uri,
        asset.fileName || 'syllabus_photo.jpg',
        asset.mimeType || 'image/jpeg',
      );
    }
  };

  const handlePickFromFiles = async () => {
    if (!checkScanLimit()) return;
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png'],
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      navigateToUpload(
        asset.uri,
        asset.name || 'syllabus',
        asset.mimeType || 'application/pdf',
      );
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Scan syllabus</Text>
        <Text style={styles.subtitle}>
          Snap it, upload it, or drag it in.{'\n'}We'll pull every deadline.
        </Text>

        {/* Scan frame */}
        <View style={styles.scanFrame}>
          <View style={styles.frameCorners}>
            <View style={[styles.corner, styles.tl]} />
            <View style={[styles.corner, styles.tr]} />
            <View style={[styles.corner, styles.bl]} />
            <View style={[styles.corner, styles.br]} />
            <View style={styles.docMock}>
              <View style={[styles.mockLine, { width: '60%' }]} />
              <View style={[styles.mockLine, { width: '80%' }]} />
              <View style={[styles.mockLine, { width: '45%' }]} />
              <View style={[styles.mockLine, { width: '70%', marginTop: 10 }]} />
              <View style={[styles.mockLine, { width: '60%' }]} />
            </View>
            <View style={styles.scanLine} />
          </View>
          <Text style={styles.frameLabel}>PDF & Photo supported</Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionCard} onPress={handleTakePhoto} activeOpacity={0.7}>
            <View style={[styles.actionIcon, { backgroundColor: COLORS.brand50 }]}>
              <FontAwesome name="camera" size={18} color={COLORS.brand} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Take a photo</Text>
              <Text style={styles.actionSub}>Printed handout or whiteboard</Text>
            </View>
            <FontAwesome name="chevron-right" size={12} color={COLORS.ink3} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={handleUploadPDF} activeOpacity={0.7}>
            <View style={[styles.actionIcon, { backgroundColor: COLORS.coral50 }]}>
              <FontAwesome name="file-pdf-o" size={18} color={COLORS.coral} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Upload PDF</Text>
              <Text style={styles.actionSub}>Email attachment or download</Text>
            </View>
            <FontAwesome name="chevron-right" size={12} color={COLORS.ink3} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={handleChooseFromPhotos} activeOpacity={0.7}>
            <View style={[styles.actionIcon, { backgroundColor: COLORS.teal50 }]}>
              <FontAwesome name="image" size={17} color={COLORS.teal} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Choose from Photos</Text>
              <Text style={styles.actionSub}>Select from your photo library</Text>
            </View>
            <FontAwesome name="chevron-right" size={12} color={COLORS.ink3} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={handlePickFromFiles} activeOpacity={0.7}>
            <View style={[styles.actionIcon, { backgroundColor: COLORS.blue50 }]}>
              <FontAwesome name="folder-open-o" size={16} color={COLORS.blue} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Pick from Files</Text>
              <Text style={styles.actionSub}>iCloud Drive, Google Drive...</Text>
            </View>
            <FontAwesome name="chevron-right" size={12} color={COLORS.ink3} />
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 120 },
  title: { fontSize: 26, fontWeight: '600', color: COLORS.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: COLORS.ink2, marginTop: 4, lineHeight: 19 },
  scanFrame: { backgroundColor: COLORS.brand, borderRadius: 22, padding: 22, marginVertical: 18, alignItems: 'center' },
  frameCorners: { width: '100%', height: 128, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  corner: { position: 'absolute', width: 24, height: 24, borderColor: '#fff', borderWidth: 2.5 },
  tl: { top: 0, left: 10, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  tr: { top: 0, right: 10, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  bl: { bottom: 0, left: 10, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  br: { bottom: 0, right: 10, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  docMock: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 6, padding: 12, width: 120, gap: 5 },
  mockLine: { height: 3, borderRadius: 1.5, backgroundColor: 'rgba(255,255,255,0.5)' },
  scanLine: { position: 'absolute', left: 20, right: 20, top: '50%', height: 1.5, backgroundColor: '#FAC775', borderRadius: 1 },
  frameLabel: { fontSize: 14, color: 'rgba(255,255,255,0.7)', fontWeight: '500', letterSpacing: 0.5, marginTop: 8, textTransform: 'uppercase' },
  actions: { gap: 8 },
  actionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 18, padding: 14, gap: 14, borderWidth: 0.5, borderColor: COLORS.line },
  actionIcon: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  actionContent: { flex: 1 },
  actionTitle: { fontSize: 14, fontWeight: '500', color: COLORS.ink },
  actionSub: { fontSize: 14, color: COLORS.ink3, marginTop: 2 },
});
