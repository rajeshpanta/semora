import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import styles from './page.module.css';
import { Faq } from '@/components/Faq';
import { Cta } from '@/components/Cta';
import { JsonLd } from '@/components/JsonLd';
import { Reveal } from '@/components/Reveal';
import { PricingCards } from '@/components/PricingCards';
import { softwareApplicationSchema, faqPageSchema } from '@/lib/schema';
import { APP_SIGNUP_URL, APP_STORE_URL } from '@/lib/semora-facts';
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
  'iPhone, iPad and web — synced',
  'No credit card to start',
];

const PROBLEMS = [
  {
    title: 'You retype it all by hand',
    body: 'Four syllabi, four layouts, forty-some dates. You copy them into your calendar one at a time, and the ones you skip because it is late are exactly the ones that bite you in November.',
  },
  {
    title: 'Nothing lives in one place',
    body: 'One deadline is buried in a PDF, one sits in Canvas, one was said out loud in lecture. Nothing shows you the single week where three exams and a group project all land together.',
  },
  {
    title: 'You find out you are behind too late',
    body: 'The grading scale is on page two and you never do the math on it. By the time a grade feels wrong, the work that could have moved it is already graded and gone.',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Scan it',
    body: 'Four ways in. Photograph the syllabus with your phone, up to five pages in a single scan. Upload the PDF. Drag and drop the file onto the web app. Or paste raw text you copied out of a PDF or an LMS page. Whatever format your professor handed you, one of those four takes it — on iPhone, iPad or the web.',
  },
  {
    n: '02',
    title: 'Review and confirm',
    body: 'Semora pulls out the course name, instructor, class meeting times, office hours, semester start and end dates, the grading scale, and every assignment, exam, quiz, project and reading with its due date. Then it stops and shows you. You fix anything it misread. Nothing lands on your calendar until you confirm it.',
  },
  {
    n: '03',
    title: 'Plan around it',
    body: 'Confirmed deadlines become tracked tasks with same-day reminders, and grades roll up into a weighted average using the scale read off your syllabus. On Pro you can host a shared Course Space for classmates or connect Canvas with a token you generate yourself. Everything syncs to iPad and the web too.',
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
    lead: 'Take a photo of the syllabus on the first day of class, or drop the PDF onto the web app and walk away. Semora reads it and pulls out the course name, your instructor, class meeting times, office hours, semester start and end dates, the grading scale, and every assignment, exam, quiz, project and reading with its due date. Then it hands the list back to you.',
    bullets: [
      'Four ways in: a camera photo of up to five pages per scan, a PDF, web drag-and-drop, or pasted text.',
      'It captures meeting times, office hours, semester dates and the grading scale — not just due dates.',
      'Free covers five scans a calendar month and four courses a semester; Pro lifts both to unlimited.',
      'Nothing reaches your calendar until you confirm it. You are the last check on your own semester.',
    ],
    kicker:
      'Start on the web, finish on your phone, or the other way around. One account, and the courses you scanned show up on the other device in near real time.',
    image: '/screenshots/scan-syllabus.png',
    alt: 'Semora scan screen showing photo, PDF, photo library and file import options',
  },
  {
    key: 'grades',
    eyebrow: 'Grades and forecasting',
    heading: 'Know the number you need, before the final.',
    lead: 'Semora tracks your grades with weighted averages, using the grading scale it already read off your syllabus — and that part is free. Pro adds what you actually want in week eleven: letter-grade cutoffs set to the ones your school really uses, and what-if calculators that work out the score you need on the work that is left to land the grade you are aiming at.',
    bullets: [
      'Weighted averages across every course and category are free on every plan, no credit card, no trial.',
      'Pro lets you customize letter-grade cutoffs to match the scale your school actually uses.',
      'What-if calculators run it backward: name a target grade, see the score each remaining assignment needs.',
      'Academic Risk alerts flag falling grades, missing work and overloaded weeks, each with a recovery step.',
    ],
    image: '/screenshots/track-grades.png',
    alt: 'Semora course screen showing an 86.67 percent current grade with a B badge and what-if forecasting',
    flip: true,
  },
  {
    key: 'plan',
    eyebrow: 'Pro · Planning',
    heading: 'A study schedule that moves when your deadlines move.',
    lead: 'Smart Plan builds your study schedule out of the deadlines Semora is already tracking, so you are not staring at a blank calendar at midnight. It works around your class meeting times and never books you during a lecture. When a due date moves, the plan reshapes around it. Miss a session and it rolls forward instead of disappearing.',
    bullets: [
      'Smart Plan reads the deadlines you already track and builds blocks that never collide with class times.',
      'Due dates move all semester. The plan rebuilds around them, and any session you skip rolls forward.',
      'The weekly workload chart and crunch-week warnings tell you a heavy week is coming while you can still act.',
      'Exam-density view and per-course remaining load show where the pressure is coming from, course by course.',
    ],
    image: '/screenshots/plan-semester.png',
    alt: 'Semora calendar screen showing a full month of colour-coded deadlines across three courses',
  },
  {
    key: 'study',
    eyebrow: 'Pro · Study tools',
    heading: 'Three tools for the hours you actually sit down and work.',
    lead: 'Flashcards, a focus timer and an AI Tutor, all built on course material Semora already has. Cards are generated from your scanned syllabus and any lecture notes you upload, and a deck can cover the whole course or just one exam pulled from your tracked deadlines. Attach a review packet your professor handed out as a PDF or a photo. Add your own cards by hand.',
    bullets: [
      'Decks generate from your scanned syllabus and uploaded notes, scoped to a course or one specific exam.',
      'Focus blocks of 15, 25, 45 or 50 minutes, with 5, 10 or 15 minute breaks, running in the background.',
      'The AI Tutor answers from your syllabus, your live deadlines and your notes — and cites what it used.',
      'It pulls dates only from tracked tasks, never invents one, and says plainly when something is outside your material.',
    ],
    // Deliberately no screenshot. The only Pro artwork available
    // (go-pro.png) advertises "Try 7 days free" unconditionally, but the
    // intro offer is monthly-plan-only and gated on Apple-ID eligibility
    // (lib/purchases.ts isEligibleForIntroOffer) — re-subscribers do not
    // qualify. Showing it here would promise a trial the payment sheet may
    // refuse to honour.
    flip: true,
  },
];

