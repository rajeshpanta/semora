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
  'Semora turns a syllabus photo or PDF into a full semester calendar — deadlines, grades, and class times — then helps you plan around it with Smart Plan, flashcards, a focus timer, and an AI tutor.';

export const APP_STORE_URL = 'https://apps.apple.com/us/app/semora-ai-syllabus-scanner/id6762589321';

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

// Matches docs/support.html's existing contact-box mailto — semora.app
// belongs to an unrelated company, so there is no @semora.app inbox.
export const SUPPORT_EMAIL = 'rajesh.panta08@gmail.com';

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
    // Purchases happen in the iOS app (StoreKit) and the entitlement applies
    // account-wide, including on the web — there is no separate web checkout.
    purchaseNote:
      'Pro is purchased in the app and applies to your whole account, including web.',
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
export const FREE_FEATURES = [
  '5 syllabus scans per calendar month',
  'Up to 4 courses, in one semester',
  'Full deadline and task tracking',
  'Grade tracking with weighted averages',
  'Same-day reminders',
  'Course Spaces — join a course a classmate shares with you',
] as const;

// Calendar sync (device calendar + .ics export) is Pro-only in the shipping
// app (app/settings/calendar.tsx gates handleExport behind isPro) — do not
// move it back to FREE_FEATURES without re-checking the app first.
export const PRO_FEATURES = [
  'Unlimited courses and semesters, with no monthly scan cap',
  'Canvas, Blackboard, and Moodle assignment import',
  'Course Spaces — host your own shared course and invite classmates',
  'Smart Plan — an AI-generated study schedule that adapts to your deadlines',
  'Workload dashboard — see crunch weeks and exam-dense stretches coming',
  'AI-generated flashcards from your syllabus and notes, with spaced repetition',
  'Focus timer (Pomodoro-style)',
  'AI tutor chat grounded in your syllabus, notes, and deadlines',
  'Grade Scale & Forecasting — customize your grading scale, plus what-if calculators for your final grade',
  "Calendar sync to your device's calendar app, with .ics export",
  'Custom reminder timing (1-day and 3-day advance notice)',
  'Academic Risk alerts',
  'Progress Insights — trend charts, CSV export, and a print view',
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
  | 'canvas-sync';

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
      "Take a photo or upload a PDF of your syllabus and Semora's AI extracts every assignment, exam, and deadline automatically. Review and edit everything before saving — nothing is added to your calendar without your confirmation. Free accounts get 5 scans per calendar month; Pro is unlimited.",
  },
  {
    slug: 'grade-tracking',
    name: 'Grade Tracking',
    shortDescription:
      'A running weighted average built from the scores and weights you enter for each assignment.',
    tier: 'free',
    description:
      'Enter the score and weight for each graded assignment and Semora calculates your current weighted average automatically — reflecting only the work graded so far, so you always know where you stand in a course. Pro adds Grade Scale & Forecasting: customize the letter-grade cutoffs your school actually uses, and run what-if calculators that show what score you need on what’s left to hit a target grade.',
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
      "Generate a full deck in seconds from a course's scanned syllabus and any lecture notes you've uploaded — Semora already has that material from the scan, so there's nothing new to type or upload. Pick your focus first: the whole course, or one specific exam or quiz pulled straight from your tracked deadlines, so a midterm review doesn't get diluted with material from finals. Got a teacher-provided review packet? Attach it as a PDF or photo and it becomes part of what gets generated from. Prefer to build your own? Every deck also supports manual cards. Either way, review happens on a spaced-repetition schedule, so time goes toward the material you're most likely to forget, not material you already know cold.",
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
      "Open a chat scoped to any course and ask it anything — the tutor answers from that course's real syllabus, your live tracked deadlines, and any lecture notes you upload (PDF or photo), instead of guessing from generic knowledge. It cites what it used naturally, like \"your syllabus lists…\" or \"from your Week 3 notes…\", and for deadline questions it answers strictly from your actual tracked tasks — it never invents a date. Ask if a question falls outside what you've given it, it says so plainly and helps with general knowledge instead of making something up.",
  },
  {
    slug: 'collaboration',
    name: 'Course Spaces',
    shortDescription:
      'Host a shared course and invite classmates — deadlines and group assignments sync in real time. Joining is free.',
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
      'Import assignments from Canvas, Blackboard, or Moodle with a token you generate yourself — no OAuth app review.',
    // Pro, NOT free. Gated in three places in the shipping app: a server-side
    // is_pro() check in supabase/functions/lms-sync (402 PRO_REQUIRED), the
    // provider list in app/settings/lms.tsx, and a paywall bounce in
    // app/settings/lms-connect.tsx. Do not flip this back to 'free' — a free
    // user who installs on that promise hits a paywall at the first tap.
    tier: 'pro',
    description:
      "Semora imports assignments from Canvas — and from Blackboard or Moodle — using a personal access token you generate yourself in the platform's own settings, rather than an OAuth connection that depends on your school's IT department approving a third-party app review. Connecting a learning platform is part of Pro; on the free tier you can still get Canvas coursework in by pasting the assignment text straight into the syllabus scanner.",
  },
];

export function getFeature(slug: string): FeatureFact | undefined {
  return FEATURES.find((f) => f.slug === slug);
}
