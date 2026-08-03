import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * The site is a single homepage plus the three pages that need to exist
 * independently of marketing: support, and the privacy/terms pages the
 * shipping iOS app links to directly.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/support`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
