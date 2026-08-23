import Link from 'next/link';
import styles from './FeatureHero.module.css';
import { FeaturePanel } from './FeaturePanel';
import { SignupButton } from './SignupButton';
import { downloadPath } from '@/lib/semora-facts';

/**
 * The top of a feature page: what it is, what it looks like, and a way in.
 *
 * Feature pages previously opened with a breadcrumb, a tier chip and then
 * several hundred words before offering any action — a visitor who arrived
 * from search had to read an essay to find out whether to try it. The prose is
 * still there (it earns the ranking that brings people here), it just no longer
 * stands between the visitor and the product.
 *
 * The reassurance line is tier-aware on purpose. Putting "free" under a Pro
 * feature would be a claim the pricing page contradicts.
 */
export function FeatureHero({
  slug,
  name,
  heading,
  lede,
  tier,
}: {
  slug: string;
  name: string;
  heading: string;
  lede: string;
  tier: 'free' | 'pro';
}) {
  return (
    <section className={styles.hero}>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <Link href="/features">Features</Link>
            <span aria-hidden="true">/</span>
            <span>{name}</span>
          </nav>

          <h1 className={styles.h1}>{heading}</h1>
          <p className={styles.lede}>{lede}</p>

          <div className={styles.actions}>
            <SignupButton className={styles.primary}>Get started free</SignupButton>
            <Link href={downloadPath()} className={styles.secondary}>
              Get the app
            </Link>
          </div>

          <p className={styles.note}>
            {tier === 'pro'
              ? 'Part of Semora Pro. Create a free account first — scanning, courses and grades are free to use.'
              : 'Free to use. No credit card.'}
          </p>
        </div>

        <div className={styles.visual}>
          <FeaturePanel slug={slug} />
        </div>
      </div>
    </section>
  );
}
