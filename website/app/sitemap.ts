import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { FEATURES } from '@/lib/semora-facts';
import { COMPARE_SLUGS, KEYWORD_PAGE_SLUGS } from '@/lib/routes';
import { BLOG_POSTS } from '@/lib/blog';
import { ALTERNATIVE_SLUGS } from '@/lib/new-page-content';
import { LOCALE_ROUTE_PAIRS } from '@/lib/i18n';

// Every non-blog route is generated from source that changes when the site is
// rebuilt, so the deploy time is the honest "last modified". Without it 34 of
// the 40 URLs carried no <lastmod> at all, leaving Google no signal that they
// had ever changed — one of the inputs into how eagerly it re-crawls.
// Evaluated once per render so a single sitemap cannot hand out 34 slightly
// different timestamps.
const BUILT_AT = new Date();

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

  // Blog posts keep their real publication date — it is the one honest
  // lastmod on the site and must not be overwritten with the build time.
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

  const routes = [
    ...staticRoutes,
    ...alternativeRoutes,
    ...featureRoutes,
    ...keywordRoutes,
    ...compareRoutes,
  ].map((route) => ({ lastModified: BUILT_AT, ...route }));

  const englishRoutes = [...routes, ...blogRoutes];
  const pairByEnglish = new Map(LOCALE_ROUTE_PAIRS.map((pair) => [pair.en, pair]));
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
          en: `${SITE_URL}${pair.en === '/' ? '' : pair.en}`,
          es: `${SITE_URL}${pair.es}`,
          'x-default': `${SITE_URL}${pair.en === '/' ? '' : pair.en}`,
        },
      },
    };
  });

  const spanishRoutes: MetadataRoute.Sitemap = LOCALE_ROUTE_PAIRS.map((pair) => {
    const english = englishByPath.get(pair.en);
    return {
      url: `${SITE_URL}${pair.es}`,
      lastModified: english?.lastModified ?? BUILT_AT,
      changeFrequency: english?.changeFrequency ?? 'monthly',
      priority: english?.priority ?? (pair.es === '/es' ? 1 : 0.7),
      alternates: {
        languages: {
          en: `${SITE_URL}${pair.en === '/' ? '' : pair.en}`,
          es: `${SITE_URL}${pair.es}`,
          'x-default': `${SITE_URL}${pair.en === '/' ? '' : pair.en}`,
        },
      },
    };
  });

  return [...localizedEnglishRoutes, ...spanishRoutes];
}
