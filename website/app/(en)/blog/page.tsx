import type { Metadata } from 'next';
import { enAlternates } from '@/lib/hreflang';
import Image from 'next/image';
import Link from 'next/link';
import styles from './blog.module.css';
import { BLOG_POSTS, formatBlogDate } from '@/lib/blog';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';
import { JsonLd } from '@/components/JsonLd';
import { blogIndexSchema } from '@/lib/schema';

export const metadata: Metadata = {
  // Was just 'Blog', which rendered as "Blog | Semora" — 13 characters carrying
  // none of the terms these six posts are actually about.
  title: 'College Study & Semester Planning Guides',
  description:
    'Guides for college students on turning a syllabus into a semester calendar, calculating a weighted GPA, getting Canvas deadline reminders, and building a study plan that holds.',
  alternates: enAlternates('/blog'),
};

export default function BlogIndexPage() {
  return (
    <div className={styles.wrap}>
      {/* The index listed six articles with no markup saying it was a blog or
          what it contained. */}
      <JsonLd data={blogIndexSchema(
        BLOG_POSTS.map((p) => ({ path: `/blog/${p.slug}`, title: p.title, description: p.description, datePublished: p.date })),
        { path: '/blog', name: 'The Semora Blog', inLanguage: 'en' },
      )} />
      <header className={styles.head}>
        <h1>The Semora Blog</h1>
        <p>Guides on syllabus planning, GPA calculation, Canvas reminders, and study scheduling.</p>
      </header>

      <div className={styles.grid}>
        {BLOG_POSTS.map((post) => (
          <Link key={post.slug} href={`/blog/${post.slug}`} className={styles.card}>
            <div className={styles.thumb}>
              <Image src={post.image} alt={post.imageAlt} fill sizes="(min-width: 768px) 360px, 100vw" />
            </div>
            <div className={styles.cardBody}>
              <p className={styles.date}>{formatBlogDate(post.date)}</p>
              <h2>{post.title}</h2>
              <p>{post.description}</p>
            </div>
          </Link>
        ))}
      </div>
      <PageSections content={getPageContent('blog')} withRail />
    </div>
  );
}
