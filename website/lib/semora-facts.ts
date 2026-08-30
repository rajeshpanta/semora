/**
 * Single source of truth for every Semora product fact used across the
 * marketing site — pricing, feature copy, free-vs-Pro breakdown. Pages
 * should import from here instead of re-typing numbers, so a price change
 * only needs one edit.
 *
 * Facts below were verified against the shipping app (lib/purchases.ts,
 * app.json) and the already fact-checked marketing-pages/*.html during the
 * 2026-07 SEO project — do not adjust a number here without re-checking it
 * against the app.
 */

export const SITE_NAME = 'Semora';

export const TAGLINE = 'Scan your syllabus. Never miss a deadline.';

export const SITE_DESCRIPTION =
  // Kept under ~155 characters on purpose: past that Google truncates the
  // snippet and appends a "Read more" expander, which is what the homepage
  // result looked like at 196. The tail it was cutting ("...flashcards, a focus
  // timer, and an AI tutor") was the least load-bearing half of the sentence.
  'Semora turns a syllabus photo or PDF into a full semester calendar, with every deadline, exam and grading weight organized automatically.';

export const APP_STORE_URL = 'https://apps.apple.com/us/app/semora-ai-syllabus-scanner/id6762589321';

/**
 * Where every "Get the app" control points.
 *
 * NOT the App Store directly. Semora runs on more than one kind of device and
 * is heading for more, so a button labelled "Get the app" that lands an Android
 * or Mac visitor on an iOS listing they cannot install is a dead end at the
 * exact moment they decided to say yes. /download shows every surface, with a
 * scannable code for the ones that are ready, and tells the truth about the
 * ones that are not.
 *
 * The App Store link itself still lives above, for the places that genuinely
 * mean the iOS listing (structured data, the support page).
 */
export const DOWNLOAD_PATH = '/download';
export const DOWNLOAD_PATH_ES = '/es/descargar';

export function downloadPath(locale: 'en' | 'es' = 'en'): string {
  return locale === 'es' ? DOWNLOAD_PATH_ES : DOWNLOAD_PATH;
}

// The Expo web app, deployed to Vercel (semora1/semora-app) and bound to the
// app.semoraai.com custom domain. Every CTA on this site links here so a
// single edit fixes every "Get started" button at once.
export const APP_URL = 'https://app.semoraai.com';

// The app's auth screen renders two framings off one route. With no query it
// reads "Create your account"; with ?mode=signin it reads "Welcome back". The
// app source anticipates exactly this split (app/(auth)/sign-in.tsx), so the
// marketing site must send new and returning users to different URLs — both
// pointing at /sign-in makes the Sign in link land on a signup page.
export const APP_SIGNUP_URL = `${APP_URL}/sign-in`;
export const APP_SIGNIN_URL = `${APP_URL}/sign-in?mode=signin`;

// One public support address used consistently by the Support page, footer,
// privacy policy, terms, and structured data.
export const SUPPORT_EMAIL = 'semora365@gmail.com';

export const PRICING = {
  free: {
    name: 'Free',
    price: 0,
    priceLabel: '$0',
    period: null,
  },
  pro: {
    name: 'Pro',
    monthly: { price: 3.99, priceLabel: '$3.99/month' },
    annual: { price: 19.99, priceLabel: '$19.99/year' },
    // Pro can be bought two ways: with a card on the web (Stripe checkout at
    // app.semoraai.com) or inside the iOS app (StoreKit). Both grant the same
    // account-wide entitlement, so it applies on iPhone, iPad and the web.
    purchaseNote:
      'Pro can be bought with a card on the web or in the iOS app, and applies to your whole account either way.',
  },
} as const;

// "Pro ($3.99/month or $19.99/year)" — used anywhere a table/header needs
// the full price inline instead of just the tier name, so monthly AND
// annual both stay visible without retyping the figures.
export const PRO_LABEL = `Pro (${PRICING.pro.monthly.priceLabel} or ${PRICING.pro.annual.priceLabel})`;

// Derived once here so the pricing toggle (and anywhere else that needs the
// per-month-when-billed-annually figure or the savings callout) never
// hand-computes it from the raw numbers above.
export const PRO_ANNUAL_MONTHLY_EQUIVALENT = `$${(PRICING.pro.annual.price / 12).toFixed(2)}`;
export const PRO_ANNUAL_SAVINGS_PCT = Math.round(
  (1 - PRICING.pro.annual.price / 12 / PRICING.pro.monthly.price) * 100
);

