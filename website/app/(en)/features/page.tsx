import type { Metadata } from 'next';
import { enAlternates } from '@/lib/hreflang';
import type { ComponentType } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './features.module.css';
import { Reveal } from '@/components/Reveal';
import { FlashcardIcon, TimerIcon, ChatIcon, PeopleIcon, SparkleIcon } from '@/components/FeatureIcons';
import { FEATURES, APP_URL, PRICING, getFeature } from '@/lib/semora-facts';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Everything Semora does: AI syllabus scanning, grade tracking, Smart Plan, flashcards, focus timer, AI tutor, Course Spaces, and Canvas sync.',
  alternates: enAlternates('/features'),
};

interface ShowcaseItem {
  image: string;
  alt: string;
  tier: 'free' | 'pro';
  title: string;
  body: string;
  bullets: string[];
  href: string;
}

const SHOWCASE: ShowcaseItem[] = [
  {
    image: '/screenshots/scan-syllabus.png',
    alt: 'Semora scan syllabus screen showing options to take a photo, upload a PDF, choose from photos, or pick from files',
    tier: 'free',
    title: 'Scan a syllabus, get a semester',
    body: "Take a photo, upload a PDF, drag a file onto the web app, or paste text copied from a PDF or your school's LMS page. OpenAI GPT-5.6 Luna reads it and extracts the course name, instructor, meeting times, grading scale, and every assignment, exam, quiz, project, and reading with its due date.",
    bullets: [
      'Photo capture, multi-page, up to 5 pages',
      'PDF upload, drag-and-drop, or pasted text',
      '5 free scans per calendar month',
    ],
    href: '/features/syllabus-scanner',
  },
  {
    image: '/screenshots/never-miss-deadline.png',
    alt: 'Semora Today screen showing next-up assignment, overdue items, and a weekly workload snapshot',
    tier: 'free',
    title: 'Never miss a deadline',
    body: "Every deadline from every course lands in one place, with the next thing due surfaced first. Same-day reminders are on by default, and a weekly snapshot shows tasks, exams, and courses at a glance, including anything overdue.",
    bullets: [
      'One list across every course, not per-class',
      'Same-day reminders included free',
      'Overdue items flagged automatically',
    ],
    href: '/ai-syllabus-scanner',
  },
  {
    image: '/screenshots/track-grades.png',
    alt: 'Semora course detail screen showing a current grade of 86.67% calculated from graded coursework',
    tier: 'free',
    title: 'Track your grades as you go',
    body: 'Enter the score for each graded assignment and Semora calculates your current weighted average automatically, reflecting only the work graded so far, so you always know where you actually stand.',
    bullets: [
      'Weighted average, not a flat mean',
      'Updates the moment a grade is entered',
      'Pro adds trend charts, CSV export, and a print view',
    ],
    href: '/features/grade-tracking',
  },
  {
    image: '/screenshots/canvas-sync.png',
    alt: 'Semora Canvas sync settings screen showing connected courses and auto-sync status',
    tier: 'free',
    title: 'Sync with Canvas, without OAuth',
    body: 'Connect Canvas using a personal access token you generate yourself inside Canvas. There is no OAuth app-review process to wait on. Once connected, assignments and grades import automatically, and reminders reschedule themselves when a deadline moves.',
    bullets: [
      'Personal access token, no OAuth wait',
      'Assignments and grades import automatically',
      'Access tokens stay on your device',
    ],
    href: '/features/canvas-sync',
  },
  {
    image: '/screenshots/plan-semester.png',
    alt: 'Semora calendar screen showing a month view with deadlines marked across courses',
    tier: 'free',
    title: 'See your whole semester, one view',
    body: 'Every class, deadline, and exam mapped across the term in a single calendar: month view or list view, color-coded by course, so nothing sneaks up on you.',
    bullets: [
      'Month and list views',
      'Color-coded by course',
      'Pro adds device calendar sync with .ics export',
    ],
    href: '/ai-study-planner-for-college',
  },
];

