import type { Metadata } from 'next';
import Link from 'next/link';
import { enAlternates } from '@/lib/hreflang';
import styles from '@/components/Prose.module.css';
import { Faq } from '@/components/Faq';
import { JsonLd } from '@/components/JsonLd';
import { ArticleShell } from '@/components/ArticleShell';
import { Breadcrumb } from '@/components/Breadcrumb';
import { ProductWalkthrough } from '@/components/ProductWalkthrough';
import { RelatedLinks } from '@/components/RelatedLinks';
import { faqPageSchema } from '@/lib/schema';
import { PRICING } from '@/lib/semora-facts';

export const metadata: Metadata = {
  title: 'AI Syllabus Scanner: Photo or PDF to Calendar',
  description: 'Turn a syllabus photo, PDF or pasted text into deadlines you can review and save. Try Semora’s AI syllabus scanner free on iPhone, iPad and web.',
  alternates: enAlternates('/ai-syllabus-scanner'),
};

const FAQ = [
  { question: 'What is an AI syllabus scanner?', answer: 'It reads a course syllabus and extracts information such as assignments, exam dates, class times and grading rules. Semora lets you review the extracted deadlines before saving them to your task list and calendar.' },
  { question: 'Can I scan a syllabus for free?', answer: 'Yes, if you have not used your free AI action. Free accounts get one AI action for the life of the account: a syllabus scan, a lecture recording, or a document turned into notes. The allowance does not reset each month. Free also includes one semester, one course you add yourself, unlimited Canvas-synced classes, deadline tracking and grade tracking.' },
  { question: 'Can I turn my syllabus into Google Calendar events?', answer: 'On Pro, export your semester as an .ics file and import it into a calendar that supports that format, including Google Calendar. Semora’s own calendar is available in the app. Exporting an .ics file is not a live Google Calendar connection; later edits require another export or a manual update.' },
  { question: 'What happens when a syllabus says “date to be announced”?', answer: 'An assignment without a date needs your attention during review. Do not invent a deadline just to fill the calendar. Confirm it with your instructor and add it when it is announced. Check uncertain dates and grading rules before relying on the extracted information.' },
  { question: 'Should I scan my syllabus or connect Canvas?', answer: 'Use the syllabus for the semester outline, grading rules and dates announced before assignments appear in Canvas. Connect Canvas for dated coursework published in its Calendar Feed and later updates. If you use both, check for repeated assignments before saving or editing your plan.' },
];

export default function AiSyllabusScannerPage() {
  return (
    <ArticleShell ctaHeading="Try your first syllabus scan" ctaSubheading="One free AI action per account. Review the dates before saving.">
      <article className={`${styles.prose} article-body`}>
        <JsonLd data={faqPageSchema(FAQ)} />
        <Breadcrumb trail={[{ name: 'Home', path: '/' }, { name: 'AI Syllabus Scanner', path: '/ai-syllabus-scanner' }]} />
        <h1>AI Syllabus Scanner: Turn Your Syllabus into a Semester Calendar</h1>
        <p>Stop copying every due date by hand. Semora reads your syllabus photo, PDF or pasted text and helps you build a semester of deadlines, class times and grading information. You review the extracted deadlines before saving them.</p>
        <ProductWalkthrough />

        <h2>See what to check in a sample syllabus</h2>
        <p>In this fictional biology course, the syllabus lists a lab report due September 18, a quiz on September 24, and a midterm on October 22. A second lab report has no date yet. A useful review keeps that last item undated until the instructor announces it.</p>
        <p>The syllabus also says lab reports are worth 30% of the course grade. That is the weight of the category, not automatically the weight of each lab report. Check that distinction when setting up your grades.</p>
        <p><a href="/samples/sample-syllabus.txt" download>Download the fictional sample syllabus (.txt)</a> to inspect it yourself. You can paste it into the web scanner if you want to try the workflow; doing so uses your AI allowance, just like scanning your own syllabus. This is an example to explore, not a measured accuracy claim.</p>

        <h2>What your syllabus can tell you</h2>
        <ul>
          <li><strong>What is due:</strong> assignments, quizzes, exams, projects and readings with the dates given in the document.</li>
          <li><strong>When class meets:</strong> meeting times, term dates and office hours when they are included.</li>
          <li><strong>How grades work:</strong> the grading scale and weights written in your syllabus.</li>
        </ul>
        <p>Photos can be blurry, schedules can change, and some documents omit dates entirely. Check the result against the source. Your instructor and official course materials remain the authority.</p>
        <p>For supported inputs, multi-page limits and what happens when you scan a revised syllabus, see the <Link href="/features/syllabus-scanner">syllabus scanner workflow and limits</Link>.</p>

        <h2>What is free, and when you need Pro</h2>
        <p>Your first AI action is free for the life of your account. You can use it for a syllabus scan, a lecture recording or document-to-notes. Free includes one semester, one course you add yourself, unlimited Canvas-synced classes, deadlines and grade tracking. The AI allowance is shared across those three actions.</p>
        <p>Pro is {PRICING.pro.monthly.priceLabel} or {PRICING.pro.annual.priceLabel}. It adds ongoing AI use subject to fair-use limits, more courses and semesters, study planning, and calendar export. See <Link href="/pricing">the full Free and Pro comparison</Link> before choosing a plan.</p>

        <h2>Choose your starting point</h2>
        <p>If most of your deadlines are already in Canvas, <Link href="/canvas-deadline-tracker">connect Canvas free</Link> and use the syllabus to fill in the semester outline. If you prefer to enter dates manually, our <Link href="/blog/syllabus-to-semester-calendar">syllabus-to-calendar guide</Link> walks through the same checks without an AI tool.</p>
        <h2>Frequently asked questions</h2>
        <Faq items={FAQ} />
        <RelatedLinks links={[
          { href: '/blog/first-two-weeks-of-semester', label: 'What to set up in the first two weeks of the semester' },
          { href: '/blog/what-assignment-weights-mean', label: 'How assignment weights affect your grade' },
          { href: '/features/syllabus-scanner', label: 'Scanner file inputs, review steps and limitations' },
        ]} />
      </article>
    </ArticleShell>
  );
}
