import styles from './PageSections.module.css';
import { ArticleShell } from './ArticleShell';
import { CollapsibleSection } from './CollapsibleSection';
import { Faq } from './Faq';
import { JsonLd } from './JsonLd';
import { faqPageSchema } from '@/lib/schema';
import type { PageLongForm } from '@/lib/page-content';
import type { SiteLocale } from '@/lib/i18n';

/**
 * Renders the long-form body appended to hub and landing pages.
 *
 * Each page's own hero/cards stay in its page.tsx; this is the depth that
 * follows them. The FAQ emits FAQPage schema, so a page must not render two
 * of these or it would ship duplicate structured data.
 */
export function PageSections({
  content,
  faqHeading,
  emitFaq = true,
  withRail = false,
  locale = 'en',
}: {
  content: PageLongForm | undefined;
  /** Defaults to the locale's own wording. */
  faqHeading?: string;
  /**
   * Set false on pages that already render their own FAQ and FAQPage schema
   * (pricing, support, the keyword landing pages) — two FAQPage blocks on one
   * URL is invalid structured data. Those pages merge these questions into
   * their existing list instead.
   */
  emitFaq?: boolean;
  /**
   * Wrap the body in ArticleShell so it gets the sticky "On this page" rail
   * and the CTA card, the same treatment the feature and comparison pages
   * have. Hub pages opt in for their long-form body only — their hero and
   * card grids stay full width, because an 860px column would break them.
   */
  withRail?: boolean;
  locale?: SiteLocale;
}) {
  if (!content) return null;

  const es = locale === 'es';
  const showFaq = emitFaq && !!content.faq?.length;
  const heading = faqHeading ?? (es ? 'Preguntas frecuentes' : 'Frequently asked questions');

  const body = (
    <div className={withRail ? `${styles.railWrap} article-body` : styles.wrap}>
      {showFaq ? <JsonLd data={faqPageSchema(content.faq)} /> : null}

      {content.sections.map((s) => (
        <CollapsibleSection key={s.heading} heading={s.heading} paragraphs={s.paragraphs}>
          {s.bullets?.length ? (
            <ul className={styles.points}>
              {s.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
        </CollapsibleSection>
      ))}

      {showFaq ? (
        <section className={styles.section}>
          <h2>{heading}</h2>
          <Faq items={content.faq} />
        </section>
      ) : null}
    </div>
  );

  if (!withRail) return body;

  return (
    <ArticleShell
      locale={locale}
      ctaHeading={es ? 'Organiza el programa de tu próxima materia' : 'Try it on your own syllabus'}
      ctaSubheading={es
        ? 'Descubre cómo Semora organiza tus cursos. Puedes empezar gratis y sin tarjeta de crédito.'
        : 'See how Semora handles your actual courses. Free, no credit card.'}
      ctaLabel={es ? 'Empezar gratis' : 'Try it for free'}
    >
      <article>{body}</article>
    </ArticleShell>
  );
}
