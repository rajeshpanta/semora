/**
 * Regenerates every brand icon the website serves, from the one source of
 * truth: assets/images/icon.png (1024x1024, the App Store icon).
 *
 * Run:  node scripts/generate-icons.mjs        (from website/)
 *
 * WHY THIS EXISTS: app/favicon.ico shipped to production as the unmodified
 * create-next-app starter icon — the Next.js logo — for the life of the site.
 * Nobody noticed because a favicon is the one asset you never see while
 * developing the page it belongs to. Keeping generation in a script means the
 * next person can re-derive the whole set from the app icon in one command
 * instead of hand-exporting six sizes and getting one of them wrong.
 *
 * WHY THE CROP: the app icon is a document with three checkmark rows and a
 * sparkle, floating on a navy rounded square with generous margin. Straight
 * downscaling to 16px turns it into an indistinct pale blob — the margin eats
 * most of the pixels. Cropping to the artwork first lets the checklist stay
 * readable at the size Google actually renders in a search result. Compared
 * side by side at 8x, the cropped variant was the only one legible at 16px.
 *
 * Maskable is the exception: Android masks it to a circle, so it needs the
 * full uncropped icon plus padding inside the safe zone.
 *
 * Requires Pillow:  python3 -c "import PIL"
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const websiteRoot = resolve(here, '..');
const SOURCE = resolve(websiteRoot, '../assets/images/icon.png');

if (!existsSync(SOURCE)) {
  console.error(`generate-icons: source icon not found at ${SOURCE}`);
  process.exit(1);
}

mkdirSync(resolve(websiteRoot, 'public'), { recursive: true });

const PY = `
import sys
from PIL import Image, ImageFilter

source, website = sys.argv[1], sys.argv[2]
src = Image.open(source).convert('RGB')
W, H = src.size

# Artwork bounds, hand-tuned against an 8x comparison sheet. Trims the navy
# margin so the document fills the frame at small sizes.
CROP = (int(W * 0.13), int(H * 0.11), int(W * 0.87), int(H * 0.85))
art = src.crop(CROP)

def render(size):
    # RGBA, not RGB: Next's icon/manifest image pipeline rejects a non-RGBA PNG
    # outright ("The PNG is not in RGBA format!") and fails the whole build.
    im = art.convert('RGBA').resize((size, size), Image.LANCZOS)
    # Downscaling this far softens the checkmark strokes; a light unsharp pass
    # puts the edges back without the halos a heavier setting would add.
    if size <= 64:
        im = im.filter(ImageFilter.UnsharpMask(radius=0.6, percent=150, threshold=2))
    return im

# --- favicon.ico: one file, six layers. Browsers and Google pick per context.
#
# Written by hand rather than via Image.save(format='ICO'). Pillow's ICO writer
# ignores append_images and re-derives every layer from the base image, which
# would throw away the per-size crop and sharpening above and silently emit a
# single-layer file. Each layer is stored PNG-compressed, which every current
# browser and Google's favicon fetcher read.
import io, struct

ico_sizes = [16, 32, 48, 64, 128, 256]
blobs = []
for s in ico_sizes:
    buf = io.BytesIO()
    render(s).save(buf, format='PNG', optimize=True)
    blobs.append(buf.getvalue())

header = struct.pack('<HHH', 0, 1, len(blobs))          # reserved, type=icon, count
offset = 6 + 16 * len(blobs)
entries = b''
for s, blob in zip(ico_sizes, blobs):
    entries += struct.pack(
        '<BBBBHHII',
        0 if s >= 256 else s,   # width  (0 means 256)
        0 if s >= 256 else s,   # height
        0, 0,                   # palette size, reserved
        1, 32,                  # colour planes, bits per pixel
        len(blob), offset,
    )
    offset += len(blob)
with open(f'{website}/app/favicon.ico', 'wb') as fh:
    fh.write(header + entries + b''.join(blobs))

# --- apple-touch-icon. Apple composites on white if the image has alpha, and
#     applies its own rounding, so ship it opaque and unrounded.
render(180).save(f'{website}/app/apple-icon.png', format='PNG')

# --- PWA / manifest icons.
render(192).save(f'{website}/public/icon-192.png', format='PNG')
render(512).save(f'{website}/public/icon-512.png', format='PNG')

# --- Maskable: full icon, not the crop, inside the ~80% safe zone so Android's
#     circular mask cannot clip the artwork.
canvas = Image.new('RGBA', (512, 512), (13, 19, 67, 255))  # the icon's own navy
inner = src.convert('RGBA').resize((410, 410), Image.LANCZOS)
canvas.paste(inner, ((512 - 410) // 2, (512 - 410) // 2))
canvas.save(f'{website}/public/icon-maskable-512.png', format='PNG')

# --- Organization logo for schema.org. Google wants a real logo URL here, not
#     the 1200x630 share card.
render(600).save(f'{website}/public/logo.png', format='PNG')

print('  app/favicon.ico            ' + 'x'.join(str(s) for s in ico_sizes))
for f in ['app/apple-icon.png 180', 'public/icon-192.png 192', 'public/icon-512.png 512',
          'public/icon-maskable-512.png 512 (full icon, padded)', 'public/logo.png 600']:
    print('  ' + f)
`;

console.log(`generate-icons: source ${SOURCE}`);
execFileSync('python3', ['-c', PY, SOURCE, websiteRoot], { stdio: 'inherit' });
console.log('generate-icons: done');
