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
export function Breadcrumb({
  trail,
  locale = 'en',
  align = 'start',
}: {
  trail: Crumb[];
  locale?: SiteLocale;
  /**
   * `center` for the hub pages whose hero is centered (/features, /compare and
   * their Spanish counterparts). A left-aligned trail above a centered eyebrow
   * reads as a stray line rather than part of the hero.
   */
  align?: 'start' | 'center';
}) {
  if (trail.length === 0) return null;
  const parents = trail.slice(0, -1);
  const current = trail[trail.length - 1];

  // "Home / Compare" on /compare tells a visitor nothing they cannot already
  // see: the wordmark goes home, and the second item is the page they are on.
  // A trail earns its place when it names a real parent — "Compare / Semora vs
  // Notion", "Blog / <post>" — so those still render.
  //
  // The JSON-LD goes with it rather than staying behind. Google treats
  // BreadcrumbList markup describing navigation the page does not show as a
  // mismatch, and keeping the two in step is the reason this component emits
  // both from one `trail` in the first place. What is lost is a rich result
  // reading "semoraai.com › Compare", which is barely more than the URL it
  // replaces.
  const parentIsHome =
    parents.length === 1 && (parents[0].path === '/' || parents[0].path === '/es');
  if (parentIsHome) return null;

  return (
    <>
      <JsonLd data={breadcrumbListSchema(trail)} />
      <nav
        className={align === 'center' ? `${styles.crumbs} ${styles.centered}` : styles.crumbs}
        aria-label={locale === 'es' ? 'Ruta de navegación' : 'Breadcrumb'}
      >
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
