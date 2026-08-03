import styles from './PageSections.module.css';
import { Faq } from './Faq';
import { JsonLd } from './JsonLd';
import { faqPageSchema } from '@/lib/schema';
import type { PageLongForm } from '@/lib/page-content';

/**
 * Renders the long-form body appended to hub and landing pages.
 *
 * Each page's own hero/cards stay in its page.tsx; this is the depth that
 * follows them. The FAQ emits FAQPage schema, so a page must not render two
 * of these or it would ship duplicate structured data.
 */
export function PageSections({
  content,
  faqHeading = 'Frequently asked questions',
  emitFaq = true,
}: {
  content: PageLongForm | undefined;
  faqHeading?: string;
  /**
   * Set false on pages that already render their own FAQ and FAQPage schema
   * (pricing, support, the keyword landing pages) — two FAQPage blocks on one
   * URL is invalid structured data. Those pages merge these questions into
   * their existing list instead.
   */
  emitFaq?: boolean;
}) {
  if (!content) return null;

  const showFaq = emitFaq && !!content.faq?.length;

  return (
    <div className={styles.wrap}>
      {showFaq ? <JsonLd data={faqPageSchema(content.faq)} /> : null}

      {content.sections.map((s) => (
        <section key={s.heading} className={styles.section}>
          <h2>{s.heading}</h2>
          {s.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {s.bullets?.length ? (
            <ul className={styles.points}>
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}

      {showFaq ? (
        <section className={styles.section}>
          <h2>{faqHeading}</h2>
          <Faq items={content.faq} />
        </section>
      ) : null}
    </div>
  );
}
