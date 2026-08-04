import type {
  Article,
  BreadcrumbList,
  FAQPage,
  Organization,
  SoftwareApplication,
  WebSite,
  WithContext,
} from 'schema-dts';
import { SITE_NAME, SITE_DESCRIPTION, PRICING, APP_STORE_URL, SUPPORT_EMAIL } from './semora-facts';
import { SITE_URL } from './site';

// Stable node identities. Without these the page ships several anonymous
// Organization objects that Google has to guess are the same entity; with them
// it is one graph with one publisher.
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;

/**
 * The site-name signal.
 *
 * Google picks the name shown above a search result from a short list of
 * signals, and WebSite structured data with a `name` is the documented first
 * choice. Without it Google falls back to the bare domain — which is why
 * results read "semoraai.com" instead of "Semora".
 *
 * Deliberately no `potentialAction`/SearchAction: that declares a site search
 * endpoint, and there is no search on this site. Claiming one Google cannot
 * exercise is worse than omitting it.
 */
export function webSiteSchema(): WithContext<WebSite> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    publisher: { '@id': ORGANIZATION_ID },
  };
}

export function organizationSchema(): WithContext<Organization> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    logo: `${SITE_URL}/logo.png`,
    email: SUPPORT_EMAIL,
    // The App Store listing is an Apple-verified record that already carries
    // the string "Semora". Pointing at it is the cheapest way to tie this
    // domain to a known entity — useful while the domain itself has no
    // external links to vouch for it.
    sameAs: [APP_STORE_URL],
  };
}

/**
 * NOTE: this will not earn the Software App rich result. Google requires
 * `aggregateRating` or `review` for that, Semora has no ratings yet, and
 * inventing one is a spam-policy violation. The block still earns its place as
 * an entity description tying the app to the organisation — revisit the rich
 * result only once there are real ratings shown on the page.
 */
export function softwareApplicationSchema(): WithContext<SoftwareApplication> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#app`,
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: 'EducationApplication',
    operatingSystem: 'iOS, iPadOS, Web',
    downloadUrl: APP_STORE_URL,
    sameAs: [APP_STORE_URL],
    publisher: { '@id': ORGANIZATION_ID },
    description: SITE_DESCRIPTION,
    offers: [
      {
        '@type': 'Offer',
        name: PRICING.free.name,
        price: '0',
        priceCurrency: 'USD',
      },
      {
        '@type': 'Offer',
        name: `${PRICING.pro.name} (monthly)`,
        price: String(PRICING.pro.monthly.price),
        priceCurrency: 'USD',
      },
      {
        '@type': 'Offer',
        name: `${PRICING.pro.name} (annual)`,
        price: String(PRICING.pro.annual.price),
        priceCurrency: 'USD',
      },
    ],
  };
}

export function faqPageSchema(items: { question: string; answer: string }[]): WithContext<FAQPage> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}

export function articleSchema(post: {
  title: string;
  description: string;
  slug: string;
  datePublished: string;
  dateModified?: string;
}): WithContext<Article> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    url: `${SITE_URL}/blog/${post.slug}`,
    datePublished: post.datePublished,
    dateModified: post.dateModified ?? post.datePublished,
    author: { '@id': ORGANIZATION_ID },
    publisher: { '@id': ORGANIZATION_ID },
  };
}

export function breadcrumbListSchema(
  items: { name: string; path: string }[]
): WithContext<BreadcrumbList> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  };
}
