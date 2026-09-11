import type { Metadata } from 'next';
import { enAlternates } from '@/lib/hreflang';
import { PRICING } from '@/lib/semora-facts';
import { pageTitle } from '@/lib/title';
import { OG_IMAGE } from '@/lib/og';
import styles from './pricing.module.css';
import { Faq } from '@/components/Faq';
import { Cta } from '@/components/Cta';
import { JsonLd } from '@/components/JsonLd';
import { PricingCards } from '@/components/PricingCards';
import { softwareApplicationSchema, faqPageSchema } from '@/lib/schema';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';
import { Breadcrumb } from '@/components/Breadcrumb';
import { RouteReporter } from '@/components/RouteReporter';

export const metadata: Metadata = {
  // Was "Pricing", which rendered as "Pricing | Semora" — sixteen characters
  // on a page ranking at position 5.3 and converting a third as well as the
  // homepage does from a worse position. A price in the title is one of the
  // few things that reliably earns a click, because it answers the question
  // the searcher typed before they have to click anything.
  //
  // Interpolated from PRICING rather than typed: the pricing card carried
  // hardcoded figures for months while importing the constant that held them,
  // and a title is a worse place to repeat that mistake because nobody looks
  // at it.
  title: pageTitle(`Semora Pricing: Free Forever, or Pro at ${PRICING.pro.monthly.priceLabel}`),
  description: "Semora is free to start. Pro is $4.99/month or $29.99/year, bought by card on the web or in the iOS app, and applied account-wide including web.",
  alternates: enAlternates('/pricing'),
  openGraph: { url: '/pricing', ...OG_IMAGE },
};

const PRICING_FAQ = [
  {
    question: 'Is Semora free?',
    answer:
      'Yes, and not as a trial that expires. Every class you are taking syncs across from Canvas, Blackboard or Moodle at no cost, with no cap on how many, plus a course you add by hand. Your first AI action is free—a syllabus scan, a lecture recording or a document turned into notes, whichever you use it on. Full deadline and grade tracking and same-day reminders are included, with no credit card. Free covers one semester start to finish; a second term is where Pro begins. Calendar sync (device + .ics export) is a Pro feature.',
  },
  {
    question: 'How do I upgrade to Pro?',
    answer:
      'Two ways. Pay by card on the web at app.semoraai.com, or buy it inside the app through the App Store on iPhone or iPad. Either way it applies to your whole account, including on the web.',
  },
  {
    question: 'Can I cancel anytime?',
    answer:
      'Yes. If you paid by card, open Settings in Semora and tap Manage Semora Plan to cancel in the billing portal. If you subscribed through the App Store, go to Settings > Apple ID > Subscriptions. Subscriptions renew automatically unless canceled, and App Store plans must be canceled at least 24 hours before the period ends.',
  },
  {
    question: 'What happens to my data if I cancel Pro?',
    answer:
      'Your account and academic data stay intact. You keep everything from the free tier. You just lose access to Pro-only features like Smart Plan, Flashcards, and the AI Tutor.',
  },
];


// The long-form body adds more questions; merge them so the page renders one
// list and emits a single FAQPage block rather than two.
const PRICING_FAQ_ALL = [...PRICING_FAQ, ...(getPageContent('pricing')?.faq ?? [])];

export default function PricingPage() {
  return (
    <div className={styles.wrap}>
      <RouteReporter event="pricing_view" />
      <JsonLd data={softwareApplicationSchema()} />
      <JsonLd data={faqPageSchema(PRICING_FAQ_ALL)} />

      <header className={styles.head}>
        <Breadcrumb
          align="center"
          trail={[
            { name: 'Home', path: '/' },
            { name: 'Pricing', path: '/pricing' },
          ]}
        />
        <h1>Simple pricing</h1>
        {/* This line is where the one-semester limit lives now. It used to be
            bolted onto the free card's course bullet and repeated through the
            copy, which made the free tier read as a list of things withheld.
            Said once, up front, it does the opposite: Pro becomes the obvious
            next step rather than a wall. Phrased as "a second semester is
            where Pro comes in" rather than "free covers one semester",
            because the Free card beside it reads "$0 Forever" — and the free
            TIER genuinely is forever, it just holds one term. Saying free
            lasts a semester next to a card saying forever reads as a
            contradiction and costs trust on the page where trust converts.
            Do not delete it — free accounts genuinely cannot start a second
            term (DB trigger, migration 010). */}
        <p>Start free — every class synced, no credit card, no trial that expires. A second semester is where Pro comes in.</p>
      </header>

      <PricingCards />

      {/* Explanation before questions. The FAQ used to sit here, directly under
          the cards, so twelve accordions came between the prices and the pages
          that explain them — a reader looking for "what does Pro actually add"
          had to scroll past every question first. */}
      <PageSections content={getPageContent('pricing')} withRail emitFaq={false} />

      <div style={{ maxWidth: 720, margin: '64px auto' }}>
        <h2 style={{ textAlign: 'center', marginBottom: 24 }}>Pricing questions</h2>
        <Faq items={PRICING_FAQ_ALL} />
      </div>

      <Cta
        heading="Start free today"
        subheading="Scan your first syllabus in under a minute. Free, no credit card."
      />
    </div>
  );
}
