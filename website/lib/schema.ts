import type {
  FAQPage,
  Organization,
  SoftwareApplication,
  WithContext,
} from 'schema-dts';
import { SITE_NAME, SITE_DESCRIPTION, PRICING } from './semora-facts';
import { SITE_URL } from './site';

export function organizationSchema(): WithContext<Organization> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
  };
}

export function softwareApplicationSchema(): WithContext<SoftwareApplication> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'EducationApplication',
    operatingSystem: 'iOS, Web',
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

