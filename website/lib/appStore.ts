import { APP_STORE_ID } from './semora-facts';

/**
 * App Store links that say where they came from.
 *
 * Measured 2026-10-01: 20 of 30 new accounts in a week could not be traced to
 * any source, because every App Store button on this site was a bare listing
 * URL and none of them reported a click. Someone who read semoraai.com on an
 * iPhone and installed from the App Store simply vanished.
 *
 * Apple attributes an install to a campaign link only when it carries BOTH
 * `pt` (the developer's provider token, from App Store Connect → App
 * Analytics → Campaigns → "Generate a Campaign Link") and `ct` (a campaign name
 * of our choosing, up to 40 characters). Installs then appear under
 * App Analytics → Sources → Campaigns, split by `ct`.
 */

/**
 * The provider token. Empty until copied from App Store Connect; while it is
 * empty the links still carry `ct` (harmless) and the click is still reported,
 * but App Store Connect cannot attribute the install.
 */
export const APP_STORE_PROVIDER_TOKEN = '';

/** A campaign name Apple accepts: lowercase, dash-separated, ≤ 30 chars (App Store Connect's limit). */
export function appStoreCampaign(name: string): string {
  return (`site-${name}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').slice(0, 30);
}

/**
 * The App Store listing, tagged with where on the site the visitor was.
 * `short` drops the listing slug: same destination and tags, fewer characters,
 * which keeps a QR code at the low density lib/qr.ts chose for camera lock-on.
 */
export function appStoreUrl(placement: string, { short = false }: { short?: boolean } = {}): string {
  const params = new URLSearchParams();
  if (APP_STORE_PROVIDER_TOKEN) params.set('pt', APP_STORE_PROVIDER_TOKEN);
  params.set('ct', appStoreCampaign(placement));
  params.set('mt', '8');
  return short
    ? `https://apps.apple.com/app/id${APP_STORE_ID}?${params.toString()}`
    : `https://apps.apple.com/us/app/semora-ai-syllabus-scanner/id${APP_STORE_ID}?${params.toString()}`;
}

/**
 * True on an iPhone, iPod or iPad — including iPadOS, which reports itself as
 * a Mac but has a touch screen. Only callable in the browser.
 */
export function isAppleMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}
