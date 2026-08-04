'use client';

import { usePathname } from 'next/navigation';
import { Breadcrumb } from './Breadcrumb';
import { BLOG_POSTS } from '@/lib/blog';

/**
 * Breadcrumb for a blog post.
 *
 * Blog posts are MDX files sharing one layout, and a server layout cannot read
 * which child route rendered it — so the slug is recovered from the pathname on
 * the client and matched against the post registry. That keeps every post's
 * trail correct without editing six MDX files, and without a new prop each one
 * would have to remember to pass.
 *
 * Renders nothing for an unknown slug rather than inventing a title, so a post
 * added to the route tree but not to BLOG_POSTS degrades to no breadcrumb
 * instead of a wrong one.
 */
export function BlogBreadcrumb() {
  const pathname = usePathname();
  const slug = pathname?.replace(/^\/blog\//, '').replace(/\/$/, '') ?? '';
  const post = BLOG_POSTS.find((p) => p.slug === slug);
  if (!post) return null;

  return (
    <Breadcrumb
      trail={[
        { name: 'Blog', path: '/blog' },
        { name: post.title, path: `/blog/${post.slug}` },
      ]}
    />
  );
}
