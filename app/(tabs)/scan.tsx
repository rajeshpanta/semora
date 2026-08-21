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
  useLocalSearchParams,
  useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import {
  Platform,
} from 'react-native';
import { COLORS, FONTS, SCREEN_MAX_WIDTH } from '@/lib/constants';
import { useColors } from '@/lib/theme';
import AppHeader from '@/components/AppHeader';
import { track } from '@/lib/analytics';
import { ProUpsellSheet } from '@/components/ProUpsellSheet';
import { HEIC_HELP, isHeic, transcodeHeicToJpeg } from '@/lib/heic';
import { useResponsive } from '@/lib/responsive';
import { useAppStore, findCurrentSemester } from '@/store/appStore';
import { useSemesters, useCourses, useFreeActionUsed, freeActionUsedQueryOptions } from '@/lib/queries';
import { FREE_COURSE_LIMIT } from '@/lib/syllabus';
import { canvasFreePromoQuery, canvasOfferFor, lmsConnectionsQuery } from '@/lib/lms';
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

// A picked asset's declared type, or the best guess from its filename — never
// a blind 'image/jpeg'. expo-image-picker documents mimeType as "null if could
// not be determined", and defaulting that to JPEG is precisely how a HEIC got
// forwarded to the model wearing the wrong label and came back as an
// unactionable 400.
function assetMimeType(asset: { mimeType?: string | null; fileName?: string | null; uri?: string }): string {
  if (asset.mimeType) return asset.mimeType;
  const name = asset.fileName || asset.uri || '';
  const normalized = normalizeSupportedDocument(name, null);
  if (normalized?.category === 'image') return normalized.mimeType;
  // Unknown: say so rather than guessing. The server reads the header and
  // decides, and a wrong guess here is what this whole change exists to stop.
  return 'application/octet-stream';
}

