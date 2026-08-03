import Link from 'next/link';
import Image from 'next/image';
import styles from './page.module.css';
import { Faq } from '@/components/Faq';
import { Cta } from '@/components/Cta';
import { JsonLd } from '@/components/JsonLd';
import { PricingCards } from '@/components/PricingCards';
import { softwareApplicationSchema, faqPageSchema } from '@/lib/schema';
import { FEATURES, APP_URL } from '@/lib/semora-facts';
import { COMPETITORS } from '@/lib/competitors';

const HOME_FAQ = [
  {
    question: 'Is Semora free to use?',
    answer:
      "Yes. The free tier includes 5 syllabus scans per calendar month, up to 4 courses per semester, full deadline and grade tracking, and same-day reminders. Pro ($3.99/month or $19.99/year) adds unlimited scans and courses, Smart Plan, Grade Scale & Forecasting, calendar sync with .ics export, and more.",
  },
  {
    question: 'How much does Semora Pro cost?',
    answer:
      'Semora Pro is $3.99/month or $19.99/year. It is purchased in the app and applies to your whole account, including web.',
  },
  {
    question: 'Do I need Canvas for Semora to work?',
    answer:
      "No. Semora's syllabus scanner works from a photo or PDF on its own. If your school uses Canvas, you can also sync assignments using a personal access token you generate yourself in Canvas — no OAuth app review required.",
  },
  {
    question: 'Can I share a course with classmates?',
    answer:
      'Yes, with Course Spaces. Share a course through an invite link and deadlines and group assignments sync in real time for everyone in the space.',
  },
  {
    question: 'Is there a web app?',
    answer:
      'Yes. Semora works on iPhone, iPad, and the web, with your account and Pro entitlement syncing across all three.',
  },
];

const STEPS = [
  {
    title: 'Scan your syllabus',
    body: 'Take a photo or upload a PDF. Semora reads every assignment, exam, and deadline.',
  },
  {
    title: 'Review and confirm',
    body: 'Check what was extracted and edit anything before it lands on your calendar.',
  },
  {
    title: 'Plan around it',
    body: 'See deadlines, grades, and workload in one place — and let Smart Plan build a study schedule around them.',
  },
];

export default function Home() {
  return (
    <>
      <JsonLd data={softwareApplicationSchema()} />
      <JsonLd data={faqPageSchema(HOME_FAQ)} />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div>
            <span className={styles.eyebrow}>AI syllabus scanner for college</span>
            <h1 className={styles.h1}>
              Scan your syllabus. <span className={styles.gradient}>Never miss a deadline.</span>
            </h1>
            <p className={styles.sub}>
              Semora turns a syllabus photo or PDF into a full semester calendar — deadlines,
              grades, and class times — then helps you plan around it.
            </p>
            <div className={styles.heroActions}>
              <Link href={APP_URL} className={styles.primaryBtn}>
                Get started free
              </Link>
              <Link href="/features" className={styles.secondaryBtn}>
                See how it works
              </Link>
            </div>
          </div>
          <div className={styles.heroVisual}>
            <Image
              src="/screenshots/never-miss-deadline.png"
              alt="Semora Today screen showing next-up assignment and this week's workload"
              width={300}
              height={648}
              priority
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Three steps from syllabus to semester</h2>
        </div>
        <div className={styles.steps}>
          {STEPS.map((step, i) => (
            <div className={styles.step} key={step.title}>
              <div className={styles.stepNum}>{i + 1}</div>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Everything you need for the semester</h2>
          <p>From the first syllabus scan to finals week.</p>
        </div>
        <div className={styles.grid}>
          {FEATURES.map((feature) => (
            <Link key={feature.slug} href={`/features/${feature.slug}`} className={styles.card}>
              <span
                className={`${styles.cardTier} ${feature.tier === 'pro' ? styles.tierPro : styles.tierFree}`}
              >
                {feature.tier === 'pro' ? 'Pro' : 'Free'}
              </span>
              <h3 className={styles.cardTitle}>{feature.name}</h3>
              <p className={styles.cardBody}>{feature.shortDescription}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Simple pricing</h2>
          <p>Start free. Upgrade only if you want more.</p>
        </div>
        <PricingCards proFeatureLimit={6} />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>How Semora compares</h2>
          <p>Honest, feature-by-feature comparisons against other student planning apps.</p>
        </div>
        <div className={styles.compareRow}>
          {COMPETITORS.map((c) => (
            <Link key={c.slug} href={`/compare/${c.slug}`} className={styles.compareChip}>
              Semora vs {c.name}
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>Frequently asked questions</h2>
        </div>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <Faq items={HOME_FAQ} />
        </div>
      </section>

      <div className={styles.section} style={{ paddingTop: 0 }}>
        <Cta
          heading="Ready to stop tracking deadlines by hand?"
          subheading="Scan your first syllabus in under a minute — free, no credit card."
          label="Get started free"
        />
      </div>
    </>
  );
}
