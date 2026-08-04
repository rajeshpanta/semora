/**
 * The site-wide Open Graph image, as a metadata value.
 *
 * Next.js serves the root `app/opengraph-image.tsx` automatically for routes
 * that declare no `openGraph` metadata of their own. The moment a page sets
 * `openGraph` — even just `{ url }` — that object REPLACES the inherited one
 * and the file-convention image is dropped, which silently left several pages
 * sharing as blank cards. Any page that sets openGraph must therefore spread
 * this in as well.
 */
export const OG_IMAGE = { images: ['/opengraph-image'] };
