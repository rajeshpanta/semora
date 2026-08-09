import type { ReactNode } from 'react';
import styles from './LongFormPage.module.css';
import { Faq } from './Faq';
import { JsonLd } from './JsonLd';
import { ArticleShell } from './ArticleShell';
import { faqPageSchema } from '@/lib/schema';
import { Breadcrumb } from './Breadcrumb';
import { BlogPostHero } from './BlogPostHero';
import { CollapsibleSection } from './CollapsibleSection';
import type { NewPage } from '@/lib/new-page-content';
import type { SiteLocale } from '@/lib/i18n';

/**
 * Shared shell for the tool / alternative / about pages: breadcrumb, lede,
 * an optional interactive widget slot above the prose, then the long-form
 * body and FAQ, inside the same ArticleShell (sticky contents rail + CTA)
 * the feature and comparison pages use.
 */
export function LongFormPage({
  content,
  crumb,
  path,
  widget,
  hero,
  locale = 'en',
}: {
  content: NewPage;
  crumb?: { href: string; label: string };
  /** This page's own path, e.g. '/gpa-calculator'. Needed for the breadcrumb's
   *  final item — a server component cannot read it from usePathname(). */
  path: string;
  widget?: ReactNode;
  /** Illustration for blog posts. The English posts render one through
   *  BlogPostHero; the Spanish ones go through this shell instead, so without
   *  this slot every Spanish post shipped with no image at all. */
  hero?: { image: string; alt: string; date?: string };
  locale?: SiteLocale;
}) {
  const es = locale === 'es';
  return (
    <ArticleShell
      ctaHeading={es ? 'Organiza el programa de tu próxima materia' : 'Try it on your own syllabus'}
      ctaSubheading={es
        ? 'Descubre cómo Semora organiza tus cursos. Puedes empezar gratis y sin tarjeta de crédito.'
        : 'See how Semora handles your actual courses. Free, no credit card.'}
      ctaLabel={es ? 'Empezar gratis' : 'Try it for free'}
      locale={locale}
    >
      <article className={`${styles.wrap} article-body`}>
        {content.faq?.length ? <JsonLd data={faqPageSchema(content.faq)} /> : null}

        {crumb && (
          <Breadcrumb
            locale={locale}
            trail={[
              { name: crumb.label, path: crumb.href },
              { name: content.h1, path },
            ]}
          />
        )}

        {hero ? (
          <BlogPostHero locale={locale} title={content.h1} date={hero.date ?? ''} image={hero.image} imageAlt={hero.alt} />
        ) : (
          <h1>{content.h1}</h1>
        )}
        <p className={styles.lede}>{content.lede}</p>

        {widget ? <div className={styles.widget}>{widget}</div> : null}

        {content.intro.map((p, i) => (
          <p key={i} className={styles.body}>
            {p}
          </p>
        ))}

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

        {content.faq.length ? (
          <section className={styles.section}>
            <h2>{es ? 'Preguntas frecuentes' : 'Frequently asked questions'}</h2>
            <Faq items={content.faq} />
          </section>
        ) : null}
      </article>
    </ArticleShell>
  );
}
