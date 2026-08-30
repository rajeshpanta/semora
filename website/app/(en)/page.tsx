import type { Metadata } from 'next';
import { SignupButton } from '@/components/SignupButton';
import Image from 'next/image';
import Link from 'next/link';
import styles from './page.module.css';
import { HeroDemo } from '@/components/HeroDemo';
import { Faq } from '@/components/Faq';
import { Cta } from '@/components/Cta';
import { JsonLd } from '@/components/JsonLd';
import { Reveal } from '@/components/Reveal';
import { softwareApplicationSchema, faqPageSchema } from '@/lib/schema';
import { downloadPath } from '@/lib/semora-facts';
import { OG_IMAGE } from '@/lib/og';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';

// The apex and www hostnames both serve this page, so without an explicit
// self-canonical the highest-value URL on the site is the only one without a
// duplicate-content signal. `openGraph.url` is set per page rather than in the
// root layout: pages inherit the layout's openGraph object wholesale, so a URL
// there would make every subpage claim to be the homepage.
export const metadata: Metadata = {
  alternates: {
    canonical: '/',
    languages: { 'en-US': '/', es: '/es', 'x-default': '/' },
  },
  openGraph: { url: '/', ...OG_IMAGE },
};

const HERO_CHIPS = [
  'Your first AI action is free',
  'Synced across iPhone, iPad and web',
];

// Two paths, not three steps.
//
// This block used to number the two entry routes 01 and 02 alongside the payoff
// at 03, which reads as a sequence: scan a syllabus, THEN connect Canvas, THEN
// plan. They are alternatives, so a new reader was being told to do both.
//
// It is two cards now, each a complete route, with the shared outcome moved up
// into the section intro. The grid is auto-fit, so two cells lay out without
// touching the CSS.
//
// Naming Canvas rather than "your LMS" is deliberate: a Canvas student can do
// this tonight alone, while Blackboard and Moodle need a token their IT
// department issues. The free claim is enforced server-side — LMS-sourced
// courses skip the four-course cap (090) — and it stops short of claiming
// unlimited semesters, because enforce_free_semester_limit exempts only is_pro.
const STEPS = [
  {
    n: '01',
    title: 'Start from a syllabus',
    body: 'Photo, PDF, or paste the text. Every deadline, plus what each is worth toward your grade.',
  },
  {
    n: '02',
    title: 'Start from Canvas',
    body: 'Paste one calendar link. Every assignment, quiz and exam, kept in sync with Canvas automatically.',
  },
];

const CAPABILITIES = [
  {
    n: '01',
    eyebrow: 'Coursework in sync',
    title: 'Your courses change. Semora keeps up.',
    body: 'Import a syllabus or, where your school allows it, connect Canvas, Blackboard or Moodle. Sync history and last-updated details make every change visible.',
    href: '/features/canvas-sync',
    linkLabel: 'Explore LMS sync',
  },
  {
    n: '02',
    eyebrow: 'Adaptive planning',
    title: 'Do the work that can change your outcome first.',
    body: 'Smart Plan responds to moved deadlines, missed sessions, approaching exams and grade risk—and explains why your plan changed.',
    href: '/features/smart-plan',
    linkLabel: 'Explore Smart Plan',
  },
  {
    n: '03',
    eyebrow: 'Course intelligence',
    title: 'Study from the material your class actually uses.',
    body: 'Tutor answers cite your course sources, while practice, quizzes and flashcards turn notes and assignments into active review.',
    href: '/features/ai-tutor',
    linkLabel: 'Explore AI Tutor',
  },
  {
    n: '04',
    eyebrow: 'One account, everywhere',
    title: 'Keep going on iPhone, iPad, Apple Watch or the web.',
    body: 'Offline changes wait safely and sync when you reconnect. The phone, tablet and web app are all in English and Spanish.',
    href: '/features',
    linkLabel: 'See every feature',
  },
] as const;

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
      'Yes. The free plan includes one AI action for the lifetime of your account—a syllabus scan, a lecture recording or turning a document into notes, whichever you reach for first—plus unlimited classes synced free from Canvas plus one course you add by hand within one semester, deadline tracking, weighted grades and reminders. No credit card required.',
  },
  {
    question: 'What does Pro add?',
    answer:
      'Pro adds unlimited courses and scans, LMS connections, adaptive planning, course-aware study tools and advanced grade insights. The current options are listed on the Pricing page and apply to the same account on iPhone, iPad and the web.',
  },
  {
    question: 'What can I feed the scanner?',
    answer:
      'Use a photo, PDF upload, drag-and-drop on the web, or pasted text. You always review the result before it becomes part of your plan.',
  },
  {
    question: 'Do I need Canvas for this to work?',
    answer:
      'No. Semora works from your syllabus alone. Canvas, Blackboard and Moodle connections are optional and free on every plan. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. Blackboard and Moodle still use a school-issued token connections.',
  },
  {
    question: 'Does it work on iPad?',
    answer:
      'Yes. Semora is one universal iOS app for iPhone and iPad, with the same courses and plans available on the web.',
  },
];

// The long-form body below the fold adds more questions; merge them so the page
// renders one list and emits a single FAQPage block rather than two.
const HOME_FAQ_ALL = [...HOME_FAQ, ...(getPageContent('home')?.faq ?? [])];

export default function Home() {
  return (
    <>
      <JsonLd data={softwareApplicationSchema({ includeOffers: false })} />
      <JsonLd data={faqPageSchema(HOME_FAQ_ALL)} />

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
              Turn a syllabus photo or PDF into a reviewed semester plan—deadlines, class times,
              grade weights and study tools, all connected.
            </p>
            <div className={styles.heroActions}>
              <SignupButton className={styles.primaryBtn}>
                Try it for free
              </SignupButton>
              <a href={downloadPath()} className={styles.secondaryBtn}>
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
            <span className={styles.label}>Two ways in</span>
            <h2>How it works</h2>
            <p>Either way your whole semester lands in one place, on every device you study on.</p>
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

      {/* ── Connected product story ─────────────────────── */}
      <section className={styles.inner}>
        <Reveal>
          <div className={styles.sectionHead}>
            <span className={styles.label}>One connected semester</span>
            <h2>Your plan, grades and study tools stay in step.</h2>
            <p>
              Semora connects the work around your courses, so a change in one place helps you
              decide what to do next everywhere else.
            </p>
          </div>
        </Reveal>
        <ol className={styles.capabilityGrid}>
          {CAPABILITIES.map((capability, index) => (
            <li key={capability.n} className={styles.capabilityCell}>
              <Reveal delay={index * 70}>
                <Link href={capability.href} className={styles.capabilityCard}>
                  <div className={styles.capabilityTop}>
                    <span className={styles.capabilityNum}>{capability.n}</span>
                    <span className={styles.capabilityArrow} aria-hidden="true">↗</span>
                  </div>
                  <span className={styles.capabilityEyebrow}>{capability.eyebrow}</span>
                  <h3>{capability.title}</h3>
                  <p>{capability.body}</p>
                  <span className={styles.capabilityLink}>{capability.linkLabel} →</span>
                </Link>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Long-form body ───────────────────────────────
          The homepage carried 977 words against 4,000-5,000 on every other
          page on the site, which left the highest-priority URL the thinnest
          one. Same treatment the hub pages get: the designed sections above
          stay as they are, and the depth goes underneath them. */}
      <PageSections content={getPageContent('home')} withRail emitFaq={false} />

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
              <Faq items={HOME_FAQ_ALL} />
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
