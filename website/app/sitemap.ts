import type { MetadataRoute } from 'next';
import { CONTENT_LAST_REVIEWED, SITE_URL } from '@/lib/site';
import { FEATURES } from '@/lib/semora-facts';
import { COMPARE_SLUGS, KEYWORD_PAGE_SLUGS } from '@/lib/routes';
import { BLOG_POSTS } from '@/lib/blog';
import { ALTERNATIVE_SLUGS } from '@/lib/new-page-content';
import { INDEXABLE_LOCALE_ROUTE_PAIRS } from '@/lib/i18n';

export default function sitemap(): MetadataRoute.Sitemap {
  // Every non-blog route shares one revision date — see CONTENT_LAST_REVIEWED
  // for why that is the honest answer here rather than a per-route guess.
  const reviewed = CONTENT_LAST_REVIEWED;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: reviewed, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/features`, lastModified: reviewed, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/compare`, lastModified: reviewed, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/pricing`, lastModified: reviewed, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/blog`, lastModified: reviewed, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE_URL}/privacy`, lastModified: reviewed, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: reviewed, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/support`, lastModified: reviewed, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${SITE_URL}/about`, lastModified: reviewed, changeFrequency: 'yearly', priority: 0.4 },
    // Free tools. These are the only pages on the site that do a job for the
    // reader without asking for anything, which makes them the realistic
    // link targets for a domain with no press.
    { url: `${SITE_URL}/gpa-calculator`, lastModified: reviewed, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${SITE_URL}/pomodoro-timer`, lastModified: reviewed, changeFrequency: 'monthly', priority: 0.9 },
  ];

  const featureRoutes: MetadataRoute.Sitemap = FEATURES.map((f) => ({
    url: `${SITE_URL}/features/${f.slug}`,
    lastModified: reviewed,
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  const keywordRoutes: MetadataRoute.Sitemap = KEYWORD_PAGE_SLUGS.map((slug) => ({
    url: `${SITE_URL}/${slug}`,
    lastModified: reviewed,
    changeFrequency: 'monthly',
    priority: 0.8,
  }));

  const compareRoutes: MetadataRoute.Sitemap = COMPARE_SLUGS.map((slug) => ({
    url: `${SITE_URL}/compare/${slug}`,
    lastModified: reviewed,
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
    lastModified: reviewed,
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
      // A Spanish page is a translation of its English counterpart, so it
      // inherits that page's revision date. The fallback covers a pair whose
      // English side is not itself in the sitemap.
      lastModified: english?.lastModified ?? reviewed,
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
