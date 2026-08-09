import type { ReactNode } from 'react';
import styles from './CollapsibleSection.module.css';

/**
 * A long-form section collapsed into a single row, the same way the FAQ is.
 *
 * The features pages had grown past the point anyone read them — 21KB on
 * /features, and the Spanish page matches it. Trimming would have meant deleting
 * the answers people actually search for (what the free tier covers, where the
 * Pro line falls, what happens offline), so the detail stays and the page
 * collapses instead: heading visible, body one click away.
 *
 * Native <details>, the same primitive Faq.tsx uses. No JavaScript, keyboard and
 * screen-reader behaviour for free, and the hidden text is still in the HTML, so
 * it stays indexed and Cmd-F still finds it. Browsers also auto-open a <details>
 * when you follow an anchor into it, which is what keeps the "On this page" rail
 * working against collapsed sections.
 *
 * The <h2> lives inside <summary> deliberately: the heading IS the control, and
 * keeping it an h2 preserves the document outline the rail is built from.
 */
export function CollapsibleSection({
  heading,
  id,
  paragraphs,
  children,
}: {
  heading: string;
  id?: string;
  paragraphs: readonly string[];
  /** Rendered after the paragraphs inside the disclosure — the bullet list. */
  children?: ReactNode;
}) {
  return (
    <details className={styles.details} id={id}>
      <summary className={styles.summary}>
        <h2 className={styles.heading}>{heading}</h2>
        <span className={styles.icon} aria-hidden="true" />
      </summary>
      <div className={styles.body}>
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {children}
      </div>
    </details>
  );
}
