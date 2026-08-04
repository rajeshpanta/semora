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
  title: 'AI Study Planner for College Students',
  description:
    'Semora is an AI study planner for college students: scan your syllabus and get tracked deadlines, calculated grades, and an adaptive study schedule.',
  alternates: { canonical: '/ai-study-planner-for-college' },
};

const FAQ = [
  {
    question: 'What does an AI study planner actually do?',
    answer:
      "An AI study planner reads your source material — in Semora's case, a course syllabus, and automatically builds the deadlines, grade categories, and schedule that you'd otherwise have to enter manually, then can generate a study schedule from that information.",
  },
  {
    question: 'How does Semora create my study schedule from a syllabus?',
    answer:
      'You import the syllabus by photo, PDF, drag-and-drop, or pasted text. Gemini AI extracts the course details and every assignment, exam, and reading with its due date. On Pro, Smart Plan then generates a timed study schedule from those deadlines and adapts it as dates change.',
  },
  {
    question: "Is Semora free, and what's included in Pro?",
    answer:
      "Semora's free tier includes 5 syllabus scans per calendar month, up to 4 courses in one semester, full deadline and grade tracking, and same-day reminders. Pro ($3.99/month or $19.99/year) adds unlimited courses and semesters, with no monthly scan cap,, Smart Plan, the Workload dashboard, Grade Scale & Forecasting, calendar sync with .ics export, Flashcards, a Focus timer, an AI tutor, Academic Risk alerts, Progress Insights, and Share & Streaks.",
  },
  {
    question: 'Does Semora sync with Canvas or other tools?',
    answer:
      "Semora connects to Canvas LMS using a personal access token you generate yourself in Canvas, so there's no OAuth app-review wait. Semora also supports course collaboration through Course Spaces, where classmates share deadlines and group assignments via an invite link, and it syncs across iPhone, iPad, and web on one account.",
  },
];

const TABLE_ROWS = [
  { feature: 'Syllabus scans', free: '5 per calendar month', pro: 'Unlimited' },
  { feature: 'Courses per semester', free: 'Up to 4', pro: 'Unlimited' },
  { feature: 'Task, deadline & grade tracking', free: 'Included', pro: 'Included' },
  { feature: 'Reminders', free: 'Same-day reminders', pro: 'Custom timing + quiet hours' },
  { feature: 'Calendar sync + .ics export', free: '—', pro: 'Included', proOnly: true },
  { feature: 'Smart Plan', free: '—', pro: 'AI-generated, adapts to deadlines', proOnly: true },
  {
    feature: 'Workload dashboard',
    free: '—',
    pro: 'Crunch-week / exam-density view',
    proOnly: true,
  },
  {
    feature: 'Grade Scale & Forecasting',
    free: '—',
    pro: 'Custom grading scale + what-if calculators',
    proOnly: true,
  },
  {
    feature: 'Flashcards',
    free: '—',
    pro: 'Spaced repetition, built from your material',
    proOnly: true,
  },
  { feature: 'Focus timer', free: '—', pro: 'Pomodoro-style timer', proOnly: true },
  { feature: 'AI tutor', free: '—', pro: 'Chat that knows your syllabus', proOnly: true },
  {
    feature: 'Academic Risk alerts',
    free: '—',
    pro: 'Falling grades / missing work / overloaded weeks, with a recovery-step plan',
    proOnly: true,
  },
  {
    feature: 'Progress Insights',
    free: '—',
    pro: 'Trend charts, CSV export, print view (web)',
    proOnly: true,
  },
  { feature: 'Share & Streaks', free: '—', pro: 'Share a course, referral rewards', proOnly: true },
];


// The long-form body adds more questions; merge them so the page renders one
// list and emits a single FAQPage block rather than two.
const FAQ_ALL = [...FAQ, ...(getPageContent('ai-study-planner-for-college')?.faq ?? [])];

