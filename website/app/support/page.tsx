import type { Metadata } from 'next';
import styles from '@/components/Prose.module.css';
import { Faq } from '@/components/Faq';
import { JsonLd } from '@/components/JsonLd';
import { faqPageSchema } from '@/lib/schema';
import { SUPPORT_EMAIL } from '@/lib/semora-facts';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';
import { OG_IMAGE } from '@/lib/og';
import { ArticleShell } from '@/components/ArticleShell';

export const metadata: Metadata = {
  title: 'Support',
  description: "Answers to common questions about using Semora, plus how to reach us directly.",
  alternates: { canonical: '/support' },
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
      'Free users receive same-day reminders for upcoming tasks. Semora Pro users can enable 1-day and 3-day advance reminders for extra preparation time.',
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
    <ArticleShell
      ctaHeading="Still stuck? Try it on your own syllabus"
      ctaSubheading="See how Semora handles your actual courses — free, no credit card."
    >
    <article className={`${styles.prose} article-body`}>
      <JsonLd data={faqPageSchema(SUPPORT_FAQ_ALL)} />
      <h1>Support</h1>
      <p className={styles.subtitle}>We&apos;re here to help you get the most out of Semora.</p>

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
  );
}
