export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
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
    image: '/illustrations/syllabus-calendar.svg',
    imageAlt: 'Illustration of a syllabus page turning into a calendar with a marked deadline',
  },
  {
    slug: 'weighted-gpa-calculator',
    title: 'How to Calculate a Weighted GPA (With Real Examples)',
    description:
      'The formula behind a weighted GPA, worked examples for common grading scales, and how Semora tracks it automatically as grades come in.',
    date: '2026-07-21',
    image: '/illustrations/grade-card.svg',
    imageAlt: 'Illustration of a report card showing an A- grade with a star badge',
  },
  {
    slug: 'best-college-deadline-tracking-apps-2026',
    title: 'Best Apps for Tracking College Deadlines in 2026',
    description:
      'A practical look at how paper planners, generic to-do apps, and syllabus-aware tools hold up for a full course load.',
    date: '2026-07-22',
    image: '/illustrations/trophy-compare.svg',
    imageAlt: 'Illustration of a trophy on a podium representing an app comparison',
  },
  {
    slug: 'canvas-deadline-reminders',
    title: "Canvas Doesn't Remind You Before Deadlines: Here's How to Fix That",
    description:
      "Why Canvas notifications are easy to miss, and how to layer real advance reminders and grade tracking on top of your existing Canvas assignments.",
    date: '2026-07-23',
    image: '/illustrations/bell-reminder.svg',
    imageAlt: 'Illustration of a reminder bell in front of a calendar page',
  },
  {
    slug: 'pomodoro-technique-between-classes',
    title: 'The Pomodoro Technique Between Classes: A Real Schedule for College Students',
    description:
      'How to adapt the Pomodoro technique to the actual gaps in a college schedule, instead of the idealized unbroken hours it assumes.',
    date: '2026-07-24',
    image: '/illustrations/tomato-timer.svg',
    imageAlt: 'Illustration of a cute tomato-shaped kitchen timer, the origin of the Pomodoro technique',
  },
  {
    slug: 'finals-week-study-plan',
    title: 'How to Build a Study Plan for Finals Week',
    description:
      'A framework for planning finals week around exam density and weighting, and how Semora surfaces the weeks that need the plan most.',
    date: '2026-07-25',
    image: '/illustrations/book-stack.svg',
    imageAlt: 'Illustration of a stack of textbooks with a graduation cap on top',
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
