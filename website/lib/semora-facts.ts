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

/**
 * The numeric App Store id, on its own.
 *
 * Needed separately from APP_STORE_URL because Safari's Smart App Banner takes
 * the bare id, not a link. Derived here rather than written twice so the two
 * cannot drift apart.
 */
export const APP_STORE_ID = '6762589321';

export const APP_STORE_URL = `https://apps.apple.com/us/app/semora-ai-syllabus-scanner/id${APP_STORE_ID}`;

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
    monthly: { price: 4.99, priceLabel: '$4.99/month' },
    annual: { price: 29.99, priceLabel: '$29.99/year' },
    // Pro can be bought two ways: with a card on the web (Stripe checkout at
    // app.semoraai.com) or inside the iOS app (StoreKit). Both grant the same
    // account-wide entitlement, so it applies on iPhone, iPad and the web.
    purchaseNote:
      'Pro can be bought with a card on the web or in the iOS app, and applies to your whole account either way.',
  },
} as const;

// "Pro ($4.99/month or $29.99/year)" — used anywhere a table/header needs
// the full price inline instead of just the tier name, so monthly AND
// annual both stay visible without retyping the figures.
export const PRO_LABEL = `Pro (${PRICING.pro.monthly.priceLabel} or ${PRICING.pro.annual.priceLabel})`;

// Derived once here so the pricing toggle (and anywhere else that needs the
// per-month-when-billed-annually figure or the savings callout) never
// hand-computes it from the raw numbers above.
// The bare amount, with no period attached.
//
// priceLabel already reads "$4.99/month", which the pricing cards cannot use:
// they print the period themselves in separate markup ("per month" / "al
// mes"), so priceLabel would render it twice. So the cards hardcoded '$4.99'
// and '$29.99' — four times, in a file that imports PRICING on line three.
// A price change would have edited the constant above, left the pricing page
// showing the old number, and looked correct on review because the import was
// right there. Derived here so that cannot happen.
export const PRO_MONTHLY_AMOUNT = `$${PRICING.pro.monthly.price.toFixed(2)}`;
export const PRO_ANNUAL_AMOUNT = `$${PRICING.pro.annual.price.toFixed(2)}`;

export const PRO_ANNUAL_MONTHLY_EQUIVALENT = `$${(PRICING.pro.annual.price / 12).toFixed(2)}`;
// What annual actually saves, in money rather than a percentage.
//
// The percentage was the only saving on the page, and a percentage of a small
// number reads as small. $29.89 is a figure a student recognises as money.
// Both now appear: the badge keeps the percentage because it is punchy at a
// glance, and the line under the price carries the dollars.
export const PRO_ANNUAL_SAVINGS_AMOUNT = `$${(PRICING.pro.monthly.price * 12 - PRICING.pro.annual.price).toFixed(2)}`;

export const PRO_ANNUAL_SAVINGS_PCT = Math.round(
  (1 - PRICING.pro.annual.price / 12 / PRICING.pro.monthly.price) * 100
);

// The one-semester cap is NOT cosmetic: FREE_SEMESTER_LIMIT = 1 in
// lib/syllabus.ts is enforced client-side AND by the
// enforce_free_semester_limit_trigger BEFORE INSERT trigger on
// public.semesters (migration 010). A free account cannot start a second term
// at all, and the site must keep saying so.
//
// It is no longer repeated inside these bullets. Bolted onto the course line
// it turned the free card into a list of things you do not get, which is the
// wrong argument to make to someone who has not started yet. It is stated
// once, plainly and prominently, on the pricing page itself — the header line
// in app/(en)/pricing/page.tsx and the "Is Semora free?" answer beneath it.
// Do not remove it from there, and do not scatter it back through here.
//
// The free AI allowance is ONE action for the lifetime of the account — not a
// monthly quota. Nothing resets on the 1st. The student picks what to spend it
// on (syllabus scan, lecture recording, or document-to-notes), and after that
// every AI action is Pro. Never reintroduce "per month" language here.
export const FREE_FEATURES = [
  // This leads because it is the biggest thing the free tier does, and the
  // thing a student can act on tonight. All three providers are free on every
  // plan — see the note above PRO_FEATURES for why no LMS line belongs there.
  //
  // "No cap on how many" is an entitlement claim and it is exact: the
  // course-cap trigger returns early for source='lms' rows and never counts
  // them, on free exactly as on Pro. Real free accounts hold up to 8.
  //
  // "Bring across" rather than "imports itself" — choosing which classes come
  // over is a step the student takes, at connect and again when a new term
  // fills the feed. What IS automatic is everything after, which is the half
  // of the product the bullet has to earn.
  'Every class you take, free: Canvas, Blackboard and Moodle all sync on the free plan, with no cap on how many — and they stay right when an instructor moves a deadline',
  // The one-step claim is true of CANVAS ONLY. Blackboard and Moodle are free
  // too, but they use a school-issued token, so this must not be folded into
  // the bullet above.
  'Canvas connects in one step: paste the link Canvas already gives you. No token, nothing for IT to approve',
  'Your first AI action, free: a syllabus scan, a lecture recording, or a document turned into notes — you choose',
  // Exact, and the exemption travels WITH the limit in the same breath — the
  // product-facts check enforces that, because "1 course" read alone says
  // Semora is a one-class app until you pay, which is the opposite of what the
  // free tier gives a Canvas student. "Plus a course you add by hand" was too
  // vague to carry the number at all.
  'Plus 1 course you add by hand, in one semester — Canvas, Blackboard and Moodle classes never count toward that limit',
  'Every deadline, task and exam from every course, in one list',
  'Grade tracking with weighted averages, so you know where you actually stand',
  'Same-day reminders, on by default',
  'Course Spaces: join a course a classmate shares with you',
] as const;

