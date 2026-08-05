import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import styles from './blog.module.css';
import { BLOG_POSTS, formatBlogDate } from '@/lib/blog';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Guides on syllabus planning, GPA calculation, Canvas reminders, and study scheduling.',
  alternates: { canonical: '/blog' },
};

export default function BlogIndexPage() {
  return (
    <div className={styles.wrap}>
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
