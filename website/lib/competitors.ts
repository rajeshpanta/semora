import type { CompareRow } from '@/components/CompareTable';
import type { FaqItem } from '@/components/Faq';

/**
 * Structured, per-competitor facts powering compare/[slug]. Ported verbatim
 * from the already researched and adversarially fact-checked
 * marketing-pages/*.html files (2026-07 SEO project) — do not alter a claim
 * here without re-verifying it the same way those pages were checked.
 */
export interface CompetitorFact {
  slug: string;
  name: string;
  /** One sentence used on the /compare index card. */
  oneLiner: string;
  title: string;
  metaDescription: string;
  lede: string;
  intro?: string;
  semoraParagraph: string;
  competitorParagraph: string;
  comparisonCaption: string;
  comparisonRows: CompareRow[];
  tableNote?: string;
  /**
   * Only set when Semora's own price is factually lower than the
   * competitor's comparable paid tier — omit rather than spin it when
   * Semora doesn't actually win on price (e.g. a competitor that's free,
   * or genuinely cheaper).
   */
  pricingWin?: string;
  whereSemoraFits?: string[];
  whereCompetitorFits?: string[];
  verdict?: string[];
  extraSections?: { heading: string; body: string[] }[];
  extraNote?: string;
  faq: FaqItem[];
}

