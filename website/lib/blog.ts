export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  modified?: string;
  image: string;
  imageAlt: string;
}

/**
 * Blog post registry powering the /blog index and sitemap.ts. Each slug
 * also has its own app/blog/<slug>/page.mdx with a matching `export const
 * metadata` — keep the title/description here in sync with that file.
 */
export const BLOG_POSTS: BlogPostMeta[] = [
  {
    slug: 'syllabus-to-semester-calendar',
    title: 'How to Turn a Syllabus Into a Semester Calendar',
    description:
      'A step-by-step guide to converting a course syllabus into a working semester calendar, plus how Semora automates the whole process.',
    date: '2026-07-20',
    modified: '2026-08-09',
    image: '/illustrations/syllabus-calendar.svg',
    imageAlt: 'A friendly character waving beside a syllabus page turning into a month grid, one date highlighted',
  },
  {
    slug: 'best-college-deadline-tracking-apps-2026',
    title: 'Best Apps for Tracking College Deadlines in 2026',
    description:
      'A practical look at how paper planners, generic to-do apps, and syllabus-aware tools hold up for a full course load.',
    date: '2026-07-22',
    modified: '2026-08-09',
    image: '/illustrations/trophy-compare.svg',
    imageAlt: 'A friendly character standing on the middle of three app cards, which carries a check mark',
  },
  {
    slug: 'canvas-deadline-reminders',
    title: 'Canvas Deadline Reminders: Get Advance Alerts',
    description:
      "Why Canvas notifications are easy to miss, and how to layer real advance reminders and grade tracking on top of your existing Canvas assignments.",
    date: '2026-07-23',
    modified: '2026-08-09',
    image: '/illustrations/bell-reminder.svg',
    imageAlt: 'A friendly character waving beside a clock radiating signal rings into notification cards',
  },
  {
    slug: 'pomodoro-technique-between-classes',
    title: 'Pomodoro Between Classes: A College Schedule',
    description:
      'How to adapt the Pomodoro technique to the actual gaps in a college schedule, instead of the idealized unbroken hours it assumes.',
    date: '2026-07-24',
    modified: '2026-08-09',
    image: '/illustrations/tomato-timer.svg',
    imageAlt: 'A friendly character sitting beside a circular focus timer reading 18:42',
  },
  {
    slug: 'finals-week-study-plan',
    title: 'How to Build a Study Plan for Finals Week',
    description:
      'A framework for planning finals week around exam density and weighting, and how Semora surfaces the weeks that need the plan most.',
    date: '2026-07-25',
    image: '/illustrations/book-stack.svg',
    imageAlt: 'A friendly character beside a week of study blocks, with one exam block highlighted',
  },
  {
    slug: 'best-ai-study-apps-for-college-2026',
    title: 'The Best AI Study Apps for College Students in 2026',
    description:
      'Seven AI study apps compared on what they actually do — syllabus scanning, flashcards, tutoring, grade tracking — plus which category fits which problem.',
    date: '2026-08-05',
    modified: '2026-08-09',
    image: '/illustrations/ai-study-apps.svg',
    imageAlt: 'A friendly character beside a shortlist of three app cards, the top one marked with a check',
  },
  {
    slug: 'ai-flashcards-from-lecture-notes',
    title: 'How to Make Flashcards From Your Lecture Notes With AI',
    description:
      'What makes an AI-generated flashcard worth reviewing, how spaced repetition decides when you see it again, and how the tools compare on where the cards come from.',
    date: '2026-08-07',
    modified: '2026-08-09',
    image: '/illustrations/flashcard-deck.svg',
    imageAlt: 'A friendly character beside a deck of flashcards, the front card flipping to reveal its answer',
  },
  {
    slug: 'grade-needed-on-final-exam',
    title: 'What Grade Do I Need on My Final Exam?',
    description:
      'The formula for the score you need on a final, worked through with real weightings, plus the four ways students get the answer wrong.',
    date: '2026-08-09',
    image: '/illustrations/final-grade-target.svg',
    imageAlt: 'A friendly character beside a gauge filling toward the score needed on a final exam',
  },
];

export function getBlogPost(slug: string): BlogPostMeta | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function formatBlogDate(iso: string): string {
  // Construct from local date parts rather than `new Date(iso)` — parsing a
  // date-only ISO string treats it as UTC midnight, which rolls back to the
  // previous day once toLocaleDateString renders it in a negative-UTC-offset
  // timezone (e.g. any US timezone).
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

const RELATED_POST_SLUGS: Record<string, string[]> = {
  'syllabus-to-semester-calendar': [
    'best-college-deadline-tracking-apps-2026',
    'canvas-deadline-reminders',
    'grade-needed-on-final-exam',
  ],
  'best-college-deadline-tracking-apps-2026': [
    'best-ai-study-apps-for-college-2026',
    'canvas-deadline-reminders',
    'syllabus-to-semester-calendar',
  ],
  'canvas-deadline-reminders': [
    'best-college-deadline-tracking-apps-2026',
    'syllabus-to-semester-calendar',
    'finals-week-study-plan',
  ],
  'pomodoro-technique-between-classes': [
    'finals-week-study-plan',
    'ai-flashcards-from-lecture-notes',
    'best-ai-study-apps-for-college-2026',
  ],
  'finals-week-study-plan': [
    'pomodoro-technique-between-classes',
    'grade-needed-on-final-exam',
    'syllabus-to-semester-calendar',
  ],
  'best-ai-study-apps-for-college-2026': [
    'ai-flashcards-from-lecture-notes',
    'best-college-deadline-tracking-apps-2026',
    'syllabus-to-semester-calendar',
  ],
  'ai-flashcards-from-lecture-notes': [
    'best-ai-study-apps-for-college-2026',
    'pomodoro-technique-between-classes',
    'finals-week-study-plan',
  ],
  'grade-needed-on-final-exam': [
    'finals-week-study-plan',
    'syllabus-to-semester-calendar',
    'best-college-deadline-tracking-apps-2026',
  ],
};

/** Explicit topic relationships for the related-reading block. */
export function relatedPostSlugs(slug: string, limit = 3): string[] {
  const configured = RELATED_POST_SLUGS[slug];
  if (configured) return configured.slice(0, limit);
  return BLOG_POSTS.filter((post) => post.slug !== slug)
    .slice(0, limit)
    .map((post) => post.slug);
}

export function relatedPosts(slug: string, limit = 3) {
  return relatedPostSlugs(slug, limit)
    .map((relatedSlug) => BLOG_POSTS.find((post) => post.slug === relatedSlug))
    .filter((post): post is BlogPostMeta => Boolean(post))
    .map(toLink);
}

function toLink(p: BlogPostMeta) {
  return { path: `/blog/${p.slug}`, title: p.title, description: p.description };
}
