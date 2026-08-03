import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './compare-index.module.css';
import { Reveal } from '@/components/Reveal';
import { Cta } from '@/components/Cta';
import { COMPETITORS } from '@/lib/competitors';
import { APP_URL } from '@/lib/semora-facts';

export const metadata: Metadata = {
  title: 'Compare Semora',
  description:
    'Honest, feature-by-feature comparisons of Semora against DormWay, Shovel, StudyFetch, Mindgrasp, Taskade, Studley AI, and myHomework Student Planner.',
  alternates: { canonical: '/compare' },
};

export default function CompareIndexPage() {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.eyebrow}>Compare</span>
          <h1 className={styles.h1}>
            See exactly how Semora <span className={styles.gradient}>stacks up</span>
          </h1>
          <p className={styles.sub}>
            Fact-based, feature-by-feature comparisons — no invented ratings, no exaggerated
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
          subheading="Scan a syllabus and get your deadlines, grades, and schedule organized in one snap — free to start."
        />
      </section>
    </>
  );
}