export default function ScanScreen() {
  const colors = useColors();
  const { contentMaxWidth, isDesktop } = useResponsive();
  const router = useRouter();
  const selectedSemesterId = useAppStore((s) => s.selectedSemesterId);
  const setSelectedSemester = useAppStore((s) => s.setSelectedSemester);
  const isPro = useAppStore((s) => s.isPro);
  const qc = useQueryClient();
  const { data: semesters = [] } = useSemesters();
  const { data: courses = [] } = useCourses(selectedSemesterId);
  const { data: freeActionUsed = false, isLoading: freeActionLoading } = useFreeActionUsed();
  const { data: lmsConnections } = useQuery(lmsConnectionsQuery);
  const { data: canvasFreePromo } = useQuery(canvasFreePromoQuery);
  const { offer: canvasOffer, free: canvasFree } = canvasOfferFor(lmsConnections, isPro, canvasFreePromo);
  const [upsellVisible, setUpsellVisible] = useState(false);
  // Which wall was hit. The scan limit and the Canvas Pro gate are different
  // reasons and must not borrow each other's words.
  const [upsellReason, setUpsellReason] = useState<'scan' | 'canvas'>('scan');

  // The free tier has TWO separate caps — scans AND courses-per-semester — and
  // a scan that extracts a NEW course trips the course cap even with scans
  // left. Surfacing the course usage here stops that from reading as a
  // contradictory "you have scans but it says upgrade" once the gate fires.
  // Canvas classes excluded: they are uncapped under the free-sync offer, and
  // enforce_free_course_limit (090) ignores them server-side. Counting them
  // here would tell a student who just imported seven Canvas classes that they
  // are out of courses, seconds after being told the import was free.
  const atCourseLimit = !isPro && courses.filter((c: any) => c.source !== 'lms').length >= FREE_COURSE_LIMIT;

  // After a scan completes, syllabus_uploads is inserted by processSyllabus
  // and the server count goes up. Re-entering the scan tab without
  // invalidation would read the 1-minute-stale cache — so the "Last Free
  // Scan" warning could miss-fire and the limit check could let through
  // a scan that the DB then blocks (M2 surfaces P0001 as the fallback, but
  // catching it here is cleaner UX).
  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ['freeActionUsed'] });
    }, [qc]),
  );

  const checkScanLimit = async (): Promise<boolean> => {
    if (isPro) return true;

    // WAIT for the answer rather than refusing on it. The "+" menu deep-links
    // straight into a picker, which fires on this screen's first commit — long
    // before the check can have loaded. Alerting "Please Wait" there turned the
    // menu's whole purpose (skip the chooser, go straight to the camera) into a
    // dead tap that never retried once the answer arrived. ensureQueryData
    // resolves immediately when the value is already cached, so the common path
    // is unchanged.
    let used = freeActionUsed;
    if (freeActionLoading) {
      try {
        used = await qc.ensureQueryData(freeActionUsedQueryOptions);
      } catch {
        // The server enforces this too, and refusing to open a picker
        // because one RPC failed punishes the user for our outage.
        return true;
      }
    }

    if (used) {
      // The paywall moment gets a sheet, not an alert: an alert has no room to
      // say what Pro actually costs or includes, so the decision was being
      // asked for on no information, two taps from the thing they wanted.
      setUpsellReason('scan');
      setUpsellVisible(true);
      return false;
    }

    // Heads-up before the student spends the only free action they get, since
    // there is no monthly reset to fall back on. Lecture recording draws from
    // the same one, so it is named here — finding that out afterwards, having
    // meant to save it for a lecture, is the version of this that feels like a
    // trick rather than a limit.
    return new Promise((resolve) => {
      Alert.alert(
        'Use Your Free Scan?',
        'Free accounts include one AI action: a syllabus scan or a lecture recording. This uses it. Pro includes unlimited scans and lectures.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'See Pro', onPress: () => { setUpsellReason('scan'); setUpsellVisible(true); resolve(false); } },
          { text: 'Use Free Scan', onPress: () => resolve(true) },
        ],
        { cancelable: true, onDismiss: () => resolve(false) },
      );
    });
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
    // Name the file after what it ACTUALLY is. This used to hardcode
    // "syllabus_photo.jpg" for every single-page photo, which is a lie on web:
    // the browser picker hands back the original bytes (expo-image-picker's web
    // build ignores `quality` and never re-encodes), so a PNG screenshot
    // arrived labelled .jpg. The server normalizes extension-first, relabelled
    // it image/jpeg, and the model got a JPEG header wrapped around PNG bytes —
    // a 400 whose only offered action was "Try Again", which failed identically
    // forever.
    const ext = (m: string) => (m === 'image/png' ? 'png' : m === 'image/webp' ? 'webp' : 'jpg');
    // Camera capture finished with at least one page kept. The multi-page
    // count is the interesting part: it says whether students photograph one
    // page and stop, or work through a whole syllabus.
    track('scan_source_selected', {
      screen: 'scan', method: 'camera', pages: pages.length, mime: pages[0]?.mimeType ?? null,
    });
    if (pages.length === 1) {
      navigateToUpload(pages[0].uri, `syllabus_photo.${ext(pages[0].mimeType)}`, pages[0].mimeType);
      return;
    }
    router.push({
      pathname: '/syllabus/upload',
      params: {
        fileUri: pages[0].uri,
        fileName: `syllabus_scan_${pages.length}_pages.${ext(pages[0].mimeType)}`,
        mimeType: pages[0].mimeType,
        pages: JSON.stringify(pages),
      },
    } as any);
  };

  // expo-image-picker's WEB build resolves its promise from inside a `change`
  // listener that has no reject path: if the picked file has no MIME mapping
  // (or the user defeats the accept filter with "All Files"), it throws in
  // there and the promise NEVER SETTLES. The awaiting handler then hangs
  // forever — no result, no error, no spinner — and the card looks dead.
  // Every picker call goes through here so a hang or a throw becomes an
  // honest message and a cancelled result instead of a stuck screen.
  const safePick = async (work: () => Promise<any>): Promise<any> => {
    const CANCELLED = { canceled: true, assets: [] };
    let timer: any;
    try {
      const result = await Promise.race([
        work(),
        new Promise((resolve) => { timer = setTimeout(() => resolve('__timeout__'), 120_000); }),
      ]);
      if (result === '__timeout__') {
        Alert.alert(
          "Couldn't open that file",
          'Semora could not read that file. Please try a different one — PDF works best.',
        );
        return CANCELLED;
      }
      return result;
    } catch {
      Alert.alert(
        "Couldn't open that file",
        'Semora could not read that file. Please try a different one — PDF works best.',
      );
      return CANCELLED;
    } finally {
      clearTimeout(timer);
    }
  };

  const handleTakePhoto = async () => {
    // Fired BEFORE the free-tier gate on purpose: a student who taps this
    // and is turned away still counts as having tried to scan. Firing it
    // after the gate would make the paywall look like disinterest.
    track('scan_started', { screen: 'scan', method: 'camera' });
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
      const result = await safePick(() => ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        // First page keeps 0.8 for maximum OCR fidelity on single-page
        // scans. Once the user opts into multi-page, later shots drop to
        // 0.5: several 0.8-quality iPhone photos easily blow the ~10MB
        // upload budget, we can't recompress already-captured pages
        // (expo-image-manipulator broke the EAS build and was reverted in
        // ab79b84), and 0.5 JPEG is still ample for printed syllabus text.
        quality: pages.length === 0 ? 0.8 : 0.5,
      }));

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
      pages.push({ uri: asset.uri, mimeType: assetMimeType(asset) });
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
    // Fired BEFORE the free-tier gate on purpose: a student who taps this
    // and is turned away still counts as having tried to scan. Firing it
    // after the gate would make the paywall look like disinterest.
    track('scan_started', { screen: 'scan', method: 'document' });
    if (!(await checkScanLimit())) return;
    if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await safePick(() => DocumentPicker.getDocumentAsync({
      type: SUPPORTED_DOCUMENT_PICKER_TYPE,
      copyToCacheDirectory: true,
    }));

    if (result.canceled || !result.assets?.[0]) {
      // The picker opening and being dismissed was previously invisible: the
      // funnel went straight from intent to nothing, so an abandoned scan and
      // a scan that was never attempted looked identical.
      track('scan_cancelled', { screen: 'scan', method: 'document' });
      return;
    }
    {
      const asset = result.assets[0];
      track('scan_source_selected', {
        screen: 'scan', method: 'document', pages: 1,
        mime: asset.mimeType ?? null,
        kb: asset.size ? Math.round(asset.size / 1024) : null,
      });
      if (isHeic(asset.name, asset.mimeType)) {
        // Transcode in-page when the browser can (Safari decodes HEIC), purely
        // to save the upload of a larger file. Everywhere else — every iPhone,
        // Chrome, Firefox — it now goes to the server as-is, which decodes it.
        // This used to dead-end in an alert telling the student to go change a
        // camera setting and take the photo again.
        const converted = await transcodeHeicToJpeg(asset.uri);
        navigateToUpload(
          converted?.uri ?? asset.uri,
          converted ? 'syllabus_photo.jpg' : (asset.name || 'syllabus_photo.heic'),
          converted?.mimeType ?? 'image/heic',
        );
        return;
      }
      const document = normalizeSupportedDocument(asset.name, asset.mimeType);
      if (!document) {
        Alert.alert('Unsupported file', unsupportedDocumentMessage(asset.name));
        return;
      }
      navigateToUpload(asset.uri, document.fileName, document.mimeType);
    }
  };

  const handleChooseFromPhotos = async () => {
    // Fired BEFORE the free-tier gate on purpose: a student who taps this
    // and is turned away still counts as having tried to scan. Firing it
    // after the gate would make the paywall look like disinterest.
    track('scan_started', { screen: 'scan', method: 'photos' });
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

    const result = await safePick(() => ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // 0.5 rather than the single-file 0.8: quality is fixed BEFORE we know
      // how many photos the user picks, and a multi-select of up to
      // MAX_SCAN_PAGES full-res photos at 0.8 easily exceeds the ~10MB
      // upload budget. We can't recompress after selection
      // (expo-image-manipulator broke the EAS build and was reverted in
      // ab79b84), and 0.5 JPEG is still ample for printed syllabus text.
      quality: 0.5,
      // Ask iOS for the most COMPATIBLE representation rather than the
      // original. The default is Automatic, which Apple may satisfy with the
      // untouched HEIC — and HEIC is what an iPhone shoots. Compatible makes
      // the picker hand back JPEG, so the format never reaches the parser.
      // This is the fix at the source; the byte sniff in parse-syllabus is the
      // net under it for builds already in the wild.
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      // Multi-select: the pipeline now sends every page to the parser as one
      // scan. orderedSelection so page order follows the user's tap order,
      // not library order.
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: MAX_SCAN_PAGES,
    }));

    if (result.canceled || result.assets.length === 0) {
      track('scan_cancelled', { screen: 'scan', method: 'photos' });
      return;
    }
    {
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
        fitted.push({ uri: a.uri, mimeType: assetMimeType(a) });
      }
      track('scan_source_selected', {
        screen: 'scan', method: 'photos',
        pages: fitted.length,
        // How often the byte budget silently drops pages a student picked.
        dropped: assets.length - fitted.length,
        kb: Math.round(totalBytes / 1024),
      });
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

  const handleDroppedFile = async (file: File) => {
    if (!(await checkScanLimit())) return;
    // Dragging an iPhone photo onto the web app is the single most natural web
    // flow and it used to be refused outright. Safari can decode HEIC, so
    // convert in-page and skip uploading the larger original; Chrome and
    // Firefox now send it untouched, because the server decodes it.
    if (isHeic(file.name, file.type)) {
      const converted = await transcodeHeicToJpeg(URL.createObjectURL(file));
      navigateToUpload(
        converted?.uri ?? URL.createObjectURL(file),
        converted ? 'syllabus_photo.jpg' : (file.name || 'syllabus_photo.heic'),
        converted?.mimeType ?? 'image/heic',
      );
      return;
    }
    const document = normalizeSupportedDocument(file.name, file.type);
    if (!document) {
      Alert.alert('Unsupported file', unsupportedDocumentMessage(file.name));
      return;
    }
    navigateToUpload(URL.createObjectURL(file), document.fileName, document.mimeType);
  };

  // Deep-link actions from the "+" tab menu. The menu now presents all four
  // capture methods itself, so arriving here always carries an intent — this
  // screen is the landing surface the picker returns to, not a second chooser
  // the user has to work through. The param is cleared before triggering so
  // re-focusing the tab can't re-open a picker.
  const { action } = useLocalSearchParams<{ action?: string }>();
  const actionFired = useRef<string | null>(null);
  useEffect(() => {
    if (!action) {
      // Param cleared — re-arm so a later menu tap with the same action fires.
      actionFired.current = null;
      return;
    }
    if (actionFired.current === action) return;
    actionFired.current = action;
    router.setParams({ action: '' });
    if (action === 'document') {
      handleUploadDocument();
    } else if (action === 'photos') {
      handleChooseFromPhotos();
    } else if (action === 'camera') {
      handleTakePhoto();
    }
  }, [action]);

  const dropZoneRef = useRef<View>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Always call the LATEST handler. This effect runs once, so a handler
  // captured here keeps first-render state forever — checkScanLimit would read
  // scanCount from mount, and drag-and-drop (a web-only entry point, so the
  // path most web users take) could burn a scan past the free limit that the
  // buttons on the very same screen correctly refuse.
  const dropHandler = useRef(handleDroppedFile);
  dropHandler.current = handleDroppedFile;

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // The whole scan screen is the drop target, not just the frame. Asking
    // someone to hit a specific rectangle with a dragged file is a precision
    // test with a punishing failure mode; the frame still lights up, but a drop
    // anywhere on this screen means the same thing. WebAppFrame swallows drops
    // everywhere else so the browser can never navigate away from the app.
    const node = document.body;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      (e as any).__semoraHandled = true;
      setIsDraggingOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      // relatedTarget is null when the pointer actually leaves the window,
      // rather than merely crossing between child elements.
      if ((e as any).relatedTarget) return;
      setIsDraggingOver(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      (e as any).__semoraHandled = true;
      setIsDraggingOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) dropHandler.current(file).catch(() => {});
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
      <ProUpsellSheet
        visible={upsellVisible}
        reason={upsellReason}
        onClose={() => setUpsellVisible(false)}
      />
      <ScrollView contentContainerStyle={[styles.content, { maxWidth: contentMaxWidth }]} showsVerticalScrollIndicator={false}>
        {/* Desktop web only. The sidebar there calls this "Import syllabus"
            while the page called itself "Scan syllabus" — one destination
            under two names. That sidebar (WebAppFrame) never renders on iOS,
            where the "+" menu and this page already agreed, so native keeps
            its original header and its original name. */}
        {isDesktop ? (
          <AppHeader
            title="Import syllabus"
            context="Snap it, upload it, or drag it in — we'll pull every deadline."
            actions={<GlobalSearchButton />}
          />
        ) : (
          <>
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: colors.ink }]}>Scan syllabus</Text>
              <GlobalSearchButton />
            </View>
            <Text style={[styles.subtitle, { color: colors.ink2 }]}>
              Snap it, upload it, or drag it in.{'\n'}We'll pull every deadline.
            </Text>
          </>
        )}

        {/* Canvas, before any of the upload options.
            A student on this screen is about to do by hand — photograph a
            syllabus, find the PDF — what Canvas does by itself, and keeps doing
            every time an instructor moves a date. Offering it after the upload
            buttons would be offering it to someone who has already started the
            slower path. Hidden entirely once Canvas is connected and syncing. */}
        {canvasOffer !== 'healthy' && (
          <TouchableOpacity
            style={[styles.canvasCard, { backgroundColor: colors.teal50, borderColor: colors.teal }]}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={
              canvasOffer === 'needs_attention' ? 'Finish Canvas setup'
              : canvasFree ? 'Connect Canvas free, limited time offer'
              : 'Connect Canvas'
            }
            onPress={() => {
              track('canvas_offer_tapped', { screen: 'scan', offer: canvasOffer, free: canvasFree });
              // A free account gets the upgrade SHEET here, not a trip to
              // another screen. The offer and the answer belong in the same
              // place — sending someone to Settings or a full paywall screen
              // to learn the price is how a tap turns into navigation.
              if (canvasOffer === 'locked') {
                setUpsellReason('canvas');
                setUpsellVisible(true);
                return;
              }
              router.push('/settings/lms' as any);
            }}
          >
            <View style={[styles.canvasIcon, { backgroundColor: colors.teal + '22' }]}>
              <FontAwesome name={canvasOffer === 'needs_attention' ? 'refresh' : 'university'} size={16} color={colors.teal} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.canvasTitleRow}>
                <Text style={[styles.canvasTitle, { color: colors.ink }]}>
                  {canvasOffer === 'needs_attention' ? 'Finish Canvas setup' : 'Connect Canvas instead'}
                </Text>
                {/* The loudest place in the app to say this. A student on the
                    scan screen is about to spend their one lifetime free AI
                    action on a single syllabus, when Canvas would bring every
                    class for nothing. Telling them after they have spent it
                    would be telling them too late. */}
                {canvasFree && canvasOffer !== 'needs_attention' && (
                  <View style={[styles.canvasPro, { backgroundColor: colors.teal }]}>
                    <Text style={styles.canvasProText}>FREE</Text>
                  </View>
                )}
                {canvasOffer === 'locked' && (
                  <View style={[styles.canvasPro, { backgroundColor: colors.brand }]}>
                    <FontAwesome name="star" size={8} color="#fff" />
                    <Text style={styles.canvasProText}>PRO</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.canvasSub, { color: colors.ink2 }]}>
                {canvasOffer === 'needs_attention'
                  ? 'Connected, but not syncing on its own yet'
                  : canvasFree
                    ? 'Limited time: no Pro needed, and it does not touch your free scan. Every class imports itself.'
                    : 'Every class imports itself — and stays right when your teacher moves a deadline'}
              </Text>
            </View>
            <FontAwesome name="chevron-right" size={13} color={colors.teal} />
          </TouchableOpacity>
        )}

        {/* Free-tier usage. Pro = unlimited; free users get ONE AI action for
            the life of the account, shared with lecture recording. The pill
            names the lecture half even here, because the alternative is a
            student spending their one action on a scan without ever learning
            it was also their lecture. Hidden while the answer is loading. */}
        {isPro ? (
          <View style={[styles.scanCountPill, { backgroundColor: colors.brand50 }]}>
            <FontAwesome name="check-circle" size={12} color={colors.brand} />
            <Text style={[styles.scanCountText, { color: colors.brand }]}>Unlimited scans</Text>
          </View>
        ) : !freeActionLoading ? (
          <View style={[styles.scanCountPill, { backgroundColor: freeActionUsed ? colors.coral50 : colors.brand50 }]}>
            <FontAwesome
              name={freeActionUsed ? 'lock' : 'bolt'}
              size={12}
              color={freeActionUsed ? colors.coral : colors.brand}
            />
            <Text style={[styles.scanCountText, { color: freeActionUsed ? colors.coral : colors.brand }]}>
              {freeActionUsed
                ? 'Free action used — upgrade for unlimited'
                : '1 free scan or lecture included'}
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
              {!freeActionUsed
                ? `Your free action is still available, but you're at the free limit of ${FREE_COURSE_LIMIT} courses this semester. Re-scan a course you already have, or upgrade to Pro to add a new one.`
                : `You've used your free action and reached the ${FREE_COURSE_LIMIT}-course limit. Upgrade to Pro for unlimited scans, lectures, and courses.`}
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
          {/* Desktop browsers have no camera to open: expo-image-picker's web
              build sets capture="camera" on a file input, which phones honour
              and desktops ignore. The card therefore promised a camera, opened
              a file dialog, and then walked the user through camera-shaped
              "Page N captured / Add another page" prompts for files they had
              picked. Mobile web keeps the real camera, so this gates on
              isDesktop rather than on Platform.OS. */}
          {!isDesktop && (
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
          )}

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
              <Text style={[styles.actionSub, { color: colors.ink3 }]}>PDF or Word — Files, iCloud, Drive</Text>
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
  canvasCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 16, borderWidth: 1, padding: 14, marginTop: 14,
  },
  canvasIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  canvasTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  canvasTitle: { fontSize: 15, fontWeight: '700' },
  canvasPro: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
  },
  canvasProText: { color: '#fff', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  canvasSub: { fontSize: 12.5, lineHeight: 17, marginTop: 2 },
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