// Calendar sync (device calendar + .ics export) is Pro-only in the shipping
// app (app/settings/calendar.tsx gates handleExport behind isPro) — do not
// move it back to FREE_FEATURES without re-checking the app first.
//
// There is deliberately NO LMS line here. Canvas, Blackboard and Moodle are
// all free on every plan. A Pro bullet claiming otherwise outlived four
// separate commits that made the LMS free across the rest of the site, and
// the Spanish card was still selling Canvas itself while the Free card beside
// it gave Canvas away. Do not re-add it.
//
// "No cap on AI actions" is gone for the same reason. Pro scanning has no
// quota, but a fair-use ceiling of 20 extractions per rolling 24 hours applies
// to every account including Pro — page-content.ts says in as many words that
// Pro should be described as having no quota rather than as unlimited. The
// bullet now says both halves, because the number is not embarrassing.
export const PRO_FEATURES = [
  'Unlimited courses and semesters — next term sets up just like this one',
  'No AI quota: scan, record and generate all term, with fair use of 20 scans a day',
  'Record every lecture, not just one — transcript, notes, a practice quiz and flashcards from each',
  'Course Spaces: host your own shared course and invite classmates',
  'Smart Plan: an AI-generated study schedule that adapts to your deadlines',
  'Workload dashboard: see crunch weeks and exam-dense stretches coming',
  'AI-generated flashcards from your syllabus and notes, with spaced repetition',
  'Focus Timer (Pomodoro-style)',
  'AI Tutor chat grounded in your syllabus, notes, and deadlines',
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
  /**
   * Overrides the hero's default "Free to use. No credit card." line.
   *
   * Two free features are free to TRY rather than free to use: a scan and a
   * lecture each spend the account's single lifetime AI action, so the default
   * sentence promised unlimited use of something you get once. Everything else
   * on the free tier genuinely has no ceiling.
   */
  freeNote?: string;
  description: string;
}

export const FEATURES: FeatureFact[] = [
  {
    slug: 'syllabus-scanner',
    name: 'AI Syllabus Scanner',
    shortDescription:
      'Turn a syllabus photo or PDF into a full calendar of deadlines, grades, and class times.',
    tier: 'free',
    freeNote:
      'Free to try. The free plan includes one AI action for the life of the account — spend it on a scan. Pro is unlimited.',
    description:
      "Take a photo or upload a PDF of your syllabus and Semora's AI extracts every assignment, exam, and deadline automatically. Review and edit everything before saving. Nothing is added to your calendar without your confirmation. Free accounts get one AI action for the lifetime of the account, and a scan is one way to spend it; Pro is unlimited.",
  },
  {
    slug: 'canvas-sync',
    name: 'Canvas Sync',
    shortDescription:
      'Connect Canvas free, bring across as many classes as you take, and they stay right when an instructor moves a deadline.',
    // Free while the `canvas_free` promo runs, and the promo row currently has
    // no end date. The gate is lms_access_allowed(uid) in migration 090, which
    // is is_pro() OR the promo OR an account that connected while it ran — so a
    // free user connecting today passes the server check in lms-sync, the
    // provider list in app/settings/lms.tsx, and app/settings/lms-connect.tsx.
    //
    // This is therefore only true while that row stays active. If the promo is
    // ever switched off, this must go back to 'pro' in the same change, or a
    // free user who installs on the promise here hits a 402 at the first tap.
    tier: 'free',
    description:
      "Canvas sync is free right now, on every account, with no limit on how many classes come across — this is a limited-time offer, and an account that connects while it runs never loses free Canvas import. One thing worth knowing before next term: a free account covers one semester, so setting up a new one is where Pro comes in. The classes you already connected keep syncing either way. It uses the private calendar feed Canvas already gives you, so there is no access token to generate and nothing for your IT department to approve. Once connected it re-checks Canvas every few hours on its own — hourly if you are mid-semester and using the app: a deadline your instructor moves is right in Semora without anyone doing anything, and an assignment they delete disappears from your list instead of nagging you. One honest limit — the calendar feed carries dates, not marks, so your grades are still yours to enter. Blackboard and Moodle import is free on every plan, uses a school-issued token, and varies by school.",
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
    slug: 'lecture-recording',
    name: 'Lecture Recording',
    shortDescription:
      'Record a class and get a transcript, written notes, a practice quiz and a flashcard deck from it.',
    tier: 'free',
    freeNote:
      'Free to try. The free plan includes one AI action for the life of the account — spend it on a lecture. Pro is unlimited.',
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
    slug: 'ai-tutor',
    name: 'AI Tutor',
    shortDescription: 'An AI Tutor chat grounded in your actual syllabus, notes, and deadlines.',
    tier: 'pro',
    description:
      "Open a chat scoped to any course and ask it anything. The tutor answers from that course's real syllabus, your live tracked deadlines, and any lecture notes you upload (PDF or photo), instead of guessing from generic knowledge. It cites what it used naturally, like \"your syllabus lists…\" or \"from your Week 3 notes…\", and for deadline questions it answers strictly from your actual tracked tasks. It never invents a date. Ask if a question falls outside what you've given it, it says so plainly and helps with general knowledge instead of making something up.",
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
    slug: 'focus-timer',
    name: 'Focus Timer',
    shortDescription: 'A Pomodoro-style timer for study sessions between classes.',
    tier: 'pro',
    description:
      'A built-in Pomodoro-style focus timer for study sessions, sized for the real gaps in a college schedule rather than an open-ended block of time.',
  },
];

export function getFeature(slug: string): FeatureFact | undefined {
  return FEATURES.find((f) => f.slug === slug);
}
