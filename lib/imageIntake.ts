import { Platform } from 'react-native';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { getFileSize } from '@/lib/readFileBase64';

/**
 * One place every image passes through on its way to the server.
 *
 * Before this file there were five intake paths — camera, Photos, Files,
 * web drag-drop, web picker — and each one made its own decision about size.
 * Camera used JPEG quality 0.8, Photos used 0.5, Files did nothing at all,
 * and drag-drop re-encoded HEIC but waved everything else through untouched.
 * Five behaviours meant every fix landed in one path and missed the other
 * four, which is why the same complaint came back under a different error
 * message six times in two weeks: status 400, then "unsupported page type",
 * then a 546 worker crash, then "that photo is too high-resolution".
 *
 * The contract here is deliberately narrow: give it whatever the user picked
 * and it returns something the server can read. It NEVER refuses. If an image
 * cannot be shrunk to the budget it returns the smallest version it managed —
 * a large upload that might work beats a refusal that definitely doesn't.
 */

/**
 * Long-edge ceiling. Matches MAX_EDGE in supabase/functions/_shared/heic.ts so
 * the client and the server agree on what "normalised" means. Printed syllabus
 * text is comfortably legible at this size; the vision model downsamples
 * anything larger anyway, so the extra pixels only ever cost upload time.
 */
export const TARGET_MAX_EDGE = 2200;

/**
 * Per-image byte budget. The server rejects a scan whose pages exceed 15M
 * base64 chars (≈11.25MB raw), and one scan may carry up to MAX_SCAN_PAGES
 * pages. 2MB each means even a full five-page scan lands at 10MB — inside
 * MAX_SCAN_RAW_BYTES, with headroom for base64 padding and JSON framing.
 */
export const TARGET_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Floor for the adaptive loop. Below roughly this width a photographed
 * syllabus stops being readable, and an upload the model can't read is a
 * worse outcome than a slightly oversized one — it produces "no assignments
 * found", which the student reads as the app not working.
 */
const MIN_EDGE = 1000;

/**
 * Whether this platform can re-encode an arbitrary image before upload.
 *
 * The format table consults this to decide whether to offer TIFF/BMP/AVIF/RAW.
 * Phase 2 makes it true on native as well, and the extra formats light up
 * there without the table changing.
 */
export function canTranscodeImages(): boolean {
  // Web re-encodes through a canvas, native through expo-image-manipulator.
  // Every platform we ship can now convert, so the transcode-only formats
  // (TIFF, BMP, AVIF, RAW) are offered everywhere.
  return true;
}

export type IntakeSource = {
  uri: string;
  fileName: string;
  mimeType: string;
};

export type IntakeResult = IntakeSource & {
  /** True when the bytes were re-encoded rather than passed through. */
  resized: boolean;
  /** Encoded size after normalisation, when we can measure it. */
  bytes: number | null;
  /** Size before normalisation, so callers can report the ratio. */
  originalBytes: number | null;
  /** Long edge after normalisation — the legibility-relevant dimension. */
  edge: number | null;
};

/** Formats a browser canvas can re-encode into something the model accepts. */
function isImageLike(mimeType: string, fileName: string): boolean {
  if (mimeType.startsWith('image/')) return true;
  return /\.(jpe?g|jfif|png|webp|gif|heic|heif|avif|bmp|tiff?|dng)$/i.test(fileName);
}

function swapExtension(fileName: string, extension: string): string {
  const base = fileName.replace(/\.[^./\\]+$/, '') || 'scan';
  return `${base}.${extension}`;
}

/**
 * Re-encode at a given long edge and quality. Split out so the search loop
 * below reads as a search rather than as nested canvas plumbing.
 */
async function encodeAtSize(
  bitmap: ImageBitmap,
  edge: number,
  quality: number,
): Promise<Blob | null> {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Matte onto white BEFORE drawing. A PNG screenshot with a transparent
  // background — which is most screenshots taken of a web page — composites
  // onto transparent black when flattened to JPEG, turning black-on-clear
  // text into black-on-black. The page arrives unreadable and the scan comes
  // back empty, with nothing anywhere saying why.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

/**
 * Shrink until it fits, rather than guessing one size and hoping.
 *
 * A fixed 2200px cap is still a guess: a dense 2200px photograph can encode
 * well past the budget, and a fixed cap has no way to know. This measures the
 * result and steps down — quality first, because dropping quality costs less
 * legibility than dropping resolution — and only reduces dimensions once
 * quality has gone as low as text tolerates.
 *
 * Every branch returns bytes. There is no failure path by design.
 */
async function shrinkToBudget(bitmap: ImageBitmap, budget: number): Promise<Blob | null> {
  let edge = TARGET_MAX_EDGE;
  let quality = 0.82;
  let smallest: Blob | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const encoded = await encodeAtSize(bitmap, edge, quality);
    if (!encoded) return smallest;
    if (!smallest || encoded.size < smallest.size) smallest = encoded;
    if (encoded.size <= budget) return encoded;

    if (quality > 0.5) {
      quality = Math.max(0.5, quality - 0.14);
    } else if (edge > MIN_EDGE) {
      edge = Math.max(MIN_EDGE, Math.round(edge * 0.75));
      quality = 0.72;
    } else {
      break; // At the legibility floor. Send the smallest we reached.
    }
  }
  return smallest;
}

