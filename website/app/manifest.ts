import type { MetadataRoute } from 'next';
import { SITE_NAME, SITE_DESCRIPTION } from '@/lib/semora-facts';

/**
 * Web app manifest. Next emits `<link rel="manifest">` for this automatically.
 *
 * Two reasons it is worth having on a site that is not a PWA: `short_name` is
 * one of the signals Google reads when choosing the name to print above a
 * search result (reinforcing the WebSite schema in lib/schema.ts), and the
 * icons array gives every bookmark, share sheet and home-screen shortcut a
 * real Semora icon instead of a screenshot of the page.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'standalone',
    background_color: '#faf9f5',
    theme_color: '#6b46c1',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Padded inside the safe zone so Android's circular mask cannot clip it.
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
