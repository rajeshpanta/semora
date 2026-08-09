import type { Metadata } from 'next';
import { enAlternates } from '@/lib/hreflang';
import { BLOG_POSTS, formatBlogDate } from '@/lib/blog';
import { BlogIndex } from '@/components/BlogIndex';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';
import { JsonLd } from '@/components/JsonLd';
import { blogIndexSchema } from '@/lib/schema';

export const metadata: Metadata = {
  // Was just 'Blog', which rendered as "Blog | Semora" — 13 characters carrying
  // none of the terms these posts are actually about.
  title: 'College Study & Semester Planning Guides',
  description:
    'Guides for college students on turning a syllabus into a semester calendar, calculating a weighted GPA, getting Canvas deadline reminders, and building a study plan that holds.',
  alternates: enAlternates('/blog'),
};

export default function BlogIndexPage() {
  return (
    <>
      {/* The index listed the articles with no markup saying it was a blog or
          what it contained. */}
      <JsonLd data={blogIndexSchema(
        BLOG_POSTS.map((p) => ({ path: `/blog/${p.slug}`, title: p.title, description: p.description, datePublished: p.date })),
        { path: '/blog', name: 'The Semora Blog', inLanguage: 'en' },
      )} />
      <BlogIndex
        heading="The Semora Blog"
        sub="Guides on syllabus planning, GPA calculation, Canvas reminders, and study scheduling."
        posts={BLOG_POSTS.map((post) => ({
          path: `/blog/${post.slug}`,
          title: post.title,
          description: post.description,
          image: post.image,
          imageAlt: post.imageAlt,
          dateLabel: formatBlogDate(post.date),
        }))}
      >
        <PageSections content={getPageContent('blog')} withRail />
      </BlogIndex>
    </>
  );
}
