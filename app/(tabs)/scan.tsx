import { useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { COLORS, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useAppStore, findCurrentSemester } from '@/store/appStore';
import { useSemesters, useScanCount, FREE_SCAN_LIMIT } from '@/lib/queries';

export default function ScanScreen() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const router = useRouter();
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);
  const isPro = useAppStore((s) => s.isPro);
  const qc = useQueryClient();
  const { data: semesters = [] } = useSemesters();
  const { data: scanCount = 0, isLoading: scanCountLoading } = useScanCount();

  // After a scan completes, syllabus_uploads is inserted by processSyllabus
  // and the server count goes up. Re-entering the scan tab without
  // invalidation would read the 1-minute-stale cache — so the "Last Free
  // Scan" warning could miss-fire and the limit check could let through
  // a scan that the DB then blocks (M2 surfaces P0001 as the fallback, but
  // catching it here is cleaner UX).
  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ['scanCount'] });
    }, [qc]),
  );

  const checkScanLimit = async (): Promise<boolean> => {
    if (isPro) return true;
    if (scanCountLoading) {
      Alert.alert('Please Wait', 'Loading your scan usage. Try again in a moment.');
      return false;
    }
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
    // Heads-up before the user burns their last free scan, so they can
    // decide to upgrade instead of finding out only after the fact.
    if (scanCount === FREE_SCAN_LIMIT - 1) {
      return new Promise((resolve) => {
        Alert.alert(
          'Last Free Scan',
          `This will use your last of ${FREE_SCAN_LIMIT} free scans. After this you'll need Pro for more.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Upgrade', onPress: () => { router.push('/paywall' as any); resolve(false); } },
            { text: 'Use Last Scan', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      });
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

  // Remaining free scans for FREE users — clamped to 0 so the copy never
  // reads "-1 left" if the server count ever overshoots the limit.
  const remainingScans = Math.max(FREE_SCAN_LIMIT - scanCount, 0);

  const handleTakePhoto = async () => {
    if (!(await checkScanLimit())) return;
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera Access Needed',
        'Camera access is needed to scan syllabi. You can enable it in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
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
    if (!(await checkScanLimit())) return;
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
    if (!(await checkScanLimit())) return;
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Photo Access Needed',
        'Photo library access is needed to select syllabus images. You can enable it in Settings.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      // Single-select until the pipeline supports multi-page: with
      // multi-select on, every page after the first was silently dropped
      // — the UI must not promise what the scan can't do.
      allowsMultipleSelection: false,
      selectionLimit: 1,
    });

    if (!result.canceled && result.assets.length > 0) {
      const asset = result.assets[0];
      navigateToUpload(
        asset.uri,
        asset.fileName || 'syllabus_photo.jpg',
        asset.mimeType || 'image/jpeg',
      );
    }
  };

  // Mirrors ALLOWED_MIME_TYPES in the parse-syllabus Edge Function.
  // iCloud Drive / Files contains HEIC / HEIF photos by default on iOS
  // (the system camera writes HEIC); restricting this list to JPG/PNG
  // hid those from the picker even though the backend accepts them.
  const FILE_PICKER_MIME = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/heic',
    'image/heif',
    'image/webp',
  ];

  // Some Files-app providers omit mimeType. Falling back to PDF for an
  // image mislabels the bytes sent to the parser — infer from extension.
  const inferMimeFromName = (name?: string | null): string => {
    const ext = (name ?? '').split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'jpg': case 'jpeg': return 'image/jpeg';
      case 'png': return 'image/png';
      case 'heic': return 'image/heic';
      case 'heif': return 'image/heif';
      case 'webp': return 'image/webp';
      default: return 'application/pdf';
    }
  };

  const handlePickFromFiles = async () => {
    if (!(await checkScanLimit())) return;
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await DocumentPicker.getDocumentAsync({
      type: FILE_PICKER_MIME,
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      navigateToUpload(
        asset.uri,
        asset.name || 'syllabus',
        asset.mimeType || inferMimeFromName(asset.name),
      );
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, { color: colors.ink }]}>Scan syllabus</Text>
        <Text style={[styles.subtitle, { color: colors.ink2 }]}>
          Snap it, upload it, or drag it in.{'\n'}We'll pull every deadline.
        </Text>

        {/* Free-scan usage. Pro = unlimited; free users see how many of
            their FREE_SCAN_LIMIT scans remain so the upsell isn't a
            surprise. Hidden while the count is still loading. */}
        {isPro ? (
          <View style={[styles.scanCountPill, { backgroundColor: colors.brand50 }]}>
            <FontAwesome name="check-circle" size={12} color={colors.brand} />
            <Text style={[styles.scanCountText, { color: colors.brand }]}>Unlimited scans</Text>
          </View>
        ) : !scanCountLoading ? (
          <View style={[styles.scanCountPill, { backgroundColor: remainingScans === 0 ? colors.coral50 : colors.brand50 }]}>
            <FontAwesome
              name={remainingScans === 0 ? 'lock' : 'bolt'}
              size={12}
              color={remainingScans === 0 ? colors.coral : colors.brand}
            />
            <Text style={[styles.scanCountText, { color: remainingScans === 0 ? colors.coral : colors.brand }]}>
              {remainingScans === 0
                ? `No free scans left of ${FREE_SCAN_LIMIT}`
                : `${remainingScans} of ${FREE_SCAN_LIMIT} free scan${remainingScans === 1 ? '' : 's'} left`}
            </Text>
          </View>
        ) : null}

        {/* Scan frame */}
        <View style={[styles.scanFrame, { backgroundColor: colors.brand }]}>
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
          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.line }]}
            onPress={handleTakePhoto}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Take a photo of a printed handout or whiteboard"
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.brand50 }]}>
              <FontAwesome name="camera" size={18} color={colors.brand} />
            </View>
            <View style={styles.actionContent}>
              <Text style={[styles.actionTitle, { color: colors.ink }]}>Take a photo</Text>
              <Text style={[styles.actionSub, { color: colors.ink3 }]}>Printed handout or whiteboard</Text>
            </View>
            <FontAwesome name="chevron-right" size={12} color={colors.ink3} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.line }]}
            onPress={handleUploadPDF}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Upload a PDF from an email attachment or download"
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.coral50 }]}>
              <FontAwesome name="file-pdf-o" size={18} color={colors.coral} />
            </View>
            <View style={styles.actionContent}>
              <Text style={[styles.actionTitle, { color: colors.ink }]}>Upload PDF</Text>
              <Text style={[styles.actionSub, { color: colors.ink3 }]}>Email attachment or download</Text>
            </View>
            <FontAwesome name="chevron-right" size={12} color={colors.ink3} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.line }]}
            onPress={handleChooseFromPhotos}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Choose a syllabus image from your photo library"
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.teal50 }]}>
              <FontAwesome name="image" size={17} color={colors.teal} />
            </View>
            <View style={styles.actionContent}>
              <Text style={[styles.actionTitle, { color: colors.ink }]}>Choose from Photos</Text>
              <Text style={[styles.actionSub, { color: colors.ink3 }]}>Select from your photo library</Text>
            </View>
            <FontAwesome name="chevron-right" size={12} color={colors.ink3} />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.line }]}
            onPress={handlePickFromFiles}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Pick a syllabus from Files, iCloud Drive, or Google Drive"
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.blue50 }]}>
              <FontAwesome name="folder-open-o" size={16} color={colors.blue} />
            </View>
            <View style={styles.actionContent}>
              <Text style={[styles.actionTitle, { color: colors.ink }]}>Pick from Files</Text>
              <Text style={[styles.actionSub, { color: colors.ink3 }]}>iCloud Drive, Google Drive...</Text>
            </View>
            <FontAwesome name="chevron-right" size={12} color={colors.ink3} />
          </TouchableOpacity>
        </View>

        {/* Photo/camera scans capture a single page; PDFs are read in full.
            Non-blocking heads-up so a multi-page paper syllabus isn't
            silently truncated to its first page. */}
        <View style={styles.multiPageNote}>
          <FontAwesome name="info-circle" size={13} color={colors.ink3} style={styles.multiPageNoteIcon} />
          <Text style={[styles.multiPageNoteText, { color: colors.ink3 }]}>
            Photo scans capture one page. For a multi-page syllabus, upload a PDF or scan the pages into a single PDF.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 120, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  title: { fontFamily: FONTS.displaySemibold, fontSize: 27, color: COLORS.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: COLORS.ink2, marginTop: 4, lineHeight: 19 },
  scanCountPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginTop: 12 },
  scanCountText: { fontSize: 13, fontWeight: '600' },
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
  multiPageNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, marginTop: 14, paddingHorizontal: 4 },
  multiPageNoteIcon: { marginTop: 1 },
  multiPageNoteText: { flex: 1, fontSize: 12, color: COLORS.ink3, lineHeight: 17 },
});
