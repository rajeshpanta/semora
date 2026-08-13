import type { Metadata } from 'next';
import { enAlternates } from '@/lib/hreflang';
import Link from 'next/link';
import styles from './compare-index.module.css';
import { Reveal } from '@/components/Reveal';
import { Cta } from '@/components/Cta';
import { COMPETITORS } from '@/lib/competitors';
import { APP_URL } from '@/lib/semora-facts';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';
import { pageTitle } from '@/lib/title';
import { Breadcrumb } from '@/components/Breadcrumb';
import { JsonLd } from '@/components/JsonLd';
import { itemListSchema } from '@/lib/schema';

export const metadata: Metadata = {
  title: pageTitle('Compare Semora'),
  description:
    'Honest, feature-by-feature comparisons of Semora against DormWay, Shovel, StudyFetch, Mindgrasp, Taskade, Studley AI, and myHomework Student Planner.',
  alternates: enAlternates('/compare'),
};

export default function CompareIndexPage() {
  return (
    <>
      <JsonLd
        data={itemListSchema(
          COMPETITORS.map((c) => ({
            name: `Semora vs ${c.name}`,
            path: `/compare/${c.slug}`,
            description: c.oneLiner,
          })),
          { path: '/compare', name: 'Semora compared with other study apps' },
        )}
      />
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <Breadcrumb
            align="center"
            trail={[
              { name: 'Home', path: '/' },
              { name: 'Compare', path: '/compare' },
            ]}
          />
          <span className={styles.eyebrow}>Compare</span>
          <h1 className={styles.h1}>
            See exactly how Semora <span className={styles.gradient}>stacks up</span>
          </h1>
          <p className={styles.sub}>
            Fact-based, feature-by-feature comparisons. No invented ratings, no exaggerated
            claims. Where a competitor&apos;s exact behavior isn&apos;t publicly confirmed, we say
            so.
          </p>
          <div className={styles.heroActions}>
            <Link href={APP_URL} className={styles.primaryBtn}>
              Get started free
            </Link>
            <Link href="/pricing" className={styles.secondaryBtn}>
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.grid}>
          {COMPETITORS.map((c, i) => (
            <Reveal key={c.slug} delay={i * 50}>
              <Link href={`/compare/${c.slug}`} className={styles.card}>
                <h2 className={styles.cardTitle}>Semora vs {c.name}</h2>
                <p className={styles.cardBody}>{c.oneLiner}</p>
                <span className={styles.cardLink}>See the full comparison →</span>
              </Link>
            </Reveal>
          ))}
        </div>

        <Cta
          heading="See your own syllabus turned into a semester plan"
          subheading="Scan a syllabus and get your deadlines, grades, and schedule organized in one snap. Free to start."
        />
      </section>
      <PageSections content={getPageContent('compare')} withRail />
    </>
  );
}
