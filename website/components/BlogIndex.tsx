import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import styles from './BlogIndex.module.css';

export interface BlogIndexCard {
  /** Absolute path to the post, e.g. '/blog/x' or '/es/blog/x'. */
  path: string;
  title: string;
  description: string;
  image: string;
  imageAlt: string;
  /** Already formatted for display — the two locales format dates differently. */
  dateLabel: string;
}

/**
 * The blog index: centered header, then a card grid, then whatever long-form
 * body the page passes as children.
 *
 * Shared by both locales. /blog and /es/blog were built independently — the
 * English index had its own page.tsx with this layout while the Spanish one
 * came out of the generic long-form renderer, so it inherited a breadcrumb, a
 * lede callout, a CTA rail eating a third of the width, and a two-column grid
 * of letterboxed thumbnails. Same posts, visibly different product. Deriving
 * both from this component is what stops that from drifting again.
 */
export function BlogIndex({
  heading,
  sub,
  posts,
  children,
}: {
  heading: string;
  sub: string;
  posts: BlogIndexCard[];
  /** The long-form sections and FAQ that follow the grid. */
  children?: ReactNode;
}) {
  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <h1>{heading}</h1>
        <p>{sub}</p>
      </header>

      <div className={styles.grid}>
        {posts.map((post) => (
          <Link key={post.path} href={post.path} className={styles.card}>
            <div className={styles.thumb}>
              <Image src={post.image} alt={post.imageAlt} fill sizes="(min-width: 768px) 360px, 100vw" />
            </div>
            <div className={styles.cardBody}>
              <p className={styles.date}>{post.dateLabel}</p>
              <h2>{post.title}</h2>
              <p>{post.description}</p>
            </div>
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
