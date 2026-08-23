import { DeviceGrid } from '@/components/DeviceGrid';
import { DownloadHero } from '@/components/DownloadHero';
import { BlogTable } from '@/components/BlogTable';
import { Faq } from '@/components/Faq';
import { Cta } from '@/components/Cta';
import { JsonLd } from '@/components/JsonLd';
import { Reveal } from '@/components/Reveal';
import { faqPageSchema } from '@/lib/schema';
import type { NewPage } from '@/lib/new-page-content';
import type { SiteLocale } from '@/lib/i18n';
import styles from '@/components/DownloadPage.module.css';

/**
 * The download page, in both languages.
 *
 * Composed directly rather than through LongFormPage. That shell is for pages
 * you READ — breadcrumb, sticky contents rail, prose at article measure — and
 * it rendered the device grid as a "widget" wedged into an essay. Someone here
 * has already decided to install; the grid is the page and the prose follows
 * it. The words are unchanged and still earn the ranking that brings people
 * here, they just no longer stand between the visitor and the thing they came
 * for.
 *
 * Shared by /download and /es/descargar so the Spanish page cannot quietly
 * drift back into the article layout the English one just left.
 */
const COPY = {
  en: {
    faqHead: 'Questions',
    ctaHeading: 'Try it on your own syllabus',
    ctaSub: 'See how Semora handles your actual courses. Free, no credit card.',
  },
  es: {
    faqHead: 'Preguntas',
    ctaHeading: 'Organiza el programa de tu próxima materia',
    ctaSub: 'Descubre cómo Semora organiza tus cursos. Puedes empezar gratis y sin tarjeta de crédito.',
  },
} as const;

export function DownloadPageBody({
  content,
  locale = 'en',
}: {
  content: NewPage;
  locale?: SiteLocale;
}) {
  const t = COPY[locale];
  // Found by shape rather than index, so reordering the content cannot render
  // the table twice or lose it.
  const tableSection = content.sections?.find((s) => s.table);
  const rest = content.sections?.filter((s) => s !== tableSection);

  return (
    <>
      {content.faq?.length ? <JsonLd data={faqPageSchema(content.faq)} /> : null}

      <DownloadHero lede={content.lede} locale={locale} />

      <div className={styles.grid}>
        <DeviceGrid locale={locale} />
      </div>

      {/* Directly under the grid, at grid width. It was the last thing on the
          page, below every paragraph — and it is the densest, most useful
          thing here: eight surfaces, their real state, what each one does. */}
      {tableSection && (
        <section className={styles.tableBand}>
          <div className={styles.tableInner}>
            <h2 className={styles.h2}>{tableSection.heading}</h2>
            {tableSection.paragraphs?.map((p) => (
              <p key={p} className={styles.pWide}>{p}</p>
            ))}
            {tableSection.table && (
              <BlogTable columns={tableSection.table.columns} rows={tableSection.table.rows} />
            )}
          </div>
        </section>
      )}

      <div className={styles.prose}>
        {content.intro?.map((p) => (
          <p key={p} className={styles.p}>{p}</p>
        ))}

        {rest?.map((section) => (
          <Reveal key={section.heading} className={styles.section}>
            <h2 className={styles.h2}>{section.heading}</h2>
            {section.paragraphs?.map((p) => (
              <p key={p} className={styles.p}>{p}</p>
            ))}
            {section.table && (
              <BlogTable columns={section.table.columns} rows={section.table.rows} />
            )}
          </Reveal>
        ))}

        {content.faq?.length ? (
          <>
            <h2 className={styles.faqHead}>{t.faqHead}</h2>
            <Faq items={content.faq} />
          </>
        ) : null}
      </div>

      <Cta heading={t.ctaHeading} subheading={t.ctaSub} locale={locale} />
    </>
  );
}
