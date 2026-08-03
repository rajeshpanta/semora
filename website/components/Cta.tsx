import Link from 'next/link';
import styles from './Cta.module.css';
import { APP_URL } from '@/lib/semora-facts';

export function Cta({
  heading,
  subheading,
  label = 'Get started free',
}: {
  heading: string;
  subheading?: string;
  label?: string;
}) {
  return (
    <section className={styles.band}>
      <h2 className={styles.heading} data-toc-skip>
        {heading}
      </h2>
      {subheading && <p className={styles.subheading}>{subheading}</p>}
      <Link href={APP_URL} className={styles.button}>
        {label}
      </Link>
    </section>
  );
}
