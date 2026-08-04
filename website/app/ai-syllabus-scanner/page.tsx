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
  title: 'AI Syllabus Scanner: Turn a Syllabus Photo into a Semester Calendar',
  description:
    'Semora is an AI syllabus scanner that automatically turns a syllabus photo or PDF into a full calendar of deadlines, grades, and class times.',
  alternates: { canonical: '/ai-syllabus-scanner' },
};

const FAQ = [
  {
    question: "What file types can Semora's AI syllabus scanner read?",
    answer:
      "Semora accepts a photo taken with your phone or tablet's camera (up to 5 pages in one scan), an uploaded PDF, a drag-and-dropped file on the web app, or raw text pasted from a PDF or your school's LMS page.",
  },
  {
    question: 'How many syllabi can I scan for free?',
    answer:
      'The free tier includes 5 syllabus scans per calendar month and supports up to 4 courses in one semester, with full task tracking and grade tracking included. Calendar sync (device + .ics export) is a Pro feature.',
  },
  {
    question: 'Does Semora sync with Canvas?',
    answer:
      'Yes. You connect Canvas by generating a personal access token yourself inside Canvas — Semora does not require a separate OAuth app approval for this to work.',
  },
  {
    question: 'Does scanning a syllabus also track my grades, not just deadlines?',
    answer:
      'Yes. Along with every assignment and exam due date, Semora extracts the grading scale from the syllabus so grade tracking is available from the same scan, on both the free and Pro tiers.',
  },
];

const TABLE_ROWS = [
  { feature: 'Syllabus scans', free: '5 per calendar month', pro: 'Unlimited' },
  { feature: 'Courses per semester', free: 'Up to 4', pro: 'Unlimited' },
  { feature: 'Task & deadline tracking', free: 'Full', pro: 'Full' },
  { feature: 'Grade tracking', free: 'Included', pro: 'Included' },
  { feature: 'Reminders', free: 'Same-day', pro: 'Custom timing (1-day / 3-day)' },
  { feature: 'Calendar (device sync + .ics export)', free: '—', pro: 'Included', proOnly: true },
  { feature: 'Smart Plan (AI study schedule)', free: '—', pro: 'Included', proOnly: true },
  { feature: 'Workload dashboard (crunch-week view)', free: '—', pro: 'Included', proOnly: true },
  { feature: 'Flashcards (spaced repetition)', free: '—', pro: 'Included', proOnly: true },
  { feature: 'Focus timer (Pomodoro)', free: '—', pro: 'Included', proOnly: true },
  { feature: 'AI tutor (chats with your syllabus)', free: '—', pro: 'Included', proOnly: true },
  { feature: 'Grade Scale & Forecasting (what-if calculators)', free: '—', pro: 'Included', proOnly: true },
  { feature: 'Academic Risk alerts + recovery plan', free: '—', pro: 'Included', proOnly: true },
  { feature: 'Progress Insights (trend charts, CSV export)', free: '—', pro: 'Included', proOnly: true },
  { feature: 'Share & Streaks', free: '—', pro: 'Included', proOnly: true },
];


// The long-form body adds more questions; merge them so the page renders one
// list and emits a single FAQPage block rather than two.
const FAQ_ALL = [...FAQ, ...(getPageContent('ai-syllabus-scanner')?.faq ?? [])];

