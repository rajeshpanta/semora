import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './ArticleShell.module.css';
import { TableOfContents } from './TableOfContents';
import { APP_URL } from '@/lib/semora-facts';

interface ArticleShellProps {
  children: ReactNode;
  ctaHeading: string;
  ctaSubheading: string;
  ctaLabel?: string;
  tocSelector?: string;
}

export function ArticleShell({
  children,
  ctaHeading,
  ctaSubheading,
  ctaLabel = 'Get started free',
  tocSelector,
}: ArticleShellProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.main}>{children}</div>
      <aside className={styles.rail}>
        <TableOfContents selector={tocSelector} />
        <div className={styles.railCta}>
          <p className={styles.railCtaHeading}>{ctaHeading}</p>
          <p className={styles.railCtaSub}>{ctaSubheading}</p>
          <Link href={APP_URL} className={styles.railCtaBtn}>
            {ctaLabel}
          </Link>
        </div>
      </aside>
    </div>
  );
}
