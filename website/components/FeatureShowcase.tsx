import Image from 'next/image';
import Link from 'next/link';
import styles from './FeatureShowcase.module.css';
import { Reveal } from '@/components/Reveal';
import type { SiteLocale } from '@/lib/i18n';

export interface ShowcaseItem {
  image: string;
  alt: string;
  tier: 'free' | 'pro';
  title: string;
  body: string;
  bullets: string[];
  href: string;
}

/**
 * The alternating screenshot showcase.
 *
 * Extracted from app/(en)/features/page.tsx, where it was inline, so that
 * /es/funciones can render the same layout instead of reimplementing it — the
 * Spanish features page previously had no screenshots at all while the English
 * one had five, which was the last remaining asymmetry between the two locales.
 *
 * Markup and styles are the English page's, moved verbatim; only the data and
 * the two chrome labels ("Free"/"Pro", "Learn more") vary by locale.
 */
export function FeatureShowcase({
  heading,
  sub,
  items,
  locale = 'en',
}: {
  heading: string;
  sub: string;
  items: ShowcaseItem[];
  locale?: SiteLocale;
}) {
  const es = locale === 'es';
  return (
    <section className={styles.showcase}>
      <div className={styles.showcaseHead}>
        <h2>{heading}</h2>
        <p>{sub}</p>
      </div>

      {items.map((item, i) => (
        <Reveal key={item.title} delay={i * 60}>
          <div className={`${styles.showcaseRow} ${i % 2 === 1 ? styles.reverse : ''}`}>
            <div className={styles.showcaseImage}>
              <Image src={item.image} alt={item.alt} width={260} height={562} />
            </div>
            <div className={styles.showcaseText}>
              <span
                className={`${styles.showcaseTier} ${item.tier === 'pro' ? styles.tierPro : styles.tierFree}`}
              >
                {item.tier === 'pro' ? 'Pro' : es ? 'Gratis' : 'Free'}
              </span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
              <ul>
                {item.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <Link href={item.href} className={styles.showcaseLink}>
                {es ? 'Ver más →' : 'Learn more →'}
              </Link>
            </div>
          </div>
        </Reveal>
      ))}
    </section>
  );
}
