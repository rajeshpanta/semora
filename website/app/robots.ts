import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Named explicitly so AI crawlers aren't accidentally caught by a stray
// Disallow rule — many default robots configs block these without meaning to.
const AI_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, allow: '/' })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
