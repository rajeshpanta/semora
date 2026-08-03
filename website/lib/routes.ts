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
] as const;

export const BLOG_SLUGS = BLOG_POSTS.map((p) => p.slug);
