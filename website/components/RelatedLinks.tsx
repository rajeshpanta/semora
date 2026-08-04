import Link from 'next/link';
import styles from './RelatedLinks.module.css';

/**
 * Contextual internal links.
 *
 * The three keyword landing pages carried ~9,000 words between them and had
 * one inbound internal link each — /canvas-deadline-tracker had zero. Pages
 * nothing links to receive no internal PageRank and are discovered only via
 * the sitemap, so this module exists to route authority to them from the
 * feature and comparison pages that are topically adjacent.
 */
export function RelatedLinks({
  heading = 'Related reading',
  links,
}: {
  heading?: string;
  links: { href: string; label: string }[];
}) {
  if (!links.length) return null;
  return (
    <nav className={styles.wrap} aria-label={heading}>
      <p className={styles.heading}>{heading}</p>
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href}>{l.label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
