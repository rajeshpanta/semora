import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { FEATURES } from '@/lib/semora-facts';
import { COMPARE_SLUGS, KEYWORD_PAGE_SLUGS } from '@/lib/routes';
import { BLOG_POSTS } from '@/lib/blog';
import { ALTERNATIVE_SLUGS } from '@/lib/new-page-content';
import { INDEXABLE_LOCALE_ROUTE_PAIRS } from '@/lib/i18n';

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

  // Blog posts use a reviewed modification date when one exists; otherwise
  // their publication date is the only dated source event we can verify.
  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.modified ?? post.date,
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

  const routes = [
    ...staticRoutes,
    ...alternativeRoutes,
    ...featureRoutes,
    ...keywordRoutes,
    ...compareRoutes,
  ];

  const englishRoutes = [...routes, ...blogRoutes];
  const pairByEnglish = new Map(INDEXABLE_LOCALE_ROUTE_PAIRS.map((pair) => [pair.en, pair]));
  const englishByPath = new Map(
    englishRoutes.map((route) => [route.url.replace(SITE_URL, '') || '/', route]),
  );

  // hreflang is emitted in both directions. A page that points to Spanish
  // without the Spanish page pointing back can be ignored by search engines,
  // so the sitemap derives every alternate from one shared route-pair list.
  const localizedEnglishRoutes: MetadataRoute.Sitemap = englishRoutes.map((route) => {
    const englishPath = route.url.replace(SITE_URL, '') || '/';
    const pair = pairByEnglish.get(englishPath);
    if (!pair) return route;
    return {
      ...route,
      alternates: {
        languages: {
          'en-US': `${SITE_URL}${pair.en === '/' ? '' : pair.en}`,
          es: `${SITE_URL}${pair.es}`,
          'x-default': `${SITE_URL}${pair.en === '/' ? '' : pair.en}`,
        },
      },
    };
  });

  const spanishRoutes: MetadataRoute.Sitemap = INDEXABLE_LOCALE_ROUTE_PAIRS.map((pair) => {
    const english = englishByPath.get(pair.en);
    return {
      url: `${SITE_URL}${pair.es}`,
      ...(english?.lastModified ? { lastModified: english.lastModified } : {}),
      changeFrequency: english?.changeFrequency ?? 'monthly',
      priority: english?.priority ?? (pair.es === '/es' ? 1 : 0.7),
      alternates: {
        languages: {
          'en-US': `${SITE_URL}${pair.en === '/' ? '' : pair.en}`,
          es: `${SITE_URL}${pair.es}`,
          'x-default': `${SITE_URL}${pair.en === '/' ? '' : pair.en}`,
        },
      },
    };
  });

  return [...localizedEnglishRoutes, ...spanishRoutes];
}
