import { TouchableOpacity } from '@/components/LocalizedReactNative';
import { Alert, Text } from '@/components/LocalizedReactNative';
import {
  useCallback,
  useEffect,
  useRef,
  useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Linking,
} from 'react-native';
import {
  SafeAreaView } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter,
  useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import {
  Platform,
} from 'react-native';
import { COLORS, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import { useResponsive } from '@/lib/responsive';
import { useAppStore, findCurrentSemester } from '@/store/appStore';
import { useSemesters, useCourses, useScanCount, FREE_SCAN_LIMIT } from '@/lib/queries';
import { FREE_COURSE_LIMIT } from '@/lib/syllabus';
import { MAX_SCAN_PAGES, MAX_SCAN_RAW_BYTES, scanTooLargeMessage, type SyllabusPage } from '@/lib/ai-extraction';
import { getFileSize } from '@/lib/readFileBase64';
import {
  normalizeSupportedDocument,
  SUPPORTED_DOCUMENT_PICKER_TYPE,
  unsupportedDocumentMessage,
} from '@/lib/documentFiles';
import { GlobalSearchButton } from '@/components/GlobalSearchButton';

// Best-effort raw file size for the multi-page upload budget. Returns 0 when
// the size can't be read (rare — picker URIs are local files), so the budget
// check fails open; the pre-flight in extractFromPages is the final gate for
// anything that slips through.
const getFileSizeBestEffort = async (uri: string): Promise<number> => {
  try {
    return await getFileSize(uri);
  } catch {
    return 0;
  }
};

export default function ScanScreen() {
  const colors = useColors();
  const { contentMaxWidth } = useResponsive();
  const router = useRouter();
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);
  const isPro = useAppStore((s) => s.isPro);
  const qc = useQueryClient();
  const { data: semesters = [] } = useSemesters();
  const { data: courses = [] } = useCourses(selectedSemesterId);
  const { data: scanCount = 0, isLoading: scanCountLoading } = useScanCount();

  // The free tier has TWO separate caps — scans AND courses-per-semester — and
  // a scan that extracts a NEW course trips the course cap even with scans
  // left. Surfacing the course usage here stops that from reading as a
  // contradictory "you have scans but it says upgrade" once the gate fires.
  const atCourseLimit = !isPro && courses.length >= FREE_COURSE_LIMIT;

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
        `You've used your ${FREE_SCAN_LIMIT} free scans this month. They reset on the 1st — or upgrade to Pro for unlimited syllabus scanning.`,
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
          `This will use your last of ${FREE_SCAN_LIMIT} free scans this month. After this you'll need Pro (or wait for the monthly reset) for more.`,
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

  // Multi-page photo scans: fileUri/fileName/mimeType still describe the
  // FIRST page (legacy param shape — upload.tsx's display chip, storage
  // upload, and the upload row all key off it), with the full ordered page
  // list JSON-encoded alongside. One submission = one scan server-side.
  const navigateToUploadPages = (pages: SyllabusPage[]) => {
    if (pages.length === 0) return;
    if (pages.length === 1) {
      navigateToUpload(pages[0].uri, 'syllabus_photo.jpg', pages[0].mimeType);
      return;
    }
    router.push({
      pathname: '/syllabus/upload',
      params: {
        fileUri: pages[0].uri,
        fileName: `syllabus_scan_${pages.length}_pages.jpg`,
        mimeType: pages[0].mimeType,
        pages: JSON.stringify(pages),
      },
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

    // Camera loop: after each shot, offer "Add another page" so a stapled
    // multi-page syllabus can be captured as ONE scan (up to MAX_SCAN_PAGES)
    // instead of the first page only.
    const pages: SyllabusPage[] = [];
    // Running raw-byte total for the pages captured so far — enforced
    // against MAX_SCAN_RAW_BYTES as each page is ADDED, so the user learns
    // about the size ceiling one page too early instead of capturing all
    // five and then watching the whole scan fail with "File too large".
    let totalBytes = 0;
    while (pages.length < MAX_SCAN_PAGES) {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        // First page keeps 0.8 for maximum OCR fidelity on single-page
        // scans. Once the user opts into multi-page, later shots drop to
        // 0.5: several 0.8-quality iPhone photos easily blow the ~10MB
        // upload budget, we can't recompress already-captured pages
        // (expo-image-manipulator broke the EAS build and was reverted in
        // ab79b84), and 0.5 JPEG is still ample for printed syllabus text.
        quality: pages.length === 0 ? 0.8 : 0.5,
      });

      if (result.canceled || !result.assets[0]) {
        // Backed out of the camera. Nothing captured yet -> plain cancel;
        // pages already captured -> ask rather than silently discarding them.
        if (pages.length === 0) return;
        const keep = await new Promise<boolean>((resolve) => {
          Alert.alert(
            'Keep captured pages?',
            `You've captured ${pages.length} page${pages.length === 1 ? '' : 's'}. Scan ${pages.length === 1 ? 'it' : 'them'} now, or discard?`,
            [
              { text: 'Discard', style: 'destructive', onPress: () => resolve(false) },
              { text: `Scan ${pages.length} page${pages.length === 1 ? '' : 's'}`, onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        });
        if (!keep) return;
        break;
      }

      const asset = result.assets[0];
      const size = await getFileSizeBestEffort(asset.uri);
      // Size budget at add time (never applied to the FIRST page — a lone
      // photo is always attemptable, and the extractFromPages pre-flight
      // backstops pathological cases). If this page would push the total
      // past the budget, drop it and scan the pages already captured.
      if (pages.length > 0 && totalBytes + size > MAX_SCAN_RAW_BYTES) {
        await new Promise<void>((resolve) => {
          Alert.alert(
            'Photos too large',
            scanTooLargeMessage(pages.length),
            [{ text: `Scan ${pages.length} page${pages.length === 1 ? '' : 's'}`, onPress: () => resolve() }],
            { cancelable: true, onDismiss: () => resolve() },
          );
        });
        break;
      }
      totalBytes += size;
      pages.push({ uri: asset.uri, mimeType: asset.mimeType || 'image/jpeg' });
      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (pages.length >= MAX_SCAN_PAGES) {
        // Cap with clear messaging instead of a silently disabled option.
        await new Promise<void>((resolve) => {
          Alert.alert(
            'Page limit reached',
            `Photo scans support up to ${MAX_SCAN_PAGES} pages. Scanning what you've captured — for longer syllabi, upload a PDF.`,
            [{ text: 'OK', onPress: () => resolve() }],
            { cancelable: true, onDismiss: () => resolve() },
          );
        });
        break;
      }

      const addAnother = await new Promise<boolean>((resolve) => {
        Alert.alert(
          `Page ${pages.length} captured`,
          `Add another page, or scan the ${pages.length} you have? (Up to ${MAX_SCAN_PAGES} pages per scan.)`,
          [
            { text: 'Add another page', onPress: () => resolve(true) },
            { text: `Scan ${pages.length} page${pages.length === 1 ? '' : 's'}`, onPress: () => resolve(false) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      });
      if (!addAnother) break;
    }

    navigateToUploadPages(pages);
  };

  const handleUploadDocument = async () => {
    if (!(await checkScanLimit())) return;
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await DocumentPicker.getDocumentAsync({
      type: SUPPORTED_DOCUMENT_PICKER_TYPE,
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const document = normalizeSupportedDocument(asset.name, asset.mimeType);
      if (!document) {
        Alert.alert('Unsupported file', unsupportedDocumentMessage(asset.name));
        return;
      }
      navigateToUpload(asset.uri, document.fileName, document.mimeType);
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
      // 0.5 rather than the single-file 0.8: quality is fixed BEFORE we know
      // how many photos the user picks, and a multi-select of up to
      // MAX_SCAN_PAGES full-res photos at 0.8 easily exceeds the ~10MB
      // upload budget. We can't recompress after selection
      // (expo-image-manipulator broke the EAS build and was reverted in
      // ab79b84), and 0.5 JPEG is still ample for printed syllabus text.
      quality: 0.5,
      // Multi-select: the pipeline now sends every page to the parser as one
      // scan. orderedSelection so page order follows the user's tap order,
      // not library order.
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: MAX_SCAN_PAGES,
    });

    if (!result.canceled && result.assets.length > 0) {
      // selectionLimit caps the native picker, but guard anyway (Android and
      // older iOS builds don't always honor it) — with clear messaging
      // instead of silently dropping extras.
      let assets = result.assets;
      if (assets.length > MAX_SCAN_PAGES) {
        assets = assets.slice(0, MAX_SCAN_PAGES);
        Alert.alert(
          'Page limit',
          `Photo scans support up to ${MAX_SCAN_PAGES} pages — scanning the first ${MAX_SCAN_PAGES} you selected. For longer syllabi, upload a PDF.`,
        );
      }
      // Same raw-byte budget as the camera loop, applied at add time: keep
      // the leading pages that fit under MAX_SCAN_RAW_BYTES (leading, so
      // page order is preserved), drop the rest with a specific alert
      // instead of sending everything and failing the whole scan with the
      // server's "File too large" 413. The first page is always kept — a
      // lone photo is always attemptable, and the extractFromPages
      // pre-flight backstops pathological cases.
      const fitted: SyllabusPage[] = [];
      let totalBytes = 0;
      for (const a of assets) {
        const size = await getFileSizeBestEffort(a.uri);
        if (fitted.length > 0 && totalBytes + size > MAX_SCAN_RAW_BYTES) break;
        totalBytes += size;
        fitted.push({ uri: a.uri, mimeType: a.mimeType || 'image/jpeg' });
      }
      if (fitted.length < assets.length) {
        // Await the alert so it isn't racing the navigation push.
        await new Promise<void>((resolve) => {
          Alert.alert(
            'Photos too large',
            scanTooLargeMessage(fitted.length),
            [{ text: `Scan ${fitted.length} page${fitted.length === 1 ? '' : 's'}`, onPress: () => resolve() }],
            { cancelable: true, onDismiss: () => resolve() },
          );
        });
      }
      navigateToUploadPages(fitted);
    }
  };

  const handlePickFromFiles = async () => {
    if (!(await checkScanLimit())) return;
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await DocumentPicker.getDocumentAsync({
      type: SUPPORTED_DOCUMENT_PICKER_TYPE,
      copyToCacheDirectory: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const document = normalizeSupportedDocument(asset.name, asset.mimeType);
      if (!document) {
        Alert.alert('Unsupported file', unsupportedDocumentMessage(asset.name));
        return;
      }
      navigateToUpload(asset.uri, document.fileName, document.mimeType);
    }
  };

  // Real drag-and-drop for the web app — the screen's own copy already
  // promises "drag it in". expo-document-picker's web implementation (the
  // same one "Upload PDF"/"Pick from Files" already use successfully) hands
  // off a blob: URL + mimeType + name from a File the same way; a dropped
  // File is handled identically so it flows through the exact same
  // navigateToUpload -> /syllabus/upload pipeline, no new code downstream.
  const handleDroppedFile = async (file: File) => {
    if (!(await checkScanLimit())) return;
    const document = normalizeSupportedDocument(file.name, file.type);
    if (!document) {
      Alert.alert('Unsupported file', unsupportedDocumentMessage(file.name));
      return;
    }
    navigateToUpload(URL.createObjectURL(file), document.fileName, document.mimeType);
  };

  const dropZoneRef = useRef<View>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = dropZoneRef.current as unknown as HTMLElement | null;
    if (!node) return;
    // react-native-web's View doesn't forward onDrop/onDragOver props (not in
    // its curated forwardedProps list), so this listens on the underlying DOM
    // node directly via ref instead — the same imperative-DOM pattern already
    // used for the ⌘K/⇧⌘A shortcuts in components/WebAppFrame.tsx.
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(true);
    };
    const onDragLeave = () => setIsDraggingOver(false);
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) handleDroppedFile(file).catch(() => {});
    };
    node.addEventListener('dragover', onDragOver);
    node.addEventListener('dragleave', onDragLeave);
    node.addEventListener('drop', onDrop);
    return () => {
      node.removeEventListener('dragover', onDragOver);
      node.removeEventListener('dragleave', onDragLeave);
      node.removeEventListener('drop', onDrop);
    };
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.paper }]} edges={['top']}>
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={[styles.title, { color: colors.ink }]}>Scan syllabus</Text>
          <GlobalSearchButton />
        </View>
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
                ? `No free scans left this month`
                : `${remainingScans} of ${FREE_SCAN_LIMIT} free scans left this month`}
            </Text>
          </View>
        ) : null}

        {/* Course-cap heads-up — a DISTINCT limit from the scan count. Without
            this, a free user at their course limit sees "free scans left" yet
            gets an upgrade prompt when a new-course scan trips the course cap,
            which reads as contradictory. */}
        {atCourseLimit && (
          <View style={[styles.courseCapNote, { backgroundColor: colors.amber50, borderColor: colors.amber }]}>
            <FontAwesome name="info-circle" size={13} color={colors.amber} style={{ marginTop: 1 }} />
            <Text style={[styles.courseCapText, { color: colors.ink2 }]}>
              {remainingScans > 0
                ? `You have ${remainingScans} free scan${remainingScans === 1 ? '' : 's'} left, but you're at the free limit of ${FREE_COURSE_LIMIT} courses this semester. Re-scan a course you already have, or upgrade to Pro to add a new one.`
                : `You've used your free scans and reached the ${FREE_COURSE_LIMIT}-course limit. Upgrade to Pro for unlimited scans and courses.`}
            </Text>
          </View>
        )}

        {/* Scan frame — also the web drag-and-drop target (see dropZoneRef). */}
        <View
          ref={dropZoneRef}
          style={[
            styles.scanFrame,
            { backgroundColor: colors.brand },
            isDraggingOver && styles.scanFrameDragging,
          ]}
        >
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
          <Text style={styles.frameLabel}>{isDraggingOver ? 'Drop it here' : 'Documents & photos supported'}</Text>
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
            onPress={handleUploadDocument}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Upload a syllabus document from an email attachment or download"
          >
            <View style={[styles.actionIcon, { backgroundColor: colors.coral50 }]}>
              <FontAwesome name="file-text-o" size={18} color={colors.coral} />
            </View>
            <View style={styles.actionContent}>
              <Text style={[styles.actionTitle, { color: colors.ink }]}>Upload a document</Text>
              <Text style={[styles.actionSub, { color: colors.ink3 }]}>PDF, Word, slides, spreadsheet...</Text>
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

          {/* Desktop-native win: copy-pasting text from a PDF/LMS page skips
              the image/OCR step entirely. No camera on a laptop, but a real
              keyboard/clipboard — so this is web-only. */}
          {Platform.OS === 'web' && (
            <TouchableOpacity
              style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.line }]}
              onPress={() => router.push('/syllabus/paste' as any)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Paste syllabus text"
            >
              <View style={[styles.actionIcon, { backgroundColor: colors.amber50 }]}>
                <FontAwesome name="align-left" size={16} color={colors.amber} />
              </View>
              <View style={styles.actionContent}>
                <Text style={[styles.actionTitle, { color: colors.ink }]}>Paste text</Text>
                <Text style={[styles.actionSub, { color: colors.ink3 }]}>Copied from a PDF or your LMS page</Text>
              </View>
              <FontAwesome name="chevron-right" size={12} color={colors.ink3} />
            </TouchableOpacity>
          )}
        </View>

        {/* Photo/camera scans support multiple pages per scan; documents are
            read in full. PDF remains best when visual charts matter because
            non-PDF document inputs are text-extracted by the model API. */}
        <View style={styles.multiPageNote}>
          <FontAwesome name="info-circle" size={13} color={colors.ink3} style={styles.multiPageNoteIcon} />
          <Text style={[styles.multiPageNoteText, { color: colors.ink3 }]}>
            Photo scans support up to {MAX_SCAN_PAGES} pages per scan. Documents are read in full; use PDF when charts or diagrams matter.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, paddingBottom: 120, width: '100%', maxWidth: SCREEN_MAX_WIDTH, alignSelf: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: FONTS.displaySemibold, fontSize: 27, color: COLORS.ink, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: COLORS.ink2, marginTop: 4, lineHeight: 19 },
  scanCountPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, marginTop: 12 },
  scanCountText: { fontSize: 13, fontWeight: '600' },
  courseCapNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10, padding: 10, borderRadius: 12, borderWidth: 1 },
  courseCapText: { flex: 1, fontSize: 12, lineHeight: 17 },
  scanFrame: { backgroundColor: COLORS.brand, borderRadius: 22, padding: 22, marginVertical: 18, alignItems: 'center', borderWidth: 3, borderColor: 'transparent' },
  scanFrameDragging: { borderColor: '#fff', ...Platform.select({ web: { boxShadow: '0 0 0 4px rgba(255,255,255,0.3)' }, default: {} }) },
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
