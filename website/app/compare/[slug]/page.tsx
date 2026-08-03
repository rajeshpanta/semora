import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import styles from './compare.module.css';
import { CompareTable } from '@/components/CompareTable';
import { Faq } from '@/components/Faq';
import { Cta } from '@/components/Cta';
import { ArticleShell } from '@/components/ArticleShell';
import { JsonLd } from '@/components/JsonLd';
import { faqPageSchema, breadcrumbListSchema } from '@/lib/schema';
import { COMPETITORS, getCompetitor } from '@/lib/competitors';

export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const competitor = getCompetitor(slug);
  if (!competitor) return {};
  return {
    title: competitor.title,
    description: competitor.metaDescription,
    alternates: { canonical: `/compare/${competitor.slug}` },
  };
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const competitor = getCompetitor(slug);
  if (!competitor) notFound();

  return (
    <ArticleShell
      ctaHeading="Try it on your own syllabus"
      ctaSubheading={`See how Semora handles your actual courses — free, no credit card.`}
    >
      <article className={styles.wrap}>
      <JsonLd data={faqPageSchema(competitor.faq)} />
      <JsonLd
        data={breadcrumbListSchema([
          { name: 'Compare', path: '/compare' },
          { name: `Semora vs ${competitor.name}`, path: `/compare/${competitor.slug}` },
        ])}
      />

      <p className={styles.eyebrow}>Comparison</p>
      <h1>
        Semora vs {competitor.name}: which is right for you?
      </h1>
      <p className={styles.lede}>{competitor.lede}</p>
      {competitor.intro && <p className={styles.intro}>{competitor.intro}</p>}

      <h2>What each product does</h2>
      <h3>Semora</h3>
      <p className={styles.body}>{competitor.semoraParagraph}</p>
      <h3>{competitor.name}</h3>
      <p className={styles.body}>{competitor.competitorParagraph}</p>

      <h2>
        Semora vs {competitor.name}: feature comparison
      </h2>
      <CompareTable
        competitorName={competitor.name}
        rows={competitor.comparisonRows}
        caption={competitor.comparisonCaption}
      />
      {competitor.tableNote && <p className={styles.tableNote}>{competitor.tableNote}</p>}
      {competitor.pricingWin && (
        <p className={styles.pricingWin}>
          <strong>Cheaper on Pro:</strong> {competitor.pricingWin}
        </p>
      )}

      {competitor.extraSections?.map((section) => (
        <div key={section.heading}>
          <h3>{section.heading}</h3>
          {section.body.map((paragraph, i) => (
            <p className={styles.body} key={i}>
              {paragraph}
            </p>
          ))}
        </div>
      ))}

      {(competitor.whereSemoraFits || competitor.whereCompetitorFits) && (
        <>
          <h2>Which one fits your situation?</h2>
          <div className={styles.fitColumns}>
            {competitor.whereSemoraFits && (
              <div className={`${styles.fitCard} ${styles.semora}`}>
                <h3>Semora may fit better if you...</h3>
                <ul>
                  {competitor.whereSemoraFits.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {competitor.whereCompetitorFits && (
              <div className={styles.fitCard}>
                <h3>{competitor.name} may fit better if you...</h3>
                <ul>
                  {competitor.whereCompetitorFits.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      {competitor.verdict && (
        <>
          <h2>Which one should you choose?</h2>
          <ul className={styles.verdictList}>
            {competitor.verdict.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </>
      )}

      {competitor.extraNote && <p className={styles.note}>{competitor.extraNote}</p>}

      <h2>Frequently asked questions</h2>
      <Faq items={competitor.faq} />

      <Cta
        heading="See your own syllabus turned into a semester plan"
        subheading="Scan a syllabus and get your deadlines, grades, and schedule organized in one snap."
      />
      </article>
    </ArticleShell>
  );
}