const PILLARS = [
  {
    title: 'Canvas without the IT ticket',
    body: 'Connect Canvas with a personal access token you generate yourself, inside Canvas’s own settings. That choice is deliberate. An OAuth integration would put you in line behind your school’s IT department and a third-party app review — approval you do not control and cannot hurry. Paste the token instead and Canvas imports, whether or not anyone at your school has heard of Semora.',
    points: [
      'You generate the token inside Canvas — no admin request, no app review',
      'Blackboard and Moodle connect the same way, with a token from your school',
      'Connecting a platform is part of Pro; free accounts can paste assignment text into the scanner',
    ],
  },
  {
    title: 'Course Spaces',
    body: 'Share a course with your classmates through an invite link (hosting is part of Pro; joining is free for everyone you invite). Shared deadlines and group assignments sync in real time for everyone in the space, so when one person catches the due date the professor only said out loud in lecture, everyone else has it too. No one is retyping a group spreadsheet at midnight.',
    points: [
      'Invite classmates with a single link',
      'Shared deadlines and group assignments update for the whole space',
      'Hosting a space is Pro — joining one you are invited to is always free',
    ],
  },
  {
    title: 'iPhone, iPad, and the web',
    body: 'One account, three places. Semora is one universal iOS app on iPhone and iPad, plus a web app you can start using without installing anything — sign in and drag a syllabus PDF straight onto the page. Courses, deadlines and grades sync in near real time across all three, so a scan you run walking out of a lecture hall is already waiting on your laptop.',
    points: [
      'Start in the browser — no install, drag and drop a syllabus PDF',
      'Pro is bought in the iOS app and applies account-wide, web included',
      'No separate web checkout; the web app reads and refreshes your entitlement',
    ],
  },
];