// The one-semester cap is NOT cosmetic: FREE_SEMESTER_LIMIT = 1 in
// lib/syllabus.ts is enforced client-side AND by the
// enforce_free_semester_limit_trigger BEFORE INSERT trigger on
// public.semesters (migration 010). A free account cannot start a second
// term at all, so "4 courses per semester" alone reads as if terms roll
// over — they do not. Do not drop this line.
// The free AI allowance is ONE action for the lifetime of the account — not a
// monthly quota. Nothing resets on the 1st. The student picks what to spend it
// on (syllabus scan, lecture recording, or document-to-notes), and after that
// every AI action is Pro. Never reintroduce "per month" language here.
export const FREE_FEATURES = [
  'One AI action for the lifetime of the account: a syllabus scan, a lecture recording, or a document turned into notes',
  'Canvas sync, free and unlimited: connect Canvas and every class you take imports itself, then keeps itself up to date — no Pro, no token, no IT approval',
  'Up to 1 course you add by hand in one semester (classes that arrive from Canvas do not count towards it); one semester total on free',
  'Full deadline and task tracking',
  'Grade tracking with weighted averages',
  'Same-day reminders',
  'Course Spaces: join a course a classmate shares with you',
] as const;

// Calendar sync (device calendar + .ics export) is Pro-only in the shipping
// app (app/settings/calendar.tsx gates handleExport behind isPro) — do not
// move it back to FREE_FEATURES without re-checking the app first.
export const PRO_FEATURES = [
  'Unlimited courses you add by hand, unlimited semesters, and no cap on AI actions',
  'Blackboard and Moodle assignment import (Canvas is free for everyone)',
  'Course Spaces: host your own shared course and invite classmates',
  'Smart Plan: an AI-generated study schedule that adapts to your deadlines',
  'Workload dashboard: see crunch weeks and exam-dense stretches coming',
  'AI-generated flashcards from your syllabus and notes, with spaced repetition',
  'Focus timer (Pomodoro-style)',
  'AI tutor chat grounded in your syllabus, notes, and deadlines',
  'Grade Scale & Forecasting: customize your grading scale, plus what-if calculators for your final grade',
  "Calendar sync to your device's calendar app, with .ics export",
  'Custom reminder timing (1-day and 3-day advance notice)',
  'Academic Risk alerts',
  'Progress Insights: trend charts, CSV export, and a print view',
  'Share & Streaks',
] as const;

export type FeatureSlug =
  | 'syllabus-scanner'
  | 'grade-tracking'
  | 'smart-plan'
  | 'flashcards'
  | 'focus-timer'
  | 'ai-tutor'
  | 'collaboration'
  | 'canvas-sync'
  | 'lecture-recording'
  | 'apple-watch';

export interface FeatureFact {
  slug: FeatureSlug;
  name: string;
  shortDescription: string;
  tier: 'free' | 'pro';
  description: string;
}

