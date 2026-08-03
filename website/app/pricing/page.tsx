import type { Metadata } from 'next';
import styles from './pricing.module.css';
import { Faq } from '@/components/Faq';
import { Cta } from '@/components/Cta';
import { JsonLd } from '@/components/JsonLd';
import { PricingCards } from '@/components/PricingCards';
import { softwareApplicationSchema, faqPageSchema } from '@/lib/schema';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';

export const metadata: Metadata = {
  title: 'Pricing',
  description: "Semora is free to start. Pro is $3.99/month or $19.99/year, purchased in the app and applied account-wide including web.",
  alternates: { canonical: '/pricing' },
};

const PRICING_FAQ = [
  {
    question: 'Is Semora free?',
    answer:
      'Yes. The free tier includes 5 syllabus scans per calendar month, up to 4 courses in one semester, full deadline and grade tracking, and same-day reminders — no credit card required. Calendar sync (device + .ics export) is a Pro feature.',
  },
  {
    question: 'How do I upgrade to Pro?',
    answer:
      'Pro is purchased inside the app through the App Store, on iPhone or iPad. Once purchased, it applies to your whole account, including on the web.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. Pro subscriptions are managed through your Apple ID — go to Settings > Apple ID > Subscriptions to cancel. Subscriptions renew automatically unless canceled at least 24 hours before the period ends.',
  },
  {
    question: 'What happens to my data if I cancel Pro?',
    answer:
      'Your account and academic data stay intact. You keep everything from the free tier — you just lose access to Pro-only features like Smart Plan, Flashcards, and the AI tutor.',
  },
];


// The long-form body adds more questions; merge them so the page renders one
// list and emits a single FAQPage block rather than two.
const PRICING_FAQ_ALL = [...PRICING_FAQ, ...(getPageContent('pricing')?.faq ?? [])];

export default function PricingPage() {
  return (
    <div className={styles.wrap}>
      <JsonLd data={softwareApplicationSchema()} />
      <JsonLd data={faqPageSchema(PRICING_FAQ_ALL)} />

      <header className={styles.head}>
        <h1>Simple pricing</h1>
        <p>Start free. Upgrade only if you want more.</p>
      </header>

      <PricingCards />

      <div style={{ maxWidth: 720, margin: '64px auto' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24 }}>Pricing questions</h2>
        <Faq items={PRICING_FAQ_ALL} />
      </div>

      <PageSections content={getPageContent('pricing')} emitFaq={false} />
      <Cta
        heading="Start free today"
        subheading="Scan your first syllabus in under a minute — free, no credit card."
      />
    </div>
  );
}
