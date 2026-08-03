/**
 * Canonical site URL, read from an env var (NEXT_PUBLIC_SITE_URL=https://semoraai.com
 * in the Vercel project) so it stays out of source. Falls back to the
 * Vercel-injected preview URL for branch deploys and to localhost for local dev.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
