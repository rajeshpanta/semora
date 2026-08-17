import type { Metadata } from 'next';
import { enAlternates } from '@/lib/hreflang';
import styles from '@/components/Prose.module.css';
import { Faq } from '@/components/Faq';
import { JsonLd } from '@/components/JsonLd';
import { faqPageSchema } from '@/lib/schema';
import { SUPPORT_EMAIL } from '@/lib/semora-facts';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';
import { OG_IMAGE } from '@/lib/og';
import { ArticleShell } from '@/components/ArticleShell';
import { SupportForm } from '@/components/SupportForm';
import { Breadcrumb } from '@/components/Breadcrumb';
import heroStyles from './support.module.css';

export const metadata: Metadata = {
  title: 'Support',
  description: "Answers to common questions about using Semora, plus how to reach us directly.",
  alternates: enAlternates('/support'),
  openGraph: { url: '/support', ...OG_IMAGE },
};

const SUPPORT_FAQ = [
  {
    question: 'How do I scan a syllabus?',
    answer:
      'Open the Scan tab, then choose to take a photo or upload a PDF. Semora uses AI to extract assignments, exams, and deadlines automatically. You can review and edit everything before saving.',
  },
  {
    question: 'Can I edit tasks after scanning?',
    answer:
      'Yes. Tap any task to view its details, then tap Edit to change the title, due date, time, type, or description.',
  },
  {
    question: 'How do reminders work?',
    answer:
      'Every account, free included, gets reminders 3 days before, 1 day before, and on the morning of each deadline — you choose which of the three you want in Settings. Pro adds per-task custom timing and quiet hours, so nothing fires at 2 a.m.',
  },
  {
    question: 'How is my grade calculated?',
    answer:
      'Semora calculates a weighted average based on the scores and weights you enter for each task. Your current grade reflects only the work graded so far.',
  },
  {
    question: 'Can I manage multiple semesters?',
    answer: 'Yes. Go to the Courses tab and use the semester selector to create, switch between, or manage different semesters.',
  },
  {
    question: 'How do I cancel my subscription?',
    answer:
      'Subscriptions are managed through your Apple ID. Go to Settings > Apple ID > Subscriptions on your device to manage or cancel your Semora Pro subscription.',
  },
  {
    question: 'How do I delete my account?',
    answer:
      'Go to the Me tab > scroll to the bottom > tap "Delete Account." This permanently removes your account and all associated data.',
  },
];


// The long-form body adds more questions; merge them so the page renders one
// list and emits a single FAQPage block rather than two.
const SUPPORT_FAQ_ALL = [...SUPPORT_FAQ, ...(getPageContent('support')?.faq ?? [])];

export default function SupportPage() {
  return (
    <>
      <JsonLd data={faqPageSchema(SUPPORT_FAQ_ALL)} />
      <section className={heroStyles.hero} aria-labelledby="support-heading">
        <div className={heroStyles.inner}>
          <Breadcrumb
            trail={[
              { name: 'Home', path: '/' },
              { name: 'Support', path: '/support' },
            ]}
          />
          <header className={heroStyles.intro}>
            <span className={heroStyles.eyebrow}>Semora support</span>
            <h1 id="support-heading">How can we help?</h1>
            <p>Tell us what&apos;s going on. We usually respond within a few hours.</p>
          </header>

          <div className={heroStyles.grid}>
            <SupportForm supportEmail={SUPPORT_EMAIL} />

            <aside className={heroStyles.details} aria-label="Support contact details">
              <a className={heroStyles.detailCard} href={`mailto:${SUPPORT_EMAIL}`}>
                <span>Email us</span>
                <strong>{SUPPORT_EMAIL}</strong>
                <small>Open your email app</small>
              </a>
              <div className={heroStyles.detailCard}>
                <span>Response time</span>
                <strong>Within a few hours</strong>
                <small>Monday–Friday</small>
              </div>
              <a className={heroStyles.detailCard} href="https://apps.apple.com/us/app/semora-ai-syllabus-scanner/id6762589321">
                <span>iOS app</span>
                <strong>Download on the App Store</strong>
                <small>iPhone and iPad</small>
              </a>
            </aside>
          </div>
        </div>
      </section>

      <ArticleShell
        ctaHeading="Still stuck? Try it on your own syllabus"
        ctaSubheading="See how Semora handles your actual courses. Free, no credit card."
      >
        <article className={`${styles.prose} article-body`}>
          <h2>Frequently Asked Questions</h2>
          <Faq items={SUPPORT_FAQ_ALL} />

          <PageSections content={getPageContent('support')} emitFaq={false} />
          <div className={styles.contactBox}>
            <h2>Still need help?</h2>
            <p>Reach out and we&apos;ll get back to you as soon as possible.</p>
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </div>
        </article>
      </ArticleShell>
    </>
  );
}
