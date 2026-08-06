import { SITE_NAME } from './semora-facts';

/**
 * Open Graph defaults that every page setting its own `openGraph` must spread in.
 *
 * Next.js metadata merging REPLACES a parent `openGraph` object when a child
 * page defines one — it does not merge field by field. So the moment a page
 * sets `openGraph: { url: '/' }`, everything the root layout declared
 * (siteName, type, and the file-convention `app/opengraph-image.tsx`) is
 * silently dropped from that page.
 *
 * That cost us twice: first as blank share cards when `images` went missing,
 * and again as a missing `og:site_name` — one of the signals Google reads when
 * deciding whether to print "Semora" or the bare domain above a search result.
 *
 * Spreading this restores all three at once:
 *
 *   export const metadata: Metadata = {
 *     alternates: { canonical: '/' },
 *     openGraph: { url: '/', ...OG_DEFAULTS },
 *   };
 */
export const OG_DEFAULTS = {
  siteName: SITE_NAME,
  type: 'website' as const,
  // Points at the stable /og.png route handler, NOT the file-convention path.
  // The bare '/opengraph-image' literal that used to live here 404s in this
  // Next version (the file-convention image is only served content-hashed),
  // and omitting `images` doesn't work either: a page-level `openGraph` drops
  // the inherited file-convention image (verified in the built HTML — deep
  // pages emitted no og:image at all). /og.png renders the same card via
  // lib/og-card.tsx, force-static.
  images: ['/og.png'],
};

/**
 * @deprecated Use {@link OG_DEFAULTS} — it also restores siteName and type.
 * Aliased rather than removed so no page silently loses its share image
 * mid-migration; both spread the same object.
 */
export const OG_IMAGE = OG_DEFAULTS;

export const OG_IMAGE_ES = {
  siteName: SITE_NAME,
  type: 'website' as const,
  // Same mechanism as OG_DEFAULTS — the stable Spanish card route.
  images: ['/es/og.png'],
};