const REMAINING_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  'smart-plan': SparkleIcon,
  flashcards: FlashcardIcon,
  'focus-timer': TimerIcon,
  'ai-tutor': ChatIcon,
  collaboration: PeopleIcon,
};

const REMAINING = Object.keys(REMAINING_ICONS)
  .map((slug) => getFeature(slug))
  .filter((f): f is NonNullable<typeof f> => Boolean(f));

export default function FeaturesPage() {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.eyebrow}>Features</span>
          <h1 className={styles.h1}>
            Everything you need for <span className={styles.gradient}>the semester</span>
          </h1>
          <p className={styles.sub}>
            From the first syllabus scan to finals week. Start free, upgrade only if you want
            more.
          </p>
          <div className={styles.heroActions}>
            <Link href={APP_URL} className={styles.primaryBtn}>
              Get started free
            </Link>
            <Link href="/pricing" className={styles.secondaryBtn}>
              See pricing
            </Link>
          </div>
          <div className={styles.chipRow}>
            {FEATURES.map((f) => (
              <Link key={f.slug} href={`/features/${f.slug}`} className={styles.chip}>
                {f.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.showcase}>
        <div className={styles.showcaseHead}>
          <h2>Five ways Semora organizes your semester</h2>
          <p>The core loop, from a syllabus photo to a grade you can trust.</p>
        </div>

        {SHOWCASE.map((item, i) => (
          <Reveal key={item.title} delay={i * 60}>
            <div className={`${styles.showcaseRow} ${i % 2 === 1 ? styles.reverse : ''}`}>
              <div className={styles.showcaseImage}>
                <Image src={item.image} alt={item.alt} width={260} height={562} />
              </div>
              <div className={styles.showcaseText}>
                <span
                  className={`${styles.showcaseTier} ${item.tier === 'pro' ? styles.tierPro : styles.tierFree}`}
                >
                  {item.tier === 'pro' ? 'Pro' : 'Free'}
                </span>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <ul>
                  {item.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <Link href={item.href} className={styles.showcaseLink}>
                  Learn more →
                </Link>
              </div>
            </div>
          </Reveal>
        ))}
      </section>

      <section className={styles.gridSection}>
        <div className={styles.gridHead}>
          <h2>Built for how you actually study</h2>
          <p>The rest of the toolkit, included with Semora Pro.</p>
        </div>
        <div className={styles.grid}>
          {REMAINING.map((feature, i) => {
            const Icon = REMAINING_ICONS[feature.slug];
            return (
              <Reveal key={feature.slug} delay={i * 50}>
                <Link href={`/features/${feature.slug}`} className={styles.card}>
                  <div className={styles.iconWrap}>
                    <Icon />
                  </div>
                  <h3 className={styles.cardTitle}>{feature.name}</h3>
                  <p className={styles.cardBody}>{feature.shortDescription}</p>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </section>

      <div className={styles.banner}>
        <div className={styles.bannerInner}>
          <div>
            <h2>Free to start, Pro when you need more</h2>
            <p>
              {PRICING.free.priceLabel} gets you scanning, deadlines, and grades. Pro is{' '}
              {PRICING.pro.monthly.priceLabel} or {PRICING.pro.annual.priceLabel} for Smart Plan,
              Flashcards, Focus timer, an AI tutor, and more.
            </p>
            <div className={styles.bannerActions}>
              <Link href={APP_URL} className={styles.bannerLink}>
                Get started free
              </Link>
              <Link href="/pricing" className={styles.bannerLinkSecondary}>
                Compare Free vs Pro
              </Link>
            </div>
          </div>
          <div className={styles.bannerImage}>
            <Image
              src="/screenshots/plan-semester.png"
              alt="Semora calendar screen showing a month of colour-coded deadlines across three courses"
              width={180}
              height={389}
            />
          </div>
        </div>
      </div>
      <PageSections content={getPageContent('features')} withRail />
    </>
  );
}
