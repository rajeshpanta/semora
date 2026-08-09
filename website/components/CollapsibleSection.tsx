import type { ReactNode } from 'react';
import styles from './CollapsibleSection.module.css';

/**
 * A long-form section that shows its first paragraph and hides the rest behind
 * a toggle.
 *
 * The features pages had grown to where nobody read them end to end — 21KB on
 * /features, and the Spanish page matched it. Trimming would have meant deleting
 * answers people actually search for (what the free tier covers, where the Pro
 * line falls, what happens offline), so the detail stays and the page gets
 * shorter instead.
 *
 * Native <details>, matching Faq.tsx: no JavaScript, keyboard and screen-reader
 * behaviour for free, and the collapsed text is still in the HTML, so it is
 * indexed and Cmd-F finds it.
 *
 * A section with nothing beyond its first paragraph renders plainly — a toggle
 * that reveals one line is worse than no toggle.
 */
export function CollapsibleSection({
  paragraphs,
  bullets,
  moreLabel,
  children,
}: {
  paragraphs: readonly string[];
  bullets?: readonly string[];
  /** "More detail" / "Ver detalles" — supplied by the caller so this stays locale-agnostic. */
  moreLabel: string;
  /** Rendered inside the disclosure, after the paragraphs — the bullet list. */
  children?: ReactNode;
}) {
  const [lead, ...rest] = paragraphs;
  const hasMore = rest.length > 0 || (bullets?.length ?? 0) > 0;

  if (!hasMore) {
    return <p className={styles.lead}>{lead}</p>;
  }

  return (
    <>
      <p className={styles.lead}>{lead}</p>
      <details className={styles.details}>
        <summary className={styles.summary}>
          {moreLabel}
          <span className={styles.chevron} aria-hidden="true" />
        </summary>
        <div className={styles.body}>
          {rest.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {children}
        </div>
      </details>
    </>
  );
}
