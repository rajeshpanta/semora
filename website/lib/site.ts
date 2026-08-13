/**
 * Canonical site URL, read from an env var (NEXT_PUBLIC_SITE_URL=https://semoraai.com
 * in the Vercel project) so it stays out of source. Falls back to the
 * Vercel-injected preview URL for branch deploys and to localhost for local dev.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

/**
 * The date the non-blog page copy was last materially revised.
 *
 * Every route in the sitemap except the blog posts used to ship with no
 * `lastmod` at all, which leaves Google no recrawl signal — it only has
 * `changefreq` and `priority`, and it ignores both. Blog posts are excluded
 * because they already carry their own publication and revision dates.
 *
 * One shared date rather than one per route, because that is what is actually
 * true: the page copy lives in a handful of shared files (page-content.ts,
 * new-page-content.ts, feature-content.ts, es-content.ts) that are revised in
 * sweeps, not page by page. Bump this when you materially change page copy —
 * not for a styling or layout change, which is not what lastmod means.
 */
export const CONTENT_LAST_REVIEWED = '2026-08-12';
