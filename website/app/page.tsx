import type { Metadata } from 'next';
import { SignupButton } from '@/components/SignupButton';
import Image from 'next/image';
import styles from './page.module.css';
import { HeroDemo } from '@/components/HeroDemo';
import { Faq } from '@/components/Faq';
import { Cta } from '@/components/Cta';
import { JsonLd } from '@/components/JsonLd';
import { Reveal } from '@/components/Reveal';
import { PricingCards } from '@/components/PricingCards';
import { softwareApplicationSchema, faqPageSchema } from '@/lib/schema';
import { APP_STORE_URL } from '@/lib/semora-facts';
import { OG_IMAGE } from '@/lib/og';

// The apex and www hostnames both serve this page, so without an explicit
// self-canonical the highest-value URL on the site is the only one without a
// duplicate-content signal. `openGraph.url` is set per page rather than in the
// root layout: pages inherit the layout's openGraph object wholesale, so a URL
// there would make every subpage claim to be the homepage.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/', ...OG_IMAGE },
};

const HERO_CHIPS = [
  '5 free scans every month',
  'Synced across iPhone, iPad and web',
];

const STEPS = [
  {
    n: '01',
    title: 'Scan it',
    body: 'Take a photo, upload a PDF, drag it onto the web, or paste the text.',
  },
  {
    n: '02',
    title: 'Review it',
    body: 'Confirm the extracted dates, class times and grading details before anything is saved.',
  },
  {
    n: '03',
    title: 'Plan around it',
    body: 'Track deadlines, grades and study time from one calm, connected view.',
  },
];

type DeepDive = {
  key: string;
  eyebrow: string;
  heading: string;
  lead: string;
  bullets: string[];
  kicker?: string;
  /** Omitted when no screenshot honestly represents the section. */
  image?: string;
  alt?: string;
  flip?: boolean;
};

const DEEP_DIVES: DeepDive[] = [
  {
    key: 'scanner',
    eyebrow: 'The syllabus scanner',
    heading: 'Point your camera at week one.',
    lead: 'Turn a syllabus into a reviewable course plan in a few minutes.',
    bullets: [
      'Scan, upload, drag-and-drop or paste text.',
      'Review every deadline, class time and grade category before saving.',
    ],
    image: '/screenshots/scan-syllabus.png',
    alt: 'Semora scan screen showing photo, PDF, photo library and file import options',
  },
  {
    key: 'grades',
    eyebrow: 'Grades and forecasting',
    heading: 'Know the number you need, before the final.',
    lead: 'See where you stand now and what your next assignment can change.',
    bullets: [
      'Track weighted grades by course and category.',
      'Use forecasts and risk alerts to focus your effort where it matters.',
    ],
    image: '/screenshots/track-grades.png',
    alt: 'Semora course screen showing an 86.67 percent current grade with a B badge and what-if forecasting',
    flip: true,
  },
  {
    key: 'plan',
    eyebrow: 'Pro · Planning',
    heading: 'A study schedule that moves when your deadlines move.',
    lead: 'A flexible study plan that adjusts when your semester does.',
    bullets: [
      'Build study blocks around classes and deadlines.',
      'Rebalance missed sessions and changing due dates automatically.',
    ],
    image: '/screenshots/plan-semester.png',
    alt: 'Semora calendar screen showing a full month of colour-coded deadlines across three courses',
  },
];

const HOME_FAQ = [
  {
    question: 'Is Semora actually free?',
    answer:
      'Yes. The free plan includes five scans a month, four courses per semester, deadline tracking, weighted grades and reminders—no credit card required.',
  },
  {
    question: 'What does Pro cost, and where do I buy it?',
    answer:
      'Pro is $3.99 monthly or $19.99 yearly and is purchased in the iOS app. It applies to the same account on iPhone, iPad and the web.',
  },
  {
    question: 'What can I feed the scanner?',
    answer:
      'Use a photo, PDF upload, drag-and-drop on the web, or pasted text. You always review the result before it becomes part of your plan.',
  },
  {
    question: 'Do I need Canvas for this to work?',
    answer:
      'No. Semora works from your syllabus alone. Canvas, Blackboard and Moodle connections are optional Pro features, using the access your school provides.',
  },
  {
    question: 'Does it work on iPad?',
    answer:
      'Yes. Semora is one universal iOS app for iPhone and iPad, with the same courses and plans available on the web.',
  },
];