const HOME_FAQ = [
  {
    question: 'Is Semora actually free?',
    answer:
      'Yes, and there is no credit card. The free tier gives you five syllabus scans per calendar month, up to four courses in one semester, full deadline and task tracking, grade tracking with weighted averages, same-day reminders, and free access to any Course Space a classmate invites you into. If you are taking four classes, that is a whole semester covered.',
  },
  {
    question: 'What does Pro cost, and where do I buy it?',
    answer:
      'Pro is $3.99 a month or $19.99 a year. The annual plan works out to about $1.67 a month, roughly 58 percent cheaper than paying monthly. You buy it inside the iOS app through the App Store. There is no separate web checkout — once it is active, it applies to your whole account, including the web app.',
  },
  {
    question: 'What can I feed the scanner?',
    answer:
      'Four things. A camera photo, and you can shoot multiple pages — up to five per scan. A PDF upload. Drag and drop, on the web app. Or raw text you copied out of a PDF or an LMS page and pasted in. If your professor buried the syllabus in a Canvas announcement, paste it.',
  },
  {
    question: 'Do I need Canvas for this to work?',
    answer:
      'No. Semora works from the syllabus alone, on the free tier. Canvas import is there if you want it, as part of Pro, and it connects with a personal access token you generate yourself inside Canvas settings — no OAuth integration, so you are not waiting on your school’s IT department to approve a third-party app. On the free tier you can still paste Canvas assignment text straight into the scanner.',
  },
  {
    question: 'How accurate is the scan, and what if it gets something wrong?',
    answer:
      'It pulls the course name, instructor, meeting times, office hours, semester start and end dates, the grading scale, and every assignment, exam, quiz, project and reading with its due date. Then it hands all of that to you to review and edit. Nothing lands on your calendar until you confirm it. Fix a wrong date, rename a course, delete the reading you know is optional — then save.',
  },
  {
    question: 'Does it work on iPad?',
    answer:
      'Yes. Semora is one universal iOS app — the same download runs on iPhone and iPad. There is also the web app. One account covers all three, and your courses, deadlines and grades sync across them in near real time, so you can scan a syllabus on your phone and plan your week on a bigger screen.',
  },
  {
    question: 'Can I use it without installing anything?',
    answer:
      'Yes. Sign in on the web and use Semora straight from the browser — drag a syllabus PDF onto the page or paste the text in. It is the same account and the same data as the app. The one thing the web cannot do is take payment: Pro is purchased in the iOS app, then the web app picks the entitlement up.',
  },
  {
    question: 'Can I share a course with classmates?',
    answer:
      'Yes. Course Spaces let you share a course through an invite link, and shared deadlines and group assignments sync in real time for everyone in the space — so when the group project date moves, it moves for all of you. Hosting a space is part of Pro; joining one a classmate invites you into is free, with no time limit.',
  },
  {
    question: 'What can the AI Tutor actually see?',
    answer:
      'Just your course. Each chat is scoped to one course and answers from that course’s syllabus, your live tracked deadlines, and any lecture notes you upload as PDF or photo. It cites what it used — "your syllabus lists", "from your Week 3 notes". Deadline answers come strictly from tracked tasks; it never invents a date, and it says plainly when a question falls outside what it has. Pro.',
  },
  {
    question: 'How do I cancel?',
    answer:
      'In the App Store, since that is where the subscription lives — open your Apple ID subscription settings and turn off renewal. You do not have to email anyone or explain yourself. Your account drops back to the free tier at the end of the period you already paid for, and you can go back to Pro whenever.',
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
              Take a photo, upload the PDF, or paste the text. Semora pulls out every assignment,
              exam, quiz and reading with its due date — plus your class times, office hours and the
              grading scale — and shows you the whole list to edit before a single thing is saved.
            </p>
            <div className={styles.heroActions}>
              <Link href={APP_SIGNUP_URL} className={styles.primaryBtn}>
                Try it for free
              </Link>
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
            <div className={styles.heroGlow} aria-hidden="true" />
            <Image
              src="/screenshots/never-miss-deadline.png"
              alt="Semora Today screen showing the next assignment due and this week's workload"
              width={296}
              height={640}
              priority
              className={styles.heroShot}
            />
          </div>
        </div>
      </section>

      {/* ── The problem ──────────────────────────────────── */}
      <section className={styles.band}>
        <div className={styles.inner}>
          <Reveal>
            <div className={styles.sectionHead}>
              <span className={styles.label}>The problem</span>
              <h2>Week one always costs you a weekend.</h2>
              <p>
                Every semester starts the same way: four PDFs, four different layouts, and an
                evening spent copying dates into a calendar by hand. The parts you skip are the
                parts that catch you out three months later.
              </p>
            </div>
          </Reveal>
          <div className={styles.problemGrid}>
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.title} delay={i * 80} className={styles.problemCell}>
                <article className={styles.problemCard}>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </article>
              </Reveal>
            ))}
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
              Three steps, once per course, at the start of the semester. After that, the syllabus
              stops being a PDF you never open again.
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

      {/* ── Pillars ──────────────────────────────────────── */}
      <section className={styles.band}>
        <div className={styles.inner}>
          <Reveal>
            <div className={styles.sectionHead}>
              <span className={styles.label}>Built around how a semester actually runs</span>
              <h2>Your courses, your classmates, every device.</h2>
              <p>
                The syllabus is the starting point, not the whole job. Semora also pulls from your
                LMS, keeps a shared course in sync with the people sitting next to you, and follows
                you from a phone in a lecture hall to a laptop at the library.
              </p>
            </div>
          </Reveal>
          <div className={styles.pillarGrid}>
            {PILLARS.map((p, i) => (
              <Reveal key={p.title} delay={i * 80} className={styles.pillarCell}>
                <article className={styles.pillarCard}>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                  <ul className={styles.checks}>
                    {p.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────── */}
      <section className={styles.inner}>
        <Reveal>
          <div className={styles.sectionHead}>
            <span className={styles.label}>Pricing</span>
            <h2>Free covers a real semester.</h2>
            <p>
              Five scans a month and four courses, with deadlines, grades and reminders included.
              Pro is there when you want the planning layer on top.
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
              <h2>Questions worth asking before you download anything.</h2>
              <p>
                Short answers, no runaround. If something here does not match your situation, email
                and a person will write back.
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
          heading="Scan the first syllabus. Give it a minute."
          subheading="Free on iPhone, iPad and the web — five scans a month, four courses, no credit card."
        />
      </div>
    </>
  );
}
