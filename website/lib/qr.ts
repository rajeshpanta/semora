import QRCode from 'qrcode';

/**
 * Build-time QR codes, emitted as inline SVG.
 *
 * Generated on the server while the page is being built, never in the browser
 * and never from an image service: a third-party QR endpoint would be a
 * request to another host on a page whose whole job is to be trusted, it would
 * break the moment that host does, and it would tell that host who is looking
 * at our download page. Inline SVG costs about a kilobyte, scales to any size
 * without blurring, and prints.
 *
 * `light: '#0000'` makes the quiet zone transparent so the card's own surface
 * shows through — the modules stay near-black, which is what a camera needs.
 */
export async function qrSvg(url: string): Promise<string> {
  return QRCode.toString(url, {
    type: 'svg',
    // 'L' rather than 'M': these codes are read off a bright screen at
    // arm's length, not off a printed poster that might be creased or dirty.
    // Dropping the redundancy drops the module count, which makes every module
    // physically bigger at the same display size — the thing that actually
    // decides whether a camera locks on.
    errorCorrectionLevel: 'L',
    // The spec's quiet zone is 4 modules. The card supplies its own padding, so
    // 1 here keeps the code from looking lost inside it while staying scannable.
    margin: 1,
    color: { dark: '#14142b', light: '#0000' },
  });
}
