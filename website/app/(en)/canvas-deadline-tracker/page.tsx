import type { Metadata } from 'next';
import { enAlternates } from '@/lib/hreflang';
import styles from '@/components/Prose.module.css';
import { TierTable } from '@/components/TierTable';
import { Faq } from '@/components/Faq';
import { Cta } from '@/components/Cta';
import { JsonLd } from '@/components/JsonLd';
import { ArticleShell } from '@/components/ArticleShell';
import { Breadcrumb } from '@/components/Breadcrumb';
import { faqPageSchema } from '@/lib/schema';
import { PRO_LABEL } from '@/lib/semora-facts';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';

export const metadata: Metadata = {
  title: 'Canvas Deadline Tracker: Grades and Reminders',
  description:
    'Semora is a Canvas deadline tracker app. Import Canvas assignments on Pro, or scan your syllabus free, with grade tracking, reminders, and a real study plan.',
  alternates: enAlternates('/canvas-deadline-tracker'),
};

const FAQ = [
  {
    question: 'Does Semora replace Canvas?',
    answer:
      "No. Canvas remains where instructors post materials and where you submit work. Semora connects to your Canvas assignments and adds grade tracking, reminders, and (on Pro) calendar sync plus planning and study tools on top. It's an organizing layer, not a replacement for the LMS.",
  },
  {
    question: 'How do I connect Canvas to Semora?',
    answer:
      "Canvas import is a Pro feature. The current connector uses a personal access token generated in Canvas. Some institutions disable or prohibit third-party token use, so confirm your school's policy. If it is unavailable or not permitted, scan your syllabus or paste the Canvas assignment list into Semora instead.",
  },
  {
    question: 'Is Semora free to use alongside Canvas?',
    answer:
      'Partly. Importing assignments from Canvas is a Pro feature, but the free tier covers the syllabus side of the same job, and you can paste Canvas assignment text straight into the scanner. The free tier includes 5 syllabus scans per calendar month, up to 4 courses within one semester, one semester total, full task and deadline tracking, grade tracking, and reminders 3 days, 1 day and the morning before each deadline. Pro ($3.99/month or $19.99/year) adds unlimited courses and semesters, with no monthly scan cap, plus Smart Plan, the Workload dashboard, Grade Scale & Forecasting, Academic Risk alerts, Flashcards, Focus timer, AI tutor, per-task custom reminder timing and quiet hours, calendar sync with .ics export, Progress Insights, and Share & Streaks.',
  },
  {
    question: 'Does Semora work on iPhone, iPad, and web?',
    answer:
      'Yes. Semora is available on iPhone, iPad, and the web, sharing one account and database that sync in near real time. Pro is purchased through the app and applies account-wide, including on web.',
  },
];

const TABLE_ROWS = [
  { feature: 'Syllabus scans', free: '5 per calendar month', pro: 'Unlimited' },
  { feature: 'Courses', free: 'Up to 4 within one semester', pro: 'Unlimited' },
  { feature: 'Semesters', free: '1 total', pro: 'Unlimited' },
  { feature: 'Task & deadline tracking', free: 'Full', pro: 'Full' },
  { feature: 'Grade tracking', free: 'Included', pro: 'Included' },
  { feature: 'Same-day reminders', free: 'Included', pro: 'Included' },
  { feature: 'Calendar sync (device + .ics export)', free: '—', pro: 'Included', proOnly: true },
  {
    feature: 'Custom reminder timing + quiet hours',
    free: '—',
    pro: 'Included',
    proOnly: true,
  },
  { feature: 'Smart Plan (AI study schedule)', free: '—', pro: 'Included', proOnly: true },
  { feature: 'Workload dashboard', free: '—', pro: 'Included', proOnly: true },
  { feature: 'Grade Scale & Forecasting', free: '—', pro: 'Included', proOnly: true },
  { feature: 'Academic Risk alerts', free: '—', pro: 'Included', proOnly: true },
  { feature: 'Flashcards, Focus timer, AI tutor', free: '—', pro: 'Included', proOnly: true },
  {
    feature: 'Progress Insights (charts, CSV, print)',
    free: '—',
    pro: 'Included',
    proOnly: true,
  },
  { feature: 'Share & Streaks', free: '—', pro: 'Included', proOnly: true },
];


// The long-form body adds more questions; merge them so the page renders one
// list and emits a single FAQPage block rather than two.
const FAQ_ALL = [...FAQ, ...(getPageContent('canvas-deadline-tracker')?.faq ?? [])];

