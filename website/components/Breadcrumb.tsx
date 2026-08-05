import Link from 'next/link';
import styles from './Breadcrumb.module.css';
import { JsonLd } from './JsonLd';
import { breadcrumbListSchema } from '@/lib/schema';
import type { SiteLocale } from '@/lib/i18n';

export interface Crumb {
  name: string;
  path: string;
}

/**
 * A breadcrumb trail and its BreadcrumbList markup, emitted together.
 *
 * They were previously written separately and had drifted in both directions:
 * the long-form pages rendered a visible trail with no markup, so Google had
 * nothing to substitute for the raw URL under the result title, while
 * /compare/[slug] emitted the markup with no visible trail — which Google's
 * structured-data guidelines treat as a mismatch, since the markup is meant to
 * describe navigation the page actually shows.
 *
 * Taking one `trail` and deriving both makes that class of drift impossible.
 * The final item is the current page: rendered as plain text (it is not a link
 * to itself) but still included in the markup, which is what the spec expects.
 */
export function Breadcrumb({ trail, locale = 'en' }: { trail: Crumb[]; locale?: SiteLocale }) {
  if (trail.length === 0) return null;
  const parents = trail.slice(0, -1);
  const current = trail[trail.length - 1];

  return (
    <>
      <JsonLd data={breadcrumbListSchema(trail)} />
      <nav className={styles.crumbs} aria-label={locale === 'es' ? 'Migas de pan' : 'Breadcrumb'}>
        {parents.map((crumb) => (
          <span key={crumb.path}>
            <Link href={crumb.path}>{crumb.name}</Link>
            <span aria-hidden="true"> /</span>
          </span>
        ))}
        <span className={styles.current} aria-current="page">
          {current.name}
        </span>
      </nav>
    </>
  );
}