export default function AiStudyPlannerPage() {
  return (
    <ArticleShell
      ctaHeading="Build your study plan free"
      ctaSubheading="Scan a syllabus and let Smart Plan map out your semester."
    >
    <article className={styles.prose}>
      <JsonLd data={faqPageSchema(FAQ_ALL)} />
      <p className={styles.eyebrow}>Semora</p>

      <h1>An AI Study Planner for College Students, Built From Your Syllabus</h1>
      <p className={styles.lede}>
        Semora is an AI study planner for college students that scans a course syllabus and turns
        it into a complete semester system: tracked deadlines, calculated grades, and an adaptive
        study schedule that adjusts automatically as due dates change.
      </p>

      <h2>How Semora builds your plan</h2>
      <p>
        Instead of manually copying dates out of a PDF, you give Semora the syllabus itself and it
        does the reading.
      </p>
      <ol className={styles.steps}>
        <li>
          <strong>Import the syllabus.</strong> Take a photo (multi-page, up to 5 pages), upload a
          PDF, drag a file onto the web app, or paste raw text copied from a PDF or your
          school&apos;s LMS page.
        </li>
        <li>
          <strong>AI extraction.</strong> Semora uses Gemini AI to read the document and pull out
          the course name, instructor, meeting times, office hours, semester dates, grading scale,
          and every assignment, exam, quiz, project, and reading along with its due date.
        </li>
        <li>
          <strong>The semester is assembled automatically.</strong> Deadlines populate your
          calendar, grade categories populate your grade tracker, and class meeting times populate
          your schedule, without you typing in a single date by hand.
        </li>
      </ol>

      <h2>The complete planning system</h2>
      <p>
        Extracting the dates is the starting point. The planning system is what turns those dates
        into a schedule you can actually follow.
      </p>

      <h3>Smart Plan</h3>
      <p>
        Smart Plan (Pro) is an AI-generated, timed study schedule built from your actual deadlines.
        As due dates get added, moved, or completed, the plan adapts rather than staying static.
      </p>

      <h3>Workload dashboard</h3>
      <p>
        The Workload dashboard (Pro) gives you a crunch-week and exam-density view across all of
        your courses at once, so you can see which weeks are overloaded before you&apos;re in the
        middle of them.
      </p>

      <h3>Deadline and grade tracking</h3>
      <p>
        Full task and deadline tracking, plus grade tracking, are included on the free tier along
        with same-day reminders. Calendar sync (device + .ics export) is a Pro feature.
      </p>

      <h3>Canvas sync</h3>
      <p>
        If your school uses Canvas, you can connect it using a personal access token you generate
        yourself inside Canvas — no OAuth app-review process to wait on.
      </p>

      <h3>Course Spaces (collaboration)</h3>
      <p>
        You can share a course with classmates through an invite link. Shared deadlines and group
        assignments then sync in real time for everyone in that Course Space.
      </p>

      <h3>Cross-device sync</h3>
      <p>
        Semora on iPhone, iPad, and the web share one account and one database, so edits made on
        any device sync in near real time.
      </p>

      <h2>What&apos;s free vs. what&apos;s in Pro</h2>
      <TierTable rows={TABLE_ROWS} caption="Semora plan comparison" proLabel={PRO_LABEL} />
      <p className={styles.note}>
        Pro is purchased in the app and applies account-wide, including on the web. On web,
        Pro entitlement is read and refreshed rather than purchased directly.
      </p>

      <h2>How this compares to planning it yourself</h2>
      <p>
        Most college students currently manage a syllabus one of two ways: a paper planner or
        spreadsheet, or a generic to-do app like a reminders list. Both work, but both put the labor
        of building the plan on the student.
      </p>
      <ul>
        <li>
          <strong>A paper planner or spreadsheet</strong> requires copying every date out of every
          syllabus by hand, and if a professor moves a due date, you have to notice it and re-copy
          it yourself.
        </li>
        <li>
          <strong>A generic to-do app</strong> can hold tasks, but it doesn&apos;t know your
          syllabus — you still type in each assignment individually, and it has no concept of study
          time, workload density across courses, or grading weight.
        </li>
        <li>
          <strong>Semora</strong> reads the syllabus for you, so the task list, calendar, and grade
          tracker start populated on day one. On Pro, Smart Plan turns that task list into scheduled
          study sessions, and the Workload dashboard shows you which weeks across all your courses
          are getting overloaded — visibility a plain checklist doesn&apos;t give you.
        </li>
      </ul>

      <h2>Frequently asked questions</h2>
      <Faq items={FAQ_ALL} />

      <PageSections content={getPageContent('ai-study-planner-for-college')} emitFaq={false} />
      <Cta
        heading="Get your semester organized in one snap"
        subheading="Scan a syllabus and see your deadlines, grades, and schedule laid out automatically."
      />
    </article>
    </ArticleShell>
  );
}