export const FEATURES: FeatureFact[] = [
  {
    slug: 'syllabus-scanner',
    name: 'AI Syllabus Scanner',
    shortDescription:
      'Turn a syllabus photo or PDF into a full calendar of deadlines, grades, and class times.',
    tier: 'free',
    description:
      "Take a photo or upload a PDF of your syllabus and Semora's AI extracts every assignment, exam, and deadline automatically. Review and edit everything before saving. Nothing is added to your calendar without your confirmation. Free accounts get one AI action for the lifetime of the account, and a scan is one way to spend it; Pro is unlimited.",
  },
  {
    slug: 'grade-tracking',
    name: 'Grade Tracking',
    shortDescription:
      'A running weighted average built from the scores and weights you enter for each assignment.',
    tier: 'free',
    description:
      'Enter the score and weight for each graded assignment and Semora calculates your current weighted average automatically, reflecting only the work graded so far, so you always know where you stand in a course. Pro adds Grade Scale & Forecasting: customize the letter-grade cutoffs your school actually uses, and run what-if calculators that show what score you need on what’s left to hit a target grade.',
  },
  {
    slug: 'smart-plan',
    name: 'Smart Plan',
    shortDescription:
      'An AI-generated study schedule that adapts to your real deadlines across every course.',
    tier: 'pro',
    description:
      'Smart Plan looks at every deadline across your courses and builds a study schedule around them, adjusting as deadlines change or shift. Pairs with the Workload dashboard, which flags crunch weeks and exam-dense stretches before they catch you off guard.',
  },
  {
    slug: 'flashcards',
    name: 'Flashcards',
    shortDescription: 'AI-generated or hand-built flashcards, reviewed on a spaced-repetition schedule.',
    tier: 'pro',
    description:
      "Generate a full deck in seconds from a course's scanned syllabus and any lecture notes you've uploaded. Semora already has that material from the scan, so there's nothing new to type or upload. Pick your focus first: the whole course, or one specific exam or quiz pulled straight from your tracked deadlines, so a midterm review doesn't get diluted with material from finals. Got a teacher-provided review packet? Attach it as a PDF or photo and it becomes part of what gets generated from. Prefer to build your own? Every deck also supports manual cards. Either way, review happens on a spaced-repetition schedule, so time goes toward the material you're most likely to forget, not material you already know cold.",
  },
  {
    slug: 'focus-timer',
    name: 'Focus Timer',
    shortDescription: 'A Pomodoro-style timer for study sessions between classes.',
    tier: 'pro',
    description:
      'A built-in Pomodoro-style focus timer for study sessions, sized for the real gaps in a college schedule rather than an open-ended block of time.',
  },
  {
    slug: 'ai-tutor',
    name: 'AI Tutor',
    shortDescription: 'An AI tutor chat grounded in your actual syllabus, notes, and deadlines.',
    tier: 'pro',
    description:
      "Open a chat scoped to any course and ask it anything. The tutor answers from that course's real syllabus, your live tracked deadlines, and any lecture notes you upload (PDF or photo), instead of guessing from generic knowledge. It cites what it used naturally, like \"your syllabus lists…\" or \"from your Week 3 notes…\", and for deadline questions it answers strictly from your actual tracked tasks. It never invents a date. Ask if a question falls outside what you've given it, it says so plainly and helps with general knowledge instead of making something up.",
  },
  {
    slug: 'collaboration',
    name: 'Course Spaces',
    shortDescription:
      'Host a shared course and invite classmates. Deadlines and group assignments sync in real time. Joining is free.',
    // Pro covers HOSTING. Joining a space someone invites you to is free and
    // always will be — migration 045_gate_collaboration_create.sql gates only
    // create_course_collaboration behind is_pro(), and share-course returns
    // 402 PRO_REQUIRED for sending. Do not mark this 'free': a free user who
    // installs expecting to share a course hits a paywall.
    tier: 'pro',
    description:
      'Course Spaces let you share a course with classmates through an invite link, with deadlines and group assignments syncing in real time so everyone sees the same up-to-date calendar. Hosting a space is part of Pro; joining one a classmate invites you to is free, with no time limit and no Pro required.',
  },
  {
    slug: 'canvas-sync',
    name: 'Canvas Sync',
    shortDescription:
      'Connect Canvas free and every class you are enrolled in imports itself, then stays right when an instructor moves a deadline.',
    // Pro, NOT free. Gated in three places in the shipping app: a server-side
    // is_pro() check in supabase/functions/lms-sync (402 PRO_REQUIRED), the
    // provider list in app/settings/lms.tsx, and a paywall bounce in
    // app/settings/lms-connect.tsx. Do not flip this back to 'free' — a free
    // user who installs on that promise hits a paywall at the first tap.
    tier: 'pro',
    description:
      "Canvas sync is free right now, on every account, with no limit on how many classes come across — this is a limited-time offer, and an account that connects while it runs keeps free Canvas sync for good. It uses the private calendar feed Canvas already gives you, so there is no access token to generate and nothing for your IT department to approve. Once connected it re-checks Canvas about hourly on its own: a deadline your instructor moves is right in Semora without anyone doing anything, and an assignment they delete disappears from your list instead of nagging you. One honest limit — the calendar feed carries dates, not marks, so your grades are still yours to enter. Blackboard and Moodle import is a Pro feature, uses a personal access token, and varies by school.",
  },
  {
    slug: 'lecture-recording',
    name: 'Lecture Recording',
    shortDescription:
      'Record a class and get a transcript, written notes, a practice quiz and a flashcard deck from it.',
    tier: 'free',
    description:
      "Record a lecture from your phone and Semora transcribes it, then writes structured notes, a multiple-choice practice quiz with explanations, and a flashcard deck from the same transcript. Capture is chunked into five-minute segments, so a phone that dies or an app the system kills costs you the last few minutes rather than the whole class. The audio itself is deleted as soon as the transcript is written. Free accounts get one AI action for the lifetime of the account and a lecture is one way to spend it; Pro is where you record more than one.",
  },
  {
    slug: 'apple-watch',
    name: 'Apple Watch',
    shortDescription:
      "What's due today and what's overdue, on your wrist and on your watch face \u2014 and you can tick a task off from there.",
    tier: 'free',
    description:
      "The Watch app shows the two numbers that matter between classes: what is due today and what is already overdue, with the list underneath. Complications put the same counts on your watch face, so the answer arrives without opening anything. Completing a task from the wrist runs the same code path as completing it on the phone, so reminders are cancelled and calendar events cleaned up exactly as they would be. It installs with the iPhone app, on the same purchase.",
  },
];

export function getFeature(slug: string): FeatureFact | undefined {
  return FEATURES.find((f) => f.slug === slug);
}
