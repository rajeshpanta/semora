import Link from 'next/link';
import styles from './RelatedPosts.module.css';
import type { SiteLocale } from '@/lib/i18n';

export interface RelatedPost {
  path: string;
  title: string;
  description: string;
}

/**
 * "Keep reading" links at the foot of a blog post.
 *
 * Before this, each post had exactly one inbound internal link — its own row on
 * the /blog index — and linked to no sibling post at all. That left every post
 * a leaf node: nothing passed authority between them, and a reader who finished
 * one had no route to the next. Three related links per post turns six isolated
 * pages into a connected cluster around the same topic.
 */
export function RelatedPosts({
  posts,
  locale = 'en',
}: {
  posts: RelatedPost[];
  locale?: SiteLocale;
}) {
  if (!posts.length) return null;
  const es = locale === 'es';
  return (
    <aside className={styles.wrap} aria-labelledby="related-heading">
      <h2 id="related-heading" className={styles.heading}>
        {es ? 'Sigue leyendo' : 'Keep reading'}
      </h2>
      <ul className={styles.list}>
        {posts.map((p) => (
          <li key={p.path}>
            <Link href={p.path} className={styles.card}>
              <strong>{p.title}</strong>
              <span>{p.description}</span>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