/**
 * Native half of the pipeline: the same search, run through iOS's own imaging.
 *
 * This is what finally reads a 48MP photo picked from Files. The server could
 * never decode one — libheif needs a full-size RGBA surface and the isolate
 * runs out of memory somewhere above 21.9MP — but iOS decodes HEIC in hardware
 * and hands back whatever size we ask for, so the file that arrives at the
 * server is already small enough to be ordinary.
 *
 * Two differences from the web half, both deliberate:
 *  - PNG stays PNG. `extent` (the background matte) is web-only, so flattening
 *    a transparent PNG here would composite the text onto black with no way to
 *    prevent it. Reducing dimensions alone gets a big PNG under budget.
 *  - HEIC never takes the pass-through, however small it is, because being
 *    under budget was never its problem — being HEIC was.
 */
async function normalizeOnNative(
  source: IntakeSource,
  passthrough: IntakeResult,
): Promise<IntakeResult> {
  const originalBytes = await getFileSize(source.uri);
  const context = ImageManipulator.manipulate(source.uri);
  const probe = await context.renderAsync();
  const sourceEdge = Math.max(probe.width, probe.height);
  if (!sourceEdge) return passthrough;
  const landscape = probe.width >= probe.height;

  const keepPng = /png/i.test(source.mimeType) || /\.png$/i.test(source.fileName);
  const format = keepPng ? SaveFormat.PNG : SaveFormat.JPEG;
  const alreadyFine =
    originalBytes > 0 &&
    originalBytes <= TARGET_MAX_BYTES &&
    sourceEdge <= TARGET_MAX_EDGE &&
    (source.mimeType === 'image/jpeg' || keepPng);
  if (alreadyFine) {
    return { ...passthrough, bytes: originalBytes, originalBytes, edge: sourceEdge };
  }

  let edge = Math.min(TARGET_MAX_EDGE, sourceEdge); // never upscale
  let quality = 0.82;
  let best: { uri: string; bytes: number; edge: number } | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    context.reset().resize(landscape ? { width: edge } : { height: edge });
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ compress: quality, format });
    const bytes = await getFileSize(saved.uri);
    const candidate = { uri: saved.uri, bytes, edge: Math.max(saved.width, saved.height) };
    if (!best || bytes < best.bytes) best = candidate;
    if (bytes <= TARGET_MAX_BYTES) { best = candidate; break; }

    // PNG ignores `compress`, so for PNG the only lever is dimensions.
    if (!keepPng && quality > 0.5) {
      quality = Math.max(0.5, quality - 0.14);
    } else if (edge > MIN_EDGE) {
      edge = Math.max(MIN_EDGE, Math.round(edge * 0.75));
      quality = 0.72;
    } else {
      break;
    }
  }

  if (!best) return { ...passthrough, originalBytes, edge: sourceEdge };
  return {
    uri: best.uri,
    fileName: swapExtension(source.fileName, keepPng ? 'png' : 'jpg'),
    mimeType: keepPng ? 'image/png' : 'image/jpeg',
    resized: true,
    bytes: best.bytes,
    originalBytes,
    edge: best.edge,
  };
}

/**
 * Normalise one picked file for upload.
 *
 * Both platforms are implemented; the call sites do not know or care which
 * one runs. Neither branch throws — see the class comment at the top.
 */
export async function normalizeImageForUpload(source: IntakeSource): Promise<IntakeResult> {
  const passthrough: IntakeResult = {
    ...source, resized: false, bytes: null, originalBytes: null, edge: null,
  };
  if (!isImageLike(source.mimeType, source.fileName)) return passthrough;

  if (Platform.OS !== 'web') {
    try {
      return await normalizeOnNative(source, passthrough);
    } catch {
      // Undecodable, or the manipulator is unavailable. The server still
      // decodes HEIC, so passing the original through beats refusing here.
      return passthrough;
    }
  }

  try {
    const blob = await (await fetch(source.uri)).blob();
    // createImageBitmap throws on anything the browser has no decoder for,
    // which is exactly the signal we want — no format sniffing of our own.
    // It also means every format the browser CAN read is accepted for free:
    // BMP everywhere, HEIC and TIFF in Safari, AVIF in Chrome and Safari.
    const bitmap = await createImageBitmap(blob);
    // JPEG only, deliberately.
    //
    // PNG was in this fast path and it was wrong: a small transparent PNG —
    // which is what a screenshot of a web page usually is — skipped the
    // encoder entirely and reached the model with its alpha channel intact,
    // black text on nothing. Whatever the far end composites that onto decides
    // whether the words survive, and when they don't the scan comes back empty
    // with nothing to indicate why. JPEG cannot carry alpha, so it is the only
    // format safe to wave through; everything else gets matted onto white by
    // encodeAtSize below.
    const alreadyFine =
      blob.size <= TARGET_MAX_BYTES &&
      Math.max(bitmap.width, bitmap.height) <= TARGET_MAX_EDGE &&
      source.mimeType === 'image/jpeg';
    const sourceEdge = Math.max(bitmap.width, bitmap.height);
    if (alreadyFine) {
      bitmap.close?.();
      return { ...passthrough, bytes: blob.size, originalBytes: blob.size, edge: sourceEdge };
    }
    const jpeg = await shrinkToBudget(bitmap, TARGET_MAX_BYTES);
    bitmap.close?.();
    if (!jpeg) return { ...passthrough, originalBytes: blob.size, edge: sourceEdge };
    const finalBitmap = await createImageBitmap(jpeg).catch(() => null);
    const edge = finalBitmap ? Math.max(finalBitmap.width, finalBitmap.height) : null;
    finalBitmap?.close?.();
    return {
      uri: URL.createObjectURL(jpeg),
      fileName: swapExtension(source.fileName, 'jpg'),
      mimeType: 'image/jpeg',
      resized: true,
      bytes: jpeg.size,
      originalBytes: blob.size,
      edge,
    };
  } catch {
    // Undecodable in this browser. Pass the original through and let the
    // server decide — it decodes HEIC, and refusing here would take away the
    // one path that still might work.
    return passthrough;
  }
}
