import type { Metadata } from 'next';
import styles from '@/components/Prose.module.css';
import { TierTable } from '@/components/TierTable';
import { Faq } from '@/components/Faq';
import { Cta } from '@/components/Cta';
import { JsonLd } from '@/components/JsonLd';
import { ArticleShell } from '@/components/ArticleShell';
import { faqPageSchema } from '@/lib/schema';
import { PRO_LABEL } from '@/lib/semora-facts';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';

export const metadata: Metadata = {
  title: 'Canvas Deadline Tracker App — Grades, Reminders & Study Planning',
  description:
    'Semora is a Canvas deadline tracker app. Import Canvas assignments on Pro, or scan your syllabus free — with grade tracking, reminders, and a real study plan.',
  alternates: { canonical: '/canvas-deadline-tracker' },
};

const FAQ = [
  {
    question: 'Does Semora replace Canvas?',
    answer:
      "No. Canvas remains where instructors post materials and where you submit work. Semora connects to your Canvas assignments and adds grade tracking, reminders, and (on Pro) calendar sync plus planning and study tools on top — it's an organizing layer, not a replacement for the LMS.",
  },
  {
    question: 'How do I connect Canvas to Semora?',
    answer:
      "Generate a personal access token from your own Canvas account settings and enter it into Semora. Because it uses a personal token rather than an OAuth app integration, there's no third-party review process to wait through.",
  },
  {
    question: 'Is Semora free to use alongside Canvas?',
    answer:
      'Partly. Importing assignments from Canvas is a Pro feature, but the free tier covers the syllabus side of the same job — and you can paste Canvas assignment text straight into the scanner. The free tier includes 5 syllabus scans per calendar month, up to 4 courses in one semester, full task and deadline tracking, grade tracking, and same-day reminders. Pro ($3.99/month or $19.99/year) adds unlimited courses and semesters, with no monthly scan cap, plus Smart Plan, the Workload dashboard, Grade Scale & Forecasting, Academic Risk alerts, Flashcards, Focus timer, AI tutor, custom reminder timing, calendar sync with .ics export, Progress Insights, and Share & Streaks.',
  },
  {
    question: 'Does Semora work on iPhone, iPad, and web?',
    answer:
      'Yes. Semora is available on iPhone, iPad, and the web, sharing one account and database that sync in near real time. Pro is purchased through the app and applies account-wide, including on web.',
  },
];

const TABLE_ROWS = [
  { feature: 'Syllabus scans', free: '5 per calendar month', pro: 'Unlimited' },
  { feature: 'Courses per semester', free: 'Up to 4', pro: 'Unlimited' },
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
      ctaSubheading="No OAuth wait — just a personal access token you generate yourself."
    >
    <article className={styles.prose}>
      <JsonLd data={faqPageSchema(FAQ_ALL)} />
      <p className={styles.eyebrow}>Canvas + Semora</p>

      <h1>A Canvas Deadline Tracker App That Adds Grades, Reminders, and an Actual Study Plan</h1>
      <p className={styles.lede}>
        Semora is a Canvas deadline tracker app that connects to your Canvas account with a
        personal access token and layers grade tracking, same-day reminders, and (on Pro) an
        AI-generated study schedule on top of your existing Canvas assignments — on iPhone, iPad,
        and web, kept in sync.
      </p>

      <p>
        Canvas is where your instructors post assignments. Semora sits alongside Canvas and adds
        grade tracking, same-day reminders, and — on Pro — an AI-generated study plan built from
        your actual syllabus.
      </p>

      <h2>What Semora adds on top of Canvas</h2>
      <p>Once your Canvas assignments are in Semora, you get a layer of organization Canvas doesn&apos;t provide on its own:</p>
      <ul>
        <li>
          <strong>Grade tracking</strong> — see where you stand across your courses, not just a
          list of due dates.
        </li>
        <li>
          <strong>Same-day reminders</strong> — built into every tier, so nothing quietly slips by.
        </li>
        <li>
          <strong>Calendar sync (Pro)</strong> — deadlines sync to your device calendar or export
          as an .ics file.
        </li>
        <li>
          <strong>Cross-device sync</strong> — one account, shared in near real time across the
          iPhone app, iPad, and web (via Supabase Realtime), so a deadline you check off on one
          device updates everywhere else instantly.
        </li>
        <li>
          <strong>Course Spaces</strong> — share a course with classmates through an invite link;
          shared deadlines and group assignments sync in real time.
        </li>
      </ul>
      <p>
        On Pro ($3.99/month or $19.99/year, purchased in the app and applied account-wide
        including web), Semora goes further:
      </p>
      <ul>
        <li>
          <strong>Smart Plan</strong> — an AI-generated, timed study schedule that adapts as
          deadlines move.
        </li>
        <li>
          <strong>Workload dashboard</strong> — a crunch-week and exam-density view across all your
          courses at once.
        </li>
        <li>
          <strong>Academic Risk alerts</strong> — flags for falling grades, missing work, or
          overloaded weeks, each with a recovery-step plan.
        </li>
        <li>
          <strong>Flashcards</strong> — spaced-repetition cards built from your own course material.
        </li>
        <li>
          <strong>Focus timer</strong> — a Pomodoro-style timer for study sessions.
        </li>
        <li>
          <strong>AI tutor</strong> — a chat assistant that knows the contents of your syllabus.
        </li>
        <li>
          <strong>Custom reminder timing + quiet hours</strong> — control exactly when and how
          you&apos;re notified.
        </li>
        <li>
          <strong>Progress Insights</strong> — trend charts, CSV export, and a print view on web.
        </li>
      </ul>

      <h2>How Canvas sync works</h2>
      <p>
        Semora connects to Canvas using a personal access token that you generate yourself from
        your Canvas account settings. There&apos;s no third-party OAuth approval step to wait on —
        you paste in your token and your Canvas assignments start flowing into Semora.
      </p>
      <p>
        Canvas sync covers your assignments. Semora adds a syllabus-derived view alongside it —
        surfacing office hours, the instructor&apos;s grading scale, semester start/end dates, and
        exact meeting times next to your Canvas assignments. For that, Semora reads the syllabus
        itself — as a photo (camera, multi-page, up to 5 pages), a PDF upload, a drag-and-drop file
        (web), or pasted raw text copied from a PDF or LMS page (web). Gemini AI extracts the course
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
          adds grading-scale awareness, plus — on Pro — overload detection across your courses and a
          study plan built directly from your actual syllabus.
        </li>
      </ul>
      <p>
        Semora is built specifically around a syllabus and a Canvas course, not a generic task list:
        it imports the whole structure at once — course, instructor, meeting times, grading scale,
        and every deadline — from either a syllabus or a Canvas token, then tracks grades and
        workload against that structure automatically.
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
