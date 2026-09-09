import { COMPETITORS } from './competitors';
import { BLOG_POSTS } from './blog';

/**
 * Slug lists shared between sitemap.ts and the dynamic route pages
 * (compare/[slug], blog post folders).
 */

export const COMPARE_SLUGS = COMPETITORS.map((c) => c.slug);

export const KEYWORD_PAGE_SLUGS = [
  'ai-syllabus-scanner',
  'ai-study-planner-for-college',
  'canvas-deadline-tracker',
  'assignment-tracker-app',
  'blackboard-assignment-tracker',
  'ai-flashcard-generator',
  'ai-tutor-for-college-students',
] as const;

export const BLOG_SLUGS = BLOG_POSTS.map((p) => p.slug);

/**
 * Competitors that have BOTH a "Semora vs X" comparison and a standalone
 * "X alternative" page.
 *
 * The two pages answer different questions and stay separate: a comparison is
 * for someone weighing two named tools, an alternative page is for someone
 * already leaving one and surveying the whole field. Two competitors
 * (Taskade, Studley AI) have only the comparison, so this is a partial map
 * rather than a derivation from COMPARE_SLUGS.
 *
 * Its job is directional. Every alternative page already names /compare as its
 * breadcrumb parent, but the hub listed only the comparisons, so the parent
 * never linked to half its children and the footer was the sole path in.
 */
export const ALTERNATIVE_BY_COMPETITOR: Readonly<Record<string, string>> = {
  dormway: 'dormway-alternative',
  shovel: 'shovel-alternative',
  studyfetch: 'studyfetch-alternative',
  mindgrasp: 'mindgrasp-alternative',
  myhomework: 'myhomework-alternative',
};
