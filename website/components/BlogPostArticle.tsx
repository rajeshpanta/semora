import type { ReactNode } from 'react';
import styles from './Prose.module.css';
import { ArticleShell } from './ArticleShell';
import { Breadcrumb } from './Breadcrumb';
import { BlogPostHero } from './BlogPostHero';
import { BlogTable } from './BlogTable';
import { Faq } from './Faq';
import { Cta } from './Cta';
import { JsonLd } from './JsonLd';
import { faqPageSchema } from '@/lib/schema';
import type { NewPage } from '@/lib/new-page-content';
import type { SiteLocale } from '@/lib/i18n';

const COPY = {
  en: {
    crumb: 'Blog',
    sourcesHeading: 'Sources and methodology',
    faqHeading: 'Frequently asked questions',
    railHeading: 'Ready to get organized?',
    railSub: 'Turn your syllabus into a full semester plan in under a minute.',
    railLabel: 'Try it for free',
    ctaHeading: 'Ready to get organized?',
    ctaSub: 'Scan your first syllabus free. No credit card required.',
  },
  es: {
    crumb: 'Blog',
    sourcesHeading: 'Fuentes y metodología',
    faqHeading: 'Preguntas frecuentes',
    railHeading: 'Organízate desde el primer día',
    railSub: 'Convierte el programa de tu materia en un plan del semestre en menos de un minuto.',
    railLabel: 'Empezar gratis',
    ctaHeading: 'Organízate desde el primer día',
    ctaSub: 'Escanea tu primer programa gratis. Sin tarjeta de crédito.',
  },
} as const;

/**
 * A blog post rendered from `NewPage` data, laid out exactly like an English
 * post's MDX: breadcrumb, hero, open prose, FAQ, closing CTA.
 *
 * The English posts are MDX files and the Spanish ones are data, which is fine
 * — but the Spanish ones previously went through LongFormPage, the shared shell
 * for the feature/tool/comparison pages. Those pages are deliberately collapsed
 * into accordions, so every Spanish post shipped with its body hidden behind
 * disclosure rows and a purple lede callout the English posts never had. Same
 * article, a different reading experience per language.
 *
 * This renders the data through the same Prose stylesheet and the same section
 * order the English layout uses, so the two match. LongFormPage keeps the
 * accordions for the pages that actually asked for them.
 */
export function BlogPostArticle({
  content,
  path,
  crumbHref,
  hero,
  locale = 'en',
  children,
}: {
  content: NewPage;
  /** This page's own path, for the breadcrumb's final item. */
  path: string;
  crumbHref: string;
  hero: { image: string; alt: string; date: string };
  locale?: SiteLocale;
  /** Rendered after the FAQ and before the closing CTA — the related-posts block. */
  children?: ReactNode;
}) {
  const copy = COPY[locale === 'es' ? 'es' : 'en'];
  const sources = content.sources ?? [];
  const showFaq = !!content.faq?.length;

  return (
    <ArticleShell
      locale={locale}
      ctaHeading={copy.railHeading}
      ctaSubheading={copy.railSub}
      ctaLabel={copy.railLabel}
    >
      <article className={styles.prose}>
        {showFaq ? <JsonLd data={faqPageSchema(content.faq)} /> : null}

        <Breadcrumb
          locale={locale}
          trail={[
            { name: copy.crumb, path: crumbHref },
            { name: content.h1, path },
          ]}
        />

        <BlogPostHero
          locale={locale}
          title={content.h1}
          date={hero.date}
          image={hero.image}
          imageAlt={hero.alt}
        />

        {/* The lede is the post's opening line, not a pull quote — the English
            posts open on ordinary prose, so it renders as the first paragraph
            rather than in a callout box. */}
        <p>{content.lede}</p>
        {content.intro.map((p, i) => (
          <p key={i}>{p}</p>
        ))}

        {content.sections.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {s.bullets?.length ? (
              <ul>
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
            {s.table ? <BlogTable {...s.table} /> : null}
          </section>
        ))}

        {sources.length ? (
          <section>
            <h2>{copy.sourcesHeading}</h2>
            {content.sourceNote ? <p>{content.sourceNote}</p> : null}
            <ul>
              {sources.map((source) => (
                <li key={`${source.href}-${source.label}`}>
                  <a href={source.href}>{source.label}</a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {showFaq ? (
          <section>
            <h2>{copy.faqHeading}</h2>
            <Faq items={content.faq} />
          </section>
        ) : null}

        {children}

        <Cta locale={locale} heading={copy.ctaHeading} subheading={copy.ctaSub} />
      </article>
    </ArticleShell>
  );
}
