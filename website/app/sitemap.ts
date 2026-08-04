import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { FEATURES } from '@/lib/semora-facts';
import { COMPARE_SLUGS, KEYWORD_PAGE_SLUGS } from '@/lib/routes';
import { BLOG_POSTS } from '@/lib/blog';
import { ALTERNATIVE_SLUGS } from '@/lib/new-page-content';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/features`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/compare`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/support`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/about`, changeFrequency: 'yearly', priority: 0.4 },
    // Free tools. These are the only pages on the site that do a job for the
    // reader without asking for anything, which makes them the realistic
    // link targets for a domain with no press.
    { url: `${SITE_URL}/gpa-calculator`, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/pomodoro-timer`, changeFrequency: 'monthly', priority: 0.9 },
  ];

  const featureRoutes: MetadataRoute.Sitemap = FEATURES.map((f) => ({
    url: `${SITE_URL}/features/${f.slug}`,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const keywordRoutes: MetadataRoute.Sitemap = KEYWORD_PAGE_SLUGS.map((slug) => ({
    url: `${SITE_URL}/${slug}`,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  const compareRoutes: MetadataRoute.Sitemap = COMPARE_SLUGS.map((slug) => ({
    url: `${SITE_URL}/compare/${slug}`,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.date,
    changeFrequency: 'monthly',
    priority: 0.6,
  }));

  // "X alternative" targets a different searcher than "Semora vs X": someone
  // already leaving a tool, who does not yet know Semora exists.
  const alternativeRoutes: MetadataRoute.Sitemap = ALTERNATIVE_SLUGS.map((slug) => ({
    url: `${SITE_URL}/${slug}`,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  return [...staticRoutes, ...alternativeRoutes, ...featureRoutes, ...keywordRoutes, ...compareRoutes, ...blogRoutes];
}
