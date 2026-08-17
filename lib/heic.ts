import { Platform } from 'react-native';

/**
 * HEIC/HEIF — what an iPhone shoots by default — cannot be sent to the model.
 * The vision API takes PNG, JPEG, WEBP and GIF only, so a HEIC forwarded as-is
 * fails server-side with a 400 no student can act on.
 *
 * Previously these were simply absent from the accepted-format list, so the
 * app answered the single most natural web workflow — photograph the syllabus
 * on your phone, open Semora on your laptop, drag the photo in — with
 * "Unsupported file", listing JPG/PNG/WEBP: three formats an iPhone will not
 * produce without the user first knowing to change a setting.
 *
 * Safari decodes HEIC natively, so there we can transcode in-page and the user
 * never learns any of this. Chrome and Firefox cannot, and for them the honest
 * answer is a specific instruction rather than a format list.
 */
export function isHeic(fileName?: string | null, mimeType?: string | null): boolean {
  const name = (fileName || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  return /\.(heic|heif)$/.test(name) || mime.includes('heic') || mime.includes('heif');
}

export const HEIC_HELP =
  'That photo is in Apple’s HEIC format, which browsers can’t read. ' +
  'On your iPhone open the photo, tap Share → Copy Photo, then paste it — or ' +
  'set Settings → Camera → Formats to "Most Compatible" and take it again.';

/**
 * Try to turn a picked HEIC into a JPEG blob URL. Returns null when the
 * browser cannot decode it, which is the normal case outside Safari.
 */
export async function transcodeHeicToJpeg(uri: string): Promise<{ uri: string; mimeType: string } | null> {
  if (Platform.OS !== 'web') return null;
  try {
    const blob = await (await fetch(uri)).blob();
    // createImageBitmap throws on formats the browser has no decoder for, which
    // is exactly the signal we want — no format sniffing of our own.
    const bitmap = await createImageBitmap(blob);
    // Cap the long edge: a 12MP HEIC re-encodes to a JPEG far larger than the
    // scan budget, and syllabus text is legible well below that.
    const MAX_EDGE = 2200;
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const jpeg: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.8),
    );
    if (!jpeg) return null;
    return { uri: URL.createObjectURL(jpeg), mimeType: 'image/jpeg' };
  } catch {
    return null;
  }
}
