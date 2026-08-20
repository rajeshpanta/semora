/**
 * HEIC/HEIF decoding, server-side.
 *
 * HEIC is what every iPhone shoots by default, and no model in this stack
 * accepts it — OpenAI answers `data:image/jpeg;base64,<HEIC bytes>` with
 * "The image data you provided does not represent a valid image" in under two
 * seconds. Detecting and refusing it (see sniffFormat) stops the opaque
 * failure but still leaves the student unable to scan the photo they took.
 *
 * So we decode it. Doing that HERE rather than on the device is deliberate:
 *
 *  - it reaches builds already on the App Store, which cannot be patched;
 *  - it covers every entry point at once — syllabus scan, notes from a file,
 *    flashcards, tutor — instead of each picker growing its own conversion;
 *  - expo-image-manipulator, the obvious client-side route, broke the EAS
 *    build once already and was reverted (ab79b84).
 *
 * The imports are dynamic ON PURPOSE. The libheif WASM bundle is megabytes,
 * and the overwhelming majority of scans are JPEG or PDF; loading it at module
 * scope would tax every cold start to serve the rare HEIC. It is paid for only
 * when a HEIC actually arrives.
 */

/** Long edge cap for the re-encoded JPEG. */
const MAX_EDGE = 2200;

/**
 * Measured against the deployed runtime, not guessed. Decoding allocates a
 * full RGBA surface (12MP = 47MB) plus libheif's own working buffers, and the
 * edge function has a hard memory ceiling behind which the platform kills the
 * worker outright — HTTP 546 WORKER_RESOURCE_LIMIT, which reaches the student
 * as a blank failure with no message at all.
 *
 * Verified live on this project:
 *    8.7MP  ok      11.4MP  ok      15.9MP  ok
 *   12.2MP  ok  (the standard iPhone photo)
 *   21.9MP  WORKER_RESOURCE_LIMIT
 *
 * 16MP therefore sits just under the proven ceiling. Above it we refuse with
 * a sentence the student can act on rather than letting the worker die: that
 * band is iPhone Pro's 48MP "high resolution" mode, which is a setting they
 * can turn off, and a syllabus does not need 48 megapixels.
 */
const MAX_PIXELS = 16_000_000;

/**
 * Floor for the fallback above. A syllabus is printed text, and MAX_EDGE
 * re-encodes to 2200px on the long side anyway, so anything at or above about
 * 1.2MP still reaches the model at full useful detail. Below that the page
 * stops being legible and a "successful" scan that finds nothing is a worse
 * outcome than saying we could not read it.
 */
const MIN_READABLE_PIXELS = 1_200_000;

export type HeicDecodeResult =
  | { ok: true; base64: string; mimeType: 'image/jpeg'; width: number; height: number; ms: number }
  | { ok: false; reason: 'too_large' | 'decode_failed' };