export default function CanvasDeadlineTrackerPage() {
  return (
    <ArticleShell
      ctaHeading="Bring Canvas into one view"
      ctaSubheading="Canvas import on Pro, with a syllabus-scan fallback."
    >
    <article className={styles.prose}>
      <JsonLd data={faqPageSchema(FAQ_ALL)} />
      <Breadcrumb
        trail={[
          { name: 'Home', path: '/' },
          { name: 'Canvas Deadline Tracker', path: '/canvas-deadline-tracker' },
        ]}
      />
      <p className={styles.eyebrow}>Canvas + Semora</p>

      <h1>A Canvas Deadline Tracker App That Adds Grades, Reminders, and an Actual Study Plan</h1>
      <p className={styles.lede}>
        Semora is a Canvas deadline tracker app with a token-based Canvas connector on Pro. Some
        institutions disable or prohibit third-party token use, so confirm your school&apos;s policy.
        Semora layers grade tracking, advance reminders, and an AI-generated study schedule on top
        of your assignments across iPhone, iPad, and web.
      </p>

      <p>
        Canvas is where your instructors post assignments. Semora sits alongside Canvas and adds
        grade tracking, advance reminders, and, on Pro, an AI-generated study plan built from
        your actual syllabus.
      </p>

      <h2>What Semora adds on top of Canvas</h2>
      <p>Once your Canvas assignments are in Semora, you get a layer of organization Canvas doesn&apos;t provide on its own:</p>
      <ul>
        <li>
          <strong>Grade tracking:</strong> see where you stand across your courses, not just a
          list of due dates.
        </li>
        <li>
          <strong>Same-day reminders:</strong> built into every tier, so nothing quietly slips by.
        </li>
        <li>
          <strong>Calendar sync (Pro):</strong> deadlines sync to your device calendar or export
          as an .ics file.
        </li>
        <li>
          <strong>Cross-device sync</strong>, one account, shared in near real time across the
          iPhone app, iPad, and web (via Supabase Realtime), so a deadline you check off on one
          device updates everywhere else instantly.
        </li>
        <li>
          <strong>Course Spaces:</strong> share a course with classmates through an invite link;
          shared deadlines and group assignments sync in real time.
        </li>
      </ul>
      <p>
        On Pro ($3.99/month or $19.99/year, purchased in the app and applied account-wide
        including web), Semora goes further:
      </p>
      <ul>
        <li>
          <strong>Smart Plan:</strong> an AI-generated, timed study schedule that adapts as
          deadlines move.
        </li>
        <li>
          <strong>Workload dashboard:</strong> a crunch-week and exam-density view across all your
          courses at once.
        </li>
        <li>
          <strong>Academic Risk alerts:</strong> flags for falling grades, missing work, or
          overloaded weeks, each with a recovery-step plan.
        </li>
        <li>
          <strong>Flashcards:</strong> spaced-repetition cards built from your own course material.
        </li>
        <li>
          <strong>Focus timer:</strong> a Pomodoro-style timer for study sessions.
        </li>
        <li>
          <strong>AI tutor:</strong> a chat assistant that knows the contents of your syllabus.
        </li>
        <li>
          <strong>Custom reminder timing + quiet hours:</strong> control exactly when and how
          you&apos;re notified.
        </li>
        <li>
          <strong>Progress Insights:</strong> trend charts, CSV export, and a print view on web.
        </li>
      </ul>

      <h2>How Canvas sync works</h2>
      <p>
        Canvas import is part of Pro. The current connector uses a personal access token generated
        in Canvas. Some institutions disable or prohibit third-party token use, so confirm your
        school&apos;s policy before connecting. When it is permitted, you can choose courses and bring
        their assignments into Semora. Otherwise, scan the syllabus or paste the Canvas assignment
        list into the scanner.
      </p>
      <p>
        Canvas sync covers your assignments. Semora adds a syllabus-derived view alongside it,
        surfacing office hours, the instructor&apos;s grading scale, semester start/end dates, and
        exact meeting times next to your Canvas assignments. For that, Semora reads the syllabus
        itself: a photo (camera, multi-page, up to 5 pages), a PDF upload, a drag-and-drop file
        (web), or pasted raw text copied from a PDF or LMS page (web). OpenAI GPT-5.6 Luna extracts the course
        name, instructor, meeting times, office hours, semester dates, grading scale, and every
        assignment, exam, quiz, project, and reading with its due date. Used together, Canvas sync
        and syllabus import give you a fuller picture than either source alone.
      </p>

      <h2>Free vs. Pro</h2>
      <TierTable rows={TABLE_ROWS} caption="What's included at each tier" proLabel={PRO_LABEL} />
      <p className={styles.note}>
        Pro is $3.99/month or $19.99/year, purchased in the app. It applies to your whole
        account, including web.
      </p>

      <h2>How this compares to doing it manually or with a generic to-do app</h2>
      <p>Most students land on one of two workarounds before trying a dedicated tool:</p>
      <ul>
        <li>
          <strong>Manually copying Canvas into a calendar or planner.</strong> Each assignment has
          to be entered by hand, one at a time, and grade weighting, office hours, and exam density
          across courses aren&apos;t captured anywhere.
        </li>
        <li>
          <strong>Using a generic to-do app.</strong> A plain to-do list can hold a due date and a
          checkbox, but it isn&apos;t built around a grading scale or a semester structure. Semora
          adds grading-scale awareness, plus, on Pro, overload detection across your courses and a
          study plan built directly from your actual syllabus.
        </li>
      </ul>
      <p>
        Semora is built specifically around a syllabus and a Canvas course, not a generic task list:
        it imports the whole structure at once (course, instructor, meeting times, grading scale,
        and every deadline) from either a syllabus or the token-based Canvas connector when permitted,
        then tracks grades and workload against that structure automatically.
      </p>

      <h2>FAQ</h2>
      <Faq items={FAQ_ALL} />

      <PageSections content={getPageContent('canvas-deadline-tracker')} emitFaq={false} />
      <Cta
        heading="Bring your Canvas assignments into one organized view"
        subheading="Deadlines, grades, and reminders together."
      />
    </article>
    </ArticleShell>
  );
}