export default function Home() {
  return (
    <>
      <JsonLd data={softwareApplicationSchema()} />
      <JsonLd data={faqPageSchema(HOME_FAQ)} />

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>AI syllabus scanner for college</span>
            <h1 className={styles.h1}>
              Scan your syllabus.{' '}
              <span className={styles.gradient}>Never miss a deadline.</span>
            </h1>
            <p className={styles.sub}>
              Take a photo, upload a PDF, or paste the text. Semora pulls out every assignment, exam
              and reading with its due date, plus your class times and grading scale. Nothing saves
              until you approve it.
            </p>
            <div className={styles.heroActions}>
              <SignupButton className={styles.primaryBtn}>
                Try it for free
              </SignupButton>
              <a href={APP_STORE_URL} className={styles.secondaryBtn}>
                Get the app
              </a>
            </div>
            <ul className={styles.chips}>
              {HERO_CHIPS.map((chip) => (
                <li key={chip} className={styles.chip}>
                  {chip}
                </li>
              ))}
            </ul>
          </div>
          <div className={styles.heroVisual}>
            <HeroDemo />
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section className={styles.inner}>
        <Reveal>
          <div className={styles.sectionHead}>
            <span className={styles.label}>From PDF to plan</span>
            <h2>How it works</h2>
            <p>
              From a syllabus to a clear, connected semester in three simple steps.
            </p>
          </div>
        </Reveal>
        <ol className={styles.steps}>
          {STEPS.map((s, i) => (
            // Reveal renders a <div>, so it lives *inside* the <li> — an
            // <ol> may only have <li> children.
            <li key={s.n} className={styles.stepCell}>
              <Reveal delay={i * 90}>
                <div className={styles.step}>
                  <span className={styles.stepNum}>{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Feature deep-dives ───────────────────────────── */}
      {DEEP_DIVES.map((f, i) => {
        // Alternate a tinted full-bleed band behind every other deep-dive so
        // four consecutive sections don't read as one flat slab. The tint is
        // on the outer <section>; the width cap stays on the inner wrapper.
        const body = (
          <div className={styles.inner}>
            <Reveal>
              <div
                className={[
                  styles.split,
                  f.flip ? styles.splitFlip : '',
                  f.image ? '' : styles.splitWide,
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className={styles.splitCopy}>
                  <span className={styles.label}>{f.eyebrow}</span>
                  <h2 className={styles.splitHeading}>{f.heading}</h2>
                  <p className={styles.lead}>{f.lead}</p>
                  <ul className={`${styles.checks} ${f.image ? '' : styles.checksTwoUp}`}>
                    {f.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  {f.kicker && <p className={styles.kicker}>{f.kicker}</p>}
                </div>
                {f.image && f.alt && (
                  <div className={styles.splitMedia}>
                    <Image
                      src={f.image}
                      alt={f.alt}
                      width={296}
                      height={640}
                      className={styles.shot}
                    />
                  </div>
                )}
              </div>
            </Reveal>
          </div>
        );

        return (
          <section key={f.key} className={i % 2 === 1 ? styles.band : undefined}>
            {body}
          </section>
        );
      })}

      {/* ── Pricing ──────────────────────────────────────── */}
      <section className={styles.inner}>
        <Reveal>
          <div className={styles.sectionHead}>
            <span className={styles.label}>Pricing</span>
            <h2>Free covers a real semester.</h2>
            <p>
              Start with five scans a month, four courses, deadlines, grades and reminders.
              Upgrade when you want the full planning layer.
            </p>
          </div>
        </Reveal>
        <PricingCards />
      </section>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <section className={styles.band}>
        <div className={styles.inner}>
          <div className={styles.faqLayout}>
            <div className={styles.faqAside}>
              <span className={styles.label}>FAQ</span>
              <h2>Good to know.</h2>
              <p>
                The essentials before you get started.
              </p>
            </div>
            <div className={styles.faqBody}>
              <Faq items={HOME_FAQ} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Close ────────────────────────────────────────── */}
      <div className={styles.inner}>
        <Cta
          heading="Make your semester easier to see."
          subheading="Start free on iPhone, iPad or the web."
        />
      </div>
    </>
  );
}
