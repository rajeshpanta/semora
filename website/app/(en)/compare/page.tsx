import type { Metadata } from 'next';
import { enAlternates } from '@/lib/hreflang';
import { OG_IMAGE } from '@/lib/og';
import Link from 'next/link';
import styles from './compare-index.module.css';
import { Reveal } from '@/components/Reveal';
import { Cta } from '@/components/Cta';
import { COMPETITORS } from '@/lib/competitors';
import { ALTERNATIVE_BY_COMPETITOR } from '@/lib/routes';
import { APP_URL } from '@/lib/semora-facts';
import { PageSections } from '@/components/PageSections';
import { getPageContent } from '@/lib/page-content';
import { pageTitle } from '@/lib/title';
import { Breadcrumb } from '@/components/Breadcrumb';
import { JsonLd } from '@/components/JsonLd';
import { itemListSchema } from '@/lib/schema';

export const metadata: Metadata = {
  // Was "Compare Semora" — fourteen characters, the thinnest title on the
  // site, on a page earning one click from 68 impressions at position 7.3.
  // It said the brand and the verb and nothing a searcher types.
  //
  // Leads with the category because that is what people search for; the brand
  // and the number are what make it worth clicking. The count is derived, so
  // adding or dropping a competitor cannot leave the title lying.
  title: pageTitle(`Compare College Study Apps: Semora vs ${COMPETITORS.length} Alternatives`),
  description:
    'Honest, feature-by-feature comparisons of Semora against DormWay, Shovel, StudyFetch, Mindgrasp, Taskade, Studley AI, and myHomework Student Planner.',
  alternates: enAlternates('/compare'),
  openGraph: { url: '/compare', ...OG_IMAGE },
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
              Try it for free
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

        {/* Each of these pages already names /compare as its breadcrumb
            parent, but the hub listed only the "Semora vs X" comparisons, so
            half its children had no path in except the site footer. A reader
            who has decided to leave a tool wants the survey, not the head to
            head, and that reader had no way to get from here to it. */}
        <section className={styles.alternatives}>
          <h2 className={styles.altHeading}>Already leaving one of these?</h2>
          <p className={styles.altSub}>
            A comparison weighs Semora against one named tool. These guides answer the
            different question: what actually replaces the app you are giving up, including
            the options that are not Semora.
          </p>
          <ul className={styles.altList}>
            {COMPETITORS.filter((c) => ALTERNATIVE_BY_COMPETITOR[c.slug]).map((c) => (
              <li key={c.slug}>
                <Link href={`/${ALTERNATIVE_BY_COMPETITOR[c.slug]}`} className={styles.altLink}>
                  {c.name} alternatives
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <Cta
          heading="See your own syllabus turned into a semester plan"
          subheading="Scan a syllabus and get your deadlines, grades, and schedule organized in one snap. Free to start."
        />
      </section>
      <PageSections content={getPageContent('compare')} withRail />
    </>
  );
}
