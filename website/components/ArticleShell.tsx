import type { ReactNode } from 'react';
import { SignupButton } from './SignupButton';
import styles from './ArticleShell.module.css';
import { TableOfContents } from './TableOfContents';
import type { SiteLocale } from '@/lib/i18n';

interface ArticleShellProps {
  children: ReactNode;
  ctaHeading: string;
  ctaSubheading: string;
  ctaLabel?: string;
  tocSelector?: string;
  locale?: SiteLocale;
}

export function ArticleShell({
  children,
  ctaHeading,
  ctaSubheading,
  ctaLabel = 'Try it for free',
  tocSelector,
  locale = 'en',
}: ArticleShellProps) {
  return (
    <div className={styles.shell}>
      <div className={styles.main}>{children}</div>
      <aside className={styles.rail}>
        <TableOfContents selector={tocSelector} locale={locale} />
        <div className={styles.railCta}>
          <p className={styles.railCtaHeading}>{ctaHeading}</p>
          <p className={styles.railCtaSub}>{ctaSubheading}</p>
          <SignupButton className={styles.railCtaBtn}>
            {ctaLabel}
          </SignupButton>
        </div>
      </aside>
    </div>
  );
}