function toBase64(bytes: Uint8Array): string {
  // Chunked: String.fromCharCode(...bytes) blows the argument limit on
  // anything megabyte-sized, which is every photo this handles.
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Decode a base64 HEIC into a base64 JPEG the vision models accept. */
export async function decodeHeicToJpeg(base64Heic: string): Promise<HeicDecodeResult> {
  const started = Date.now();
  try {
    const [heifMod, imageScript] = await Promise.all([
      import('https://esm.sh/libheif-js@1.18.2/wasm-bundle'),
      import('https://deno.land/x/imagescript@1.3.0/mod.ts'),
    ]);
    const libheif: any = (heifMod as any).default ?? heifMod;
    const { Image } = imageScript as any;

    const images = new libheif.HeifDecoder().decode(fromBase64(base64Heic));
    if (!images?.length) return { ok: false, reason: 'decode_failed' };

    // The LARGEST image, not images[0].
    //
    // A portrait-mode or Live Photo HEIC carries auxiliary images — a depth
    // map, an alpha matte, a thumbnail — alongside the photo, and nothing
    // guarantees the one the student took comes first. The obvious fix,
    // is_primary(), throws in this build:
    //   ReferenceError: heif_image_handle_is_primary_image is not defined
    // so area is the reliable discriminator: aux images are always smaller
    // than the capture they describe.
    // Largest FIRST, then the largest that actually fits.
    //
    // This used to take the largest image outright and refuse if it was over
    // MAX_PIXELS — which is what turned a 48MP iPhone photo into a message
    // asking the student to go and change a camera setting. A HEIC routinely
    // carries more than one image (a Live Photo's frames, a portrait capture's
    // matte, an embedded preview), so when the full-resolution one is beyond
    // what the isolate can decode, the next one down is often still a perfectly
    // readable photograph of the same page. Reading that is strictly better
    // than refusing.
    //
    // Bounded at the bottom too: a 320px thumbnail would decode happily and
    // then hand the model an unreadable page, which is worse than an honest
    // failure — the student would get "no assignments found" and blame the app.
    const candidates = images
      .map((img: any) => ({ img, w: img.get_width() || 0, h: img.get_height() || 0 }))
      .filter((c: any) => c.w > 0 && c.h > 0)
      .sort((a: any, b: any) => b.w * b.h - a.w * a.h);
    if (!candidates.length) return { ok: false, reason: 'decode_failed' };

    const usable = candidates.find(
      (c: any) => c.w * c.h <= MAX_PIXELS && c.w * c.h >= MIN_READABLE_PIXELS,
    );
    if (!usable) return { ok: false, reason: 'too_large' };
    const first = usable.img;
    const width = usable.w;
    const height = usable.h;

    let rgba: Uint8ClampedArray | null = new Uint8ClampedArray(width * height * 4);
    await new Promise<void>((resolve, reject) => {
      first.display({ data: rgba, width, height }, (out: unknown) =>
        out ? resolve() : reject(new Error('display returned null')));
    });

    // Hand libheif's buffers back the moment the pixels are copied out. The
    // decoder holds its own full-size surface — on a 12MP photo that is the
    // difference between finishing and WORKER_RESOURCE_LIMIT. Every image in
    // the array is released, not just the primary: a Live Photo or a burst
    // carries several and we only ever use the first.
    for (const other of images) {
      try { other.free?.(); } catch { /* older builds have no free() */ }
    }

    // Downsample straight out of the RGBA buffer into a target-sized image.
    //
    // The obvious form — build a full-size Image, then .resize() — profiled at
    // +94MB on a 12MP photo (a 47MB bitmap copy, then the resize's own
    // allocation) on top of the 164MB libheif already needs for display().
    // That is the difference between fitting in an edge function and not.
    // Averaging the source box per target pixel rather than point-sampling
    // matters here: this is photographed TEXT, and nearest-neighbour aliases
    // thin strokes into noise the model then has to read.
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));
    const image = new Image(outW, outH);
    const dst = image.bitmap;

    if (outW === width && outH === height) {
      dst.set(new Uint8Array(rgba.buffer));
    } else {
      const xRatio = width / outW;
      const yRatio = height / outH;
      for (let y = 0; y < outH; y++) {
        const sy0 = Math.floor(y * yRatio);
        const sy1 = Math.min(height, Math.max(sy0 + 1, Math.floor((y + 1) * yRatio)));
        for (let x = 0; x < outW; x++) {
          const sx0 = Math.floor(x * xRatio);
          const sx1 = Math.min(width, Math.max(sx0 + 1, Math.floor((x + 1) * xRatio)));
          let r = 0, g = 0, b = 0, a = 0, n = 0;
          for (let sy = sy0; sy < sy1; sy++) {
            let idx = (sy * width + sx0) * 4;
            for (let sx = sx0; sx < sx1; sx++, idx += 4) {
              r += rgba[idx]; g += rgba[idx + 1]; b += rgba[idx + 2]; a += rgba[idx + 3];
              n++;
            }
          }
          const o = (y * outW + x) * 4;
          dst[o] = r / n; dst[o + 1] = g / n; dst[o + 2] = b / n;
          dst[o + 3] = a / n;
        }
      }
    }

    // Drop the full-size source before encoding: on a 12MP photo that is 47MB
    // that the encoder's own allocations can reuse instead of growing past.
    rgba = null;

    const jpeg: Uint8Array = await image.encodeJPEG(82);
    return {
      ok: true,
      base64: toBase64(jpeg),
      mimeType: 'image/jpeg',
      width: outW,
      height: outH,
      ms: Date.now() - started,
    };
  } catch {
    // Never throw: a HEIC we cannot read must degrade to the same actionable
    // message as before, not a 500.
    return { ok: false, reason: 'decode_failed' };
  }
}

// ── One entry point for every image the app accepts ─────────────────────────

import { sniffFormat, HEIC_SERVER_HELP } from './document-files.ts';

export type PreparedImage =
  | { ok: true; base64: string; mimeType: string; converted: boolean }
  | { ok: false; error: string; code: string };

/**
 * Take whatever the client sent and return something a vision model accepts.
 *
 * Three things happen here, and every image entry point wants all three:
 *  1. the format is read from the file's header, never from the caller's
 *     label — that mismatch is what produced the opaque 400s;
 *  2. HEIC is decoded to JPEG rather than refused, so the photo an iPhone
 *     just took actually works;
 *  3. if the decode fails, the student gets a sentence they can act on.
 *
 * `declaredMimeType` is only consulted for formats with no signature we read
 * (Office, text, iWork) — those are passed through untouched.
 */
export async function prepareImagePayload(
  base64: string,
  declaredMimeType: string | null,
): Promise<PreparedImage> {
  const sniffed = sniffFormat(base64);

  if (sniffed.kind === 'heic') {
    const decoded = await decodeHeicToJpeg(base64);
    if (decoded.ok) {
      return { ok: true, base64: decoded.base64, mimeType: 'image/jpeg', converted: true };
    }
    return {
      ok: false,
      code: decoded.reason === 'too_large' ? 'IMAGE_TOO_LARGE' : 'HEIC_UNSUPPORTED',
      // Never send the student to iOS Settings. The old copy here told them to
      // turn off Resolution Control (48MP) — asking someone to reconfigure
      // their camera before they can scan a page is the same dead end that
      // refusing HEIC outright used to be. Every route offered now is one tap
      // inside Semora: picking the same photo from Photos hands us a
      // re-encoded JPEG at a size that always decodes, and a PDF skips the
      // image path entirely.
      error: decoded.reason === 'too_large'
        ? 'That photo is larger than we can read directly. Choose the same photo from Photos instead of Files — we resize it for you — or send the syllabus as a PDF.'
        : HEIC_SERVER_HELP,
    };
  }

  if (sniffed.kind === 'image' || sniffed.kind === 'pdf') {
    // Header wins: a JPEG mislabelled PNG is corrected rather than refused.
    return { ok: true, base64, mimeType: sniffed.mimeType, converted: false };
  }

  // No signature we recognise — Office, text, iWork, or something we cannot
  // identify. Keep the caller's label and let the existing format table judge.
  return { ok: true, base64, mimeType: declaredMimeType ?? '', converted: false };
}