export const COMPETITORS: CompetitorFact[] = [
  {
    slug: 'dormway',
    name: 'DormWay',
    oneLiner:
      'A free syllabus-and-LMS planner with read-only Canvas, Blackboard, and Moodle sync — no paid tier.',
    title: 'Semora vs DormWay: Syllabus Planner Comparison (2026)',
    metaDescription:
      "Compare Semora and DormWay on syllabus scanning, Canvas sync, grade tracking, and study planning to find the right college planner for your semester.",
    lede: "Semora and DormWay both use AI to turn an uploaded syllabus into a semester timeline, but Semora adds Progress Insights, an AI-generated study schedule, and a workload dashboard behind an optional $3.99/month Pro tier, while DormWay pairs syllabus parsing with read-only Canvas, Blackboard, and Moodle sync and is currently free.",
    semoraParagraph:
      "Semora turns a course syllabus into an organized semester. You import a syllabus by photo (camera, up to 5 pages), PDF upload, drag-and-drop on the web, or by pasting raw text copied from a PDF or LMS page on the web. OpenAI GPT-5.6 Luna then extracts the course name, instructor, meeting times, office hours, semester dates, grading scale, and every assignment, exam, quiz, project, and reading with its due date — building your deadlines, grades, and class schedule automatically. Semora is available on iPhone, iPad, and web, sharing one account so edits sync in near real time.",
    competitorParagraph:
      'DormWay ingests syllabi (uploaded in-app or emailed to syllabus@dormway.app) and uses AI to extract assignments, exam dates, grading breakdowns, and late-work policies. It pairs that with read-only Canvas, Blackboard, and Moodle sync, merging both sources into one semester timeline and week view. DormWay also includes a GPA/grade calculator, an "Ace" AI assistant that answers policy questions with citations back to the syllabus, and a per-course "Intelligence" tab (difficulty rating, weekly hour estimate, grading policy, late-work rules). It\'s available on web, iPhone, iPad, and Mac.',
    comparisonCaption:
      'Comparison based on each product\'s publicly stated features as of 2026. Where DormWay\'s exact behavior isn\'t confirmed on its own site, it\'s marked "not publicly confirmed."',
    comparisonRows: [
      {
        feature: 'Syllabus & deadline handling',
        semora:
          'Photo (up to 5 pages), PDF upload, drag-and-drop, or pasted text (web). AI extracts course info, meeting times, office hours, grading scale, and every assignment/exam/quiz/project/reading with due dates.',
        competitor:
          'Upload in-app or email to syllabus@dormway.app. AI extracts assignments, exam dates, grading breakdowns, and late-work policies.',
      },
      {
        feature: 'Canvas / LMS sync',
        semora:
          'Canvas, Blackboard, and Moodle import is free on every plan. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve.',
        competitor: 'Read-only sync with Canvas, Blackboard, and Moodle, merged into one timeline.',
      },
      {
        feature: 'Grade tracking',
        semora:
          'Grade tracking is part of the free tier. Pro adds Progress Insights (trend charts, CSV export, print view on web) and Academic Risk alerts for falling grades or missing work.',
        competitor:
          'Includes a GPA/grade calculator that supports weighted categories, letting you adjust weights and test grade scenarios.',
      },
      {
        feature: 'Study planning / workload tools',
        semora:
          'Pro includes Smart Plan (AI-generated study schedule that adapts to deadlines), a Workload dashboard (crunch-week/exam-density view), Flashcards (spaced repetition), a Focus timer, and an AI tutor chat.',
        competitor:
          'An "Ace" AI assistant answers policy questions with citations, plus a per-course "Intelligence" tab (difficulty rating, weekly hour estimate).',
      },
      {
        feature: 'Pricing',
        semora:
          'Free: one AI action for the life of the account (spend it on a syllabus scan, a lecture recording, or a document turned into notes), unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total, full deadline & grade tracking, and same-day reminders. Pro: $3.99/month or $19.99/year for unlimited scans/courses plus calendar sync, Smart Plan, and other study tools.',
        competitor:
          'Currently free with no paid tier — site and App Store listing state "no paywalls" and "no credit card."',
      },
      {
        feature: 'Platform availability',
        semora: 'iPhone and iPad (one universal, responsive app) plus web, same account, near real-time sync. No Mac app.',
        competitor: "Web, iPhone, iPad, and Mac. No Android app — confirmed on DormWay's own blog.",
      },
    ],
    whereSemoraFits: [
      'You want Progress Insights (trend charts and CSV export) layered on top of your grade tracking.',
      'You want an AI-generated study schedule (Smart Plan) or a workload dashboard that flags crunch weeks and exam-heavy stretches.',
      "You'd use flashcards, a Pomodoro-style focus timer, or an AI tutor chat that already knows your syllabus.",
      'You want free Canvas import from the private Calendar Feed link Canvas already gives you, with syllabus scanning or pasted assignment text as the fallback.',
      'You want to share a course with classmates (Course Spaces) with deadlines and group assignments syncing in real time.',
    ],
    whereCompetitorFits: [
      "Your school uses Blackboard or Moodle rather than Canvas — DormWay's read-only sync covers all three.",
      'You want a fully free product with no subscription tier at all.',
      'You want a dedicated Mac app specifically — Semora doesn\'t have one.',
    ],
    extraNote:
      "DormWay describes itself as built by students, for students, and its marketing highlights use by student-athletes and students with ADHD, along with a list of schools and a claim of 6,134+ schools across the U.S. and Canada. Those figures come from DormWay's own site and haven't been independently verified, so treat them as marketing claims rather than confirmed statistics.",
    faq: [
      {
        question: 'Does Semora or DormWay sync with Canvas?',
        answer:
          "Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. DormWay offers read-only sync with Canvas, Blackboard, and Moodle, merged into one timeline.",
      },
      {
        question: 'Is Semora or DormWay free?',
        answer:
          "Semora's free tier includes one AI action for the lifetime of the account — a syllabus scan, a lecture recording, or a document turned into notes, whichever you reach for first — plus unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total, full task/deadline tracking, grade tracking, and same-day reminders; Pro is $3.99/month or $19.99/year for unlimited scans and courses plus calendar sync and study-planning tools. DormWay is currently free with no paid tier, per its own pricing page and App Store listing.",
      },
      {
        question: 'How do Semora and DormWay handle grade tracking?',
        answer:
          "Semora includes grade tracking in its free tier, with Progress Insights (trend charts, CSV export) and Academic Risk alerts available in Pro. DormWay's GPA/grade calculator also supports weighted categories, letting you adjust weights and test grade scenarios.",
      },
      {
        question: 'Does either app work on Android or iPad?',
        answer:
          "Neither app has an Android version — DormWay states this explicitly on its own blog. Both work on iPad: Semora runs as a single universal iOS app with a responsive layout that adapts to iPad, alongside web; DormWay has a dedicated iPad app plus a Mac app, which Semora doesn't offer.",
      },
    ],
  },
  {
    slug: 'shovel',
    name: 'Shovel',
    oneLiner:
      'A subscription-based time-blocking planner that turns deadlines into a scheduled study calendar.',
    title: 'Semora vs Shovel: Syllabus Scanning & Canvas Sync',
    metaDescription:
      "Compare Semora and Shovel: syllabus scanning, Canvas sync, grade tracking, study planning, and pricing side by side to find the right app for your semester.",
    lede: "Semora scans a syllabus into an organized semester (deadlines, grades, and class schedule) with a genuine free tier, while Shovel turns a syllabus or LMS connection into a time-blocked, subscription-based study schedule; the better fit depends on whether you want a lightweight deadline-and-grade tracker or a full automated study-time planner.",
    intro:
      "Both Semora and Shovel start from the same problem, a syllabus PDF nobody wants to manually transcribe, but they solve it differently downstream. Here's a fact-based look at how they compare on syllabus handling, Canvas sync, grade tracking, study planning, pricing, and platform availability.",
    semoraParagraph:
      'Semora turns a photographed, uploaded, or pasted syllabus into an organized semester. You can import it by camera (multi-page, up to 5 pages), PDF upload, drag-and-drop on web, or by pasting raw text copied from a PDF or LMS page. OpenAI GPT-5.6 Luna reads the document and extracts the course name, instructor, meeting times, office hours, semester dates, grading scale, and every assignment, exam, quiz, project, and reading along with its due date. From there, Semora tracks deadlines and grades on the free tier, and — on the Pro tier — adds device calendar sync (with .ics export), an adaptive study schedule, academic-risk alerts, flashcards, a focus timer, and an AI tutor that knows your syllabus.',
    competitorParagraph:
      'Shovel is a study-planning and scheduling app. You either upload a PDF syllabus for AI parsing, with a review/confirmation screen, or connect a school LMS (Canvas, Brightspace, Moodle, or Google Classroom) for read-only sync that auto-refreshes roughly every 24 hours. From there, Shovel builds a time-blocked study schedule across the whole semester, weighing available time against estimated time-per-task. Distinct features include "The Cushion™" predictive conflict alerts, reading-time estimators, streak-based motivation tracking, and free supplementary "how to study" courses.',
    comparisonCaption:
      "Comparison based on verified product details checked August 30, 2026. Shovel's official Pricing and Buy pages showed conflicting prices on that date.",
    comparisonRows: [
      {
        feature: 'Syllabus & deadline handling',
        semora:
          'Photo (multi-page, up to 5), PDF upload, drag-and-drop, or pasted text — OpenAI GPT-5.6 Luna extracts course details and every assignment/exam/quiz/project/reading with due dates.',
        competitor: 'PDF upload parsed by AI with a review/confirmation screen, or connect a school LMS directly.',
      },
      {
        feature: 'Canvas / LMS sync',
        semora:
          "Canvas import is free on every plan. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. Confirm your school's policy; if it is unavailable or not permitted, scan the syllabus or paste the Canvas assignment list into Semora. Google Classroom and Google Calendar are not currently shipped.",
        competitor:
          'Read-only sync across Canvas, Brightspace, Moodle, and Google Classroom simultaneously, auto-refreshing roughly every 24 hours.',
      },
      {
        feature: 'Grade tracking',
        semora: 'Included on the free tier; Pro adds trend charts, CSV export, and a print view.',
        competitor:
          'Not publicly confirmed as a core feature — public materials focus on scheduling and time-blocking rather than grade calculation.',
      },
      {
        feature: 'Study planning',
        semora:
          'Pro-tier Smart Plan builds an AI study schedule that adapts to deadlines, plus a Workload dashboard, Focus timer, and Academic Risk alerts.',
        competitor:
          'Core to the product — a time-blocked schedule from available time vs. estimated time-per-task, plus "The Cushion™" conflict alerts and reading-time estimators.',
      },
      {
        feature: 'Pricing',
        semora:
          'Free tier (one AI action for the life of the account — a syllabus scan, a lecture recording, or a document turned into notes — plus unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total); Pro is $3.99/month or $19.99/year, bought by card on the web or in the iOS app and applied account-wide.',
        competitor:
          "Official pages conflicted when checked August 30, 2026. The Pricing page showed a 7-day free trial followed by $9.79/month (with $19.99 also displayed) or $39/year; the navigation-linked Buy page showed $33/month paid monthly or $16/month paid annually. Confirm the checkout amount.",
      },
      {
        feature: 'Platforms',
        semora: 'iPhone, iPad, and web, one account, near real-time sync.',
        competitor:
          'Native iOS + Android; account setup happens on the web app first, with mobile as a companion.',
      },
    ],
    pricingWin:
      "Semora Pro is $3.99/month or $19.99/year. Shovel's conflicting official pages showed either a 7-day trial followed by $9.79/month or $39/year, or $33/month paid monthly and $16/month paid annually; confirm the checkout amount.",
    extraSections: [
      {
        heading: 'Syllabus import, in detail',
        body: [
          'Semora accepts four import paths (camera photo (up to 5 pages per scan), PDF upload, drag-and-drop on web, or pasted raw text copied from a PDF or LMS page) and uses OpenAI GPT-5.6 Luna to extract structured course data: name, instructor, meeting times, office hours, semester dates, grading scale, and every graded item with its due date. The free tier includes one AI action for the lifetime of the account — spend it on a syllabus scan, a lecture recording, or turning a document into notes — usable across unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, with one semester total on free.',
          "Shovel's stated import path is a PDF upload that AI parses, followed by a review/confirmation step before the schedule is built, or connecting an LMS directly so assignments come in via sync rather than a scan.",
        ],
      },
      {
        heading: 'Canvas & LMS sync, in detail',
        body: [
          "Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. Google Classroom and Google Calendar sync exist in Semora's codebase but are not currently enabled or shipped — they should not be treated as available features today.",
          'Shovel advertises read-only sync across four LMS platforms at once — Canvas, Brightspace, Moodle, and Google Classroom — auto-refreshing roughly every 24 hours to reflect due-date changes or new assignments.',
        ],
      },
      {
        heading: 'Grade tracking',
        body: [
          'Semora includes grade tracking on its free tier, with Pro adding Progress Insights: trend charts, CSV export, and a print view for grade reports on web.',
          "Grade tracking is not a feature Shovel's public materials describe as core to the product; its documented focus is converting deadlines into a study schedule rather than computing course grades.",
        ],
      },
      {
        heading: 'Study planning & Pro features',
        body: [
          'On Semora, deadline and grade tracking are free; the study-planning layer is part of Pro ($3.99/month or $19.99/year): Smart Plan (an AI-generated, deadline-adaptive study schedule), a Workload dashboard for spotting crunch weeks, Flashcards with spaced repetition built from your own material, a Focus timer, an AI tutor that knows your syllabus, custom reminder timing with quiet hours, and Academic Risk alerts (falling grades, missing work, overloaded weeks) with a recovery-step plan.',
          'On Shovel, time-blocked study scheduling is central to the product from the start — calculating available time versus estimated time-per-task across the semester, with predictive conflict alerts ("The Cushion™"), reading-time/task-duration estimators, streak-based motivation tracking, and free supplementary "how to study" courses.',
        ],
      },
      {
        heading: 'Platform availability & cross-device sync',
        body: [
          'Semora runs on iPhone, iPad, and web, sharing one account and database; edits sync in near real time. Pro can be bought two ways — by card on the web at app.semoraai.com (processed by Stripe) or in the iOS app through the App Store — and either purchase applies to the whole account, iPhone, iPad, and browser. Web sign-in supports Apple or Google (email/password sign-in works for existing accounts), and includes print/CSV export for grade reports. Browser notifications work while a tab is open, not as full closed-tab push notifications.',
          'Shovel has native iOS and Android apps, but account creation and initial setup happen on the web app first, with mobile positioned as a companion rather than a standalone starting point.',
        ],
      },
    ],
    whereSemoraFits: [
      'You want a genuinely free planner for one semester (unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand, unlimited tasks and deadlines, and grade tracking that never expires, plus one AI action to try the syllabus scanning) rather than a subscription-gated planner.',
      'You want grade tracking as a first-class feature, not a scheduling tool with no gradebook.',
      'You want to share a course with classmates via Course Spaces, with deadlines and group assignments syncing in real time.',
      'You want free Canvas import from the private Calendar Feed link Canvas already gives you, with syllabus scanning or pasted assignment text as the fallback.',
    ],
    whereCompetitorFits: [
      'You want time-blocked scheduling — weighing available time against estimated time-per-task — as the core product, not an add-on.',
      'Your school uses Brightspace, Moodle, or Google Classroom alongside or instead of Canvas — Shovel syncs read-only across all four.',
      'You want native iOS and Android apps rather than an iPhone/iPad-plus-web setup.',
      'Features like "The Cushion™" conflict alerts, reading-time estimators, or free supplementary study courses matter to you.',
    ],
    extraNote:
      "Semora launched recently and does not yet have a public rating history to report — we're not going to invent one. Shovel is subscription-based, and its official Pricing and navigation-linked Buy pages showed conflicting prices when checked August 30, 2026; confirm the checkout amount before deciding.",
    faq: [
      {
        question: 'Does Semora sync with Canvas the same way Shovel does?',
        answer:
          "Not quite. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. Shovel connects via a read-only sync that covers Canvas alongside Brightspace, Moodle, and Google Classroom, auto-refreshing roughly every 24 hours. Semora does not currently offer live Google Classroom or Google Calendar sync — that code exists internally but isn't shipped.",
      },
      {
        question: 'Is Semora or Shovel free to use?',
        answer:
          "Semora has a free tier for one semester total: one AI action for the lifetime of the account (a syllabus scan, a lecture recording, or a document turned into notes — you pick), unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within that semester, full deadline and grade tracking, and same-day reminders, with no countdown timer on the planner itself (calendar sync with .ics export is a Pro feature). Shovel's core planner is subscription-gated. Its official Pricing page advertised a 7-day free trial when checked August 30, 2026, while its navigation-linked Buy page did not mention a trial; confirm the offer at checkout.",
      },
      {
        question: 'Does Semora build a study schedule like Shovel does?',
        answer:
          'Yes, but it\'s a Pro feature on Semora. The free tier covers deadline and grade tracking; the AI-generated Smart Plan that builds a study schedule adapting to your deadlines is part of Pro ($3.99/month or $19.99/year), alongside a Workload dashboard and Academic Risk alerts. Shovel\'s time-blocked scheduling — weighing available time against estimated time-per-task across the semester, with "The Cushion™" conflict alerts — is central to its product from the start.',
      },
      {
        question: 'What does Semora cost compared to Shovel?',
        answer:
          "Semora Pro is $3.99/month or $19.99/year, bought by card on the web or as a subscription inside the iOS app, and applied account-wide across iPhone, iPad, and browser. Shovel's official pages conflicted when checked August 30, 2026: the Pricing page showed a 7-day free trial followed by $9.79/month (with $19.99 also displayed) or $39/year, while the navigation-linked Buy page showed $33/month paid monthly or $16/month paid annually. Confirm the checkout amount.",
      },
    ],
  },
  {
    slug: 'studyfetch',
    name: 'StudyFetch',
    oneLiner:
      'A materials-first AI study platform built around the Spark.E tutor, with syllabus scanning as one feature among many.',
    title: 'Semora vs StudyFetch: Which Study App Fits You?',
    metaDescription:
      'Semora vs StudyFetch compared: syllabus-to-calendar automation, Canvas sync, grade tracking, study planning, pricing, and platforms.',
    lede: 'In one sentence: Semora is a syllabus-first app that automatically turns a photographed or uploaded syllabus into a semester-long deadline, grade, and calendar system, while StudyFetch is a broader AI study platform — built around the Spark.E tutor — that also includes syllabus-to-calendar scanning as one feature among many (flashcards, quizzes, exam simulations, and a live lecture recorder).',
    intro:
      "Both let you point a phone camera at a syllabus and get a study plan out the other end. Where they differ is what happens before and after that scan: how deadlines are organized across multiple courses, whether the tool connects to your school's LMS, and how much of the product is built around a gradebook versus a tutor. This page compares the two on the specifics that matter for choosing one — using only what each company publicly states about its own product.",
    semoraParagraph:
      'Semora (iPhone, iPad, and web) turns a course syllabus into an organized semester. You import a syllabus by camera photo (multi-page, up to 5 pages), PDF upload, drag-and-drop on the web, or by pasting raw text copied from a PDF or LMS page. OpenAI GPT-5.6 Luna extracts the course name, instructor, meeting times, office hours, semester dates, grading scale, and every assignment, exam, quiz, project, and reading with its due date, then organizes them into deadlines, a grade tracker, and a class schedule shared across your iPhone, iPad, and the web via one account.',
    competitorParagraph:
      'StudyFetch (web, iOS, and Android) is an AI study platform built around Spark.E, a tutor that answers questions only from a student\'s own uploaded course material (slides, PDFs, notes, photos, video, or audio) rather than the open internet. Around that core, it auto-generates flashcards, quizzes, practice and full-length exam simulations, essay feedback, AI-narrated "podcast" summaries, and AI-generated explainer videos. A Live Lecture Assistant records class audio into real-time structured notes and a transcript, and Spark.E is also reachable by SMS/iMessage. StudyFetch does include a calendar feature, photograph a syllabus and Spark.E extracts events into a personal calendar with reminders and a spaced-repetition study plan, but it functions as one module inside a materials-centric tool rather than the product\'s organizing principle.',
    comparisonCaption:
      "Based on each company's own published product information. Where StudyFetch's own site could not be independently confirmed, that is noted.",
    comparisonRows: [
      {
        feature: 'Syllabus / deadline handling',
        semora:
          'Core purpose of the app. Photo, PDF, drag-and-drop, or pasted-text import auto-extracts every assignment, exam, quiz, project, and reading with due dates across all of a student\'s courses at once, feeding one unified deadline list.',
        competitor:
          "Supported as one feature: photograph a syllabus or calendar and Spark.E extracts events into a personal calendar with reminders. Per available descriptions, this is a per-upload feature rather than an automatic multi-course deadline aggregation.",
      },
      {
        feature: 'Canvas LMS sync',
        semora:
          "Canvas import is free on every plan. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. Confirm your school's policy; if it is unavailable or not permitted, scan the syllabus or paste the Canvas assignment list into Semora.",
        competitor:
          'Yes, but a different integration model. StudyFetch documents an LTI 1.3 integration with Canvas (also Blackboard, Schoology, D2L Brightspace, and Google Classroom) with roster sync, deployed by the institution rather than connected by an individual student.',
      },
      {
        feature: 'Grade tracking',
        semora:
          'Yes, included in the free tier — grades are tracked alongside deadlines. Pro adds Progress Insights (trend charts, CSV export, print view on web).',
        competitor:
          "Not publicly confirmed as a dedicated running gradebook. StudyFetch's grading-related features center on essay feedback and exam-simulation scoring rather than a semester grade tracker.",
      },
      {
        feature: 'Study planning',
        semora:
          'Smart Plan (Pro): an AI-generated timed study schedule that adapts to upcoming deadlines, plus a Workload dashboard for crunch weeks and a Focus (Pomodoro) timer.',
        competitor:
          'Spaced-repetition-based study plans generated from the calendar/syllabus feature, alongside auto-generated flashcards, quizzes, and practice/full exam simulations built from uploaded materials.',
      },
      {
        feature: 'Pricing',
        semora:
          'Free: one AI action for the life of the account (a syllabus scan, a lecture recording, or a document turned into notes), unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total, full deadline and grade tracking, and same-day reminders. Pro: $3.99/month or $19.99/year for unlimited scans/courses plus calendar sync (device + .ics export) and other study tools, bought by card on the web or in the iOS app and applied account-wide.',
        competitor:
          "Reported by third-party review sites, not confirmed directly on StudyFetch's own pricing page: a free tier (10 Spark.E chats, 1 study set, 2 uploads), a Base tier around $7.99/month, a Premium tier around $11.99/month, a semester bundle around $49.99, and an annual plan around $99.99. Check StudyFetch's current pricing page for exact figures.",
      },
      {
        feature: 'Platform availability',
        semora: 'iPhone, iPad, and web, sharing one account with near real-time sync between them.',
        competitor: 'Web, iOS, and Android.',
      },
    ],
    pricingWin:
      "Semora Pro is $3.99/month or $19.99/year, less than half of StudyFetch's reported Base tier (~$7.99/month) and well below its reported Premium tier (~$11.99/month), per third-party review coverage.",
    extraSections: [
      {
        heading: 'Collaboration and sharing',
        body: [
          "Semora has Course Spaces: you can share a course with classmates via an invite link, with shared deadlines and group assignments syncing in real time. It also has Share & Streaks (Pro), a semester share card plus study-streak tracking, and a separate referral program, open to free and Pro users alike, that gives both you and your friend a free month of Pro when they join. Available research did not surface an equivalent classmate-facing course-sharing feature for StudyFetch.",
        ],
      },
      {
        heading: 'AI tutor vs. syllabus-aware assistant',
        body: [
          "StudyFetch's Spark.E is built to answer from a student's own uploaded slides, notes, and recordings, including live lecture audio, which is a deeper materials-ingestion capability than Semora currently offers. Semora's Pro tier includes its own AI tutor, but scoped to what it knows about a student's syllabus (deadlines, grading scale, course structure) rather than arbitrary uploaded lecture material.",
        ],
      },
      {
        heading: 'Reported reviews and subscription experience',
        body: [
          "Third-party sources report StudyFetch's app store ratings as strong (around 4.8 on the App Store from roughly 8,200 ratings, and around 4.5 on Google Play), with users citing fast conversion of course material into study tools. Trustpilot snapshots are more mixed and vary by when they were sampled: one snapshot shows around 3.9 from 241 reviews (roughly 22% one-star, concentrated on complaints about surprise charges and difficulty cancelling subscriptions), while a more recent snapshot shows around 4.1 across roughly 255 reviews. Other reports note the Android app is buggier than iOS. Semora has not yet been out long enough to have a comparable public rating record, so no rating comparison is offered here — worth checking current reviews on both before subscribing.",
        ],
      },
    ],
    verdict: [
      "Choose Semora if your main problem is turning a stack of course syllabi into one organized semester — deadlines, grades, and a schedule you can trust. If your school uses Canvas, connecting it takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve.",
      'Choose StudyFetch if you want a single tool to also ingest lecture recordings, slides, and notes, and generate flashcards, quizzes, exam simulations, and tutoring chat directly from that material, with syllabus-to-calendar scanning as a secondary convenience rather than the main workflow.',
      'Some students may reasonably use both: Semora for the semester-wide deadline and grade picture, StudyFetch for deep, material-specific study help on individual courses.',
    ],
    faq: [
      {
        question: 'Does Semora or StudyFetch automatically track deadlines from a syllabus?',
        answer:
          "Both can extract dates from a photographed syllabus. Semora is built around this as its core workflow, aggregating every assignment, exam, quiz, project, and reading across all of a student's courses into one deadline list and grade tracker. StudyFetch includes a similar syllabus/calendar-scanning feature, but it sits alongside many other tools (flashcards, quizzes, exam simulations, live lecture notes) rather than functioning as the app's primary organizing feature.",
      },
      {
        question: 'Does StudyFetch sync with Canvas?',
        answer:
          "Yes — StudyFetch documents an LTI 1.3 integration with Canvas (as well as Blackboard, Schoology, D2L Brightspace, and Google Classroom), including roster sync. It's deployed at the institution level, though, so a school sets it up rather than an individual student connecting their own account. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve.",
      },
      {
        question: 'Can I use Semora or StudyFetch for free?',
        answer:
          "Semora's free tier includes one AI action for the lifetime of the account — a syllabus scan, a lecture recording, or a document turned into notes — plus unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total, full task/deadline tracking, grade tracking, and same-day reminders (calendar sync with .ics export is a Pro feature). StudyFetch is reported (via third-party review sites, not confirmed on StudyFetch's own site) to offer a free tier limited to 10 Spark.E chats, 1 study set, and 2 uploads — check StudyFetch's current pricing page to confirm exact free-tier limits.",
      },
      {
        question: 'Which app has an AI tutor?',
        answer:
          "Both do, with different scopes. StudyFetch's Spark.E is a tutor that answers from whatever course material a student uploads — slides, PDFs, notes, photos, video, or audio, including live lecture recordings. Semora's Pro plan includes an AI tutor that's aware of a student's syllabus — deadlines, grading scale, and course structure, rather than open-ended uploaded lecture material.",
      },
    ],
  },
  {
    slug: 'mindgrasp',
    name: 'Mindgrasp',
    oneLiner:
      'Turns any uploaded document, video, or recording into notes, flashcards, and a quiz, not a syllabus parser.',
    title: 'Semora vs Mindgrasp: Which AI Study App Fits You?',
    metaDescription:
      'Compare Semora and Mindgrasp: syllabus deadline tracking and Canvas sync vs. AI notes and flashcards from any file. Features, pricing, platforms.',
    lede: 'Semora turns a course syllabus into an organized, deadline-tracked semester with grades and a calendar, while Mindgrasp turns any single document, video, or lecture recording you upload into notes, flashcards, and quizzes — they solve different problems and can be used alongside each other.',
    intro:
      "If you're comparing the two, the short version is this: Semora is built around your syllabus — it reads the PDF or photo you give it and builds your semester calendar, task list, and grade tracker from it. Mindgrasp is built around your study material (lecture recordings, PDFs, slides, videos) and turns whatever you feed it into notes, flashcards, and a quiz. Read on for how each one actually works, a side-by-side feature table, and honest guidance on which fits your situation.",
    semoraParagraph:
      'Semora (iPhone, iPad, and web) starts with your syllabus. You can import it by taking a photo (including multi-page scans, up to 5 pages), uploading a PDF, dragging a file onto the web app, or pasting raw text copied from a PDF or your school\'s LMS page. OpenAI GPT-5.6 Luna then extracts the course name, instructor, meeting times, office hours, semester dates, grading scale, and every assignment, exam, quiz, project, and reading, each with its due date, and builds them into your semester automatically. The free tier includes one AI action for the lifetime of the account — a syllabus scan, a lecture recording, or a document turned into notes, whichever you reach for first — unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total, full task and deadline tracking, grade tracking, and same-day reminders. Pro ($3.99/month or $19.99/year) adds unlimited scans and courses, Smart Plan, a Workload dashboard, Grade Scale & Forecasting, spaced-repetition Flashcards, a Focus timer, an AI tutor, custom reminder timing, calendar sync (device + .ics export), Academic Risk alerts, Progress Insights, and Share & Streaks. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. Course Spaces let you share a course with classmates via an invite link so shared deadlines and group assignments sync in real time (hosting a space is Pro; joining one is free). Web, iPhone, and iPad share one account and sync in near real time. (Google Classroom and Google Calendar sync exist in Semora\'s codebase but are not currently enabled or shipped — they aren\'t live features today.)',
    competitorParagraph:
      'Mindgrasp takes a different starting point: you upload or link a piece of content — a PDF, DOCX, PowerPoint, MP3/MP4, YouTube video, web article, or a lecture you record live, and it generates a linked bundle of AI notes, a summary, flashcards, a quiz, and an "AI Tutor" chat for asking questions about that content. A higher Scholar/Premium tier adds an "AI math expert" for step-by-step math help, and there\'s a Chrome extension for capturing content from the browser. Mindgrasp also states compatibility with Canvas, Blackboard, and Panopto, though this appears to be for importing or processing files from those platforms rather than parsing a syllabus for deadlines. Mindgrasp\'s marketing targets a broad range of learners — high school through graduate students, self-learners, professionals, and exam-prep candidates.',
    comparisonCaption:
      "Based on Semora's shipped features and Mindgrasp's public materials checked August 30, 2026. Mindgrasp pricing uses the official plan picker's Yearly selector.",
    comparisonRows: [
      {
        feature: 'Syllabus & deadline handling',
        semora:
          'Scans a syllabus (photo, PDF, drag-and-drop, or pasted text) and auto-extracts every assignment, exam, quiz, project, and reading with its due date, plus course dates, grading scale, and meeting times.',
        competitor:
          "No dedicated syllabus-parsing or deadline-extraction feature found in Mindgrasp's public materials. It generates notes, summaries, flashcards, and quizzes from whatever document, video, or recording you upload, but doesn't build a due-date list from a syllabus.",
      },
      {
        feature: 'Canvas sync',
        semora:
          "Canvas import is free on every plan. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. Confirm your school's policy; if it is unavailable or not permitted, scan the syllabus or paste the Canvas assignment list into Semora.",
        competitor:
          'States compatibility with Canvas (along with Blackboard and Panopto), appearing to support importing/processing files from those platforms rather than syllabus or deadline parsing.',
      },
      {
        feature: 'Grade tracking',
        semora:
          'Included in the free tier; Pro adds Progress Insights with trend charts, CSV export, and a print view on web.',
        competitor:
          "Not publicly confirmed — no grade-tracking feature is described in Mindgrasp's available materials.",
      },
      {
        feature: 'Study planning',
        semora:
          "Pro's Smart Plan builds an AI-generated, deadline-adapting study schedule; the Workload dashboard flags crunch weeks; Academic Risk alerts warn of falling grades or overloaded weeks with a recovery plan.",
        competitor:
          'Generates flashcards and quizzes from uploaded content and offers an AI Tutor chat for Q&A; a Scholar/Premium tier adds an AI math expert. No dedicated study-schedule or deadline-planning feature was found.',
      },
      {
        feature: 'Pricing',
        semora:
          'Free tier available (one AI action for the life of the account — a scan, a lecture recording, or a document turned into notes — plus unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total). Pro is $3.99/month or $19.99/year, bought by card on the web or in the iOS app, applying account-wide across iPhone, iPad, and browser.',
        competitor:
          "The official plan picker, with Yearly selected on August 30, 2026, showed Basic at $5.99/month billed $71.88 once per year, Scholar at $8.99/month billed $107.88 once per year, and Premium at $10.99/month billed $131.88 once per year. The official site advertises a free trial; confirm the offer and any monthly-billing prices at checkout.",
      },
      {
        feature: 'Platform availability',
        semora: 'iPhone and iPad (one universal iOS app) plus web, sharing one account with near real-time sync between them.',
        competitor:
          'iOS app on the App Store (published by Apricot AI), plus a web app and a Chrome extension. Android availability is unclear — no dedicated Android app was found in the sources reviewed.',
      },
    ],
    pricingWin:
      "Semora Pro is $3.99/month or $19.99/year. Mindgrasp's official Yearly view starts at $5.99/month billed $71.88 once per year, so Semora's listed monthly and annual prices are lower; checked August 30, 2026.",
    whereSemoraFits: [
      'Want your syllabus turned into a calendar of deadlines automatically, instead of copying dates by hand',
      'Want grades, assignments, and class schedule tracked in one place all semester',
      'Want free Canvas import from the private Calendar Feed link Canvas already gives you, with syllabus scanning or pasted assignment text as the fallback',
      'Want an AI-generated study schedule that adapts as deadlines change',
      'Want to share a course and its deadlines with classmates',
    ],
    whereCompetitorFits: [
      'Have a specific lecture recording, PDF, slide deck, or video you want turned into notes, flashcards, and a quiz in one pass',
      'Want to pull study material from YouTube videos or web articles, not just files',
      'Want built-in step-by-step math help (on its higher tiers)',
      "Aren't looking for syllabus parsing or a semester-long deadline calendar at all",
    ],
    extraNote:
      'Many students use a syllabus-and-deadline tool like Semora for the semester-long structure, and a document-to-study-aid tool like Mindgrasp for turning individual lectures or readings into flashcards and quizzes — the two aren\'t mutually exclusive.',
    faq: [
      {
        question: 'Does Mindgrasp extract deadlines from a syllabus the way Semora does?',
        answer:
          "Based on Mindgrasp's public materials, no. Mindgrasp is built to turn a document, video, or recording you upload into notes, summaries, flashcards, and quizzes — it doesn't appear to parse a syllabus or extract assignment due dates onto a calendar. Semora is built specifically for that job: it reads a syllabus (photo, PDF, drag-and-drop, or pasted text) and automatically extracts every assignment, exam, quiz, and project with its due date.",
      },
      {
        question: 'Is Semora free to use?',
        answer:
          'Yes. Semora\'s free tier includes one AI action for the lifetime of the account — a syllabus scan, a lecture recording, or a document turned into notes — plus unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total, full task and deadline tracking, grade tracking, and same-day reminders. Pro ($3.99/month or $19.99/year) unlocks unlimited scans and courses plus additional features like Smart Plan, calendar sync, Flashcards, and an AI tutor.',
      },
      {
        question: 'Does Semora sync with Canvas?',
        answer:
          "Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. Google Classroom and Google Calendar sync exist in Semora's codebase but are not currently enabled or shipped as live features.",
      },
      {
        question: 'Which is cheaper, Semora or Mindgrasp?',
        answer:
          "Semora's pricing is confirmed directly: free, or Pro at $3.99/month or $19.99/year. Mindgrasp's official plan picker, with Yearly selected on August 30, 2026, showed Basic at $5.99/month billed $71.88 once per year, Scholar at $8.99/month billed $107.88 once per year, and Premium at $10.99/month billed $131.88 once per year. Semora's listed monthly and annual prices are lower, but confirm Mindgrasp's current offer and billing cadence at checkout.",
      },
    ],
  },
  {
    slug: 'taskade',
    name: 'Taskade',
    oneLiner:
      'A general-purpose AI workspace with seven project views, built for teams rather than students.',
    title: 'Semora vs Taskade: Syllabus & Deadline Tracking',
    metaDescription:
      'Semora turns a syllabus into deadlines, grades, and a schedule for students. Taskade is a general AI workspace for teams. Compare features and pricing.',
    lede: 'Semora is a syllabus-first app for iPhone, iPad, and web that turns a course syllabus into an organized semester (deadlines, grades, and a class schedule) while Taskade is a general-purpose AI workspace built around seven interchangeable project views (List, Board, Calendar, Table, Mind Map, Gantt, Org Chart) for teams, freelancers, and businesses, with no student- or course-specific features.',
    intro:
      "If you're comparing the two, it usually comes down to this: do you want a tool that already knows what a syllabus is, or a flexible blank-canvas workspace you configure yourself? This page walks through what each product actually does, how they price out, and where each one tends to fit best.",
    semoraParagraph:
      'An iPhone, iPad, and web app that imports a syllabus (by photo (multi-page, up to 5 pages), PDF upload, drag-and-drop on web, or pasted text) and uses OpenAI GPT-5.6 Luna to extract the course name, instructor, meeting times, office hours, semester dates, grading scale, and every assignment, exam, quiz, project, and reading with its due date. From there it tracks deadlines and grades, syncs to your device calendar, and (on Pro) builds a study plan around what it found.',
    competitorParagraph:
      "An AI-native workspace combining task/project management, docs, and chat-style collaboration. Its signature feature is seven project views that share the same underlying data with no conversion loss, plus the ability to build custom AI agents trained on your uploaded docs or links, deploy multi-agent \"teams,\" and run automations. It's explicitly general-purpose — marketed to businesses, nonprofits, and individuals alike, not students or courses specifically.",
    comparisonCaption: 'Semora vs Taskade across the areas that matter most for course and deadline management.',
    comparisonRows: [
      {
        feature: 'Syllabus & deadline handling',
        semora:
          'Import a syllabus by photo, PDF, drag-and-drop, or pasted text; OpenAI GPT-5.6 Luna extracts every assignment, exam, quiz, project, and reading with due dates automatically.',
        competitor:
          'No native document-parsing pipeline for pulling dates out of a syllabus PDF. Any equivalent workflow would need to be built manually with a custom agent or automation.',
      },
      {
        feature: 'Canvas LMS sync',
        semora:
          "Canvas import is free on every plan. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. Confirm your school's policy; if it is unavailable or not permitted, scan the syllabus or paste the Canvas assignment list into Semora.",
        competitor: 'No LMS integrations (Canvas, Blackboard, etc.) evident in its public feature set.',
      },
      {
        feature: 'Grade tracking',
        semora: "Built-in grade tracking tied to each course's grading scale, included on the free tier.",
        competitor:
          'No built-in academic-calendar or grade-tracking feature; a table or board could be configured manually to approximate one.',
      },
      {
        feature: 'Study planning',
        semora:
          'Pro adds Smart Plan (an AI-generated, timed study schedule that adapts to deadlines), a Workload dashboard for crunch weeks, spaced-repetition Flashcards, a Focus (Pomodoro) timer, and an AI tutor that knows your syllabus.',
        competitor:
          "Custom AI agents and automations can be configured to support planning-style workflows, but there's no purpose-built study-schedule or exam-crunch feature.",
      },
      {
        feature: 'Pricing',
        semora:
          'Free: one AI action for the life of the account (a syllabus scan, a lecture recording, or a document turned into notes), unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total, full task and grade tracking, and same-day reminders. Pro: $3.99/month or $19.99/year for unlimited scans and courses plus calendar sync and all other Pro features.',
        competitor:
          "Free: 1 user, 3 apps, one-time AI credits. Taskade's own pricing page lists Pro at $10/month billed annually; Business at $25/month billed annually; Max at $100/month billed annually. Non-annual (monthly-billed) rates are not publicly confirmed, and third-party sites report inconsistent numbers — check Taskade's current pricing page directly.",
      },
      {
        feature: 'Platform availability',
        semora:
          'iPhone, iPad, and web share one account and database, syncing in near real time. Pro can be bought by card on the web or in the iOS app, and either way applies account-wide.',
        competitor: 'Web, desktop, and mobile apps.',
      },
    ],
    tableNote:
      "All Semora details above come from Semora's own product specification. Taskade details are drawn from Taskade's public pricing/feature pages and independent review sources; anything not directly confirmed on Taskade's site is flagged as such.",
    pricingWin:
      "Semora Pro is $3.99/month or $19.99/year. Taskade's own pricing page lists Pro at $10/month billed annually (about $120/year), though Taskade is priced and built for teams, not individual students, so the two aren't a direct apples-to-apples comparison.",
    whereSemoraFits: [
      'You want deadlines and grades populated automatically from a syllabus photo or PDF instead of typing them in by hand.',
      'You want free Canvas import from the private Calendar Feed link Canvas already gives you, with syllabus scanning or pasted assignment text as the fallback.',
      'You want study tools built specifically around your own material — flashcards from your syllabus, a Pomodoro timer, an AI tutor that already knows your assignments, and alerts when a grade slips or a week is overloaded.',
      'You want to split a course with classmates — Course Spaces lets you share a course via an invite link with deadlines and group assignments syncing in real time.',
      'You move between an iPhone, an iPad, and a browser and want one account that stays in sync in near real time.',
    ],
    whereCompetitorFits: [
      "You need one workspace for tasks, docs, and team chat that isn't scoped to coursework — for a small remote team, a freelance practice, or a startup.",
      'You want to switch between List, Board, Calendar, Table, Mind Map, Gantt, and Org Chart views of the same data without losing information in the conversion.',
      "You want to build custom AI agents or multi-agent \"teams\" trained on your own docs, links, and project data for workflows well beyond a single class.",
      "You're provisioning multiple seats and want to compare per-seat pricing against tools like ClickUp, Notion, or Monday.",
    ],
    faq: [
      {
        question: 'Does Taskade automatically read a syllabus PDF and add the deadlines?',
        answer:
          "Not natively. Taskade has no publicly documented pipeline for parsing a syllabus PDF into dated assignments, and no LMS integrations are evident in its feature set. A user could try to approximate this with a manually configured AI agent, but it isn't a built-in workflow the way it is in Semora.",
      },
      {
        question: 'Does Semora integrate with Canvas?',
        answer:
          "Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve.",
      },
      {
        question: 'Which is cheaper for a student?',
        answer:
          "Semora's free tier includes one AI action for the lifetime of the account — a scan, a lecture recording, or a document turned into notes — usable across unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, with one semester total, plus full deadline and grade tracking; Pro is $3.99/month or $19.99/year. Taskade's free tier gives one user 3 apps and one-time AI credits, and Taskade's own pricing page lists Pro at $10/month billed annually — its plans and pricing are structured more around teams and seat counts than individual student use.",
      },
      {
        question: 'Can I use either one on iPhone, iPad, and web with the same account?',
        answer:
          "Yes for both. Semora's iPhone, iPad, and web apps share one account and database, syncing in near real time; Pro can be bought by card on the web or in the iOS app and applies account-wide either way. Taskade offers web, desktop, and mobile apps as well.",
      },
    ],
  },
  {
    slug: 'studley-ai',
    name: 'Studley AI',
    oneLiner:
      'A materials-first AI study app that turns uploaded PDFs, slides, and videos into flashcards, quizzes, and podcasts.',
    title: 'Semora vs Studley AI: Which Study App Is Right for You?',
    metaDescription:
      'Compare Semora and Studley AI: syllabus-driven deadline and grade tracking vs. AI flashcards, quizzes, and podcasts generated from uploaded study material.',
    lede: 'Semora is a syllabus-first app that automatically turns a scanned syllabus into a semester of deadlines and grades, while Studley AI is a materials-first app that turns whatever you upload — PDFs, slides, videos, or photos — into flashcards, quizzes, and AI-narrated study podcasts.',
    semoraParagraph:
      "Semora (iPhone, iPad, and web) starts with your syllabus. You import it by camera photo (multi-page, up to 5 pages), PDF upload, drag-and-drop on the web, or pasted text, and OpenAI GPT-5.6 Luna extracts the course name, instructor, meeting times, office hours, semester dates, grading scale, and every assignment, exam, quiz, project, and reading with its due date — building deadlines, a grade tracker, and a class schedule automatically.",
    competitorParagraph:
      'Studley AI (iOS, Android, and web) lets you upload PDFs, lecture slides, YouTube videos, article links, or a photo of handwritten notes, and its AI converts that material into a study set: flashcards, multiple-choice quizzes, fill-in-the-blank exercises, written-response tests, and an AI tutor for questions about that content. A "Solve" feature lets you photograph a homework problem for a step-by-step explanation, and a podcast feature turns material into AI-narrated audio. Progress is tracked across four mastery levels (unfamiliar, learning, familiar, mastered). Per its own App Store materials, Studley AI has been downloaded 460,000+ times with a 4.74/5 rating from 31,000+ reviews, and the company states over 1,000,000 users.',
    comparisonCaption:
      "Based on Semora's shipped features and Studley AI's own App Store listing and product site as of this writing.",
    comparisonRows: [
      {
        feature: 'Syllabus & deadline handling',
        semora:
          'Core purpose of the app. Photo, PDF, drag-and-drop, or pasted-text import auto-extracts every assignment, exam, quiz, project, and reading with due dates.',
        competitor:
          "No syllabus-parsing or deadline-extraction feature found in Studley AI's public materials. It converts uploaded material (PDFs, slides, YouTube videos, articles, photos) into study sets, not a due-date calendar.",
      },
      {
        feature: 'Canvas sync',
        semora:
          "Canvas import is free on every plan. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. Confirm your school's policy; if it is unavailable or not permitted, scan the syllabus or paste the Canvas assignment list into Semora.",
        competitor: "Not publicly described. No LMS integration is mentioned in Studley AI's available materials.",
      },
      {
        feature: 'Grade tracking',
        semora:
          'Included in the free tier; Pro adds Progress Insights with trend charts, CSV export, and a print view on web.',
        competitor:
          'Not publicly confirmed. Studley AI tracks mastery of uploaded study material across four levels (unfamiliar to mastered) rather than a course grade.',
      },
      {
        feature: 'Study planning',
        semora:
          "Pro's Smart Plan builds an AI-generated, deadline-adapting study schedule; the Workload dashboard flags crunch weeks; Academic Risk alerts warn of falling grades or overloaded weeks.",
        competitor:
          'A "Solve" feature gives step-by-step homework help from a photo, and an AI tutor answers questions about uploaded material. No dedicated study-schedule or deadline-planning feature was found.',
      },
      {
        feature: 'Pricing',
        semora:
          'Free tier available (one AI action for the life of the account — a scan, a lecture recording, or a document turned into notes — plus unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total). Pro is $3.99/month or $19.99/year, bought by card on the web or in the iOS app, applying account-wide across iPhone, iPad, and browser.',
        competitor:
          'Free: 1 study set per day. Unlimited: reported at $12.88/month or $97.76/year, per third-party review coverage of the app — check Studley AI\'s current pricing directly to confirm.',
      },
      {
        feature: 'Platform availability',
        semora: 'iPhone and iPad (one universal iOS app) plus web, sharing one account with near real-time sync between them.',
        competitor: 'iOS, Android, and web (studley.ai).',
      },
    ],
    pricingWin:
      "Semora Pro is $3.99/month or $19.99/year — roughly a third of Studley AI's reported Unlimited plan ($12.88/month or $97.76/year), per third-party review coverage.",
    whereSemoraFits: [
      'Want your syllabus turned into a calendar of deadlines automatically, instead of typing them in by hand',
      'Want grades, assignments, and class schedule tracked in one place all semester, included free',
      'Want free Canvas import from the private Calendar Feed link Canvas already gives you, with syllabus scanning or pasted assignment text as the fallback',
      'Want an AI-generated study schedule that adapts as deadlines change',
    ],
    whereCompetitorFits: [
      'Have a specific PDF, slide deck, YouTube video, or set of notes you want turned into flashcards and a quiz in one pass',
      'Want AI-narrated podcast-style summaries of study material',
      'Want a photo-based homework solver for step-by-step problem help',
      "Aren't looking for syllabus parsing or a semester-long deadline calendar at all",
    ],
    extraNote:
      "Studley AI's growth and download numbers above come from its own App Store materials and third-party review coverage, not from independent verification — treat them as the company's self-reported figures.",
    faq: [
      {
        question: 'Does Studley AI extract deadlines from a syllabus the way Semora does?',
        answer:
          "Based on its public materials, no. Studley AI is built to turn uploaded material — PDFs, slides, videos, articles, or photos — into flashcards, quizzes, and study aids; it doesn't appear to parse a syllabus or extract assignment due dates onto a calendar. Semora is built specifically for that job.",
      },
      {
        question: 'Is Semora or Studley AI free to use?',
        answer:
          "Semora's free tier includes one AI action for the lifetime of the account — a syllabus scan, a lecture recording, or a document turned into notes — plus unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total, full task and deadline tracking, grade tracking, and same-day reminders (calendar sync with .ics export is a Pro feature). Studley AI's free tier is reported as 1 study set per day, with an Unlimited plan around $12.88/month or $97.76/year per third-party review coverage.",
      },
      {
        question: 'Does Studley AI sync with Canvas?',
        answer:
          "Not publicly described. No Canvas or other LMS integration is mentioned in Studley AI's available materials. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve.",
      },
      {
        question: 'Which is cheaper, Semora or Studley AI?',
        answer:
          "Semora's pricing is confirmed directly: free, or Pro at $3.99/month or $19.99/year. Studley AI's Unlimited plan is reported at roughly $12.88/month or $97.76/year via third-party review coverage — check Studley AI's current pricing page to confirm exact figures.",
      },
    ],
  },
  {
    slug: 'myhomework',
    name: 'myHomework Student Planner',
    oneLiner:
      'A manually-entered, cross-platform student planner with optional LMS import — no AI syllabus scanning.',
    title: 'Semora vs myHomework: Which Planner Fits You?',
    metaDescription:
      'Compare Semora and myHomework Student Planner: AI syllabus scanning and grade tracking vs. a manually-entered, cross-platform planner with LMS import.',
    lede: 'Semora scans a syllabus and extracts deadlines and grades automatically, while myHomework Student Planner is a manually-entered planner that can also import assignments from Canvas and other LMS platforms, with broader platform coverage but less automation.',
    semoraParagraph:
      'Semora (iPhone, iPad, and web) turns a course syllabus into an organized semester. You import a syllabus by camera photo (multi-page, up to 5 pages), PDF upload, drag-and-drop on the web, or pasted text, and OpenAI GPT-5.6 Luna extracts the course name, instructor, meeting times, office hours, semester dates, grading scale, and every assignment, exam, quiz, project, and reading with its due date — building deadlines, grades, and a class schedule automatically.',
    competitorParagraph:
      "myHomework Student Planner lets students manually enter classes, assignments, and due dates, or import assignments from Canvas, D2L, Google Classroom, Blackboard, Schoology, and other platforms; with a premium account, myHomework automatically updates the planner as new assignments are added going forward. It includes 60+ customizable themes, homework widgets for phone, tablet, and PC, color-coded courses, and reminder notifications. It runs on iOS, Android, Mac, Windows, Chrome, and Kindle Fire. The company's primary current business focus has shifted toward a K-12 digital hall-pass product for schools, but the original Student Planner consumer app remains separately available and was still being updated as recently as early 2025.",
    comparisonCaption:
      "Based on Semora's shipped features and myHomework's App Store listing, in-app help documentation, and third-party review coverage as of this writing.",
    comparisonRows: [
      {
        feature: 'Syllabus & deadline handling',
        semora:
          'Photo, PDF, drag-and-drop, or pasted text — OpenAI GPT-5.6 Luna auto-extracts every assignment, exam, quiz, project, and reading with due dates.',
        competitor:
          'Manual entry of classes and assignments, or import from a supported LMS. No syllabus photo/PDF parsing.',
      },
      {
        feature: 'Canvas / LMS sync',
        semora:
          "Canvas import is free on every plan. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve. Confirm your school's policy; if it is unavailable or not permitted, scan the syllabus or paste the Canvas assignment list into Semora.",
        competitor:
          'Imports from Canvas, D2L, Google Classroom, Blackboard, and Schoology; a premium account auto-updates the planner with new assignments going forward, per the app\'s own help documentation.',
      },
      {
        feature: 'Grade tracking',
        semora:
          'Included in the free tier; Pro adds Progress Insights with trend charts, CSV export, and a print view on web.',
        competitor:
          'Not described as a core feature in available materials — myHomework is positioned around scheduling, reminders, and themes rather than grade calculation.',
      },
      {
        feature: 'Study planning',
        semora:
          "Pro's Smart Plan builds an AI-generated, deadline-adapting study schedule; the Workload dashboard flags crunch weeks; Flashcards, a Focus timer, and an AI tutor are included.",
        competitor:
          'No dedicated study-schedule, flashcard, or tutor feature found. The app focuses on the planner itself: themes, widgets, and notifications.',
      },
      {
        feature: 'Pricing',
        semora:
          'Free tier available (one AI action for the life of the account — a scan, a lecture recording, or a document turned into notes — plus unlimited classes synced free from Canvas, Blackboard or Moodle plus one course you add by hand within one semester, one semester total). Pro is $3.99/month or $19.99/year, bought by card on the web or in the iOS app, applying account-wide across iPhone, iPad, and browser.',
        competitor:
          'Free version with ads. An ad-free premium tier is reported around $4.99/year via third-party reviews (not confirmed on myHomework\'s current site), adding file attachments, external calendar access, planner sharing, and LMS imports.',
      },
      {
        feature: 'Platform availability',
        semora: 'iPhone, iPad, and web, sharing one account with near real-time sync between them.',
        competitor: 'iOS, Android, Mac, Windows, Chrome, Kindle Fire, and web — broader platform coverage than Semora.',
      },
    ],
    whereSemoraFits: [
      'Want deadlines and grades extracted automatically from a syllabus instead of typing every assignment in by hand',
      'Want grade tracking with a weighted average included free',
      'Want free Canvas import from the private Calendar Feed link Canvas already gives you, with syllabus scanning or pasted assignment text as the fallback',
      'Want study tools — Smart Plan, Flashcards, a Focus timer, an AI tutor — built around your own courses',
    ],
    whereCompetitorFits: [
      'Want one planner that runs natively on Mac, Windows, Kindle Fire, and Chrome, not just iPhone, iPad, and web',
      'Already keep your own schedule by manual entry and mainly want reminders, themes, and widgets',
      "Your school uses D2L, Blackboard, or Schoology rather than Canvas — myHomework's import reportedly covers all of them",
    ],
    faq: [
      {
        question: 'Does myHomework scan a syllabus the way Semora does?',
        answer:
          "No. myHomework is built around manual entry or importing assignments from a supported LMS — it doesn't read a syllabus photo or PDF. Semora is built specifically for that: it scans a syllabus and automatically extracts every assignment, exam, and reading with its due date.",
      },
      {
        question: 'Is myHomework free?',
        answer:
          'The base version is free with ads. An ad-free premium tier is reported around $4.99/year via third-party reviews, adding file attachments, external calendar access, planner sharing, and LMS imports — check the app\'s current listing to confirm the exact price.',
      },
      {
        question: 'Does myHomework sync with Canvas?',
        answer:
          "Yes. myHomework can import assignments from Canvas along with D2L, Google Classroom, Blackboard, and Schoology, and a premium account auto-updates the planner with new assignments going forward. Connecting Canvas takes one step: copy the private Calendar Feed link Canvas already gives you and paste it in. There is no access token to generate and nothing for your school to approve.",
      },
      {
        question: 'Which has more study tools beyond a calendar?',
        answer:
          'Semora Pro adds Smart Plan, a Workload dashboard, Flashcards, a Focus timer, and an AI tutor on top of free deadline and grade tracking. myHomework is focused on the planner itself — no dedicated study-schedule, flashcard, or tutor feature was found in its available materials.',
      },
    ],
  },
];

export function getCompetitor(slug: string): CompetitorFact | undefined {
  return COMPETITORS.find((c) => c.slug === slug);
}