export default function AiSyllabusScannerPage() {
  return (
    <ArticleShell
      ctaHeading="Scan your first syllabus free"
      ctaSubheading="Photo, PDF, or pasted text — see your semester organized in one snap."
    >
    <article className={styles.prose}>
      <JsonLd data={faqPageSchema(FAQ_ALL)} />

      <h1>AI Syllabus Scanner: Turn a Syllabus Photo into a Full Semester Calendar</h1>
      <p className={styles.lede}>
        <strong>Semora is an AI syllabus scanner</strong> — an app for iPhone, iPad, and web that reads a
        photo, PDF, or pasted text of your syllabus and automatically builds a calendar of every
        class meeting, assignment, and exam deadline for the semester.
      </p>

      <h2>What Is an AI Syllabus Scanner?</h2>
      <p>
        An AI syllabus scanner is a tool that reads the unstructured text of a course syllabus — a
        PDF, a scanned page, a photo — and converts it into structured, usable data: a class
        schedule, a grading breakdown, and a list of every due date. Instead of manually retyping
        deadlines from a 10-page syllabus PDF into a planner one by one, the syllabus is scanned
        once and the important dates come out organized and ready to use.
      </p>
      <p>
        Semora applies this to a student&apos;s course syllabus, using Gemini AI to read the
        document and extract the details that actually affect a student&apos;s semester.
      </p>

      <h2>How Semora Scans a Syllabus</h2>
      <ol className={styles.steps}>
        <li>
          <strong>Capture the syllabus.</strong> Take a photo with your phone or tablet&apos;s camera (multi-page
          capture supported, up to 5 pages), upload a PDF, drag and drop a file on the web app, or
          paste raw text copied from a PDF or your school&apos;s LMS page.
        </li>
        <li>
          <strong>AI reads and extracts.</strong> Semora&apos;s AI reads the document and pulls out
          the course name, instructor, meeting times, office hours, semester start/end dates, the
          grading scale, and every assignment, exam, quiz, project, and reading with its due date.
        </li>
        <li>
          <strong>Your semester is organized automatically.</strong> The extracted schedule and
          deadlines populate your calendar and task list immediately — no manual data entry
          required.
        </li>
      </ol>

      <h2>What Gets Extracted From Every Syllabus</h2>
      <p>A single scan is designed to capture everything relevant to planning a semester:</p>
      <ul>
        <li>Course name and instructor</li>
        <li>Class meeting times and office hours</li>
        <li>Semester start and end dates</li>
        <li>Grading scale / grade weighting</li>
        <li>Every assignment, exam, quiz, project, and reading, each with its due date</li>
      </ul>

      <h2>Free to Start, With a Pro Tier for Heavier Course Loads</h2>
      <p>
        Semora&apos;s core scanning and organizing features are usable for free. Pro unlocks
        planning tools built on top of the same scanned data, for students juggling more courses or
        more deadlines.
      </p>
      <TierTable rows={TABLE_ROWS} proLabel={PRO_LABEL} />
      <p className={styles.note}>
        Pro is a subscription purchased and managed in the app, and it applies account-wide,
        including on the web.
      </p>

      <h2>Beyond the Scan: Canvas Sync and Shared Courses</h2>
      <h3>Canvas LMS Sync</h3>
      <p>
        If your school uses Canvas, you can connect it directly by generating a personal access
        token yourself inside Canvas — no institutional app approval required.
      </p>
      <h3>Course Collaboration (&quot;Course Spaces&quot;)</h3>
      <p>
        A scanned course can be shared with classmates via an invite link. Shared deadlines and
        group assignments sync in real time for everyone in the space.
      </p>
      <h3>One Account, Every Device</h3>
      <p>
        Web, iPhone, and iPad share a single account and database, so an edit made on one device —
        checking off a task, adjusting a due date — appears on the other in near real time.
      </p>

      <h2>How This Compares to Doing It Manually — or With a Generic To-Do App</h2>
      <p>
        The alternative to an AI syllabus scanner is retyping a syllabus by hand, or using a
        general-purpose to-do app that has no idea what a syllabus even is:
      </p>
      <ul>
        <li>
          <strong>Manual entry:</strong> a student opens a 10-page syllabus PDF and copies each due
          date, one at a time, into a planner or phone calendar — a process that has to be repeated
          separately for every course, every semester.
        </li>
        <li>
          <strong>Generic to-do apps:</strong> tools like a plain reminders or task app can hold
          dates once you&apos;ve entered them, but they don&apos;t read a syllabus at all — every
          assignment, exam, and reading still has to be typed in by hand, and there&apos;s no
          syllabus-aware structure like grading weights, office hours, or per-course grouping.
        </li>
        <li>
          <strong>Semora:</strong> the syllabus is scanned once, and the course schedule, grading
          scale, and every deadline are extracted automatically — turning a document that would
          take real time to transcribe into an organized semester in one snap.
        </li>
      </ul>

      <h2>Frequently Asked Questions</h2>
      <Faq items={FAQ_ALL} />

      <PageSections content={getPageContent('ai-syllabus-scanner')} emitFaq={false} />
      <Cta
        heading="Scan your first syllabus and see your semester organized in one snap"
      />
    </article>
    </ArticleShell>
  );
}
