import type { Metadata } from 'next';
import Link from 'next/link';
import { enAlternates } from '@/lib/hreflang';
import { OG_IMAGE } from '@/lib/og';
import styles from '@/components/Prose.module.css';
import { Faq } from '@/components/Faq';
import { JsonLd } from '@/components/JsonLd';
import { ArticleShell } from '@/components/ArticleShell';
import { Breadcrumb } from '@/components/Breadcrumb';
import { ProductWalkthrough } from '@/components/ProductWalkthrough';
import { RelatedLinks } from '@/components/RelatedLinks';
import { faqPageSchema } from '@/lib/schema';

export const metadata: Metadata = {
  title: 'Free Canvas Deadline Tracker for College Students',
  description: 'Connect Canvas free to see assignments across your classes in Semora. Track deadlines, plan your week and check changes on iPhone, iPad and web.',
  alternates: enAlternates('/canvas-deadline-tracker'),
  openGraph: { url: '/canvas-deadline-tracker', ...OG_IMAGE },
};

const FAQ = [
  { question: 'Is the Canvas deadline tracker free?', answer: 'Connecting Canvas and importing synced classes is free. Free includes one semester, one course you add yourself, deadline tracking, grade tracking and same-day reminders. Synced classes do not count toward the manual-course limit. Pro adds study planning, earlier reminder options and calendar export.' },
  { question: 'Do I need a Canvas access token?', answer: 'No. Copy your private Calendar Feed link from Canvas and paste it into Semora. Keep that link private. If the feed is unavailable or your institution does not permit its use, you can enter assignments manually or use your syllabus instead.' },
  { question: 'Does the Calendar Feed include my grades?', answer: 'The feed provides dated calendar items; it is not a full gradebook. Use Semora’s grade tracking with the scores and weights you enter, and refer to Canvas or your instructor for official grades.' },
  { question: 'Will a deadline change appear immediately?', answer: 'Updates depend on what Canvas publishes in the feed and when Semora next syncs. Check the last sync time and use the sync control when needed. For a recent announcement or an urgent deadline, confirm the date in Canvas itself.' },
  { question: 'Can I submit assignments through Semora?', answer: 'No. Submit work, read instructor announcements and check official course records in Canvas. Semora helps you organize and plan around that coursework.' },
];

export default function CanvasDeadlineTrackerPage() {
  return (
    <ArticleShell ctaHeading="Connect Canvas free" ctaSubheading="Bring dated coursework together and see what is coming up.">
      <article className={`${styles.prose} article-body`}>
        <JsonLd data={faqPageSchema(FAQ)} />
        <Breadcrumb trail={[{ name: 'Home', path: '/' }, { name: 'Canvas Deadline Tracker', path: '/canvas-deadline-tracker' }]} />
        <h1>A Free Canvas Deadline Tracker for Your College Classes</h1>
        <p>See upcoming coursework across your classes without copying each due date by hand. Semora connects to your Canvas Calendar Feed and brings dated items into one place on iPhone, iPad and the web. Pro adds a study plan and earlier reminder options.</p>
        <ProductWalkthrough kind="canvas" />

        <h2>Turn a list of due dates into a weekly routine</h2>
        <ol>
          <li><strong>Check the week ahead.</strong> Look across your courses for exams and assignments that land close together.</li>
          <li><strong>Confirm anything that changed.</strong> Check the last sync time. An instructor’s new announcement may reach you before the feed updates.</li>
          <li><strong>Decide when to start.</strong> Put study time before the due date, especially for a project that needs several sessions. Pro’s Smart Plan helps schedule that work.</li>
          <li><strong>Submit in Canvas.</strong> Completing a task in your planner does not submit the assignment to your instructor.</li>
        </ol>
        <p>For setup details and what each sync can update, read <Link href="/features/canvas-sync">how to connect Canvas and check sync status</Link>. For alert settings, see <Link href="/blog/canvas-deadline-reminders">Canvas deadline reminders explained</Link>.</p>

        <h2>Know what the feed includes</h2>
        <p>A calendar connection can only import what Canvas publishes in that feed. An undated assignment, unpublished item or deadline mentioned only in an announcement may not appear. It does not provide the full gradebook, grading weights or every detail of your syllabus.</p>
        <p>Use the <Link href="/ai-syllabus-scanner">syllabus scanner</Link> when you need the term outline, class meeting times or grading rules. Review overlapping assignments if you use both sources. Your instructor’s course page remains the place to confirm official dates and grades.</p>

        <h2>What you can do free</h2>
        <p>Connect Canvas, bring in synced classes and track deadlines within one semester. Free also includes one course you add yourself, grade tracking, same-day reminders and one AI action for the life of the account. Canvas connection does not spend that AI action.</p>
        <p>Pro adds more semesters and manually added courses, Smart Plan, earlier reminder options and calendar export. Reminder behavior differs between iOS and the web; an open browser tab should not be your only deadline reminder. <Link href="/pricing">Compare the plans</Link> for the full breakdown.</p>
        <h2>Frequently asked questions</h2>
        <Faq items={FAQ} />
        <RelatedLinks links={[
          { href: '/features/canvas-sync', label: 'Canvas connection, updates and sync limitations' },
          { href: '/blog/first-two-weeks-of-semester', label: 'Set up your semester before deadlines pile up' },
          { href: '/blog/how-to-study-for-midterms', label: 'Plan study time when several midterms land together' },
        ]} />
      </article>
    </ArticleShell>
  );
}
