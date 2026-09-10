import type { Metadata } from 'next';
import { FeatureShowcase, type ShowcaseItem } from '@/components/FeatureShowcase';
import { enAlternates } from '@/lib/hreflang';
import { OG_IMAGE } from '@/lib/og';
import type { ComponentType } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './features.module.css';
import { Reveal } from '@/components/Reveal';
import { FlashcardIcon, TimerIcon, ChatIcon, PeopleIcon, SparkleIcon, MicIcon, WatchIcon } from '@/components/FeatureIcons';
import { FEATURES, APP_URL, PRICING } from '@/lib/semora-facts';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';
import { Breadcrumb } from '@/components/Breadcrumb';
import { JsonLd } from '@/components/JsonLd';
import { itemListSchema } from '@/lib/schema';

export const metadata: Metadata = {
  title: 'Features',
  description:
    'Everything Semora does: AI syllabus scanning, grade tracking, Smart Plan, flashcards, focus timer, AI tutor, Course Spaces, and Canvas sync.',
  alternates: enAlternates('/features'),
  openGraph: { url: '/features', ...OG_IMAGE },
};

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
      'One free AI action per account, then Pro',
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
    title: 'Import your classes from Canvas, Blackboard or Moodle',
    body: "All three are free on every plan. Canvas takes one step: copy the private Calendar Feed link Canvas already gives you, under Calendar then Calendar Feed, and paste it in. There is no access token to generate and nothing for your school to approve. Dated assignments then import on their own and stay right when an instructor moves a deadline, with reminders rescheduling themselves. The calendar feed carries dates rather than marks, so your grades stay yours to enter.",
    bullets: [
      'Connects with the private Calendar Feed link Canvas already gives you',
      'Dated assignments import automatically and stay up to date',
      'Syllabus scan or pasted assignment list if you would rather not connect Canvas',
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
  'lecture-recording': MicIcon,
  'apple-watch': WatchIcon,
  'smart-plan': SparkleIcon,
  'ai-tutor': ChatIcon,
  flashcards: FlashcardIcon,
  collaboration: PeopleIcon,
  'focus-timer': TimerIcon,
};

/**
 * Features covered by the screenshot showcase above, so they are not repeated
 * as cards below.
 */
const SHOWCASED = new Set(['syllabus-scanner', 'canvas-sync', 'grade-tracking']);

/**
 * Every feature the showcase does not cover, in FEATURES order.
 *
 * This used to be the five PRO features and nothing else, under the heading
 * "The rest of the toolkit, included with Semora Pro" — which was accurate for
 * what it showed and quietly dropped two shipped features on the floor.
 * Lecture Recording and Apple Watch are FREE, so a Pro-only grid could never
 * hold them, and the showcase above does not cover them either. The result was
 * that both appeared on this page as a chip and nowhere else, while the
 * Spanish features page has given all ten a card since launch.
 *
 * Derived from FEATURES rather than hand-listed, so a feature added to the
 * source of truth cannot go missing here again. It only needs an icon.
 */
const REMAINING = FEATURES.filter((f) => !SHOWCASED.has(f.slug) && REMAINING_ICONS[f.slug]);

export default function FeaturesPage() {
  return (
    <>
      <JsonLd
        data={itemListSchema(
          FEATURES.map((f) => ({
            name: f.name,
            path: `/features/${f.slug}`,
            description: f.shortDescription,
          })),
          { path: '/features', name: 'Semora features' },
        )}
      />
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <Breadcrumb
            align="center"
            trail={[
              { name: 'Home', path: '/' },
              { name: 'Features', path: '/features' },
            ]}
          />
          <h1 className={styles.h1}>
            Everything you need for <span className={styles.gradient}>the semester</span>
          </h1>
          <p className={styles.sub}>
            From the first syllabus scan to finals week. Start free, upgrade only if you want
            more.
          </p>
          <div className={styles.heroActions}>
            <Link href={APP_URL} className={styles.primaryBtn}>
              Try it for free
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

      <FeatureShowcase
        heading="Five ways Semora organizes your semester"
        sub="The core loop, from a syllabus photo to a grade you can trust."
        items={SHOWCASE}
      />

      <section className={styles.gridSection}>
        <div className={styles.gridHead}>
          <h2>Built for how you actually study</h2>
          <p>The rest of the toolkit. Two of these are free, the rest come with Pro.</p>
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
                  {/* Same Free/Pro badge the showcase above uses, so a reader
                      does not have to open a card to find out which side of
                      the line it sits on. */}
                  <span
                    className={`${styles.cardTier} ${
                      feature.tier === 'pro' ? styles.tierPro : styles.tierFree
                    }`}
                  >
                    {feature.tier === 'pro' ? 'Pro' : 'Free'}
                  </span>
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
              Flashcards, Focus Timer, an AI tutor, and more.
            </p>
            <div className={styles.bannerActions}>
              <Link href={APP_URL} className={styles.bannerLink}>
                Try it for free
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
